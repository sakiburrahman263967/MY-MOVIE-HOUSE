// MovieBox provider — ported from MovieBox-TUI (Rust, MIT OR Apache-2.0)
// https://github.com/mesamirh/MovieBox-Tui
//
// SECURITY: request signing secret, visitor JWT, spoofed client headers, signed
// cookies and real CDN URLs live ONLY on this server. Responses returned to the
// frontend carry opaque proxy tokens (see stream-tokens.js) — never raw secrets.
// Logs are sanitized: no query strings, tokens, cookies or upstream media URLs.

import { createHash, createHmac, randomInt } from 'node:crypto';
import fetch from 'node-fetch';
import { issueStreamToken } from './stream-tokens.js';
import { createCache } from './cache.js';

const HOST_POOL = [
  'https://api6.aoneroom.com',
  'https://api5.aoneroom.com',
  'https://api4.aoneroom.com',
  'https://api4sg.aoneroom.com',
  'https://api3.aoneroom.com',
  'https://api6sg.aoneroom.com',
  'https://api.inmoviebox.com',
];

const RETRY_STATUS_CODES = new Set([403, 406, 407, 429, 500, 502, 503, 504]);

// Exact key material from MovieBox-TUI crypto.rs (30 bytes).
const SIGNATURE_SECRET = Buffer.from([
  0xef, 0xa8, 0x91, 0x97, 0x4e, 0xec, 0xd3, 0x14, 0x8d, 0xf6, 0x3a, 0xa6, 0x11, 0x60, 0x2d, 0xef,
  0xd1, 0x01, 0x25, 0x9b, 0xa5, 0x21, 0x02, 0x2c, 0x57, 0xae, 0x05, 0x66, 0xbd, 0x8e,
]);
const SIGNATURE_BODY_MAX_BYTES = 102400;
const STREAM_REFERER = 'https://sportslive.wine';
const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_DEADLINE_MS = 15000;

const searchCache = createCache(15 * 60 * 1000, 100);
const detailsCache = createCache(10 * 60 * 1000, 50);

let activeHostIdx = 0;
/** @type {{token: string, userId?: string, expiresAt?: number, createdAt: number} | null} */
let session = null;
let loginPromise = null;
let spoofedIp = randomSpoofedIp();
const { userAgent, clientInfo } = generateClientInfoAndUa();

class ProviderHttpError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const md5Hex = (input) => createHash('md5').update(input).digest('hex');

/** Strip query strings before any logging (never log signatures/ids). */
function shortUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '[redacted-url]';
  }
}

function pick(list) {
  return list[randomInt(list.length)];
}

function randomHex(len) {
  let out = '';
  for (let i = 0; i < len; i += 1) out += randomInt(16).toString(16);
  return out;
}

function randomUuid() {
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
}

function randomSpoofedIp() {
  if (process.env.MB_SPOOF_IP) {
    // Optional override for diagnosing region behavior ('off' = omit header).
    return process.env.MB_SPOOF_IP;
  }
  const prefixes = ['103.241', '49.36', '117.195', '106.198', '122.162', '157.32', '182.70', '103.58', '27.60', '59.90'];
  return `${pick(prefixes)}.${randomInt(1, 254)}.${randomInt(1, 254)}`;
}

function generateClientInfoAndUa() {
  const androidVersions = [
    ['9', 'PQ3A.190605.03081104'],
    ['10', 'QP1A.191005.007.A3'],
    ['11', 'RP1A.200720.011'],
    ['12', 'S1B.220414.015'],
    ['13', 'TQ2A.230405.003'],
  ];
  const redmiDevices = [
    ['23078RKD5C', 'Redmi'],
    ['2201117TY', 'Redmi'],
    ['2201117TG', 'Redmi'],
    ['22101316G', 'Redmi'],
    ['21121210G', 'Redmi'],
    ['M2012K11AG', 'Redmi'],
    ['M2007J20CG', 'Redmi'],
  ];
  const versionCodes = [50020117, 50020118, 50020119, 50020120, 50020121];
  const networkTypes = ['NETWORK_WIFI', 'NETWORK_MOBILE'];
  const timezones = ['Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'Europe/London'];

  const android = pick(androidVersions);
  const device = pick(redmiDevices);
  const versionCode = pick(versionCodes);
  const network = pick(networkTypes);
  const timezone = pick(timezones);

  const ua = `com.community.oneroom/${versionCode} (Linux; U; Android ${android[0]}; ${device[0]}; Build/${android[1]}; Cronet/135.0.7012.3)`;
  const info = JSON.stringify({
    package_name: 'com.community.oneroom',
    version_name: '4.0.01.0813.03',
    version_code: versionCode,
    os: 'android',
    os_version: android[0],
    install_ch: 'ps',
    device_id: randomHex(32),
    install_store: 'ps',
    gaid: randomUuid(),
    brand: device[1],
    model: device[0],
    system_language: 'en',
    net: network,
    region: 'US',
    timezone,
    sp_code: '40401',
    'X-Play-Mode': '2',
  });

  return { userAgent: ua, clientInfo: info };
}

// ---------------------------------------------------------------------------
// signing (faithful port of MovieBox-TUI crypto.rs)
// ---------------------------------------------------------------------------

function sortedQueryString(rawUrl) {
  let params;
  try {
    params = new URL(rawUrl).searchParams;
  } catch {
    return '';
  }
  const grouped = new Map();
  for (const [key, value] of params) {
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(value);
  }
  if (grouped.size === 0) return '';
  const parts = [];
  for (const key of [...grouped.keys()].sort()) {
    for (const value of grouped.get(key)) parts.push(`${key}=${value}`);
  }
  return parts.join('&');
}

function buildCanonicalString(method, accept, contentType, rawUrl, body, tsMs) {
  let canonicalUrl = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    const query = sortedQueryString(rawUrl);
    canonicalUrl = query ? `${parsed.pathname}?${query}` : parsed.pathname;
  } catch {}

  let bodyHash = '';
  let bodyLength = '';
  if (body !== null && body !== undefined) {
    const bytes = Buffer.from(String(body), 'utf8');
    bodyLength = String(bytes.length);
    const truncated = bytes.length > SIGNATURE_BODY_MAX_BYTES ? bytes.subarray(0, SIGNATURE_BODY_MAX_BYTES) : bytes;
    bodyHash = md5Hex(truncated);
  }

  return [
    method.toUpperCase(),
    accept || '',
    contentType || '',
    bodyLength,
    String(tsMs),
    bodyHash,
    canonicalUrl,
  ].join('\n');
}

function generateXClientToken(ts) {
  const tsStr = String(ts);
  const reversed = [...tsStr].reverse().join('');
  return `${tsStr},${md5Hex(reversed)}`;
}

function generateXTrSignature(method, accept, contentType, rawUrl, body, ts) {
  const canonical = buildCanonicalString(method, accept, contentType, rawUrl, body, ts);
  const signature = createHmac('md5', SIGNATURE_SECRET).update(canonical).digest('base64');
  return `${ts}|2|${signature}`;
}

function buildSignedHeaders(method, url, body, authToken) {
  const ts = Date.now();
  const accept = 'application/json';
  const contentType = 'application/json';
  const headers = {
    'User-Agent': userAgent,
    'Accept': accept,
    'Content-Type': contentType,
    'Connection': 'keep-alive',
    'x-client-token': generateXClientToken(ts),
    'x-tr-signature': generateXTrSignature(method, accept, contentType, url, body, ts),
    'x-client-info': clientInfo,
    'x-client-status': '0',
  };
  if (spoofedIp && spoofedIp !== 'off') headers['x-forwarded-for'] = spoofedIp;
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return headers;
}

// ---------------------------------------------------------------------------
// visitor session (in-memory only — never persisted to disk/logs)
// ---------------------------------------------------------------------------

function parseJwtClaims(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return {};
  let payload = null;
  for (const decoder of ['base64url', 'base64']) {
    try {
      payload = JSON.parse(Buffer.from(parts[1], decoder).toString('utf8'));
      break;
    } catch {}
  }
  if (!payload || typeof payload !== 'object') return {};

  const uidRaw = payload.userId ?? payload.uid ?? payload.sub;
  const expRaw = payload.exp;
  const exp = Number.isFinite(Number(expRaw)) && Number(expRaw) > 0 ? Math.floor(Number(expRaw)) : undefined;
  return {
    userId: uidRaw !== undefined && uidRaw !== null ? String(uidRaw) : undefined,
    expiresAt: exp,
  };
}

function sessionIsValid() {
  if (!session?.token?.trim()) return false;
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt) return now + 60 < session.expiresAt;
  return now < session.createdAt + 7 * 24 * 3600;
}

async function ensureSession() {
  if (sessionIsValid()) return session.token;
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    try {
      const payload = await requestHosts('POST', '/wefeed-mobile-bff/user-api/visitor-login', '{}', null, {});
      const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
      if (!token) throw new ProviderHttpError('visitor-login returned no token', 'missing-token');
      const claims = parseJwtClaims(token);
      const explicitUid = payload.uid ?? payload.userId;
      session = {
        token,
        userId: explicitUid !== undefined && explicitUid !== null ? String(explicitUid) : claims.userId,
        expiresAt: claims.expiresAt,
        createdAt: Math.floor(Date.now() / 1000),
      };
      return token;
    } finally {
      loginPromise = null;
    }
  })();

  return loginPromise;
}

function invalidateSession() {
  session = null;
}

// ---------------------------------------------------------------------------
// host-pool request loop (port of client.rs request_hosts)
// ---------------------------------------------------------------------------

function absorbXUser(headers) {
  const raw = headers.get?.('x-user');
  if (!raw) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const token = typeof parsed?.token === 'string' ? parsed.token : '';
  if (!token) return;
  const claims = parseJwtClaims(token);
  const uid = parsed.uid ?? parsed.userId;
  session = {
    token,
    userId: uid !== undefined && uid !== null ? String(uid) : claims.userId,
    expiresAt: claims.expiresAt,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

async function requestHosts(method, pathAndQuery, body, authToken, { deadline } = {}) {
  const until = deadline || Date.now() + DEFAULT_DEADLINE_MS;
  let backoffMs = 50;

  for (let i = 0; i < HOST_POOL.length; i += 1) {
    if (Date.now() > until) throw new ProviderHttpError('deadline exceeded', 'deadline');
    if (i > 0) {
      await sleep(backoffMs);
      backoffMs = 50;
    }

    const idx = (activeHostIdx + i) % HOST_POOL.length;
    const url = `${HOST_POOL[idx]}${pathAndQuery}`;
    const headers = buildSignedHeaders(method, url, body, authToken);

    const controller = new AbortController();
    const remaining = Math.max(1000, Math.min(REQUEST_TIMEOUT_MS, until - Date.now()));
    const timer = setTimeout(() => controller.abort(), remaining);

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body ?? undefined,
        signal: controller.signal,
      });
    } catch {
      // Network/timeout: rotate hosts like the Rust client does.
      activeHostIdx = (idx + 1) % HOST_POOL.length;
      continue;
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    absorbXUser(response.headers);

    if (RETRY_STATUS_CODES.has(status)) {
      activeHostIdx = (idx + 1) % HOST_POOL.length;
      if (status === 429) {
        const retryAfter = Number.parseInt(response.headers.get('retry-after'), 10);
        backoffMs = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 3000) : 400;
      }
      continue;
    }

    // Invalid token: refresh once instead of burning the remaining hosts.
    if (status === 401 && authToken) {
      throw new ProviderHttpError('session rejected', 'auth');
    }

    if (!status || status < 200 || status >= 300) {
      activeHostIdx = idx;
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      activeHostIdx = (idx + 1) % HOST_POOL.length;
      continue;
    }

    activeHostIdx = idx;
    return payload && typeof payload === 'object' && payload.data !== undefined && payload.data !== null
      ? payload.data
      : payload;
  }

  throw new ProviderHttpError('all MovieBox hosts exhausted', 'hosts-exhausted');
}

async function request(method, pathAndQuery, body, opts = {}) {
  let token = await ensureSession();
  try {
    return await requestHosts(method, pathAndQuery, body, token, opts);
  } catch (error) {
    if (error?.code === 'auth' || error?.code === 'hosts-exhausted') {
      invalidateSession();
      token = await ensureSession();
      return requestHosts(method, pathAndQuery, body, token, opts);
    }
    if (error?.code === 'deadline') throw error;
    throw new ProviderHttpError(shortUrl(pathAndQuery) + ' failed: ' + error?.message, 'network');
  }
}

// ---------------------------------------------------------------------------
// API surface (port of mod.rs endpoint builders)
// ---------------------------------------------------------------------------

export async function movieBoxSearch(query, { deadline } = {}) {
  const keyword = String(query || '').trim();
  if (!keyword) return [];
  const cacheKey = keyword.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const body = JSON.stringify({ keyword, page: 1, perPage: 15, subjectType: 0 });
  const payload = await request('POST', '/wefeed-mobile-bff/subject-api/search/v2', body, { deadline });
  const items = searchToItems(payload);
  searchCache.set(cacheKey, items);
  return items;
}

export async function movieBoxGetDetails(subjectId, { deadline, fresh = false } = {}) {
  const id = String(subjectId || '').trim();
  if (!id) return null;
  const cacheKey = `details:${id}`;
  if (!fresh) {
    const cached = detailsCache.get(cacheKey);
    if (cached) return cached;
  }

  const details = await request('GET', `/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(id)}`, null, { deadline });

  const stype = Number(details?.subjectType ?? details?.stype ?? 1);
  let withSeasons = details;
  if (stype === 2) {
    try {
      const seasonInfo = await request('GET', `/wefeed-mobile-bff/subject-api/season-info?subjectId=${encodeURIComponent(id)}`, null, { deadline });
      if (seasonInfo && typeof seasonInfo === 'object') withSeasons = { ...details, seasons: seasonInfo };
    } catch {}
  }

  detailsCache.set(cacheKey, withSeasons);
  return withSeasons;
}

export async function movieBoxGetPlayInfo(subjectId, season, episode, { deadline } = {}) {
  const id = encodeURIComponent(String(subjectId).trim());
  const path = season > 0 || episode > 0
    ? `/wefeed-mobile-bff/subject-api/play-info/v2?subjectId=${id}&se=${season}&ep=${episode}`
    : `/wefeed-mobile-bff/subject-api/play-info/v2?subjectId=${id}`;
  return request('GET', path, null, { deadline });
}

export async function movieBoxGetResources(subjectId, season, episode, page, perPage, { deadline } = {}) {
  const id = encodeURIComponent(String(subjectId).trim());
  const seEp = season > 0 || episode > 0 ? `&se=${season}&ep=${episode}` : '';
  const path = `/wefeed-mobile-bff/subject-api/resource?subjectId=${id}${seEp}&page=${page}&perPage=${perPage}`;
  return request('GET', path, null, { deadline });
}

async function movieBoxGetCaptions(subjectId, resourceId, { deadline } = {}) {
  const sid = encodeURIComponent(String(subjectId).trim());
  const rid = encodeURIComponent(String(resourceId).trim());
  return request('GET', `/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=${sid}&resourceId=${rid}`, null, { deadline });
}

// ---------------------------------------------------------------------------
// adapters (ports of adapt.rs / title.rs)
// ---------------------------------------------------------------------------

function extractYear(value) {
  const match = String(value ?? '').match(/\b(19\d{2}|20\d{2})\b/);
  return match ? match[0] : null;
}

function toStringId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value) return value;
  return null;
}

/** Rust `as_u64().or_else(|| parse::<usize>())` for se/ep fields. */
function toInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Epoch seconds from a detector link's `?t=<expiry>` query (PR #219). */
function parseLinkExpiry(rawUrl) {
  try {
    const raw = new URL(rawUrl).searchParams.get('t');
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function toSizeBytes(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

export function cleanMovieBoxTitle(rawTitle) {
  let title = String(rawTitle ?? '').trim();
  if (!title) return '';

  while (title.startsWith('[')) {
    const close = title.indexOf(']');
    if (close === -1) break;
    const remainder = title.slice(close + 1).trim();
    if (!remainder) break;
    title = remainder;
  }

  const open = title.indexOf('[');
  if (open > 0) title = title.slice(0, open).trim();

  const paren = title.indexOf('(');
  if (paren > 0) {
    const inside = title.slice(paren + 1);
    const insideContent = (inside.split(')')[0] || '').trim();
    const isYear = /^(19|20)\d{2}$/.test(insideContent);
    if (!isYear) title = title.slice(0, paren).trim();
  }

  const dashIdx = title.lastIndexOf(' - ');
  if (dashIdx !== -1) {
    const suffix = title.slice(dashIdx + 3);
    const isTag = /(hindi|tamil|telugu|kannada|malayalam|bengali|marathi|punjabi|gujarati|urdu|english|spanish|french|german|italian|japanese|korean|chinese|russian|portuguese|turkish|arabic|dub|audio|multi|season)/i.test(suffix)
      || /^[sS]-?[\d\s-]+$/.test(suffix);
    if (isTag) title = title.slice(0, dashIdx).trim();
  }

  const seasonSuffix = title.match(/\sS(\d+)$/i);
  if (seasonSuffix) title = title.slice(0, seasonSuffix.index).trim();

  const lowerSeason = title.toLowerCase().lastIndexOf(' season ');
  if (lowerSeason !== -1) title = title.slice(0, lowerSeason).trim();

  for (const sep of ['_', ' ', '.', '-']) {
    const idx = title.lastIndexOf(sep);
    if (idx === -1) continue;
    const suffix = title.slice(idx + 1);
    const resMatch = suffix.match(/^(\d{2,5})[pP]$/);
    if (resMatch) {
      const res = Number(resMatch[1]);
      if (res >= 144 && res <= 8640) title = title.slice(0, idx).trim();
    }
  }

  const cleaned = title.replace(/[-:_\s]+$/, '').trim();
  return cleaned || String(rawTitle ?? '').trim();
}

export function searchToItems(payload) {
  const subjects = payload?.data?.results?.[0]?.subjects
    || payload?.results?.[0]?.subjects
    || payload?.data?.list
    || payload?.list
    || [];
  if (!Array.isArray(subjects)) return [];

  const items = [];
  for (const subject of subjects) {
    if (!subject || typeof subject !== 'object') continue;
    const idRaw = toStringId(subject.subjectId ?? subject.id);
    if (!idRaw) continue;
    const title = subject.title || subject.name || 'Unknown';
    const stype = Number(subject.subjectType ?? subject.stype ?? 1);
    const poster = subject.cover?.url || subject.coverUrl || subject.poster || subject.pic || null;
    const year = extractYear(subject.releaseDate ?? subject.year ?? subject.releaseInfo);
    items.push({
      id: `mb:${idRaw}`,
      type: stype === 2 ? 'series' : 'movie',
      name: title,
      title,
      poster,
      releaseInfo: year || undefined,
    });
  }
  return items;
}

export function detailsToMeta(payload, subjectId) {
  const subject = payload?.data?.subject || payload?.subject || payload;
  if (!subject || typeof subject !== 'object') return null;
  const idRaw = toStringId(subject.subjectId ?? subject.id) || String(subjectId || '');
  if (!idRaw) return null;

  const stype = Number(subject.subjectType ?? subject.stype ?? 1);
  const type = stype === 2 ? 'series' : 'movie';
  const title = subject.title || 'Unknown';
  const year = extractYear(subject.releaseDate ?? subject.year);
  const poster = subject.cover?.url || subject.coverUrl || null;

  let runtime = null;
  const duration = subject.duration;
  if (typeof duration === 'number' && duration > 0) runtime = `${Math.round(duration / 60)} min`;
  else if (typeof duration === 'string' && duration && duration !== '0' && duration !== '0m') runtime = duration;

  const ratingRaw = subject.imdbRatingValue ?? subject.rating ?? null;
  let imdbRating = null;
  if (typeof ratingRaw === 'number' && Number.isFinite(ratingRaw)) imdbRating = ratingRaw.toFixed(1);
  else if (typeof ratingRaw === 'string' && ratingRaw.trim()) imdbRating = ratingRaw.trim();

  const genreRaw = subject.genre ?? subject.genres ?? [];
  const genres = Array.isArray(genreRaw) ? genreRaw.filter((g) => typeof g === 'string' && g.trim()) : [];

  const starsRaw = typeof subject.stars === 'string' ? subject.stars : '';
  const cast = starsRaw.split(',').map((name) => name.trim()).filter(Boolean).map((name) => ({ name }));

  const directorRaw = typeof subject.director === 'string' ? subject.director : '';
  const director = directorRaw.split(',').map((name) => name.trim()).filter(Boolean);

  const seasonsRaw = payload?.seasons ?? subject.seasons;
  const seasonsArr = Array.isArray(seasonsRaw)
    ? seasonsRaw
    : (Array.isArray(seasonsRaw?.seasons) ? seasonsRaw.seasons : []);

  const seasons = [];
  const videos = [];
  let totalEpisodes = 0;
  for (const season of seasonsArr) {
    if (!season || typeof season !== 'object') continue;
    const seNum = Number(season.se ?? 1) || 1;
    const episodeNumbers = [];
    if (Array.isArray(season.episodeNumbers)) {
      for (const ep of season.episodeNumbers) {
        const epNum = Number(ep);
        if (Number.isFinite(epNum) && epNum > 0) episodeNumbers.push(epNum);
      }
    } else if (Number(season.maxEp) > 0) {
      for (let epNum = 1; epNum <= Number(season.maxEp); epNum += 1) episodeNumbers.push(epNum);
    }
    for (const epNum of episodeNumbers) {
      videos.push({ id: `mb:${idRaw}:${seNum}:${epNum}`, season: seNum, number: epNum, title: undefined, thumbnail: null });
    }
    totalEpisodes += episodeNumbers.length;
    seasons.push({
      seasonNumber: seNum,
      name: `Season ${seNum}`,
      episodeCount: episodeNumbers.length,
      poster: null,
      airDate: '',
    });
  }

  return {
    id: `mb:${idRaw}`,
    name: title,
    type,
    poster,
    background: null,
    description: subject.description || subject.intro || '',
    year: year || '',
    releaseInfo: year || '',
    runtime,
    imdbRating,
    genres,
    cast,
    director,
    seasons,
    totalSeasons: seasons.length,
    totalEpisodes,
    videos: type === 'series' ? videos : [],
    provider: 'moviebox',
  };
}

function classifyMediaUrl(rawUrl) {
  const url = String(rawUrl || '');
  if (!/^https?:\/\//i.test(url)) return null;
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.m3u8')) return 'm3u8';
  if (clean.endsWith('.mp4')) return 'mp4';
  if (clean.endsWith('.mpd')) return 'mpd';
  if (url.toLowerCase().includes('/dash/')) return 'mpd';
  if (/\.(mkv|webm|mov|m4v|avi)(\?|$)/i.test(clean)) return 'file';
  return null;
}

function fileExtensionFor(kind, rawUrl) {
  if (kind === 'm3u8') return 'm3u8';
  if (kind === 'mpd') return 'mpd';
  const clean = String(rawUrl || '').split('?')[0].toLowerCase();
  const match = clean.match(/\.(mp4|mkv|webm|mov|m4v|avi)$/);
  return match ? match[1] : 'mp4';
}

function isDeprecationNoticeUrl(rawUrl) {
  const lower = String(rawUrl || '').toLowerCase();
  return lower.includes('1c7de0bd3393702d9191801f15f88f8d')
    || lower.includes('9a0461bc39da389663bf3dbb17091d3f')
    || lower.includes('b164fbfb4347792950bdfbfb563d39d9')
    || lower.includes('/notice.mp4')
    || (lower.includes('macdn.aoneroom.com') && lower.includes('/other/'));
}

function toDashMpd(rawUrl) {
  const base = String(rawUrl || '').trim().replace(/\*+$/, '').replace(/\/+$/, '');
  if (/^https?:\/\//i.test(base) && base.includes('/dash/')) return `${base}/index.mpd`;
  return null;
}

function decodeBase64Padded(input) {
  let value = String(input || '');
  const padding = (4 - (value.length % 4)) % 4;
  if (padding > 0) value += '='.repeat(padding);
  try {
    return Buffer.from(value, 'base64');
  } catch {
    return null;
  }
}

/** Port of adapt.rs resolve_dash_manifest_from_policy. */
function resolveDashManifestFromPolicy(signCookie) {
  for (const part of String(signCookie || '').split(';')) {
    const trimmed = part.trim();
    const idx = trimmed.indexOf('urlprefix=');
    if (idx !== -1) {
      const prefixPart = trimmed.slice(idx + 'urlprefix='.length);
      const b64Token = (prefixPart.split(':')[0] || prefixPart).trim();
      const normalized = b64Token.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = decodeBase64Padded(normalized);
      if (decoded) {
        const urlStr = decoded.toString('utf8');
        const mpd = toDashMpd(urlStr);
        if (mpd) return mpd;
      }
    }
    if (trimmed.startsWith('CloudFront-Policy=')) {
      const policyClean = trimmed.slice('CloudFront-Policy='.length).trim();
      const normalized = policyClean.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/');
      const decoded = decodeBase64Padded(normalized);
      if (!decoded) continue;
      let json;
      try {
        json = JSON.parse(decoded.toString('utf8'));
      } catch {
        continue;
      }
      const resource = json?.Statement?.[0]?.Resource;
      if (typeof resource === 'string') {
        const mpd = toDashMpd(resource);
        if (mpd) return mpd;
      }
    }
  }
  return null;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

function buildStreamHeaders(signCookie) {
  const headers = {
    'Referer': STREAM_REFERER,
    'User-Agent': userAgent,
  };
  if (signCookie && signCookie.trim()) {
    const cleanCookie = signCookie
      .replace(/;+$/, '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .join('; ');
    if (cleanCookie) headers['Cookie'] = cleanCookie;
  }
  return headers;
}

/**
 * Proxy an upstream media URL through the backend with an opaque token.
 * `meta` (subjectId/resourceId/linkExpiresAt) is stored server-side only and
 * lets the proxy refresh time-limited MovieBox detector links before expiry.
 */
function proxiedStreamUrl(targetUrl, headers, kind, meta = null) {
  const token = issueStreamToken(targetUrl, headers, meta);
  const ext = fileExtensionFor(kind, targetUrl);
  return `/api/proxy/stream.${ext}?url=${encodeURIComponent(token)}`;
}

function playInfoToCandidates(payload, context) {
  const data = payload?.data ?? payload;
  if (!data || typeof data !== 'object') return [];

  const streams = Array.isArray(data.streams) ? data.streams : [];
  if (streams.length === 0) return [];

  const rawTitlePrefix = typeof data.title === 'string' && data.title ? data.title : (context.title || 'MovieBox Stream');
  const titlePrefix = cleanMovieBoxTitle(rawTitlePrefix) || 'MovieBox Stream';
  const displayResolutions = typeof data.displayResolutions === 'string' ? data.displayResolutions : '';

  const candidates = [];
  for (const stream of streams) {
    if (!stream || typeof stream !== 'object') continue;

    const format = typeof stream.format === 'string' && stream.format ? stream.format : 'MP4';
    const codec = stream.codecName || stream.codec || format;
    const sizeBytes = toSizeBytes(stream.size);
    const signCookie = typeof stream.signCookie === 'string' ? stream.signCookie : '';
    const streamUrl = typeof stream.url === 'string' ? stream.url : '';

    const resolutionsRaw = (typeof stream.resolutions === 'string' && stream.resolutions) || displayResolutions || '1080,720,480';
    let resolutions = resolutionsRaw
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);
    resolutions = [...new Set(resolutions)].sort((a, b) => b - a);
    if (resolutions.length === 0) resolutions = [1080];

    const directKind = classifyMediaUrl(streamUrl);
    const directPlayable = directKind && !isDeprecationNoticeUrl(streamUrl);
    const dashManifest = resolveDashManifestFromPolicy(signCookie);
    const headers = buildStreamHeaders(signCookie);

    // Our player handles progressive MP4/HLS natively; DASH (.mpd) has no
    // player support, so it is only kept as a last resort.
    const urls = [];
    if (directPlayable) urls.push({ url: streamUrl, kind: directKind });
    if (dashManifest) urls.push({ url: dashManifest, kind: 'mpd' });
    if (urls.length === 0) continue;

    const preferred = urls.find((entry) => entry.kind !== 'mpd') || null;
    const fallbackDash = urls.find((entry) => entry.kind === 'mpd') || null;

    const highestRes = resolutions[0] || 1080;
    for (const res of resolutions) {
      const quality = `${res}p`;
      const scaledSize = (sizeBytes && res < highestRes)
        ? Math.max(1, Math.round(sizeBytes * Math.pow(res / highestRes, 1.6)))
        : sizeBytes;
      const label = context.season > 0 && context.episode > 0
        ? `${titlePrefix} S${String(context.season).padStart(2, '0')}E${String(context.episode).padStart(2, '0')} ${quality} ${codec}`
        : `${titlePrefix} ${quality} ${codec}`;

      if (preferred) {
        candidates.push({
          url: proxiedStreamUrl(preferred.url, headers, preferred.kind),
          name: label,
          quality,
          size: formatBytes(scaledSize),
          codec,
          kind: preferred.kind,
          progressive: true,
          resourceId: stream.id !== undefined && stream.id !== null ? String(stream.id) : null,
        });
      } else if (fallbackDash) {
        candidates.push({
          url: proxiedStreamUrl(fallbackDash.url, headers, 'mpd'),
          name: label,
          quality,
          size: formatBytes(scaledSize),
          codec,
          kind: 'mpd',
          progressive: false,
          resourceId: stream.id !== undefined && stream.id !== null ? String(stream.id) : null,
        });
      }
    }
  }
  return candidates;
}

function resourceToCandidates(payload) {
  const items = Array.isArray(payload?.list)
    ? payload.list
    : (Array.isArray(payload) ? payload : []);

  const candidates = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const link = item.resourceLink || item.url;
    if (typeof link !== 'string' || !link.trim() || isDeprecationNoticeUrl(link)) continue;

    // Only direct media files are usable here (unknown resolver pages are skipped).
    const kind = classifyMediaUrl(link);
    if (!kind || kind === 'mpd') continue;

    const resolutionRaw = item.resolution;
    const quality = typeof resolutionRaw === 'number'
      ? `${resolutionRaw}p`
      : (typeof resolutionRaw === 'string' && resolutionRaw.trim() ? resolutionRaw.trim() : null);
    const sizeBytes = toSizeBytes(item.size);
    const filename = item.fileName || item.title || null;

    candidates.push({
      url: proxiedStreamUrl(link, {}, kind),
      name: filename || `MovieBox ${quality || ''}`.trim(),
      quality: quality || /\b(2160p|1080p|720p|480p)\b/i.exec(filename || '')?.[1] || null,
      size: formatBytes(sizeBytes),
      codec: item.codecName || item.codec || null,
      kind,
      progressive: true,
      resourceId: toStringId(item.resourceId ?? item.id),
    });
  }
  return candidates;
}

/**
 * Port of adapt.rs moviebox_detector_json_to_releases (MovieBox-TUI PR #219).
 *
 * Since ~2026-10-13 the play-info/resource endpoints answer with the site
 * trailer (identical 824KB MP4 for every title), while the subject-details
 * payload still carries the real media in `resourceDetectors[].resolutionList[]`
 * — signed `*.hakunaymatata.com` links (`?sign=&t=`, time limited) with real
 * size/duration/codec per resolution.
 *
 * The CDN expects the MovieBox app User-Agent and 429s when a Referer is sent,
 * so every mirror carries the UA only (no Referer/Cookie).
 */
function detectorToCandidates(payload, context) {
  const data = payload?.data ?? payload;
  const detectors = Array.isArray(data?.resourceDetectors) ? data.resourceDetectors : [];
  if (detectors.length === 0) return [];

  const candidates = [];
  for (const detector of detectors) {
    if (!detector || typeof detector !== 'object') continue;
    const detectorCodec = typeof detector.codecName === 'string' && detector.codecName.trim()
      ? detector.codecName.trim()
      : null;
    const detectorUploader = typeof detector.uploadBy === 'string' && detector.uploadBy.trim()
      ? detector.uploadBy.trim()
      : 'Direct';

    const entries = Array.isArray(detector.resolutionList) ? detector.resolutionList : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;

      // A request for a specific episode must not pick up another episode's
      // links; movie subjects report se=0/ep=0. Missing se/ep always match.
      const entrySe = toInt(entry.se);
      const entryEp = toInt(entry.ep);
      if (context.season > 0 || context.episode > 0) {
        const matches = (entrySe === null || entrySe === context.season)
          && (entryEp === null || entryEp === context.episode);
        if (!matches) continue;
      }

      const linkRaw = (typeof entry.resourceLink === 'string' && entry.resourceLink.trim())
        || (typeof entry.url === 'string' ? entry.url.trim() : '');
      if (!linkRaw || isDeprecationNoticeUrl(linkRaw)) continue;

      let quality = null;
      if (typeof entry.resolution === 'number' && Number.isFinite(entry.resolution)) {
        quality = `${Math.trunc(entry.resolution)}p`;
      } else if (typeof entry.resolution === 'string' && entry.resolution.trim()) {
        quality = entry.resolution.trim();
      }

      const codec = (typeof entry.codecName === 'string' && entry.codecName.trim()) || detectorCodec;
      const sizeBytes = toSizeBytes(entry.size);
      const title = typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : null;
      const uploader = (typeof entry.uploadBy === 'string' && entry.uploadBy.trim()) || detectorUploader;
      const resourceId = toStringId(entry.resourceId ?? entry.id);
      const filename = title || (quality ? `${uploader} ${quality}` : uploader);

      // Direct CDN file; classifyMediaUrl only picks the proxy extension.
      const kind = classifyMediaUrl(linkRaw) || 'mp4';

      candidates.push({
        url: proxiedStreamUrl(
          linkRaw,
          { 'User-Agent': userAgent },
          kind,
          resourceId
            ? {
                subjectId: context.subjectId,
                resourceId,
                linkExpiresAt: parseLinkExpiry(linkRaw),
              }
            : null,
        ),
        name: filename,
        quality,
        size: formatBytes(sizeBytes),
        sizeBytes,
        codec,
        kind,
        progressive: true,
        resourceId,
      });
    }
  }

  // Highest resolution first, then biggest file.
  const resolutionRank = (value) => {
    const match = String(value || '').match(/(\d{3,4})/);
    return match ? Number(match[1]) : 0;
  };
  candidates.sort((a, b) => (
    (resolutionRank(b.quality) - resolutionRank(a.quality))
    || ((b.sizeBytes || 0) - (a.sizeBytes || 0))
  ));
  return candidates;
}

function pickBestSubject(subjects, wantedType) {
  if (!Array.isArray(subjects) || subjects.length === 0) return null;
  const typed = wantedType
    ? subjects.filter((item) => item.type === wantedType)
    : subjects;
  return typed[0] || subjects[0] || null;
}

/** Resolve a MovieBox subject for a title (used for tmdb/imdb based playback). */
export async function resolveMovieBoxSubject(title, year, type, { deadline } = {}) {
  const items = await movieBoxSearch(title, { deadline });
  if (items.length === 0) return null;
  const wantedType = type === 'series' || type === 'tv' ? 'series' : 'movie';
  const normalized = String(title || '').trim().toLowerCase();
  const exact = items.filter((item) => (item.name || '').trim().toLowerCase() === normalized);
  const sameType = (exact.length > 0 ? exact : items).filter((item) => item.type === wantedType);
  let subject = pickBestSubject(sameType, wantedType);
  if (subject && year) {
    const match = sameType.find((item) => item.releaseInfo === String(year));
    if (match) subject = match;
  }
  return subject || null;
}

export async function getMovieBoxStreams({ subjectId, season = 0, episode = 0, title, deadline } = {}) {
  const opts = { deadline };
  const context = {
    subjectId: String(subjectId || '').trim(),
    season: season > 0 ? season : 0,
    episode: episode > 0 ? episode : 0,
    title: title || 'MovieBox Stream',
  };

  // 1. Detector links from subject details (MovieBox-TUI PR #219): play-info
  //    and resource only answer with the site trailer nowadays, while details
  //    resourceDetectors[].resolutionList[] still carries signed CDN links.
  //    Series usually have an empty resolutionList (index-site detectors) and
  //    fall through — other providers cover series.
  try {
    const details = await movieBoxGetDetails(context.subjectId, opts);
    const detectorCandidates = detectorToCandidates(details, context);

    // Fetch all audio dubs (Hindi dub, Tamil dub, Telugu dub, etc.) available in MovieBox!
    if (Array.isArray(details?.dubs) && details.dubs.length > 0) {
      const otherDubs = details.dubs.filter((dub) => dub.subjectId && String(dub.subjectId) !== String(context.subjectId));
      const dubPromises = otherDubs.slice(0, 8).map(async (dub) => {
        try {
          const dubDetails = await movieBoxGetDetails(dub.subjectId, opts);
          const dubCandidates = detectorToCandidates(dubDetails, { ...context, subjectId: dub.subjectId });
          const langLabel = dub.lanName || dub.lanCode || 'Dub';
          return dubCandidates.map((c) => ({
            ...c,
            name: `${c.name} [${langLabel}]`,
            title: `${c.name} [${langLabel}]`,
            audioLang: langLabel,
          }));
        } catch {
          return [];
        }
      });
      const dubSettled = await Promise.allSettled(dubPromises);
      for (const res of dubSettled) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          detectorCandidates.push(...res.value);
        }
      }
    }

    if (detectorCandidates.length > 0) return finalizeCandidates(detectorCandidates);
  } catch {}

  // 2. Legacy fallback: play-info + resource (kept for when upstream restores
  //    signed manifests; both are trailer-filtered, so this yields [] today).
  const [playInfoResult, resourcesResult] = await Promise.allSettled([
    movieBoxGetPlayInfo(subjectId, context.season, context.episode, opts),
    movieBoxGetResources(subjectId, context.season, context.episode, 1, 20, opts),
  ]);

  const candidates = [];
  if (playInfoResult.status === 'fulfilled') {
    candidates.push(...playInfoToCandidates(playInfoResult.value, context));
  }
  if (resourcesResult.status === 'fulfilled') {
    candidates.push(...resourceToCandidates(resourcesResult.value));
  }

  return finalizeCandidates(candidates);
}

/** Dedupe, keep progressive sources ahead of DASH, then cap the list. */
function finalizeCandidates(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    if (!candidate?.url) continue;
    const key = `${candidate.name}|${candidate.quality || ''}|${candidate.progressive ? 'p' : 'd'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  const progressive = unique.filter((entry) => entry.progressive);
  const dashOnly = progressive.length === 0
    ? unique.filter((entry) => !entry.progressive).map((entry) => ({ ...entry, notWebReady: true }))
    : [];

  const merged = [...progressive, ...dashOnly];
  const qualityRank = (value) => {
    const match = String(value || '').match(/(\d{3,4})/);
    return match ? Number(match[1]) : 0;
  };
  merged.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

  return merged.slice(0, 40).map((entry) => ({
    url: entry.url,
    name: entry.name,
    title: entry.title || entry.name,
    quality: entry.quality || undefined,
    size: entry.size || undefined,
    language: entry.audioLang ? `${entry.audioLang} • ${entry.codec || 'HEVC'}` : (entry.codec || 'HEVC'),
    codec: entry.codec || 'hevc',
    codecName: entry.codec || 'hevc',
    addonId: 'moviebox-tui',
    addonName: 'MovieBox Sources',
    serverName: entry.audioLang ? `MovieBox (${entry.audioLang})` : 'MovieBox',
    behaviorHints: entry.notWebReady ? { notWebReady: true } : undefined,
    _resourceId: entry.resourceId || undefined,
  }));
}

/** MovieBox subtitles for a subject/episode (caption URLs are proxied too). */
export async function getMovieBoxSubtitles({ subjectId, season = 0, episode = 0, deadline } = {}) {
  const opts = { deadline };
  const se = season > 0 ? season : 0;
  const ep = episode > 0 ? episode : 0;
  const resourceIds = [];

  // Detector resource ids first (PR #219): play-info now only carries the
  // trailer, whose id resolves no captions; detector ids are the real media.
  try {
    const details = await movieBoxGetDetails(subjectId, opts);
    const data = details?.data ?? details;
    const detectors = Array.isArray(data?.resourceDetectors) ? data.resourceDetectors : [];
    for (const detector of detectors) {
      const entries = Array.isArray(detector?.resolutionList) ? detector.resolutionList : [];
      for (const entry of entries) {
        if (se > 0 || ep > 0) {
          const entrySe = toInt(entry?.se);
          const entryEp = toInt(entry?.ep);
          const matches = (entrySe === null || entrySe === se) && (entryEp === null || entryEp === ep);
          if (!matches) continue;
        }
        const id = toStringId(entry?.resourceId ?? entry?.id);
        if (id && !resourceIds.includes(id)) resourceIds.push(id);
      }
    }
  } catch {}

  // Fallback: play-info / resource ids (kept for when upstream restores them).
  if (resourceIds.length === 0) {
    const streamsPayload = await movieBoxGetPlayInfo(subjectId, se, ep, opts);
    const streams = Array.isArray(streamsPayload?.data?.streams)
      ? streamsPayload.data.streams
      : (Array.isArray(streamsPayload?.streams) ? streamsPayload.streams : []);

    for (const stream of streams) {
      const id = toStringId(stream?.id);
      if (id && !resourceIds.includes(id)) resourceIds.push(id);
    }
    if (resourceIds.length === 0) {
      const resources = await movieBoxGetResources(subjectId, se, ep, 1, 5, opts);
      const items = Array.isArray(resources?.list) ? resources.list : (Array.isArray(resources) ? resources : []);
      for (const item of items) {
        const id = toStringId(item?.resourceId ?? item?.id);
        if (id && !resourceIds.includes(id)) resourceIds.push(id);
      }
    }
  }
  if (resourceIds.length === 0) return [];

  const settled = await Promise.allSettled(
    resourceIds.slice(0, 3).map((resourceId) => movieBoxGetCaptions(subjectId, resourceId, opts))
  );

  const seenUrls = new Set();
  const subtitles = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const payload = result.value;
    const captions = payload?.extCaptions
      || payload?.data?.extCaptions
      || (Array.isArray(payload?.data) ? payload.data : null)
      || [];
    if (!Array.isArray(captions)) continue;

    for (const caption of captions) {
      const url = typeof caption?.url === 'string' ? caption.url : '';
      if (!url || url.includes('aa348f2541d13ffe')) continue;
      const size = Number(caption.size) || 0;
      if (size > 0 && size <= 50) continue;
      const langName = (caption.lanName || caption.lan || 'Unknown').trim() || 'Unknown';
      if (langName.toLowerCase() === 'in' && (size === 0 || size <= 100)) continue;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      subtitles.push({
        id: `mb-sub-${subtitles.length + 1}`,
        url: `/api/proxy/stream.vtt?url=${encodeURIComponent(issueStreamToken(url, { 'Referer': STREAM_REFERER, 'User-Agent': userAgent }))}`,
        lang: langName.toLowerCase().slice(0, 8),
        name: langName,
        addonId: 'moviebox-tui',
    addonName: 'MovieBox Sources',
      });
    }
  }
  return subtitles;
}

// ---------------------------------------------------------------------------
// time-limited detector links (port of service.rs refresh_moviebox_source)
// ---------------------------------------------------------------------------

/**
 * Re-resolve the current detector link for a resource id (PR #219).
 * Detector links carry a time-limited `?sign=&t=` query, so a listed link can
 * be stale before the player reaches it. Returns {url, expiresAt} or null.
 */
export async function refreshMovieBoxDetectorUrl(subjectId, resourceId, { deadline } = {}) {
  const sid = String(subjectId || '').trim();
  const rid = String(resourceId || '').trim();
  if (!sid || !rid) return null;

  const details = await movieBoxGetDetails(sid, { deadline, fresh: true });
  const data = details?.data ?? details;
  const detectors = Array.isArray(data?.resourceDetectors) ? data.resourceDetectors : [];
  for (const detector of detectors) {
    const entries = Array.isArray(detector?.resolutionList) ? detector.resolutionList : [];
    for (const entry of entries) {
      const entryRid = toStringId(entry?.resourceId ?? entry?.id);
      if (entryRid !== rid) continue;
      const linkRaw = (typeof entry?.resourceLink === 'string' && entry.resourceLink.trim())
        || (typeof entry?.url === 'string' ? entry.url.trim() : '');
      if (!linkRaw || isDeprecationNoticeUrl(linkRaw)) continue;
      return { url: linkRaw, expiresAt: parseLinkExpiry(linkRaw) };
    }
  }
  return null;
}

const REFRESH_WINDOW_S = 300; // refresh when < 5 min of link lifetime remains
const REFRESH_DEBOUNCE_MS = 60 * 1000;
/** @type {Map<string, {at: number, url: string | null, expiresAt: number}>} */
const refreshState = new Map();

/**
 * Called by the stream proxy just before fetching: returns the best known URL
 * for a token target — refreshed from subject details when its `?t=` expiry is
 * close (at most one upstream refresh per resource per minute). Falls back to
 * the URL it was given; never throws.
 */
export async function ensureFreshMovieBoxUrl(currentUrl, meta, { deadline } = {}) {
  try {
    const subjectId = meta?.subjectId;
    const resourceId = String(meta?.resourceId || '');
    if (!subjectId || !resourceId || !meta?.linkExpiresAt) return currentUrl;

    const state = refreshState.get(resourceId);
    const effectiveExpiry = Math.max(Number(meta.linkExpiresAt) || 0, state?.expiresAt || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const timeLeftSec = effectiveExpiry - nowSec;

    // Observed: the CDN serves links whose `t=` already lies in the past (t
    // behaves like an issue stamp with the current policy), so only a future
    // expiry approaching the window is worth a refresh — never churn the
    // details endpoint while a perfectly playable link is in flight.
    if (!(timeLeftSec > 0 && timeLeftSec <= REFRESH_WINDOW_S)) return state?.url || currentUrl;
    if (state && Date.now() - state.at < REFRESH_DEBOUNCE_MS) return state?.url || currentUrl;

    if (refreshState.size > 500) refreshState.clear();
    refreshState.set(resourceId, { at: Date.now(), url: state?.url || null, expiresAt: effectiveExpiry });

    const fresh = await refreshMovieBoxDetectorUrl(subjectId, resourceId, { deadline });
    if (fresh?.url) {
      refreshState.set(resourceId, { at: Date.now(), url: fresh.url, expiresAt: fresh.expiresAt || 0 });
      return fresh.url;
    }
    return state?.url || currentUrl;
  } catch {
    return currentUrl;
  }
}
