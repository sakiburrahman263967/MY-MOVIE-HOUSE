import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

export default function Navbar() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const submit = (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#0f1422]/70 backdrop-blur-2xl px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        {/* Logo & Brand Identity */}
        <Link to="/" className="group flex shrink-0 items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 p-0.5 shadow-lg shadow-blue-600/30">
            <div className="grid h-full w-full place-items-center rounded-[14px] bg-[#0c101c]">
              <svg className="h-5 w-5 text-blue-400 transition group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v3h3V6H4zm5 0v3h6V6H9zm8 0v3h3V6h-3zM4 11v3h3v-3H4zm5 0v3h6v-3H9zm8 0v3h3v-3h-3zM4 16v2h3v-2H4zm5 0v2h6v-2H9zm8 0v2h3v-2h-3z"/>
              </svg>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight text-white sm:text-xl">
              <span className="bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
                My-Movie
              </span>
              -House
            </span>
            <span className="text-[10px] font-semibold tracking-wide text-slate-400">
              by <strong className="font-bold text-blue-400">Sakibur Rahman</strong>
            </span>
          </div>
        </Link>

        {/* VisionOS Navigation Pills */}
        <nav className="hidden items-center gap-1.5 rounded-full bg-white/5 p-1 border border-white/10 backdrop-blur-md sm:flex">
          <Link
            to="/"
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              isActive('/')
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            Home
          </Link>
          <Link
            to="/iptv"
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 ${
              isActive('/iptv')
                ? 'bg-red-600 text-white shadow-md shadow-red-600/40'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span>Live TV</span>
          </Link>
          <Link
            to="/settings"
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              isActive('/settings')
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            Addons
          </Link>
        </nav>

        {/* Creator Attribution Chip */}
        <div className="hidden lg:flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300 border border-blue-400/25">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          <span>Created by <strong className="font-bold text-white">Sakibur Rahman</strong></span>
        </div>

        {/* Search Bar */}
        <form onSubmit={submit} className="flex min-w-0 max-w-sm flex-1 items-center gap-2">
          <div className="relative w-full">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search movies & series"
              placeholder="Search movies & shows..."
              className="spatial-input w-full rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder-white/40"
            />
            <svg
              className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <button
            type="submit"
            className="btn-spatial-blue shrink-0 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold shadow-md"
          >
            Search
          </button>
        </form>
      </div>

      {/* Mobile Subnav */}
      <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2 text-xs sm:hidden">
        <div className="flex gap-4 font-semibold">
          <Link to="/" className={isActive('/') ? 'text-blue-400 font-bold' : 'text-white/70'}>
            Home
          </Link>
          <Link to="/iptv" className={`flex items-center gap-1 ${isActive('/iptv') ? 'text-red-400 font-bold' : 'text-white/70'}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            <span>Live TV</span>
          </Link>
          <Link to="/settings" className={isActive('/settings') ? 'text-blue-400 font-bold' : 'text-white/70'}>
            Addons
          </Link>
        </div>
        <span className="text-[11px] font-medium text-white/50">By Sakibur Rahman</span>
      </div>
    </header>
  );
}
