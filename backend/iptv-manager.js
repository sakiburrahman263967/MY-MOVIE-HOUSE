import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, 'config.json');
const CHANNELS_CACHE_FILE = path.join(__dirname, 'iptv-channels-cache.json');

// Smart category detection for Sports, Entertainment, Movies, TV Series, Music, News, Kids, Documentary, Adult, etc.
export function detectCategory(title = '', group = '', logo = '') {
  const text = `${title} ${group} ${logo}`.toLowerCase();

  // 1. Adult (18+)
  if (
    /\b(xxx|adult|18\+|porn|playboy|hustler|brazzers|penthouse|redlight|erotic|babes|sex|dorcel|venus|passion|bangbros)\b/i.test(text) ||
    /cxxx|nsfw/i.test(text)
  ) {
    return 'Adult';
  }

  // 2. Sports
  if (
    /\b(sport|sports|t sports|sony ten|star sports|bein|espn|cricket|football|soccer|wwe|ufc|fight|match|willow|super sport|supersport|astro arena|sky sport|sky sports|eurosport|euro sports|motorsport|racing|nba|nfl|golf|tennis|f1|formula 1|dazn|arena sport|bt sport|ptv sports|mundial)\b/i.test(text)
  ) {
    return 'Sports';
  }

  // 3. Movies / Cinema
  if (
    /\b(movie|movies|cinema|film|films|hbo|star movies|zee cinema|sony max|cine|box office|cinemax|flix|action movies|thriller|hollywood|bollywood|goldmines|gold mines|zee classic|star gold|zb cinema|b4u movie|picture)\b/i.test(text)
  ) {
    return 'Movies';
  }

  // 4. TV Series
  if (
    /\b(series|tv series|serial|serials|season|episode|episodes|show|shows|soap|drama series|web series|netflix series)\b/i.test(text)
  ) {
    return 'TV Series';
  }

  // 5. Music
  if (
    /\b(music|mtv|vh1|9xm|9x jalwa|8xm|sangeet|zoom|channel v|trace|b4u music|ptc music|epic music|mastiii|hits|song|songs|sound|radio|clubland|yrf music)\b/i.test(text)
  ) {
    return 'Music';
  }

  // 6. News
  if (
    /\b(news|samachar|khobor|somoy|jamuna|ekattor|dbc|channel 24|cnn|bbc|al jazeera|ndtv|aaj tak|republic|abp|india today|headline|live news|bloomberg|euronews|jago news|calcutta news|r plus news|zee 24 ghanta|news 21|news 24)\b/i.test(text)
  ) {
    return 'News';
  }

  // 7. Kids & Animation
  if (
    /\b(cartoon|kids|pogo|nickelodeon|nick|disney|disnep|sonic|hungama|toon|baby|anime|animation|cbeebies|duronto|yay|chuchu|junior|toons)\b/i.test(text)
  ) {
    return 'Kids';
  }

  // 8. Documentary & Science
  if (
    /\b(documentary|discovery|national geographic|nat geo|natgeo|animal planet|history|bbc earth|travel xp|wild flix|science|planet|investigation|tlc|smithsonian|nature|love natural)\b/i.test(text)
  ) {
    return 'Documentary';
  }

  // 9. Entertainment & General
  if (
    /\b(entertainment|colors|star plus|sony tv|sony sab|zee tv|zee bangla|star jalsha|channel 9|deepto|maasranga|ntv|rtv|atn|gtv|bangla vision|banglavision|nagorik|boishakhi|btv|drama|variety|comedy|hum tv|sony aath|sananda|ekushe|channel i|enter 10|enter tv|ananda|bijoy|me tv|iqra)\b/i.test(text)
  ) {
    return 'Entertainment';
  }

  // If group exists and is not a generic placeholder
  if (group && !/^(live tv|iptv|channels|all|general|stream|default)$/i.test(group.trim())) {
    return group.trim();
  }

  return 'Entertainment';
}

// No default channels - only user-added links/files/xtream accounts will be displayed
export const PRESET_IPTV_PLAYLISTS = [];

export class IptvManager {
  constructor() {
    this.playlists = [];
    this.channels = [];
    this.categories = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
        const config = JSON.parse(raw);
        if (Array.isArray(config.iptvPlaylists)) {
          // Exclude any old preset
          this.playlists = config.iptvPlaylists.filter((p) => p.id !== 'iptv-preset-bd-global');
        } else {
          this.playlists = [];
        }
      } else {
        this.playlists = [];
      }
    } catch {
      this.playlists = [];
    }

    // Only load channels if user has explicitly configured playlists
    if (this.playlists.length > 0) {
      try {
        if (fs.existsSync(CHANNELS_CACHE_FILE)) {
          const cacheRaw = fs.readFileSync(CHANNELS_CACHE_FILE, 'utf-8');
          const cached = JSON.parse(cacheRaw);
          if (Array.isArray(cached?.channels)) {
            this.channels = cached.channels;
            this.categories = cached.categories || [];
          }
        }
      } catch {}

      // Refresh channels in background safely
      this._refreshChannels().catch((err) => {
        console.warn('Background IPTV refresh warning:', err.message);
      });
    } else {
      this.channels = [];
      this.categories = [];
      try {
        if (fs.existsSync(CHANNELS_CACHE_FILE)) {
          fs.unlinkSync(CHANNELS_CACHE_FILE);
        }
      } catch {}
      this._persist();
    }
  }

  _persist() {
    try {
      let currentConfig = {};
      if (fs.existsSync(CONFIG_FILE)) {
        currentConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8') || '{}');
      }
      currentConfig.iptvPlaylists = this.playlists;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist IPTV config:', err.message);
    }
  }

  // Parse M3U / M3U8 string
  parseM3u(m3uContent, playlistName = 'IPTV') {
    const lines = m3uContent.split(/\r?\n/);
    const channels = [];
    let currentExtinf = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
        const nameMatch = line.match(/tvg-name="([^"]+)"/i);
        const groupMatch = line.match(/group-title="([^"]+)"/i);
        const idMatch = line.match(/tvg-id="([^"]+)"/i);

        // Title after last comma
        const commaIdx = line.lastIndexOf(',');
        const title = commaIdx !== -1 ? line.slice(commaIdx + 1).trim() : (nameMatch ? nameMatch[1] : 'Live Channel');
        const rawGroup = groupMatch ? groupMatch[1].trim() : '';
        const logo = logoMatch ? logoMatch[1] : '';
        const detectedGroup = detectCategory(title, rawGroup, logo);

        currentExtinf = {
          title,
          tvgId: idMatch ? idMatch[1] : '',
          tvgName: nameMatch ? nameMatch[1] : title,
          logo,
          group: detectedGroup,
          rawGroup,
        };
      } else if (!line.startsWith('#') && currentExtinf) {
        if (/^https?:\/\//i.test(line)) {
          channels.push({
            id: `iptv:${randomUUID().slice(0, 8)}`,
            name: currentExtinf.title,
            logo: currentExtinf.logo,
            group: currentExtinf.group,
            category: currentExtinf.group,
            rawGroup: currentExtinf.rawGroup,
            url: line,
            playlistName,
            isLive: true
          });
        }
        currentExtinf = null;
      }
    }

    return channels;
  }

  async fetchM3u(url, name) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VLC/3.0.18' },
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      return this.parseM3u(text, name);
    } finally {
      clearTimeout(timer);
    }
  }

  // Fetch from Xtream Codes API
  async fetchXtream(serverUrl, username, password, name) {
    let cleanServer = serverUrl.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(cleanServer)) {
      cleanServer = `http://${cleanServer}`;
    }

    const apiUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(apiUrl, {
        headers: { 'User-Agent': 'IPTVSmarters/3.0.0' },
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Xtream Codes connection failed with status ${res.status}`);
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('Invalid Xtream Codes stream list returned.');

      return list.map((item) => {
        const rawGroup = item.category_name || '';
        const logo = item.stream_icon || '';
        const detectedGroup = detectCategory(item.name || '', rawGroup, logo);
        return {
          id: `iptv:${item.stream_id || randomUUID().slice(0, 8)}`,
          name: item.name || 'Live Channel',
          logo,
          group: detectedGroup,
          category: detectedGroup,
          rawGroup,
          url: `${cleanServer}/live/${username}/${password}/${item.stream_id}.m3u8`,
          playlistName: name,
          isLive: true
        };
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async _refreshChannels() {
    const allChannels = [];
    for (const pl of this.playlists) {
      if (pl.enabled === false) continue;
      try {
        if (pl.type === 'xtream') {
          const chs = await this.fetchXtream(pl.serverUrl, pl.username, pl.password, pl.name);
          allChannels.push(...chs);
        } else if (pl.type === 'raw' && pl.rawContent) {
          const chs = this.parseM3u(pl.rawContent, pl.name);
          allChannels.push(...chs);
        } else if (pl.url) {
          const chs = await this.fetchM3u(pl.url, pl.name);
          allChannels.push(...chs);
        }
      } catch (err) {
        console.warn(`Could not load IPTV playlist ${pl.name}:`, err.message);
      }
    }

    // Deduplicate and ensure detected categories are applied
    this.channels = allChannels.map((c) => {
      const category = detectCategory(c.name || '', c.rawGroup || c.group || '', c.logo || '');
      return {
        ...c,
        group: category,
        category: category
      };
    });

    const standardOrder = ['Sports', 'Entertainment', 'Movies', 'TV Series', 'Music', 'News', 'Kids', 'Documentary', 'Adult'];
    const catCounts = {};
    for (const c of this.channels) {
      const cat = c.group || 'Entertainment';
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }

    const availableCats = Object.keys(catCounts);
    this.categories = [
      ...standardOrder.filter((cat) => availableCats.includes(cat)),
      ...availableCats.filter((cat) => !standardOrder.includes(cat) && !/^(live tv|iptv|channels|all)$/i.test(cat))
    ];

    // Persist channels cache to disk
    try {
      fs.writeFileSync(
        CHANNELS_CACHE_FILE,
        JSON.stringify({ channels: this.channels, categories: this.categories }, null, 2),
        'utf-8'
      );
    } catch {}
  }

  getPlaylists() {
    return this.playlists.map((p) => ({
      ...p,
      enabled: p.enabled !== false,
      channelCount: this.channels.filter((c) => c.playlistName === p.name).length
    }));
  }

  async addPlaylist(data) {
    const { name, url, type = 'm3u', serverUrl, username, password, rawContent } = data || {};
    if (!name || (!url && !rawContent && (!serverUrl || !username || !password))) {
      throw new Error('Missing required IPTV parameters (URL, Raw File, or Xtream Codes credentials).');
    }

    const id = `iptv-pl-${randomUUID().slice(0, 8)}`;
    const newPl = {
      id,
      name: name.trim(),
      type: rawContent ? 'raw' : (type === 'xtream' ? 'xtream' : 'm3u'),
      url: url ? url.trim() : undefined,
      rawContent: rawContent || undefined,
      serverUrl: serverUrl ? serverUrl.trim() : undefined,
      username: username ? username.trim() : undefined,
      password: password ? password.trim() : undefined,
      enabled: true,
      builtin: false,
      createdAt: new Date().toISOString()
    };

    // Test load
    if (newPl.type === 'xtream') {
      await this.fetchXtream(newPl.serverUrl, newPl.username, newPl.password, newPl.name);
    } else if (newPl.type === 'raw') {
      const testChs = this.parseM3u(newPl.rawContent, newPl.name);
      if (testChs.length === 0) throw new Error('No playable channels found in provided M3U file.');
    } else {
      await this.fetchM3u(newPl.url, newPl.name);
    }

    this.playlists.push(newPl);
    this._persist();
    await this._refreshChannels();
    return newPl;
  }

  async removePlaylist(id) {
    this.playlists = this.playlists.filter((p) => p.id !== id);
    this._persist();
    await this._refreshChannels();
    return this.getPlaylists();
  }

  async togglePlaylist(id) {
    const pl = this.playlists.find((p) => p.id === id);
    if (pl) {
      pl.enabled = pl.enabled === false ? true : !pl.enabled;
      this._persist();
      await this._refreshChannels();
    }
    return this.getPlaylists();
  }

  getChannels(category = '', search = '', limit = 1000, offset = 0) {
    let list = this.channels;
    if (category && category.toLowerCase() !== 'all') {
      const catLower = category.toLowerCase();
      list = list.filter((c) =>
        c.group?.toLowerCase() === catLower ||
        c.category?.toLowerCase() === catLower ||
        detectCategory(c.name || '', c.rawGroup || '', c.logo || '').toLowerCase() === catLower
      );
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name?.toLowerCase().includes(q) ||
        c.group?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q) ||
        c.playlistName?.toLowerCase().includes(q)
      );
    }
    return {
      total: list.length,
      channels: list.slice(offset, offset + limit),
      categories: this.categories
    };
  }

  getChannelStream(channelId) {
    const ch = this.channels.find((c) => c.id === channelId || c.id === `iptv:${channelId}`);
    if (!ch) return null;
    return {
      addonId: 'iptv-live',
      addonName: `[Live TV] ${ch.playlistName || 'IPTV'}`,
      name: `🔴 LIVE • ${ch.name}`,
      title: `${ch.name} (${ch.group || 'Live TV'})\n⚡ Direct HLS Live Broadcast Stream`,
      url: ch.url,
      poster: ch.logo,
      isLive: true,
      behaviorHints: { notWebReady: false }
    };
  }
}

export const iptvManager = new IptvManager();
