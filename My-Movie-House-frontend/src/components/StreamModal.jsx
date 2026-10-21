import { useEffect, useState, useMemo } from 'react';
import { api } from '../api.js';
import VideoPlayer from './VideoPlayer.jsx';
import { parseStreamDetails } from '../utils/streamParser.js';

const labelFor = (stream) => stream.name || stream.title || stream.behaviorHints?.filename || stream.addonName || 'Stream';

function parseDetails(stream) {
  return parseStreamDetails(stream);
}

export default function StreamModal({ type, id, title, poster, onClose }) {
  const [streams, setStreams] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all, 4k, 1080p, 720p, bdix, hubcloud

  useEffect(() => {
    let active = true;
    api.getStreams(type, id)
      .then((data) => {
        if (active) {
          const valid = (data || []).filter((s) => (
            s &&
            (s.url || s.externalUrl) &&
            !s.externalUrl?.includes('donate') &&
            !s.name?.toLowerCase().includes('support the project')
          ));
          setStreams(valid);
        }
      })
      .catch((reason) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, id]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const filteredStreams = useMemo(() => {
    if (activeFilter === 'all') return streams;
    return streams.filter((s) => {
      const text = `${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.addonName || ''}`.toLowerCase();
      if (activeFilter === '4k') return text.includes('4k') || text.includes('2160');
      if (activeFilter === '1080p') return text.includes('1080');
      if (activeFilter === '720p') return text.includes('720');
      if (activeFilter === 'bdix') return text.includes('bdix') || text.includes('dhakaflix') || text.includes('icc');
      if (activeFilter === 'hubcloud') return text.includes('hubcloud') || text.includes('pixel') || text.includes('hdhub4u');
      return true;
    });
  }, [streams, activeFilter]);

  if (selected) {
    return (
      <VideoPlayer
        stream={selected}
        allStreams={streams}
        onSelectStream={(newStream) => setSelected(newStream)}
        title={title}
        type={type}
        id={id}
        poster={poster}
        onClose={onClose}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-3 sm:p-5 backdrop-blur-md transition-all animate-fadeIn"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="spatial-card relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-[#0e1424] shadow-2xl border border-white/20 flex flex-col">
        {/* Header */}
        <div className="border-b border-white/10 p-5 sm:p-6 bg-gradient-to-r from-blue-900/30 via-purple-900/10 to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
                <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">
                  Streaming Resources & Multi-Quality
                </h2>
                {!loading && (
                  <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-400/30">
                    {streams.length} Sources
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-300 line-clamp-1 font-medium">{title}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition shrink-0"
            >
              ✕
            </button>
          </div>

          {/* Quick Quality & Resource Filters */}
          {!loading && streams.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/10">
              <span className="text-[11px] font-bold text-white/50 mr-1">Quality:</span>
              {[
                { id: 'all', label: 'All Sources' },
                { id: '1080p', label: '1080p FHD' },
                { id: '720p', label: '720p HD' },
                { id: '4k', label: '4K UHD' },
                { id: 'hubcloud', label: 'HubCloud / Pixeldrain' },
                { id: 'bdix', label: 'BDIX ⚡' }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    activeFilter === f.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/40'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stream List Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6" onWheel={(e) => e.stopPropagation()}>
          {loading ? (
            <div className="py-20 text-center">
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <p className="text-sm font-semibold text-white/80">Scanning CloudStream providers & mirrors...</p>
              <p className="text-xs text-white/40 mt-1">Resolving HDHub4u, MoviesMod, BDIX & fast stream extractors</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-rose-950/40 p-6 text-center text-rose-300 border border-rose-500/30 text-xs">
              <p className="font-bold">{error}</p>
            </div>
          ) : filteredStreams.length === 0 ? (
            <div className="rounded-2xl bg-white/5 p-10 text-center border border-white/10">
              <p className="text-sm font-bold text-white">No streams matching this filter.</p>
              <p className="mt-1.5 text-xs text-slate-400">
                Click "All Sources" to see all available mirrors.
              </p>
              <button
                onClick={() => setActiveFilter('all')}
                className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {filteredStreams.map((stream, index) => {
                const details = parseDetails(stream);

                return (
                  <button
                    key={`${stream.addonId}-${stream.url || stream.externalUrl}-${index}`}
                    onClick={() => {
                      if (stream.url) {
                        setSelected(stream);
                      } else if (stream.externalUrl) {
                        window.open(stream.externalUrl, '_blank');
                      }
                    }}
                    className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl p-4 text-left transition-all border border-white/10 hover:border-blue-400/60 bg-white/[0.03] hover:bg-white/[0.08] shadow-sm hover:shadow-lg hover:shadow-blue-900/20"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600/30 text-blue-300 group-hover:bg-blue-600 group-hover:text-white transition shadow-sm">
                        ▶
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-white group-hover:text-blue-300 text-xs sm:text-sm truncate">
                            {details.serverName}
                          </span>

                          <span className={`rounded px-1.5 py-0.2 text-[10px] font-black border ${
                            details.resolution.includes('4K')
                              ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                              : details.resolution.includes('1080')
                              ? 'bg-blue-500/20 text-blue-300 border-blue-400/40'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          }`}>
                            {details.resolution}
                          </span>

                          {details.isDual && (
                            <span className="rounded bg-purple-500/20 px-1.5 py-0.2 text-[9px] font-bold text-purple-300 border border-purple-400/30">
                              Dual Audio
                            </span>
                          )}

                          {stream.addonName?.includes('BDIX') && (
                            <span className="rounded bg-yellow-500/20 px-1.5 py-0.2 text-[9px] font-bold text-yellow-300 border border-yellow-400/30">
                              BDIX ⚡
                            </span>
                          )}
                        </div>

                        <p className="mt-1 line-clamp-1 text-xs text-white/60 group-hover:text-white/80 transition">
                          {stream.title || stream.description || labelFor(stream)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {details.size && (
                        <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-mono font-bold text-emerald-300 border border-emerald-500/30">
                          💾 {details.size}
                        </span>
                      )}

                      <span className="rounded-lg bg-blue-600/30 group-hover:bg-blue-600 px-3 py-1 text-xs font-bold text-blue-200 group-hover:text-white border border-blue-400/40 transition">
                        Play Stream
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400 bg-black/20">
          <span>⚡ Select server and quality to play</span>
          <span>My-Movie-House Stream Engine</span>
        </div>
      </section>
    </div>
  );
}
