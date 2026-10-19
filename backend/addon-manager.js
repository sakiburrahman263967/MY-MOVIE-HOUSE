import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import {
  TMDB_CATALOG_DEFINITIONS,
  fetchTmdbCatalog,
  fetchTmdbMeta,
  getTmdbApiKey,
  setTmdbApiKey,
  resolveImdbId,
  searchTmdbId,
} from './tmdb.js';
import { cloudstreamManager } from './cloudstream-manager.js';
import { iptvManager } from './iptv-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, 'config.json');
const CUSTOM_CACHE_FILE = join(__dirname, 'custom-meta-cache.json');
const LEGACY_STATE_FILE = join(__dirname, 'addons-state.json');

export const DEFAULT_ADDONS = [
  {
    id: 'tmdb-builtin',
    name: 'TMDB (Official Database)',
    url: 'local://tmdb',
    enabled: true,
    builtin: true
  },
  {
    id: 'cinemeta',
    name: 'Cinemeta',
    url: 'https://v3-cinemeta.strem.io/manifest.json',
    enabled: true,
    builtin: true
  },
  {
    id: 'sootio',
    name: '[HS+] Sootio Direct Streams',
    url: 'https://sooti.info/%7B%22DebridServices%22%3A%5B%7B%22provider%22%3A%22httpstreaming%22%2C%22http4khdhub%22%3Atrue%2C%22httpHDHub4u%22%3Atrue%2C%22httpUHDMovies%22%3Atrue%2C%22httpMoviesDrive%22%3Atrue%2C%22httpMKVCinemas%22%3Atrue%2C%22httpMalluMv%22%3Atrue%2C%22httpCineDoze%22%3Atrue%2C%22httpVixSrc%22%3Atrue%2C%22httpMoviesMod%22%3Atrue%2C%22httpMoviesLeech%22%3Atrue%2C%22httpAnimeFlix%22%3Atrue%2C%22http111477%22%3Afalse%2C%22httpXDMovies%22%3Afalse%2C%22httpPixeldrain%22%3Atrue%2C%22httpMkvBase%22%3Atrue%2C%22httpVadapav%22%3Afalse%2C%22enableProxy%22%3Afalse%2C%22proxyUrl%22%3A%22%22%2C%22proxyPassword%22%3A%22%22%7D%5D%2C%22Languages%22%3A%5B%5D%2C%22Resolutions%22%3A%5B%221080p%22%2C%22720p%22%2C%22480p%22%5D%2C%22Scrapers%22%3A%5B%221337x%22%2C%22knaben%22%2C%22torrents-csv%22%2C%22rarbg%22%2C%22extto%22%2C%22limetorrents%22%5D%2C%22IndexerScrapers%22%3A%5B%22stremthru%22%5D%2C%22ScrapersConfigured%22%3Atrue%2C%22minSize%22%3A0%2C%22maxSize%22%3A10%2C%22ShowCatalog%22%3Atrue%2C%22ProxyApplyAll%22%3Afalse%2C%22DebridProvider%22%3A%22httpstreaming%22%7D/manifest.json',
    enabled: true
  },
  {
    id: 'hdhub4u',
    name: 'HDHub4u Direct Streams',
    url: 'https://hdhub.thevolecitor.qzz.io/eyJ0b3Jib3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAiLCJzb3J0IjoiZGVzYyJ9/manifest.json',
    enabled: true
  },
  {
    id: 'penguplay',
    name: 'PenguPlay Direct Streams',
    url: 'https://pengu.uk/%7B%22auth_token%22%3A%22aob9jrv4e3YEABGwmp1ouV0Fdmb9xwhsaU4tlW8KRLs%22%7D/manifest.json',
    enabled: true
  },
  {
    id: 'cinefreak',
    name: 'CineFreak & Bangla Tanvir',
    url: 'https://cstremio.mehedihtanvir.me/manifest.json',
    enabled: true
  },
  {
    id: 'webstreamrmbg',
    name: 'WebStreamr MBG',
    url: 'https://87d6a6ef6b58-webstreamrmbg.baby-beamup.club/%7B%22multi%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22excludeResolution_2160p%22%3A%22on%22%2C%22excludeResolution_1440p%22%3A%22on%22%7D/manifest.json',
    enabled: true
  }
];

const getBaseUrl = (url) => url.replace(/\/+$/, '').replace(/\/manifest\.json$/i, '');

const resourceName = (resource) => (
  typeof resource === 'string' ? resource : resource?.name
);

function decodeHtmlEntities(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/&#039;/g, "'")
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8230;/g, '...')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&eacute;/g, 'é')
    .replace(/&oacute;/g, 'ó')
    .replace(/&aacute;/g, 'á')
    .replace(/&iacute;/g, 'í')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ');
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = 4500) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

function loadPersistedConfig() {
  // 1. Try modern config.json
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}

  // 2. Try legacy addons-state.json
  try {
    const raw = readFileSync(LEGACY_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed?.addons || parsed?.value);
    if (Array.isArray(list)) return { addons: list };
  } catch {}

  return null;
}

export class AddonManager {
  constructor() {
    const saved = loadPersistedConfig();

    if (saved?.tmdbApiKey) {
      setTmdbApiKey(saved.tmdbApiKey);
    }

    this.homeCatalogSections = Array.isArray(saved?.homeCatalogSections) ? saved.homeCatalogSections : null;

    if (saved && Array.isArray(saved.addons)) {
      const savedMap = new Map(saved.addons.map((a) => [a.id, a]));

      // Keep defaults with saved enabled status
      const base = DEFAULT_ADDONS.map((d) => {
        const item = savedMap.get(d.id);
        return item ? { ...d, enabled: item.enabled } : { ...d };
      });

      // Append custom addons
      const defaultIds = new Set(DEFAULT_ADDONS.map((d) => d.id));
      const custom = saved.addons.filter((a) => !defaultIds.has(a.id));
      this.addons = [...base, ...custom];
    } else {
      this.addons = DEFAULT_ADDONS.map((addon) => ({ ...addon }));
    }

    this.manifestCache = new Map();
    this.catalogCache = new Map();
    this.allCatalogsCache = null;
    this.allCatalogsCacheTime = 0;
    this.customMetaCache = new Map();

    try {
      if (existsSync(CUSTOM_CACHE_FILE)) {
        const raw = readFileSync(CUSTOM_CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            this.customMetaCache.set(k, v);
          }
        }
      }
    } catch {}

    // Persist immediately to ensure file exists on disk
    this._persist();
  }

  _persistCustomMeta() {
    try {
      const obj = Object.fromEntries(this.customMetaCache.entries());
      writeFileSync(CUSTOM_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch {}
  }

  _persist() {
    try {
      let existing = {};
      try {
        const raw = readFileSync(CONFIG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') existing = parsed;
      } catch {}

      const data = {
        ...existing,
        tmdbApiKey: getTmdbApiKey(),
        addons: this.addons,
        homeCatalogSections: this.homeCatalogSections,
        updatedAt: new Date().toISOString()
      };
      writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('Could not save config to disk:', err.message);
    }
  }

  getConfig() {
    return {
      tmdbApiKey: getTmdbApiKey(),
      addons: this.list(),
      homeCatalogSections: this.homeCatalogSections,
    };
  }

  updateConfig({ tmdbApiKey, homeCatalogSections }) {
    if (typeof tmdbApiKey === 'string' && tmdbApiKey.trim()) {
      setTmdbApiKey(tmdbApiKey.trim());
    }
    if (Array.isArray(homeCatalogSections)) {
      this.homeCatalogSections = homeCatalogSections;
    }
    this._persist();
    return this.getConfig();
  }

  list() {
    return this.addons.map((addon) => ({ ...addon }));
  }

  add(addon) {
    const entry = {
      id: randomUUID(),
      name: addon.name?.trim() || addon.manifest?.name || new URL(addon.url).hostname,
      url: addon.url,
      enabled: true,
      builtin: false
    };
    this.addons.push(entry);
    if (addon.manifest) this.manifestCache.set(entry.id, addon.manifest);
    this.clearCaches();
    this._persist();
    return { ...entry };
  }

  remove(id) {
    const addon = this.addons.find((item) => item.id === id);
    if (!addon || addon.builtin) return false;
    this.addons = this.addons.filter((item) => item.id !== id);
    this.manifestCache.delete(id);
    this.clearCaches();
    this._persist();
    return true;
  }

  toggle(id) {
    const addon = this.addons.find((item) => item.id === id);
    if (!addon) return null;
    addon.enabled = !addon.enabled;
    this.clearCaches();
    this._persist();
    return { ...addon };
  }

  clearCaches() {
    this.catalogCache.clear();
    this.allCatalogsCache = null;
    this.allCatalogsCacheTime = 0;
  }

  async getManifest(addon) {
    if (addon.id === 'tmdb-builtin') {
      return {
        id: 'tmdb-builtin',
        name: 'TMDB (Official Database)',
        resources: ['catalog', 'meta'],
        types: ['movie', 'series'],
        catalogs: TMDB_CATALOG_DEFINITIONS.map(def => ({ ...def })),
        baseUrl: 'local://tmdb',
      };
    }

    if (this.manifestCache.has(addon.id)) return this.manifestCache.get(addon.id);

    const response = await fetchWithTimeout(addon.url, { headers: { accept: 'application/json' } }, 4500);
    if (!response.ok) throw new Error(`Addon manifest returned HTTP ${response.status}`);
    const manifest = await response.json();
    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.resources)) {
      throw new Error('Invalid Stremio addon manifest');
    }

    const enriched = { ...manifest, baseUrl: getBaseUrl(addon.url) };
    this.manifestCache.set(addon.id, enriched);
    return enriched;
  }

  async getAllCatalogs() {
    const now = Date.now();
    if (this.allCatalogsCache && (now - this.allCatalogsCacheTime < 300000)) {
      return this.allCatalogsCache;
    }

    const enabled = this.addons.filter((addon) => addon.enabled);

    // 1. Native TMDB Catalogs if tmdb-builtin is enabled
    const tmdbAddon = enabled.find((a) => a.id === 'tmdb-builtin');
    const tmdbCatalogs = tmdbAddon
      ? TMDB_CATALOG_DEFINITIONS.map((def) => ({
          addonId: 'tmdb-builtin',
          addonName: 'TMDB',
          baseUrl: 'local://tmdb',
          id: def.id,
          type: def.type,
          name: def.name,
        }))
      : [];

    // 2. Remote addons catalogs
    const remoteAddons = enabled.filter((a) => a.id !== 'tmdb-builtin');
    const results = await Promise.allSettled(remoteAddons.map(async (addon) => {
      const manifest = await this.getManifest(addon);
      return (manifest.catalogs || []).map((catalog) => ({
        addonId: addon.id,
        addonName: addon.name,
        baseUrl: manifest.baseUrl,
        ...catalog
      }));
    }));

    const remoteCatalogs = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    
    // 3. CloudStream active plugins catalogs
    const csCatalogs = [];
    if (cloudstreamManager.getMasterStatus()) {
      const activePlugins = cloudstreamManager.getActivePlugins();
      for (const p of activePlugins) {
        const tvTypes = Array.isArray(p.tvTypes) ? p.tvTypes : ['Movie', 'TvSeries'];
        const hasMovies = tvTypes.some((t) => /movie/i.test(t));
        const hasSeries = tvTypes.some((t) => /tv|series|drama|anime|show/i.test(t));

        if (hasMovies || !hasSeries) {
          csCatalogs.push({
            addonId: `cloudstream-${p.id}`,
            addonName: p.repoName ? `[CloudStream] ${p.repoName}` : `[CloudStream] ${p.name}`,
            groupName: p.repoName ? `CloudStream: ${p.repoName}` : `CloudStream: ${p.name}`,
            repoName: p.repoName || 'CloudStream',
            pluginName: p.name,
            id: `cs_${p.id}_movies`,
            type: 'movie',
            name: `${p.name} - Movies`,
            sourceType: 'cloudstream',
            pluginId: p.id,
            extra: [{ name: 'search', isRequired: false }]
          });
        }
        if (hasSeries) {
          csCatalogs.push({
            addonId: `cloudstream-${p.id}`,
            addonName: p.repoName ? `[CloudStream] ${p.repoName}` : `[CloudStream] ${p.name}`,
            groupName: p.repoName ? `CloudStream: ${p.repoName}` : `CloudStream: ${p.name}`,
            repoName: p.repoName || 'CloudStream',
            pluginName: p.name,
            id: `cs_${p.id}_series`,
            type: 'series',
            name: `${p.name} - TV Series`,
            sourceType: 'cloudstream',
            pluginId: p.id,
            extra: [{ name: 'search', isRequired: false }]
          });
        }
      }
    }

    // TMDB catalogs come first for highest reliability & beauty, followed by remote addons and CloudStream
    const all = [...tmdbCatalogs, ...remoteCatalogs, ...csCatalogs];
    this.allCatalogsCache = all;
    this.allCatalogsCacheTime = now;
    return all;
  }

  async getCatalog(addonId, type, catalogId, extra = {}) {
    const cacheKey = `${addonId}:${type}:${catalogId}:${JSON.stringify(extra)}`;
    const now = Date.now();
    const cached = this.catalogCache.get(cacheKey);
    if (cached && (now - cached.time < 300000)) {
      return cached.data;
    }

    // 1. If TMDB built-in catalog
    if (addonId === 'tmdb-builtin') {
      const page = extra.skip ? Math.floor(extra.skip / 20) + 1 : 1;
      const items = await fetchTmdbCatalog(type, catalogId, page);
      this.catalogCache.set(cacheKey, { data: items, time: now });
      return items;
    }

    // 2. CloudStream active plugin catalog
    if (addonId.startsWith('cloudstream-')) {
      const pluginId = addonId.replace(/^cloudstream-/, '');
      const items = await this.getCloudstreamCatalogItems(pluginId, type, catalogId, extra);
      this.catalogCache.set(cacheKey, { data: items, time: now });
      return items;
    }

    // 3. Remote Addon catalog
    const addon = this.addons.find((item) => item.id === addonId && item.enabled);
    if (!addon) throw new Error('Addon not found or disabled');
    const manifest = await this.getManifest(addon);
    const parameters = Object.entries(extra)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    const suffix = parameters.length ? `/${parameters.join('/')}` : '';
    const url = `${manifest.baseUrl}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(catalogId)}${suffix}.json`;
    
    const response = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, 5000);
    if (!response.ok) throw new Error(`Catalog request returned HTTP ${response.status}`);
    const data = await response.json();
    const metas = data.metas || [];

    this.catalogCache.set(cacheKey, { data: metas, time: now });
    return metas;
  }

  _resolveUrlFromId(id, prefix) {
    const cached = this.customMetaCache.get(id);
    if (cached?.href) return cached.href;
    const raw = id.replace(prefix, '');
    try {
      const decoded = Buffer.from(raw, 'base64url').toString('utf8');
      if (decoded.startsWith('http')) return decoded;
    } catch {}
    return null;
  }

  async scrapeXnxxCatalog(page = 1, searchQuery = '') {
    try {
      let targetUrl = 'https://www.txnhh.com/todays-selection';
      if (searchQuery && searchQuery.trim()) {
        targetUrl = `https://www.txnhh.com/search/${encodeURIComponent(searchQuery.trim())}/${page > 1 ? page - 1 : ''}`;
      } else if (page > 1) {
        targetUrl = `https://www.txnhh.com/todays-selection/${page - 1}`;
      }

      const res = await fetchWithTimeout(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }, 7000);
      if (!res.ok) return [];
      const html = await res.text();
      const blocks = html.split('<div id="video_');
      const items = [];
      for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i];
        const href = b.match(/<a href="(\/video-[^"]+)"/)?.[1];
        const poster = b.match(/data-src="([^"]+)"/)?.[1] || b.match(/src="([^"]+)"/)?.[1];
        const titleMatch = b.match(/<div class="thumb-under">[\s\S]*?<a [^>]*title="([^"]+)"/)?.[1] ||
                           b.match(/<div class="thumb-under">[\s\S]*?<a [^>]*>([^<]+)<\/a>/)?.[1];
        if (href && poster && titleMatch) {
          const title = decodeHtmlEntities(titleMatch.trim());
          const fullHref = href.startsWith('http') ? href : `https://www.txnhh.com${href}`;
          const b64Href = Buffer.from(fullHref).toString('base64url');
          const item = {
            id: `cs:xnxx:${b64Href}`,
            name: title,
            title: title,
            type: 'movie',
            poster: poster,
            background: poster,
            description: title,
            year: '2026',
            releaseInfo: 'HD',
            href: fullHref,
            genres: ['Adult', 'XNXX']
          };
          this.customMetaCache.set(item.id, item);
          items.push(item);
        }
      }
      this._persistCustomMeta();
      return items;
    } catch (err) {
      console.warn('XNXX scrape error:', err.message);
      return [];
    }
  }

  async scrapeXvideosCatalog(page = 1, searchQuery = '') {
    try {
      let targetUrl = 'https://www.xvideos.com/';
      if (searchQuery && searchQuery.trim()) {
        targetUrl = `https://www.xvideos.com/?k=${encodeURIComponent(searchQuery.trim())}&p=${page > 1 ? page - 1 : 0}`;
      } else if (page > 1) {
        targetUrl = `https://www.xvideos.com/new/${page - 1}`;
      }

      const res = await fetchWithTimeout(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      }, 7000);
      if (!res.ok) return [];
      const html = await res.text();
      const blocks = html.split('<div id="video_');
      const items = [];
      for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i];
        const hrefMatch = b.match(/href="(\/video[._0-9a-zA-Z]+\/[^"'\s<>]+)"/)?.[1] ||
                          b.match(/href="(\/prof-video-click\/[^"'\s<>]+)"/)?.[1];
        const poster = b.match(/data-src="([^"]+)"/)?.[1] || b.match(/src="([^"]+)"/)?.[1];
        const titleMatch = b.match(/<div class="thumb-under">[\s\S]*?<a [^>]*title="([^"]+)"/)?.[1] ||
                           b.match(/title="([^"]+)"/)?.[1] ||
                           b.match(/<div class="thumb-under">[\s\S]*?<a [^>]*>([^<]+)<\/a>/)?.[1];
        if (hrefMatch && poster && titleMatch) {
          const title = decodeHtmlEntities(titleMatch.trim());
          const fullHref = hrefMatch.startsWith('http') ? hrefMatch : `https://www.xvideos.com${hrefMatch}`;
          const b64Href = Buffer.from(fullHref).toString('base64url');
          const item = {
            id: `cs:xvideos:${b64Href}`,
            name: title,
            title: title,
            type: 'movie',
            poster: poster,
            background: poster,
            description: title,
            year: '2026',
            releaseInfo: 'HD',
            href: fullHref,
            genres: ['Adult', 'Xvideos']
          };
          this.customMetaCache.set(item.id, item);
          items.push(item);
        }
      }
      this._persistCustomMeta();
      return items;
    } catch (err) {
      console.warn('Xvideos scrape error:', err.message);
      return [];
    }
  }

  async scrapeJavCatalog(page = 1, searchQuery = '') {
    try {
      let targetUrl = `https://jav.guru/page/${page}/`;
      if (searchQuery && searchQuery.trim()) {
        targetUrl = `https://jav.guru/?s=${encodeURIComponent(searchQuery.trim())}`;
      }

      const res = await fetchWithTimeout(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://jav.guru/'
        }
      }, 7000);
      if (!res.ok) return [];
      const html = await res.text();
      const articleBlocks = html.split('<div class="inside-article">');
      const items = [];
      for (let i = 1; i < articleBlocks.length; i++) {
        const block = articleBlocks[i];
        const linkMatch = block.match(/href="(https:\/\/jav\.guru\/(\d+)\/[^"]+)"/);
        const imgMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/);
        if (linkMatch && imgMatch) {
          const rawTitle = imgMatch[2];
          const title = decodeHtmlEntities(rawTitle.trim());
          const poster = imgMatch[1];
          const href = linkMatch[1];
          const b64Href = Buffer.from(href).toString('base64url');
          const item = {
            id: `cs:jav:${b64Href}`,
            name: title,
            title: title,
            type: 'movie',
            poster: poster,
            background: poster,
            description: title,
            year: '2026',
            releaseInfo: 'JAV HD',
            href: href,
            genres: ['JAV', 'Adult']
          };
          this.customMetaCache.set(item.id, item);
          items.push(item);
        }
      }
      this._persistCustomMeta();
      return items;
    } catch (err) {
      console.warn('JAV scrape error:', err.message);
      return [];
    }
  }

  async scrapeEpornerCatalog(query = 'adult', page = 1) {
    try {
      const cleanQuery = encodeURIComponent(query.replace(/provider|addon|cs_|cloudstream-/gi, '').trim() || 'popular');
      const url = `https://www.eporner.com/api/v2/video/search/?query=${cleanQuery}&page=${page}&per_page=24&thumbsize=big&format=json`;
      const res = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, 7000);
      if (!res.ok) return [];
      const data = await res.json();
      const videos = data.videos || [];
      const items = [];
      for (const v of videos) {
        if (!v.id || !v.title) continue;
        const poster = v.default_thumb?.src || (v.thumbs && v.thumbs[0]?.src) || '';
        const embedUrl = v.embed || v.url || '';
        const b64Embed = Buffer.from(embedUrl).toString('base64url');
        const item = {
          id: `cs:eporner:${b64Embed}`,
          name: decodeHtmlEntities(v.title),
          title: decodeHtmlEntities(v.title),
          type: 'movie',
          poster: poster,
          background: poster,
          description: v.title,
          year: '2026',
          releaseInfo: `${v.views ? Math.round(v.views / 1000) + 'k views' : 'HD'}`,
          embed: embedUrl,
          url: v.url,
          genres: ['Adult', 'CloudStream']
        };
        this.customMetaCache.set(item.id, item);
        items.push(item);
      }
      this._persistCustomMeta();
      return items;
    } catch (err) {
      console.warn('Eporner scrape error:', err.message);
      return [];
    }
  }

  async getCloudstreamCatalogItems(pluginId, type, catalogId, extra = {}) {
    const plugin = cloudstreamManager.plugins.get(pluginId) ||
      cloudstreamManager.getActivePlugins().find((p) => p.id === pluginId || p.internalName === pluginId);

    const isTv = type === 'series' || type === 'tv';
    const page = extra.skip ? Math.floor(extra.skip / 20) + 1 : 1;
    const apiKey = getTmdbApiKey();

    const pName = (plugin?.name || pluginId || '').toLowerCase();
    const pRepo = (plugin?.repoName || '').toLowerCase();
    const pLang = (plugin?.language || '').toLowerCase();
    const pTypes = plugin?.tvTypes || [];

    // Deterministic hash to give each plugin a unique catalog seed & page
    const pluginHash = Array.from(pName + pluginId).reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const providerPage = ((pluginHash % 5) + 1);

    const isAdult = pName.includes('porn') || pName.includes('hentai') || pName.includes('cam4') ||
      pName.includes('xxx') || pName.includes('cxxx') || pName.includes('adult') ||
      pName.includes('jav') || pName.includes('perverzija') || pName.includes('actionview') ||
      pName.includes('desisins') || /cxxx|nsfw/i.test(pRepo);

    // If adult provider, fetch REAL items directly from the provider scrapers!
    if (isAdult) {
      if (pName.includes('xvideos')) {
        const xvItems = await this.scrapeXvideosCatalog(page, extra.search);
        if (xvItems.length > 0) return xvItems;
      } else if (pName.includes('xnxx')) {
        const xnxxItems = await this.scrapeXnxxCatalog(page, extra.search);
        if (xnxxItems.length > 0) return xnxxItems;
      } else if (pName.includes('javguru')) {
        const javItems = await this.scrapeJavCatalog(page, extra.search);
        if (javItems.length > 0) return javItems;
      } else if (pName.includes('javmost')) {
        const javItems = await this.scrapeJavCatalog(page + 1, extra.search || 'uncensored');
        if (javItems.length > 0) return javItems;
      } else if (pName.includes('superjav') || pName.includes('jav')) {
        const javItems = await this.scrapeJavCatalog(page + 2, extra.search || 'idol');
        if (javItems.length > 0) return javItems;
      }

      // Specialized niches for CXXX adult providers so each one is completely unique
      let tubeQuery = extra.search || '';
      if (!tubeQuery) {
        if (pName.includes('desi') || pName.includes('indian')) tubeQuery = 'indian';
        else if (pName.includes('hentai') || pName.includes('anime')) tubeQuery = 'hentai';
        else if (pName.includes('allporn')) tubeQuery = 'hd';
        else if (pName.includes('porn4fans')) tubeQuery = 'verified';
        else if (pName.includes('cam4')) tubeQuery = 'cam';
        else if (pName.includes('asian')) tubeQuery = 'asian';
        else {
          const adultKeywords = ['popular', 'hd', 'trending', 'top', 'new', 'viral', 'cinema'];
          tubeQuery = adultKeywords[pluginHash % adultKeywords.length];
        }
      }

      const tubeItems = await this.scrapeEpornerCatalog(tubeQuery, page);
      if (tubeItems.length > 0) return tubeItems;
    }

    if (extra.search && extra.search.trim()) {
      const q = encodeURIComponent(extra.search.trim());
      const url = `https://api.themoviedb.org/3/search/${isTv ? 'tv' : 'movie'}?api_key=${apiKey}&query=${q}&page=${page}`;
      const res = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, 7000);
      if (!res.ok) return [];
      const data = await res.json();
      return this.formatTmdbItems(data.results || [], isTv);
    }

    let discoverPath = `/discover/${isTv ? 'tv' : 'movie'}?`;

    // Tailor catalog queries uniquely to each specific provider so no two sections are duplicates!
    if (pName.includes('uhd') || pName.includes('fourk') || pName.includes('4k')) {
      // 4K Ultra HD blockbusters (Action, Sci-Fi, Adventure)
      discoverPath += `sort_by=popularity.desc&vote_count.gte=800&with_genres=28,878&page=${page}`;
    } else if (pName.includes('coflix') || pName.includes('french')) {
      // European / International Trending
      discoverPath += `sort_by=popularity.desc&with_origin_country=FR|GB|CA&page=${page}`;
    } else if (pName.includes('banglaplex') || pName.includes('dhaka') || pName.includes('bdix') || pName.includes('icc') || pName.includes('roar')) {
      // Bangla cinema & web series
      discoverPath += `with_original_language=bn&sort_by=popularity.desc&page=${((pluginHash % 3) + page)}`;
    } else if (pName.includes('cinefreak')) {
      // High-rated Mystery, Thriller & Cult Cinema
      discoverPath += `with_genres=53,9648&sort_by=vote_average.desc&vote_count.gte=300&page=${page}`;
    } else if (pName.includes('themoviesflix') || pName.includes('emw')) {
      // Dual Audio & Bollywood Hindi Cinema
      discoverPath += `with_original_language=hi&sort_by=popularity.desc&page=${((pluginHash % 2) + page)}`;
    } else if (pName.includes('hdhub') || pName.includes('desi') || pName.includes('bolly')) {
      // HDHub4u / Desi Cinema Trending
      discoverPath += `with_original_language=hi&sort_by=release_date.desc&vote_count.gte=20&page=${page}`;
    } else if (pName.includes('anime') || pTypes.includes('Anime') || pTypes.includes('AnimeMovie')) {
      // Japanese Anime
      discoverPath += `with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${((pluginHash % 4) + page)}`;
    } else if (pName.includes('cartoon') || pName.includes('toon')) {
      // Cartoons / Animation
      discoverPath += `with_genres=16&sort_by=popularity.desc&page=${page}`;
    } else if (pName.includes('kdrama') || pName.includes('asian') || pLang === 'ko' || pTypes.includes('AsianDrama')) {
      // Korean Drama / Asian Series
      discoverPath += `with_original_language=ko&sort_by=popularity.desc&page=${page}`;
    } else if (pName.includes('showbox') || pName.includes('superstream')) {
      // Top Box Office Grossing
      discoverPath += `sort_by=revenue.desc&vote_count.gte=500&page=${providerPage}`;
    } else {
      // General providers: use pluginHash to pick a distinct sort order and page offset
      const sorts = ['popularity.desc', 'revenue.desc', 'vote_average.desc', 'primary_release_date.desc'];
      const chosenSort = sorts[pluginHash % sorts.length];
      discoverPath += `sort_by=${chosenSort}&vote_count.gte=100&page=${providerPage}`;
    }

    const separator = discoverPath.includes('?') ? '&' : '?';
    const url = `https://api.themoviedb.org/3${discoverPath}${separator}api_key=${apiKey}`;
    const res = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, 7000);
    if (!res.ok) return [];
    const data = await res.json();
    return this.formatTmdbItems(data.results || [], isTv);
  }

  formatTmdbItems(results, isTv = false) {
    return (results || [])
      .filter((item) => item.poster_path || item.backdrop_path)
      .map((item) => ({
        id: `tmdb:${item.id}`,
        tmdbId: item.id,
        name: item.title || item.name || 'Untitled',
        type: (item.first_air_date !== undefined || isTv) ? 'series' : 'movie',
        poster: item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : `https://image.tmdb.org/t/p/w500${item.backdrop_path}`,
        background: item.backdrop_path
          ? `https://image.tmdb.org/t/p/original${item.backdrop_path}`
          : `https://image.tmdb.org/t/p/original${item.poster_path}`,
        description: item.overview || '',
        year: (item.release_date || item.first_air_date || '').slice(0, 4),
        releaseInfo: (item.release_date || item.first_air_date || '').slice(0, 4),
        imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
      }));
  }

  async getCustomMeta(type, id) {
    const cached = this.customMetaCache.get(id);
    if (cached) {
      return {
        id,
        name: cached.name,
        title: cached.name,
        type: cached.type || 'movie',
        poster: cached.poster,
        background: cached.background || cached.poster,
        description: cached.description || cached.name,
        year: cached.year || '2026',
        releaseInfo: cached.releaseInfo || 'HD',
        genres: cached.genres || ['Adult', 'CloudStream']
      };
    }

    if (id.startsWith('cs:eporner:')) {
      const raw = id.replace('cs:eporner:', '');
      let embedOrUrl = '';
      try {
        embedOrUrl = Buffer.from(raw, 'base64url').toString('utf8');
      } catch {}
      let videoId = '';
      const idMatch = embedOrUrl.match(/(?:embed\/|video-|hd-porn\/)([a-zA-Z0-9]+)/i);
      if (idMatch) videoId = idMatch[1];

      let cleanTitle = 'Eporner Video';
      let poster = '';

      // Try extracting title from slug if present
      const slugMatch = embedOrUrl.match(/video-[a-zA-Z0-9]+\/([^/]+)/);
      if (slugMatch) {
        cleanTitle = slugMatch[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      }

      if (videoId) {
        try {
          const res = await fetchWithTimeout(`https://www.eporner.com/video-${videoId}/`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          }, 4000);
          if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            const titleText = $('h1').first().text() || $('title').text();
            if (titleText) cleanTitle = titleText.replace(/ - EPORNER/i, '').trim();
            const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
            if (ogImage) poster = ogImage;
          }
        } catch {}
      }

      const meta = {
        id,
        name: cleanTitle,
        title: cleanTitle,
        type: 'movie',
        poster,
        background: poster,
        description: cleanTitle,
        year: '2026',
        releaseInfo: 'HD',
        genres: ['Adult', 'Eporner']
      };
      this.customMetaCache.set(id, meta);
      return meta;
    }

    if (id.startsWith('cs:jav:')) {
      const pageUrl = this._resolveUrlFromId(id, 'cs:jav:');
      let title = 'JAV Video';
      let poster = '';
      if (pageUrl) {
        try {
          const res = await fetchWithTimeout(pageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          }, 4000);
          if (res.ok) {
            const html = await res.text();
            const titleMatch = html.match(/<title>([^<]+)<\/title>/)?.[1];
            if (titleMatch) title = titleMatch.replace(/ - JAV.*$/i, '').trim();
            const posterMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1];
            if (posterMatch) poster = posterMatch;
          }
        } catch {}
      }
      return {
        id,
        name: title,
        title,
        type: 'movie',
        poster,
        background: poster,
        description: title,
        year: '2026',
        releaseInfo: 'JAV HD',
        genres: ['Adult', 'JAV']
      };
    }

    if (id.startsWith('cs:xnxx:') || id.startsWith('cs:xvideos:')) {
      const isXnxx = id.startsWith('cs:xnxx:');
      const prefix = isXnxx ? 'cs:xnxx:' : 'cs:xvideos:';
      const pageUrl = this._resolveUrlFromId(id, prefix);
      let title = isXnxx ? 'XNXX Video' : 'Xvideos Video';
      let poster = '';
      if (pageUrl) {
        try {
          const res = await fetchWithTimeout(pageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          }, 4000);
          if (res.ok) {
            const html = await res.text();
            const titleMatch = html.match(/<title>([^<]+)<\/title>/)?.[1];
            if (titleMatch) {
              title = decodeHtmlEntities(titleMatch.replace(/ - (?:XNXX\.COM|XVIDEOS\.COM)/i, '').trim());
            }
            const posterMatch = html.match(/data-src="([^"]+)"/)?.[1] ||
              html.match(/setThumbUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/)?.[1] ||
              html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1];
            if (posterMatch) poster = posterMatch;
          }
        } catch {}
      }
      const meta = {
        id,
        name: title,
        title,
        type: 'movie',
        poster,
        background: poster,
        description: title,
        year: '2026',
        releaseInfo: 'HD',
        href: pageUrl,
        genres: ['Adult', isXnxx ? 'XNXX' : 'Xvideos']
      };
      this.customMetaCache.set(id, meta);
      return meta;
    }

    let fallbackTitle = 'Adult Video';
    let fallbackPoster = '';
    try {
      const parts = id.split(':');
      if (parts.length >= 3) {
        const decoded = Buffer.from(parts[2], 'base64url').toString('utf8');
        const slug = decoded.split('/').filter(Boolean).pop() || '';
        if (slug) {
          fallbackTitle = slug.replace(/[-_]/g, ' ').replace(/\.html?/i, '').replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }
    } catch {}

    return {
      id,
      name: fallbackTitle,
      title: fallbackTitle,
      type: 'movie',
      poster: fallbackPoster,
      background: fallbackPoster,
      description: fallbackTitle,
      year: '2026',
      releaseInfo: 'HD',
      genres: ['Adult', 'CloudStream']
    };
  }

  async getCustomStreams(type, id) {
    const cached = this.customMetaCache.get(id);
    const streams = [];

    if (id.startsWith('cs:xnxx:') || id.startsWith('cs:xvideos:')) {
      const isXnxx = id.startsWith('cs:xnxx:');
      const providerTag = isXnxx ? 'XNXX' : 'Xvideos';
      const prefix = isXnxx ? 'cs:xnxx:' : 'cs:xvideos:';
      const pageUrl = this._resolveUrlFromId(id, prefix);

      if (pageUrl) {
        try {
          const res = await fetchWithTimeout(pageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': isXnxx ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/'
            }
          }, 6000);
          const html = await res.text();
          const hls = html.match(/setVideoHLS\s*\(\s*['"]([^'"]+)['"]\s*\)/i)?.[1];
          const high = html.match(/setVideoUrlHigh\s*\(\s*['"]([^'"]+)['"]\s*\)/i)?.[1];
          const low = html.match(/setVideoUrlLow\s*\(\s*['"]([^'"]+)['"]\s*\)/i)?.[1];

          if (hls) {
            streams.push({
              addonId: `cloudstream-${providerTag.toLowerCase()}`,
              addonName: `[CloudStream] ${providerTag}`,
              name: `[${providerTag}] Direct HLS ⚡`,
              title: `${cached?.name || providerTag + ' Video'}\n⚡ Fast Direct Stream (HLS)\n💾 Stream`,
              url: hls,
              behaviorHints: { notWebReady: false }
            });
          }
          if (high) {
            streams.push({
              addonId: `cloudstream-${providerTag.toLowerCase()}`,
              addonName: `[CloudStream] ${providerTag}`,
              name: `[${providerTag}] 720p HD MP4`,
              title: `${cached?.name || providerTag + ' Video'}\nDirect High Quality MP4\n💾 MP4 HD`,
              url: high,
              behaviorHints: { notWebReady: false }
            });
          }
          if (low && low !== high) {
            streams.push({
              addonId: `cloudstream-${providerTag.toLowerCase()}`,
              addonName: `[CloudStream] ${providerTag}`,
              name: `[${providerTag}] 360p SD MP4`,
              title: `${cached?.name || providerTag + ' Video'}\nFast Standard Quality MP4\n💾 MP4 SD`,
              url: low,
              behaviorHints: { notWebReady: false }
            });
          }
        } catch (err) {
          console.warn(`${providerTag} stream extraction error:`, err.message);
        }
      }
      return streams;
    }

    if (id.startsWith('cs:jav:')) {
      const pageUrl = this._resolveUrlFromId(id, 'cs:jav:');
      if (pageUrl) {
        try {
          const res = await fetchWithTimeout(pageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://jav.guru/'
            }
          }, 6000);
          const html = await res.text();
          const m = html.match(/var\s+[a-zA-Z0-9_]+\s*=\s*(\{"btn_class":[\s\S]*?\});/);
          if (m) {
            const parsed = JSON.parse(m[1]);
            if (parsed.iframe_url) {
              const embedUrl = Buffer.from(parsed.iframe_url, 'base64').toString('utf8');
              streams.push({
                addonId: 'cloudstream-JAVPoint',
                addonName: '[CloudStream] JAV',
                name: '[JAV] Full HD ⚡\nDirect Embed',
                title: `${cached?.name || 'JAV Movie'}\n⚡ JAV Fast Video Stream\n💾 Full HD`,
                url: embedUrl,
                behaviorHints: { notWebReady: false }
              });
            }
          }
        } catch (err) {
          console.warn('JAV stream extraction error:', err.message);
        }
      }
      return streams;
    }

    if (id.startsWith('cs:eporner:')) {
      let embedUrl = cached?.embed || cached?.url;
      if (!embedUrl) {
        const raw = id.replace('cs:eporner:', '');
        try {
          const decoded = Buffer.from(raw, 'base64url').toString('utf8');
          if (decoded.startsWith('http')) embedUrl = decoded;
        } catch {}
      }

      // Extract Eporner video ID
      let videoId = '';
      if (embedUrl) {
        const idMatch = embedUrl.match(/(?:embed\/|video-|hd-porn\/)([a-zA-Z0-9]+)/i);
        if (idMatch) videoId = idMatch[1];
      }

      // Fetch direct MP4 streams from video page
      if (videoId) {
        try {
          const pageRes = await fetchWithTimeout(`https://www.eporner.com/video-${videoId}/`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            }
          }, 6000);
          if (pageRes.ok) {
            const html = await pageRes.text();
            const $ = cheerio.load(html);
            $('a[href*="/dload/"]').each((i, el) => {
              const href = $(el).attr('href');
              const text = $(el).text().trim();
              if (!href) return;
              const qMatch = text.match(/(\d{3,4}p)/i);
              const quality = qMatch ? qMatch[1] : '720p';
              const sizeMatch = text.match(/([\d.]+\s*MB)/i);
              const size = sizeMatch ? sizeMatch[1] : '';
              const fullDload = `https://www.eporner.com${href}`;

              // Proxied stream for 100% reliable CORS & Range playback in web player
              const proxiedUrl = `/api/proxy/stream?url=${encodeURIComponent(fullDload)}`;

              streams.push({
                addonId: 'cloudstream-cxxx-eporner',
                addonName: '[CloudStream] Eporner (Direct)',
                name: `[Eporner] ${quality} MP4 Direct`,
                title: `${cached?.name || 'Adult Video'}\n⚡ Direct High-Speed Video Stream\n💾 ${quality} ${size ? `(${size})` : ''}`,
                url: proxiedUrl,
                externalUrl: fullDload,
                quality,
                size,
                description: `Eporner • Direct MP4 • ${size || quality}`,
                behaviorHints: { notWebReady: false }
              });
            });
          }
        } catch (err) {
          console.warn('Eporner direct stream extraction error:', err.message);
        }
      }

      // Fallback embed stream
      if (embedUrl) {
        streams.push({
          addonId: 'cloudstream-CXXX',
          addonName: '[CloudStream] Adult Stream',
          name: '[CXXX] Web Embed ⚡\nOnline Player',
          title: `${cached?.name || 'Adult Video'}\n⚡ Web Embed Mirror\n💾 HD Video`,
          url: embedUrl,
          behaviorHints: { notWebReady: false }
        });
      }
      return streams;
    }

    return streams;
  }

  async getMeta(type, id) {
    // 0. If IPTV channel
    if (String(id).startsWith('iptv:')) {
      const ch = iptvManager.channels.find((c) => c.id === id || c.id === `iptv:${id}`);
      if (ch) {
        return {
          id: ch.id,
          name: ch.name,
          title: ch.name,
          type: 'tv',
          poster: ch.logo,
          background: ch.logo,
          description: `Live TV Channel (${ch.group || 'IPTV'})`,
          genres: ['Live TV', ch.group || 'IPTV'],
          isLive: true
        };
      }
    }

    // 1. If custom scraped CloudStream id (cs:...)
    if (String(id).startsWith('cs:')) {
      return await this.getCustomMeta(type, id);
    }

    // 2. If TMDB id
    if (String(id).startsWith('tmdb:')) {
      return await fetchTmdbMeta(type, id);
    }

    // 3. Query enabled addons with meta resource
    const enabled = this.addons.filter((addon) => addon.enabled && addon.id !== 'tmdb-builtin');
    const results = await Promise.allSettled(enabled.map(async (addon) => {
      const manifest = await this.getManifest(addon);
      if (!manifest.resources.some((resource) => resourceName(resource) === 'meta')) return null;
      const response = await fetchWithTimeout(
        `${manifest.baseUrl}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`,
        { headers: { accept: 'application/json' } },
        5000
      );
      if (!response.ok) throw new Error(`Metadata request returned HTTP ${response.status}`);
      return (await response.json()).meta || null;
    }));

    const found = results.find((result) => result.status === 'fulfilled' && result.value)?.value;
    if (found) {
      if (Array.isArray(found.videos) && found.videos.length > 0 && (!found.seasons || found.seasons.length === 0)) {
        const seasonMap = new Map();
        for (const v of found.videos) {
          const sNum = v.season === undefined ? 1 : v.season;
          if (!seasonMap.has(sNum)) {
            seasonMap.set(sNum, {
              seasonNumber: sNum,
              name: `Season ${sNum}`,
              episodeCount: 0
            });
          }
          seasonMap.get(sNum).episodeCount++;
        }
        found.seasons = Array.from(seasonMap.values()).sort((a, b) => a.seasonNumber - b.seasonNumber);
        found.totalSeasons = found.seasons.length;
      }
      return found;
    }

    // 4. Fallback to TMDB if id is numeric or IMDb ID (tt...)
    return await fetchTmdbMeta(type, id);
  }

  async getStreams(type, id) {
    // 0. If IPTV channel
    if (String(id).startsWith('iptv:')) {
      const iptvStream = iptvManager.getChannelStream(id);
      return iptvStream ? [iptvStream] : [];
    }

    // 1. If custom scraped CloudStream id (cs:...)
    if (String(id).startsWith('cs:')) {
      return await this.getCustomStreams(type, id);
    }

    // If id is tmdb:..., resolve to IMDb ID for stream lookup
    let streamId = String(id);
    let seasonNum = null;
    let episodeNum = null;

    let baseTmdb = null;
    if (streamId.startsWith('tmdb:')) {
      const parts = streamId.split(':');
      baseTmdb = parts[1];
      if (parts.length >= 4) {
        seasonNum = parts[2];
        episodeNum = parts[3];
      }
    } else if (/^\d+$/.test(streamId)) {
      baseTmdb = streamId;
    }

    if (baseTmdb) {
      const imdb = await resolveImdbId(type, baseTmdb);
      if (imdb) {
        streamId = (seasonNum && episodeNum) ? `${imdb}:${seasonNum}:${episodeNum}` : imdb;
      }
    }

    // If still not an IMDb ID (tt...), try to resolve from metadata
    if (!streamId.startsWith('tt')) {
      try {
        const meta = await this.getMeta(type, id);
        const resolvedImdb = meta?.imdb_id || meta?.imdbId;
        if (resolvedImdb) {
          streamId = (seasonNum && episodeNum) ? `${resolvedImdb}:${seasonNum}:${episodeNum}` : resolvedImdb;
        }
      } catch {}
    }

    const enabled = this.addons.filter((addon) => addon.enabled && addon.id !== 'tmdb-builtin' && addon.id !== 'torrentio');
    const results = await Promise.allSettled(enabled.map(async (addon) => {
      const manifest = await this.getManifest(addon);
      if (!manifest.resources.some((resource) => resourceName(resource) === 'stream')) return [];
      const response = await fetchWithTimeout(
        `${manifest.baseUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(streamId)}.json`,
        {
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        },
        7000
      );
      if (!response.ok) throw new Error(`Stream request returned HTTP ${response.status}`);
      const streams = (await response.json()).streams || [];
      return streams.map((stream) => ({ ...stream, addonName: addon.name, addonId: addon.id }));
    }));

    const rawStreams = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);

    // COMPLETELY PURGE ALL TORRENT & MAGNET STREAMS
    // User requirement: "torrent server bad daw ekebare" (Drop all torrent servers).
    // Browsers cannot play torrents without debrid torrent cache. Direct streams only!
    const isTorrentStream = (s) => (
      s?.isTorrent ||
      s?.infoHash ||
      (typeof s?.url === 'string' && s.url.startsWith('magnet:')) ||
      (typeof s?.externalUrl === 'string' && s.externalUrl.startsWith('magnet:')) ||
      s?.name?.toLowerCase().includes('torrentio') ||
      s?.addonName?.toLowerCase().includes('torrentio')
    );

    // Filter out torrents, magnets, and donation/spam links
    const validAddonStreams = rawStreams.filter((s) => {
      if (!s) return false;
      if (isTorrentStream(s)) return false;
      if (!s.url && !s.externalUrl) return false;
      const fullText = `${s.name || ''} ${s.title || ''} ${s.externalUrl || ''}`.toLowerCase();
      if (fullText.includes('donate') || fullText.includes('support the project') || fullText.includes('tap to donate')) {
        return false;
      }
      return true;
    }).map((s) => {
      // Extract file size and quality like Bous extension
      const fullText = `${s.name || ''} ${s.title || ''} ${s.description || ''}`;
      const sizeMatch = fullText.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|GiB|MiB))/i);
      if (sizeMatch && !s.size) {
        s.size = sizeMatch[1].toUpperCase();
      }
      const qMatch = fullText.match(/(4K|2160p|1080p|720p|480p)/i);
      if (qMatch && !s.quality) {
        s.quality = qMatch[1].toUpperCase();
      }

      // Filter out micro-fragment fake streams (e.g. PenguPlay DASH chunks of 1-7 MB for a full movie)
      if (type === 'movie' && s.size) {
        const mbMatch = s.size.match(/([\d.]+)\s*MB/i);
        if (mbMatch && parseFloat(mbMatch[1]) < 100) {
          return null; // Skip fragments under 100 MB for movies
        }
      }

      // If stream requires proxy headers (like Referer or Cookie for Cinejoy, MovieBox, etc.)
      if (s.url && s.behaviorHints?.proxyHeaders?.request) {
        const headersJson = JSON.stringify(s.behaviorHints.proxyHeaders.request);
        const proxiedUrl = `/api/proxy/stream?url=${encodeURIComponent(s.url)}&headers=${encodeURIComponent(headersJson)}`;
        return {
          ...s,
          rawUrl: s.url,
          url: proxiedUrl,
          proxied: true
        };
      }
      return s;
    }).filter(Boolean);

    // Also query active CloudStream providers (e.g. BDIX, TheMoviesFlix, HDHub4u, etc.)
    try {
      const meta = await this.getMeta(type, id);
      if (meta?.name) {
        let tmdbId = meta.tmdbId ? String(meta.tmdbId) : '';
        let imdbId = meta.imdb_id || meta.imdbId || '';
        let season = 1;
        let episode = 1;

        const idStr = String(id);
        const parts = idStr.split(':');
        if (idStr.startsWith('tmdb:')) {
          tmdbId = parts[1];
          if (parts.length >= 4) {
            season = parseInt(parts[2], 10) || 1;
            episode = parseInt(parts[3], 10) || 1;
          }
        } else if (idStr.startsWith('tt')) {
          imdbId = parts[0];
          if (parts.length >= 3) {
            season = parseInt(parts[1], 10) || 1;
            episode = parseInt(parts[2], 10) || 1;
          }
        } else if (/^\d+$/.test(idStr)) {
          tmdbId = idStr;
        }

        // If neither tmdbId nor imdbId is available, search TMDB by title
        if (!tmdbId && !imdbId) {
          const tmdbSearch = await searchTmdbId(meta.name, type);
          if (tmdbSearch?.tmdbId) {
            tmdbId = tmdbSearch.tmdbId;
          }
        }

        // If we have tmdbId but not imdbId, try to resolve imdbId
        if (!imdbId && tmdbId) {
          try {
            const resolved = await resolveImdbId(type, tmdbId);
            if (resolved) imdbId = resolved;
          } catch {}
        }

        const csStreams = await cloudstreamManager.getStreams(meta.name, meta.year, type, {
          id,
          tmdbId,
          imdbId,
          season,
          episode
        });
        if (csStreams && csStreams.length > 0) {
          validAddonStreams.push(...csStreams);
        }
      }
    } catch (err) {
      // Non-fatal if cloudstream scraper encounters network issue
    }

    // Sort streams: Direct playable streams (HLS, MP4, HTTP streaming) first
    validAddonStreams.sort((a, b) => {
      const aIsDirect = Boolean(a.url && (a.url.includes('.m3u8') || a.url.includes('.mp4') || a.url.includes('/api/proxy/stream') || a.url.includes('httpstreaming') || a.url.includes('pengu.uk') || a.url.includes('sooti.info') || a.url.includes('thevolecitor')));
      const bIsDirect = Boolean(b.url && (b.url.includes('.m3u8') || b.url.includes('.mp4') || b.url.includes('/api/proxy/stream') || b.url.includes('httpstreaming') || b.url.includes('pengu.uk') || b.url.includes('sooti.info') || b.url.includes('thevolecitor')));
      if (aIsDirect && !bIsDirect) return -1;
      if (!aIsDirect && bIsDirect) return 1;
      return 0;
    });

    return validAddonStreams;
  }
}
