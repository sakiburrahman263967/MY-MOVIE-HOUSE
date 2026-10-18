import fetch from 'node-fetch';

let activeTmdbApiKey = process.env.TMDB_API_KEY || '1cf50e6248dc270629e802686245c2c8';
const TMDB_BASE = 'https://api.themoviedb.org/3';

export function setTmdbApiKey(key) {
  if (key && typeof key === 'string' && key.trim()) {
    activeTmdbApiKey = key.trim();
    cache.clear();
  }
}

export function getTmdbApiKey() {
  return activeTmdbApiKey;
}

export async function validateTmdbKey(key) {
  if (!key || typeof key !== 'string' || key.trim().length < 10) {
    return false;
  }
  try {
    const res = await fetch(`${TMDB_BASE}/configuration?api_key=${encodeURIComponent(key.trim())}`, { timeout: 6000 });
    return res.ok;
  } catch {
    return false;
  }
}

// In-memory cache for fast response times
const cache = new Map();

// Built-in Native TMDB Catalogs
export const TMDB_CATALOG_DEFINITIONS = [
  { id: 'tmdb_trending_movies', type: 'movie', name: 'TMDB Trending Movies', path: '/trending/movie/week' },
  { id: 'tmdb_popular_movies',  type: 'movie', name: 'TMDB Popular Movies',  path: '/movie/popular' },
  { id: 'tmdb_toprated_movies', type: 'movie', name: 'TMDB Top Rated Movies', path: '/movie/top_rated' },
  { id: 'tmdb_upcoming_movies', type: 'movie', name: 'TMDB Upcoming Movies', path: '/movie/upcoming' },
  { id: 'tmdb_trending_series', type: 'series', name: 'TMDB Trending Series', path: '/trending/tv/week' },
  { id: 'tmdb_popular_series',  type: 'series', name: 'TMDB Popular Series',  path: '/tv/popular' },
  { id: 'tmdb_toprated_series', type: 'series', name: 'TMDB Top Rated Series', path: '/tv/top_rated' },
  { id: 'tmdb_action_movies',   type: 'movie', name: 'Action & Adventure', path: '/discover/movie?with_genres=28,12&sort_by=popularity.desc' },
  { id: 'tmdb_scifi_movies',    type: 'movie', name: 'Sci-Fi & Fantasy',    path: '/discover/movie?with_genres=878,14&sort_by=popularity.desc' },
  { id: 'tmdb_animation',       type: 'movie', name: 'Animation & Family',  path: '/discover/movie?with_genres=16,10751&sort_by=popularity.desc' },
  { id: 'tmdb_hindi_cinema',    type: 'movie', name: 'Bollywood & Hindi Cinema', path: '/discover/movie?with_original_language=hi&sort_by=popularity.desc' },
  { id: 'tmdb_kdrama_series',   type: 'series', name: 'K-Drama & Korean Series', path: '/discover/tv?with_original_language=ko&sort_by=popularity.desc' },
  { id: 'tmdb_anime_series',    type: 'series', name: 'Anime Series',       path: '/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc' },
];

export async function fetchTmdbCatalog(type, catalogId, page = 1) {
  const def = TMDB_CATALOG_DEFINITIONS.find((c) => c.id === catalogId);
  if (!def) return [];

  const cacheKey = `catalog:${catalogId}:${page}:${activeTmdbApiKey}`;
  const now = Date.now();
  if (cache.has(cacheKey)) {
    const entry = cache.get(cacheKey);
    if (now - entry.time < 300000) { // 5 min cache
      return entry.data;
    }
  }

  try {
    const separator = def.path.includes('?') ? '&' : '?';
    const url = `${TMDB_BASE}${def.path}${separator}api_key=${activeTmdbApiKey}&page=${page}`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, timeout: 7000 });
    if (!res.ok) throw new Error(`TMDB returned HTTP ${res.status}`);
    const data = await res.json();
    const results = data.results || [];

    const isTv = def.type === 'series' || def.path.includes('/tv');
    const items = results
      .filter((item) => item.poster_path || item.backdrop_path)
      .map((item) => ({
        id: `tmdb:${item.id}`,
        tmdbId: item.id,
        name: item.title || item.name || 'Untitled',
        type: isTv ? 'series' : 'movie',
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

    cache.set(cacheKey, { data: items, time: now });
    return items;
  } catch (err) {
    console.error(`Failed to fetch TMDB catalog ${catalogId}:`, err.message);
    return [];
  }
}

// Fetch single TMDB metadata (cast, director, backdrop, genres)
export async function fetchTmdbMeta(type, tmdbId) {
  const normId = String(tmdbId).replace(/^tmdb:/, '');
  const isTv = type === 'series' || type === 'tv';
  const tmdbType = isTv ? 'tv' : 'movie';
  const cacheKey = `meta:${tmdbType}:${normId}:${activeTmdbApiKey}`;

  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const url = `${TMDB_BASE}/${tmdbType}/${normId}?api_key=${activeTmdbApiKey}&append_to_response=credits,external_ids,videos`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, timeout: 7000 });
    if (!res.ok) return null;
    const data = await res.json();

    const cast = (data.credits?.cast || []).slice(0, 15).map((c) => ({
      name: c.name,
      character: c.character,
      photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    }));

    const directors = (data.credits?.crew || [])
      .filter((c) => c.job === 'Director')
      .map((c) => c.name);

    const imdbId = data.external_ids?.imdb_id || null;

    const formatted = {
      id: imdbId || `tmdb:${data.id}`,
      imdb_id: imdbId,
      tmdbId: data.id,
      name: data.title || data.name,
      type: isTv ? 'series' : 'movie',
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
      background: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null,
      description: data.overview,
      year: (data.release_date || data.first_air_date || '').slice(0, 4),
      releaseInfo: (data.release_date || data.first_air_date || '').slice(0, 4),
      runtime: data.runtime ? `${data.runtime} min` : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]} min` : null),
      imdbRating: data.vote_average ? data.vote_average.toFixed(1) : null,
      genres: (data.genres || []).map((g) => g.name),
      cast,
      director: directors,
      seasons: (data.seasons || [])
        .filter((s) => s.season_number > 0 || (s.season_number === 0 && s.episode_count > 0))
        .map((s) => ({
          seasonNumber: s.season_number,
          name: s.name || `Season ${s.season_number}`,
          episodeCount: s.episode_count || 0,
          poster: s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : null,
          airDate: s.air_date ? s.air_date.slice(0, 4) : ''
        })),
      totalSeasons: data.number_of_seasons || (data.seasons ? data.seasons.length : 0),
      totalEpisodes: data.number_of_episodes || 0,
    };

    cache.set(cacheKey, formatted);
    return formatted;
  } catch (err) {
    console.error(`Failed to fetch TMDB meta for ${tmdbId}:`, err.message);
    return null;
  }
}

export async function fetchTmdbSeasonEpisodes(tmdbId, seasonNumber = 1) {
  let normId = String(tmdbId).replace(/^tmdb:/, '');
  const apiKey = getTmdbApiKey();

  // If ID is an IMDb ID (e.g. tt0401916 for CID)
  if (normId.startsWith('tt')) {
    try {
      const findRes = await fetch(`${TMDB_BASE}/find/${normId}?api_key=${apiKey}&external_source=imdb_id`, {
        headers: { accept: 'application/json' },
        timeout: 5000
      });
      if (findRes.ok) {
        const findData = await findRes.json();
        if (findData.tv_results && findData.tv_results.length > 0) {
          normId = String(findData.tv_results[0].id);
        }
      }
    } catch {}
  }

  // If still not numeric, cannot query TMDB tv season directly
  if (!/^\d+$/.test(normId)) {
    return [];
  }

  const cacheKey = `episodes:${normId}:${seasonNumber}:${apiKey}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const url = `${TMDB_BASE}/tv/${normId}/season/${seasonNumber}?api_key=${apiKey}`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, timeout: 8000 });
    if (!res.ok) return [];
    const data = await res.json();
    const episodes = (data.episodes || []).map((ep) => ({
      id: `tmdb:${normId}:${seasonNumber}:${ep.episode_number}`,
      episodeNumber: ep.episode_number,
      seasonNumber: ep.season_number || seasonNumber,
      name: ep.name || `Episode ${ep.episode_number}`,
      overview: ep.overview || '',
      stillPath: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null,
      airDate: ep.air_date || '',
      runtime: ep.runtime ? `${ep.runtime} min` : null,
      voteAverage: ep.vote_average ? ep.vote_average.toFixed(1) : null
    }));
    cache.set(cacheKey, episodes);
    return episodes;
  } catch (err) {
    console.error(`Failed to fetch season episodes for tv ${normId} s${seasonNumber}:`, err.message);
    return [];
  }
}

const PLATFORM_CONFIGS = {
  // Global
  'netflix': { providerId: '8', region: 'US', network: '213' },
  'amazon prime video': { providerId: '9', region: 'US', network: '1024' },
  'prime': { providerId: '9', region: 'US', network: '1024' },
  'hbo max': { providerId: '384', region: 'US', network: '3186' },
  'hbo': { providerId: '384', region: 'US', network: '3186' },
  'disney+': { providerId: '337', region: 'US', network: '2739' },
  'disney': { providerId: '337', region: 'US', network: '2739' },
  'apple tv+': { providerId: '350', region: 'US', network: '2552' },
  'apple': { providerId: '350', region: 'US', network: '2552' },
  'paramount+': { providerId: '531', region: 'US', network: '4330' },
  'paramount': { providerId: '531', region: 'US', network: '4330' },
  'hulu': { providerId: '15', region: 'US', network: '453' },
  'peacock': { providerId: '386', region: 'US', network: '3353' },
  'youtube premium': { providerId: '188', region: 'US' },
  'ytpremium': { providerId: '188', region: 'US' },

  // India
  'jiohotstar': { providerId: '122|220', region: 'IN' },
  'sonyliv': { providerId: '237', region: 'IN', network: '3919' },
  'zee5': { providerId: '232', region: 'IN' },
  'hoichoi (bengali)': { providerId: '315', region: 'IN', query: 'Hoichoi' },
  'hoichoi-in': { providerId: '315', region: 'IN', query: 'Hoichoi' },
  'aha': { providerId: '532', region: 'IN' },
  'aha (telugu/south)': { providerId: '532', region: 'IN' },
  'sun nxt': { providerId: '309', region: 'IN' },
  'sunnxt': { providerId: '309', region: 'IN' },
  'mx player': { providerId: '175', region: 'IN' },
  'mxplayer': { providerId: '175', region: 'IN' },
  'lionsgate play': { providerId: '480', region: 'IN' },
  'lionsgate': { providerId: '480', region: 'IN' },
  'manoramamax': { query: 'Malayalam' },
  'manorama': { query: 'Malayalam' },
  'eros now': { providerId: '218', region: 'IN' },
  'erosnow': { providerId: '218', region: 'IN' },

  // Bangladesh
  'hoichoi bd': { query: 'Hoichoi', originalLanguage: 'bn' },
  'hoichoi-bd': { query: 'Hoichoi', originalLanguage: 'bn' },
  'bongo bd': { query: 'Bongo', originalLanguage: 'bn' },
  'bongobd': { query: 'Bongo', originalLanguage: 'bn' },
  'chorki': { query: 'Chorki', originalLanguage: 'bn' },
  'bioscope': { originalLanguage: 'bn', query: 'Bengali' },
  'toffee': { originalLanguage: 'bn', query: 'Bangladeshi' },
  'binge': { query: 'Binge', originalLanguage: 'bn' },
  'iscreen': { originalLanguage: 'bn' },
  'deeptoplay': { query: 'Deepto', originalLanguage: 'bn' },
  'cinematic': { originalLanguage: 'bn' },

  // Pakistan
  'netflix pakistan': { providerId: '8', region: 'PK' },
  'netflix-pk': { providerId: '8', region: 'PK' },
  'tamasha': { originalLanguage: 'ur', query: 'Pakistani' },
  'tapmad': { originalLanguage: 'ur', query: 'Urdu' },
  'urduflix': { originalLanguage: 'ur', query: 'Urdu' },
  'mjunoon': { originalLanguage: 'ur', query: 'Pakistani' },
  'mjunoon.tv': { originalLanguage: 'ur', query: 'Pakistani' },
  'shoq': { originalLanguage: 'ur', query: 'Pakistani' },
  'vidly': { originalLanguage: 'ur', query: 'Lollywood' },
  'vidly.tv': { originalLanguage: 'ur', query: 'Lollywood' },
  'ary zap': { query: 'ARY Digital', originalLanguage: 'ur' },
  'aryzap': { query: 'ARY Digital', originalLanguage: 'ur' },
  'harpal geo': { query: 'Geo TV', originalLanguage: 'ur' },
  'harpalgeo': { query: 'Geo TV', originalLanguage: 'ur' },
  'iflix': { providerId: '21' },

  // Adult / Bold / Softcore Platforms
  'ullu': { networks: '2902', companies: '134066', includeAdult: true },
  'altt': { networks: '2112', companies: '109229', includeAdult: true },
  'altt (altbalaji)': { networks: '2112', companies: '109229', includeAdult: true },
  'altbalaji': { networks: '2112', companies: '109229', includeAdult: true },
  'vivamax': { companies: '149142', includeAdult: true },
  'kooku': { companies: '148435', includeAdult: true },
  'desiflix': { companies: '134066|148435|157152', includeAdult: true },
  'neonx vip': { companies: '134066|148435', keywords: '256466|155477', includeAdult: true },
  'neonxvip': { companies: '134066|148435', keywords: '256466|155477', includeAdult: true },
  'moodx': { keywords: '256466|155477', includeAdult: true },
  'hotx vip': { keywords: '256466|155477|362757', includeAdult: true },
  'hotxvip': { keywords: '256466|155477|362757', includeAdult: true },
  'hulchul': { query: 'Hulchul', keywords: '256466|155477', includeAdult: true },
  'prime flix': { companies: '160230|157152', includeAdult: true },
  'primeflix': { companies: '160230|157152', includeAdult: true },
  'nueflicks': { companies: '149989', includeAdult: true },
  'nuefliks': { companies: '149989', includeAdult: true },
  'boomex': { companies: '157152|134066', keywords: '256466', includeAdult: true },
  'showx': { keywords: '256466|155477', includeAdult: true },
  'faphouse': { keywords: '256466|155477', companies: '114045', includeAdult: true },
  'adult time': { companies: '114045', keywords: '256466', includeAdult: true },
  'adulttime': { companies: '114045', keywords: '256466', includeAdult: true }
};

export async function fetchPlatformContent(platformName, options = {}) {
  const normKey = (platformName || '').toLowerCase().trim();
  const optId = (options.id || '').toLowerCase().trim();
  const category = (options.category || '').toLowerCase().trim();
  const isAdultCategory = category === 'adult' || normKey.includes('adult') || normKey.includes('18+');

  const cacheKey = `platform:${normKey}:${optId}:${category}:${activeTmdbApiKey}`;
  const now = Date.now();

  if (cache.has(cacheKey)) {
    const entry = cache.get(cacheKey);
    if (now - entry.time < 600000) { // 10 minutes cache
      return entry.data;
    }
  }

  // Look up config by name or id
  const config = PLATFORM_CONFIGS[normKey] || PLATFORM_CONFIGS[optId] || {};
  const includeAdult = config.includeAdult || isAdultCategory;
  let results = [];

  try {
    if (config.providerId) {
      const regionParam = config.region ? `&watch_region=${config.region}` : '';
      const movieUrl = `${TMDB_BASE}/discover/movie?api_key=${activeTmdbApiKey}&with_watch_providers=${encodeURIComponent(config.providerId)}${regionParam}&sort_by=popularity.desc&page=1`;
      const tvUrl = `${TMDB_BASE}/discover/tv?api_key=${activeTmdbApiKey}&with_watch_providers=${encodeURIComponent(config.providerId)}${regionParam}&sort_by=popularity.desc&page=1`;

      const [movieRes, tvRes] = await Promise.allSettled([
        fetch(movieUrl).then((r) => r.json()),
        fetch(tvUrl).then((r) => r.json())
      ]);

      const movieItems = (movieRes.status === 'fulfilled' && movieRes.value?.results) || [];
      const tvItems = (tvRes.status === 'fulfilled' && tvRes.value?.results) || [];

      const combined = [];
      const maxLen = Math.max(movieItems.length, tvItems.length);
      for (let i = 0; i < maxLen; i++) {
        if (movieItems[i]) combined.push({ ...movieItems[i], media_type: 'movie' });
        if (tvItems[i]) combined.push({ ...tvItems[i], media_type: 'series' });
      }
      results = combined;
    } else if (config.companies || config.networks || config.keywords) {
      let movieUrl = `${TMDB_BASE}/discover/movie?api_key=${activeTmdbApiKey}&sort_by=popularity.desc&page=1`;
      let tvUrl = `${TMDB_BASE}/discover/tv?api_key=${activeTmdbApiKey}&sort_by=popularity.desc&page=1`;

      if (includeAdult) {
        movieUrl += '&include_adult=true';
        tvUrl += '&include_adult=true';
      }
      if (config.companies) {
        movieUrl += `&with_companies=${encodeURIComponent(config.companies)}`;
        tvUrl += `&with_companies=${encodeURIComponent(config.companies)}`;
      }
      if (config.networks) {
        tvUrl += `&with_networks=${encodeURIComponent(config.networks)}`;
      }
      if (config.keywords) {
        movieUrl += `&with_keywords=${encodeURIComponent(config.keywords)}`;
        tvUrl += `&with_keywords=${encodeURIComponent(config.keywords)}`;
      }

      const [movieRes, tvRes] = await Promise.allSettled([
        fetch(movieUrl).then((r) => r.json()),
        fetch(tvUrl).then((r) => r.json())
      ]);

      const movieItems = (movieRes.status === 'fulfilled' && movieRes.value?.results) || [];
      const tvItems = (tvRes.status === 'fulfilled' && tvRes.value?.results) || [];

      const combined = [];
      const maxLen = Math.max(movieItems.length, tvItems.length);
      for (let i = 0; i < maxLen; i++) {
        if (movieItems[i]) combined.push({ ...movieItems[i], media_type: 'movie' });
        if (tvItems[i]) combined.push({ ...tvItems[i], media_type: 'series' });
      }
      results = combined;
    } else {
      const queryStr = config.query || platformName;
      const adultParam = includeAdult ? '&include_adult=true' : '';
      const searchUrl = `${TMDB_BASE}/search/multi?api_key=${activeTmdbApiKey}&query=${encodeURIComponent(queryStr)}${adultParam}&page=1`;
      const res = await fetch(searchUrl);
      const data = await res.json();
      results = (data.results || []).filter(item => item.media_type === 'movie' || item.media_type === 'tv');
    }

    // Fallback: If results are too low and platform belongs to a specific category
    if (results.length < 3) {
      if (isAdultCategory) {
        const fallbackUrlM = `${TMDB_BASE}/discover/movie?api_key=${activeTmdbApiKey}&with_keywords=256466|155477|298666&include_adult=true&sort_by=popularity.desc&page=1`;
        const fallbackUrlT = `${TMDB_BASE}/discover/tv?api_key=${activeTmdbApiKey}&with_keywords=256466|155477&include_adult=true&sort_by=popularity.desc&page=1`;
        const [mRes, tRes] = await Promise.allSettled([
          fetch(fallbackUrlM).then(r => r.json()),
          fetch(fallbackUrlT).then(r => r.json())
        ]);
        const mItems = (mRes.status === 'fulfilled' && mRes.value?.results) || [];
        const tItems = (tRes.status === 'fulfilled' && tRes.value?.results) || [];
        results = [
          ...mItems.map(x => ({ ...x, media_type: 'movie' })),
          ...tItems.map(x => ({ ...x, media_type: 'series' }))
        ];
      } else if (category === 'bd' || config.originalLanguage === 'bn') {
        const bnMovieUrl = `${TMDB_BASE}/discover/movie?api_key=${activeTmdbApiKey}&with_original_language=bn&sort_by=popularity.desc&page=1`;
        const bnTvUrl = `${TMDB_BASE}/discover/tv?api_key=${activeTmdbApiKey}&with_original_language=bn&sort_by=popularity.desc&page=1`;
        const [mRes, tRes] = await Promise.allSettled([
          fetch(bnMovieUrl).then(r => r.json()),
          fetch(bnTvUrl).then(r => r.json())
        ]);
        const mItems = (mRes.status === 'fulfilled' && mRes.value?.results) || [];
        const tItems = (tRes.status === 'fulfilled' && tRes.value?.results) || [];
        results = [
          ...mItems.map(x => ({ ...x, media_type: 'movie' })),
          ...tItems.map(x => ({ ...x, media_type: 'series' }))
        ];
      } else if (category === 'pk' || config.originalLanguage === 'ur') {
        const pkTvUrl = `${TMDB_BASE}/discover/tv?api_key=${activeTmdbApiKey}&with_original_language=ur&sort_by=popularity.desc&page=1`;
        const pkMovieUrl = `${TMDB_BASE}/discover/movie?api_key=${activeTmdbApiKey}&with_original_language=ur&sort_by=popularity.desc&page=1`;
        const [mRes, tRes] = await Promise.allSettled([
          fetch(pkMovieUrl).then(r => r.json()),
          fetch(pkTvUrl).then(r => r.json())
        ]);
        const mItems = (mRes.status === 'fulfilled' && mRes.value?.results) || [];
        const tItems = (tRes.status === 'fulfilled' && tRes.value?.results) || [];
        results = [
          ...mItems.map(x => ({ ...x, media_type: 'movie' })),
          ...tItems.map(x => ({ ...x, media_type: 'series' }))
        ];
      }
    }

    const limit = options.limit || 60;
    const formatted = results
      .filter((item) => item.backdrop_path || item.poster_path)
      .slice(0, limit)
      .map((item) => ({
        id: `tmdb:${item.id}`,
        tmdbId: item.id,
        name: item.title || item.name || 'Untitled',
        type: item.media_type === 'tv' || item.first_air_date ? 'series' : 'movie',
        backdrop: item.backdrop_path
          ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
          : `https://image.tmdb.org/t/p/w500${item.poster_path}`,
        poster: item.poster_path
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : `https://image.tmdb.org/t/p/w780${item.backdrop_path}`,
        description: item.overview || '',
        releaseInfo: (item.release_date || item.first_air_date || '').slice(0, 4),
        rating: item.vote_average ? item.vote_average.toFixed(1) : null,
        genreIds: item.genre_ids || [],
        isDocumentary: Array.isArray(item.genre_ids) && item.genre_ids.includes(99)
      }));

    cache.set(cacheKey, { data: formatted, time: now });
    return formatted;
  } catch (err) {
    console.error(`Failed to fetch TMDB content for ${platformName}:`, err.message);
    return [];
  }
}

export async function resolveImdbId(type, tmdbId) {
  const normId = String(tmdbId).replace(/^tmdb:/, '').split(':')[0];
  const cacheKey = `imdb:${type}:${normId}:${activeTmdbApiKey}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const tmdbType = type === 'series' ? 'tv' : 'movie';
    const url = `${TMDB_BASE}/${tmdbType}/${normId}/external_ids?api_key=${activeTmdbApiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    const imdbId = data.imdb_id || null;
    if (imdbId) cache.set(cacheKey, imdbId);
    return imdbId;
  } catch {
    return null;
  }
}

export async function searchTmdbId(title, type = 'movie') {
  if (!title || typeof title !== 'string') return null;
  const clean = title.trim();
  const isTv = type === 'series' || type === 'tv';
  const endpoint = isTv ? `${TMDB_BASE}/search/tv` : `${TMDB_BASE}/search/movie`;
  try {
    const res = await fetch(
      `${endpoint}?api_key=${activeTmdbApiKey}&query=${encodeURIComponent(clean)}&include_adult=true`,
      { timeout: 5000 }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const first = data.results?.[0];
    if (first) {
      return {
        tmdbId: String(first.id),
        title: first.title || first.name,
        year: (first.release_date || first.first_air_date || '').slice(0, 4)
      };
    }
  } catch {}
  return null;
}

export async function fetchTmdbSimilar(type = 'movie', id) {
  if (!id) return [];
  const isTv = type === 'series' || type === 'tv';
  const tmdbType = isTv ? 'tv' : 'movie';
  const cleanId = String(id).replace(/^(tmdb:|imdb:)/i, '').split(':')[0].trim();

  let numericId = cleanId;
  // If IMDb ID (starts with tt), find the TMDB numeric ID first
  if (cleanId.startsWith('tt')) {
    try {
      const findRes = await fetch(`${TMDB_BASE}/find/${cleanId}?api_key=${activeTmdbApiKey}&external_source=imdb_id`);
      if (findRes.ok) {
        const findData = await findRes.json();
        const found = isTv ? findData.tv_results?.[0] : findData.movie_results?.[0];
        if (found) numericId = String(found.id);
      }
    } catch {}
  }

  const cacheKey = `similar:${tmdbType}:${numericId}:${activeTmdbApiKey}`;
  const now = Date.now();
  if (cache.has(cacheKey)) {
    const entry = cache.get(cacheKey);
    if (now - entry.time < 300000) return entry.data;
  }

  try {
    const [recRes, simRes] = await Promise.allSettled([
      fetch(`${TMDB_BASE}/${tmdbType}/${numericId}/recommendations?api_key=${activeTmdbApiKey}`),
      fetch(`${TMDB_BASE}/${tmdbType}/${numericId}/similar?api_key=${activeTmdbApiKey}`)
    ]);

    const items = [];
    const seen = new Set();

    const processResults = async (res) => {
      if (res?.status === 'fulfilled' && res.value?.ok) {
        const data = await res.value.json();
        for (const item of (data.results || [])) {
          if (!seen.has(item.id) && item.poster_path) {
            seen.add(item.id);
            items.push({
              id: `tmdb:${item.id}`,
              tmdbId: item.id,
              name: item.title || item.name,
              title: item.title || item.name,
              type: isTv ? 'series' : 'movie',
              poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
              background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
              releaseInfo: (item.release_date || item.first_air_date || '').slice(0, 4),
              year: (item.release_date || item.first_air_date || '').slice(0, 4),
              rating: item.vote_average ? item.vote_average.toFixed(1) : null,
              imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
              description: item.overview || '',
              voteCount: item.vote_count || 0
            });
          }
        }
      }
    };

    await processResults(recRes);
    await processResults(simRes);

    cache.set(cacheKey, { data: items, time: now });
    return items;
  } catch (err) {
    console.error('Failed to fetch similar content:', err.message);
    return [];
  }
}

export async function fetchPersonCredits(nameOrId) {
  if (!nameOrId) return { person: null, cast: [] };

  let personId = null;
  const isNumeric = /^\d+$/.test(String(nameOrId).trim());

  if (isNumeric) {
    personId = String(nameOrId).trim();
  } else {
    // Search person by name
    try {
      const searchRes = await fetch(`${TMDB_BASE}/search/person?api_key=${activeTmdbApiKey}&query=${encodeURIComponent(String(nameOrId).trim())}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        personId = searchData.results?.[0]?.id;
      }
    } catch {}
  }

  if (!personId) return { person: null, cast: [] };

  const cacheKey = `person:${personId}:${activeTmdbApiKey}`;
  const now = Date.now();
  if (cache.has(cacheKey)) {
    const entry = cache.get(cacheKey);
    if (now - entry.time < 600000) return entry.data;
  }

  try {
    const [detailRes, creditsRes] = await Promise.all([
      fetch(`${TMDB_BASE}/person/${personId}?api_key=${activeTmdbApiKey}`),
      fetch(`${TMDB_BASE}/person/${personId}/combined_credits?api_key=${activeTmdbApiKey}`)
    ]);

    let person = null;
    if (detailRes.ok) {
      const p = await detailRes.json();
      person = {
        id: p.id,
        name: p.name,
        photo: p.profile_path ? `https://image.tmdb.org/t/p/w500${p.profile_path}` : null,
        biography: p.biography || '',
        birthday: p.birthday || '',
        placeOfBirth: p.place_of_birth || '',
        knownFor: p.known_for_department || 'Acting',
        popularity: p.popularity || 0
      };
    }

    let cast = [];
    if (creditsRes.ok) {
      const creds = await creditsRes.json();
      const rawCast = creds.cast || [];
      const seen = new Set();

      cast = rawCast
        .filter((item) => {
          if (!item.poster_path || seen.has(item.id)) return false;
          // Filter out talk shows / news unless they have massive votes
          const isTalk = Array.isArray(item.genre_ids) && (item.genre_ids.includes(10767) || item.genre_ids.includes(10763));
          if (isTalk && (item.vote_count || 0) < 50) return false;
          seen.add(item.id);
          return true;
        })
        .map((item) => ({
          id: `tmdb:${item.id}`,
          tmdbId: item.id,
          name: item.title || item.name,
          title: item.title || item.name,
          type: item.media_type === 'tv' ? 'series' : 'movie',
          poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
          background: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
          character: item.character || '',
          releaseInfo: (item.release_date || item.first_air_date || '').slice(0, 4),
          year: (item.release_date || item.first_air_date || '').slice(0, 4),
          rating: item.vote_average ? item.vote_average.toFixed(1) : null,
          imdbRating: item.vote_average ? item.vote_average.toFixed(1) : null,
          description: item.overview || '',
          voteCount: item.vote_count || 0,
          popularity: item.popularity || 0
        }))
        .sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    }

    const result = { person, cast };
    cache.set(cacheKey, { data: result, time: now });
    return result;
  } catch (err) {
    console.error('Failed to fetch person credits:', err.message);
    return { person: null, cast: [] };
  }
}
