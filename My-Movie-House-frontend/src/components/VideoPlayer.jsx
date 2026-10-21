import { useEffect, useRef, useState, useCallback } from 'react';
import { progress, api, API_BASE } from '../api.js';
import { parseStreamDetails } from '../utils/streamParser.js';
import 'movi-player/element';

export function parseStreamInfo(s) {
  return parseStreamDetails(s);
}

export function isEmbedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (lower.includes('.mp4') || lower.includes('.m3u8') || lower.includes('/api/proxy/stream')) return false;
  const embedHosts = ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'streamtape.com', 'mixdrop.co', 'fembed.com', 'embed', 'iframe'];
  return embedHosts.some((h) => lower.includes(h));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function VideoPlayer({
  id,
  type = 'movie',
  title,
  poster,
  stream: initialStream = null,
  streams = [],
  subtitles = [],
  onClose,
  season,
  episode,
  isSeries = false
}) {
  const playerRef = useRef(null);
  const [allStreams, setAllStreams] = useState(streams || []);
  const [stream, setStream] = useState(initialStream);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [osd, setOsd] = useState(null);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const controlsTimeoutRef = useRef(null);
  const failedUrlsRef = useRef(new Set());

  useEffect(() => {
    setAllStreams(streams || []);
    if (initialStream) setStream(initialStream);
  }, [streams, initialStream]);

  const showOsd = useCallback((text) => {
    setOsd(text);
    setTimeout(() => setOsd(null), 1500);
  }, []);

  const activeStreamInfo = parseStreamInfo(stream);

  const handleSwitchServer = useCallback((newStream) => {
    if (!newStream?.url) return;
    setStream(newStream);
    setError('');
    setIsLoading(true);
    failedUrlsRef.current.add(newStream.url);
    setShowServerMenu(false);
    showOsd(`Switching to ${parseStreamInfo(newStream).serverName}...`);
  }, [showOsd]);

  const handleNextSource = useCallback(() => {
    const candidates = allStreams.filter((s) => s?.url && !failedUrlsRef.current.has(s.url));
    if (candidates.length < 2) {
      showOsd('No other sources');
      return;
    }
    const idx = candidates.findIndex((s) => s?.url === stream?.url);
    const next = candidates[(idx + 1 + candidates.length) % candidates.length];
    handleSwitchServer(next);
    showOsd(`Next source: ${parseStreamInfo(next).serverName}`);
  }, [allStreams, stream?.url, handleSwitchServer, showOsd]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onTime = () => setCurrentTime(player.currentTime || 0);
    const onDur = () => setDuration(player.duration || 0);
    const onPlay = () => { setIsPlaying(true); setIsLoading(false); };
    const onPause = () => setIsPlaying(false);
    const onRate = () => setPlaybackRate(player.playbackRate || 1);
    const onLoadStart = () => setIsLoading(true);
    const onLoaded = () => setIsLoading(false);
    const onErr = () => {
      if (stream?.url) failedUrlsRef.current.add(stream.url);
      setError('Playback failed');
      setIsLoading(false);
    };
    player.addEventListener('timeupdate', onTime);
    player.addEventListener('durationchange', onDur);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    player.addEventListener('ratechange', onRate);
    player.addEventListener('loadstart', onLoadStart);
    player.addEventListener('loadedmetadata', onLoaded);
    player.addEventListener('loadeddata', onLoaded);
    player.addEventListener('canplay', onLoaded);
    player.addEventListener('error', onErr);
    return () => {
      player.removeEventListener('timeupdate', onTime);
      player.removeEventListener('durationchange', onDur);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('ratechange', onRate);
      player.removeEventListener('loadstart', onLoadStart);
      player.removeEventListener('loadedmetadata', onLoaded);
      player.removeEventListener('loadeddata', onLoaded);
      player.removeEventListener('canplay', onLoaded);
      player.removeEventListener('error', onErr);
    };
  }, [stream?.url]);

  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !duration) return;
      if (id) {
        progress.set(id, {
          title,
          type,
          poster,
          currentTime: player.currentTime,
          duration: player.duration,
          percent: (player.currentTime / player.duration) * 100
        });
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [id, title, type, poster, duration]);

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) player.play().catch(() => {});
    else player.pause();
  };

  const seek = (e) => {
    const player = playerRef.current;
    if (!player || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    player.currentTime = pos * duration;
  };

  const toggleFullscreen = () => {
    const container = document.getElementById('movi-player-container');
    if (!container) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else container.requestFullscreen().catch(() => {});
  };

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const hide = () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    };
    hide();
    window.addEventListener('mousemove', hide);
    window.addEventListener('keydown', hide);
    return () => {
      window.removeEventListener('mousemove', hide);
      window.removeEventListener('keydown', hide);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const player = playerRef.current;
      if (!player) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); return; }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); return; }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); handleNextSource(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); player.currentTime = Math.min(player.currentTime + 10, player.duration || player.currentTime + 10); showOsd('+10s'); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); player.currentTime = Math.max(0, player.currentTime - 10); showOsd('-10s'); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); const v = Math.min(1, (player.volume || volume) + 0.1); player.volume = v; setVolume(v); setIsMuted(false); showOsd(`Volume ${Math.round(v*100)}%`); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); const v2 = Math.max(0, (player.volume || volume) - 0.1); player.volume = v2; setVolume(v2); showOsd(`Volume ${Math.round(v2*100)}%`); return; }
      if (e.key === '[') { e.preventDefault(); const r = Math.max(0.25, (player.playbackRate || playbackRate) - 0.25); player.playbackRate = r; setPlaybackRate(r); showOsd(`Speed ${r}x`); return; }
      if (e.key === ']') { e.preventDefault(); const r2 = Math.min(4, (player.playbackRate || playbackRate) + 0.25); player.playbackRate = r2; setPlaybackRate(r2); showOsd(`Speed ${r2}x`); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, toggleFullscreen, handleNextSource, volume, playbackRate, showOsd]);

  const sourceUrl = stream?.url || '';
  const isEmbed = isEmbedUrl(sourceUrl);

  if (isEmbed) {
    return (
      <div id="movi-player-container" className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
        <button onClick={onClose} className="absolute top-4 right-4 z-[101] bg-black/70 text-white px-3 py-2 rounded">✕ Close</button>
        <iframe src={sourceUrl} className="w-full h-full" allowFullScreen allow="autoplay; fullscreen" title={title} />
      </div>
    );
  }

  return (
    <div id="movi-player-container" className="fixed inset-0 z-[100] bg-black select-none">
      <button
        onClick={onClose}
        className={`absolute top-3 right-3 z-[110] rounded-full bg-black/60 hover:bg-black/80 text-white w-10 h-10 flex items-center justify-center transition-opacity ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        title="Close (Esc)"
      >
        ✕
      </button>

      {osd && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[120] bg-black/70 text-white px-6 py-3 rounded-xl text-lg font-bold pointer-events-none">
          {osd}
        </div>
      )}

      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-[105] pointer-events-none">
          <div className="w-12 h-12 border-4 border-white/30 border-t-amber-500 rounded-full animate-spin"></div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[106] bg-black/80 text-center px-4">
          <p className="text-rose-400 font-bold mb-2">Playback Error</p>
          <p className="text-white/70 text-sm mb-4">{error}</p>
          <div className="flex gap-2">
            <button onClick={handleNextSource} className="px-4 py-2 bg-emerald-600 text-white rounded-lg">Try Next Source</button>
            <button onClick={() => setShowServerMenu(true)} className="px-4 py-2 bg-white/10 text-white rounded-lg">Choose Server</button>
            <button onClick={onClose} className="px-4 py-2 bg-white/10 text-white rounded-lg">Close</button>
          </div>
        </div>
      )}

      <movi-player
        ref={playerRef}
        src={sourceUrl}
        controls
        autoplay
        playsinline
        style={{ width: '100%', height: '100%' }}
      />

      {/* Server/Menu overlay */}
      {showServerMenu && (
        <div className="absolute inset-0 z-[115] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-white font-bold">Select Source</h3>
              <button onClick={() => setShowServerMenu(false)} className="text-white/60 hover:text-white">✕</button>
            </div>
            <div className="p-2">
              {allStreams.map((s, idx) => {
                const info = parseStreamInfo(s);
                const active = s?.url === stream?.url;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSwitchServer(s)}
                    className={`w-full text-left p-3 rounded-xl mb-1 flex items-center justify-between ${active ? 'bg-amber-500/20 text-amber-400' : 'text-white hover:bg-white/5'}`}
                  >
                    <div>
                      <div className="font-semibold text-sm">{info.serverName}</div>
                      <div className="text-xs opacity-70">{info.resolution}{info.size ? ` • ${info.size}` : ''}</div>
                    </div>
                    {active && <span className="text-xs">Playing</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom info bar */}
      <div className={`absolute bottom-0 left-0 right-0 z-[112] bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center justify-between text-white text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold truncate max-w-[200px]">{title}</span>
            {activeStreamInfo.serverName && <span className="text-amber-400">{activeStreamInfo.serverName}</span>}
            {activeStreamInfo.resolution && <span className="text-emerald-400">{activeStreamInfo.resolution}</span>}
            {playbackRate !== 1 && <span className="text-cyan-400">{playbackRate}x</span>}
          </div>
          <div className="flex items-center gap-2">
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
            <button onClick={() => setShowServerMenu(true)} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">Sources</button>
            <button onClick={handleNextSource} className="px-2 py-1 bg-white/10 rounded hover:bg-white/20">Next (N)</button>
          </div>
        </div>
      </div>
    </div>
  );
}
