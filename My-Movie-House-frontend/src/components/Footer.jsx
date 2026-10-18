export default function Footer() {
  return (
    <footer className="mt-auto w-full pt-8 pb-4">
      <div className="spatial-card mx-auto flex flex-col items-center justify-between gap-4 rounded-2xl p-5 text-xs text-slate-300 md:flex-row border border-white/10">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white tracking-tight text-sm">My-Movie-House</span>
            <span className="rounded-full bg-blue-600/30 px-2 py-0.5 text-[10px] text-blue-300 font-bold border border-blue-400/30">
              Spatial UI v1.0
            </span>
          </div>
          <p className="text-[11px] text-slate-400 text-center sm:text-left">
            Apple VisionOS Spatial Cinema experience powered by Stremio addon ecosystem.
          </p>
        </div>

        <div className="flex flex-col items-center gap-1 sm:items-end">
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span>Designed & Developed by</span>
            <span className="font-bold text-white underline decoration-blue-500 decoration-2 underline-offset-4">
              Sakibur Rahman
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            © {new Date().getFullYear()} My-Movie-House. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
