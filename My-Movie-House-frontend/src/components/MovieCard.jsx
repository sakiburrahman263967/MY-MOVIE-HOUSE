import { Link } from 'react-router-dom';

export default function MovieCard({ item, progressPercent }) {
  if (!item?.id) return null;
  const type = item.type || 'movie';
  const title = item.name || item.title || 'Untitled';

  return (
    <Link
      to={`/detail/${encodeURIComponent(type)}/${encodeURIComponent(item.id)}`}
      className="group block w-36 shrink-0 sm:w-44 md:w-48"
    >
      <div className="spatial-card relative aspect-[2/3] overflow-hidden rounded-2xl p-1 transition-all duration-300 border border-white/10 group-hover:border-blue-500/40">
        <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#101524]">
          {item.poster ? (
            <img
              src={item.poster}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-3 text-center">
              <svg className="h-8 w-8 text-white/30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              <span className="text-xs font-medium text-white/50 line-clamp-2">{title}</span>
            </div>
          )}

          {/* Frosted VisionOS Hover Overlay */}
          <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/90 via-black/40 to-black/20 p-3 opacity-0 backdrop-blur-[2px] transition-all duration-300 group-hover:opacity-100">
            <div className="flex justify-end">
              <span className="chip rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-blue-300 tracking-wider">
                {type}
              </span>
            </div>
            <div>
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-blue-600/80 text-white shadow-lg shadow-blue-600/50 backdrop-blur-md border border-white/40 mx-auto transform transition group-hover:scale-110">
                <svg className="h-4 w-4 fill-current ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <p className="line-clamp-2 text-center text-xs font-semibold text-white drop-shadow-md">{title}</p>
            </div>
          </div>

          {/* Progress bar for continue watching */}
          {Number.isFinite(progressPercent) && (
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50 backdrop-blur-sm">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 shadow-sm shadow-blue-500/50"
                style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
              />
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 truncate text-xs sm:text-sm font-bold text-white/90 group-hover:text-blue-400 transition-colors duration-200">
        {title}
      </p>
      {item.releaseInfo && <p className="text-[11px] text-slate-400 font-medium">{item.releaseInfo}</p>}
    </Link>
  );
}
