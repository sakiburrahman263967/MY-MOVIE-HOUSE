import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, progress } from '../api.js';
import ContentRow from '../components/ContentRow.jsx';
import MovieCard from '../components/MovieCard.jsx';
import StreamingPlatforms from '../components/StreamingPlatforms.jsx';
import VideoPlayer from '../components/VideoPlayer.jsx';

export const getCatalogKey = (cat) => `${cat.addonId}:${cat.type}:${cat.id}`;

const isAdultCat = (cat) => {
  const t = `${cat.addonId} ${cat.addonName} ${cat.name} ${cat.id}`.toLowerCase();
  return (
    t.includes('cxxx') ||
    t.includes('adult') ||
    t.includes('porn') ||
    t.includes('xvideo') ||
    t.includes('xnxx') ||
    t.includes('jav') ||
    t.includes('superjav') ||
    t.includes('hentai') ||
    t.includes('cam4') ||
    t.includes('ptube') ||
    t.includes('eporner') ||
    t.includes('xhamster') ||
    t.includes('perverzija') ||
    t.includes('actionview') ||
    t.includes('desisins') ||
    t.includes('film1k') ||
    t.includes('aznude') ||
    t.includes('erotic') ||
    t.includes('nude') ||
    t.includes('nsfw') ||
    (Array.isArray(cat.genres) && cat.genres.some((g) => /adult|erotica|nsfw/i.test(g)))
  );
};

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentCategory = searchParams.get('cat') || 'all';
  const [showAllAdult, setShowAllAdult] = useState(false);
  const [selectedSiteForSeeMore, setSelectedSiteForSeeMore] = useState(null);
  const [selectedSiteCategoryTab, setSelectedSiteCategoryTab] = useState('all');

  // See More Interactive Explorer State (Film1k, AzNude, etc.)
  const [explorerPage, setExplorerPage] = useState(1);
  const [explorerSearch, setExplorerSearch] = useState('');
  const [explorerSearchInput, setExplorerSearchInput] = useState('');
  const [explorerCountry, setExplorerCountry] = useState('all');
  const [explorerClassic, setExplorerClassic] = useState('all');
  const [explorerYear, setExplorerYear] = useState('all');
  const [explorerCategory, setExplorerCategory] = useState('all');
  const [azType, setAzType] = useState('recent');
  const [azLetter, setAzLetter] = useState('all');
  const [azCountry, setAzCountry] = useState('all');
  const [explorerItems, setExplorerItems] = useState([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState('');
  const [activePlayingItem, setActivePlayingItem] = useState(null);

  const isFilm1k = useMemo(() => {
    if (!selectedSiteForSeeMore) return false;
    const t = `${selectedSiteForSeeMore.addonId || ''} ${selectedSiteForSeeMore.addonName || ''} ${selectedSiteForSeeMore.name || ''}`.toLowerCase();
    return t.includes('film1k');
  }, [selectedSiteForSeeMore]);

  const isAzNude = useMemo(() => {
    if (!selectedSiteForSeeMore) return false;
    const t = `${selectedSiteForSeeMore.addonId || ''} ${selectedSiteForSeeMore.addonName || ''} ${selectedSiteForSeeMore.name || ''}`.toLowerCase();
    return t.includes('aznude');
  }, [selectedSiteForSeeMore]);

  const isSpecialExplorer = isFilm1k || isAzNude;

  const handleOpenSeeMore = (cat) => {
    setSelectedSiteForSeeMore(cat);
    setSelectedSiteCategoryTab('all');
    setExplorerPage(1);
    setExplorerSearch('');
    setExplorerSearchInput('');
    setExplorerCountry('all');
    setExplorerClassic('all');
    setExplorerYear('all');
    setExplorerCategory('all');
    setAzType('recent');
    setAzLetter('all');
    setAzCountry('all');
    setExplorerItems([]);
  };

  useEffect(() => {
    if (!selectedSiteForSeeMore || !isSpecialExplorer) return;
    let active = true;
    setExplorerLoading(true);
    setExplorerError('');

    const extra = {
      page: explorerPage,
      search: explorerSearch,
    };

    if (isFilm1k) {
      if (explorerCountry !== 'all') extra.country = explorerCountry;
      if (explorerClassic !== 'all') extra.classic = explorerClassic;
      if (explorerYear !== 'all') extra.year = explorerYear;
      if (explorerCategory !== 'all') extra.category = explorerCategory;
    } else if (isAzNude) {
      extra.type = azType;
      if (azLetter !== 'all') extra.letter = azLetter;
      if (azCountry !== 'all') extra.country = azCountry;
    }

    api.getCatalog(selectedSiteForSeeMore.addonId, selectedSiteForSeeMore.type, selectedSiteForSeeMore.id, extra)
      .then((items) => {
        if (active) {
          setExplorerItems(Array.isArray(items) ? items : []);
        }
      })
      .catch((err) => {
        if (active) {
          setExplorerError(err.message || 'Failed to load content');
        }
      })
      .finally(() => {
        if (active) setExplorerLoading(false);
      });

    return () => { active = false; };
  }, [selectedSiteForSeeMore, isSpecialExplorer, isFilm1k, isAzNude, explorerPage, explorerSearch, explorerCountry, explorerClassic, explorerYear, explorerCategory, azType, azLetter, azCountry]);

  const [allCatalogs, setAllCatalogs] = useState([]);
  const [sliderItems, setSliderItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Drag-to-slide refs ("dore slide kora jabe")
  const dragStartX = useRef(null);
  const dragDeltaX = useRef(0);
  const isDragging = useRef(false);

  // Fast, non-blocking parallel catalog loading
  useEffect(() => {
    let active = true;

    api.getCatalogs()
      .then((cats) => {
        if (!active) return;
        const browseable = (cats || []).filter((cat) => !cat.extraRequired?.includes('search'));
        setAllCatalogs(browseable);
        setLoading(false);

        // Fetch top catalogs for hero slider
        const targetCatalogs = browseable.slice(0, 3);
        Promise.allSettled(
          targetCatalogs.map((cat) => api.getCatalog(cat.addonId, cat.type, cat.id))
        ).then((results) => {
          if (!active) return;
          const candidates = [];
          for (const res of results) {
            if (res.status === 'fulfilled' && Array.isArray(res.value)) {
              candidates.push(...res.value.slice(0, 4));
            }
          }
          const unique = Array.from(
            new Map(candidates.map((item) => [item.id, item])).values()
          );
          if (unique.length > 0) {
            setSliderItems(unique.slice(0, 7));
          }
        });
      })
      .catch((reason) => {
        if (active) {
          setError(reason.message);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const displayedCatalogs = useMemo(() => {
    if (allCatalogs.length === 0) return [];

    if (currentCategory === 'adult') {
      const adultCats = allCatalogs.filter(isAdultCat);
      if (showAllAdult) return adultCats;

      // Curate top 12 adult channels: prioritize Film1K, AzNude, Eporner, Xvideos, XNXX, JavGuru
      const priorityOrder = ['film1k', 'aznude', 'eporner', 'xvideos', 'xnxx', 'jav', 'superjav', 'hentai'];
      const sorted = [...adultCats].sort((a, b) => {
        const aKey = `${a.addonId} ${a.name}`.toLowerCase();
        const bKey = `${b.addonId} ${b.name}`.toLowerCase();
        const aIndex = priorityOrder.findIndex((p) => aKey.includes(p));
        const bIndex = priorityOrder.findIndex((p) => bKey.includes(p));
        const aVal = aIndex === -1 ? 999 : aIndex;
        const bVal = bIndex === -1 ? 999 : bIndex;
        return aVal - bVal;
      });
      return sorted.slice(0, 12);
    }
    if (currentCategory === 'movies') {
      return allCatalogs.filter((c) => c.type === 'movie' && !isAdultCat(c));
    }
    if (currentCategory === 'series') {
      return allCatalogs.filter((c) => (c.type === 'series' || c.type === 'tv') && !isAdultCat(c));
    }
    if (currentCategory === 'cloudstream') {
      return allCatalogs.filter((c) => c.addonId?.startsWith('cloudstream') && !isAdultCat(c));
    }

    // Default "all" view: Curated mix of Movies, Series, Adult (Eporner, Xvideos, XNXX, JavGuru) and CloudStream
    const regularMovies = allCatalogs.filter((c) => c.type === 'movie' && !isAdultCat(c) && !c.addonId?.startsWith('cloudstream')).slice(0, 5);
    const regularSeries = allCatalogs.filter((c) => (c.type === 'series' || c.type === 'tv') && !isAdultCat(c) && !c.addonId?.startsWith('cloudstream')).slice(0, 4);
    // Adult mix removed to keep regular home strictly clean
    const cloudstreamMix = allCatalogs.filter((c) => c.addonId?.startsWith('cloudstream') && !isAdultCat(c)).slice(0, 4);

    // Clean Home view: NO adult content on regular home
    let savedSections = null;
    try {
      const raw = localStorage.getItem('home_catalog_sections');
      if (raw) savedSections = JSON.parse(raw);
    } catch {}

    if (Array.isArray(savedSections) && savedSections.length > 0) {
      const nonAdultMap = new Map();
      allCatalogs.forEach((c) => {
        if (!isAdultCat(c)) nonAdultMap.set(getCatalogKey(c), c);
      });
      const userSelected = [];
      for (const key of savedSections) {
        const cat = nonAdultMap.get(key);
        if (cat) userSelected.push(cat);
      }
      if (userSelected.length > 0) return userSelected.slice(0, 12);
    }

    return [...regularMovies, ...regularSeries, ...cloudstreamMix].slice(0, 12);
  }, [allCatalogs, currentCategory, showAllAdult]);

  const siteCatalogs = useMemo(() => {
    if (!selectedSiteForSeeMore) return [];
    const targetAddonId = (selectedSiteForSeeMore.addonId || '').toLowerCase();
    const targetAddonName = (selectedSiteForSeeMore.addonName || '').toLowerCase();
    const targetGroupName = (selectedSiteForSeeMore.groupName || '').toLowerCase();
    const targetRepo = (selectedSiteForSeeMore.repoName || '').toLowerCase();

    const matches = allCatalogs.filter((c) => {
      const cAddonId = (c.addonId || '').toLowerCase();
      const cAddonName = (c.addonName || '').toLowerCase();
      const cGroupName = (c.groupName || '').toLowerCase();
      const cRepo = (c.repoName || '').toLowerCase();

      if (cAddonId && targetAddonId && cAddonId === targetAddonId) return true;
      if (cAddonName && targetAddonName && cAddonName === targetAddonName) return true;
      if (cGroupName && targetGroupName && cGroupName === targetGroupName) return true;
      if (cRepo && targetRepo && cRepo === targetRepo) return true;

      if (isAdultCat(selectedSiteForSeeMore) && isAdultCat(c)) {
        if (targetAddonId.includes('film1k') && cAddonId.includes('film1k')) return true;
        if (targetAddonId.includes('aznude') && cAddonId.includes('aznude')) return true;
      }
      return false;
    });

    if (matches.length > 0) return matches;
    return [selectedSiteForSeeMore];
  }, [selectedSiteForSeeMore, allCatalogs]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + sliderItems.length) % sliderItems.length);
  }, [sliderItems.length]);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % sliderItems.length);
  }, [sliderItems.length]);

  // Auto-sliding interval: slides every 4.5 seconds unless user hovers
  useEffect(() => {
    if (sliderItems.length <= 1 || isHovered) return undefined;
    const interval = setInterval(() => {
      nextSlide();
    }, 4500);
    return () => clearInterval(interval);
  }, [sliderItems.length, isHovered, nextSlide]);

  // Touch and mouse drag handlers ("dore slide kora jabe")
  const handleDragStart = (clientX) => {
    dragStartX.current = clientX;
    dragDeltaX.current = 0;
    isDragging.current = true;
  };

  const handleDragMove = (clientX) => {
    if (!isDragging.current || dragStartX.current === null) return;
    dragDeltaX.current = clientX - dragStartX.current;
  };

  const handleDragEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (Math.abs(dragDeltaX.current) > 40) {
      if (dragDeltaX.current < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    dragStartX.current = null;
    dragDeltaX.current = 0;
  };

  const currentHero = sliderItems[currentIndex] || null;
  const continueWatching = progress.getAll().slice(0, 8);
  const heroTitle = currentHero?.name || currentHero?.title || 'Trending Feature';

  return (
    <div className="mx-auto max-w-7xl pb-10">
      {/* Hero Section: VisionOS Spatial Auto-Slider with Drag-to-Slide Support */}
      {currentHero ? (
        <section
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => {
            setIsHovered(false);
            handleDragEnd();
          }}
          onMouseDown={(e) => handleDragStart(e.clientX)}
          onMouseMove={(e) => handleDragMove(e.clientX)}
          onMouseUp={handleDragEnd}
          onTouchStart={(e) => handleDragStart(e.touches[0]?.clientX || 0)}
          onTouchMove={(e) => handleDragMove(e.touches[0]?.clientX || 0)}
          onTouchEnd={handleDragEnd}
          className="spatial-card relative mb-10 flex min-h-[380px] h-[48vh] max-h-[500px] select-none cursor-grab active:cursor-grabbing overflow-hidden border border-white/15 shadow-xl"
        >
          {/* Background Image / Backdrop */}
          <div key={currentHero.id} className="absolute inset-0 animate-spatial-fade pointer-events-none">
            {currentHero.background ? (
              <img
                src={currentHero.background}
                alt=""
                loading="eager"
                decoding="async"
                className="h-full w-full object-cover object-center"
              />
            ) : currentHero.poster ? (
              <img
                src={currentHero.poster}
                alt=""
                loading="eager"
                decoding="async"
                className="h-full w-full object-cover object-top opacity-60 blur-xs scale-105"
              />
            ) : null}

            {/* Subtle Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0e1422] via-transparent to-black/30" />
          </div>

          {/* Previous / Next Arrow Controls ("age pore newar option") */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevSlide();
            }}
            aria-label="Previous Slide"
            className="spatial-pill absolute left-3 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center text-xs text-white/90 hover:text-white hover:scale-105 active:scale-95 transition sm:left-4"
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextSlide();
            }}
            aria-label="Next Slide"
            className="spatial-pill absolute right-3 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center text-xs text-white/90 hover:text-white hover:scale-105 active:scale-95 transition sm:right-4"
          >
            ›
          </button>

          {/* Compact Hero Card in Bottom Corner ("hero card title ek konay aro choto thakbe") */}
          <div
            key={`content-${currentHero.id}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5 z-10 max-w-xs sm:max-w-sm md:max-w-md rounded-2xl p-3 sm:p-4 bg-black/75 backdrop-blur-md border border-white/15 shadow-xl animate-spatial-slide"
          >
            {/* Minimal Metadata Badges */}
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-blue-600/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300 border border-blue-400/40">
                Trending #{currentIndex + 1}
              </span>
              <span className="chip rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white/80">
                {currentHero.type || 'Movie'}
              </span>
              {currentHero.year && (
                <span className="chip rounded-full px-1.5 py-0.5 text-[10px] text-white/70">
                  {currentHero.year}
                </span>
              )}
              {currentHero.genres?.[0] && (
                <span className="chip hidden sm:inline-block rounded-full px-1.5 py-0.5 text-[10px] text-white/70">
                  {currentHero.genres[0]}
                </span>
              )}
            </div>

            {/* Small Compact Title ("title ek konay aro choto thakbe") */}
            <h1 className="text-sm sm:text-base md:text-lg font-black tracking-tight text-white drop-shadow line-clamp-1">
              {heroTitle}
            </h1>

            {/* Short Synopsis */}
            {currentHero.description && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-300">
                {currentHero.description}
              </p>
            )}

            {/* Compact Action Buttons */}
            <div className="mt-2.5 flex items-center gap-2">
              <Link
                to={`/detail/${encodeURIComponent(currentHero.type || 'movie')}/${encodeURIComponent(currentHero.id)}`}
                className="btn-spatial-blue inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold shadow-md"
              >
                <span>▶</span> Watch
              </Link>
              <Link
                to={`/detail/${encodeURIComponent(currentHero.type || 'movie')}/${encodeURIComponent(currentHero.id)}`}
                className="btn-glass inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/90"
              >
                <span>ⓘ</span> Details
              </Link>
            </div>
          </div>

          {/* Slide Indicator Dots at Bottom Right */}
          <div className="absolute bottom-3 right-4 z-20 flex items-center gap-1 sm:bottom-4 sm:right-6">
            {sliderItems.map((item, idx) => (
              <button
                key={item.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                aria-label={`Go to slide ${idx + 1}`}
                className={`transition-all duration-300 ${
                  currentIndex === idx
                    ? 'h-1.5 w-5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50'
                    : 'h-1.5 w-1.5 rounded-full bg-white/30 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        </section>
      ) : loading ? (
        <section className="spatial-card mb-8 flex min-h-[300px] flex-col items-center justify-center rounded-2xl p-6 border border-white/10">
          <div className="mb-2.5 h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-xs font-medium text-white/70">Loading My-Movie-House...</p>
        </section>
      ) : (
        <section className="spatial-card mb-8 flex min-h-[260px] flex-col justify-center rounded-2xl p-6 sm:p-8 border border-white/15">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-300 border border-blue-400/30">
              My-Movie-House
            </span>
            <span className="chip rounded-full px-2 py-0.5 text-[11px] text-white/70">
              by Sakibur Rahman
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            Apple VisionOS Spatial Streaming Portal
          </h1>
          <p className="mt-2 max-w-lg text-xs sm:text-sm text-slate-300 leading-relaxed">
            Configure your Stremio catalog addons in Settings to stream movies and TV series.
          </p>
          {error && (
            <div className="mt-3 max-w-md rounded-xl bg-rose-950/40 p-3 border border-rose-500/30 text-rose-300 text-xs">
              <p className="font-semibold">{error}</p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/settings" className="btn-spatial-blue rounded-xl px-5 py-2 text-xs font-bold text-white">
              Configure Addons
            </Link>
          </div>
        </section>
      )}

      {/* Streaming Platforms Category Shelf (TMDB Landscape & Animated Logos) */}
      <StreamingPlatforms />

      {/* ─── Live TV Quick Bar ─── */}
      <section className="spatial-card mb-8 rounded-2xl p-4 sm:p-5 border border-red-500/25 bg-gradient-to-r from-red-950/20 via-slate-900/40 to-slate-950/40 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-600/25 text-red-400 font-bold border border-red-500/30 text-lg">
              📡
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">Live Broadcast & IPTV TV Channels</h2>
                <span className="flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-black uppercase text-red-300 border border-red-400/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Watch News, Sports, Entertainment, and Regional TV streams directly in browser with HLS playback.
              </p>
            </div>
          </div>
          <Link
            to="/iptv"
            className="btn-spatial-blue self-start sm:self-center shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-md shadow-blue-600/30"
          >
            <span>▶ Watch Live TV</span>
            <span>→</span>
          </Link>
        </div>
      </section>

      {/* Continue Watching Section */}
      {continueWatching.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-3.5 w-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
            <h2 className="text-base font-bold tracking-tight text-white sm:text-lg">Continue Watching</h2>
            <span className="text-xs text-white/50">({continueWatching.length})</span>
          </div>
          <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-3 pt-1 px-1">
            {continueWatching.map((item) => (
              <MovieCard
                key={item.id}
                item={{ id: item.id, type: item.type, name: item.title, poster: item.poster }}
                progressPercent={item.percent}
              />
            ))}
          </div>
        </section>
      )}

      {/* Category Pills Navigation */}
      <div id="category-pills" className="mb-6 flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        {[
          { id: 'all', label: '🍿 All Content', color: 'blue' },
          { id: 'movies', label: '🎬 Movies', color: 'blue' },
          { id: 'series', label: '📺 TV Series', color: 'indigo' },
          { id: 'adult', label: '🔞 Adult (18+)', color: 'rose' },
          { id: 'cloudstream', label: '⚡ CloudStream & BDIX', color: 'emerald' }
        ].map((tab) => {
          const isActive = currentCategory === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setSearchParams(tab.id === 'all' ? {} : { cat: tab.id })}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                isActive
                  ? tab.id === 'adult'
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40'
                    : 'bg-blue-600 text-white shadow-lg shadow-blue-600/40'
                  : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
              }`}
              style={
                isActive && tab.id === 'adult'
                  ? {
                      backgroundColor: '#e11d48',
                      color: '#ffffff',
                      boxShadow: '0 4px 14px rgba(225, 29, 72, 0.45)'
                    }
                  : undefined
              }
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Adult Category Controlled Filter Header */}
      {currentCategory === 'adult' && (
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-gradient-to-r from-rose-950/40 via-slate-900/40 to-slate-950/40 border border-rose-500/30 p-4 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-600/30 text-rose-300 font-bold border border-rose-500/40 text-base">
              🔞
            </span>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <span>{showAllAdult ? 'All Adult & NSFW Channels' : 'Curated Top Adult Channels'}</span>
                <span className="rounded-full bg-rose-500/25 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-400/30">
                  {displayedCatalogs.length} Channels
                </span>
              </h2>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {showAllAdult
                  ? 'Showing all installed adult catalogs.'
                  : 'Showing curated top 12 channels (Film1K, AzNude, Eporner, Xvideos, XNXX, JavGuru).'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAllAdult((prev) => !prev)}
            className="self-start sm:self-center shrink-0 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white px-3.5 py-1.5 text-xs font-bold transition shadow-md shadow-rose-600/30 border border-rose-400/40"
          >
            {showAllAdult ? '⚡ Switch to Top 12 Curated' : '📂 Show All 40+ Channels'}
          </button>
        </div>
      )}

      {/* Catalog Content Rows */}
      {displayedCatalogs.map((catalog) => (
        <ContentRow
          key={`${catalog.addonId}-${catalog.type}-${catalog.id}`}
          catalog={catalog}
          onSeeMoreSite={handleOpenSeeMore}
        />
      ))}

      {!loading && !error && displayedCatalogs.length === 0 && (
        <div className="spatial-card rounded-2xl p-8 text-center border border-white/10">
          <p className="text-sm font-bold text-white">No Catalogs Available</p>
          <p className="mt-1.5 text-xs text-slate-400">
            Please add or enable Stremio addons in the Addons page to load content.
          </p>
          <Link to="/settings" className="btn-spatial-blue mt-4 inline-block rounded-xl px-4 py-1.5 text-xs font-bold">
            Open Addons Settings
          </Link>
        </div>
      )}

      {/* 🌟 Comprehensive Site Homepage & Multi-Category Explorer Modal 🌟 */}
      {selectedSiteForSeeMore && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-xl animate-fadeIn"
          onClick={() => setSelectedSiteForSeeMore(null)}
        >
          <div
            className="relative w-full max-w-6xl max-h-[90vh] rounded-3xl bg-[#0b1329] border border-blue-500/40 p-4 sm:p-6 shadow-2xl flex flex-col text-left overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <span className="h-3.5 w-3.5 rounded-full bg-blue-400 shadow-lg shadow-blue-400/50 animate-pulse" />
                <div>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white flex items-center gap-2 flex-wrap">
                    <span>{selectedSiteForSeeMore.addonName || selectedSiteForSeeMore.name}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 font-mono font-normal">
                      {siteCatalogs.length} Categories / Sections Found
                    </span>
                  </h2>
                  <p className="text-xs text-white/50 mt-0.5">
                    Viewing all categories, genres, and sections available from this provider
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedSiteForSeeMore(null)}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white hover:bg-rose-600 hover:text-white transition font-bold text-base shadow cursor-pointer"
                  title="Close (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            {siteCatalogs.length > 1 && (
              <div className="flex items-center gap-2 py-3 overflow-x-auto shrink-0 border-b border-white/5 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setSelectedSiteCategoryTab('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    selectedSiteCategoryTab === 'all'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  All Sections (Homepage View)
                </button>
                {siteCatalogs.map((cat) => (
                  <button
                    key={`tab-${cat.addonId}-${cat.id}`}
                    type="button"
                    onClick={() => setSelectedSiteCategoryTab(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      selectedSiteCategoryTab === cat.id
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {cat.name} ({cat.type})
                  </button>
                ))}
              </div>
            )}

            {isSpecialExplorer ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* ─── Interactive Filter & Search Toolbar ─── */}
                <div className="p-3 sm:p-4 bg-white/[0.03] border-b border-white/10 flex flex-col gap-3 shrink-0">
                  <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                    {/* Search Form */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        setExplorerSearch(explorerSearchInput.trim());
                        setExplorerPage(1);
                      }}
                      className="relative flex-1 max-w-md flex items-center gap-2"
                    >
                      <div className="relative flex-1">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-xs">🔍</span>
                        <input
                          type="text"
                          value={explorerSearchInput}
                          onChange={(e) => setExplorerSearchInput(e.target.value)}
                          placeholder={isFilm1k ? "Search Film1K movies (e.g. Italian, 1980, Love)..." : "Search AZNude actress, movie, or series..."}
                          className="w-full spatial-input rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-white/35 font-medium border border-white/15 focus:border-blue-400"
                        />
                        {explorerSearchInput && (
                          <button
                            type="button"
                            onClick={() => {
                              setExplorerSearchInput('');
                              setExplorerSearch('');
                              setExplorerPage(1);
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2 transition shrink-0 cursor-pointer shadow-md"
                      >
                        Search
                      </button>
                    </form>

                    {/* Pagination Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={explorerPage <= 1 || explorerLoading}
                        onClick={() => setExplorerPage((p) => Math.max(1, p - 1))}
                        className="rounded-xl px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>‹ Prev</span>
                      </button>
                      <span className="rounded-xl px-3 py-1.5 text-xs font-extrabold bg-blue-600/30 text-blue-300 border border-blue-400/30">
                        Page {explorerPage}
                      </span>
                      <button
                        type="button"
                        disabled={explorerLoading || explorerItems.length === 0}
                        onClick={() => setExplorerPage((p) => p + 1)}
                        className="rounded-xl px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>Next ›</span>
                      </button>
                    </div>
                  </div>

                  {/* Film1k Dropdown Filters */}
                  {isFilm1k && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      {/* Country Dropdown */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-white/60">Country:</span>
                        <select
                          value={explorerCountry}
                          onChange={(e) => {
                            setExplorerCountry(e.target.value);
                            setExplorerPage(1);
                          }}
                          className="spatial-input rounded-xl px-2.5 py-1 text-xs text-white bg-slate-900 border border-white/15 cursor-pointer"
                        >
                          <option value="all">All Countries</option>
                          <option value="france">France 🇫🇷</option>
                          <option value="italy">Italy 🇮🇹</option>
                          <option value="usa">USA 🇺🇸</option>
                          <option value="uk">United Kingdom 🇬🇧</option>
                          <option value="germany">Germany 🇩🇪</option>
                          <option value="spain">Spain 🇪🇸</option>
                          <option value="japan">Japan 🇯🇵</option>
                          <option value="australia">Australia 🇦🇺</option>
                          <option value="brazil">Brazil 🇧🇷</option>
                          <option value="canada">Canada 🇨🇦</option>
                          <option value="denmark">Denmark 🇩🇰</option>
                          <option value="greece">Greece 🇬🇷</option>
                          <option value="india">India 🇮🇳</option>
                        </select>
                      </div>

                      {/* Classic / Era Dropdown */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-white/60">Era / Classic:</span>
                        <select
                          value={explorerClassic}
                          onChange={(e) => {
                            setExplorerClassic(e.target.value);
                            setExplorerPage(1);
                          }}
                          className="spatial-input rounded-xl px-2.5 py-1 text-xs text-white bg-slate-900 border border-white/15 cursor-pointer"
                        >
                          <option value="all">All Eras</option>
                          <option value="1960s">1960s Classic</option>
                          <option value="1970s">1970s Golden Era</option>
                          <option value="1980s">1980s Vintage</option>
                          <option value="1990s">1990s Retro</option>
                          <option value="2000s">2000s</option>
                          <option value="2010s">2010s</option>
                          <option value="2020s">2020s Recent</option>
                          <option value="exploitation">Exploitation</option>
                        </select>
                      </div>

                      {/* Genre / Category Dropdown */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-white/60">Category:</span>
                        <select
                          value={explorerCategory}
                          onChange={(e) => {
                            setExplorerCategory(e.target.value);
                            setExplorerPage(1);
                          }}
                          className="spatial-input rounded-xl px-2.5 py-1 text-xs text-white bg-slate-900 border border-white/15 cursor-pointer"
                        >
                          <option value="all">All Categories</option>
                          <option value="action">Action</option>
                          <option value="comedy">Comedy</option>
                          <option value="horror">Horror</option>
                          <option value="mystery">Mystery</option>
                          <option value="sci-fi">Sci-Fi</option>
                          <option value="thriller">Thriller</option>
                        </select>
                      </div>

                      {/* Reset Filters */}
                      <button
                        type="button"
                        onClick={() => {
                          setExplorerSearch('');
                          setExplorerSearchInput('');
                          setExplorerCountry('all');
                          setExplorerClassic('all');
                          setExplorerYear('all');
                          setExplorerCategory('all');
                          setExplorerPage(1);
                        }}
                        className="ml-auto rounded-xl px-2.5 py-1 text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    </div>
                  )}

                  {/* AZNude Type & Letter Filters */}
                  {isAzNude && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      {/* Section Pills */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { id: 'recent', label: '⚡ Recent Videos' },
                          { id: 'movies', label: '🎬 Movies (with Posters)' },
                          { id: 'trending', label: '🔥 Trending Movies' },
                          { id: 'celebs', label: '⭐ Actresses (A-Z)' },
                        ].map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setAzType(t.id);
                              setExplorerPage(1);
                            }}
                            className={`rounded-xl px-3 py-1 font-bold transition cursor-pointer ${
                              azType === t.id
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      {/* Actresses Letter / Country Filter */}
                      {azType === 'celebs' && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <span className="text-[11px] font-semibold text-white/60">A-Z Letter:</span>
                          <select
                            value={azLetter}
                            onChange={(e) => {
                              setAzLetter(e.target.value);
                              setExplorerPage(1);
                            }}
                            className="spatial-input rounded-xl px-2 py-1 text-xs text-white bg-slate-900 border border-white/15 cursor-pointer"
                          >
                            <option value="all">All Letters</option>
                            {'abcdefghijklmnopqrstuvwxyz'.split('').map((l) => (
                              <option key={l} value={l}>{l.toUpperCase()}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Reset Filters */}
                      <button
                        type="button"
                        onClick={() => {
                          setExplorerSearch('');
                          setExplorerSearchInput('');
                          setAzType('recent');
                          setAzLetter('all');
                          setAzCountry('all');
                          setExplorerPage(1);
                        }}
                        className="ml-auto rounded-xl px-2.5 py-1 text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    </div>
                  )}
                </div>

                {/* Content Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                  {explorerLoading ? (
                    <div className="py-24 text-center">
                      <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                      <p className="text-sm font-semibold text-white/70">
                        Loading {isFilm1k ? 'Film1K' : 'AZNude'} Page {explorerPage}...
                      </p>
                    </div>
                  ) : explorerError ? (
                    <div className="py-20 text-center">
                      <p className="text-sm font-bold text-rose-300">{explorerError}</p>
                      <button
                        type="button"
                        onClick={() => setExplorerPage((p) => p)}
                        className="btn-spatial-blue mt-4 rounded-xl px-4 py-2 text-xs font-bold"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : explorerItems.length === 0 ? (
                    <div className="py-20 text-center text-white/50 text-xs">
                      No items found. Try a different search keyword or category filter.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                      {explorerItems.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setActivePlayingItem(item)}
                          className="group relative flex flex-col rounded-2xl border border-white/10 bg-[#101524] overflow-hidden cursor-pointer hover:border-blue-500/50 hover:shadow-xl transition-all duration-300"
                        >
                          <div className="relative aspect-[2/3] w-full overflow-hidden bg-black/40">
                            {item.poster ? (
                              <img
                                src={item.poster}
                                alt={item.title || item.name}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center p-3 text-center text-white/30 text-xs font-bold">
                                {item.title || item.name}
                              </div>
                            )}

                            {/* 1-Click Play Overlay */}
                            <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                              <div className="flex justify-end">
                                <span className="rounded-full bg-blue-600/80 px-2 py-0.5 text-[9px] font-extrabold uppercase text-white shadow">
                                  {isFilm1k ? 'Film1K' : 'AZNude'}
                                </span>
                              </div>
                              <div>
                                <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/50 border border-white/30 transform group-hover:scale-110 transition">
                                  ▶
                                </div>
                                <p className="text-[11px] font-bold text-center text-white line-clamp-2 drop-shadow">
                                  {item.title || item.name}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="p-2 bg-slate-900/80 border-t border-white/5">
                            <p className="truncate text-xs font-bold text-white/90 group-hover:text-blue-300 transition">
                              {item.title || item.name}
                            </p>
                            <div className="flex items-center justify-between mt-1 text-[10px] text-white/50">
                              <span>1-Click Play</span>
                              <span className="text-emerald-400 font-bold">⚡ Stream</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Multi-Section Content Area */
              <div className="flex-1 overflow-y-auto py-4 pr-1 space-y-6">
                {(selectedSiteCategoryTab === 'all'
                  ? siteCatalogs
                  : siteCatalogs.filter((c) => c.id === selectedSiteCategoryTab)
                ).map((cat) => (
                  <ContentRow key={`modal-cat-${cat.addonId}-${cat.type}-${cat.id}`} catalog={cat} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
