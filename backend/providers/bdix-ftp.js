import http from 'http';
import https from 'https';
import querystring from 'querystring';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dhakaDb = null;
function getDhakaDb() {
  if (dhakaDb) return dhakaDb;
  try {
    const moviesPath = path.resolve(__dirname, '../../bdix-stremio-addons/DhakaFlix/data/movies.json');
    const seriesPath = path.resolve(__dirname, '../../bdix-stremio-addons/DhakaFlix/data/series.json');
    const movies = fs.existsSync(moviesPath) ? JSON.parse(fs.readFileSync(moviesPath, 'utf8')).items || [] : [];
    const series = fs.existsSync(seriesPath) ? JSON.parse(fs.readFileSync(seriesPath, 'utf8')).items || [] : [];
    dhakaDb = { movies, series };
  } catch {
    dhakaDb = { movies: [], series: [] };
  }
  return dhakaDb;
}

function normalizeDhakaTitle(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseSeasonNum(str) {
  const m = String(str || '').match(/season\s*0?(\d+)/i) || String(str || '').match(/s0?(\d+)/i);
  return m ? parseInt(m[1], 10) : 1;
}

function parseEpisodeNum(str) {
  const m = String(str || '').match(/e0?(\d+)/i) || String(str || '').match(/episode\s*0?(\d+)/i);
  return m ? parseInt(m[1], 10) : 1;
}

// 4. Search DhakaFlix BDIX (172.16.50.7, 172.16.50.12, 172.16.50.14)
export async function searchDhakaFlix(title, year, isSeries = false, season = 1, episode = 1) {
  try {
    const db = getDhakaDb();
    const list = isSeries ? db.series : db.movies;
    if (!list || list.length === 0) return [];

    const normQuery = normalizeDhakaTitle(title);
    const qWords = normQuery.split(' ').filter(w => w.length >= 2);
    if (qWords.length === 0) return [];

    const mainWords = qWords.slice(0, 3);
    const candidates = list.filter(item => {
      const itemNorm = normalizeDhakaTitle(item.n);
      return mainWords.every(w => itemNorm.includes(w));
    });

    if (candidates.length === 0) return [];
    const top = candidates[0];

    if (!isSeries) {
      const files = Array.isArray(top.v) ? top.v : [];
      return files.map(f => {
        const is1080p = /1080p/i.test(f.n || f.u);
        const is720p = /720p/i.test(f.n || f.u);
        const is4k = /2160p|4k/i.test(f.n || f.u);
        const quality = is4k ? '4K' : (is1080p ? '1080p' : (is720p ? '720p' : 'HD'));
        return {
          url: f.u,
          name: `[BDIX FTP] DhakaFlix - ${quality}`,
          title: `${f.n || top.n} (${f.z || 'BDIX'})`,
          quality,
          size: f.z || 'BDIX Gigabit',
          addonName: 'BDIX Fast FTP',
          serverName: 'DhakaFlix BDIX Gigabit',
          behaviorHints: { notWebReady: false }
        };
      });
    } else {
      const targetSeason = parseInt(season, 10) || 1;
      const targetEp = parseInt(episode, 10) || 1;
      const seasonFolders = Array.isArray(top.sf) ? top.sf : [];
      const matchedSeason = seasonFolders.find(s => parseSeasonNum(s.n) === targetSeason) || seasonFolders[0];
      if (!matchedSeason || !matchedSeason.u) return [];

      let listDirectory;
      try {
        const h5aiModule = require('../../bdix-stremio-addons/DhakaFlix/h5ai.js');
        listDirectory = h5aiModule.listDirectory;
      } catch {}

      if (listDirectory) {
        const rows = await listDirectory(matchedSeason.u, { timeoutMs: 4000 }).catch(() => []);
        const videoFiles = rows.filter(r => r && r.isVideo);
        const epFile = videoFiles.find(r => parseEpisodeNum(r.name) === targetEp) || videoFiles[targetEp - 1] || videoFiles[0];
        if (epFile && epFile.url) {
          const is1080p = /1080p/i.test(epFile.name || epFile.url);
          const is720p = /720p/i.test(epFile.name || epFile.url);
          const is4k = /2160p|4k/i.test(epFile.name || epFile.url);
          const quality = is4k ? '4K' : (is1080p ? '1080p' : (is720p ? '720p' : 'HD'));
          return [{
            url: epFile.url,
            name: `[BDIX FTP] DhakaFlix - ${quality}`,
            title: `${epFile.name} (${epFile.size || 'BDIX Gigabit'})`,
            quality,
            size: epFile.size || 'BDIX Gigabit',
            addonName: 'BDIX Fast FTP',
            serverName: 'DhakaFlix BDIX Gigabit',
            behaviorHints: { notWebReady: false }
          }];
        }
      }
      return [];
    }
  } catch {
    return [];
  }
}

// Cache CSRF token and cookie for IBCCL (103.203.93.2)
let ibcclAuth = null;
async function getIbcclAuth() {
  if (ibcclAuth && Date.now() - ibcclAuth.ts < 10 * 60 * 1000) {
    return ibcclAuth;
  }
  return new Promise((resolve) => {
    const req = http.get('http://103.203.93.2/', { timeout: 3500 }, (res) => {
      const setCookies = res.headers['set-cookie'] || [];
      const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');
      let data = '';
      res.on('data', chunk => { if (data.length < 50000) data += chunk; });
      res.on('end', () => {
        const m = data.match(/name="csrf-token"\s+content="([^"]+)"/i) ||
                  data.match(/content="([^"]+)"\s+name="csrf-token"/i);
        const token = m ? m[1] : '';
        ibcclAuth = { cookieHeader, token, ts: Date.now() };
        resolve(ibcclAuth);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Generate intelligent query variants:
 * e.g. "Kama Sutra: A Tale of Love" ->
 * ["Kama Sutra: A Tale of Love", "Kama Sutra", "Kama.Sutra", "Kama"]
 */
export function generateSearchQueries(title) {
  if (!title || typeof title !== 'string') return [];
  const raw = title.trim();
  const set = new Set();
  set.add(raw);

  // Strip anything after colon, dash or en-dash: "Movie: Subtitle" -> "Movie"
  const colonPart = raw.split(/[:\-\–\—]/)[0].trim();
  if (colonPart && colonPart.length >= 2) set.add(colonPart);

  // Clean special characters
  const cleanChars = raw.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanChars && cleanChars.length >= 2) set.add(cleanChars);

  const cleanColon = colonPart.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanColon && cleanColon.length >= 2) set.add(cleanColon);

  // Dotted variations (FTP filenames commonly use dots like "Kama.Sutra")
  if (colonPart) set.add(colonPart.replace(/\s+/g, '.'));
  if (cleanColon) set.add(cleanColon.replace(/\s+/g, '.'));
  if (raw) set.add(raw.replace(/\s+/g, '.'));

  // First 2 words if longer
  const words = cleanColon.split(' ').filter(Boolean);
  if (words.length >= 2) {
    set.add(words.slice(0, 2).join(' '));
    set.add(words.slice(0, 2).join('.'));
  }

  return Array.from(set).filter(q => q && q.length >= 2);
}

// 1. Search IBCCL BDIX (103.203.93.2 & 103.203.93.4 / 103.203.93.3 / 103.203.93.18 / 103.203.93.19)
export async function searchIbcclFtp(title, year) {
  try {
    const auth = await getIbcclAuth();
    if (!auth || !auth.token) return [];

    const queries = generateSearchQueries(title);
    const results = [];
    const seenUrls = new Set();

    for (const q of queries) {
      const postData = querystring.stringify({ query: q });
      const items = await new Promise((resolve) => {
        const req = http.request('http://103.203.93.2/search_movies', {
          method: 'POST',
          timeout: 4000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-TOKEN': auth.token,
            'Cookie': auth.cookieHeader,
            'Referer': 'http://103.203.93.2/'
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.status === 'success' && Array.isArray(json.data)) {
                resolve(json.data);
              } else {
                resolve([]);
              }
            } catch {
              resolve([]);
            }
          });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
        req.write(postData);
        req.end();
      });

      for (const item of items) {
        if (!item || !item.drive_host || !item.video_url) continue;
        const cat = item.category_name ? encodeURIComponent(item.category_name) : '';
        const sub = item.sub_category_title ? encodeURIComponent(item.sub_category_title) : '';
        const folder = item.video_folder_name ? encodeURIComponent(item.video_folder_name) : '';
        const file = encodeURIComponent(item.video_url);
        const pathParts = [item.drive_host, cat, sub, folder, file].filter(Boolean);
        const streamUrl = pathParts.join('/');

        if (seenUrls.has(streamUrl)) continue;
        seenUrls.add(streamUrl);

        const is1080p = /1080p/i.test(item.video_folder_name || item.video_url);
        const is720p = /720p/i.test(item.video_folder_name || item.video_url);
        const is4k = /2160p|4k/i.test(item.video_folder_name || item.video_url);
        const quality = is4k ? '4K' : (is1080p ? '1080p' : (is720p ? '720p' : 'HD'));

        results.push({
          url: streamUrl,
          name: `[BDIX FTP] IBCCL - ${quality}`,
          title: `${item.video_folder_name || title} (BDIX Gigabit)`,
          quality,
          size: 'BDIX Gigabit',
          addonName: 'BDIX Fast FTP',
          serverName: `IBCCL FTP (${item.drive || 'Fast'})`,
          behaviorHints: { notWebReady: false }
        });
      }

      if (results.length > 0) break;
    }

    return results;
  } catch {
    return [];
  }
}

// 2. Search Ghuri / Gori BDIX (103.96.104.6)
export async function searchGhuriFtp(title, imdbId) {
  try {
    const queries = generateSearchQueries(title);
    for (const q of queries) {
      const searchUrl = `http://103.96.104.6/msearch.php?q=M&searchquery=${encodeURIComponent(q)}`;
      const streams = await new Promise((resolve) => {
        const req = http.get(searchUrl, { timeout: 3500, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', async () => {
            try {
              const matches = [...data.matchAll(/href=["'](http:\/\/103\.96\.104\.6\/\/movie\.php\?[^"']+|movie\.php\?[^"']+)["']/gi)];
              if (matches.length === 0) return resolve([]);
              
              let chosen = matches.map(m => m[1]);
              if (imdbId) {
                const matchedImdb = chosen.filter(l => l.includes(imdbId));
                if (matchedImdb.length > 0) chosen = matchedImdb;
              }

              const streamPromises = chosen.slice(0, 2).map((movieRel) => {
                return new Promise((resMovie) => {
                  const fullMovieUrl = movieRel.startsWith('http') ? movieRel : `http://103.96.104.6/${movieRel.replace(/^\//, '')}`;
                  const mReq = http.get(fullMovieUrl, { timeout: 3000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (mRes) => {
                    let mData = '';
                    mRes.on('data', chunk => mData += chunk);
                    mRes.on('end', () => {
                      const videoLinkMatch = mData.match(/href=["'](http:\/\/103\.96\.104\.6\/data_content\/[^"']*\.(?:mp4|mkv|avi))["']/i);
                      if (videoLinkMatch) {
                        const vUrl = videoLinkMatch[1];
                        const is1080p = /1080p/i.test(vUrl);
                        const is720p = /720p/i.test(vUrl);
                        const is4k = /2160p|4k/i.test(vUrl);
                        const quality = is4k ? '4K' : (is1080p ? '1080p' : (is720p ? '720p' : 'HD'));
                        resMovie({
                          url: vUrl,
                          name: `[BDIX FTP] Ghuri - ${quality}`,
                          title: `${title} - Ghuri BDIX High-Speed`,
                          quality,
                          size: 'BDIX Direct',
                          addonName: 'BDIX Fast FTP',
                          serverName: 'Ghuri FTP (103.96)',
                          behaviorHints: { notWebReady: false }
                        });
                      } else {
                        resMovie(null);
                      }
                    });
                  });
                  mReq.on('error', () => resMovie(null));
                  mReq.on('timeout', () => { mReq.destroy(); resMovie(null); });
                });
              });

              const resolvedStreams = (await Promise.all(streamPromises)).filter(Boolean);
              resolve(resolvedStreams);
            } catch {
              resolve([]);
            }
          });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
      });

      if (streams && streams.length > 0) return streams;
    }
    return [];
  } catch {
    return [];
  }
}

// 3. Search CTGMovies BDIX (ctgmovies.com)
export async function searchCtgMovies(title, isSeries = false, season = 1, episode = 1) {
  try {
    const queries = generateSearchQueries(title);
    for (const q of queries) {
      const endpoint = isSeries ? `https://ctgmovies.com/api/v1/tv?search=${encodeURIComponent(q)}` : `https://ctgmovies.com/api/v1/movies?search=${encodeURIComponent(q)}`;
      const streams = await new Promise((resolve) => {
        const req = https.get(endpoint, { timeout: 4000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', async () => {
            try {
              const json = JSON.parse(data);
              const list = json.movies || json.tv_shows || json.results || [];
              if (!Array.isArray(list) || list.length === 0) return resolve([]);
              
              const topItems = list.slice(0, 2);
              const streamPromises = topItems.map(async (item) => {
                const detailKey = item.slug || item.id;
                const detailUrl = isSeries ? `https://ctgmovies.com/api/v1/tv/${encodeURIComponent(detailKey)}` : `https://ctgmovies.com/api/v1/movies/${encodeURIComponent(detailKey)}`;
                return new Promise((resDetail) => {
                  const dReq = https.get(detailUrl, { timeout: 3500, headers: { 'User-Agent': 'Mozilla/5.0' } }, (dRes) => {
                    let dData = '';
                    dRes.on('data', chunk => dData += chunk);
                    dRes.on('end', () => {
                      try {
                        const dJson = JSON.parse(dData);
                        let links = [];
                        if (isSeries) {
                          const episodes = dJson.episodes || [];
                          const targetEp = episodes.find(e => Number(e.season_number || 1) === Number(season) && Number(e.episode_number || 1) === Number(episode));
                          if (targetEp && Array.isArray(targetEp.links)) links = targetEp.links;
                        } else {
                          if (Array.isArray(dJson.links)) links = dJson.links;
                        }

                        const sList = links.filter(l => l && (l.url || l.hls_url) && !String(l.url || '').includes('ftp.ctgfun.com')).map((link) => {
                          const direct = link.hls_url || link.url;
                          const quality = link.quality || '1080p';
                          const sizeMb = link.size_bytes ? `${Math.round(Number(link.size_bytes) / 1024 / 1024)} MB` : 'BDIX';
                          return {
                            url: direct,
                            name: `[BDIX FTP] CTGMovies - ${quality}`,
                            title: `${dJson.title || title} (${sizeMb})`,
                            quality,
                            size: sizeMb,
                            addonName: 'BDIX Fast FTP',
                            serverName: `CTGMovies (${link.source_display || 'BDIX'})`,
                            subtitles: link.subtitle_tracks || [],
                            behaviorHints: { notWebReady: false }
                          };
                        });
                        resDetail(sList);
                      } catch {
                        resDetail([]);
                      }
                    });
                  });
                  dReq.on('error', () => resDetail([]));
                  dReq.on('timeout', () => { dReq.destroy(); resDetail([]); });
                });
              });

              const allResolved = (await Promise.all(streamPromises)).flat();
              resolve(allResolved);
            } catch {
              resolve([]);
            }
          });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
      });

      if (streams && streams.length > 0) return streams;
    }
    return [];
  } catch {
    return [];
  }
}

// 5. Search RoarZone Media Server (https://play.roarzone.net/)
let roarAuth = null;
async function getRoarZoneAuth() {
  if (roarAuth && Date.now() - roarAuth.ts < 45 * 60 * 1000) return roarAuth;
  try {
    const res = await fetch('https://play.roarzone.net/emby/Users/AuthenticateByName', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Emby-Client': 'Emby Web',
        'X-Emby-Device-Name': 'Chrome',
        'X-Emby-Device-Id': 'mmh-roarzone-agent',
        'X-Emby-Client-Version': '4.9.3.0'
      },
      body: JSON.stringify({ Username: 'RoarZone_Guest', Pw: '' }),
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    roarAuth = { token: json.AccessToken, userId: json.User.Id, ts: Date.now() };
    return roarAuth;
  } catch {
    return null;
  }
}

export async function searchRoarZone(title, isSeries = false, season = 1, episode = 1) {
  try {
    const auth = await getRoarZoneAuth();
    if (!auth) return [];
    const queries = generateSearchQueries(title);
    const results = [];
    const seenUrls = new Set();

    for (const q of queries.slice(0, 2)) {
      const itemType = isSeries ? 'Series,Episode' : 'Movie';
      const sUrl = `https://play.roarzone.net/emby/Users/${auth.userId}/Items?SearchTerm=${encodeURIComponent(q)}&Recursive=true&IncludeItemTypes=${itemType}&Fields=MediaSources,Path`;
      const res = await fetch(sUrl, {
        headers: { 'X-Emby-Token': auth.token },
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const items = Array.isArray(data.Items) ? data.Items : [];

      for (const item of items) {
        if (!item || !item.Id) continue;
        const streamUrl = `https://play.roarzone.net/emby/Videos/${item.Id}/stream.mkv?Static=true&api_key=${auth.token}`;
        if (seenUrls.has(streamUrl)) continue;
        seenUrls.add(streamUrl);

        const is1080p = /1080p/i.test(item.Name || item.Path || '');
        const is720p = /720p/i.test(item.Name || item.Path || '');
        const is4k = /2160p|4k/i.test(item.Name || item.Path || '');
        const quality = is4k ? '4K' : (is1080p ? '1080p' : (is720p ? '720p' : 'HD'));

        results.push({
          url: streamUrl,
          name: `[BDIX FTP] RoarZone - ${quality}`,
          title: `${item.Name} (RoarZone BDIX Gigabit)`,
          quality,
          size: 'BDIX Gigabit',
          addonName: 'BDIX Fast FTP',
          serverName: 'RoarZone Media Server',
          behaviorHints: { notWebReady: false }
        });
      }
      if (results.length > 0) break;
    }
    return results;
  } catch {
    return [];
  }
}

// 6. Search Circle / Sam FTP (http://10.10.10.3/)
export async function searchCircleSam(title, isSeries = false, season = 1, episode = 1) {
  try {
    const queries = generateSearchQueries(title);
    const results = [];
    const seenUrls = new Set();

    for (const q of queries.slice(0, 2)) {
      const res = await fetch(`http://10.10.10.3/api/search?search=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) continue;

      for (const item of items.slice(0, 4)) {
        if (!item.id) continue;
        const typeParam = isSeries ? 'tv' : 'movies';
        const streamUrl = `http://10.10.10.3/api/stream/video/stream?type=${typeParam}&id=${item.id}`;
        if (seenUrls.has(streamUrl)) continue;
        seenUrls.add(streamUrl);

        const is1080p = /1080p/i.test(item.file_path || item.title || '');
        const is720p = /720p/i.test(item.file_path || item.title || '');
        const is4k = /2160p|4k/i.test(item.file_path || item.title || '');
        const quality = is4k ? '4K' : (is1080p ? '1080p' : (is720p ? '720p' : 'HD'));

        results.push({
          url: streamUrl,
          name: `[BDIX FTP] Circle/Sam - ${quality}`,
          title: `${item.title} (Circle/Sam FTP)`,
          quality,
          size: 'BDIX Direct',
          addonName: 'BDIX Fast FTP',
          serverName: 'Circle/Sam FTP (10.10.10.3)',
          behaviorHints: { notWebReady: false }
        });
      }
      if (results.length > 0) break;
    }
    return results;
  } catch {
    return [];
  }
}

// 7. Search Cloud Media (http://172.19.178.179/)
export async function searchCloudMedia(title) {
  try {
    const queries = generateSearchQueries(title);
    const results = [];
    const seenUrls = new Set();

    for (const q of queries.slice(0, 2)) {
      const searchUrl = `http://172.19.178.179/search.php?search=${encodeURIComponent(q)}`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const html = await res.text();
      const movieMatches = [...html.matchAll(/movie\.php\?id=(\d+)/gi)];
      const movieIds = [...new Set(movieMatches.map(m => m[1]))].slice(0, 2);

      for (const mId of movieIds) {
        const dRes = await fetch(`http://172.19.178.179/movie.php?id=${mId}`, { signal: AbortSignal.timeout(3500) });
        if (!dRes.ok) continue;
        const dHtml = await dRes.text();
        const vMatches = [...dHtml.matchAll(/(?:src|href)=["'](http:\/\/172\.19\.[^"']*\.(?:mp4|mkv|avi|webm)[^"']*)["']/gi)];
        for (const vm of vMatches) {
          let streamUrl = vm[1].replace(/&#039;/g, "'").replace(/&amp;/g, '&');
          if (seenUrls.has(streamUrl)) continue;
          seenUrls.add(streamUrl);

          const is1080p = /1080p/i.test(streamUrl);
          const is720p = /720p/i.test(streamUrl);
          const is4k = /2160p|4k/i.test(streamUrl);
          const quality = is4k ? '4K' : (is1080p ? '1080p' : (is720p ? '720p' : 'HD'));
          results.push({
            url: streamUrl,
            name: `[BDIX FTP] Cloud Media - ${quality}`,
            title: `${title} (Cloud Media BDIX)`,
            quality,
            size: 'BDIX Direct',
            addonName: 'BDIX Fast FTP',
            serverName: 'Cloud Media (172.19.178.179)',
            behaviorHints: { notWebReady: false }
          });
        }
      }
      if (results.length > 0) break;
    }
    return results;
  } catch {
    return [];
  }
}

// Master Aggregator for BDIX Fast FTP Streams
export async function getBdixFtpStreams({ type, id, meta, deadline }) {
  const title = meta?.name || meta?.title || '';
  if (!title || typeof title !== 'string' || !title.trim()) return [];

  const cleanTitle = title.trim();
  const year = meta?.year || meta?.releaseInfo || null;
  const imdbId = meta?.imdb_id || meta?.imdbId || (String(id).startsWith('tt') ? id.split(':')[0] : null);
  const isSeries = type === 'series' || type === 'tv';

  let season = 1;
  let episode = 1;
  const match = String(id || '').match(/:(\d+):(\d+)$/);
  if (match) {
    season = parseInt(match[1], 10) || 1;
    episode = parseInt(match[2], 10) || 1;
  }

  const [ibcclRes, ghuriRes, ctgRes, dhakaRes, roarRes, circleRes, cloudRes] = await Promise.allSettled([
    searchIbcclFtp(cleanTitle, year),
    searchGhuriFtp(cleanTitle, imdbId),
    searchCtgMovies(cleanTitle, isSeries, season, episode),
    searchDhakaFlix(cleanTitle, year, isSeries, season, episode),
    searchRoarZone(cleanTitle, isSeries, season, episode),
    searchCircleSam(cleanTitle, isSeries, season, episode),
    searchCloudMedia(cleanTitle)
  ]);

  const all = [
    ...(dhakaRes.status === 'fulfilled' ? dhakaRes.value : []),
    ...(roarRes.status === 'fulfilled' ? roarRes.value : []),
    ...(circleRes.status === 'fulfilled' ? circleRes.value : []),
    ...(cloudRes.status === 'fulfilled' ? cloudRes.value : []),
    ...(ibcclRes.status === 'fulfilled' ? ibcclRes.value : []),
    ...(ghuriRes.status === 'fulfilled' ? ghuriRes.value : []),
    ...(ctgRes.status === 'fulfilled' ? ctgRes.value : [])
  ];

  return all;
}
