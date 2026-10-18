import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

// Preset Comprehensive Streaming Platforms
export const PRESET_PLATFORMS = [
  // Global / International
  { id: 'netflix', name: 'Netflix', category: 'global', color: 'from-red-600/40 via-red-950/40 to-black', accent: '#e50914', icon: 'netflix', badge: 'Global #1' },
  { id: 'prime', name: 'Amazon Prime Video', category: 'global', color: 'from-cyan-600/40 via-blue-950/40 to-black', accent: '#00a8e1', icon: 'prime', badge: 'Originals' },
  { id: 'hbo', name: 'HBO Max', category: 'global', color: 'from-purple-600/40 via-indigo-950/40 to-black', accent: '#9933ff', icon: 'hbo', badge: 'Blockbusters' },
  { id: 'disney', name: 'Disney+', category: 'global', color: 'from-blue-600/40 via-indigo-950/40 to-black', accent: '#113ccf', icon: 'disney', badge: 'Marvel & Pixar' },
  { id: 'apple', name: 'Apple TV+', category: 'global', color: 'from-slate-400/30 via-slate-900/50 to-black', accent: '#ffffff', icon: 'apple', badge: '4K HDR' },
  { id: 'paramount', name: 'Paramount+', category: 'global', color: 'from-blue-700/40 via-sky-950/40 to-black', accent: '#0064ff', icon: 'paramount', badge: 'Premieres' },
  { id: 'hulu', name: 'Hulu', category: 'global', color: 'from-emerald-600/40 via-emerald-950/40 to-black', accent: '#1ce783', icon: 'hulu', badge: 'Live & Shows' },
  { id: 'peacock', name: 'Peacock', category: 'global', color: 'from-teal-600/40 via-slate-950/40 to-black', accent: '#000000', icon: 'peacock', badge: 'NBC Universal' },
  { id: 'ytpremium', name: 'YouTube Premium', category: 'global', color: 'from-red-600/40 via-red-950/40 to-black', accent: '#ff0000', icon: 'youtube', badge: 'Ad-Free' },

  // India
  { id: 'jiohotstar', name: 'JioHotstar', category: 'india', color: 'from-blue-600/40 via-amber-950/40 to-black', accent: '#0c2266', icon: 'hotstar', badge: 'Hotstar + Jio' },
  { id: 'sonyliv', name: 'SonyLIV', category: 'india', color: 'from-indigo-600/40 via-blue-950/40 to-black', accent: '#1877f2', icon: 'sonyliv', badge: 'Premium' },
  { id: 'zee5', name: 'ZEE5', category: 'india', color: 'from-pink-600/40 via-purple-950/40 to-black', accent: '#8230c6', icon: 'zee5', badge: 'Desi Originals' },
  { id: 'hoichoi-in', name: 'Hoichoi (Bengali)', category: 'india', color: 'from-amber-500/40 via-amber-950/40 to-black', accent: '#ffb800', icon: 'hoichoi', badge: 'Bengali' },
  { id: 'aha', name: 'aha (Telugu/South)', category: 'india', color: 'from-orange-600/40 via-orange-950/40 to-black', accent: '#ff5c00', icon: 'aha', badge: '100% Telugu' },
  { id: 'sunnxt', name: 'Sun NXT', category: 'india', color: 'from-amber-600/40 via-red-950/40 to-black', accent: '#ff9900', icon: 'sunnxt', badge: 'Tamil/South' },
  { id: 'mxplayer', name: 'MX Player', category: 'india', color: 'from-blue-600/40 via-blue-950/40 to-black', accent: '#2175d9', icon: 'mxplayer', badge: 'Free Web' },
  { id: 'lionsgate', name: 'Lionsgate Play', category: 'india', color: 'from-yellow-600/40 via-zinc-950/40 to-black', accent: '#cba135', icon: 'lionsgate', badge: 'Hollywood' },
  { id: 'manorama', name: 'ManoramaMAX', category: 'india', color: 'from-red-600/40 via-slate-950/40 to-black', accent: '#e60000', icon: 'manorama', badge: 'Malayalam' },
  { id: 'erosnow', name: 'Eros Now', category: 'india', color: 'from-rose-600/40 via-zinc-950/40 to-black', accent: '#ea005a', icon: 'erosnow', badge: 'Bollywood' },

  // Bangladesh
  { id: 'hoichoi-bd', name: 'Hoichoi BD', category: 'bd', color: 'from-amber-500/40 via-amber-950/40 to-black', accent: '#ffb800', icon: 'hoichoi', badge: 'বাংলা ওয়েব' },
  { id: 'chorki', name: 'Chorki', category: 'bd', color: 'from-red-600/40 via-rose-950/40 to-black', accent: '#dc2626', icon: 'chorki', badge: 'ফিল্মি ফান' },
  { id: 'bongobd', name: 'Bongo BD', category: 'bd', color: 'from-red-600/40 via-orange-950/40 to-black', accent: '#ef4444', icon: 'bongo', badge: 'সবাই দেখো' },
  { id: 'bioscope', name: 'Bioscope', category: 'bd', color: 'from-emerald-600/40 via-teal-950/40 to-black', accent: '#059669', icon: 'bioscope', badge: 'GP Live' },
  { id: 'toffee', name: 'Toffee', category: 'bd', color: 'from-orange-600/40 via-amber-950/40 to-black', accent: '#ea580c', icon: 'toffee', badge: 'লাইভ টিভি' },
  { id: 'binge', name: 'Binge', category: 'bd', color: 'from-purple-600/40 via-fuchsia-950/40 to-black', accent: '#9333ea', icon: 'binge', badge: 'অরিজিনালস' },
  { id: 'iscreen', name: 'iScreen', category: 'bd', color: 'from-cyan-600/40 via-sky-950/40 to-black', accent: '#0284c7', icon: 'iscreen', badge: 'ইমপ্রেস' },
  { id: 'deeptoplay', name: 'DeeptoPlay', category: 'bd', color: 'from-pink-600/40 via-rose-950/40 to-black', accent: '#e11d48', icon: 'deepto', badge: 'দীপ্ত টিভি' },
  { id: 'cinematic', name: 'Cinematic', category: 'bd', color: 'from-yellow-600/40 via-zinc-950/40 to-black', accent: '#ca8a04', icon: 'cinematic', badge: 'লাইভ টেক' },

  // Pakistan
  { id: 'netflix-pk', name: 'Netflix Pakistan', category: 'pk', color: 'from-red-600/40 via-zinc-950/40 to-black', accent: '#e50914', icon: 'netflix', badge: 'Pakistan' },
  { id: 'tamasha', name: 'Tamasha', category: 'pk', color: 'from-red-600/40 via-amber-950/40 to-black', accent: '#e11d48', icon: 'tamasha', badge: 'Jazz Live' },
  { id: 'tapmad', name: 'Tapmad', category: 'pk', color: 'from-green-600/40 via-emerald-950/40 to-black', accent: '#10b981', icon: 'tapmad', badge: 'Live Sports' },
  { id: 'urduflix', name: 'UrduFlix', category: 'pk', color: 'from-blue-600/40 via-indigo-950/40 to-black', accent: '#2563eb', icon: 'urduflix', badge: 'اردو فلکس' },
  { id: 'mjunoon', name: 'Mjunoon.tv', category: 'pk', color: 'from-purple-600/40 via-purple-950/40 to-black', accent: '#7c3aed', icon: 'mjunoon', badge: 'Live HD' },
  { id: 'shoq', name: 'SHOQ', category: 'pk', color: 'from-teal-600/40 via-slate-950/40 to-black', accent: '#0d9488', icon: 'shoq', badge: 'PTCL' },
  { id: 'vidly', name: 'Vidly.tv', category: 'pk', color: 'from-rose-600/40 via-rose-950/40 to-black', accent: '#f43f5e', icon: 'vidly', badge: 'Cinema' },
  { id: 'aryzap', name: 'ARY ZAP', category: 'pk', color: 'from-amber-600/40 via-orange-950/40 to-black', accent: '#d97706', icon: 'aryzap', badge: 'ARY Network' },
  { id: 'harpalgeo', name: 'Harpal Geo', category: 'pk', color: 'from-blue-600/40 via-blue-950/40 to-black', accent: '#1d4ed8', icon: 'geo', badge: 'Geo Drama' },
  { id: 'iflix', name: 'iflix', category: 'pk', color: 'from-red-600/40 via-zinc-950/40 to-black', accent: '#ef4444', icon: 'iflix', badge: 'Movies' },

  // Adult / Bold / Softcore
  { id: 'ullu', name: 'Ullu', category: 'adult', color: 'from-rose-700/50 via-pink-950/50 to-black', accent: '#e11d48', icon: 'ullu', badge: '18+ Originals' },
  { id: 'altt', name: 'ALTT (ALTBalaji)', category: 'adult', color: 'from-red-700/50 via-zinc-950/50 to-black', accent: '#dc2626', icon: 'altt', badge: '18+ Thriller' },
  { id: 'vivamax', name: 'Vivamax', category: 'adult', color: 'from-orange-700/50 via-red-950/50 to-black', accent: '#ea580c', icon: 'vivamax', badge: '18+ Asian' },
  { id: 'kooku', name: 'Kooku', category: 'adult', color: 'from-fuchsia-700/50 via-purple-950/50 to-black', accent: '#c026d3', icon: 'kooku', badge: '18+ Web' },
  { id: 'desiflix', name: 'Desiflix', category: 'adult', color: 'from-pink-700/50 via-rose-950/50 to-black', accent: '#db2777', icon: 'desiflix', badge: '18+ Desi' },
  { id: 'neonxvip', name: 'NeonX VIP', category: 'adult', color: 'from-violet-700/50 via-indigo-950/50 to-black', accent: '#7c3aed', icon: 'neonx', badge: '18+ VIP' },
  { id: 'moodx', name: 'MoodX', category: 'adult', color: 'from-rose-800/50 via-black to-black', accent: '#be123c', icon: 'moodx', badge: '18+ Mood' },
  { id: 'hotxvip', name: 'HotX VIP', category: 'adult', color: 'from-red-800/50 via-black to-black', accent: '#b91c1c', icon: 'hotx', badge: '18+ Hot' },
  { id: 'hulchul', name: 'Hulchul', category: 'adult', color: 'from-amber-700/50 via-red-950/50 to-black', accent: '#d97706', icon: 'hulchul', badge: '18+ Sensual' },
  { id: 'primeflix', name: 'Prime Flix', category: 'adult', color: 'from-cyan-700/50 via-blue-950/50 to-black', accent: '#0891b2', icon: 'primeflix', badge: '18+ Drama' },
  { id: 'nueflicks', name: 'NueFlicks', category: 'adult', color: 'from-emerald-700/50 via-teal-950/50 to-black', accent: '#059669', icon: 'nueflicks', badge: '18+ Rom' },
  { id: 'boomex', name: 'Boomex', category: 'adult', color: 'from-pink-700/50 via-zinc-950/50 to-black', accent: '#db2777', icon: 'boomex', badge: '18+ Boom' },
  { id: 'showx', name: 'ShowX', category: 'adult', color: 'from-indigo-700/50 via-purple-950/50 to-black', accent: '#4f46e5', icon: 'showx', badge: '18+ Special' },
  { id: 'faphouse', name: 'FapHouse', category: 'adult', color: 'from-red-900/60 via-zinc-950 to-black', accent: '#991b1b', icon: 'faphouse', badge: 'Adult' },
  { id: 'adulttime', name: 'Adult Time', category: 'adult', color: 'from-purple-900/60 via-zinc-950 to-black', accent: '#581c87', icon: 'adulttime', badge: 'Adult' }
];

// Helper to render high quality animated SVG/GIF logos with glow effects
function PlatformAnimatedLogo({ icon, name, accent }) {
  switch (icon) {
    case 'netflix':
      return (
        <div className="relative flex items-center justify-center">
          <div className="h-10 w-10 relative flex items-center justify-center animate-pulse">
            <span className="text-3xl font-black text-red-600 tracking-tighter drop-shadow-[0_0_12px_rgba(229,9,20,0.8)]">
              N
            </span>
          </div>
        </div>
      );
    case 'hbo':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-xl font-black tracking-widest text-white drop-shadow-[0_0_15px_rgba(153,51,255,0.9)] animate-pulse">
            MAX
          </span>
        </div>
      );
    case 'disney':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-xl font-extrabold italic text-blue-300 drop-shadow-[0_0_15px_rgba(17,60,207,0.8)]">
            Disney<span className="text-blue-400 not-italic text-2xl animate-spin inline-block ml-0.5">+</span>
          </span>
        </div>
      );
    case 'prime':
      return (
        <div className="relative flex flex-col items-center justify-center">
          <span className="text-base font-black tracking-tight text-white">prime</span>
          <div className="w-9 h-1.5 rounded-full bg-cyan-400 -mt-0.5 animate-pulse shadow-[0_0_10px_#00a8e1]" />
        </div>
      );
    case 'apple':
      return (
        <div className="relative flex items-center justify-center gap-1">
          <span className="text-xl font-semibold text-white">tv<span className="text-xs align-super font-bold text-white/80">+</span></span>
        </div>
      );
    case 'paramount':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-base font-black italic text-blue-200 tracking-tight drop-shadow-[0_0_10px_rgba(0,100,255,0.8)]">
            Paramount+
          </span>
        </div>
      );
    case 'hulu':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-xl font-black tracking-tighter text-emerald-400 drop-shadow-[0_0_12px_rgba(28,231,131,0.8)] animate-pulse">
            hulu
          </span>
        </div>
      );
    case 'hotstar':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-base font-black text-amber-400 drop-shadow-[0_0_10px_#f59e0b]">
            Jio<span className="text-white">Hotstar</span>
          </span>
        </div>
      );
    case 'hoichoi':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-lg font-black text-amber-400 tracking-tight drop-shadow-[0_0_12px_#ffb800] animate-pulse">
            hoichoi
          </span>
        </div>
      );
    case 'chorki':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-lg font-black text-rose-500 tracking-wider drop-shadow-[0_0_12px_#dc2626]">
            CHORKI
          </span>
        </div>
      );
    case 'bongo':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-lg font-black text-red-500 drop-shadow-[0_0_10px_#ef4444]">
            BONGO
          </span>
        </div>
      );
    case 'ullu':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-lg font-black text-pink-500 drop-shadow-[0_0_14px_rgba(236,72,153,0.9)] animate-pulse">
            ULLU
          </span>
        </div>
      );
    case 'altt':
      return (
        <div className="relative flex items-center justify-center">
          <span className="text-lg font-black text-red-500 tracking-widest drop-shadow-[0_0_12px_#dc2626]">
            ALTT
          </span>
        </div>
      );
    default:
      return (
        <div className="relative flex items-center justify-center px-2">
          <span
            className="text-sm font-black truncate max-w-[120px] text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
            style={{ color: accent || '#ffffff' }}
          >
            {name}
          </span>
        </div>
      );
  }
}

export default memo(function StreamingPlatforms() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedPlatform, setSelectedPlatform] = useState(PRESET_PLATFORMS[0]);
  const [platformContent, setPlatformContent] = useState([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [customPlatforms, setCustomPlatforms] = useState(() => {
    try {
      const stored = localStorage.getItem('custom_platforms');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Modal for "+ Add Platform"
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState('');
  const [newPlatformCategory, setNewPlatformCategory] = useState('global');
  const [newPlatformColor, setNewPlatformColor] = useState('#2563eb');
  const [newPlatformBadge, setNewPlatformBadge] = useState('Custom');

  // Modal for "See More" Full Platform Catalog
  const [showSeeMoreModal, setShowSeeMoreModal] = useState(false);
  const [seeMoreType, setSeeMoreType] = useState('all'); // 'all', 'movie', 'series', 'documentary'
  const [seeMoreSearch, setSeeMoreSearch] = useState('');

  const scrollRef = useRef(null);
  const navigate = useNavigate();

  // Drag-to-scroll refs for platform cards row
  const dragStartX = useRef(null);
  const dragScrollLeft = useRef(0);
  const isDraggingRow = useRef(false);

  // Combine Preset + Custom Platforms
  const allPlatforms = [...PRESET_PLATFORMS, ...customPlatforms];

  const filteredPlatforms = activeCategory === 'all'
    ? allPlatforms
    : allPlatforms.filter((p) => p.category === activeCategory);

  // When category tab changes: auto-select first platform + scroll cards to start
  const handleCategoryChange = (catId) => {
    setActiveCategory(catId);
    const list = catId === 'all' ? allPlatforms : allPlatforms.filter((p) => p.category === catId);
    if (list.length > 0) setSelectedPlatform(list[0]);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  };

  // Fetch TMDB content with 250ms debounce to avoid rapid-switching spam
  useEffect(() => {
    if (!selectedPlatform) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoadingContent(true);
      api.getPlatformContent(selectedPlatform.name, {
        category: selectedPlatform.category || activeCategory,
        id: selectedPlatform.id
      })
        .then((items) => { if (active) setPlatformContent(items || []); })
        .catch(() => { if (active) setPlatformContent([]); })
        .finally(() => { if (active) setLoadingContent(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [selectedPlatform, activeCategory]);

  // Mouse drag handlers for the cards scroll row
  const onRowMouseDown = (e) => {
    if (!scrollRef.current) return;
    isDraggingRow.current = true;
    dragStartX.current = e.clientX;
    dragScrollLeft.current = scrollRef.current.scrollLeft;
  };
  const onRowMouseMove = (e) => {
    if (!isDraggingRow.current || !scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollLeft = dragScrollLeft.current + (dragStartX.current - e.clientX);
  };
  const onRowMouseUp = () => { isDraggingRow.current = false; };

  // Touch drag handlers
  const onRowTouchStart = (e) => {
    if (!scrollRef.current) return;
    isDraggingRow.current = true;
    dragStartX.current = e.touches[0].clientX;
    dragScrollLeft.current = scrollRef.current.scrollLeft;
  };
  const onRowTouchMove = (e) => {
    if (!isDraggingRow.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = dragScrollLeft.current + (dragStartX.current - e.touches[0].clientX);
  };
  const onRowTouchEnd = () => { isDraggingRow.current = false; };

  const handleAddCustom = (e) => {
    e.preventDefault();
    if (!newPlatformName.trim()) return;

    const newPlatform = {
      id: `custom-${Date.now()}`,
      name: newPlatformName.trim(),
      category: newPlatformCategory,
      color: 'from-blue-600/40 via-purple-950/40 to-black',
      accent: newPlatformColor || '#3b82f6',
      icon: 'custom',
      badge: newPlatformBadge || 'Custom',
      isCustom: true
    };

    const updated = [newPlatform, ...customPlatforms];
    setCustomPlatforms(updated);
    localStorage.setItem('custom_platforms', JSON.stringify(updated));

    setSelectedPlatform(newPlatform);
    setShowAddModal(false);
    setNewPlatformName('');
  };

  const handleDeleteCustom = (id, e) => {
    e.stopPropagation();
    const updated = customPlatforms.filter((p) => p.id !== id);
    setCustomPlatforms(updated);
    localStorage.setItem('custom_platforms', JSON.stringify(updated));
    if (selectedPlatform?.id === id) {
      setSelectedPlatform(PRESET_PLATFORMS[0]);
    }
  };

  const handlePlayTitle = async (item) => {
    // If we have tmdbId, resolve to imdb_id for direct Stremio player
    if (item.tmdbId) {
      try {
        const { imdbId } = await api.resolveImdbId(item.type, item.tmdbId);
        if (imdbId) {
          navigate(`/detail/${encodeURIComponent(item.type)}/${encodeURIComponent(imdbId)}`);
          return;
        }
      } catch {
        // Fallback below
      }
    }
    // Search query fallback
    navigate(`/search?q=${encodeURIComponent(item.name)}`);
  };

  const scroll = (direction) => {
    if (scrollRef.current) {
      const offset = direction === 'left' ? -420 : 420;
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  return (
    <section className="mb-10 w-full">
      {/* Header & Category Filter Tabs */}
      <div className="mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
          <h2 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-white">
            All Streaming Platforms
          </h2>
          <span className="chip rounded-full px-2 py-0.5 text-[10px] text-blue-300 font-bold">
            TMDB Powered
          </span>
        </div>

        {/* Region & Category Filter Pills */}
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All Platforms' },
            { id: 'global', label: '🌍 Global' },
            { id: 'india', label: '🇮🇳 India' },
            { id: 'bd', label: '🇧🇩 Bangladesh' },
            { id: 'pk', label: '🇵🇰 Pakistan' },
            { id: 'adult', label: '🔥 Bold & 18+' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}

          {/* New Add Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="shrink-0 flex items-center gap-1 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-300 border border-blue-400/40 hover:bg-blue-600 hover:text-white transition"
          >
            <span>+</span> Add Platform
          </button>
        </div>
      </div>

      {/* Horizontal Landscape Cards List ("landscap e hobe") */}
      <div className="relative group/platforms">
        <button
          onClick={() => scroll('left')}
          aria-label="Scroll left"
          className="spatial-pill absolute -left-2 top-1/2 z-20 hidden group-hover/platforms:grid h-8 w-8 -translate-y-1/2 place-items-center text-xs text-white/80 hover:text-white shadow-lg"
        >
          ‹
        </button>
        <button
          onClick={() => scroll('right')}
          aria-label="Scroll right"
          className="spatial-pill absolute -right-2 top-1/2 z-20 hidden group-hover/platforms:grid h-8 w-8 -translate-y-1/2 place-items-center text-xs text-white/80 hover:text-white shadow-lg"
        >
          ›
        </button>

        <div
          ref={scrollRef}
          className="no-scrollbar flex gap-3 overflow-x-auto pb-3 pt-1 px-1"
          style={{ cursor: 'grab' }}
          onMouseDown={onRowMouseDown}
          onMouseMove={onRowMouseMove}
          onMouseUp={onRowMouseUp}
          onMouseLeave={onRowMouseUp}
          onTouchStart={onRowTouchStart}
          onTouchMove={onRowTouchMove}
          onTouchEnd={onRowTouchEnd}
        >
          {filteredPlatforms.map((platform) => {
            const isSelected = selectedPlatform?.id === platform.id;
            return (
              <div
                key={platform.id}
                onClick={() => setSelectedPlatform(platform)}
                className={`group relative aspect-[16/9] w-36 sm:w-44 md:w-48 shrink-0 cursor-pointer overflow-hidden rounded-2xl border transition-all duration-300 ${
                  isSelected
                    ? 'border-blue-500 shadow-lg shadow-blue-500/30 scale-102 ring-1 ring-blue-400'
                    : 'border-white/10 hover:border-white/30 hover:scale-102'
                }`}
              >
                {/* Background Gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${platform.color} opacity-90 group-hover:opacity-100 transition`} />
                <div className="absolute inset-0 bg-[#0c101c]/50" />

                {/* Animated Logo / GIF Content */}
                <div className="relative z-10 flex h-full flex-col justify-between p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white/80 border border-white/10">
                      {platform.badge || 'Stream'}
                    </span>
                    {platform.isCustom && (
                      <button
                        onClick={(e) => handleDeleteCustom(platform.id, e)}
                        title="Delete custom platform"
                        className="text-[10px] text-white/40 hover:text-rose-400"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Center Animated Logo / GIF */}
                  <div className="my-auto flex items-center justify-center transform transition duration-300 group-hover:scale-110">
                    <PlatformAnimatedLogo
                      icon={platform.icon}
                      name={platform.name}
                      accent={platform.accent}
                    />
                  </div>

                  {/* Bottom Platform Name & Live Indicator */}
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[11px] font-bold text-white/90 group-hover:text-white">
                      {platform.name}
                    </span>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isSelected ? 'bg-blue-400 animate-ping' : 'bg-white/40'
                      }`}
                    />
                  </div>
                </div>

                {/* Bottom Active Glow Bar */}
                {isSelected && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-400" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* TMDB Landscape Content Shelf for Selected Platform ("tmdb theke data load nibe landscap e hobe") */}
      {selectedPlatform && (
        <div className="mt-4 rounded-2xl bg-white/[0.02] border border-white/10 p-3.5 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-blue-500 animate-pulse shadow-sm shadow-blue-500/50" />
              <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide">
                Popular on <span className="text-blue-400">{selectedPlatform.name}</span>
              </h3>
              <span className="chip rounded-full px-2 py-0.2 text-[10px] text-white/60">
                Landscape Cinema Mode
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              {platformContent.length > 0 && (
                <span className="text-[11px] text-white/50">
                  {platformContent.length} Titles Found
                </span>
              )}
              {platformContent.length > 0 && (
                <button
                  onClick={() => setShowSeeMoreModal(true)}
                  className="flex items-center gap-1 rounded-full bg-blue-600/30 hover:bg-blue-600 border border-blue-400/40 px-3 py-1 text-xs font-bold text-blue-200 hover:text-white transition shadow-sm"
                >
                  <span>See More</span>
                  <span className="text-[10px]">▶</span>
                </button>
              )}
            </div>
          </div>

          {loadingContent ? (
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="aspect-[16/9] w-56 sm:w-72 shrink-0 animate-pulse rounded-xl bg-white/5 border border-white/10" />
              ))}
            </div>
          ) : platformContent.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/50">
              <p>No titles currently returned by TMDB for {selectedPlatform.name}. Try another platform above.</p>
            </div>
          ) : (
            <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-2 pt-1 scroll-smooth">
              {platformContent.map((item) => (
                <div
                  key={`${item.id}-${item.name}`}
                  onClick={() => handlePlayTitle(item)}
                  className="group relative aspect-[16/9] w-56 sm:w-64 md:w-72 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 transition-all duration-300 hover:border-blue-500/50 hover:scale-102 hover:shadow-xl"
                >
                  {/* Landscape Backdrop Image */}
                  <img
                    src={item.backdrop || item.poster}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                  {/* Top Badges */}
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                    <span className="chip rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-300">
                      {item.type}
                    </span>
                    {item.rating && (
                      <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300 border border-amber-400/30">
                        ★ {item.rating}
                      </span>
                    )}
                  </div>

                  {/* Hover Stream Button in Center */}
                  <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-600/90 text-white shadow-lg shadow-blue-600/50 backdrop-blur-md transform transition group-hover:scale-110">
                      <svg className="h-4 w-4 fill-current ml-0.5" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>

                  {/* Bottom Title & Year */}
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <p className="truncate text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
                      {item.name}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-300 mt-0.5">
                      <span>{item.releaseInfo || selectedPlatform.name}</span>
                      <span className="text-blue-400 font-semibold">Watch Now ▶</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add New Platform Modal ("new add korar option rakhbe") */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="spatial-card w-full max-w-md rounded-2xl p-6 bg-[#111624] border border-white/20 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white">Add Streaming Platform</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="spatial-pill grid h-7 w-7 place-items-center text-xs text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustom} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  Platform Name <span className="text-blue-400">*</span>
                </label>
                <input
                  required
                  value={newPlatformName}
                  onChange={(e) => setNewPlatformName(e.target.value)}
                  placeholder="e.g. Discovery+, Crunchyroll, Shudder"
                  className="spatial-input w-full rounded-xl px-3 py-2 text-xs text-white placeholder-white/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Category / Region</label>
                <select
                  value={newPlatformCategory}
                  onChange={(e) => setNewPlatformCategory(e.target.value)}
                  className="spatial-input w-full rounded-xl px-3 py-2 text-xs text-white bg-[#161c2a]"
                >
                  <option value="global">🌍 Global / International</option>
                  <option value="india">🇮🇳 India</option>
                  <option value="bd">🇧🇩 Bangladesh</option>
                  <option value="pk">🇵🇰 Pakistan</option>
                  <option value="adult">🔥 Adult / 18+</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Badge Text</label>
                <input
                  value={newPlatformBadge}
                  onChange={(e) => setNewPlatformBadge(e.target.value)}
                  placeholder="e.g. Live TV, Anime, 4K"
                  className="spatial-input w-full rounded-xl px-3 py-2 text-xs text-white placeholder-white/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1">Brand Accent Color</label>
                <input
                  type="color"
                  value={newPlatformColor}
                  onChange={(e) => setNewPlatformColor(e.target.value)}
                  className="h-8 w-full rounded-lg cursor-pointer bg-transparent"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-glass rounded-xl px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-spatial-blue rounded-xl px-5 py-2 text-xs font-bold"
                >
                  Add Platform
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Full-Screen "See More" Platform Catalog Modal ─── */}
      {showSeeMoreModal && selectedPlatform && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-2 sm:p-4 md:p-6 backdrop-blur-xl animate-fadeIn"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowSeeMoreModal(false);
          }}
        >
          <div className="spatial-card flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-[#0c111e]/98 shadow-2xl">
            {/* Top Modal Header */}
            <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:p-6 sm:flex-row sm:items-center sm:justify-between bg-black/30">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 grid place-items-center rounded-2xl bg-gradient-to-br from-blue-600/30 to-purple-600/20 border border-white/15 p-1.5 shadow-md">
                  <PlatformAnimatedLogo
                    icon={selectedPlatform.icon}
                    name={selectedPlatform.name}
                    accent={selectedPlatform.accent}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-xl font-black tracking-tight text-white">
                      {selectedPlatform.name}
                    </h2>
                    <span className="chip rounded-full px-2 py-0.5 text-[10px] font-bold text-blue-300">
                      {selectedPlatform.badge || 'Catalog'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50">
                    Full Streaming Catalog • Powered by TMDB Official
                  </p>
                </div>
              </div>

              {/* Search & Close */}
              <div className="flex items-center gap-3">
                <div className="relative w-48 sm:w-64">
                  <input
                    type="text"
                    value={seeMoreSearch}
                    onChange={(e) => setSeeMoreSearch(e.target.value)}
                    placeholder={`Search ${selectedPlatform.name}...`}
                    className="w-full rounded-xl bg-white/10 px-3.5 py-1.5 text-xs text-white placeholder-white/40 border border-white/15 focus:outline-none focus:border-blue-400"
                  />
                  {seeMoreSearch && (
                    <button
                      onClick={() => setSeeMoreSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setShowSeeMoreModal(false)}
                  className="spatial-pill grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white/70 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Tabs (All, Movies, Series, Documentaries) */}
            {(() => {
              const allItems = platformContent || [];
              const moviesCount = allItems.filter((i) => i.type === 'movie' && !i.isDocumentary).length;
              const seriesCount = allItems.filter((i) => i.type === 'series').length;
              const docCount = allItems.filter((i) => i.isDocumentary).length;

              const filtered = allItems.filter((item) => {
                if (seeMoreType === 'movie') {
                  if (item.type !== 'movie' || item.isDocumentary) return false;
                } else if (seeMoreType === 'series') {
                  if (item.type !== 'series') return false;
                } else if (seeMoreType === 'documentary') {
                  if (!item.isDocumentary) return false;
                }
                if (seeMoreSearch.trim()) {
                  return (item.name || '').toLowerCase().includes(seeMoreSearch.toLowerCase().trim());
                }
                return true;
              });

              return (
                <>
                  <div className="flex items-center gap-2 border-b border-white/10 px-4 sm:px-6 py-2.5 bg-white/[0.02] text-xs overflow-x-auto no-scrollbar">
                    <button
                      onClick={() => setSeeMoreType('all')}
                      className={`rounded-full px-3 py-1 font-bold transition ${
                        seeMoreType === 'all'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      All Titles ({allItems.length})
                    </button>

                    <button
                      onClick={() => setSeeMoreType('movie')}
                      className={`rounded-full px-3 py-1 font-bold transition ${
                        seeMoreType === 'movie'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      🎬 Movies ({moviesCount})
                    </button>

                    <button
                      onClick={() => setSeeMoreType('series')}
                      className={`rounded-full px-3 py-1 font-bold transition ${
                        seeMoreType === 'series'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      📺 Series ({seriesCount})
                    </button>

                    <button
                      onClick={() => setSeeMoreType('documentary')}
                      className={`rounded-full px-3 py-1 font-bold transition ${
                        seeMoreType === 'documentary'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      📄 Documentaries ({docCount})
                    </button>
                  </div>

                  {/* Catalog Grid */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {filtered.length === 0 ? (
                      <div className="py-16 text-center text-xs text-white/50">
                        <p>No titles found matching your filter in {selectedPlatform.name}.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                        {filtered.map((item) => (
                          <div
                            key={`modal-${item.id}-${item.name}`}
                            onClick={() => {
                              setShowSeeMoreModal(false);
                              handlePlayTitle(item);
                            }}
                            className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all duration-300 hover:border-blue-500/60 hover:scale-102 hover:shadow-xl flex flex-col"
                          >
                            {/* Card Image */}
                            <div className="relative aspect-[16/9] w-full overflow-hidden bg-black/40">
                              <img
                                src={item.backdrop || item.poster}
                                alt={item.name}
                                loading="lazy"
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                              {/* Badges */}
                              <div className="absolute left-2 top-2 flex items-center gap-1">
                                <span className="chip rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase text-blue-300">
                                  {item.isDocumentary ? 'DOC' : item.type}
                                </span>
                                {item.rating && (
                                  <span className="rounded-md bg-amber-500/30 px-1 py-0.5 text-[8px] font-bold text-amber-300 border border-amber-400/40">
                                    ★ {item.rating}
                                  </span>
                                )}
                              </div>

                              {/* Play Hover Icon */}
                              <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-white shadow-lg">
                                  ▶
                                </div>
                              </div>
                            </div>

                            {/* Card Info */}
                            <div className="p-2.5 flex-1 flex flex-col justify-between">
                              <h4 className="truncate text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
                                {item.name}
                              </h4>
                              <div className="flex items-center justify-between text-[10px] text-white/50 mt-1">
                                <span>{item.releaseInfo || 'Featured'}</span>
                                <span className="text-blue-400 font-semibold group-hover:underline">
                                  Watch ▶
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
})
