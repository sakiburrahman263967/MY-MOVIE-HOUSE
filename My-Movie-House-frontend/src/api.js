export const API_BASE = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

const memoryCache = new Map();

const request = async (path, options = {}) => {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  const fullUrl = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const shouldCache = isGet && !path.includes('/api/streams') && !path.includes('/live') && !path.includes('/health');
  if (shouldCache && memoryCache.has(fullUrl)) {
    return memoryCache.get(fullUrl);
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'The request could not be completed.');

  if (shouldCache && data) {
    memoryCache.set(fullUrl, data);
  }

  return data;
};

const queryString = (values) => {
  const params = new URLSearchParams();
  Object.entries(values || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, value);
  });
  return params.toString();
};

export const api = {
  getCatalogs: () => request('/api/catalogs'),
  getCatalog: (addonId, type, catalogId, extra = {}) => (
    request(`/api/catalog/${encodeURIComponent(addonId)}/${encodeURIComponent(type)}/${encodeURIComponent(catalogId)}?${queryString(extra)}`)
  ),
  getPlatformContent: (platform, extra = {}) => (
    request(`/api/platforms/content?platform=${encodeURIComponent(platform)}&${queryString(extra)}`)
  ),
  resolveImdbId: (type, id) => request(`/api/tmdb-to-imdb/${encodeURIComponent(type)}/${encodeURIComponent(id)}`),
  getMeta: (type, id) => request(`/api/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}`),
  getSimilar: (type, id) => request(`/api/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}/similar`),
  getPersonCredits: (nameOrId) => request(`/api/person/${encodeURIComponent(nameOrId)}/credits`),
  getStreams: (type, id) => request(`/api/streams/${encodeURIComponent(type)}/${encodeURIComponent(id)}`),
  getStreamsLive: (type, id, { onAddonStreams, onDone, onError } = {}) => {
    const fullUrl = `${API_BASE}/api/streams/${encodeURIComponent(type)}/${encodeURIComponent(id)}/live`;
    const es = new EventSource(fullUrl);
    es.addEventListener('addon_streams', (event) => {
      try {
        const data = JSON.parse(event.data);
        onAddonStreams?.(data);
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    });
    es.addEventListener('done', (event) => {
      try {
        const data = JSON.parse(event.data);
        onDone?.(data);
      } catch {
        onDone?.({ done: true });
      }
      es.close();
    });
    es.addEventListener('error', (event) => {
      try {
        const data = event.data ? JSON.parse(event.data) : null;
        onError?.(data || new Error('Stream connection closed.'));
      } catch {
        onError?.(event);
      }
      es.close();
    });
    return () => {
      try {
        es.close();
      } catch {}
    };
  },
  resolveDirectStream: (url) => request(`/api/resolve-direct-stream?url=${encodeURIComponent(url)}`),
  getSubtitles: (type, id) => request(`/api/subtitles/${encodeURIComponent(type)}/${encodeURIComponent(id)}`),
  getAddonsHealth: () => request('/api/addons/health'),
  refreshAddons: () => {
    memoryCache.clear();
    return request('/api/addons/refresh', { method: 'POST' });
  },
  search: (q) => request(`/api/search?${queryString({ q })}`),
  getAddons: async () => {
    const list = await request('/api/addons');
    try {
      const removedIds = JSON.parse(localStorage.getItem('mmh_removed_addons') || '[]');
      const toggledStates = JSON.parse(localStorage.getItem('mmh_toggled_addons') || '{}');
      return (list || [])
        .filter((a) => !removedIds.includes(a.id))
        .map((a) => (toggledStates[a.id] !== undefined ? { ...a, enabled: toggledStates[a.id] } : a));
    } catch {
      return list || [];
    }
  },
  addAddon: (url, name) => {
    memoryCache.clear();
    return request('/api/addons', {
      method: 'POST',
      body: JSON.stringify({ url, name })
    });
  },
  removeAddon: (id) => {
    memoryCache.clear();
    try {
      const removedIds = JSON.parse(localStorage.getItem('mmh_removed_addons') || '[]');
      if (!removedIds.includes(id)) {
        removedIds.push(id);
        localStorage.setItem('mmh_removed_addons', JSON.stringify(removedIds));
      }
    } catch {}
    return request(`/api/addons/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => true);
  },
  toggleAddon: async (id) => {
    memoryCache.clear();
    try {
      const toggledStates = JSON.parse(localStorage.getItem('mmh_toggled_addons') || '{}');
      const curList = await request('/api/addons').catch(() => []);
      const item = curList.find((a) => a.id === id);
      const currentEnabled = toggledStates[id] !== undefined ? toggledStates[id] : (item?.enabled ?? true);
      toggledStates[id] = !currentEnabled;
      localStorage.setItem('mmh_toggled_addons', JSON.stringify(toggledStates));
    } catch {}
    return request(`/api/addons/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' }).catch(() => true);
  },
  getConfig: () => request('/api/config'),
  saveConfig: (data) => {
    memoryCache.clear();
    return request('/api/config', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  validateTmdbKey: (key) => request(`/api/validate-tmdb?key=${encodeURIComponent(key)}`),
  getCloudStreamRepos: () => request('/api/cloudstream/repos'),
  addCloudStreamRepo: (url) => {
    memoryCache.clear();
    return request('/api/cloudstream/repos', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  },
  removeCloudStreamRepo: (id) => {
    memoryCache.clear();
    return request(`/api/cloudstream/repos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  toggleCloudStreamMaster: () => {
    memoryCache.clear();
    return request('/api/cloudstream/toggle', { method: 'PATCH' });
  },
  toggleCloudStreamRepo: (id) => {
    memoryCache.clear();
    return request(`/api/cloudstream/repos/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' });
  },
  toggleCloudStreamPlugin: (repoId, pluginId) => {
    memoryCache.clear();
    return request(`/api/cloudstream/repos/${encodeURIComponent(repoId)}/plugins/${encodeURIComponent(pluginId)}/toggle`, { method: 'PATCH' });
  },
  enableAllCloudStreamPlugins: (repoId) => {
    memoryCache.clear();
    return request(`/api/cloudstream/repos/${encodeURIComponent(repoId)}/enable-all`, { method: 'PATCH' });
  },
  disableAllCloudStreamPlugins: (repoId) => {
    memoryCache.clear();
    return request(`/api/cloudstream/repos/${encodeURIComponent(repoId)}/disable-all`, { method: 'PATCH' });
  },
  getSeasonEpisodes: (id, seasonNumber) => request(`/api/meta/series/${encodeURIComponent(id)}/season/${seasonNumber}`),
  getIptvPlaylists: async () => {
    const res = await request('/api/iptv/playlists').catch(() => ({ playlists: [] }));
    const list = res?.playlists || [];
    try {
      const removedIds = JSON.parse(localStorage.getItem('mmh_removed_iptv') || '[]');
      const toggledStates = JSON.parse(localStorage.getItem('mmh_toggled_iptv') || '{}');
      const filtered = list
        .filter((p) => !removedIds.includes(p.id))
        .map((p) => (toggledStates[p.id] !== undefined ? { ...p, enabled: toggledStates[p.id] } : p));
      return { playlists: filtered };
    } catch {
      return { playlists: list };
    }
  },
  addIptvPlaylist: (data) => {
    memoryCache.clear();
    return request('/api/iptv/playlists', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  removeIptvPlaylist: (id) => {
    memoryCache.clear();
    try {
      const removedIds = JSON.parse(localStorage.getItem('mmh_removed_iptv') || '[]');
      if (!removedIds.includes(id)) {
        removedIds.push(id);
        localStorage.setItem('mmh_removed_iptv', JSON.stringify(removedIds));
      }
    } catch {}
    return request(`/api/iptv/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => true);
  },
  toggleIptvPlaylist: async (id) => {
    memoryCache.clear();
    try {
      const toggledStates = JSON.parse(localStorage.getItem('mmh_toggled_iptv') || '{}');
      const res = await request('/api/iptv/playlists').catch(() => ({ playlists: [] }));
      const item = (res?.playlists || []).find((p) => p.id === id);
      const current = toggledStates[id] !== undefined ? toggledStates[id] : (item?.enabled ?? true);
      toggledStates[id] = !current;
      localStorage.setItem('mmh_toggled_iptv', JSON.stringify(toggledStates));
    } catch {}
    return request(`/api/iptv/playlists/${encodeURIComponent(id)}/toggle`, { method: 'PATCH' }).catch(() => true);
  },
  getIptvChannels: (extra = {}) => request(`/api/iptv/channels?${queryString(extra)}`),
  getIptvCategories: () => request('/api/iptv/categories'),
  getIptvStream: (id) => request(`/api/iptv/stream/${encodeURIComponent(id)}`),
  refreshIptvChannels: () => {
    memoryCache.clear();
    return request('/api/iptv/refresh', { method: 'POST' });
  }
};

const readStorage = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

export const library = {
  get: () => readStorage('library', []),
  has: (id) => library.get().some((item) => item.id === id),
  add: (item) => {
    const items = library.get();
    if (!items.some((saved) => saved.id === item.id)) {
      localStorage.setItem('library', JSON.stringify([...items, item]));
    }
  },
  remove: (id) => localStorage.setItem('library', JSON.stringify(
    library.get().filter((item) => item.id !== id)
  ))
};

export const progress = {
  get: () => readStorage('progress', {}),
  set: (id, value) => localStorage.setItem('progress', JSON.stringify({
    ...progress.get(),
    [id]: { ...value, updatedAt: Date.now() }
  })),
  getOne: (id) => progress.get()[id] || null,
  getAll: () => Object.values(progress.get()).sort((a, b) => b.updatedAt - a.updatedAt)
};
