// Provider aggregator for the MovieBox-TUI port (MovieBox + Dramachi).
// Exposes a small uniform surface for addon-manager.js / server.js:
//   - isProviderId(id)        -> id is scoped to a ported provider (mb: / dr:)
//   - searchProviders(query)  -> merged search hits (unique by id)
//   - getProviderMeta(type,id)-> metadata for provider ids
//   - getProviderStreams(...) -> streams for provider ids OR title-based lookup
//   - getProviderSubtitles()  -> MovieBox captions (direct id or by title)
//
// Deadlines: every path is deadline-bounded so provider latency can never
// block the aggregate stream/meta flow indefinitely.
import {
  movieBoxSearch,
  movieBoxGetDetails,
  detailsToMeta as movieBoxDetailsToMeta,
  resolveMovieBoxSubject,
  getMovieBoxStreams,
  getMovieBoxSubtitles,
} from './moviebox.js';
import {
  dramachiSearch,
  getDramachiMeta,
  getDramachiStreams,
} from './dramachi.js';

const DEFAULT_DEADLINE_MS = 15000;
const SEARCH_DEADLINE_MS = 9000;

export function isProviderId(id) {
  const value = String(id || '');
  return value.startsWith('mb:') || value.startsWith('dr:');
}

function withDeadline(deadline, fallbackMs = DEFAULT_DEADLINE_MS) {
  if (typeof deadline === 'number' && deadline > 0) return deadline;
  return Date.now() + fallbackMs;
}

/** mb:<subjectId>[:<season>:<episode>] -> {subjectId, season, episode} */
function parseMovieBoxId(id) {
  const raw = String(id || '').replace(/^mb:/, '');
  const match = raw.match(/^(.+):(\d+):(\d+)$/);
  if (match) {
    return {
      subjectId: match[1],
      season: Number.parseInt(match[2], 10) || 0,
      episode: Number.parseInt(match[3], 10) || 0,
    };
  }
  return { subjectId: raw, season: 0, episode: 0 };
}

/** Trailing :season:episode on tmdb/imdb style ids (Detail.jsx streamTargetId). */
function parseSeasonEpisode(id, type) {
  const match = String(id || '').match(/:(\d+):(\d+)$/);
  if (match) {
    return {
      season: Number.parseInt(match[1], 10) || 0,
      episode: Number.parseInt(match[2], 10) || 0,
    };
  }
  const isSeries = type === 'series' || type === 'tv';
  return isSeries ? { season: 1, episode: 1 } : { season: 0, episode: 0 };
}

function mergeById(lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item) continue;
      // For search results/items with id
      if (item.id) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
        continue;
      }
      // For streams (no id) use url as key
      if (item.url) {
        const key = item.url;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
        continue;
      }
      merged.push(item);
    }
  }
  return merged;
}

/** Search both ported providers in parallel; results merged, unique by id. */
export async function searchProviders(query, { deadline } = {}) {
  const until = withDeadline(deadline, SEARCH_DEADLINE_MS);
  const [movieBoxResult, dramachiResult] = await Promise.allSettled([
    movieBoxSearch(query, { deadline: until }),
    dramachiSearch(query, { deadline: until }),
  ]);
  return mergeById([
    movieBoxResult.status === 'fulfilled' ? movieBoxResult.value : [],
    dramachiResult.status === 'fulfilled' ? dramachiResult.value : [],
  ]);
}

/** Metadata for provider-scoped ids (mb:/dr:). Returns null for anything else. */
export async function getProviderMeta(type, id, { deadline } = {}) {
  const until = withDeadline(deadline);
  try {
    if (String(id).startsWith('mb:')) {
      const { subjectId } = parseMovieBoxId(id);
      if (!subjectId) return null;
      const details = await movieBoxGetDetails(subjectId, { deadline: until });
      if (!details) return null;
      return movieBoxDetailsToMeta(details, subjectId);
    }
    if (String(id).startsWith('dr:')) {
      return await getDramachiMeta(id, { deadline: until });
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Streams for:
 *  - direct provider ids (mb:/dr:) resolved natively, or
 *  - normal tmdb/imdb ids resolved by title+year fan-out against both providers.
 * Returns an array of stream objects shaped for parseStreamDetails().
 */
export async function getProviderStreams({ type, id, meta, deadline } = {}) {
  const until = withDeadline(deadline);

  if (String(id).startsWith('mb:')) {
    try {
      const { subjectId, season, episode } = parseMovieBoxId(id);
      if (!subjectId) return [];
      return await getMovieBoxStreams({
        subjectId,
        season,
        episode,
        title: meta?.name || meta?.title || 'MovieBox Stream',
        deadline: until,
      });
    } catch {
      return [];
    }
  }

  if (String(id).startsWith('dr:')) {
    try {
      return await getDramachiStreams(id, { deadline: until });
    } catch {
      return [];
    }
  }

  // Title-based fan-out for regular (tmdb/imdb) ids.
  const title = meta?.name || meta?.title;
  if (!title || typeof title !== 'string' || !title.trim()) return [];

  const year = meta?.year || meta?.releaseInfo || null;
  const isSeries = type === 'series' || type === 'tv';
  const { season, episode } = parseSeasonEpisode(id, type);

  const movieBoxPromise = (async () => {
    try {
      const { movieBoxSearch } = await import('./moviebox.js');
      const results = await movieBoxSearch(title, { deadline: until });
      if (!results || results.length === 0) return [];
      const normalized = title.trim().toLowerCase();
      const wantedType = isSeries ? 'series' : 'movie';
      const exact = results.filter((item) => (item.name || '').trim().toLowerCase() === normalized);
      const candidates = (exact.length > 0 ? exact : results).filter((item) => {
        if (wantedType === 'series') return item.type === 'series';
        return item.type !== 'series';
      });
      const list = candidates.length > 0 ? candidates : (exact.length > 0 ? exact : results);
      const all = [];
      await Promise.allSettled(list.slice(0, 8).map(async (subject) => {
        const { subjectId } = parseMovieBoxId(subject.id);
        if (!subjectId) return;
        try {
          const streams = await getMovieBoxStreams({
            subjectId,
            season: isSeries ? season : 0,
            episode: isSeries ? episode : 0,
            title,
            deadline: until,
          });
          if (Array.isArray(streams)) all.push(...streams);
        } catch {}
      }));
      return all;
    } catch {
      const subject = await resolveMovieBoxSubject(title, year, type, { deadline: until });
      if (!subject) return [];
      const { subjectId } = parseMovieBoxId(subject.id);
      if (!subjectId) return [];
      return getMovieBoxStreams({
        subjectId,
        season: isSeries ? season : 0,
        episode: isSeries ? episode : 0,
        title,
        deadline: until,
      });
    }
  })();

  const dramachiPromise = (async () => {
    const results = await dramachiSearch(title, { deadline: until });
    if (results.length === 0) return [];
    const normalized = title.trim().toLowerCase();
    const wantedType = isSeries ? 'series' : 'movie';
    const exact = results.filter((item) => (item.name || '').trim().toLowerCase() === normalized);
    const sameType = (exact.length > 0 ? exact : results).filter((item) => item.type === wantedType);
    const subject = sameType[0] || exact[0] || results[0];
    if (!subject) return [];
    const baseId = String(subject.id).replace(/^dr:/, '');
    const targetId = isSeries ? `dr:${baseId}:${season}:${episode}` : `dr:${baseId}`;
    return getDramachiStreams(targetId, { deadline: until });
  })();

  const [movieBoxResult, dramachiResult] = await Promise.allSettled([
    movieBoxPromise,
    dramachiPromise,
  ]);
  return mergeById([
    movieBoxResult.status === 'fulfilled' ? movieBoxResult.value : [],
    dramachiResult.status === 'fulfilled' ? dramachiResult.value : [],
  ]);
}

/**
 * MovieBox captions.
 *  - `mb:` ids: direct (optionally scoped to :season:episode)
 *  - regular ids: resolved by title (caller should only use this when addon
 *    subtitles came back empty, to keep API traffic low).
 */
export async function getProviderSubtitles({ type, id, meta, deadline } = {}) {
  const until = withDeadline(deadline, 12000);
  const isSeries = type === 'series' || type === 'tv';

  try {
    if (String(id).startsWith('mb:')) {
      const { subjectId, season, episode } = parseMovieBoxId(id);
      if (!subjectId) return [];
      return await getMovieBoxSubtitles({ subjectId, season, episode, deadline: until });
    }

    const title = meta?.name || meta?.title;
    if (!title || !title.trim()) return [];

    try {
      const { movieBoxSearch } = await import('./moviebox.js');
      const results = await movieBoxSearch(title, { deadline: until });
      if (results && results.length > 0) {
        const normalized = title.trim().toLowerCase();
        const wantedType = isSeries ? 'series' : 'movie';
        const exact = results.filter((item) => (item.name || '').trim().toLowerCase() === normalized);
        const candidates = (exact.length > 0 ? exact : results).filter((item) => {
          if (wantedType === 'series') return item.type === 'series';
          return item.type !== 'series';
        });
        const list = candidates.length > 0 ? candidates : results;
        const { season, episode } = parseSeasonEpisode(id, type);
        const all = [];
        await Promise.allSettled(list.slice(0, 6).map(async (subject) => {
          const { subjectId } = parseMovieBoxId(subject.id);
          if (!subjectId) return;
          try {
            const subs = await getMovieBoxSubtitles({
              subjectId,
              season: isSeries ? season : 0,
              episode: isSeries ? episode : 0,
              deadline: until,
            });
            if (Array.isArray(subs)) all.push(...subs);
          } catch {}
        }));
        const seen = new Set();
        const unique = [];
        for (const s of all) {
          const key = s.url || s.name;
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(s);
        }
        return unique;
      }
    } catch {}
    const subject = await resolveMovieBoxSubject(title, meta?.year || meta?.releaseInfo, type, { deadline: until });
    if (!subject) return [];
    const { subjectId } = parseMovieBoxId(subject.id);
    if (!subjectId) return [];
    const { season, episode } = parseSeasonEpisode(id, type);
    return await getMovieBoxSubtitles({
      subjectId,
      season: isSeries ? season : 0,
      episode: isSeries ? episode : 0,
      deadline: until,
    });
  } catch {
    return [];
  }
}
