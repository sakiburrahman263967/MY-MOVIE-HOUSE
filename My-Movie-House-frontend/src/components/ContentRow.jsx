import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import MovieCard from './MovieCard.jsx';

export default function ContentRow({ catalog }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getCatalog(catalog.addonId, catalog.type, catalog.id)
      .then((data) => { if (active) setItems(data); })
      .catch((reason) => {
        if (active) {
          setItems([]);
          setError(reason.message);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [catalog.addonId, catalog.type, catalog.id]);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const offset = direction === 'left' ? -460 : 460;
      scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  if (!loading && items.length === 0 && !error) return null;

  return (
    <section className="group/row relative mb-8">
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
          <h2 className="text-base sm:text-lg md:text-xl font-bold tracking-tight text-white">{catalog.name}</h2>
          {items.length > 0 && (
            <span className="text-[11px] font-mono text-white/40 hidden sm:inline">
              ({items.length} titles)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="chip rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white/70">
            {catalog.addonName}
          </span>

          {/* See More Toggle Button */}
          {items.length > 4 && (
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="flex items-center gap-1 rounded-full bg-blue-600/20 hover:bg-blue-600 border border-blue-500/30 hover:border-blue-400 px-3 py-1 text-xs font-bold text-blue-300 hover:text-white transition shadow-sm"
              title={isExpanded ? 'Collapse to single row' : 'See all titles in a full grid'}
            >
              <span>{isExpanded ? 'Show Less ↑' : 'See More →'}</span>
            </button>
          )}

          {!isExpanded && (
            <>
              <button
                onClick={() => scroll('left')}
                aria-label="Scroll left"
                className="spatial-pill hidden sm:grid h-7 w-7 place-items-center text-xs text-white/80 hover:text-white"
              >
                ‹
              </button>
              <button
                onClick={() => scroll('right')}
                aria-label="Scroll right"
                className="spatial-pill hidden sm:grid h-7 w-7 place-items-center text-xs text-white/80 hover:text-white"
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>

      {isExpanded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 py-2 animate-fadeIn">
          {items.map((item) => (
            <MovieCard key={item.id} item={item} />
          ))}
        </div>
      ) : (

      <div ref={scrollRef} className="no-scrollbar flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scroll-smooth">
        {error ? (
          <div className="spatial-card w-full rounded-2xl p-5 text-center text-xs text-rose-300 border border-rose-500/20">
            {error}
          </div>
        ) : loading ? (
          Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="w-36 shrink-0 sm:w-44 md:w-48">
              <div className="aspect-[2/3] animate-pulse rounded-2xl bg-white/5 border border-white/10" />
              <div className="mt-2.5 h-3.5 w-3/4 animate-pulse rounded bg-white/10" />
            </div>
          ))
        ) : (
          items.map((item) => <MovieCard key={item.id} item={item} />)
        )}
      </div>
      )}
    </section>
  );
}
