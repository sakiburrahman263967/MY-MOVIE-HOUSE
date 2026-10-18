import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import MovieCard from '../components/MovieCard.jsx';

export default function Search() {
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setItems([]);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setError('');
    api.search(query).then((data) => { if (active) setItems(data); })
      .catch((reason) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);

  return (
    <div className="mx-auto max-w-7xl pb-16">
      <div className="spatial-card mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6 border border-white/15">
        <div>
          <span className="rounded-full bg-blue-600/30 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-300 border border-blue-400/40">
            My-Movie-House Search
          </span>
          <h1 className="mt-2 text-xl sm:text-2xl font-black text-white">
            {query ? (
              <>Search Results for: <span className="text-blue-400">"{query}"</span></>
            ) : (
              'Discover Movies & Series'
            )}
          </h1>
        </div>
        {items.length > 0 && (
          <span className="chip rounded-full px-3.5 py-1 text-xs font-bold text-white/80">
            {items.length} titles found
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm font-semibold text-white/70">Searching across configured addons...</p>
        </div>
      ) : error ? (
        <div className="spatial-card mx-auto max-w-lg rounded-3xl p-8 text-center border border-rose-500/30 text-rose-300">
          <p className="font-bold">{error}</p>
          <p className="mt-2 text-xs text-white/60">Please verify addon health in Settings.</p>
        </div>
      ) : !query ? (
        <div className="spatial-card mx-auto max-w-md rounded-3xl p-10 text-center border border-white/10">
          <svg className="mx-auto h-12 w-12 text-white/30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-base font-bold text-white">Ready to Search</p>
          <p className="mt-1 text-xs text-slate-400 font-medium">Type any movie or show title in the search bar above.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="spatial-card mx-auto max-w-md rounded-3xl p-10 text-center border border-white/10">
          <p className="text-base font-bold text-white">No results found for "{query}"</p>
          <p className="mt-2 text-xs text-slate-400 font-medium">Check spelling or add more streaming addons in Settings.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => (
            <MovieCard key={`${item.type}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
