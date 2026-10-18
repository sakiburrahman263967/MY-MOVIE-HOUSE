import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Hls from 'hls.js';
import { api } from '../api.js';
import VideoPlayer from '../components/VideoPlayer.jsx';

// Smart category detection for Sports, Entertainment, Movies, TV Series, Music, News, Kids, Documentary, Adult, etc.
function detectCategory(title = '', group = '', logo = '') {
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

  if (group && !/^(live tv|iptv|channels|all|general|stream|default)$/i.test(group.trim())) {
    return group.trim();
  }

  return 'Entertainment';
}

const CATEGORY_META = {
  All: { label: 'All Channels', icon: '🌐', activeBg: 'bg-red-600', badgeColor: 'bg-red-500/20 text-red-300' },
  Sports: { label: 'Sports', icon: '⚽', activeBg: 'bg-emerald-600', badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  Entertainment: { label: 'Entertainment', icon: '🎭', activeBg: 'bg-purple-600', badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  Movies: { label: 'Movies', icon: '🎬', activeBg: 'bg-amber-600', badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  'TV Series': { label: 'TV Series', icon: '📺', activeBg: 'bg-blue-600', badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  Music: { label: 'Music', icon: '🎵', activeBg: 'bg-pink-600', badgeColor: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
  News: { label: 'News', icon: '📰', activeBg: 'bg-cyan-600', badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  Kids: { label: 'Kids & Toon', icon: '👶', activeBg: 'bg-orange-500', badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  Documentary: { label: 'Documentary', icon: '🌍', activeBg: 'bg-teal-600', badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  Adult: { label: 'Adult (18+)', icon: '🔞', activeBg: 'bg-rose-600', badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
};

function getCategoryConfig(cat) {
  return CATEGORY_META[cat] || {
    label: cat,
    icon: '📡',
    activeBg: 'bg-slate-700',
    badgeColor: 'bg-white/10 text-white/70 border-white/10'
  };
}

// ─── Floating Draggable PiP Player ───
function LivePipWidget({
  channel,
  stream,
  onClose,
  onExpand,
  onNext,
  onPrev,
  position,
  onDragStart,
  isDragging
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream?.url) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = stream.url;
    const isM3u8 = streamUrl.includes('.m3u8') || stream.isLive;

    if (isM3u8 && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else {
      video.src = streamUrl;
      video.play().catch(() => {});
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [stream]);

  return (
    <div
      style={{ right: `${position.x}px`, bottom: `${position.y}px` }}
      className={`fixed z-50 w-72 sm:w-84 rounded-2xl border border-white/20 bg-[#0e1424]/95 backdrop-blur-2xl shadow-2xl overflow-hidden transition-shadow ${
        isDragging ? 'shadow-blue-500/40 border-blue-400 scale-[1.02]' : ''
      }`}
    >
      {/* Draggable Header */}
      <div
        onMouseDown={onDragStart}
        className="cursor-move px-3 py-2 bg-black/60 border-b border-white/10 flex items-center justify-between select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/40 text-xs font-mono">⠿</span>
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <p className="text-xs font-bold text-white truncate max-w-[140px]">
            {channel?.name || 'Live TV'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={onPrev}
            title="Previous Channel (Zap)"
            className="grid h-6 w-6 place-items-center rounded-md bg-white/10 text-white/80 hover:bg-white/20 hover:text-white text-[10px]"
          >
            ⏮
          </button>
          <button
            onClick={onNext}
            title="Next Channel (Zap)"
            className="grid h-6 w-6 place-items-center rounded-md bg-white/10 text-white/80 hover:bg-white/20 hover:text-white text-[10px]"
          >
            ⏭
          </button>
          <button
            onClick={onExpand}
            title="Expand to Full Player"
            className="grid h-6 w-6 place-items-center rounded-md bg-blue-600/80 hover:bg-blue-600 text-white text-[10px]"
          >
            ⛶
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="grid h-6 w-6 place-items-center rounded-md bg-white/10 text-white/70 hover:bg-rose-600 hover:text-white text-[10px]"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Video Content */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="h-full w-full object-contain"
        />
        {/* Quick bottom bar */}
        <div className="absolute bottom-1.5 inset-x-2 flex items-center justify-between text-[10px] text-white/80 bg-black/50 backdrop-blur-sm rounded-lg px-2 py-0.5">
          <button
            onClick={() => setMuted(!muted)}
            className="hover:text-white font-mono"
          >
            {muted ? '🔇 Muted' : '🔊 Sound'}
          </button>
          <span className="text-[9px] text-red-400 font-bold uppercase tracking-wider">
            ● LIVE
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LiveTv() {
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Filtering
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPlaylist, setSelectedPlaylist] = useState('All');

  // Video playback & PiP State
  const [activeChannel, setActiveChannel] = useState(null);
  const [channelStream, setChannelStream] = useState(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [isPipMode, setIsPipMode] = useState(true);
  const [pipPosition, setPipPosition] = useState({ x: 24, y: 24 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  const handleDragStart = (e) => {
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: pipPosition.x,
      posY: pipPosition.y
    };
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      const deltaX = dragStartRef.current.mouseX - e.clientX;
      const deltaY = dragStartRef.current.mouseY - e.clientY;
      setPipPosition({
        x: Math.max(10, Math.min(window.innerWidth - 340, dragStartRef.current.posX + deltaX)),
        y: Math.max(10, Math.min(window.innerHeight - 240, dragStartRef.current.posY + deltaY))
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [chData, catData, plData] = await Promise.all([
        api.getIptvChannels({ limit: 1000 }),
        api.getIptvCategories(),
        api.getIptvPlaylists()
      ]);
      setChannels(chData?.channels || []);
      setCategories(catData?.categories || chData?.categories || []);
      setPlaylists(plData?.playlists || []);
    } catch (err) {
      setError(err.message || 'Failed to load Live TV channels.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await api.refreshIptvChannels();
      await fetchChannels();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handlePlayChannel = async (channel, startAsFullscreen = false) => {
    setActiveChannel(channel);
    if (!startAsFullscreen) {
      setIsPipMode(true);
    }
    setStreamLoading(true);
    try {
      const s = await api.getIptvStream(channel.id);
      if (s?.url) {
        setChannelStream(s);
      } else {
        // Fallback to channel object direct URL
        setChannelStream({
          addonId: 'iptv-live',
          addonName: `[Live TV] ${channel.playlistName || 'IPTV'}`,
          name: `🔴 LIVE • ${channel.name}`,
          title: `${channel.name} (${channel.group || 'Live TV'})`,
          url: channel.url,
          poster: channel.logo,
          isLive: true
        });
      }
    } catch {
      setChannelStream({
        addonId: 'iptv-live',
        addonName: `[Live TV] ${channel.playlistName || 'IPTV'}`,
        name: `🔴 LIVE • ${channel.name}`,
        title: `${channel.name} (${channel.group || 'Live TV'})`,
        url: channel.url,
        poster: channel.logo,
        isLive: true
      });
    } finally {
      setStreamLoading(false);
    }
  };

  // Compute live counts for each category
  const categoryCounts = useMemo(() => {
    const counts = { All: channels.length };
    for (const ch of channels) {
      const cat = ch.category || ch.group || detectCategory(ch.name, ch.rawGroup, ch.logo);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [channels]);

  // Available category list
  const displayCategories = useMemo(() => {
    const standardKeys = ['All', 'Sports', 'Entertainment', 'Movies', 'TV Series', 'Music', 'News', 'Kids', 'Documentary', 'Adult'];
    // Show standard keys if they have channels or if it's 'All'
    const activeStandard = standardKeys.filter((k) => k === 'All' || (categoryCounts[k] || 0) > 0);

    // Any additional custom categories that have channels
    const extraCategories = categories.filter((c) =>
      !standardKeys.includes(c) &&
      !/^(live tv|iptv|channels|all)$/i.test(c) &&
      (categoryCounts[c] || 0) > 0
    );

    return [...activeStandard, ...extraCategories];
  }, [categoryCounts, categories]);

  const filteredChannels = useMemo(() => {
    let result = channels;
    if (selectedCategory && selectedCategory !== 'All') {
      const target = selectedCategory.toLowerCase();
      result = result.filter((c) => {
        const cat = (c.category || c.group || detectCategory(c.name, c.rawGroup, c.logo)).toLowerCase();
        return cat === target;
      });
    }
    if (selectedPlaylist && selectedPlaylist !== 'All') {
      result = result.filter((c) => c.playlistName === selectedPlaylist);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((c) => {
        const cat = c.category || c.group || detectCategory(c.name, c.rawGroup, c.logo);
        return (
          c.name?.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q) ||
          c.playlistName?.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [channels, selectedCategory, selectedPlaylist, search]);

  const currentIndex = useMemo(() => {
    if (!activeChannel) return -1;
    return filteredChannels.findIndex((c) => c.id === activeChannel.id);
  }, [activeChannel, filteredChannels]);

  const handleNextChannel = () => {
    if (filteredChannels.length === 0) return;
    const nextIdx = (currentIndex + 1) % filteredChannels.length;
    handlePlayChannel(filteredChannels[nextIdx], !isPipMode);
  };

  const handlePrevChannel = () => {
    if (filteredChannels.length === 0) return;
    const prevIdx = (currentIndex - 1 + filteredChannels.length) % filteredChannels.length;
    handlePlayChannel(filteredChannels[prevIdx], !isPipMode);
  };

  return (
    <div className="mx-auto max-w-7xl pb-16">
      {/* ─── Header ─── */}
      <div className="spatial-card mb-6 rounded-3xl p-6 sm:p-8 border border-white/15 bg-gradient-to-r from-red-950/25 via-slate-900/40 to-slate-950/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center gap-1.5 rounded-full bg-red-600/30 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-300 border border-red-500/40">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                Live Broadcast TV
              </span>
              <span className="chip rounded-full px-2.5 py-0.5 text-xs text-white/70 font-semibold">
                M3U8 & Xtream Codes
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white">Live TV Channels</h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Watch live sports, entertainment, movies, music, news, and series streams with smart category sorting.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn-glass flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
            >
              <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
              <span>{refreshing ? 'Reloading...' : 'Refresh Channels'}</span>
            </button>
            <Link
              to="/settings"
              className="btn-spatial-blue flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-md shadow-blue-600/30"
            >
              <span>⚙</span> Manage IPTV & Addons
            </Link>
          </div>
        </div>

        {/* ─── Live Search Bar ─── */}
        <div className="mt-5 relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Live TV channels by name or category... (e.g. T Sports, Star Sports, Somoy, Zee, HBO, Colors)"
            className="w-full spatial-input rounded-2xl pl-11 pr-10 py-3 text-xs sm:text-sm text-white placeholder-white/35 font-medium border border-white/15 focus:border-red-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs bg-white/10 hover:bg-white/20 rounded-full h-6 w-6 grid place-items-center transition"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ─── Category Filter Chips with Icons and Badges ─── */}
      <div className="mb-6 flex flex-wrap items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {displayCategories.map((catKey) => {
          const cfg = getCategoryConfig(catKey);
          const count = categoryCounts[catKey] || 0;
          const isSelected = selectedCategory === catKey;

          return (
            <button
              key={catKey}
              onClick={() => setSelectedCategory(catKey)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-2 whitespace-nowrap shadow-sm ${
                isSelected
                  ? `${cfg.activeBg || 'bg-red-600'} text-white shadow-md ring-2 ring-white/20 scale-[1.02]`
                  : 'bg-white/5 text-white/80 hover:bg-white/10 hover:text-white border border-white/10'
              }`}
            >
              <span className="text-sm">{cfg.icon}</span>
              <span>{cfg.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isSelected ? 'bg-black/30 text-white' : 'bg-white/10 text-white/60'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Channel Grid ─── */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          <p className="text-xs font-semibold text-white/70">Connecting to IPTV broadcast streams...</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-rose-950/40 p-6 text-center text-rose-300 border border-rose-500/30 text-xs">
          <p className="font-bold">{error}</p>
          <button onClick={fetchChannels} className="mt-3 rounded-lg bg-rose-600 px-4 py-1.5 font-bold text-white">
            Retry
          </button>
        </div>
      ) : filteredChannels.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-12 text-center">
          <span className="text-3xl mb-2 block">📡</span>
          <p className="text-base font-bold text-white">No Live TV channels added yet.</p>
          <p className="mt-1.5 text-xs text-slate-400 max-w-md mx-auto">
            {search
              ? `No channels matched "${search}". Try searching for another name.`
              : 'Add your M3U / M3U8 link, playlist file, or Xtream Codes login in Addons settings to watch your channels here.'}
          </p>
          <Link
            to="/settings"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-500 transition"
          >
            <span>+ Add IPTV Link in Addons</span>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredChannels.map((channel) => (
            <div
              key={channel.id}
              onClick={() => handlePlayChannel(channel)}
              className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/40 hover:border-red-500/50 hover:bg-white/[0.06] p-3 transition-all duration-200 cursor-pointer shadow-lg backdrop-blur-md"
            >
              {/* Channel Logo / Banner */}
              <div className="relative mb-2.5 h-20 w-full overflow-hidden rounded-xl bg-black/50 border border-white/10 grid place-items-center p-2">
                {channel.logo ? (
                  <img
                    src={channel.logo}
                    alt={channel.name}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    className="max-h-full max-w-full object-contain filter group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <span className="text-xl font-black text-white/40">📺</span>
                )}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 border border-white/10">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[9px] font-black uppercase text-red-300">LIVE</span>
                </div>
              </div>

              {/* Title & Group */}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-xs font-bold text-white group-hover:text-red-300 transition-colors">
                  {channel.name}
                </h3>
                <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px]">
                  {(() => {
                    const cat = channel.category || channel.group || detectCategory(channel.name, channel.rawGroup, channel.logo);
                    const cfg = getCategoryConfig(cat);
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${cfg.badgeColor}`}>
                        <span>{cfg.icon}</span>
                        <span className="truncate max-w-[75px]">{cat}</span>
                      </span>
                    );
                  })()}
                  {channel.playlistName && (
                    <span className="truncate max-w-[70px] text-[9px] text-white/40 font-medium">
                      {channel.playlistName}
                    </span>
                  )}
                </div>
              </div>

              {/* Play Button Overlay */}
              <button
                type="button"
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600/20 group-hover:bg-red-600 border border-red-500/30 group-hover:border-red-400 py-1.5 text-[11px] font-bold text-red-300 group-hover:text-white transition shadow-sm"
              >
                <span>▶</span> Watch Live
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── Floating Draggable PiP Mode ─── */}
      {channelStream && isPipMode && (
        <LivePipWidget
          channel={activeChannel}
          stream={channelStream}
          position={pipPosition}
          isDragging={isDragging}
          onDragStart={handleDragStart}
          onClose={() => {
            setChannelStream(null);
            setActiveChannel(null);
          }}
          onExpand={() => setIsPipMode(false)}
          onNext={handleNextChannel}
          onPrev={handlePrevChannel}
        />
      )}

      {/* ─── Full Player Mode with Channel Zapping & Related Channels Tray ─── */}
      {channelStream && !isPipMode && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-fadeIn">
          {/* Top Quick Floating Remote Deck: Channel Name, Prev / Next, PiP switch */}
          <div className="absolute top-4 left-4 right-16 z-40 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto bg-black/80 backdrop-blur-xl rounded-2xl px-3.5 py-2 border border-white/20 shadow-2xl">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] font-black uppercase text-red-300">LIVE</span>
              <span className="text-xs font-bold text-white max-w-[220px] truncate ml-1">
                {activeChannel?.name}
              </span>

              <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-white/20">
                <button
                  type="button"
                  onClick={handlePrevChannel}
                  title="Previous Channel (⏮️)"
                  className="rounded-lg bg-white/10 hover:bg-white/25 text-white px-2.5 py-1 text-xs font-bold flex items-center gap-1 transition"
                >
                  ⏮ Prev
                </button>
                <button
                  type="button"
                  onClick={handleNextChannel}
                  title="Next Channel (⏭️)"
                  className="rounded-lg bg-white/10 hover:bg-white/25 text-white px-2.5 py-1 text-xs font-bold flex items-center gap-1 transition"
                >
                  Next ⏭
                </button>
              </div>
            </div>

            <div className="pointer-events-auto">
              <button
                type="button"
                onClick={() => setIsPipMode(true)}
                title="Shrink to Floating PiP Window"
                className="rounded-2xl bg-black/80 backdrop-blur-xl hover:bg-blue-600 border border-white/20 px-3.5 py-2 text-xs font-bold text-white transition flex items-center gap-1.5 shadow-2xl"
              >
                <span>🗗 Floating PiP</span>
              </button>
            </div>
          </div>

          <VideoPlayer
            stream={channelStream}
            allStreams={[channelStream]}
            title={channelStream.title || activeChannel?.name || 'Live TV'}
            type="tv"
            id={activeChannel?.id}
            poster={activeChannel?.logo}
            onClose={() => {
              setChannelStream(null);
              setActiveChannel(null);
            }}
          />

          {/* Related / Category Channels Tray (Scroll horizontally or click to zap channel) */}
          <div
            className="absolute bottom-14 inset-x-4 z-40 bg-black/85 backdrop-blur-2xl border border-white/15 rounded-2xl p-2.5 shadow-2xl"
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                <span className="text-xs font-bold text-white">
                  Related Channels ({filteredChannels.length})
                </span>
                <span className="text-[10px] text-white/50">
                  (Scroll horizontally or click to zap channel)
                </span>
              </div>
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 pt-0.5 px-1 scroll-smooth">
              {filteredChannels.slice(0, 40).map((ch) => {
                const isCur = ch.id === activeChannel?.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => handlePlayChannel(ch, true)}
                    className={`shrink-0 flex items-center gap-2 rounded-xl p-2 text-left transition border ${
                      isCur
                        ? 'bg-red-600/30 border-red-400/80 text-white shadow-lg shadow-red-600/30'
                        : 'bg-white/5 hover:bg-white/15 border-white/10 text-white/80'
                    }`}
                  >
                    <div className="h-7 w-7 rounded-lg bg-black/60 border border-white/10 grid place-items-center p-0.5 shrink-0">
                      {ch.logo ? (
                        <img src={ch.logo} alt="" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-xs">📺</span>
                      )}
                    </div>
                    <div className="min-w-0 max-w-[120px]">
                      <p className="text-[11px] font-bold truncate">{ch.name}</p>
                      <p className="text-[9px] text-white/50 truncate">{ch.category || ch.group || 'Live'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
