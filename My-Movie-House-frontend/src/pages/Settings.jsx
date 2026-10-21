import { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../api.js';

/* ── Popular Addon Presets ── */
const ADDON_PRESETS = [
  {
    id: 'tmdb-preset',
    group: 'TMDB',
    color: 'from-blue-600/20 to-blue-950/20',
    accent: '#01b4e4',
    icon: '🎬',
    name: 'TMDB Addon',
    description: 'Official TMDB catalog: trending movies & series, top-rated, upcoming, popular. No API key needed.',
    url: 'https://94c8cb9f702d-tmdb-addon.baby-beamup.club/manifest.json',
    badge: 'Free · No Key',
    fields: [],
  },
  {
    id: 'tmdb-catalog',
    group: 'TMDB',
    color: 'from-blue-600/20 to-blue-950/20',
    accent: '#01b4e4',
    icon: '🔑',
    name: 'TMDB with API Key',
    description: 'Full TMDB catalog with your own API key — unlocks personalized lists, watchlists & account sync.',
    urlTemplate: 'https://94c8cb9f702d-tmdb-addon.baby-beamup.club/{API_KEY}/manifest.json',
    badge: 'Requires Key',
    fields: [
      { key: 'API_KEY', label: 'TMDB API Key', placeholder: 'e.g. 1cf50e6248dc27062...', type: 'text' },
    ],
  },
  {
    id: 'trakt-preset',
    group: 'Trakt.tv',
    color: 'from-red-600/20 to-red-950/20',
    accent: '#ed1c24',
    icon: '📺',
    name: 'Trakt.tv Addon',
    description: 'Trakt scrobbling & lists: trending, popular, anticipated movies and shows from Trakt community.',
    url: 'https://trakt.tv/manifest.json',
    badge: 'Community Lists',
    fields: [],
    altUrls: [
      { label: 'Stremio-Trakt (main)', url: 'https://stremio-trakt-addon.onrender.com/manifest.json' },
      { label: 'Deflix Trakt', url: 'https://deflix.tv/stremio-addon/trakt/manifest.json' },
    ],
  },
  {
    id: 'nuvio-preset',
    group: 'Nuvio',
    color: 'from-violet-600/20 to-violet-950/20',
    accent: '#7c3aed',
    icon: '💜',
    name: 'Nuvio Streams',
    description: 'Nuvio addon — curated streaming sources for movies & series with multi-source fallback.',
    url: 'https://nuvio.cyou/manifest.json',
    badge: 'Multi-Source',
    fields: [],
    altUrls: [
      { label: 'Nuvio Main', url: 'https://nuvio.cyou/manifest.json' },
      { label: 'Nuvio Backup', url: 'https://api.nuvio.cyou/manifest.json' },
    ],
  },
  {
    id: 'torrentio-preset',
    group: 'Torrentio',
    color: 'from-amber-600/20 to-amber-950/20',
    accent: '#f59e0b',
    icon: '⚡',
    name: 'Torrentio Multi-Streams',
    description: 'Premier multi-source video scraper: 4K, 1080p, 720p multi-quality video resources for movies and series.',
    url: 'https://torrentio.strem.fun/manifest.json',
    badge: 'Multi-Quality 4K/HD',
    fields: [],
  },
];

const GROUP_ORDER = ['TMDB', 'Torrentio', 'Trakt.tv', 'Nuvio'];

const PRESET_CS_REPOS = [
  {
    name: "Redowan's CloudStream (BDIX & South Asia)",
    description: "DhakaFlix, ICC FTP, MoviesFlix, EmwBD, Mp4Moviez, 9kMovies & high-speed BDIX mirrors.",
    url: "https://raw.githubusercontent.com/redowan99/Redowan-CloudStream/master/repo.json",
    badge: "🇧🇩 BDIX & Bangla",
    accent: "#10b981",
  },
  {
    name: "Phisher CloudStream Extensions",
    description: "86 extensions: HDHub4u, UHDmovies, Desicinemas, ShowBox, SuperStream, BanglaPlex, Anime, IPTV.",
    url: "https://raw.githubusercontent.com/phisher98/cloudstream-extensions-phisher/refs/heads/builds/repo.json",
    badge: "🔥 86 Plugins",
    accent: "#f59e0b",
  },
  {
    name: "Hexated CloudStream Extensions",
    description: "Popular multi-source scrapers for international movies, TV series, and anime.",
    url: "https://raw.githubusercontent.com/recloudstream/cloudstream-extensions-hexated/master/repo.json",
    badge: "Multi-Source",
    accent: "#6366f1",
  }
];

export default function Settings() {
  const [addons, setAddons] = useState([]);
  const [addonsHealth, setAddonsHealth] = useState({});
  const [refreshingAddons, setRefreshingAddons] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Preset installer state
  const [presetFields, setPresetFields] = useState({}); // { [presetId]: { fieldKey: value } }
  const [presetInstalling, setPresetInstalling] = useState(null);
  const [presetError, setPresetError] = useState('');
  const [presetSuccess, setPresetSuccess] = useState('');
  const [expandedPreset, setExpandedPreset] = useState(null);
  const [selectedAlt, setSelectedAlt] = useState({}); // { [presetId]: url }

  // Home Catalog Sections state
  const [allCatalogs, setAllCatalogs] = useState([]);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [enabledSectionKeys, setEnabledSectionKeys] = useState(new Set());
  const [sectionSearch, setSectionSearch] = useState('');
  const [sectionAddonFilter, setSectionAddonFilter] = useState('all');
  const [sectionWarning, setSectionWarning] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  // TMDB API Key state
  const [currentTmdbKey, setCurrentTmdbKey] = useState('');
  const [inputTmdbKey, setInputTmdbKey] = useState('');
  const [savingTmdbKey, setSavingTmdbKey] = useState(false);
  const [tmdbKeyMessage, setTmdbKeyMessage] = useState({ type: '', text: '' });

  // CloudStream Repos state
  const [csRepos, setCsRepos] = useState([]);
  const [csMasterEnabled, setCsMasterEnabled] = useState(true);
  const [csLoading, setCsLoading] = useState(true);
  const [csUrl, setCsUrl] = useState('');
  const [csSubmitting, setCsSubmitting] = useState(false);
  const [csMessage, setCsMessage] = useState({ type: '', text: '' });
  const [expandedRepoId, setExpandedRepoId] = useState(null);

  // ─── IPTV & Live TV State ───
  const [iptvPlaylists, setIptvPlaylists] = useState([]);
  const [iptvLoading, setIptvLoading] = useState(true);
  const [iptvTab, setIptvTab] = useState('url'); // 'url' | 'file' | 'xtream'
  const [iptvName, setIptvName] = useState('');
  const [iptvUrl, setIptvUrl] = useState('');
  const [iptvRawContent, setIptvRawContent] = useState('');
  const [iptvFileName, setIptvFileName] = useState('');
  const [iptvServer, setIptvServer] = useState('');
  const [iptvUser, setIptvUser] = useState('');
  const [iptvPass, setIptvPass] = useState('');
  const [iptvSubmitting, setIptvSubmitting] = useState(false);
  const [iptvRefreshing, setIptvRefreshing] = useState(false);
  const [iptvMessage, setIptvMessage] = useState({ type: '', text: '' });

  const refreshIptv = useCallback(() => {
    return api.getIptvPlaylists()
      .then((data) => setIptvPlaylists(data?.playlists || []))
      .catch((err) => console.error('Failed to load IPTV playlists:', err))
      .finally(() => setIptvLoading(false));
  }, []);

  const handleAddIptv = async (preset = null) => {
    setIptvSubmitting(true);
    setIptvMessage({ type: '', text: '' });
    try {
      let payload = {};
      if (preset) {
        payload = { name: preset.name, url: preset.url, type: 'm3u' };
      } else if (iptvTab === 'url') {
        if (!iptvUrl.trim()) throw new Error('Please enter an M3U or M3U8 playlist URL.');
        payload = { name: iptvName.trim() || 'Custom M3U Playlist', url: iptvUrl.trim(), type: 'm3u' };
      } else if (iptvTab === 'file') {
        if (!iptvRawContent.trim()) throw new Error('Please select an M3U file or paste playlist text.');
        payload = { name: iptvName.trim() || iptvFileName || 'Uploaded M3U File', rawContent: iptvRawContent, type: 'raw' };
      } else if (iptvTab === 'xtream') {
        if (!iptvServer.trim() || !iptvUser.trim() || !iptvPass.trim()) {
          throw new Error('Please enter Server URL, Username, and Password for Xtream Codes.');
        }
        payload = {
          name: iptvName.trim() || 'Xtream Codes IPTV',
          serverUrl: iptvServer.trim(),
          username: iptvUser.trim(),
          password: iptvPass.trim(),
          type: 'xtream'
        };
      }

      const res = await api.addIptvPlaylist(payload);
      if (res?.playlists) setIptvPlaylists(res.playlists);
      else await refreshIptv();

      setIptvMessage({ type: 'success', text: `✓ Playlist "${payload.name}" loaded successfully!` });
      setIptvName('');
      setIptvUrl('');
      setIptvRawContent('');
      setIptvFileName('');
      setIptvServer('');
      setIptvUser('');
      setIptvPass('');
      setTimeout(() => setIptvMessage({ type: '', text: '' }), 5000);
    } catch (err) {
      setIptvMessage({ type: 'error', text: err.message || 'Failed to add IPTV playlist.' });
    } finally {
      setIptvSubmitting(false);
    }
  };

  const handleToggleIptv = async (id) => {
    try {
      const res = await api.toggleIptvPlaylist(id);
      if (res?.playlists) setIptvPlaylists(res.playlists);
      else await refreshIptv();
    } catch (err) {
      setIptvMessage({ type: 'error', text: err.message });
    }
  };

  const handleRemoveIptv = async (id) => {
    try {
      const res = await api.removeIptvPlaylist(id);
      if (res?.playlists) setIptvPlaylists(res.playlists);
      else await refreshIptv();
    } catch (err) {
      setIptvMessage({ type: 'error', text: err.message });
    }
  };

  const handleRefreshIptvChannels = async () => {
    setIptvRefreshing(true);
    setIptvMessage({ type: '', text: '' });
    try {
      const res = await api.refreshIptvChannels();
      await refreshIptv();
      setIptvMessage({ type: 'success', text: `✓ Refreshed ${res?.count || 0} Live TV channels from all active playlists!` });
      setTimeout(() => setIptvMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      setIptvMessage({ type: 'error', text: err.message || 'Failed to refresh channels.' });
    } finally {
      setIptvRefreshing(false);
    }
  };

  const handleM3uFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIptvFileName(file.name);
    if (!iptvName) {
      setIptvName(file.name.replace(/\.[^/.]+$/, ''));
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setIptvRawContent(event.target.result || '');
    };
    reader.readAsText(file);
  };

  const fetchAllCatalogs = useCallback(async () => {
    try {
      setCatalogsLoading(true);
      const cats = await api.getCatalogs();
      const browseable = (cats || []).filter((c) => !c.extraRequired?.includes('search'));
      setAllCatalogs(browseable);

      let savedSet;
      try {
        const raw = localStorage.getItem('home_catalog_sections');
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 0) savedSet = new Set(arr);
        }
      } catch {}

      if (!savedSet) {
        const def = browseable.slice(0, 12).map((c) => `${c.addonId}:${c.type}:${c.id}`);
        savedSet = new Set(def);
        try { localStorage.setItem('home_catalog_sections', JSON.stringify(def)); } catch {}
      }
      setEnabledSectionKeys(savedSet);
    } catch {
      // ignore
    } finally {
      setCatalogsLoading(false);
    }
  }, []);

  const refreshCsRepos = () => {
    return api.getCloudStreamRepos()
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.repos || []);
        setCsRepos(list);
        if (data && typeof data.masterEnabled === 'boolean') {
          setCsMasterEnabled(data.masterEnabled);
        }
        if (list?.length > 0) {
          setExpandedRepoId((prev) => prev || list[0].id);
        }
      })
      .catch((err) => console.error('Failed to load CloudStream repos:', err))
      .finally(() => setCsLoading(false));
  };

  const refresh = () => api.getAddons().then(setAddons);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await api.getAddonsHealth();
      if (Array.isArray(res?.health)) {
        const map = {};
        for (const h of res.health) {
          map[h.id] = h;
        }
        setAddonsHealth(map);
      }
    } catch {}
  }, []);

  const handleRefreshAddons = async () => {
    setRefreshingAddons(true);
    try {
      await api.refreshAddons();
      const updatedList = await api.getAddons();
      setAddons(updatedList || []);
      await fetchHealth();
    } catch (err) {
      console.warn('Failed to refresh addons:', err);
    } finally {
      setRefreshingAddons(false);
    }
  };

  useEffect(() => {
    refresh().catch((r) => setError(r.message)).finally(() => setLoading(false));
    fetchHealth();
    refreshCsRepos();
    refreshIptv();
    fetchAllCatalogs();

    // Load persisted config (TMDB key & home sections) from backend disk
    api.getConfig().then((cfg) => {
      if (cfg?.tmdbApiKey) {
        setCurrentTmdbKey(cfg.tmdbApiKey);
        setInputTmdbKey(cfg.tmdbApiKey);
      }
      if (Array.isArray(cfg?.homeCatalogSections) && cfg.homeCatalogSections.length > 0) {
        setEnabledSectionKeys(new Set(cfg.homeCatalogSections));
      }
    }).catch(() => {});
  }, [fetchAllCatalogs, refreshIptv]);

  const handleAddCsRepo = async (urlToAdd) => {
    const targetUrl = (urlToAdd || csUrl).trim();
    if (!targetUrl) return;
    setCsSubmitting(true);
    setCsMessage({ type: '', text: '' });
    try {
      const res = await api.addCloudStreamRepo(targetUrl);
      const list = res?.repos || (Array.isArray(res) ? res : []);
      if (list.length > 0) {
        setCsRepos(list);
      }
      const repoName = res?.repo?.name || 'CloudStream';
      const pluginCount = res?.repo?.plugins?.length || (list[list.length - 1]?.plugins?.length) || 0;
      setCsMessage({
        type: 'success',
        text: `✓ Repository "${repoName}" installed with ${pluginCount} extensions!`
      });
      setCsUrl('');
      if (res?.repo?.id) setExpandedRepoId(res.repo.id);
      await refreshCsRepos();
      await fetchAllCatalogs();
      setTimeout(() => setCsMessage({ type: '', text: '' }), 5000);
    } catch (err) {
      setCsMessage({ type: 'error', text: err.message || 'Failed to install CloudStream repository.' });
    } finally {
      setCsSubmitting(false);
    }
  };

  const handleToggleCsRepo = async (repoId) => {
    try {
      const res = await api.toggleCloudStreamRepo(repoId);
      if (res?.repos) {
        setCsRepos(res.repos);
      } else {
        setCsRepos((prev) => prev.map((r) => (r.id === repoId ? { ...r, enabled: typeof res?.enabled === 'boolean' ? res.enabled : !r.enabled } : r)));
      }
      await fetchAllCatalogs();
    } catch (err) {
      setCsMessage({ type: 'error', text: err.message });
    }
  };

  const handleRemoveCsRepo = async (repoId) => {
    try {
      const res = await api.removeCloudStreamRepo(repoId);
      const list = res?.repos || (Array.isArray(res) ? res : null);
      if (list) {
        setCsRepos(list);
      } else {
        setCsRepos((prev) => prev.filter((r) => r.id !== repoId));
      }
      await fetchAllCatalogs();
    } catch (err) {
      setCsMessage({ type: 'error', text: err.message });
    }
  };

  const handleToggleCsPlugin = async (repoId, pluginId) => {
    try {
      const res = await api.toggleCloudStreamPlugin(repoId, pluginId);
      if (res?.repos) {
        setCsRepos(res.repos);
      } else {
        setCsRepos((prev) =>
          prev.map((r) => {
            if (r.id !== repoId) return r;
            return {
              ...r,
              plugins: (r.plugins || []).map((p) =>
                (p.internalName === pluginId || p.name === pluginId || p.id === pluginId)
                  ? { ...p, enabled: typeof res?.enabled === 'boolean' ? res.enabled : (p.enabled === false ? true : !p.enabled) }
                  : p
              )
            };
          })
        );
      }
      await fetchAllCatalogs();
    } catch (err) {
      setCsMessage({ type: 'error', text: err.message });
    }
  };

  const handleToggleCsMaster = async () => {
    try {
      const res = await api.toggleCloudStreamMaster();
      if (typeof res?.masterEnabled === 'boolean') {
        setCsMasterEnabled(res.masterEnabled);
      } else {
        setCsMasterEnabled((prev) => !prev);
      }
      await fetchAllCatalogs();
    } catch (err) {
      setCsMessage({ type: 'error', text: err.message || 'Failed to toggle CloudStream engine.' });
    }
  };

  const handleEnableAllPlugins = async (repoId) => {
    try {
      const res = await api.enableAllCloudStreamPlugins(repoId);
      const list = res?.repos || (Array.isArray(res) ? res : []);
      if (list.length > 0) setCsRepos(list);
      await fetchAllCatalogs();
    } catch (err) {
      setCsMessage({ type: 'error', text: err.message || 'Failed to enable plugins.' });
    }
  };

  const handleDisableAllPlugins = async (repoId) => {
    try {
      const res = await api.disableAllCloudStreamPlugins(repoId);
      const list = res?.repos || (Array.isArray(res) ? res : []);
      if (list.length > 0) setCsRepos(list);
      await fetchAllCatalogs();
    } catch (err) {
      setCsMessage({ type: 'error', text: err.message || 'Failed to disable plugins.' });
    }
  };

  // ─── Unified Sources Aggregation (Addons + CloudStream Scrapers) ───
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceFilterTab, setSourceFilterTab] = useState('all'); // 'all', 'active', 'disabled', 'addons', 'bdix', 'scrapers'

  const allSources = useMemo(() => {
    const list = [];

    // 1. Stremio Addons
    addons.forEach((a) => {
      list.push({
        sourceType: 'addon',
        sourceId: a.id,
        name: a.name,
        repoName: a.builtin ? 'Built-in System' : 'Stremio Addon',
        url: a.url,
        enabled: a.enabled !== false,
        builtin: a.builtin,
        badge: a.builtin ? 'System Addon' : 'Stremio Addon',
        isBanglaOrBdix: false,
        category: 'Catalog & Streams',
        description: a.url
      });
    });

    // 2. CloudStream Plugins & Scrapers
    csRepos.forEach((repo) => {
      (repo.plugins || []).forEach((p) => {
        const pId = p.internalName || p.name || p.id;
        const isBn = p.language === 'bn' ||
          (p.name && /dhaka|icc|emw|bangla|bdix/i.test(p.name)) ||
          /bdix/i.test(repo.name);
        list.push({
          sourceType: 'cloudstream',
          repoId: repo.id,
          pluginId: pId,
          sourceId: `${repo.id}:${pId}`,
          name: p.name,
          repoName: repo.name,
          url: p.url,
          iconUrl: p.iconUrl,
          enabled: csMasterEnabled && repo.enabled !== false && p.enabled !== false,
          isExplicitlyDisabled: p.enabled === false || repo.enabled === false || !csMasterEnabled,
          builtin: repo.builtin,
          badge: isBn ? '🇧🇩 BDIX & Bangla FTP' : 'CloudStream Scraper',
          isBanglaOrBdix: isBn,
          language: p.language || 'en',
          category: p.tvTypes?.join(', ') || 'Movies, Series',
          description: p.description || `${repo.name} Provider`
        });
      });
    });

    return list;
  }, [addons, csRepos, csMasterEnabled]);

  const filteredSources = useMemo(() => {
    let result = allSources;
    const q = sourceSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.repoName.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q)) ||
        (s.url && s.url.toLowerCase().includes(q))
      );
    }
    if (sourceFilterTab === 'active') {
      result = result.filter((s) => s.enabled);
    } else if (sourceFilterTab === 'disabled') {
      result = result.filter((s) => !s.enabled);
    } else if (sourceFilterTab === 'addons') {
      result = result.filter((s) => s.sourceType === 'addon');
    } else if (sourceFilterTab === 'bdix') {
      result = result.filter((s) => s.isBanglaOrBdix);
    } else if (sourceFilterTab === 'scrapers') {
      result = result.filter((s) => s.sourceType === 'cloudstream' && !s.isBanglaOrBdix);
    }
    return result;
  }, [allSources, sourceSearch, sourceFilterTab]);

  const handleToggleAnySource = async (src) => {
    if (src.sourceType === 'addon') {
      await toggle(src.sourceId);
    } else if (src.sourceType === 'cloudstream') {
      await handleToggleCsPlugin(src.repoId, src.pluginId);
    }
  };

  const handleToggleAllFiltered = async (targetState) => {
    try {
      // Toggle addons
      const addonTargets = filteredSources.filter((s) => s.sourceType === 'addon' && s.enabled !== targetState);
      for (const a of addonTargets) {
        await api.toggleAddon(a.sourceId);
      }
      if (addonTargets.length > 0) await refresh();

      // Toggle cloudstream plugins
      const csTargets = filteredSources.filter((s) => s.sourceType === 'cloudstream' && s.enabled !== targetState);
      for (const cs of csTargets) {
        await api.toggleCloudStreamPlugin(cs.repoId, cs.pluginId);
      }
      if (csTargets.length > 0) await refreshCsRepos();
    } catch (err) {
      console.error('Error toggling filtered sources:', err);
    }
  };

  const handleSaveTmdbKey = async (e) => {
    if (e) e.preventDefault();
    if (!inputTmdbKey.trim()) return;
    setSavingTmdbKey(true);
    setTmdbKeyMessage({ type: '', text: '' });
    try {
      const res = await api.saveConfig({ tmdbApiKey: inputTmdbKey.trim() });
      if (res?.success) {
        setCurrentTmdbKey(inputTmdbKey.trim());
        setTmdbKeyMessage({ type: 'success', text: '✓ TMDB API Key verified & saved permanently to disk!' });
        setTimeout(() => setTmdbKeyMessage({ type: '', text: '' }), 5000);
      }
    } catch (err) {
      setTmdbKeyMessage({ type: 'error', text: err.message || 'Invalid TMDB API Key. Please verify key.' });
    } finally {
      setSavingTmdbKey(false);
    }
  };

  const toggleSection = (catKey) => {
    setSectionWarning('');
    setEnabledSectionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(catKey)) {
        next.delete(catKey);
      } else {
        next.add(catKey);
      }
      const arr = Array.from(next);
      try { localStorage.setItem('home_catalog_sections', JSON.stringify(arr)); } catch {}
      api.saveConfig({ homeCatalogSections: arr }).catch(() => {});
      return next;
    });
  };

  const resetDefaultSections = () => {
    setSectionWarning('');
    const def = allCatalogs.slice(0, 12).map((c) => `${c.addonId}:${c.type}:${c.id}`);
    const nextSet = new Set(def);
    setEnabledSectionKeys(nextSet);
    try { localStorage.setItem('home_catalog_sections', JSON.stringify(def)); } catch {}
    api.saveConfig({ homeCatalogSections: def }).catch(() => {});
  };

  const clearAllSections = () => {
    setSectionWarning('');
    const nextSet = new Set();
    setEnabledSectionKeys(nextSet);
    try { localStorage.setItem('home_catalog_sections', JSON.stringify([])); } catch {}
    api.saveConfig({ homeCatalogSections: [] }).catch(() => {});
  };

  const catalogGroups = useMemo(() => {
    const map = new Map();

    allCatalogs.forEach((c) => {
      let groupId = 'tmdb-builtin';
      let groupName = 'TMDB (Official Database)';
      let groupType = 'Built-in Catalogs';
      let icon = '🎬';

      if (c.sourceType === 'cloudstream' || c.addonId?.startsWith('cloudstream-')) {
        const rName = c.repoName || 'CloudStream Extensions';
        groupId = `cs-${rName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        groupName = rName.startsWith('CloudStream') ? rName : `CloudStream: ${rName}`;
        groupType = 'CloudStream Repository';
        icon = '⚡';
      } else if (c.addonId !== 'tmdb-builtin') {
        groupId = `addon-${c.addonId}`;
        groupName = c.addonName || 'Stremio Addon';
        groupType = 'Stremio Addon';
        icon = '🍿';
      }

      if (!map.has(groupId)) {
        map.set(groupId, {
          groupId,
          groupName,
          groupType,
          icon,
          catalogs: []
        });
      }
      map.get(groupId).catalogs.push(c);
    });

    return Array.from(map.values());
  }, [allCatalogs]);

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const collapseAllGroups = () => {
    setCollapsedGroups(new Set(catalogGroups.map((g) => g.groupId)));
  };

  const expandAllGroups = () => {
    setCollapsedGroups(new Set());
  };

  const toggleAllInGroup = (groupCatalogs, targetEnable) => {
    setEnabledSectionKeys((prev) => {
      const next = new Set(prev);
      groupCatalogs.forEach((c) => {
        const key = `${c.addonId}:${c.type}:${c.id}`;
        if (targetEnable) next.add(key);
        else next.delete(key);
      });
      const arr = Array.from(next);
      try { localStorage.setItem('home_catalog_sections', JSON.stringify(arr)); } catch {}
      api.saveConfig({ homeCatalogSections: arr }).catch(() => {});
      return next;
    });
  };

  const addAddon = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.addAddon(url.trim(), name.trim() || undefined);
      setUrl('');
      setName('');
      await refresh();
      await fetchAllCatalogs();
    } catch (r) {
      setError(r.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (id) => {
    setError('');
    try {
      const updated = await api.toggleAddon(id);
      setAddons((cur) => cur.map((a) => a.id === id ? updated : a));
      await fetchAllCatalogs();
    } catch (r) { setError(r.message); }
  };

  const remove = async (id) => {
    setError('');
    try {
      await api.removeAddon(id);
      setAddons((cur) => cur.filter((a) => a.id !== id));
      await fetchAllCatalogs();
    } catch (r) { setError(r.message); }
  };

  // Install a preset addon
  const installPreset = async (preset) => {
    setPresetError('');
    setPresetSuccess('');
    setPresetInstalling(preset.id);
    try {
      // Special handler for TMDB with API Key -> activates native TMDB provider
      if (preset.id === 'tmdb-catalog') {
        const key = (presetFields[preset.id]?.API_KEY || inputTmdbKey || '').trim();
        if (!key) {
          setPresetError('Please enter your TMDB API Key.');
          setPresetInstalling(null);
          return;
        }
        await api.saveConfig({ tmdbApiKey: key });
        setCurrentTmdbKey(key);
        setInputTmdbKey(key);
        await refresh();
        setPresetSuccess('TMDB API Key configured and activated successfully!');
        setExpandedPreset(null);
        setTimeout(() => setPresetSuccess(''), 4000);
        setPresetInstalling(null);
        return;
      }

      let finalUrl = selectedAlt[preset.id] || preset.url || '';

      // If template URL, replace field placeholders
      if (preset.urlTemplate) {
        finalUrl = preset.urlTemplate;
        const fields = presetFields[preset.id] || {};
        for (const field of preset.fields) {
          const val = fields[field.key]?.trim() || '';
          if (!val) {
            setPresetError(`Please enter ${field.label} to use this addon.`);
            setPresetInstalling(null);
            return;
          }
          finalUrl = finalUrl.replace(`{${field.key}}`, encodeURIComponent(val));
        }
      }

      if (!finalUrl) {
        setPresetError('No URL available for this addon.');
        setPresetInstalling(null);
        return;
      }

      await api.addAddon(finalUrl, preset.name);
      await refresh();
      setPresetSuccess(`${preset.name} installed successfully!`);
      setExpandedPreset(null);
      setTimeout(() => setPresetSuccess(''), 3000);
    } catch (r) {
      setPresetError(r.message || 'Failed to install addon.');
    } finally {
      setPresetInstalling(null);
    }
  };

  const installedUrls = new Set(addons.map((a) => a.url.replace(/\/+$/, '')));
  const isInstalled = (preset) => {
    if (preset.url && installedUrls.has(preset.url.replace(/\/+$/, ''))) return true;
    if (preset.altUrls) {
      return preset.altUrls.some((alt) => installedUrls.has(alt.url.replace(/\/+$/, '')));
    }
    return false;
  };

  return (
    <div className="mx-auto max-w-4xl pb-16">

      {/* Header */}
      <div className="spatial-card mb-8 rounded-3xl p-6 sm:p-8 border border-white/15">
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-full bg-blue-600/30 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-300 border border-blue-400/40">
            My-Movie-House
          </span>
          <span className="chip rounded-full px-2.5 py-0.5 text-xs text-white/70 font-semibold">
            Engineered by Sakibur Rahman
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">Addon Management</h1>
        <p className="mt-2 text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
          Install Stremio-compatible catalog and streaming addons — TMDB, Trakt.tv, Nuvio, and more.
        </p>
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/*  TMDB API CONFIGURATION (PERSISTENT ON DISK)   */}
      {/* ══════════════════════════════════════════════ */}
      <section className="spatial-card mb-8 rounded-3xl p-6 sm:p-8 border border-white/15">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600/30 text-blue-300 font-bold border border-blue-400/30">
            🎬
          </span>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">TMDB API Configuration</h2>
            <p className="text-xs text-slate-300">
              Your TMDB API Key powers official movie/series catalogs, high-res posters, and streaming providers. Saved permanently on disk.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveTmdbKey} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              TMDB API Key (v3 auth)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={inputTmdbKey}
                onChange={(e) => setInputTmdbKey(e.target.value)}
                placeholder="e.g. 1cf50e6248dc270629e802686245c2c8"
                className="flex-1 spatial-input rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-white/35 font-mono"
              />
              <button
                type="submit"
                disabled={savingTmdbKey || !inputTmdbKey.trim()}
                className="btn-spatial-blue shrink-0 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-bold shadow-md disabled:opacity-50"
              >
                {savingTmdbKey ? 'Verifying...' : 'Save & Verify Key'}
              </button>
            </div>
          </div>

          {tmdbKeyMessage.text && (
            <div className={`rounded-xl p-3 text-xs font-semibold border ${
              tmdbKeyMessage.type === 'success'
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-950/50 text-rose-300 border-rose-500/40'
            }`}>
              {tmdbKeyMessage.text}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between text-[11px] text-white/50 pt-1">
            <span>
              Status: <strong className="text-emerald-400 font-semibold">{currentTmdbKey ? 'Active (Saved in config.json)' : 'Default Key Active'}</strong>
            </span>
            <a
              href="https://www.themoviedb.org/settings/api"
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
            >
              Get Free TMDB API Key ↗
            </a>
          </div>
        </form>
      </section>

      {/* ══════════════════════════════════════════════ */}
      {/*  CLOUDSTREAM REPOSITORIES & EXTENSIONS         */}
      {/* ══════════════════════════════════════════════ */}
      <section className="spatial-card mb-10 rounded-3xl p-6 sm:p-8 border border-emerald-500/25 bg-gradient-to-br from-emerald-950/15 via-black/40 to-slate-950/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-400/30 text-lg">
              ⚡
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white">CloudStream & BDIX Extensions</h2>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
                  Direct Scraping & FTP
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Install CloudStream .json repositories (like Redowan's BDIX repo) to stream directly from DhakaFlix, ICC FTP, MoviesFlix, EmwBD, and more.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleCsMaster}
              className={`rounded-xl px-4 py-2 text-xs font-bold border transition-all flex items-center gap-2 ${
                csMasterEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-lg shadow-emerald-500/10'
                  : 'bg-rose-500/20 text-rose-300 border-rose-400/40'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${csMasterEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span>{csMasterEnabled ? 'CloudStream Engine: Active' : 'CloudStream Engine: Paused'}</span>
            </button>
          </div>
        </div>

        {/* Preset Quick Repos */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {PRESET_CS_REPOS.map((preset) => {
            const isInstalled = csRepos.some((r) => r.url === preset.url || r.rawUrl === preset.url);
            return (
              <div
                key={preset.url}
                className={`rounded-2xl border p-4 transition-all duration-200 ${
                  isInstalled
                    ? 'border-emerald-500/40 bg-emerald-950/20'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{preset.name}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300 border border-white/15">
                        {preset.badge}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/60 leading-relaxed">
                      {preset.description}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                  <span className="truncate text-[10px] font-mono text-white/40 max-w-[200px]">
                    {preset.url}
                  </span>
                  {isInstalled ? (
                    <span className="rounded-lg bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-[11px] font-bold text-emerald-300">
                      ✓ Installed
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={csSubmitting}
                      onClick={() => handleAddCsRepo(preset.url)}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 text-[11px] font-bold transition disabled:opacity-50"
                    >
                      {csSubmitting ? 'Installing...' : '+ 1-Click Install'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add custom repo form */}
        <form onSubmit={(e) => { e.preventDefault(); handleAddCsRepo(); }} className="space-y-3 mb-6">
          <label className="block text-xs font-semibold text-slate-200">
            Install Custom CloudStream Repository
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={csUrl}
              onChange={(e) => setCsUrl(e.target.value)}
              placeholder="https://raw.githubusercontent.com/.../repo.json or .../manifest.json"
              className="flex-1 spatial-input rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-white/35 font-mono"
            />
            <button
              type="submit"
              disabled={csSubmitting || !csUrl.trim()}
              className="btn-spatial-blue shrink-0 rounded-xl px-5 py-2.5 text-xs sm:text-sm font-bold shadow-md disabled:opacity-50 !bg-emerald-600 hover:!bg-emerald-500"
            >
              {csSubmitting ? 'Fetching Repo…' : 'Add Repository'}
            </button>
          </div>
          <p className="text-[11px] text-white/50">
            Supports official CloudStream repo URLs, GitHub links, and auto-strips accidental <code>/manifest.json</code> suffixes.
          </p>

          {csMessage.text && (
            <div className={`rounded-xl p-3 text-xs font-semibold border ${
              csMessage.type === 'success'
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-950/50 text-rose-300 border-rose-500/40'
            }`}>
              {csMessage.text}
            </div>
          )}
        </form>

        {/* Installed CloudStream Repos & Plugin Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/80">
              Installed Repositories ({csRepos.length})
            </h3>
            {csLoading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            )}
          </div>

          {csRepos.length === 0 && !csLoading && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-white/40">
              No CloudStream repositories installed yet. Click "1-Click Install" above on Redowan's BDIX Repo to start!
            </div>
          )}

          {csRepos.map((repo) => {
            const isExpanded = expandedRepoId === repo.id;
            const enabledPluginsCount = (repo.plugins || []).filter((p) => p.enabled !== false).length;

            return (
              <div
                key={repo.id}
                className="rounded-2xl border border-white/15 bg-black/40 overflow-hidden shadow-lg transition-all"
              >
                {/* Repo Header */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border-b border-white/10">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h4 className="font-bold text-white text-base">{repo.name}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        repo.enabled !== false
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                          : 'bg-white/5 text-white/40 border border-white/10'
                      }`}>
                        {repo.enabled !== false ? '● Active' : '○ Disabled'}
                      </span>
                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-400/30">
                        {enabledPluginsCount} / {(repo.plugins || []).length} Extensions Active
                      </span>
                    </div>
                    {repo.description && (
                      <p className="text-xs text-white/60 mb-1">{repo.description}</p>
                    )}
                    <span className="text-[10px] font-mono text-white/35 truncate block max-w-md">
                      {repo.url}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleCsRepo(repo.id)}
                      className="btn-glass rounded-xl px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white"
                    >
                      {repo.enabled !== false ? 'Disable Repo' : 'Enable Repo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedRepoId(isExpanded ? null : repo.id)}
                      className="rounded-xl bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-bold text-white transition"
                    >
                      {isExpanded ? 'Hide Extensions ▲' : 'Manage Extensions ▼'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveCsRepo(repo.id)}
                      className="btn-glass rounded-xl px-3 py-1.5 text-xs font-bold text-rose-300 hover:!bg-rose-950/50 hover:border-rose-400/40"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Plugins List (Collapsible) */}
                {isExpanded && (
                  <div className="p-4 bg-black/20">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-white/60">Toggle individual scrapers & FTP servers (Total: {(repo.plugins || []).length}):</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEnableAllPlugins(repo.id)}
                          className="rounded-lg bg-emerald-600/30 hover:bg-emerald-600 border border-emerald-400/30 px-2.5 py-1 text-[11px] font-bold text-emerald-300 hover:text-white transition"
                        >
                          ✓ Enable All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisableAllPlugins(repo.id)}
                          className="rounded-lg bg-rose-600/20 hover:bg-rose-600 border border-rose-400/30 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:text-white transition"
                        >
                          ✕ Disable All
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                      {(repo.plugins || []).map((plugin) => {
                        const pluginId = plugin.internalName || plugin.name;
                        const isPluginActive = plugin.enabled !== false;
                        const isBangla = plugin.language === 'bn' || (plugin.name && (plugin.name.toLowerCase().includes('dhaka') || plugin.name.toLowerCase().includes('icc') || plugin.name.toLowerCase().includes('emw')));

                        return (
                          <div
                            key={pluginId}
                            onClick={() => handleToggleCsPlugin(repo.id, pluginId)}
                            className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-all ${
                              isPluginActive
                                ? 'border-emerald-500/35 bg-emerald-950/15 hover:border-emerald-500/50'
                                : 'border-white/10 bg-white/[0.01] opacity-60 hover:opacity-100 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              {plugin.iconUrl ? (
                                <img
                                  src={plugin.iconUrl}
                                  alt={plugin.name}
                                  className="h-7 w-7 rounded-lg object-contain bg-black/40 p-0.5 border border-white/10 shrink-0"
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              ) : (
                                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-bold text-white/80">
                                  {plugin.name.charAt(0)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-bold text-white">
                                    {plugin.name}
                                  </span>
                                  {isBangla && (
                                    <span className="rounded bg-emerald-500/20 text-emerald-300 px-1 py-0.2 text-[8px] font-bold shrink-0">
                                      🇧🇩 BDIX
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-white/40">
                                  <span>{plugin.language ? plugin.language.toUpperCase() : 'MULTI'}</span>
                                  {plugin.tvTypes?.length > 0 && (
                                    <>
                                      <span>·</span>
                                      <span className="truncate">{plugin.tvTypes.slice(0, 2).join(', ')}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleCsPlugin(repo.id, pluginId);
                              }}
                              className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold transition ${
                                isPluginActive
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                  : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {isPluginActive ? '✓ ON' : 'OFF'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ══════════════════════════════════════════════ */}
      {/*  LIVE TV & IPTV (M3U / M3U8 / XTREAM CODES)    */}
      {/* ══════════════════════════════════════════════ */}
      <section className="spatial-card mb-10 rounded-3xl p-6 sm:p-8 border border-red-500/30 bg-gradient-to-br from-red-950/20 via-black/45 to-slate-950/45 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-red-600/30 text-red-300 font-bold border border-red-500/40 text-xl shadow-lg">
              📡
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">Live TV & IPTV Manager</h2>
                <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-[11px] font-bold text-red-300 border border-red-400/30">
                  M3U · M3U8 · Xtream Codes
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Add any playable IPTV playlist via direct M3U/M3U8 URL, uploaded file, or Xtream Codes credentials.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefreshIptvChannels}
              disabled={iptvRefreshing}
              className="btn-glass flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
              title="Reload and verify channels from all active playlists"
            >
              <span className={iptvRefreshing ? 'animate-spin' : ''}>🔄</span>
              <span>{iptvRefreshing ? 'Refreshing...' : 'Refresh Channels'}</span>
            </button>
            <a
              href="/iptv"
              className="btn-spatial-blue flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold shadow-md shadow-blue-600/30"
            >
              <span>📺</span> Open Live TV Page
            </a>
          </div>
        </div>

        {/* ─── Mode Switcher Tabs ─── */}
        <div className="flex flex-wrap items-center gap-1.5 mb-5 border-b border-white/10 pb-3">
          {[
            { id: 'url', label: '🔗 M3U / M3U8 Link', icon: '🌐' },
            { id: 'file', label: '📁 Upload M3U File / Text', icon: '📄' },
            { id: 'xtream', label: '🔑 Xtream Codes API', icon: '⚡' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setIptvTab(tab.id);
                setIptvMessage({ type: '', text: '' });
              }}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 ${
                iptvTab === tab.id
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/40 border border-red-400/50'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ─── Form Content ─── */}
        <div className="space-y-4">
          {iptvTab === 'url' && (
            <div>
              <div className="grid gap-3 sm:grid-cols-2 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Playlist Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={iptvName}
                    onChange={(e) => setIptvName(e.target.value)}
                    placeholder="e.g. Bangladesh & Global Live TV"
                    className="w-full spatial-input rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/35"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    M3U / M3U8 Playlist URL *
                  </label>
                  <input
                    type="url"
                    value={iptvUrl}
                    onChange={(e) => setIptvUrl(e.target.value)}
                    placeholder="https://example.com/playlist.m3u or .m3u8"
                    className="w-full spatial-input rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/35 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {iptvTab === 'file' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Playlist Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={iptvName}
                    onChange={(e) => setIptvName(e.target.value)}
                    placeholder="e.g. My Offline IPTV File"
                    className="w-full spatial-input rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/35"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Select .m3u / .m3u8 File
                  </label>
                  <input
                    type="file"
                    accept=".m3u,.m3u8,.txt"
                    onChange={handleM3uFileUpload}
                    className="w-full text-xs text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-600/30 file:px-4 file:py-2.5 file:text-xs file:font-bold file:text-blue-300 hover:file:bg-blue-600 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Or Paste Raw M3U Content Directly
                </label>
                <textarea
                  rows={4}
                  value={iptvRawContent}
                  onChange={(e) => setIptvRawContent(e.target.value)}
                  placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-logo=&quot;...&quot; group-title=&quot;News&quot;, Channel 24&#10;http://.../live.m3u8"
                  className="w-full spatial-input rounded-xl px-4 py-2 text-xs text-white placeholder-white/30 font-mono resize-y"
                />
              </div>
            </div>
          )}

          {iptvTab === 'xtream' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Server URL (Host:Port) *
                  </label>
                  <input
                    type="text"
                    value={iptvServer}
                    onChange={(e) => setIptvServer(e.target.value)}
                    placeholder="e.g. http://iptvserver.net:8080"
                    className="w-full spatial-input rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/35 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Account Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={iptvName}
                    onChange={(e) => setIptvName(e.target.value)}
                    placeholder="e.g. My Xtream Subscription"
                    className="w-full spatial-input rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/35"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={iptvUser}
                    onChange={(e) => setIptvUser(e.target.value)}
                    placeholder="Xtream username"
                    className="w-full spatial-input rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/35 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={iptvPass}
                    onChange={(e) => setIptvPass(e.target.value)}
                    placeholder="Xtream password"
                    className="w-full spatial-input rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/35 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleAddIptv(null)}
              disabled={iptvSubmitting}
              className="btn-spatial-blue rounded-xl px-6 py-2.5 text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 disabled:opacity-50 flex items-center gap-2"
            >
              {iptvSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Connecting & Loading Streams...</span>
                </>
              ) : (
                <>
                  <span>+</span>
                  <span>Add {iptvTab === 'xtream' ? 'Xtream Account' : 'IPTV Playlist'}</span>
                </>
              )}
            </button>
          </div>

          {/* Alert Message */}
          {iptvMessage.text && (
            <div className={`rounded-xl p-3 text-xs font-semibold border ${
              iptvMessage.type === 'success'
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
            }`}>
              {iptvMessage.text}
            </div>
          )}
        </div>

        {/* ─── Installed Playlists List ─── */}
        <div className="mt-8 border-t border-white/10 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Active Playlists</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
                {iptvPlaylists.length}
              </span>
            </div>
            <span className="text-[11px] text-white/40">
              Streams play instantly inside My-Movie-House player
            </span>
          </div>

          {iptvPlaylists.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-white/50">
              No IPTV playlists added yet. Click one of the 1-Click presets above or add your M3U link to get started!
            </div>
          ) : (
            <div className="space-y-2.5">
              {iptvPlaylists.map((pl) => {
                const isActive = pl.enabled !== false;
                return (
                  <div
                    key={pl.id}
                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border p-4 transition-all duration-200 ${
                      isActive
                        ? 'border-red-500/40 bg-red-950/20 shadow-md shadow-red-950/30'
                        : 'border-white/10 bg-white/[0.02] opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-600/20 text-red-300 border border-red-500/30 text-base font-bold">
                        {pl.type === 'xtream' ? '🔑' : '📡'}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                            {pl.name}
                          </h4>
                          <span className="rounded-md bg-white/10 px-1.5 py-0.2 text-[9px] uppercase font-bold text-white/70 font-mono">
                            {pl.type}
                          </span>
                          {pl.builtin && (
                            <span className="rounded-md bg-blue-500/20 text-blue-300 px-1.5 py-0.2 text-[9px] font-bold">
                              Preset
                            </span>
                          )}
                          {pl.channelCount > 0 && (
                            <span className="rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.2 text-[10px] font-bold border border-emerald-500/30">
                              {pl.channelCount} Channels
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/50 truncate max-w-md font-mono">
                          {pl.url || pl.serverUrl || (pl.type === 'raw' ? 'Local M3U File / Text' : 'IPTV')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleToggleIptv(pl.id)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-500/30'
                            : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {isActive ? '✓ Active' : 'Disabled'}
                      </button>

                      {!pl.builtin && (
                        <button
                          type="button"
                          onClick={() => handleRemoveIptv(pl.id)}
                          title="Remove Playlist"
                          className="rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/30 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:text-white transition"
                        >
                          ✕ Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════ */}
      {/*  ALL SOURCES & PROVIDERS (SEARCH & ON/OFF)     */}
      {/* ══════════════════════════════════════════════ */}
      <section className="spatial-card mb-10 rounded-3xl p-6 sm:p-8 border border-blue-500/30 bg-gradient-to-br from-blue-950/20 via-black/50 to-slate-950/50 shadow-2xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600/30 text-blue-300 font-bold border border-blue-400/40 text-xl shadow-lg">
              🎛️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">All Sources & Providers</h2>
                <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold text-blue-300 border border-blue-400/30">
                  {allSources.filter((s) => s.enabled).length} / {allSources.length} Active
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Search and toggle any streaming provider, BDIX FTP server, or Stremio catalog addon ON or OFF.
              </p>
            </div>
          </div>

          {/* Quick Bulk Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleToggleAllFiltered(true)}
              className="rounded-xl bg-emerald-600/30 hover:bg-emerald-600 border border-emerald-400/30 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:text-white transition shadow-sm"
              title="Turn ON all visible sources matching current filter/search"
            >
              ✓ Turn ON All Shown ({filteredSources.length})
            </button>
            <button
              type="button"
              onClick={() => handleToggleAllFiltered(false)}
              className="rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-300 hover:text-white transition shadow-sm"
              title="Turn OFF all visible sources matching current filter/search"
            >
              ✕ Turn OFF All Shown
            </button>
          </div>
        </div>

        {/* Live Search Input ("surch on korar option") */}
        <div className="relative mb-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            value={sourceSearch}
            onChange={(e) => setSourceSearch(e.target.value)}
            placeholder="Search all sources & scrapers... (e.g. DhakaFlix, Cinemeta, Torrentio, BanglaPlex, Pengu, Sootio, UHDmovies, 9kMovies...)"
            className="w-full spatial-input rounded-2xl pl-11 pr-10 py-3 text-xs sm:text-sm text-white placeholder-white/35 font-medium border border-white/15 focus:border-blue-400"
          />
          {sourceSearch && (
            <button
              type="button"
              onClick={() => setSourceSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs bg-white/10 hover:bg-white/20 rounded-full h-6 w-6 grid place-items-center transition"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 mb-5 border-b border-white/10 pb-4">
          {[
            { id: 'all', label: 'All Sources', count: allSources.length },
            { id: 'active', label: '● Active (ON)', count: allSources.filter((s) => s.enabled).length },
            { id: 'disabled', label: '○ Disabled (OFF)', count: allSources.filter((s) => !s.enabled).length },
            { id: 'addons', label: 'Stremio Addons', count: allSources.filter((s) => s.sourceType === 'addon').length },
            { id: 'bdix', label: '🇧🇩 BDIX & Bangla FTP', count: allSources.filter((s) => s.isBanglaOrBdix).length },
            { id: 'scrapers', label: 'CloudStream Scrapers', count: allSources.filter((s) => s.sourceType === 'cloudstream' && !s.isBanglaOrBdix).length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSourceFilterTab(tab.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                sourceFilterTab === tab.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                sourceFilterTab === tab.id ? 'bg-black/30 text-white' : 'bg-white/10 text-white/50'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Results List / Grid */}
        {filteredSources.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
            <p className="text-sm font-bold text-white/60">No sources found matching "{sourceSearch}".</p>
            <p className="mt-1 text-xs text-white/35">Try searching with a different keyword or switch filter tab.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[560px] overflow-y-auto pr-1">
            {filteredSources.map((src) => {
              const isSourceActive = src.enabled;
              return (
                <div
                  key={src.sourceId}
                  onClick={() => handleToggleAnySource(src)}
                  className={`group relative flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition-all duration-200 select-none ${
                    isSourceActive
                      ? 'border-emerald-500/40 bg-emerald-950/20 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-950/40'
                      : 'border-white/10 bg-white/[0.02] opacity-70 hover:opacity-100 hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {src.iconUrl ? (
                          <img
                            src={src.iconUrl}
                            alt={src.name}
                            className="h-8 w-8 rounded-xl object-contain bg-black/40 p-1 border border-white/10 shrink-0"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-black border ${
                            src.sourceType === 'addon'
                              ? 'bg-blue-600/20 text-blue-300 border-blue-400/30'
                              : src.isBanglaOrBdix
                              ? 'bg-emerald-600/20 text-emerald-300 border-emerald-400/30'
                              : 'bg-amber-600/20 text-amber-300 border-amber-400/30'
                          }`}>
                            {src.name.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold text-white group-hover:text-blue-300 transition-colors">
                            {src.name}
                          </h4>
                          <span className="truncate text-[10px] font-mono text-white/40 block">
                            {src.repoName}
                          </span>
                        </div>
                      </div>

                      {/* On / Off Button Switch */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleAnySource(src);
                        }}
                        className={`shrink-0 rounded-xl px-3 py-1 text-xs font-black tracking-wide border transition-all ${
                          isSourceActive
                            ? 'bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/20'
                            : 'bg-white/5 text-white/50 border-white/15 hover:bg-white/15 hover:text-white'
                        }`}
                      >
                        {isSourceActive ? '● ON' : '○ OFF'}
                      </button>
                    </div>

                    {src.description && (
                      <p className="text-[11px] text-white/60 line-clamp-2 mb-2 leading-relaxed">
                        {src.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[10px] text-white/40">
                    <span className={`rounded-md px-1.5 py-0.5 font-bold ${
                      src.isBanglaOrBdix
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : src.sourceType === 'addon'
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {src.badge}
                    </span>
                    <span className="truncate max-w-[120px]">
                      {src.category}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════ */}
      {/*  QUICK INSTALL — TMDB / Trakt.tv / Nuvio      */}
      {/* ══════════════════════════════════════════════ */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="h-4 w-1.5 rounded-full bg-violet-500 shadow-sm shadow-violet-500/50" />
          <h2 className="text-lg sm:text-xl font-bold text-white">Quick Install</h2>
          <span className="chip rounded-full px-2.5 py-0.5 text-[10px] font-bold text-violet-300">
            One-Click Setup
          </span>
        </div>

        {presetSuccess && (
          <div className="mb-4 rounded-xl bg-emerald-950/50 p-3 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
            ✓ {presetSuccess}
          </div>
        )}
        {presetError && (
          <div className="mb-4 rounded-xl bg-rose-950/40 p-3 border border-rose-500/30 text-rose-300 text-xs font-medium">
            {presetError}
          </div>
        )}

        {GROUP_ORDER.map((group) => {
          const groupPresets = ADDON_PRESETS.filter((p) => p.group === group);
          const groupAccent = groupPresets[0]?.accent || '#3b82f6';
          return (
            <div key={group} className="mb-6">
              {/* Group Header */}
              <div className="mb-3 flex items-center gap-2">
                <span className="text-base font-extrabold text-white">{groupPresets[0]?.icon} {group}</span>
                <div className="h-px flex-1 bg-white/8" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {groupPresets.map((preset) => {
                  const installed = isInstalled(preset);
                  const isExpanded = expandedPreset === preset.id;
                  const fields = presetFields[preset.id] || {};
                  const needsFields = preset.fields?.length > 0;
                  const hasAlts = preset.altUrls?.length > 0;
                  const activeUrl = selectedAlt[preset.id] || preset.url || preset.altUrls?.[0]?.url || '';

                  return (
                    <div
                      key={preset.id}
                      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                        installed
                          ? 'border-emerald-500/30 bg-emerald-950/10'
                          : isExpanded
                          ? 'border-blue-500/40 bg-white/[0.04]'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                      }`}
                    >
                      {/* Card Top */}
                      <div className={`bg-gradient-to-br ${preset.color} p-4`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="text-sm font-black text-white">{preset.name}</span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                                style={{ background: `${groupAccent}30`, color: groupAccent, border: `1px solid ${groupAccent}40` }}
                              >
                                {preset.badge}
                              </span>
                              {installed && (
                                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-400/30">
                                  ✓ Installed
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2">
                              {preset.description}
                            </p>
                          </div>
                        </div>

                        {/* Alt URL selector */}
                        {hasAlts && isExpanded && (
                          <div className="mt-3">
                            <label className="block text-[10px] font-semibold text-white/50 mb-1.5">
                              Select Server
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {preset.altUrls.map((alt) => (
                                <button
                                  key={alt.url}
                                  onClick={() => setSelectedAlt((s) => ({ ...s, [preset.id]: alt.url }))}
                                  className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold border transition-all ${
                                    (selectedAlt[preset.id] || preset.altUrls[0]?.url) === alt.url
                                      ? 'bg-blue-600 border-blue-400/60 text-white'
                                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                  }`}
                                >
                                  {alt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Field inputs (e.g. API Key) */}
                        {needsFields && isExpanded && (
                          <div className="mt-3 space-y-2">
                            {preset.fields.map((field) => (
                              <div key={field.key}>
                                <label className="block text-[10px] font-semibold text-white/50 mb-1">
                                  {field.label}
                                </label>
                                <input
                                  type={field.type || 'text'}
                                  value={fields[field.key] || ''}
                                  onChange={(e) =>
                                    setPresetFields((s) => ({
                                      ...s,
                                      [preset.id]: { ...s[preset.id], [field.key]: e.target.value },
                                    }))
                                  }
                                  placeholder={field.placeholder}
                                  className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-1.5 text-xs text-white placeholder-white/25 outline-none focus:border-blue-500"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-black/10 border-t border-white/5">
                        {/* URL preview */}
                        {isExpanded && (
                          <span className="flex-1 truncate text-[9px] font-mono text-white/30">
                            {activeUrl}
                          </span>
                        )}

                        {!isExpanded && (
                          <span className="flex-1 text-[10px] text-white/40">
                            {installed ? 'Already in your addon list' : (needsFields || hasAlts ? 'Click Configure to set up' : 'Ready to install')}
                          </span>
                        )}

                        {!installed && (
                          <>
                            {(needsFields || hasAlts) && (
                              <button
                                onClick={() => setExpandedPreset(isExpanded ? null : preset.id)}
                                className="rounded-lg bg-white/8 border border-white/12 px-3 py-1.5 text-[10px] font-bold text-white/70 hover:bg-white/15 hover:text-white transition"
                              >
                                {isExpanded ? 'Collapse' : 'Configure'}
                              </button>
                            )}
                            <button
                              disabled={presetInstalling === preset.id}
                              onClick={() => {
                                if (needsFields || hasAlts) {
                                  if (!isExpanded) {
                                    setExpandedPreset(preset.id);
                                    return;
                                  }
                                }
                                installPreset(preset);
                              }}
                              className="rounded-lg px-3 py-1.5 text-[10px] font-bold text-white transition disabled:opacity-60 disabled:cursor-wait"
                              style={{ background: `${groupAccent}cc`, border: `1px solid ${groupAccent}60` }}
                            >
                              {presetInstalling === preset.id ? 'Installing…' : '+ Install'}
                            </button>
                          </>
                        )}
                        {installed && (
                          <span className="rounded-lg bg-emerald-500/15 border border-emerald-400/25 px-3 py-1.5 text-[10px] font-bold text-emerald-400">
                            ✓ Active
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* ══════════════════════════════════════════════ */}
      {/*  MANUAL INSTALL                               */}
      {/* ══════════════════════════════════════════════ */}
      <form onSubmit={addAddon} className="spatial-card rounded-3xl p-6 sm:p-8 border border-white/15 mb-10">
        <div className="flex items-center gap-2.5 mb-5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600/30 text-blue-300 font-bold border border-blue-400/30">
            +
          </span>
          <h2 className="text-lg sm:text-xl font-bold text-white">Install Custom Addon</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs sm:text-sm font-semibold text-slate-200" htmlFor="addon-url">
              Manifest URL <span className="text-blue-400">*</span>
            </label>
            <input
              id="addon-url"
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://v3-cinemeta.strem.io/manifest.json"
              className="w-full spatial-input rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder-white/35"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">Enter the HTTPS or HTTP link ending in /manifest.json</p>
          </div>

          <div>
            <label className="mb-2 block text-xs sm:text-sm font-semibold text-slate-200" htmlFor="addon-name">
              Custom Name <span className="text-xs text-white/40 font-normal">(optional)</span>
            </label>
            <input
              id="addon-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Favorite Movies Addon"
              className="w-full spatial-input rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder-white/35"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-950/40 p-3 border border-rose-500/30 text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        <button
          disabled={submitting}
          className="btn-spatial-blue mt-6 rounded-xl px-7 py-3 text-xs sm:text-sm font-bold shadow-md disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? 'Verifying Manifest…' : 'Install Addon'}
        </button>
      </form>

      {/* ══════════════════════════════════════════════ */}
      {/*  INSTALLED ADDONS LIST                        */}
      {/* ══════════════════════════════════════════════ */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="h-4 w-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
            <h2 className="text-lg sm:text-xl font-bold text-white">Installed Addons ({addons.length})</h2>
          </div>
          <button
            type="button"
            onClick={handleRefreshAddons}
            disabled={refreshingAddons}
            className="btn-glass flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
            title="Ping and refresh all addon manifests"
          >
            <span className={refreshingAddons ? 'animate-spin' : ''}>🔄</span>
            <span>{refreshingAddons ? 'Pinging Addons...' : 'Refresh Addons'}</span>
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm font-semibold text-white/70">Loading installed addons…</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {addons.map((addon) => (
              <article
                key={addon.id}
                className="spatial-card flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between border border-white/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="font-bold text-white text-base">{addon.name}</h3>
                    {addon.builtin && (
                      <span className="chip rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white/70">
                        Default System
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      addon.enabled
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                        : 'bg-white/5 text-white/40 border border-white/10'
                    }`}>
                      {addon.enabled ? '● Active' : '○ Disabled'}
                    </span>
                    {/* Addon Health Badge */}
                    {addonsHealth[addon.id] && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold border flex items-center gap-1 ${
                        addonsHealth[addon.id].status === 'ok'
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          addonsHealth[addon.id].status === 'ok' ? 'bg-emerald-400' : 'bg-rose-400'
                        }`} />
                        <span>{addonsHealth[addon.id].status === 'ok' ? `${addonsHealth[addon.id].latency}ms` : 'Offline'}</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-2 break-all text-xs font-mono text-slate-300 bg-white/5 border border-white/10 rounded-lg p-2 max-w-xl">
                    {addon.url}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <button
                    onClick={() => toggle(addon.id)}
                    className="btn-glass rounded-xl px-4 py-2 text-xs font-bold text-white/90 hover:text-white"
                  >
                    {addon.enabled ? 'Disable' : 'Enable'}
                  </button>
                  {!addon.builtin && (
                    <button
                      onClick={() => remove(addon.id)}
                      className="btn-glass rounded-xl px-4 py-2 text-xs font-bold text-rose-300 hover:!bg-rose-950/50 hover:border-rose-400/40"
                    >
                      Uninstall
                    </button>
                  )}
                </div>
              </article>
            ))}

            {addons.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
                <p className="text-sm font-bold text-white/60">No addons installed yet.</p>
                <p className="mt-1 text-xs text-white/35">Use Quick Install above to get started.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════ */}
      {/*  HOME CATALOG SECTIONS MANAGER (GROUPED ACCORDION) */}
      {/* ══════════════════════════════════════════════ */}
      <section className="mt-12">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="h-4 w-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
              <h2 className="text-lg sm:text-xl font-bold text-white">
                Home Catalog Sections
              </h2>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold border transition-colors bg-blue-500/20 text-blue-300 border-blue-400/40">
                Active: {enabledSectionKeys.size} Sections (Default: 12)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-300 max-w-2xl">
              Choose which sections appear on the Home page. Each provider and repository is neatly grouped below and can be collapsed/minimized.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={expandAllGroups}
              className="btn-glass rounded-xl px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white"
            >
              Expand All
            </button>
            <button
              onClick={collapseAllGroups}
              className="btn-glass rounded-xl px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white"
            >
              Collapse All
            </button>
            <button
              onClick={resetDefaultSections}
              className="btn-glass rounded-xl px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white"
            >
              Reset Default 12
            </button>
            <button
              onClick={clearAllSections}
              className="btn-glass rounded-xl px-3 py-1.5 text-xs font-semibold text-rose-300 hover:text-rose-200"
            >
              Disable All
            </button>
          </div>
        </div>

        {/* Warning Toast */}
        {sectionWarning && (
          <div className="mb-4 rounded-xl bg-amber-950/60 p-3.5 border border-amber-500/50 text-amber-200 text-xs font-semibold animate-pulse">
            {sectionWarning}
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            value={sectionSearch}
            onChange={(e) => setSectionSearch(e.target.value)}
            placeholder="Search sections or providers (e.g. CXXX, DhakaFlix, Anime)..."
            className="spatial-input w-full sm:max-w-xs rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/30"
          />

          {/* Group Filter Pills */}
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSectionAddonFilter('all')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                sectionAddonFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              All Groups ({catalogGroups.length})
            </button>
            {catalogGroups.map((group) => (
              <button
                key={group.groupId}
                onClick={() => setSectionAddonFilter(group.groupId)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition flex items-center gap-1.5 ${
                  sectionAddonFilter === group.groupId
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{group.icon}</span>
                <span>{group.groupName}</span>
                <span className="text-[10px] opacity-60">({group.catalogs.length})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Grouped Accordions */}
        {catalogsLoading ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-xs text-white/60">Loading available catalog sections…</p>
          </div>
        ) : (
          (() => {
            const filteredGroups = catalogGroups
              .filter((g) => sectionAddonFilter === 'all' || sectionAddonFilter === g.groupId)
              .map((g) => {
                const q = sectionSearch.trim().toLowerCase();
                if (!q) return g;
                const matchesGroupName = g.groupName.toLowerCase().includes(q);
                const matchingCatalogs = g.catalogs.filter((c) =>
                  matchesGroupName ||
                  c.name?.toLowerCase().includes(q) ||
                  c.addonName?.toLowerCase().includes(q) ||
                  c.type?.toLowerCase().includes(q)
                );
                return { ...g, catalogs: matchingCatalogs };
              })
              .filter((g) => g.catalogs.length > 0);

            if (filteredGroups.length === 0) {
              return (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-xs text-white/50">
                  No catalog sections match your search or filter.
                </div>
              );
            }

            return (
              <div className="space-y-4">
                {filteredGroups.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.groupId);
                  const activeCount = group.catalogs.filter((c) =>
                    enabledSectionKeys.has(`${c.addonId}:${c.type}:${c.id}`)
                  ).length;
                  const allActive = group.catalogs.length > 0 && activeCount === group.catalogs.length;

                  return (
                    <div
                      key={group.groupId}
                      className="rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-md overflow-hidden transition-all duration-200"
                    >
                      {/* Accordion Header */}
                      <div
                        onClick={() => toggleGroupCollapse(group.groupId)}
                        className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:px-4 cursor-pointer select-none bg-white/[0.02] hover:bg-white/[0.05] transition-colors border-b border-white/5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base">{group.icon}</span>
                          <span className="font-bold text-sm text-white truncate">
                            {group.groupName}
                          </span>
                          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70 shrink-0">
                            {group.groupType}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border transition ${
                              activeCount > 0
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-white/5 text-white/40 border-white/10'
                            }`}
                          >
                            {activeCount} / {group.catalogs.length} Active
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleAllInGroup(group.catalogs, !allActive)}
                            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10 transition"
                          >
                            {allActive ? 'Disable All' : 'Enable All'}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapse(group.groupId)}
                            className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-white/5 text-white/80 hover:bg-white/10 hover:text-white border border-white/10 transition flex items-center gap-1"
                          >
                            <span>{isCollapsed ? 'Show Catalogs' : 'Hide / Minimize'}</span>
                            <span className="text-[10px]">{isCollapsed ? '▼' : '▲'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Accordion Body */}
                      {!isCollapsed && (
                        <div className="p-3.5 sm:p-4">
                          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                            {group.catalogs.map((cat) => {
                              const key = `${cat.addonId}:${cat.type}:${cat.id}`;
                              const isEnabled = enabledSectionKeys.has(key);

                              return (
                                <div
                                  key={key}
                                  onClick={() => toggleSection(key)}
                                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 sm:p-3 transition-all duration-200 ${
                                    isEnabled
                                      ? 'border-emerald-500/40 bg-emerald-950/25 shadow-sm shadow-emerald-950/30'
                                      : 'border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1 pr-2">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="truncate text-xs font-bold text-white">
                                        {cat.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-white/50">
                                      <span className="rounded bg-white/10 px-1.5 py-0.2 uppercase font-mono text-[9px] text-white/70">
                                        {cat.type}
                                      </span>
                                      {cat.pluginName && (
                                        <>
                                          <span>·</span>
                                          <span className="truncate text-slate-300 text-[10px]">{cat.pluginName}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSection(key);
                                    }}
                                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                                      isEnabled
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                        : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white'
                                    }`}
                                  >
                                    {isEnabled ? '✓ On Home' : '+ Show'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </section>
    </div>
  );
}
