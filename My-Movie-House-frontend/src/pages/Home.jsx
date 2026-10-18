import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, progress } from '../api.js';
import ContentRow from '../components/ContentRow.jsx';
import MovieCard from '../components/MovieCard.jsx';
import StreamingPlatforms from '../components/StreamingPlatforms.jsx';

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
    t.includes('hentai') ||
    t.includes('cam4') ||
    t.includes('ptube') ||
    t.includes('eporner') ||
    t.includes('xhamster')
  );
};

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentCategory = searchParams.get('cat') || 'all';

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
      return allCatalogs.filter(isAdultCat);
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
    const adultMix = allCatalogs.filter(isAdultCat).slice(0, 6);
    const cloudstreamMix = allCatalogs.filter((c) => c.addonId?.startsWith('cloudstream') && !isAdultCat(c)).slice(0, 4);

    return [...regularMovies, ...regularSeries, ...adultMix, ...cloudstreamMix];
  }, [allCatalogs, currentCategory]);

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
      <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
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
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Catalog Content Rows */}
      {displayedCatalogs.map((catalog) => (
        <ContentRow key={`${catalog.addonId}-${catalog.type}-${catalog.id}`} catalog={catalog} />
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
    </div>
  );
}
