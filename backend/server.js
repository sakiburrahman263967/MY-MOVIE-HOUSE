import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import { AddonManager } from './addon-manager.js';
import { fetchPlatformContent, resolveImdbId, validateTmdbKey, fetchTmdbSeasonEpisodes, searchTmdbId, fetchTmdbSimilar, fetchPersonCredits } from './tmdb.js';
import { cloudstreamManager } from './cloudstream-manager.js';
import { iptvManager } from './iptv-manager.js';
import { isSupabaseConfigured } from './supabase.js';
import { searchProviders } from './providers/index.js';
import { isStreamToken, resolveStreamToken } from './providers/stream-tokens.js';
import { ensureFreshMovieBoxUrl } from './providers/moviebox.js';

// Global crash protection
process.on('uncaughtException', (err) => {
  console.error('[SERVER CAUGHT EXCEPTION]:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[SERVER UNHANDLED REJECTION]:', reason?.message || reason);
});

const app = express();
const addonManager = new AddonManager();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', supabase: isSupabaseConfigured }));
app.get('/api/config', (_req, res) => res.json(addonManager.getConfig()));
app.post('/api/config', async (req, res, next) => {
  try {
    const { tmdbApiKey, homeCatalogSections } = req.body || {};
    if (tmdbApiKey) {
      const isValid = await validateTmdbKey(tmdbApiKey);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid TMDB API key. Please check the key from themoviedb.org.' });
      }
    }
    const updated = addonManager.updateConfig({ tmdbApiKey, homeCatalogSections });
    return res.json({ success: true, config: updated });
  } catch (err) {
    next(err);
  }
});
app.get('/api/validate-tmdb', async (req, res) => {
  const key = typeof req.query.key === 'string' ? req.query.key.trim() : '';
  const valid = await validateTmdbKey(key);
  res.json({ valid });
});

app.get('/api/addons', (_req, res) => res.json(addonManager.list()));

app.post('/api/addons', async (req, res, next) => {
  const { url, name } = req.body || {};
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'Please provide a valid addon URL.' });
  }

  try {
    const parsedUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Only HTTP or HTTPS addon URLs are allowed.' });
    }
    if (!parsedUrl.pathname.endsWith('/manifest.json')) {
      parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/+$/, '')}/manifest.json`;
    }
    const candidate = { id: `validation-${Date.now()}`, url: parsedUrl.toString() };
    const manifest = await addonManager.getManifest(candidate);
    return res.status(201).json(addonManager.add({ url: candidate.url, name, manifest }));
  } catch (error) {
    if (error instanceof TypeError) return res.status(400).json({ error: 'The addon URL is invalid.' });
    if (error.message === 'Invalid Stremio addon manifest') {
      return res.status(400).json({ error: 'No valid Stremio addon manifest found at URL.' });
    }
    return res.status(400).json({ error: `Could not verify addon: ${error.message}` });
  }
});

app.delete('/api/addons/:id', (req, res) => {
  if (!addonManager.remove(req.params.id)) {
    return res.status(404).json({ error: 'Addon not found or cannot be removed.' });
  }
  return res.json({ success: true });
});

app.patch('/api/addons/:id/toggle', (req, res) => {
  const addon = addonManager.toggle(req.params.id);
  if (!addon) return res.status(404).json({ error: 'Addon not found.' });
  return res.json(addon);
});

app.get('/api/catalogs', async (_req, res, next) => {
  try {
    res.json(await addonManager.getAllCatalogs());
  } catch (error) {
    next(error);
  }
});

app.get('/api/catalog/:addonId/:type/:catalogId', async (req, res, next) => {
  try {
    const { genre, skip, search } = req.query;
    res.json(await addonManager.getCatalog(req.params.addonId, req.params.type, req.params.catalogId, {
      ...(genre ? { genre } : {}),
      ...(skip ? { skip } : {}),
      ...(search ? { search } : {})
    }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/meta/:type/:id', async (req, res, next) => {
  try {
    const meta = await addonManager.getMeta(req.params.type, req.params.id);
    if (!meta) return res.status(404).json({ error: 'Details not found for this title.' });
    return res.json(meta);
  } catch (error) {
    next(error);
  }
});

app.get('/api/addons/health', async (_req, res, next) => {
  try {
    const health = await addonManager.getHealth();
    res.json({ health });
  } catch (error) {
    next(error);
  }
});

app.get('/api/subtitles/:type/:id', async (req, res, next) => {
  try {
    const subs = await addonManager.getSubtitles(req.params.type, req.params.id);
    // Player fetches subtitle URLs as-is (no base prefix), so provider proxy
    // paths must come back absolute. Respect x-forwarded-proto behind proxies.
    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const base = `${forwardedProto || req.protocol}://${req.get('host')}`;
    const normalized = (subs || []).map((sub) => (
      sub?.url && typeof sub.url === 'string' && sub.url.startsWith('/api/')
        ? { ...sub, url: `${base}${sub.url}` }
        : sub
    ));
    res.json({ subtitles: normalized });
  } catch (error) {
    next(error);
  }
});

app.post('/api/addons/refresh', async (_req, res, next) => {
  try {
    const list = await addonManager.refreshAddons();
    res.json(list);
  } catch (error) {
    next(error);
  }
});

app.get('/api/streams/:type/:id', async (req, res, next) => {
  try {
    res.json(await addonManager.getStreams(req.params.type, req.params.id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/streams/:type/:id/live', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  try {
    await addonManager.getStreamsLive(req.params.type, req.params.id, (chunk) => {
      if (closed) return;
      if (chunk.event === 'done') {
        res.write(`event: done\ndata: ${JSON.stringify(chunk)}\n\n`);
      } else {
        res.write(`event: addon_streams\ndata: ${JSON.stringify(chunk)}\n\n`);
      }
    });
  } catch (error) {
    if (!closed) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    }
  } finally {
    if (!closed) {
      res.end();
    }
  }
});

// More Like This / Similar Titles
app.get('/api/meta/:type/:id/similar', async (req, res, next) => {
  try {
    const items = await fetchTmdbSimilar(req.params.type, req.params.id);
    return res.json({ results: items });
  } catch (error) {
    next(error);
  }
});

// Actor Filmography & Credits
app.get('/api/person/:nameOrId/credits', async (req, res, next) => {
  try {
    const result = await fetchPersonCredits(req.params.nameOrId);
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

// TV Series Season Episodes (e.g. CID, Game of Thrones, Anime)
app.get('/api/meta/series/:id/season/:seasonNumber', async (req, res, next) => {
  try {
    const targetSeason = parseInt(req.params.seasonNumber, 10) || 1;

    // 1. Check if addonManager already has metadata with videos for this series (e.g. Cinemeta / Stremio addons)
    const meta = await addonManager.getMeta('series', req.params.id);
    if (meta && Array.isArray(meta.videos) && meta.videos.length > 0) {
      const seasonVideos = meta.videos.filter((v) => (v.season === undefined ? 1 : v.season) === targetSeason);
      if (seasonVideos.length > 0) {
        const episodes = seasonVideos.map((v) => ({
          id: v.id || `${req.params.id}:${targetSeason}:${v.number || v.episode || 1}`,
          episodeNumber: v.number || v.episode || 1,
          seasonNumber: v.season || targetSeason,
          name: v.title || v.name || `Episode ${v.number || v.episode || 1}`,
          overview: v.overview || '',
          stillPath: v.thumbnail || null,
          airDate: v.released ? v.released.slice(0, 10) : '',
          runtime: null,
          voteAverage: null
        }));
        return res.json({ episodes });
      }
    }

    // 2. Query TMDB
    let episodes = await fetchTmdbSeasonEpisodes(req.params.id, targetSeason);

    // 3. Fallback: if id didn't return episodes but meta.name is known (e.g. "C.I.D."), search TMDB TV
    if ((!episodes || episodes.length === 0) && meta?.name) {
      const tmdbSearch = await searchTmdbId(meta.name, 'series');
      if (tmdbSearch?.tmdbId) {
        episodes = await fetchTmdbSeasonEpisodes(tmdbSearch.tmdbId, targetSeason);
      }
    }

    res.json({ episodes: episodes || [] });
  } catch (error) {
    next(error);
  }
});

// IPTV API endpoints (M3U / M3U8 / Xtream Codes Live TV)
app.get('/api/iptv/playlists', (_req, res) => {
  res.json({ playlists: iptvManager.getPlaylists() });
});

app.post('/api/iptv/playlists', async (req, res) => {
  try {
    const pl = await iptvManager.addPlaylist(req.body);
    res.json({ success: true, playlist: pl, playlists: iptvManager.getPlaylists() });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to add IPTV playlist.' });
  }
});

app.delete('/api/iptv/playlists/:id', async (req, res) => {
  try {
    const list = await iptvManager.removePlaylist(req.params.id);
    res.json({ success: true, playlists: list });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to remove IPTV playlist.' });
  }
});

app.patch('/api/iptv/playlists/:id/toggle', async (req, res) => {
  try {
    const list = await iptvManager.togglePlaylist(req.params.id);
    res.json({ success: true, playlists: list });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to toggle IPTV playlist.' });
  }
});

app.post('/api/iptv/refresh', async (_req, res) => {
  try {
    await iptvManager._refreshChannels();
    res.json({ success: true, count: iptvManager.channels.length, playlists: iptvManager.getPlaylists() });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to refresh channels' });
  }
});

app.get('/api/iptv/channels', (req, res) => {
  const { category, search, limit, offset } = req.query;
  const data = iptvManager.getChannels(
    category || '',
    search || '',
    parseInt(limit, 10) || 1000,
    parseInt(offset, 10) || 0
  );
  res.json(data);
});

app.get('/api/iptv/categories', (_req, res) => {
  res.json({ categories: iptvManager.categories });
});

app.get('/api/iptv/stream/:id', (req, res) => {
  const stream = iptvManager.getChannelStream(req.params.id);
  if (!stream) return res.status(404).json({ error: 'IPTV stream not found.' });
  res.json(stream);
});

// SSRF Protection: Block private, localhost, and link-local IP addresses
function isPrivateOrBlockedHost(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase().trim();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') {
    return true;
  }
  if (h === '169.254.169.254' || h.startsWith('169.254.')) {
    return true;
  }
  const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = parseInt(ipv4Match[1], 10);
    const b = parseInt(ipv4Match[2], 10);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd') || h === '::') {
    return true;
  }
  return false;
}

// Stream Proxy for streams requiring custom headers (Referer, Origin, Cookie) or cross-origin playback
// Opaque provider tokens (MovieBox-TUI port) are resolved server-side here:
// `?url=<uuid>` looks up the real signed upstream URL + headers from the
// in-memory store, so nothing sensitive reaches the browser or logs.
const streamProxyHandler = async (req, res) => {
  const configuredOrigin = process.env.FRONTEND_ORIGIN || process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
  const reqOrigin = req.headers.origin;
  const allowOrigin = (reqOrigin && (reqOrigin === configuredOrigin || configuredOrigin === '*'))
    ? reqOrigin
    : configuredOrigin;

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rawTargetUrl = req.query.url;
  if (!rawTargetUrl || typeof rawTargetUrl !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  let targetUrl = rawTargetUrl;
  let tokenHeaders = {};
  let tokenMeta = null;
  if (isStreamToken(rawTargetUrl)) {
    const resolved = resolveStreamToken(rawTargetUrl);
    if (!resolved) {
      return res.status(410).send('Stream token expired or invalid');
    }
    targetUrl = resolved.url;
    tokenHeaders = resolved.headers;
    tokenMeta = resolved.meta;
  }

  if (tokenMeta?.subjectId && tokenMeta?.resourceId) {
    // MovieBox detector links are signed and time-limited (?sign=&t=): refresh
    // them shortly before expiry so long playback sessions never hit a stale
    // URL (port of refresh_moviebox_source, debounced inside the provider).
    targetUrl = await ensureFreshMovieBoxUrl(targetUrl, tokenMeta, { deadline: Date.now() + 6000 });
  }

  let customHeaders = {};
  if (req.query.headers) {
    try {
      customHeaders = JSON.parse(req.query.headers);
    } catch {}
  }
  customHeaders = { ...customHeaders, ...tokenHeaders };

  const reqHeaders = {
    ...customHeaders,
    'User-Agent': customHeaders['User-Agent'] || req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };
  if (req.headers.range) {
    reqHeaders['range'] = req.headers.range;
  }

  const abortController = new AbortController();
  req.on('close', () => {
    try {
      abortController.abort();
    } catch {}
  });

  try {
    let currentUrl = targetUrl.trim();
    let redirects = 0;
    const maxRedirects = 5;
    let upstreamRes = null;

    while (redirects <= maxRedirects) {
      let parsed;
      try {
        parsed = new URL(currentUrl);
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Invalid protocol. Only HTTP and HTTPS are allowed.' });
      }

      if (isPrivateOrBlockedHost(parsed.hostname)) {
        return res.status(403).json({ error: 'Access to private or link-local address is forbidden (SSRF protection).' });
      }

      upstreamRes = await fetch(currentUrl, {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: reqHeaders,
        redirect: 'manual',
        signal: abortController.signal
      });

      if ([301, 302, 303, 307, 308].includes(upstreamRes.status)) {
        const location = upstreamRes.headers.get('location');
        if (!location) break;
        currentUrl = new URL(location, currentUrl).toString();
        redirects++;
        if (redirects > maxRedirects) {
          return res.status(502).json({ error: 'Too many redirects (limit 5 exceeded).' });
        }
        continue;
      }
      break;
    }

    if (!upstreamRes) {
      return res.status(502).json({ error: 'Failed to connect to upstream stream.' });
    }

    res.status(upstreamRes.status);
    const passHeaders = ['content-length', 'content-range', 'accept-ranges', 'cache-control'];
    for (const h of passHeaders) {
      const val = upstreamRes.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    // Explicitly allow seeking in browser player
    res.setHeader('Accept-Ranges', 'bytes');

    // Clean & standardize Content-Type for HTML5 video players
    const rawCt = (upstreamRes.headers.get('content-type') || '').toLowerCase();
    if (rawCt.includes('video/mp4') || currentUrl.toLowerCase().includes('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (rawCt.includes('mpegurl') || currentUrl.toLowerCase().includes('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (rawCt.includes('video/webm') || currentUrl.toLowerCase().includes('.webm')) {
      res.setHeader('Content-Type', 'video/webm');
    } else if (rawCt) {
      res.setHeader('Content-Type', rawCt.split(',')[0].trim());
    }

    if (req.method === 'HEAD') {
      return res.end();
    }

    if (upstreamRes.body) {
      if (typeof upstreamRes.body.pipe === 'function') {
        upstreamRes.body.pipe(res);
      } else {
        const stream = Readable.fromWeb(upstreamRes.body);
        stream.pipe(res);
      }
    } else {
      res.end();
    }
  } catch (err) {
    if (!res.headersSent && err.name !== 'AbortError') {
      // Token-resolved targets are signed/credentialed — never echo their URLs.
      const detail = Object.keys(tokenHeaders).length > 0
        ? 'upstream fetch failed'
        : err.message;
      res.status(502).json({ error: 'Proxy error: ' + detail });
    }
  }
};

app.all('/api/proxy/stream', streamProxyHandler);
// Extension-suffixed variant so the player's extension/HLS detection
// (split('?')[0].endsWith('.m3u8')) works for proxied token URLs.
app.all('/api/proxy/stream.:ext', streamProxyHandler);

app.get('/api/search', async (req, res, next) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) return res.json([]);
  try {
    // MovieBox-TUI providers (MovieBox + Dramachi) search in parallel with
    // addon catalogs; failures degrade to catalog-only results.
    const providerPromise = searchProviders(query).catch(() => []);

    const catalogs = await addonManager.getAllCatalogs();
    const matchingCatalogs = catalogs.filter((catalog) => (
      catalog.extra?.some((entry) => entry.name === 'search')
    )).slice(0, 10);
    const results = await Promise.allSettled(matchingCatalogs.map((catalog) => (
      addonManager.getCatalog(catalog.addonId, catalog.type, catalog.id, { search: query })
    )));
    const unique = new Map();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        if (item?.id && !unique.has(item.id)) unique.set(item.id, item);
      }
    }
    const providerItems = await providerPromise;
    for (const item of providerItems) {
      if (item?.id && !unique.has(item.id)) unique.set(item.id, item);
    }
    return res.json([...unique.values()]);
  } catch (error) {
    return next(error);
  }
});

// TMDB Platform Discovery & Content (Landscape movies & series)
app.get('/api/platforms/content', async (req, res, next) => {
  try {
    const platform = typeof req.query.platform === 'string' ? req.query.platform.trim() : 'Netflix';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const items = await fetchPlatformContent(platform, { category, id });
    res.json(items);
  } catch (error) {
    next(error);
  }
});

// Resolve TMDB item to IMDB id for seamless streaming playback
app.get('/api/tmdb-to-imdb/:type/:id', async (req, res, next) => {
  try {
    const imdbId = await resolveImdbId(req.params.type, req.params.id);
    res.json({ imdbId });
  } catch (error) {
    next(error);
  }
});

// ─── Direct Stream Link Extractor (Extract .m3u8 / .mp4 from embed pages) ───
function unpackPacker(packedCode) {
  try {
    const match = packedCode.match(/}\s*\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*)'\.split\('\|'\)/s);
    if (!match) return null;
    let [, p, a, c, k] = match;
    a = parseInt(a, 10);
    c = parseInt(c, 10);
    k = k.split('|');
    const e = (val) => (val < a ? '' : e(parseInt(val / a, 10))) + ((val = val % a) > 35 ? String.fromCharCode(val + 29) : val.toString(36));
    while (c--) {
      if (k[c]) {
        p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
      }
    }
    return p;
  } catch {
    return null;
  }
}

function extractVideoUrls(html) {
  if (!html || typeof html !== 'string') return [];
  const urls = [];

  const m3u8Matches = html.matchAll(/(https?:\\?\/\\?\/[^"'`\s<>]+\.m3u8[^"'`\s<>]*)/gi);
  for (const m of m3u8Matches) {
    urls.push(m[1].replace(/\\\//g, '/'));
  }

  const mp4Matches = html.matchAll(/(https?:\\?\/\\?\/[^"'`\s<>]+\.mp4[^"'`\s<>]*)/gi);
  for (const m of mp4Matches) {
    urls.push(m[1].replace(/\\\//g, '/'));
  }

  const packedMatches = html.matchAll(/eval\(function\(p,a,c,k,e,d[\s\S]*?\.split\('\|'\)\)\)/gi);
  for (const pm of packedMatches) {
    const unpacked = unpackPacker(pm[0]);
    if (unpacked) {
      const subM3u8 = unpacked.matchAll(/(https?:\\?\/\\?\/[^"'`\s<>]+\.m3u8[^"'`\s<>]*)/gi);
      for (const sm of subM3u8) {
        urls.push(sm[1].replace(/\\\//g, '/'));
      }
      const subMp4 = unpacked.matchAll(/(https?:\\?\/\\?\/[^"'`\s<>]+\.mp4[^"'`\s<>]*)/gi);
      for (const smp of subMp4) {
        urls.push(smp[1].replace(/\\\//g, '/'));
      }
    }
  }

  return [...new Set(urls)].filter((u) => !u.includes('google-analytics') && !u.includes('doubleclick') && !u.includes('recaptcha'));
}

app.get('/api/resolve-direct-stream', async (req, res) => {
  let targetUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!targetUrl) return res.json({ success: false, error: 'URL is required' });

  // Unpack Sootio resolver link if present
  if (targetUrl.includes('/httpstreaming/')) {
    try {
      const extracted = decodeURIComponent(targetUrl.split('/httpstreaming/')[1]);
      if (extracted && extracted.startsWith('http')) {
        targetUrl = extracted;
      }
    } catch {}
  }

  try {
    const fetchRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': targetUrl
      },
      redirect: 'follow',
      timeout: 8000
    });

    if (!fetchRes.ok) {
      return res.json({ success: false, error: `HTTP ${fetchRes.status}` });
    }

    const html = await fetchRes.text();
    let urls = extractVideoUrls(html);

    // Look for PixelDrain or Direct download/stream links in page
    if (urls.length === 0) {
      const pdMatch = html.match(/https?:\/\/(?:www\.)?pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i);
      if (pdMatch) {
        urls.push(`https://pixeldrain.com/api/file/${pdMatch[1]}`);
      }
      const hubMatch = html.match(/href="([^"]*(?:hubcloud|drive|download|fastdl|stream)[^"]*\.m3u8[^"]*)"/i);
      if (hubMatch) {
        urls.push(hubMatch[1]);
      }
    }

    if (urls.length > 0) {
      const best = urls.find((u) => u.includes('.m3u8')) || urls[0];
      return res.json({ success: true, directUrl: best, allUrls: urls });
    }

    return res.json({ success: false, message: 'No direct video stream could be extracted.' });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// ─── CloudStream Repository & Extension Endpoints ───
app.get('/api/cloudstream/repos', (_req, res) => {
  res.json({
    repos: cloudstreamManager.getRepos(),
    masterEnabled: cloudstreamManager.getMasterStatus()
  });
});

app.patch('/api/cloudstream/toggle', (_req, res) => {
  const masterEnabled = cloudstreamManager.toggleMaster();
  addonManager.clearCaches();
  res.json({ success: true, masterEnabled });
});

app.post('/api/cloudstream/repos', async (req, res, next) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'CloudStream repository URL is required.' });
    const result = await cloudstreamManager.addRepo(url);
    addonManager.clearCaches();
    res.json({
      success: true,
      repo: result.repo,
      repos: result.repos,
      masterEnabled: result.masterEnabled
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to add CloudStream repository. Please check URL.' });
  }
});

app.delete('/api/cloudstream/repos/:id', async (req, res, next) => {
  try {
    const updated = await cloudstreamManager.removeRepo(req.params.id);
    addonManager.clearCaches();
    res.json({ success: true, repos: updated, masterEnabled: cloudstreamManager.getMasterStatus() });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/cloudstream/repos/:id/toggle', (req, res) => {
  const result = cloudstreamManager.toggleRepo(req.params.id);
  addonManager.clearCaches();
  res.json({ success: true, enabled: result.enabled, repos: result.repos });
});

app.patch('/api/cloudstream/repos/:repoId/plugins/:pluginId/toggle', (req, res) => {
  const result = cloudstreamManager.togglePlugin(req.params.repoId, req.params.pluginId);
  addonManager.clearCaches();
  res.json({ success: true, enabled: result.enabled, repos: result.repos });
});

app.patch('/api/cloudstream/repos/:repoId/enable-all', (req, res) => {
  const updated = cloudstreamManager.setAllPlugins(req.params.repoId, true);
  addonManager.clearCaches();
  res.json({ success: true, repos: updated });
});

app.patch('/api/cloudstream/repos/:repoId/disable-all', (req, res) => {
  const updated = cloudstreamManager.setAllPlugins(req.params.repoId, false);
  addonManager.clearCaches();
  res.json({ success: true, repos: updated });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(502).json({ error: error.message || 'The request could not be processed.' });
});

const MAX_CONCURRENT_TRANSCODES = 2;
let activeTranscodes = 0;

// GET /api/transcode/stream?url=... Transcode MKV audio (AC3/EAC3/DTS) to AAC
app.get('/api/transcode/stream', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!rawUrl) return res.status(400).json({ error: 'Missing url parameter' });

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!['http:', 'https:'].includes(target.protocol)) return res.status(400).json({ error: 'Only http/https allowed' });
  if (isPrivateOrBlockedHost(target.hostname)) return res.status(403).json({ error: 'Access to private or link-local address forbidden' });

  if (activeTranscodes >= MAX_CONCURRENT_TRANSCODES) {
    return res.status(503).json({ error: 'Too many concurrent transcodes. Try again later.' });
  }

  activeTranscodes += 1;
  const configuredOrigin = process.env.FRONTEND_ORIGIN || process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
  const reqOrigin = req.headers.origin;
  const allowOrigin = (reqOrigin && (reqOrigin === configuredOrigin || configuredOrigin === '*')) ? reqOrigin : configuredOrigin;
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'none');

  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', rawUrl,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1'
  ];

  let ffmpeg;
  try {
    ffmpeg = spawn('ffmpeg', args);
  } catch (err) {
    activeTranscodes -= 1;
    return res.status(500).json({ error: 'ffmpeg unavailable. Choose an MP4/AAC source instead.' });
  }

  const killProc = () => {
    if (ffmpeg && !ffmpeg.killed) {
      try { ffmpeg.kill('SIGKILL'); } catch {}
    }
  };

  req.on('close', killProc);
  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on('data', () => {});

  ffmpeg.on('error', (err) => {
    activeTranscodes -= 1;
    if (!res.headersSent) {
      res.status(500).json({ error: 'ffmpeg unavailable. Choose an MP4/AAC source instead.' });
    }
  });

  ffmpeg.on('close', () => {
    activeTranscodes = Math.max(0, activeTranscodes - 1);
    req.removeListener('close', killProc);
    if (!res.headersSent) res.end();
  });
});
const port = process.env.PORT || 3001;
if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`My-Movie-House API listening at http://localhost:${port}`));
}

export default app;
