// Dramachi provider — ported from MovieBox-TUI (Rust, MIT OR Apache-2.0)
// https://github.com/mesamirh/MovieBox-Tui
//
// Plain unauthenticated JSON API (no signing/token needed). Stream URLs carry
// no credentials, so they are returned directly like every other scraped
// provider in this app; logs are still sanitized (no query strings).

import fetch from 'node-fetch';
import { createCache } from './cache.js';

const BASE_URL = 'https://api.nodeobjects.com/';
const IMAGE_CDN_BASE = 'https://static.nodeobjects.com/thumbnail/';
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_DEADLINE_MS = 15000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const searchCache = createCache(15 * 60 * 1000, 100);
const detailsCache = createCache(10 * 60 * 1000, 50);
const eplistCache = createCache(5 * 60 * 1000, 100);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function encodeParam(value) {
  return encodeURIComponent(String(value ?? ''));
}

function posterUrl(thumb) {
  const raw = String(thumb || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${IMAGE_CDN_BASE}${raw.replace(/^\/+/, '')}`;
}

async function dramachiGet(query, { deadline } = {}) {
  const until = deadline || Date.now() + DEFAULT_DEADLINE_MS;
  const remaining = Math.max(1000, Math.min(REQUEST_TIMEOUT_MS, until - Date.now()));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetch(`${BASE_URL}?${query}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Dramachi HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// parsing helpers (ports of dramachi/client.rs helpers)
// ---------------------------------------------------------------------------

function extractLeadingSeasonNumber(name) {
  const match = String(name || '').trim().match(/^season\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function cleanEpisodeTitle(fTitle) {
  let title = String(fTitle || '').trim();
  const suffixes = [' 720p', ' 1080p', ' 540p', ' 480p', ' 360p', ' DUB', ' hi DUB', ' ENG Subbed Full'];
  for (const suffix of suffixes) {
    if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
  }
  return title.trim();
}

function parseEpisodeNumber(fTitle) {
  const cleaned = cleanEpisodeTitle(fTitle);
  const upper = cleaned.toUpperCase();
  for (const prefix of ['EPISODE', 'EP.', 'EP', 'E']) {
    let searchFrom = 0;
    while (searchFrom <= upper.length) {
      const relPos = upper.indexOf(prefix, searchFrom);
      if (relPos === -1) break;
      const before = relPos > 0 ? upper[relPos - 1] : '';
      const validBoundary = before === ''
        || !/[A-Z]/i.test(before)
        || (prefix === 'E' && /\d/.test(before));
      const after = upper.slice(relPos + prefix.length).replace(/^[\s\-._]+/, '');
      const numStr = (after.match(/^\d+/) || [''])[0];
      if (validBoundary && numStr) {
        const value = Number.parseInt(numStr, 10);
        if (Number.isFinite(value)) return value;
      }
      searchFrom = relPos + prefix.length;
    }
  }

  const tokens = cleaned.split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (last && /^\d+$/.test(last)) return Number.parseInt(last, 10);
  return null;
}

function parseSizeBytes(value) {
  const match = String(value || '').match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toUpperCase();
  const factors = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return Math.round(amount * (factors[unit] || 1));
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

function splitCompositeId(id) {
  const raw = String(id || '').replace(/^dr:/, '');
  const episodeMatch = raw.match(/^(.+):(\d+):(\d+)$/);
  if (episodeMatch) {
    const base = episodeMatch[1];
    const season = Number.parseInt(episodeMatch[2], 10) || 0;
    const episode = Number.parseInt(episodeMatch[3], 10) || 0;
    const ripSplit = base.includes('::') ? base.split('::') : null;
    if (ripSplit) return { titleId: ripSplit[0], rip: ripSplit[1] || null, season, episode };
    return { titleId: base, rip: null, season, episode };
  }
  const ripSplit = raw.includes('::') ? raw.split('::') : null;
  if (ripSplit) return { titleId: ripSplit[0], rip: ripSplit[1] || null, season: 0, episode: 0 };
  return { titleId: raw, rip: null, season: 0, episode: 0 };
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export async function dramachiSearch(query, { deadline } = {}) {
  const keyword = String(query || '').trim();
  if (!keyword) return [];
  const cacheKey = keyword.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const payload = await dramachiGet(`interface=search&q=${encodeParam(keyword)}&filter=all&page=1`, { deadline });
  const items = Array.isArray(payload?.data) ? payload.data : [];

  const results = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || !item.id) continue;
    const content = String(item.content || '').toLowerCase();
    const isMovie = content === 'movies' || content === 'movie';
    const title = item.title || 'Unknown';
    results.push({
      id: `dr:${item.id}`,
      type: isMovie ? 'movie' : 'series',
      name: title,
      title,
      poster: posterUrl(item.thumb),
      releaseInfo: String(item.year || '').trim() || undefined,
    });
  }

  searchCache.set(cacheKey, results);
  return results;
}

async function fetchTitleDetails(titleId, { deadline } = {}) {
  const cacheKey = String(titleId);
  const cached = detailsCache.get(cacheKey);
  if (cached) return cached;

  const payload = await dramachiGet(`interface=title_v2&id=${encodeParam(titleId)}`, { deadline });
  detailsCache.set(cacheKey, payload);
  return payload;
}

function detailsToMeta(payload, requestedId) {
  const album = Array.isArray(payload?.album) ? payload.album[0] : null;
  if (!album) return null;

  const content = String(album.content || '').toLowerCase();
  const isMovie = content === 'movies' || content === 'movie';
  const titleId = String(requestedId || '').replace(/^dr:/, '').split('::')[0];

  const genres = String(album.genres || '')
    .split(',')
    .map((genre) => genre.trim())
    .filter(Boolean);

  const cast = Array.isArray(payload.cast)
    ? payload.cast.map((member) => member?.name).filter((name) => typeof name === 'string' && name.trim())
        .map((name) => ({ name: name.trim() }))
    : [];

  const seasonsMap = payload?.seasons && typeof payload.seasons === 'object' ? payload.seasons : null;
  const seasons = [];
  if (seasonsMap) {
    const keys = Object.keys(seasonsMap).sort((a, b) => {
      const numA = extractLeadingSeasonNumber(a);
      const numB = extractLeadingSeasonNumber(b);
      return (numA ?? Number.MAX_SAFE_INTEGER) - (numB ?? Number.MAX_SAFE_INTEGER);
    });
    for (const key of keys) {
      const group = seasonsMap[key];
      const seasonNumber = extractLeadingSeasonNumber(key) || seasons.length + 1;
      const versions = Array.isArray(group?.versions) ? group.versions : [];
      seasons.push({
        seasonNumber,
        name: key || `Season ${seasonNumber}`,
        episodeCount: 0,
        poster: null,
        airDate: '',
        _rips: versions.map((version) => version?.rip).filter((rip) => typeof rip === 'string' && rip),
      });
    }
  }

  const year = String(album.year || '').trim();
  const director = String(album.director || '').trim();

  return {
    id: String(requestedId || `dr:${titleId}`),
    name: album.title || 'Unknown',
    type: isMovie ? 'movie' : 'series',
    poster: posterUrl(album.thumb),
    background: null,
    description: album.storyline || '',
    year,
    releaseInfo: year,
    runtime: null,
    imdbRating: null,
    genres,
    cast,
    director: director ? director.split(',').map((name) => name.trim()).filter(Boolean) : [],
    seasons,
    totalSeasons: seasons.length,
    totalEpisodes: 0,
    videos: [],
    provider: 'dramachi',
  };
}

export async function getDramachiMeta(id, { deadline } = {}) {
  const { titleId } = splitCompositeId(id);
  if (!titleId) return null;
  const payload = await fetchTitleDetails(titleId, { deadline });
  return detailsToMeta(payload, id);
}

/** Resolve the rip (version) used to fetch an episode list for a season. */
async function resolveRip(titleId, payload, season, { deadline } = {}) {
  const seasonsMap = payload?.seasons && typeof payload.seasons === 'object' ? payload.seasons : null;
  if (seasonsMap) {
    const keys = Object.keys(seasonsMap);
    if (season > 0) {
      const targetKey = `Season ${String(season).padStart(2, '0')}`;
      const group = seasonsMap[targetKey] || keys
        .filter((key) => extractLeadingSeasonNumber(key) === season)
        .map((key) => seasonsMap[key])[0];
      const versions = Array.isArray(group?.versions) ? group.versions : null;
      if (versions && versions.length > 0 && versions[0]?.rip) return versions[0].rip;
    }
    const firstGroup = seasonsMap[keys[0]];
    const firstVersions = Array.isArray(firstGroup?.versions) ? firstGroup.versions : null;
    if (firstVersions && firstVersions.length > 0 && firstVersions[0]?.rip) return firstVersions[0].rip;
  }
  if (season > 0) return `Season ${String(season).padStart(2, '0')}`;
  return 'hd Rip';
}

async function fetchEpisodes(titleId, rip, { deadline } = {}) {
  const cacheKey = `${titleId}|${rip}`;
  const cached = eplistCache.get(cacheKey);
  if (cached) return cached;

  const payload = await dramachiGet(`interface=eplist&season=${encodeParam(rip)}&id=${encodeParam(titleId)}`, { deadline });
  const episodes = Array.isArray(payload?.episode_list) ? payload.episode_list : [];
  episodes.sort((a, b) => {
    const numA = parseEpisodeNumber(a?.f_title) ?? Number.MAX_SAFE_INTEGER;
    const numB = parseEpisodeNumber(b?.f_title) ?? Number.MAX_SAFE_INTEGER;
    return numA - numB;
  });

  eplistCache.set(cacheKey, episodes);
  return episodes;
}

async function fetchFileStream(fid, disk, { deadline } = {}) {
  const payload = await dramachiGet(`interface=getFile&fid=${encodeParam(fid)}&findex=${encodeParam(disk)}`, { deadline });

  const host = payload?.hostInfo?.host;
  const fileInfo = Array.isArray(payload?.fileInfo) ? payload.fileInfo[0] : null;
  if (!host || !fileInfo?.url) return null;

  const hostClean = String(host).trim().replace(/\/+$/, '');
  const rawUrl = String(fileInfo.url).trim().replace(/^\/+/, '');
  const filename = fileInfo.filename || fileInfo.f_title || `${fid}.mkv`;
  return { url: `https://${hostClean}/cdn/${rawUrl}`, filename };
}

/**
 * Resolve playable Dramachi streams for a composite id (optionally with
 * season/episode appended by the frontend: dr:<titleId>[:<rip>]:<se>:<ep>).
 */
export async function getDramachiStreams(id, { deadline } = {}) {
  const { titleId, rip: ripFromId, season, episode } = splitCompositeId(id);
  if (!titleId) return [];

  const opts = { deadline };
  const details = await fetchTitleDetails(titleId, opts);
  const rip = ripFromId || await resolveRip(titleId, details, season, opts);
  const episodes = await fetchEpisodes(titleId, rip, opts);
  if (episodes.length === 0) return [];

  let matched = [];
  if (season === 0 && episode === 0) {
    matched = episodes;
  } else {
    const exact = episodes.filter((entry) => parseEpisodeNumber(entry?.f_title) === episode);
    if (exact.length > 0) matched = exact;
    else if (episode > 0 && episode <= episodes.length) matched = [episodes[episode - 1]];
  }
  if (matched.length === 0) return [];

  const resolvable = matched
    .filter((entry) => entry && String(entry.fid || '').trim() && String(entry.disk || '').trim())
    .slice(0, 8);

  const settled = await Promise.allSettled(
    resolvable.map((entry) => fetchFileStream(entry.fid, entry.disk, opts))
  );

  const streams = [];
  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    if (result.status !== 'fulfilled' || !result.value) continue;
    const entry = resolvable[i];
    const quality = String(entry.quality || '').trim() || null;
    const size = formatBytes(parseSizeBytes(entry.size || ''));
    const label = cleanEpisodeTitle(entry.f_title) || result.value.filename;

    const directFileUrl = result.value.url;
    const proxiedUrl = `/api/proxy/stream?url=${encodeURIComponent(directFileUrl)}`;
    streams.push({
      url: proxiedUrl,
      externalUrl: directFileUrl,
      name: `Dramachi ${label}${quality ? ` ${quality}` : ''}`.trim(),
      title: `Dramachi ${label}${quality ? ` ${quality}` : ''}`.trim(),
      quality: quality && /^\d+p$/i.test(quality) ? quality.toUpperCase() : undefined,
      size: size || undefined,
      addonName: 'Dramachi',
      serverName: 'Dramachi',
      language: undefined,
    });
  }
  return streams;
}
