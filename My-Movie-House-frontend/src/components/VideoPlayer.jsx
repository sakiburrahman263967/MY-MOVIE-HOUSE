import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { progress, api, API_BASE, mediaPrep } from '../api.js';
import { parseStreamDetails } from '../utils/streamParser.js';

// Map ISO 639-1 / 639-2 codes to human-readable names
function formatLanguageName(codeOrName) {
  if (!codeOrName || typeof codeOrName !== 'string') return 'Unknown';
  const clean = codeOrName.trim().toLowerCase();
  const map = {
    eng: 'English', en: 'English',
    hin: 'Hindi', hi: 'Hindi',
    ben: 'Bangla', bn: 'Bangla', bangla: 'Bangla', bengali: 'Bangla',
    tam: 'Tamil', ta: 'Tamil',
    tel: 'Telugu', te: 'Telugu',
    mal: 'Malayalam', ml: 'Malayalam',
    kan: 'Kannada', kn: 'Kannada',
    urd: 'Urdu', ur: 'Urdu',
    spa: 'Spanish', es: 'Spanish',
    fre: 'French', fra: 'French', fr: 'French',
    ger: 'German', deu: 'German', de: 'German',
    ara: 'Arabic', ar: 'Arabic',
    kor: 'Korean', ko: 'Korean',
    jpn: 'Japanese', ja: 'Japanese',
    por: 'Portuguese', pt: 'Portuguese',
    rus: 'Russian', ru: 'Russian',
    ita: 'Italian', it: 'Italian',
    chi: 'Chinese', zho: 'Chinese', zh: 'Chinese'
  };
  return map[clean] || codeOrName.charAt(0).toUpperCase() + codeOrName.slice(1);
}

// Format seconds into HH:MM:SS or MM:SS
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

// Extract size, resolution, and details from stream metadata
export function parseStreamInfo(s) {
  return parseStreamDetails(s);
}

export function isEmbedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (lower.includes('.mp4') || lower.includes('.m3u8') || lower.includes('/api/proxy/stream')) return false;
  return (
    lower.includes('/embed/') ||
    lower.includes('/embed') ||
    lower.includes('/searcho/') ||
    lower.includes('autoembed.') ||
    lower.includes('multiembed.') ||
    lower.includes('smashystream.') ||
    lower.includes('vidsrc.') ||
    lower.includes('2embed.') ||
    lower.includes('embed.su') ||
    lower.includes('superembed.') ||
    lower.includes('player.php') ||
    lower.includes('playere.php') ||
    lower.includes('embed.html') ||
    lower.includes('jav.guru') ||
    lower.includes('eporner.com/embed')
  );
}

// Detect whether the current browser environment can natively decode HEVC / H.265 video
export function canBrowserPlayHevc() {
  if (typeof document === 'undefined') return false;
  const v = document.createElement('video');
  const canPlay = v.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') ||
                  v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') ||
                  v.canPlayType('video/mp4; codecs="hev1"') ||
                  v.canPlayType('video/mp4; codecs="hvc1"');
  return canPlay === 'probably' || canPlay === 'maybe';
}

// Simple client-side SRT parser
function parseSrt(srtText) {
  const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.trim().split(/\n\n+/);
  const cues = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;
    const timeLineIndex = lines[0].includes('-->') ? 0 : 1;
    const timeLine = lines[timeLineIndex];
    if (!timeLine || !timeLine.includes('-->')) continue;

    const [startStr, endStr] = timeLine.split('-->').map((s) => s.trim());
    const parseStamp = (str) => {
      const parts = str.replace(',', '.').split(':');
      if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      }
      return 0;
    };

    const start = parseStamp(startStr);
    const end = parseStamp(endStr);
    const text = lines.slice(timeLineIndex + 1).join('\n');
    cues.push({ start, end, text });
  }
  return cues;
}

export default function VideoPlayer({
  stream: initialStream = null,
  allStreams: initialAllStreams = [],
  onSelectStream,
  title,
  type,
  id,
  poster,
  onClose
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const fileInputRef = useRef(null);
  const seekbarRef = useRef(null);

  const [internalStream, setInternalStream] = useState(initialStream);
  const [internalStreamsList, setInternalStreamsList] = useState(initialAllStreams);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (initialStream) setInternalStream(initialStream);
  }, [initialStream]);

  useEffect(() => {
    if (initialAllStreams && initialAllStreams.length > 0) setInternalStreamsList(initialAllStreams);
  }, [initialAllStreams]);

  const stream = internalStream;
  const allStreams = internalStreamsList;

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1); // 0.0 to 2.0 (Sound boost up to 200%)
  const [audioMode, setAudioMode] = useState('normal'); // 'normal' | '8d' | 'hall' | 'bass'
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  // Web Audio API Graph Refs
  const audioCtxRef = useRef(null);
  const audioSourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const pannerNodeRef = useRef(null);
  const bassFilterRef = useRef(null);
  const delayNodeRef = useRef(null);
  const delayFeedbackRef = useRef(null);
  const delayWetGainRef = useRef(null);
  const pannerAnimRef = useRef(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [hoverSeekTime, setHoverSeekTime] = useState(null);
  const [hoverSeekPos, setHoverSeekPos] = useState(0);

  // Popover menus state
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showColorPopover, setShowColorPopover] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('video');

  // Video Equalizer (Brightness, Contrast, Saturation, Sharpness, Sepia, Hue, Grayscale, Intensity)
  const [eqPreset, setEqPreset] = useState(() => {
    try {
      return localStorage.getItem('mmh_eq_preset') || 'normal';
    } catch {
      return 'normal';
    }
  });
  const [eqIntensity, setEqIntensity] = useState(() => {
    try {
      const v = localStorage.getItem('mmh_eq_intensity');
      return v !== null ? Number(v) : 60;
    } catch { return 60; }
  });
  const [brightness, setBrightness] = useState(() => {
    try {
      const v = localStorage.getItem('mmh_eq_brightness');
      return v !== null ? Number(v) : 100;
    } catch { return 100; }
  });
  const [contrast, setContrast] = useState(() => {
    try {
      const v = localStorage.getItem('mmh_eq_contrast');
      return v !== null ? Number(v) : 100;
    } catch { return 100; }
  });
  const [saturation, setSaturation] = useState(() => {
    try {
      const v = localStorage.getItem('mmh_eq_saturation');
      return v !== null ? Number(v) : 100;
    } catch { return 100; }
  });
  const [sharpness, setSharpness] = useState(() => {
    try {
      const v = localStorage.getItem('mmh_eq_sharpness');
      return v !== null ? Number(v) : 0;
    } catch { return 0; }
  });
  const [extraFilters, setExtraFilters] = useState(() => {
    try {
      const v = localStorage.getItem('mmh_eq_extra');
      return v ? JSON.parse(v) : { sepia: 0, hueRotate: 0, grayscale: 0 };
    } catch {
      return { sepia: 0, hueRotate: 0, grayscale: 0 };
    }
  });
  const [isComparing, setIsComparing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('auto');

  // Multi-Audio Tracks
  const [audioTracks, setAudioTracks] = useState([]);
  const [prepJobId, setPrepJobId] = useState(null);
  const [prepStatus, setPrepStatus] = useState(null);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);
  const [mkvCodecWarning, setMkvCodecWarning] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const autoTranscodeAttemptedRef = useRef(false);

  // Subtitles (Internal + External)
  const [internalSubtitles, setInternalSubtitles] = useState([]);
  const [addonSubtitles, setAddonSubtitles] = useState([]);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1); // -1 = Off
  const [customSubtitles, setCustomSubtitles] = useState([]);
  const [activeCueText, setActiveCueText] = useState('');
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleSize, setSubtitleSize] = useState('normal');

  // Load external addon subtitles
  useEffect(() => {
    if (!id) return;
    let active = true;
    api.getSubtitles(type, id)
      .then((data) => {
        if (active && Array.isArray(data?.subtitles)) {
          setAddonSubtitles(data.subtitles.map((s, idx) => ({
            ...s,
            id: s.id ? `addon-sub-${s.id}` : `addon-sub-${idx}`
          })));
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [type, id]);

  // Quality / Resolution Selector
  const [qualityLevels, setQualityLevels] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = Auto
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // A-B Repeat Loop
  const [loopA, setLoopA] = useState(null);
  const [loopB, setLoopB] = useState(null);

  // OSD Message
  const [osdMessage, setOsdMessage] = useState('');
  const osdTimerRef = useRef(null);

  const showOsd = useCallback((msg) => {
    setOsdMessage(msg);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => setOsdMessage(''), 1800);
  }, []);

  const [error, setError] = useState('');
  const [directUrl, setDirectUrl] = useState(null);
  const [isResolvingDirect, setIsResolvingDirect] = useState(false);
  const failedUrlsRef = useRef(new Set());
  const stallTimerRef = useRef(null);

  // Attempt to resolve direct .m3u8/.mp4 stream from embed URL
  useEffect(() => {
    let active = true;
    setDirectUrl(null);

    if (stream?.url && isEmbedUrl(stream.url)) {
      setIsResolvingDirect(true);
      api.resolveDirectStream(stream.url)
        .then((res) => {
          if (active && res?.success && res?.directUrl) {
            setDirectUrl(res.directUrl);
            showOsd('⚡ Direct Stream Extracted (PotPlayer Mode)');
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setIsResolvingDirect(false);
        });
    }

    return () => { active = false; };
  }, [stream?.url, showOsd]);

  // Standalone fetch: only when opened without pre-fetched streams from Detail.jsx
  const fetchStandaloneStreams = useCallback(() => {
    if (!id) return;
    setIsScanning(true);
    setError('');

    api.getStreams(type, id)
      .then((data) => {
        const valid = (data || []).filter((s) => (
          s &&
          (s.url || s.externalUrl) &&
          !s.externalUrl?.includes('donate') &&
          !s.name?.toLowerCase().includes('support the project')
        ));
        setInternalStreamsList(valid);
        if (valid.length > 0) {
          setInternalStream(valid[0]);
          const info = parseStreamInfo(valid[0]);
          showOsd(`⚡ ${valid.length} Live Sources Found • Playing ${info.serverName}`);
        } else {
          setError('No live streaming sources found for this title. Please check your addons in Settings.');
        }
      })
      .catch((err) => {
        setError(err.message || 'Error scanning live sources.');
      })
      .finally(() => {
        setIsScanning(false);
      });
  }, [id, type, showOsd]);

  useEffect(() => {
    if ((initialAllStreams && initialAllStreams.length > 0) || initialStream) return;
    fetchStandaloneStreams();
  }, [initialAllStreams, initialStream, fetchStandaloneStreams]);

  const rawUrl = directUrl || stream?.url;
  const effectiveUrl = (rawUrl && rawUrl.startsWith('/api/')) ? `${API_BASE}${rawUrl}` : rawUrl;
  const isEmbed = !directUrl && isEmbedUrl(stream?.url);
  const activeStreamInfo = parseStreamInfo(stream);

  // Switch Stream Server & remember chosen quality
  const handleSwitchServer = useCallback((newStream) => {
    setInternalStream(newStream);
    setDirectUrl(null);
    setIsTranscoding(false);
    setMkvCodecWarning(false);
    autoTranscodeAttemptedRef.current = false;
    if (onSelectStream) {
      onSelectStream(newStream);
    }
    const info = parseStreamInfo(newStream);
    if (info?.quality) {
      try {
        localStorage.setItem('mmh_preferred_quality', info.quality);
      } catch {}
    }
    showOsd(`Switched to: ${info.serverName} (${info.resolution}${info.size ? ' • ' + info.size : ''})`);
    setShowServerMenu(false);
  }, [onSelectStream, showOsd]);

  const handleVideoError = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }

    // 1. If this was a transcode stream that failed, stop transcoding and move to next server
    if (directUrl && directUrl.includes('/api/transcode/stream')) {
      failedUrlsRef.current.add(directUrl);
      if (stream?.url) failedUrlsRef.current.add(stream.url);
      setDirectUrl(null);
      setIsTranscoding(false);

      const candidateStreams = allStreams.filter((s) => s?.url && !failedUrlsRef.current.has(s.url));
      if (candidateStreams.length > 0) {
        const nextStream = candidateStreams[0];
        const nextInfo = parseStreamInfo(nextStream);
        showOsd(`⚡ Transcode failed. Auto-switching to ${nextInfo.serverName} (${nextInfo.resolution})...`);
        handleSwitchServer(nextStream);
        return;
      }
      setError('All available streams failed to play. Please select another server or click Retry.');
      return;
    }

    // 2. If direct/proxied stream failed (HEVC, unsupported video/audio codec in browser),
    // RESCUE IT with /api/transcode/stream once before failing!
    const currentSrc = stream?.url || effectiveUrl;
    if (!autoTranscodeAttemptedRef.current && currentSrc && (!directUrl || !directUrl.includes('/api/transcode/stream'))) {
      autoTranscodeAttemptedRef.current = true;
      const transcodeUrl = `${API_BASE}/api/transcode/stream?url=${encodeURIComponent(currentSrc)}&audioTrack=${currentAudioTrack || 0}&start=0`;
      setIsTranscoding(true);
      setDirectUrl(transcodeUrl);
      setMkvCodecWarning(false);
      showOsd('⚡ Format not supported natively. Transcoding to H.264 for playback...');
      return;
    }

    // 3. Mark current directUrl and streamUrl as permanently failed
    if (directUrl) {
      failedUrlsRef.current.add(directUrl);
      setDirectUrl(null);
    }
    if (stream?.url) {
      failedUrlsRef.current.add(stream.url);
    }

    // 4. Skip all failed streams and auto-switch to next working stream
    const candidateStreams = allStreams.filter((s) => s?.url && !failedUrlsRef.current.has(s.url));
    if (candidateStreams.length > 0) {
      const nextStream = candidateStreams[0];
      const nextInfo = parseStreamInfo(nextStream);
      showOsd(`⚡ Stream failed. Auto-switching to ${nextInfo.serverName} (${nextInfo.resolution})...`);
      handleSwitchServer(nextStream);
      return;
    }

    setError('All available streams failed to play. Please select another server or click Retry.');
  }, [directUrl, stream?.url, effectiveUrl, allStreams, currentAudioTrack, showOsd, handleSwitchServer]);

  const handleRetryPlayback = () => {
    failedUrlsRef.current.clear();
    setError('');
    if (allStreams.length > 0) {
      handleSwitchServer(allStreams[0]);
    } else if (id) {
      fetchStandaloneStreams();
    }
  };

  const controlsTimeoutRef = useRef(null);

  // Auto-hide controls timer
  const handleMouseMove = () => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsControlsVisible(false);
        setShowServerMenu(false);
        setShowColorPopover(false);
        setShowAudioMenu(false);
        setShowSubtitleMenu(false);
        setShowQualityMenu(false);
      }, 3000);
    }
  };

  // Keep volume/mute refs in sync so stream init never re-runs on volume changes
  useEffect(() => {
    volumeRef.current = volume;
    isMutedRef.current = isMuted;
  }, [volume, isMuted]);

  // Initialize Stream (HLS or Direct URL) - PURE NATIVE AUDIO
  useEffect(() => {
    if (isEmbed) {
      setError('');
      setIsPlaying(true);
      return undefined;
    }

    const video = videoRef.current;
    if (!video || !effectiveUrl) return undefined;

    setError('');
    const streamUrl = effectiveUrl;
    const isHls = streamUrl.toLowerCase().split('?')[0].endsWith('.m3u8');
    setQualityLevels([]);
    setCurrentQuality(-1);
    setMkvCodecWarning(false);

    // Apply current volume/mute through refs (state changes are handled by the volume effect below)
    video.muted = isMutedRef.current;
    video.volume = isMutedRef.current ? 0 : volumeRef.current;

    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }

    if (!isEmbed && streamUrl) {
      stallTimerRef.current = setTimeout(() => {
        const v = videoRef.current;
        if (v && !v.paused && (v.currentTime === 0 || v.readyState < 2)) {
          showOsd('⚠️ Playback stalled (8s without progress). Auto-switching server...');
          handleVideoError();
        }
      }, 8000);
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        capLevelToPlayerSize: true,
        autoStartLoad: true
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Load Audio Tracks
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          const mappedTracks = hls.audioTracks.map((t, idx) => ({
            id: idx,
            name: formatLanguageName(t.name || t.lang || `Track ${idx + 1}`),
            lang: t.lang || ''
          }));
          setAudioTracks(mappedTracks);
          setCurrentAudioTrack(hls.audioTrack);

          // Auto-apply preferred audio language from localStorage
          try {
            const savedLang = localStorage.getItem('mmh_preferred_audio_lang');
            if (savedLang) {
              const matchIdx = mappedTracks.findIndex(
                (tr) => tr.name.toLowerCase() === savedLang.toLowerCase() || tr.lang.toLowerCase() === savedLang.toLowerCase()
              );
              if (matchIdx !== -1 && matchIdx !== hls.audioTrack) {
                hls.audioTrack = matchIdx;
                setCurrentAudioTrack(matchIdx);
              }
            }
          } catch {}
        }
        // Load Subtitle Tracks
        if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
          setInternalSubtitles(hls.subtitleTracks.map((t, idx) => ({
            id: idx,
            name: t.name || t.lang || `Subtitle ${idx + 1}`,
            lang: t.lang || ''
          })));
        }
        // Load Quality / Resolution Levels
        if (hls.levels && hls.levels.length > 0) {
          const lvls = hls.levels.map((lvl, idx) => {
            const h = lvl.height || 0;
            let name = h > 0 ? `${h}p` : `Level ${idx + 1}`;
            if (h >= 2160) name = '4K UHD';
            else if (h >= 1440) name = '2K QHD';
            else if (h >= 1080) name = '1080p FHD';
            else if (h >= 720) name = '720p HD';
            else if (h >= 480) name = '480p SD';
            else if (h >= 360) name = '360p';
            return {
              id: idx,
              height: h,
              bitrate: lvl.bitrate || 0,
              name
            };
          });
          setQualityLevels(lvls);
          setCurrentQuality(hls.currentLevel);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_ev, data) => {
        if (typeof data.level === 'number') {
          // If in manual mode, level matches currentLevel
          if (hls.currentLevel !== -1) {
            setCurrentQuality(hls.currentLevel);
          }
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_ev, data) => {
        if (data.audioTracks && data.audioTracks.length > 0) {
          const mappedTracks = data.audioTracks.map((t, idx) => ({
            id: idx,
            name: formatLanguageName(t.name || t.lang || `Track ${idx + 1}`),
            lang: t.lang || ''
          }));
          setAudioTracks(mappedTracks);
          setCurrentAudioTrack(hls.audioTrack);

          try {
            const savedLang = localStorage.getItem('mmh_preferred_audio_lang');
            if (savedLang) {
              const matchIdx = mappedTracks.findIndex(
                (tr) => tr.name.toLowerCase() === savedLang.toLowerCase() || tr.lang.toLowerCase() === savedLang.toLowerCase()
              );
              if (matchIdx !== -1 && matchIdx !== hls.audioTrack) {
                hls.audioTrack = matchIdx;
                setCurrentAudioTrack(matchIdx);
              }
            }
          } catch {}
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_ev, data) => {
        if (typeof data.id === 'number') {
          setCurrentAudioTrack(data.id);
        }
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_ev, data) => {
        if (data.subtitleTracks && data.subtitleTracks.length > 0) {
          setInternalSubtitles(data.subtitleTracks.map((t, idx) => ({
            id: idx,
            name: t.name || t.lang || `Subtitle ${idx + 1}`,
            lang: t.lang || ''
          })));
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          handleVideoError();
        }
      });
    } else {
      // Only transcode if stream explicitly declares HEVC and browser lacks native decoding
      const isExplicitHevc = (
        stream?.language === 'hevc' ||
        stream?.quality?.toLowerCase()?.includes('hevc') ||
        stream?.title?.toLowerCase()?.includes('x265')
      );
      if (isExplicitHevc && !canBrowserPlayHevc() && (!directUrl || !directUrl.includes('/api/transcode/stream'))) {
        setIsTranscoding(true);
        const transcodeUrl = `${API_BASE}/api/transcode/stream?url=${encodeURIComponent(streamUrl)}&audioTrack=0&start=0`;
        setDirectUrl(transcodeUrl);
        showOsd('⚡ Transcoding HEVC video to H.264 for web playback...');
        return undefined;
      }

      video.src = streamUrl;
      if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
        setError('HLS video is not natively supported in this browser.');
      }

      // Proactively probe stream via server-side ffprobe to discover audio tracks, duration, and detect HEVC
      if (!isHls && !streamUrl.includes('/api/transcode/stream')) {
        const probeUrl = `${API_BASE}/api/media/probe?url=${encodeURIComponent(streamUrl)}`;
        fetch(probeUrl)
          .then((r) => r.json())
          .then((data) => {
            if (data?.success) {
              if (data.duration && data.duration > 0) {
                setDuration(data.duration);
              }
              if (Array.isArray(data.audioTracks) && data.audioTracks.length > 0) {
                const mapped = data.audioTracks.map((tr) => ({
                  id: tr.audioIdx,
                  name: `${tr.title || tr.language} (${tr.codec?.toUpperCase() || 'Audio'}${!tr.safe ? ' ⚠️ Converting to AAC' : ''})`,
                  lang: tr.language || '',
                  safe: tr.safe
                }));
                setAudioTracks(mapped);
              }
              // Only auto-switch to transcode if video is strictly confirmed as HEVC and browser cannot decode it
              if (data.isHevc === true && !canBrowserPlayHevc() && (!directUrl || !directUrl.includes('/api/transcode/stream'))) {
                setIsTranscoding(true);
                const transcodeUrl = `${API_BASE}/api/transcode/stream?url=${encodeURIComponent(streamUrl)}&audioTrack=0&start=0`;
                setDirectUrl(transcodeUrl);
                showOsd('⚡ Transcoding HEVC video to H.264 for web playback...');
              }
            }
          })
          .catch(() => {});
      }

      // Check native audio tracks for direct media (MP4/WebM/MKV)
      const updateNativeAudioTracks = () => {
        if (video.audioTracks && video.audioTracks.length > 0) {
          const tracks = [];
          let activeIndex = 0;
          for (let i = 0; i < video.audioTracks.length; i++) {
            const tr = video.audioTracks[i];
            tracks.push({
              id: i,
              name: tr.label || tr.language || `Audio Track ${i + 1}`,
              lang: tr.language || ''
            });
            if (tr.enabled) activeIndex = i;
          }
          setAudioTracks(tracks);
          setCurrentAudioTrack(activeIndex);
        }
      };

      video.addEventListener('loadedmetadata', updateNativeAudioTracks, { once: true });
      video.addEventListener('error', handleVideoError);
    }

    video.play().then(() => setIsPlaying(true)).catch(() => {});

    return () => {
      video.removeEventListener('error', handleVideoError);
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [effectiveUrl, isEmbed, handleVideoError, showOsd]);

  // Web Audio Context & Node Graph initialization (for >100% Boost & Audio Modes)
  const initWebAudio = () => {
    const video = videoRef.current;
    if (!video || audioCtxRef.current) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(video);
      audioSourceNodeRef.current = source;

      // Gain Node (Volume Boost up to 200%)
      const gain = ctx.createGain();
      gain.gain.value = volume;
      gainNodeRef.current = gain;

      // Bass Boost Filter (Lowshelf 120Hz)
      const bass = ctx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 120;
      bass.gain.value = 0;
      bassFilterRef.current = bass;

      // 8D Stereo Panner Node
      let panner = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.value = 0;
        pannerNodeRef.current = panner;
      }

      // Hall Delay / Reverb Node
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.08;
      delayNodeRef.current = delay;

      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0;
      delayFeedbackRef.current = delayFeedback;

      const delayWetGain = ctx.createGain();
      delayWetGain.gain.value = 0;
      delayWetGainRef.current = delayWetGain;

      delay.connect(delayFeedback);
      delayFeedback.connect(delay);
      delay.connect(delayWetGain);

      // Connect graph: source -> bass -> (panner or passthrough) -> gain -> destination
      // And delay branch connects only when delayWetGain is above 0 (Hall mode)
      if (panner) {
        source.connect(bass);
        bass.connect(panner);
        panner.connect(gain);
        bass.connect(delay);
        delayWetGain.connect(gain);
      } else {
        source.connect(bass);
        bass.connect(gain);
        bass.connect(delay);
        delayWetGain.connect(gain);
      }
      gain.connect(ctx.destination);
    } catch (err) {
      console.warn('[WebAudio] Initialization bypassed:', err.message);
    }
  };

  // Synchronize Volume & Sound Boost (0% - 200%)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (volume > 1.0) {
      initWebAudio();
    }

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;
      video.muted = isMuted;
      video.volume = 1.0;
    } else {
      video.muted = isMuted;
      video.volume = isMuted ? 0 : Math.min(1.0, Math.max(0, volume));
    }
  }, [volume, isMuted]);

  // Synchronize Audio Mode (Normal, 8D, Hall, Bass)
  useEffect(() => {
    if (audioMode !== 'normal') {
      initWebAudio();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    // Cancel any existing 8D panner animation
    if (pannerAnimRef.current) {
      cancelAnimationFrame(pannerAnimRef.current);
      pannerAnimRef.current = null;
    }

    const ctx = audioCtxRef.current;
    const now = ctx ? ctx.currentTime : 0;

    // Reset modes to clean base
    if (bassFilterRef.current) {
      if (ctx) bassFilterRef.current.gain.cancelScheduledValues(now);
      bassFilterRef.current.gain.value = 0;
    }
    if (pannerNodeRef.current) {
      if (ctx) pannerNodeRef.current.pan.cancelScheduledValues(now);
      pannerNodeRef.current.pan.value = 0;
    }
    if (delayFeedbackRef.current) {
      if (ctx) delayFeedbackRef.current.gain.cancelScheduledValues(now);
      delayFeedbackRef.current.gain.value = 0;
    }
    if (delayWetGainRef.current) {
      if (ctx) delayWetGainRef.current.gain.cancelScheduledValues(now);
      delayWetGainRef.current.gain.value = 0;
    }

    if (audioMode === 'bass') {
      if (bassFilterRef.current) bassFilterRef.current.gain.value = 11; // +11dB deep punch
      showOsd('🔊 Audio Mode: Deep Bass Boost');
    } else if (audioMode === 'hall') {
      if (delayFeedbackRef.current) delayFeedbackRef.current.gain.value = 0.42;
      if (delayWetGainRef.current) delayWetGainRef.current.gain.value = 0.35; // wet reverb mix
      if (bassFilterRef.current) bassFilterRef.current.gain.value = 3;
      showOsd('🏛️ Audio Mode: Cinema / Concert Hall');
    } else if (audioMode === '8d') {
      // In 8D mode: ensure zero reverb/delay bleed so there is NO echo or double voice
      if (delayWetGainRef.current) delayWetGainRef.current.gain.value = 0;
      if (delayFeedbackRef.current) delayFeedbackRef.current.gain.value = 0;
      showOsd('🎧 Audio Mode: 8D AirPods / Spatial Rotation');
      if (pannerNodeRef.current) {
        let startTime = performance.now();
        const animate8D = (ts) => {
          const elapsed = (ts - startTime) / 1000;
          // Smooth 360° stereo orbit: Left -> Center -> Right -> Center -> Left
          const pan = Math.sin(elapsed * (2 * Math.PI / 6));
          if (pannerNodeRef.current) {
            pannerNodeRef.current.pan.value = pan;
          }
          pannerAnimRef.current = requestAnimationFrame(animate8D);
        };
        pannerAnimRef.current = requestAnimationFrame(animate8D);
      }
    } else {
      showOsd('🎵 Audio Mode: Standard / Clean');
    }

    return () => {
      if (pannerAnimRef.current) {
        cancelAnimationFrame(pannerAnimRef.current);
        pannerAnimRef.current = null;
      }
    };
  }, [audioMode]);

  // Save Watch Progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const saveProgress = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      progress.set(id, {
        title,
        type,
        poster,
        currentTime: video.currentTime,
        duration: video.duration,
        percent: (video.currentTime / video.duration) * 100
      });
    };

    const interval = window.setInterval(saveProgress, 15000);
    video.addEventListener('timeupdate', saveProgress);

    return () => {
      window.clearInterval(interval);
      video.removeEventListener('timeupdate', saveProgress);
      saveProgress();
    };
  }, [id, title, type, poster]);

  // Timeupdate: Buffer, Loop, Custom Subtitle Cue
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const cur = video.currentTime;
    setCurrentTime(cur);

    if (cur > 0 && stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }

    if (video.buffered.length > 0) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }

    // A-B Repeat Loop Trigger
    if (loopA !== null && loopB !== null && loopB > loopA) {
      if (cur >= loopB) {
        video.currentTime = loopA;
        showOsd(`Looping: ${formatTime(loopA)} ⇄ ${formatTime(loopB)}`);
      }
    }

    // Custom Subtitle Tracking
    if (customSubtitles.length > 0 && subtitleEnabled) {
      const adjusted = cur + subtitleOffset;
      const match = customSubtitles.find((c) => adjusted >= c.start && adjusted <= c.end);
      setActiveCueText(match ? match.text : '');
    } else {
      setActiveCueText('');
    }
  };

  // Play / Pause Toggle
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
      showOsd('▶ Play');
    } else {
      video.pause();
      setIsPlaying(false);
      showOsd('⏸ Pause');
    }
  };

  // Stop playback
  const stopPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
    setIsPlaying(false);
    showOsd('⏹ Stopped');
  };

  // Seek relative
  const seekRelative = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    const effDuration = duration || video.duration || 0;
    const target = Math.max(0, Math.min(effDuration, video.currentTime + seconds));
    if ((isTranscoding || (directUrl && directUrl.includes('/api/transcode/stream'))) && stream?.url) {
      const transcodeUrl = `${API_BASE}/api/transcode/stream?url=${encodeURIComponent(stream.url)}&audioTrack=${currentAudioTrack || 0}&start=${Math.floor(target)}`;
      setDirectUrl(transcodeUrl);
      showOsd(`${seconds > 0 ? '▶▶' : '◀◀'} ${seconds > 0 ? '+' : ''}${seconds}s (${formatTime(target)})`);
      return;
    }
    video.currentTime = target;
    showOsd(`${seconds > 0 ? '▶▶' : '◀◀'} ${seconds > 0 ? '+' : ''}${seconds}s (${formatTime(target)})`);
  };

  // Frame Step Forward / Backward
  const stepFrame = (frames) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    const frameTime = 1 / 24;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + frames * frameTime));
    showOsd(`Frame: ${frames > 0 ? '+1' : '-1'} (${formatTime(video.currentTime)})`);
  };

  // Adjust Volume (up to 200% sound boost)
  const adjustVolume = (delta) => {
    setVolume((prev) => {
      const next = Math.max(0, Math.min(2.0, parseFloat((prev + delta).toFixed(2))));
      if (next > 0 && isMuted) setIsMuted(false);
      showOsd(`Volume: ${Math.round(next * 100)}%${next > 1.0 ? ' ⚡ BOOSTED' : ''}`);
      return next;
    });
  };

  // Change Speed
  const changeSpeed = (rate) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0.25, Math.min(3.0, parseFloat(rate.toFixed(2))));
    video.playbackRate = clamped;
    setPlaybackRate(clamped);
    showOsd(`Speed: ${clamped}x`);
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
      showOsd('Fullscreen');
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
      showOsd('Windowed');
    }
  };

  // PiP
  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPip(false);
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setIsPip(true);
        showOsd('Picture-in-Picture');
      }
    } catch {
      showOsd('PiP not available');
    }
  };

  // Capture Snapshot (PNG)
  const captureSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      showOsd('Cannot capture frame');
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const timeClean = formatTime(video.currentTime).replace(/:/g, '-');
      a.download = `${title || 'Snapshot'}_${timeClean}.png`;
      a.href = dataUrl;
      a.click();
      showOsd('📸 Snapshot Saved to PNG');
    } catch {
      showOsd('Snapshot protected');
    }
  };

  // A-B Repeat Loop
  const setPointA = () => {
    const video = videoRef.current;
    if (!video) return;
    setLoopA(video.currentTime);
    showOsd(`Loop Point [A]: ${formatTime(video.currentTime)}`);
  };

  const setPointB = () => {
    const video = videoRef.current;
    if (!video) return;
    if (loopA !== null && video.currentTime <= loopA) {
      showOsd('Point B must be after Point A');
      return;
    }
    setLoopB(video.currentTime);
    showOsd(`Loop Point [B]: ${formatTime(video.currentTime)} (Loop Active)`);
  };

  const clearLoop = () => {
    setLoopA(null);
    setLoopB(null);
    showOsd('Loop Cleared');
  };

  // Subtitle File Upload
  const handleSubtitleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        if (typeof text === 'string') {
          const parsed = parseSrt(text);
          setCustomSubtitles(parsed);
          setSubtitleEnabled(true);
          showOsd(`Subtitles Loaded: ${file.name}`);
        }
      } catch {
        showOsd('Failed to parse subtitle');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Switch Audio Track
  const handleSelectAudioTrack = (trackId) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
      setCurrentAudioTrack(trackId);
      const tr = audioTracks.find((t) => t.id === trackId);
      if (tr) {
        showOsd(`Audio: ${tr.name}`);
        try {
          localStorage.setItem('mmh_preferred_audio_lang', tr.name);
        } catch {}
      }
    } else if (videoRef.current && videoRef.current.audioTracks && videoRef.current.audioTracks.length > 0) {
      const vTracks = videoRef.current.audioTracks;
      for (let i = 0; i < vTracks.length; i++) {
        vTracks[i].enabled = (i === trackId);
      }
      setCurrentAudioTrack(trackId);
      const tr = audioTracks.find((t) => t.id === trackId);
      if (tr) {
        showOsd(`Audio: ${tr.name}`);
        try {
          localStorage.setItem('mmh_preferred_audio_lang', tr.name);
        } catch {}
      }
    } else {
      // Direct file switch via on-demand /api/transcode/stream with selected audioTrack
      const currentPos = videoRef.current?.currentTime || 0;
      const rawBase = stream?.url || directUrl || effectiveUrl;
      let baseSource = rawBase;
      if (rawBase && rawBase.includes('/api/transcode/stream')) {
        try {
          const u = new URL(rawBase, window.location.origin);
          baseSource = u.searchParams.get('url') || rawBase;
        } catch {}
      }
      const transcodeUrl = `${API_BASE}/api/transcode/stream?url=${encodeURIComponent(baseSource)}&audioTrack=${trackId}&start=${currentPos.toFixed(1)}`;
      setCurrentAudioTrack(trackId);
      setIsTranscoding(true);
      setDirectUrl(transcodeUrl);
      const tr = audioTracks.find((t) => t.id === trackId);
      showOsd(`⚡ Audio Track: ${tr?.name || trackId}`);
    }
    setShowAudioMenu(false);
  };

  // Switch Subtitle Track
  const handleSelectSubtitleTrack = (trackId) => {
    if (trackId === -1) {
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
      setCurrentSubtitleTrack(-1);
      setCustomSubtitles([]);
      setSubtitleEnabled(false);
      showOsd('Subtitles: OFF');
    } else if (trackId === 'upload') {
      fileInputRef.current?.click();
    } else if (typeof trackId === 'string' && trackId.startsWith('addon-sub-')) {
      const sub = addonSubtitles.find((s) => s.id === trackId);
      if (sub && sub.url) {
        if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
        setCurrentSubtitleTrack(trackId);
        showOsd(`Loading Subtitle: ${sub.name}...`);
        fetch(sub.url)
          .then((res) => res.text())
          .then((text) => {
            const parsed = parseSrt(text);
            setCustomSubtitles(parsed);
            setSubtitleEnabled(true);
            showOsd(`Subtitles: ${sub.name} (${sub.lang})`);
          })
          .catch(() => {
            showOsd('Failed to load online subtitle');
          });
      }
    } else {
      if (hlsRef.current) {
        hlsRef.current.subtitleTrack = trackId;
        setCurrentSubtitleTrack(trackId);
        setSubtitleEnabled(true);
        const tr = internalSubtitles.find((t) => t.id === trackId);
        showOsd(`Subtitles: ${tr?.name || `Track ${trackId + 1}`}`);
      }
    }
    setShowSubtitleMenu(false);
  };

  // Switch Video Quality / Resolution
  const handleSelectQuality = (lvlIndex) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = lvlIndex;
      setCurrentQuality(lvlIndex);
      const chosen = qualityLevels.find((q) => q.id === lvlIndex);
      showOsd(`Quality: ${lvlIndex === -1 ? 'Auto' : (chosen?.name || 'HD')}`);
    }
    setShowQualityMenu(false);
  };


  // Presets definition
  // Carefully balanced: subtle enhancements, zero crushed blacks, natural skin tones.
  const EQ_PRESETS = [
    { id: 'normal', name: 'Normal', b: 100, c: 100, s: 100, sh: 0, sepia: 0, hue: 0, gray: 0 },
    { id: 'vivid', name: 'Vivid', b: 102, c: 108, s: 115, sh: 0, sepia: 0, hue: 0, gray: 0 },
    { id: 'cinema', name: 'Cinema', b: 96, c: 108, s: 92, sh: 0, sepia: 4, hue: -2, gray: 0 },
    { id: '4k', name: '4K Ultra HD', b: 102, c: 106, s: 108, sh: 25, sepia: 0, hue: 0, gray: 0 },
    { id: 'hdr', name: 'HDR Boost', b: 100, c: 112, s: 108, sh: 20, sepia: 0, hue: 0, gray: 0 },
    { id: 'darkroom', name: 'Dark Room', b: 109, c: 105, s: 103, sh: 0, sepia: 0, hue: 0, gray: 0 },
    { id: 'day', name: 'Day', b: 105, c: 109, s: 107, sh: 0, sepia: 0, hue: 0, gray: 0 },
    { id: 'anime', name: 'Anime', b: 103, c: 106, s: 124, sh: 15, sepia: 0, hue: 0, gray: 0 },
    { id: 'eye', name: 'Eye Comfort', b: 95, c: 100, s: 97, sh: 0, sepia: 7, hue: 0, gray: 0 },
    { id: 'bw', name: 'B&W', b: 100, c: 111, s: 0, sh: 0, sepia: 0, hue: 0, gray: 100 }
  ];

  // Helper: compute scaled preset values according to intensity (0 - 100%)
  const scalePresetByIntensity = (preset, intensityPct) => {
    const factor = Math.max(0, Math.min(100, intensityPct)) / 100;
    const scale = (val, base = 100) => Math.round(base + (val - base) * factor);
    const scaleExtra = (val) => Math.round(val * factor);
    return {
      b: scale(preset.b, 100),
      c: scale(preset.c, 100),
      s: scale(preset.s, 100),
      sh: Math.min(50, scaleExtra(preset.sh)),
      sepia: scaleExtra(preset.sepia),
      hue: scaleExtra(preset.hue),
      gray: scaleExtra(preset.gray)
    };
  };

  const applyPreset = (p, intensityOverride) => {
    const intensity = intensityOverride !== undefined ? intensityOverride : eqIntensity;
    setEqPreset(p.id);
    const scaled = scalePresetByIntensity(p, intensity);
    setBrightness(scaled.b);
    setContrast(scaled.c);
    setSaturation(scaled.s);
    setSharpness(scaled.sh);
    setExtraFilters({ sepia: scaled.sepia, hueRotate: scaled.hue, grayscale: scaled.gray });
    try {
      localStorage.setItem('mmh_eq_preset', p.id);
      localStorage.setItem('mmh_eq_intensity', String(intensity));
      localStorage.setItem('mmh_eq_brightness', String(scaled.b));
      localStorage.setItem('mmh_eq_contrast', String(scaled.c));
      localStorage.setItem('mmh_eq_saturation', String(scaled.s));
      localStorage.setItem('mmh_eq_sharpness', String(scaled.sh));
      localStorage.setItem('mmh_eq_extra', JSON.stringify({ sepia: scaled.sepia, hueRotate: scaled.hue, grayscale: scaled.gray }));
    } catch {}
    showOsd(`Preset: ${p.name} (${intensity}%)`);
  };

  const handleIntensityChange = (newIntensity) => {
    setEqIntensity(newIntensity);
    try { localStorage.setItem('mmh_eq_intensity', String(newIntensity)); } catch {}
    const currentP = EQ_PRESETS.find((p) => p.id === eqPreset);
    if (currentP) {
      applyPreset(currentP, newIntensity);
    }
  };

  const handleManualSliderChange = (type, val) => {
    setEqPreset('custom');
    try { localStorage.setItem('mmh_eq_preset', 'custom'); } catch {}
    if (type === 'brightness') {
      setBrightness(val);
      try { localStorage.setItem('mmh_eq_brightness', String(val)); } catch {}
    } else if (type === 'contrast') {
      setContrast(val);
      try { localStorage.setItem('mmh_eq_contrast', String(val)); } catch {}
    } else if (type === 'saturation') {
      setSaturation(val);
      try { localStorage.setItem('mmh_eq_saturation', String(val)); } catch {}
    } else if (type === 'sharpness') {
      const capped = Math.min(50, Math.max(0, val));
      setSharpness(capped);
      try { localStorage.setItem('mmh_eq_sharpness', String(capped)); } catch {}
    }
  };

  // Reset Video Filters
  const resetFilters = () => {
    setEqIntensity(60);
    try { localStorage.setItem('mmh_eq_intensity', '60'); } catch {}
    applyPreset(EQ_PRESETS[0], 60);
    showOsd('Reset Video Colors (Normal)');
  };

  // Launch Desktop PotPlayer
  const launchDesktopPotPlayer = () => {
    if (!stream?.url) return;
    const potUrl = `potplayer://${encodeURIComponent(stream.url)}`;
    window.location.href = potUrl;
    showOsd('Opening in Desktop PotPlayer...');
  };

  // Global drag listener to ensure seekbar drag never gets stuck
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDraggingSeek(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Keyboard Shortcuts (Space, Arrows, C, X, Z, D, A, S, E, R, W, L, P, F, Esc)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA'].includes(activeTag) || ['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.ctrlKey) seekRelative(-30);
          else if (e.shiftKey) seekRelative(-10);
          else seekRelative(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.ctrlKey) seekRelative(30);
          else if (e.shiftKey) seekRelative(10);
          else seekRelative(5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.05);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setIsMuted((prev) => {
            showOsd(!prev ? '🔇 Muted' : `🔊 Unmuted (${Math.round(volume * 100)}%)`);
            return !prev;
          });
          break;
        case 'f':
        case 'F':
        case 'Enter':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          changeSpeed(playbackRate + 0.1);
          break;
        case 'x':
        case 'X':
          e.preventDefault();
          changeSpeed(playbackRate - 0.1);
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          changeSpeed(1.0);
          break;
        case 'd':
        case 'D':
          e.preventDefault();
          stepFrame(1);
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          stepFrame(-1);
          break;
        case 's':
        case 'S':
          e.preventDefault();
          captureSnapshot();
          break;
        case '[':
          e.preventDefault();
          setPointA();
          break;
        case ']':
          e.preventDefault();
          setPointB();
          break;
        case '\\':
          e.preventDefault();
          clearLoop();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          setBrightness((prev) => {
            const next = Math.min(150, prev + 5);
            showOsd(`Brightness: ${next}%`);
            return next;
          });
          break;
        case 'e':
        case 'E':
          e.preventDefault();
          setBrightness((prev) => {
            const next = Math.max(50, prev - 5);
            showOsd(`Brightness: ${next}%`);
            return next;
          });
          break;
        case 'w':
        case 'W':
          e.preventDefault();
          resetFilters();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          setSubtitleEnabled((prev) => {
            showOsd(!prev ? 'Subtitles: ON' : 'Subtitles: OFF');
            return !prev;
          });
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          togglePip();
          break;
        case 'F7':
          e.preventDefault();
          setShowControlPanel((prev) => !prev);
          break;
        case 'Escape':
          e.preventDefault();
          if (showControlPanel || showServerMenu || showColorPopover || showAudioMenu || showSubtitleMenu) {
            setShowControlPanel(false);
            setShowServerMenu(false);
            setShowColorPopover(false);
            setShowAudioMenu(false);
            setShowSubtitleMenu(false);
          } else if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            onClose();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playbackRate, volume, isMuted, showControlPanel, showServerMenu, showColorPopover, onClose]);

  // Mouse wheel volume adjust (only when cursor is directly over video canvas, NOT when menus/modals are open)
  const handleWheel = (e) => {
    if (showServerMenu || showControlPanel || showColorPopover || showAudioMenu || showSubtitleMenu) {
      return;
    }
    if (e.target.closest?.('.overflow-y-auto, .overflow-auto, [data-scrollable="true"], .scrollable-container')) {
      return;
    }
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX || 0) && Math.abs(e.deltaY) > 5) {
      e.preventDefault();
      if (e.deltaY < 0) adjustVolume(0.05);
      else adjustVolume(-0.05);
    }
  };

  // Seekbar Click & Drag
  const handleSeekbarClick = (e) => {
    const rect = seekbarRef.current?.getBoundingClientRect();
    const video = videoRef.current;
    const effDuration = duration || video?.duration || 0;
    if (!rect || !video || !effDuration) return;
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * effDuration;
    if ((isTranscoding || (directUrl && directUrl.includes('/api/transcode/stream'))) && stream?.url) {
      const transcodeUrl = `${API_BASE}/api/transcode/stream?url=${encodeURIComponent(stream.url)}&audioTrack=${currentAudioTrack || 0}&start=${Math.floor(target)}`;
      setDirectUrl(transcodeUrl);
      return;
    }
    video.currentTime = target;
  };

  const handleSeekbarMouseMove = (e) => {
    const rect = seekbarRef.current?.getBoundingClientRect();
    const video = videoRef.current;
    if (!rect || !video || !video.duration) return;
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverSeekPos(e.clientX - rect.left);
    setHoverSeekTime(pos * video.duration);
    if (isDraggingSeek) {
      video.currentTime = pos * video.duration;
    }
  };

  // Compute dynamic sharpness matrix kernel: center value is 1 + 4*k, neighbors are -k
  // Scaled moderately for subtle edge refinement without ringing or artifacts (capped at 50% slider)
  const safeSharpness = Math.min(50, Math.max(0, sharpness));
  const k = (safeSharpness / 100) * 0.9;
  const sharpenKernel = `0 -${k.toFixed(2)} 0 -${k.toFixed(2)} ${(1 + 4 * k).toFixed(2)} -${k.toFixed(2)} 0 -${k.toFixed(2)} 0`;

  // CSS Filter string for video element (disabled during Compare hold, or if strictly normal 100/100/100/0)
  const isDefaultFilter = brightness === 100 && contrast === 100 && saturation === 100 && safeSharpness === 0 && !extraFilters.sepia && !extraFilters.hueRotate && !extraFilters.grayscale;
  
  let filterStyle = 'none';
  if (!isComparing && !isDefaultFilter) {
    const parts = [];
    if (safeSharpness > 0) parts.push('url(#video-sharpen)');
    if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
    if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
    if (saturation !== 100) parts.push(`saturate(${saturation}%)`);
    if (extraFilters.sepia) parts.push(`sepia(${extraFilters.sepia}%)`);
    if (extraFilters.hueRotate) parts.push(`hue-rotate(${extraFilters.hueRotate}deg)`);
    if (extraFilters.grayscale) parts.push(`grayscale(${extraFilters.grayscale}%)`);
    filterStyle = parts.join(' ') || 'none';
  }

  const getAspectClass = () => {
    switch (aspectRatio) {
      case '16:9': return 'aspect-video object-cover';
      case '4:3': return 'aspect-[4/3] object-cover';
      case '21:9': return 'aspect-[21/9] object-cover';
      case 'fill': return 'h-full w-full object-fill';
      default: return 'h-full w-full object-contain';
    }
  };

  const getSubtitleSizeClass = () => {
    switch (subtitleSize) {
      case 'small': return 'text-sm sm:text-base';
      case 'large': return 'text-xl sm:text-2xl';
      case 'xl': return 'text-2xl sm:text-4xl';
      default: return 'text-base sm:text-xl';
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && (file.name.endsWith('.srt') || file.name.endsWith('.vtt'))) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const text = event.target?.result;
            if (typeof text === 'string') {
              const parsed = parseSrt(text);
              setCustomSubtitles(parsed);
              setSubtitleEnabled(true);
              showOsd(`Subtitles Loaded: ${file.name}`);
            }
          };
          reader.readAsText(file);
        }
      }}
      className={`fixed inset-0 z-[100] flex flex-col bg-black select-none ${
        !isControlsVisible && isPlaying ? 'cursor-none' : 'cursor-default'
      }`}
    >
      {/* Inline SVG Sharpness Convolution Filter */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <filter id="video-sharpen" x="0%" y="0%" width="100%" height="100%">
          <feConvolveMatrix
            order="3 3"
            preserveAlpha="true"
            kernelMatrix={sharpenKernel}
          />
        </filter>
      </svg>
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt,.sub"
        onChange={handleSubtitleUpload}
        className="hidden"
      />

      {/* ─── Omnipresent Floating Close / Exit Button (ALWAYS VISIBLE - never hidden) ─── */}
      <button
        type="button"
        onClick={onClose}
        title="Exit / Close Player (Esc)"
        className="fixed top-3.5 right-3.5 z-[130] grid h-10 w-10 place-items-center rounded-full bg-black/85 hover:bg-rose-600 text-white/90 hover:text-white transition-all shadow-2xl border border-white/30 backdrop-blur-2xl font-bold text-base pointer-events-auto cursor-pointer group"
      >
        <span className="group-hover:rotate-90 transition-transform duration-200">✕</span>
      </button>

      {/* ─── Top PotPlayer Header Bar ─── */}
      <div
        className={`absolute inset-x-0 top-0 z-30 flex items-center justify-between pl-4 sm:pl-6 pr-16 py-3 bg-gradient-to-b from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
          isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Left: Brand + Stream Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500/20 to-yellow-600/30 border border-amber-400/40 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-black tracking-wider text-amber-300 uppercase">
              POTPLAYER
            </span>
          </div>

          <div className="truncate">
            <h1 className="truncate text-xs sm:text-sm font-bold text-white drop-shadow">
              {title}
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-white/60">
              <span className="text-blue-300 font-semibold">{activeStreamInfo.serverName}</span>
              {directUrl && !directUrl.includes('/api/transcode/stream') ? (
                <span className="rounded bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.2 border border-emerald-400/30">
                  ⚡ PotPlayer Native
                </span>
              ) : isEmbed ? (
                <span className="rounded bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.2 border border-amber-400/30">
                  Embed Mirror
                </span>
              ) : null}
              {isResolvingDirect && (
                <span className="rounded bg-blue-500/20 text-blue-300 font-bold px-1.5 py-0.2 border border-blue-400/30 animate-pulse">
                  Extracting Direct…
                </span>
              )}
              <span>•</span>
              <span className="text-amber-400 font-bold">{activeStreamInfo.resolution}</span>
              {activeStreamInfo.size && (
                <>
                  <span>•</span>
                  <span className="text-emerald-400 font-mono font-bold">💾 {activeStreamInfo.size}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Server Switcher Dropdown, PotPlayer Desktop, Control Panel, Close */}
        <div className="flex items-center gap-2">
          {/* ─── Streaming Server Switcher with File Size (GB/MB) ─── */}
          {allStreams && allStreams.length > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowServerMenu((prev) => !prev);
                  setShowColorPopover(false);
                  setShowAudioMenu(false);
                  setShowSubtitleMenu(false);
                }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  showServerMenu
                    ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/40'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                }`}
              >
                <span>⚡ Server</span>
                <span className="rounded bg-black/40 px-1.5 py-0.2 text-[10px] text-blue-300 font-mono">
                  {allStreams.length}
                </span>
                {activeStreamInfo.size && (
                  <span className="hidden sm:inline-block text-[10px] text-emerald-400 font-mono">
                    ({activeStreamInfo.size})
                  </span>
                )}
                <span className="text-[10px] opacity-70">▾</span>
              </button>

              {/* Server Selection Dropdown */}
              {showServerMenu && (
                <div
                  onWheel={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl bg-[#0e1424]/95 backdrop-blur-2xl border border-blue-500/40 shadow-2xl p-2 z-50 animate-fadeIn max-h-80 overflow-y-auto"
                >
                  <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">
                      Select Streaming Server
                    </span>
                    <span className="text-[10px] text-blue-400 font-mono">{allStreams.length} Available</span>
                  </div>

                  <div className="mt-1 space-y-1">
                    {allStreams.map((s, idx) => {
                      const info = parseStreamInfo(s);
                      const isCurrent = stream && s.url ? s.url === stream.url : idx === 0;

                      return (
                        <button
                          key={`${s.addonId}-${s.url}-${idx}`}
                          onClick={() => handleSwitchServer(s)}
                          className={`w-full rounded-xl p-2.5 text-left transition flex items-center justify-between gap-2 ${
                            isCurrent
                              ? 'bg-blue-600/30 border border-blue-400/50 text-white'
                              : 'bg-white/[0.03] hover:bg-white/10 border border-transparent text-white/80 hover:text-white'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">
                                {info.serverName}
                              </span>
                              <span className="rounded bg-blue-500/20 px-1.5 py-0.2 text-[9px] font-black text-blue-300 border border-blue-400/30">
                                {info.resolution}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">
                              {s.title || s.description || s.name}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            {info.size ? (
                              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-300 border border-emerald-400/30">
                                💾 {info.size}
                              </span>
                            ) : (
                              <span className="text-[10px] text-white/40 font-mono">Stream</span>
                            )}
                            {isCurrent && (
                              <span className="block text-[9px] text-blue-400 font-bold mt-0.5">✓ Active</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Open in Desktop PotPlayer */}
          <button
            onClick={launchDesktopPotPlayer}
            title="Launch in Desktop PotPlayer"
            className="hidden md:flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-amber-500/30 hover:border-amber-400/50 border border-white/15 px-3 py-1.5 text-xs font-semibold text-amber-200 transition"
          >
            <span>⚡ Desktop PotPlayer</span>
          </button>

          {/* Quick Snapshot Button */}
          <button
            onClick={captureSnapshot}
            title="Take Snapshot (S)"
            className="rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 p-2 text-white/80 hover:text-white transition"
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
              <path d="M4 4h3l2-2h6l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />
            </svg>
          </button>

          {/* PotPlayer Control Panel Toggle (F7) */}
          <button
            onClick={() => setShowControlPanel((prev) => !prev)}
            title="PotPlayer Settings (F7)"
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
              showControlPanel
                ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/40'
                : 'bg-white/10 text-white hover:bg-white/20 border-white/15'
            }`}
          >
            <span>⚙ Controls</span>
            <span className="text-[10px] opacity-75">F7</span>
          </button>

          {/* Close Player */}
          <button
            onClick={onClose}
            title="Close Player (Esc)"
            className="rounded-lg bg-rose-600/30 hover:bg-rose-600 border border-rose-500/40 p-2 text-rose-200 hover:text-white transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Main Video Canvas (Pure Native Sound or Embed) ─── */}
      <div
        onClick={!isEmbed ? togglePlay : undefined}
        onDoubleClick={!isEmbed ? toggleFullscreen : undefined}
        className="relative flex-1 grid place-items-center overflow-hidden bg-black"
      >
        {isEmbed ? (
          <iframe
            src={effectiveUrl || stream?.url}
            title={title}
            className="h-full w-full border-0 bg-black"
            referrerPolicy="no-referrer"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
          />
        ) : (
          <video
            ref={videoRef}
            playsInline
            autoPlay
            crossOrigin={directUrl && (directUrl.includes('/api/proxy/stream') || directUrl.includes('/api/transcode/stream')) ? 'anonymous' : undefined}
            onTimeUpdate={handleTimeUpdate}
            onWaiting={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onPlaying={() => {
              setIsPlaying(true);
              setIsBuffering(false);
              if (stallTimerRef.current) {
                clearTimeout(stallTimerRef.current);
                stallTimerRef.current = null;
              }
            }}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v) {
                if (v.duration && Number.isFinite(v.duration) && v.duration > 0) {
                  setDuration(v.duration);
                }
                v.muted = isMuted;
                v.volume = isMuted ? 0 : volume;
                if (v.videoWidth === 0) {
                  const checkTimer = setTimeout(() => {
                    if (videoRef.current && videoRef.current.videoWidth === 0 && !videoRef.current.paused && videoRef.current.currentTime > 2) {
                      if (!autoTranscodeAttemptedRef.current && stream?.url && (!directUrl || !directUrl.includes('/api/transcode/stream'))) {
                        autoTranscodeAttemptedRef.current = true;
                        const currentPos = Math.max(0, Math.floor(videoRef.current.currentTime || 0));
                        const transcodeUrl = `${API_BASE}/api/transcode/stream?url=${encodeURIComponent(stream.url)}&audioTrack=${currentAudioTrack || 0}&start=${currentPos}`;
                        setIsTranscoding(true);
                        setDirectUrl(transcodeUrl);
                        setMkvCodecWarning(false);
                        showOsd('⚡ Converting to H.264 for web playback...');
                      } else if (!directUrl?.includes('/api/transcode/stream')) {
                        setMkvCodecWarning(true);
                      }
                    }
                  }, 4000);
                  return () => clearTimeout(checkTimer);
                }
              }
            }}
            onEnded={() => setIsPlaying(false)}
            onError={handleVideoError}
            style={{ filter: filterStyle }}
            className={`transition-all duration-200 ${getAspectClass()}`}
          />
        )}

        {/* Live Subtitle Overlay */}
        {!isEmbed && activeCueText && subtitleEnabled && (
          <div className="absolute inset-x-0 bottom-16 sm:bottom-24 z-20 pointer-events-none flex justify-center px-4">
            <div
              className={`rounded-lg bg-black/80 px-4 py-1.5 text-center font-bold text-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] max-w-3xl leading-snug tracking-wide border border-black/50 ${getSubtitleSizeClass()}`}
              style={{ whiteSpace: 'pre-line' }}
            >
              {activeCueText}
            </div>
          </div>
        )}

        {/* PotPlayer On-Screen Display (OSD) Banner */}
        {osdMessage && (
          <div className="absolute left-6 top-16 z-30 pointer-events-none animate-fadeIn">
            <div className="rounded-xl bg-black/85 backdrop-blur-md px-4 py-2 text-xs sm:text-sm font-black tracking-wide text-amber-300 border border-amber-400/40 shadow-2xl flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              <span>{osdMessage}</span>
            </div>
          </div>
        )}

        {/* Live Buffering / Stall Overlay Spinner */}
        {!isEmbed && isBuffering && !isScanning && (
          <div className="pointer-events-none absolute inset-0 z-25 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] animate-fadeIn">
            <div className="relative flex items-center justify-center">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin shadow-lg" />
              <div className="absolute inset-0 grid place-items-center text-lg sm:text-xl font-black text-amber-400 animate-pulse">
                ⏳
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-full bg-black/80 px-4 py-1.5 border border-amber-500/30 shadow-xl backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-xs font-bold tracking-wider text-amber-300 uppercase">
                Buffering Stream...
              </span>
            </div>
          </div>
        )}

        {/* Big Center Play/Pause Ripple on Click */}
        {!isEmbed && !isPlaying && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-amber-500/90 text-black shadow-2xl shadow-amber-500/50 backdrop-blur-md transform transition hover:scale-110">
              <svg className="h-10 w-10 fill-current ml-1" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Live Resource Scanner Overlay (Removed in favor of clean background stream loading) */}

        {/* MKV / Codec Audio-Only Black Screen Warning Banner */}
        {mkvCodecWarning && !error && !isTranscoding && (!directUrl || !directUrl.includes('/api/transcode/stream')) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-6 text-center animate-fadeIn">
            <div className="relative max-w-md rounded-2xl bg-[#0f172a] p-6 border border-amber-500/40 text-amber-200 shadow-2xl">
              <button
                type="button"
                onClick={() => setMkvCodecWarning(false)}
                title="Dismiss Warning (✕)"
                className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-amber-600 hover:text-white transition text-sm font-bold shadow-lg"
              >
                ✕
              </button>
              <div className="text-3xl mb-2">🎬 ⚠️</div>
              <p className="text-base font-black text-white mb-1">Video Codec Not Supported in Browser</p>
              <p className="text-xs text-amber-200/90 mb-4 leading-relaxed">
                Sound is playing, but this video is encoded in <span className="font-bold text-amber-300">MKV / HEVC (H.265)</span> which web browsers cannot display natively.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  onClick={() => {
                    const raw = stream?.url;
                    if (raw) {
                      const currentPos = Math.max(0, Math.floor(videoRef.current?.currentTime || 0));
                      const transcodeUrl = `${API_BASE}/api/transcode/stream?url=${encodeURIComponent(raw)}&audioTrack=${currentAudioTrack || 0}&start=${currentPos}`;
                      setIsTranscoding(true);
                      setDirectUrl(transcodeUrl);
                      setMkvCodecWarning(false);
                      showOsd('⚡ Converting to H.264 for browser playback...');
                    }
                  }}
                  className="w-full sm:w-auto rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-md flex items-center justify-center gap-1.5"
                >
                  <span>⚡ Transcode & Play in Browser (H.264)</span>
                </button>
                {allStreams.length > 1 && (
                  <button
                    onClick={() => {
                      setMkvCodecWarning(false);
                      const altStreams = allStreams.filter(
                        (s) => s?.url && s.url !== stream?.url && !failedUrlsRef.current.has(s.url)
                      );
                      if (altStreams.length > 0) {
                        handleSwitchServer(altStreams[0]);
                      } else {
                        setShowServerMenu(true);
                      }
                    }}
                    className="w-full sm:w-auto rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500 transition shadow-md flex items-center justify-center gap-1.5"
                  >
                    <span>⚡ Try Next MP4 / HLS Server</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setMkvCodecWarning(false);
                    launchDesktopPotPlayer();
                  }}
                  className="w-full sm:w-auto rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-black hover:bg-amber-400 transition shadow-md flex items-center justify-center gap-1.5"
                >
                  <span>⚡ Desktop PotPlayer (Full Video)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stream Error Display */}
        {error && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 p-6 text-center animate-fadeIn">
            <div className="relative max-w-md rounded-2xl bg-[#151c2e] p-6 border border-rose-500/40 text-rose-300 shadow-2xl">
              {/* Top-Right Dismiss Cross (✕) */}
              <button
                type="button"
                onClick={() => setError('')}
                title="Close / Dismiss Error (✕)"
                className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-rose-600 hover:text-white transition text-sm font-bold shadow-lg"
              >
                ✕
              </button>
              <p className="text-base font-bold text-white mb-1">Stream Error</p>
              <p className="text-xs text-rose-300 mb-4 pr-6">{error}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={handleRetryPlayback}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-400 transition shadow-md flex items-center gap-1.5"
                >
                  <span>🔄</span> Retry Streams
                </button>
                {allStreams.length > 1 && (
                  <button
                    onClick={() => {
                      setError('');
                      const unfailed = allStreams.filter((s) => s?.url && !failedUrlsRef.current.has(s.url));
                      if (unfailed.length > 0) {
                        handleSwitchServer(unfailed[0]);
                      } else {
                        setShowServerMenu(true);
                      }
                    }}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-md flex items-center gap-1.5"
                  >
                    <span>⏭</span> Try Next Server
                  </button>
                )}
                {allStreams.length > 1 && (
                  <button
                    onClick={() => { setError(''); setShowServerMenu(true); }}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition"
                  >
                    ⚡ Servers ({allStreams.length})
                  </button>
                )}
                <button
                  onClick={launchDesktopPotPlayer}
                  className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20 border border-white/20 transition"
                >
                  Desktop PotPlayer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom PotPlayer Control Deck (Direct Video only) ─── */}
      {!isEmbed ? (
        <div
          className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/85 to-transparent pt-6 pb-3 px-4 sm:px-6 transition-opacity duration-300 ${
            isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
        {/* Timeline / Seekbar */}
        <div
          ref={seekbarRef}
          onClick={handleSeekbarClick}
          onMouseMove={handleSeekbarMouseMove}
          onMouseDown={() => setIsDraggingSeek(true)}
          onMouseUp={() => setIsDraggingSeek(false)}
          onMouseLeave={() => setHoverSeekTime(null)}
          className="group/seek relative mb-3 h-2 w-full cursor-pointer rounded-full bg-white/20 transition-all hover:h-3"
        >
          {/* Buffered Progress */}
          {duration > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/30"
              style={{ width: `${(buffered / duration) * 100}%` }}
            />
          )}

          {/* Current Played Progress */}
          {duration > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          )}

          {/* Scrubber Thumb */}
          {duration > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -ml-2 h-4 w-4 rounded-full bg-white shadow-md shadow-black/80 transition-transform group-hover/seek:scale-125"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
          )}

          {/* A-B Markers */}
          {loopA !== null && duration > 0 && (
            <div
              title={`Loop Point A: ${formatTime(loopA)}`}
              className="absolute top-0 bottom-0 w-1 bg-emerald-400 shadow-[0_0_8px_#34d399]"
              style={{ left: `${(loopA / duration) * 100}%` }}
            />
          )}
          {loopB !== null && duration > 0 && (
            <div
              title={`Loop Point B: ${formatTime(loopB)}`}
              className="absolute top-0 bottom-0 w-1 bg-rose-400 shadow-[0_0_8px_#f87171]"
              style={{ left: `${(loopB / duration) * 100}%` }}
            />
          )}

          {/* Hover Time Tooltip */}
          {hoverSeekTime !== null && (
            <div
              className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-black/90 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-white/20"
              style={{ left: `${hoverSeekPos}px` }}
            >
              {formatTime(hoverSeekTime)}
            </div>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-white">
          {/* Left Actions: Play, Stop, Frame, Jump, Volume, Time */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              title="Play/Pause (Space)"
              className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition"
            >
              {isPlaying ? (
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4 fill-current ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Stop */}
            <button
              onClick={stopPlayback}
              title="Stop Playback"
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
            >
              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z" />
              </svg>
            </button>

            {/* Frame Backward (A) */}
            <button
              onClick={() => stepFrame(-1)}
              title="Previous Frame (A)"
              className="hidden sm:grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition text-xs font-mono"
            >
              ◀|
            </button>

            {/* Jump -10s */}
            <button
              onClick={() => seekRelative(-10)}
              title="Rewind 10s (Left Arrow)"
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition text-xs font-bold"
            >
              -10
            </button>

            {/* Jump +10s */}
            <button
              onClick={() => seekRelative(10)}
              title="Forward 10s (Right Arrow)"
              className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition text-xs font-bold"
            >
              +10
            </button>

            {/* Frame Forward (D) */}
            <button
              onClick={() => stepFrame(1)}
              title="Next Frame (D)"
              className="hidden sm:grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition text-xs font-mono"
            >
              |▶
            </button>

            {/* Volume Control (Pure Native Sound) */}
            <div className="flex items-center gap-1.5 ml-1">
              <button
                onClick={() => setIsMuted((prev) => !prev)}
                onKeyDown={(e) => e.stopPropagation()}
                title="Mute/Unmute (M)"
                className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition"
              >
                {isMuted || volume === 0 ? (
                  <span className="text-rose-400">🔇</span>
                ) : (
                  <span>🔊</span>
                )}
              </button>

              <div className="flex items-center gap-1.5 w-20 sm:w-28" onKeyDown={(e) => e.stopPropagation()}>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      adjustVolume(-0.05);
                    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      adjustVolume(0.05);
                    }
                  }}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVolume(val);
                    if (isMuted && val > 0) setIsMuted(false);
                  }}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-amber-400"
                />
                <span className={`text-[10px] font-mono min-w-8 ${volume > 1.0 ? 'text-amber-300 font-bold' : 'text-white/70'}`}>
                  {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                </span>
              </div>
            </div>

            {/* Time Display */}
            <button
              onClick={() => setShowRemaining((prev) => !prev)}
              title="Toggle Elapsed / Remaining Time"
              className="ml-2 font-mono text-xs text-white/80 hover:text-amber-300 transition"
            >
              {formatTime(currentTime)} /{' '}
              {showRemaining
                ? `-${formatTime(Math.max(0, duration - currentTime))}`
                : formatTime(duration)}
            </button>
          </div>

          {/* Right Actions: Equalizer Popover, Audio Track, Subtitles, Speed, Aspect, PiP, Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* ─── Direct Video Equalizer (Brightness, Contrast, Saturation) Popover ─── */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowColorPopover((prev) => !prev);
                  setShowServerMenu(false);
                  setShowAudioMenu(false);
                  setShowSubtitleMenu(false);
                }}
                title="Video Color & Equalizer (Saturation, Contrast, Brightness)"
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1 ${
                  showColorPopover || brightness !== 100 || contrast !== 100 || saturation !== 100
                    ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/30'
                    : 'bg-white/10 text-white/80 hover:bg-white/20 border-white/15'
                }`}
              >
                <span>🎨 Color / EQ</span>
              </button>

              {/* Color & Equalizer Popover Panel */}
              {showColorPopover && (
                <div className="absolute right-0 bottom-full mb-2 w-80 rounded-2xl bg-[#0e1424]/95 backdrop-blur-2xl border border-amber-400/40 shadow-2xl p-4 z-50 animate-fadeIn text-xs text-white">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                        Video Equalizer
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-amber-200">
                        {eqPreset === 'custom' ? 'Custom' : (EQ_PRESETS.find(p => p.id === eqPreset)?.name || 'Custom')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Hold to Compare button */}
                      <button
                        type="button"
                        onMouseDown={() => setIsComparing(true)}
                        onMouseUp={() => setIsComparing(false)}
                        onMouseLeave={() => setIsComparing(false)}
                        onTouchStart={() => setIsComparing(true)}
                        onTouchEnd={() => setIsComparing(false)}
                        title="Hold to see original video without filters"
                        className={`text-[10px] font-bold px-2 py-0.5 rounded transition select-none ${
                          isComparing
                            ? 'bg-amber-500 text-black'
                            : 'bg-white/10 text-white/80 hover:bg-white/20'
                        }`}
                      >
                        👁️ Hold Compare
                      </button>
                      <button
                        onClick={resetFilters}
                        title="Reset all to Normal (W)"
                        className="text-[10px] text-white/60 hover:text-white font-mono underline"
                      >
                        Reset (W)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Presets Chips (scrollable row) */}
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-white/50 mb-1.5">Color & Cinema Presets</span>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollable-container" data-scrollable="true">
                        {EQ_PRESETS.map((p) => {
                          const isActive = eqPreset === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => applyPreset(p)}
                              className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition border ${
                                isActive
                                  ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                                  : 'bg-white/5 hover:bg-white/15 text-white/80 border-white/10'
                              }`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Preset Intensity Scaling Slider */}
                    <div className="bg-white/[0.04] p-2.5 rounded-xl border border-white/10">
                      <div className="flex justify-between items-center text-white/80 mb-1">
                        <span className="font-semibold text-amber-300 flex items-center gap-1">
                          <span>Preset Intensity</span>
                          <span className="text-[9px] text-white/50">({eqIntensity === 0 ? 'Original' : eqIntensity === 100 ? '100% Full' : 'Scaled'})</span>
                        </span>
                        <span className="font-mono text-amber-300 font-bold">{eqIntensity}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={eqIntensity}
                        onChange={(e) => handleIntensityChange(Number(e.target.value))}
                        className="w-full accent-amber-400 cursor-pointer"
                      />
                      <div className="flex justify-between text-[9px] text-white/40 mt-0.5">
                        <span>0% (Original)</span>
                        <span>60% (Natural)</span>
                        <span>100% (Full)</span>
                      </div>
                    </div>

                    {/* Brightness */}
                    <div>
                      <div className="flex justify-between text-white/70 mb-1">
                        <span>Brightness (E / R)</span>
                        <span className="font-mono text-amber-300 font-bold">{brightness}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="150"
                        value={brightness}
                        onChange={(e) => handleManualSliderChange('brightness', Number(e.target.value))}
                        className="w-full accent-amber-400"
                      />
                    </div>

                    {/* Contrast */}
                    <div>
                      <div className="flex justify-between text-white/70 mb-1">
                        <span>Contrast</span>
                        <span className="font-mono text-amber-300 font-bold">{contrast}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="150"
                        value={contrast}
                        onChange={(e) => handleManualSliderChange('contrast', Number(e.target.value))}
                        className="w-full accent-amber-400"
                      />
                    </div>

                    {/* Saturation */}
                    <div>
                      <div className="flex justify-between text-white/70 mb-1">
                        <span>Saturation (Color)</span>
                        <span className="font-mono text-amber-300 font-bold">{saturation}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        value={saturation}
                        onChange={(e) => handleManualSliderChange('saturation', Number(e.target.value))}
                        className="w-full accent-amber-400"
                      />
                    </div>

                    {/* Sharpness (GPU Convolution) */}
                    <div>
                      <div className="flex justify-between text-white/70 mb-1">
                        <span className="flex items-center gap-1">
                          <span>Sharpness (GPU)</span>
                          {sharpness > 0 && <span className="text-[9px] text-amber-400">⚡ Active</span>}
                        </span>
                        <span className="font-mono text-amber-300 font-bold">{sharpness}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={Math.min(50, sharpness)}
                        onChange={(e) => handleManualSliderChange('sharpness', Number(e.target.value))}
                        className="w-full accent-amber-400"
                      />
                      <div className="flex justify-between text-[9px] text-white/40 mt-0.5">
                        <span>0% (Off)</span>
                        <span>25% (Subtle 4K)</span>
                        <span>50% (Max Safe)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Audio Track Selector Dropdown ─── */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowAudioMenu((prev) => !prev);
                  setShowServerMenu(false);
                  setShowColorPopover(false);
                  setShowSubtitleMenu(false);
                }}
                title={audioTracks.length > 1 ? 'Select Audio Track (Language)' : 'This source has one audio track. Pick another source for another language.'}
                aria-label="Select Audio Language Track"
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1 ${
                  showAudioMenu
                    ? 'bg-blue-600 text-white border-blue-400'
                    : audioTracks.length > 1
                    ? 'bg-white/10 text-white hover:bg-white/20 border-white/20'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border-white/10'
                }`}
              >
                <span>🎙 Audio</span>
                {audioTracks.length > 1 && (
                  <span className="rounded bg-black/40 px-1 py-0.2 text-[9px] text-blue-300 font-mono font-bold">
                    {audioTracks.length}
                  </span>
                )}
              </button>

              {/* Audio Tracks Dropdown */}
              {showAudioMenu && (
                <div
                  onWheel={(e) => e.stopPropagation()}
                  className="absolute right-0 bottom-full mb-2 w-64 rounded-2xl bg-[#0e1424]/95 backdrop-blur-2xl border border-blue-500/40 shadow-2xl p-2.5 z-50 animate-fadeIn text-xs text-white"
                >
                  <div className="px-2 py-1.5 border-b border-white/10 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white/70 uppercase">
                      Audio Tracks & Decoder
                    </span>
                    <span className="text-[9px] rounded bg-blue-500/20 text-blue-300 px-1.5 py-0.5">
                      {audioTracks.length > 0 ? `${audioTracks.length} Tracks` : 'Stereo'}
                    </span>
                  </div>

                  <div className="mt-1.5 space-y-1">
                    {audioTracks.length === 0 ? (
                      <div className="px-2 py-2 text-[11px] text-white/70 bg-white/5 rounded-lg space-y-1">
                        <p className="font-semibold text-white/90">Single Audio Track Active</p>
                        <p className="text-[10px] text-white/50 leading-tight">
                          This source has one audio track. Pick another source for another language.
                        </p>
                      </div>
                    ) : (
                      audioTracks.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => handleSelectAudioTrack(track.id)}
                          className={`w-full rounded-lg px-2.5 py-1.5 text-left flex items-center justify-between text-xs transition ${
                            currentAudioTrack === track.id
                              ? 'bg-blue-600 text-white font-bold'
                              : 'hover:bg-white/10 text-white/80'
                          }`}
                        >
                          <span>{track.name}</span>
                          {currentAudioTrack === track.id && <span>✓</span>}
                        </button>
                      ))
                    )}
                  </div>

                  {/* MKV / AC3 Audio Helper */}
                  <div className="mt-2.5 pt-2 border-t border-white/10">
                    <p className="text-[10px] text-amber-200/80 mb-1.5">
                      🔇 No sound on MKV? (Browsers cannot decode AC-3/DTS audio):
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        launchDesktopPotPlayer();
                        setShowAudioMenu(false);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/40 py-1.5 text-[11px] font-bold transition shadow-sm"
                    >
                      <span>⚡ Open PotPlayer (Full Audio)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Subtitles Menu (Internal + Upload) ─── */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSubtitleMenu((prev) => !prev);
                  setShowServerMenu(false);
                  setShowColorPopover(false);
                  setShowAudioMenu(false);
                }}
                title="Select Subtitle Track / Upload Subtitle (L)"
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1 ${
                  subtitleEnabled && (internalSubtitles.length > 0 || customSubtitles.length > 0)
                    ? 'bg-amber-500 text-black border-amber-400'
                    : 'bg-white/10 text-white/80 hover:bg-white/20 border-white/15'
                }`}
              >
                <span>CC</span>
                {subtitleEnabled && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              </button>

              {/* Subtitles Popover */}
              {showSubtitleMenu && (
                <div className="absolute right-0 bottom-full mb-2 w-64 rounded-2xl bg-[#0e1424]/95 backdrop-blur-2xl border border-amber-400/40 shadow-2xl p-2.5 z-50 animate-fadeIn text-xs text-white">
                  <div className="px-2 py-1 border-b border-white/10 text-[11px] font-bold text-amber-300 uppercase">
                    Subtitles (CC)
                  </div>

                  <div className="mt-1 space-y-1">
                    {/* Subtitles OFF */}
                    <button
                      onClick={() => handleSelectSubtitleTrack(-1)}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left flex items-center justify-between ${
                        !subtitleEnabled || (currentSubtitleTrack === -1 && customSubtitles.length === 0)
                          ? 'bg-rose-600/30 text-rose-300 font-bold'
                          : 'hover:bg-white/10 text-white/70'
                      }`}
                    >
                      <span>Off</span>
                      {(!subtitleEnabled || (currentSubtitleTrack === -1 && customSubtitles.length === 0)) && <span>✓</span>}
                    </button>

                    {/* Internal Subtitle Tracks */}
                    {internalSubtitles.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => handleSelectSubtitleTrack(track.id)}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-left flex items-center justify-between ${
                          currentSubtitleTrack === track.id && subtitleEnabled
                            ? 'bg-amber-500 text-black font-bold'
                            : 'hover:bg-white/10 text-white/80'
                        }`}
                      >
                        <span>{track.name}</span>
                        {currentSubtitleTrack === track.id && subtitleEnabled && <span>✓</span>}
                      </button>
                    ))}

                    {/* Online Addon Subtitle Tracks */}
                    {addonSubtitles.length > 0 && (
                      <div className="pt-1.5 border-t border-white/10">
                        <span className="text-[10px] text-amber-300/80 font-bold px-1 uppercase tracking-wider block mb-1">
                          Online Subtitles ({addonSubtitles.length})
                        </span>
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                          {addonSubtitles.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() => handleSelectSubtitleTrack(sub.id)}
                              className={`w-full rounded-lg px-2 py-1 text-left flex items-center justify-between text-[11px] transition ${
                                currentSubtitleTrack === sub.id && subtitleEnabled
                                  ? 'bg-amber-500 text-black font-bold'
                                  : 'hover:bg-white/10 text-white/80'
                              }`}
                            >
                              <span className="truncate pr-2">{sub.name || sub.lang} ({sub.lang})</span>
                              {currentSubtitleTrack === sub.id && subtitleEnabled && <span>✓</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Load Custom Subtitle File */}
                    <div className="pt-2 border-t border-white/10">
                      <button
                        onClick={() => handleSelectSubtitleTrack('upload')}
                        className="w-full rounded-lg bg-blue-600/30 hover:bg-blue-600 border border-blue-400/40 py-1.5 text-blue-200 hover:text-white font-bold transition text-[11px]"
                      >
                        📂 Upload .SRT / .VTT File
                      </button>
                      {customSubtitles.length > 0 && (
                        <p className="mt-1 text-[10px] text-emerald-400 px-1">
                          ✓ Custom file active ({customSubtitles.length} cues)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Quality / Resolution Selector ─── */}
            {qualityLevels.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowQualityMenu((prev) => !prev);
                    setShowServerMenu(false);
                    setShowColorPopover(false);
                    setShowAudioMenu(false);
                    setShowSubtitleMenu(false);
                  }}
                  title="Video Quality / Resolution"
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1 ${
                    showQualityMenu
                      ? 'bg-amber-500 text-black border-amber-400'
                      : 'bg-white/10 text-white/80 hover:bg-white/20 border-white/15'
                  }`}
                >
                  <span>🎬 {currentQuality === -1 ? 'Auto' : (qualityLevels.find((q) => q.id === currentQuality)?.name || 'HD')}</span>
                  <span className="text-[9px] opacity-70">▼</span>
                </button>

                {/* Quality Menu Popover */}
                {showQualityMenu && (
                  <div className="absolute right-0 bottom-full mb-2 w-48 rounded-2xl bg-[#0e1424]/95 backdrop-blur-2xl border border-amber-400/40 shadow-2xl p-2 z-50 animate-fadeIn text-xs text-white">
                    <div className="px-2 py-1.5 border-b border-white/10 text-[11px] font-bold text-amber-300 uppercase flex items-center justify-between">
                      <span>Resolution</span>
                      <span className="text-[9px] text-white/40">{qualityLevels.length} Levels</span>
                    </div>

                    <div className="mt-1 space-y-1">
                      {/* Auto Quality */}
                      <button
                        type="button"
                        onClick={() => handleSelectQuality(-1)}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-left flex items-center justify-between text-xs transition ${
                          currentQuality === -1
                            ? 'bg-amber-500 text-black font-bold'
                            : 'hover:bg-white/10 text-white/80'
                        }`}
                      >
                        <span>Auto (Adaptive)</span>
                        {currentQuality === -1 && <span>✓</span>}
                      </button>

                      {/* Explicit Quality Heights */}
                      {qualityLevels.map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => handleSelectQuality(lvl.id)}
                          className={`w-full rounded-lg px-2.5 py-1.5 text-left flex items-center justify-between text-xs transition ${
                            currentQuality === lvl.id
                              ? 'bg-amber-500 text-black font-bold'
                              : 'hover:bg-white/10 text-white/80'
                          }`}
                        >
                          <span>{lvl.name}</span>
                          {currentQuality === lvl.id && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Speed Selector (Z / X / C) */}
            <button
              onClick={() => changeSpeed(playbackRate >= 2 ? 0.75 : playbackRate + 0.25)}
              title="Playback Speed (C: Faster, X: Slower, Z: 1.0x)"
              className="rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1 text-xs font-mono font-bold text-amber-300 transition"
            >
              {playbackRate}x
            </button>

            {/* Aspect Ratio Switcher */}
            <button
              onClick={() => {
                const ratios = ['auto', '16:9', '4:3', '21:9', 'fill'];
                const nextIdx = (ratios.indexOf(aspectRatio) + 1) % ratios.length;
                setAspectRatio(ratios[nextIdx]);
                showOsd(`Aspect: ${ratios[nextIdx].toUpperCase()}`);
              }}
              title="Toggle Aspect Ratio"
              className="hidden sm:inline-block rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1 text-xs font-semibold text-white/80 hover:text-white transition"
            >
              {aspectRatio.toUpperCase()}
            </button>

            {/* A-B Loop Controls */}
            <div className="hidden md:flex items-center gap-0.5 rounded-lg bg-white/10 border border-white/15 p-0.5">
              <button
                onClick={setPointA}
                title="Set Loop Point A ([)"
                className={`rounded px-1.5 py-0.5 text-[11px] font-bold transition ${
                  loopA !== null ? 'bg-emerald-500 text-black' : 'text-white/70 hover:text-white'
                }`}
              >
                [A
              </button>
              <button
                onClick={setPointB}
                title="Set Loop Point B (])"
                className={`rounded px-1.5 py-0.5 text-[11px] font-bold transition ${
                  loopB !== null ? 'bg-rose-500 text-white' : 'text-white/70 hover:text-white'
                }`}
              >
                B]
              </button>
              {(loopA !== null || loopB !== null) && (
                <button
                  onClick={clearLoop}
                  title="Clear Loop (\)"
                  className="rounded px-1 text-[10px] text-white/50 hover:text-rose-400"
                >
                  ✕
                </button>
              )}
            </div>

            {/* PiP (P) */}
            <button
              onClick={togglePip}
              title="Picture in Picture (P)"
              className="rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 p-1.5 text-white/80 hover:text-white transition"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M19 11h-8v6h8v-6zm4 8V5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 0H3V5h18v14z" />
              </svg>
            </button>

            {/* Fullscreen (F / Enter) */}
            <button
              onClick={toggleFullscreen}
              title="Fullscreen (F / Enter)"
              className="rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 p-1.5 text-white/80 hover:text-white transition"
            >
              {isFullscreen ? (
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-14v3h3v2h-5V5h2z" />
                </svg>
              ) : (
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      ) : (
        <div
          className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/80 to-transparent p-4 flex items-center justify-between text-xs text-white/80 transition-opacity duration-300 ${
            isControlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-white">Embed Streaming Server</span>
            <span className="chip rounded-full px-2 py-0.5 text-[10px] text-amber-300">
              Interactive Web Player
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowServerMenu(true)}
              className="btn-spatial-blue rounded-xl px-3 py-1.5 text-xs font-bold shadow-md"
            >
              ⚡ Switch Server ({allStreams.length})
            </button>
            <button
              onClick={toggleFullscreen}
              className="btn-glass rounded-xl px-3 py-1.5 text-xs font-bold text-white"
            >
              Full Screen
            </button>
          </div>
        </div>
      )}

      {/* ─── PotPlayer Full Control Panel Popover (F7) ─── */}
      {showControlPanel && (
        <div
          onWheel={(e) => e.stopPropagation()}
          className="absolute right-4 bottom-20 z-50 w-80 sm:w-96 rounded-2xl bg-[#0f1422]/95 backdrop-blur-2xl border border-amber-400/30 shadow-2xl overflow-hidden animate-fadeIn"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-amber-300">
                PotPlayer Control Panel (F7)
              </h2>
            </div>
            <button
              onClick={() => setShowControlPanel(false)}
              className="text-white/60 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>

          <div className="flex border-b border-white/10 bg-white/[0.02] text-xs">
            {[
              { id: 'video', label: 'Video' },
              { id: 'audio', label: 'Audio' },
              { id: 'subtitles', label: 'Subtitles' },
              { id: 'hotkeys', label: 'Hotkeys' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 font-bold transition ${
                  activeTab === tab.id
                    ? 'text-amber-300 border-b-2 border-amber-400 bg-amber-400/10'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-4 max-h-80 overflow-y-auto text-xs text-white">
            {activeTab === 'video' && (
              <div className="space-y-3.5">
                {/* Presets Chips in Control Panel */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-white/70 font-bold">Picture Presets</span>
                    <span className="text-[10px] font-mono text-amber-300">
                      {eqPreset === 'custom' ? 'Custom' : (EQ_PRESETS.find(p => p.id === eqPreset)?.name || 'Custom')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollable-container" data-scrollable="true">
                    {EQ_PRESETS.map((p) => {
                      const isActive = eqPreset === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyPreset(p)}
                          className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition border ${
                            isActive
                              ? 'bg-amber-500 text-black border-amber-400'
                              : 'bg-white/5 hover:bg-white/15 text-white/80 border-white/10'
                          }`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-white/70 mb-1">
                    <span>Brightness (E / R)</span>
                    <span className="font-mono text-amber-300">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={brightness}
                    onChange={(e) => handleManualSliderChange('brightness', Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-white/70 mb-1">
                    <span>Contrast</span>
                    <span className="font-mono text-amber-300">{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={contrast}
                    onChange={(e) => handleManualSliderChange('contrast', Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-white/70 mb-1">
                    <span>Saturation (Color)</span>
                    <span className="font-mono text-amber-300">{saturation}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={saturation}
                    onChange={(e) => handleManualSliderChange('saturation', Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-white/70 mb-1">
                    <span className="flex items-center gap-1">
                      <span>Sharpness (GPU)</span>
                      {sharpness > 0 && <span className="text-[9px] text-amber-400">⚡ Active</span>}
                    </span>
                    <span className="font-mono text-amber-300">{sharpness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sharpness}
                    onChange={(e) => handleManualSliderChange('sharpness', Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  {/* Compare button in control panel */}
                  <button
                    type="button"
                    onMouseDown={() => setIsComparing(true)}
                    onMouseUp={() => setIsComparing(false)}
                    onMouseLeave={() => setIsComparing(false)}
                    onTouchStart={() => setIsComparing(true)}
                    onTouchEnd={() => setIsComparing(false)}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition select-none ${
                      isComparing
                        ? 'bg-amber-500 text-black'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    👁️ Hold Compare
                  </button>
                  <button
                    onClick={resetFilters}
                    className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 font-bold text-white transition"
                  >
                    Reset (W)
                  </button>
                  <button
                    onClick={captureSnapshot}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 font-bold transition"
                  >
                    Snapshot (S)
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="space-y-3.5">
                <div>
                  <div className="flex justify-between text-white/70 mb-1">
                    <span>Master Volume / Boost (0% - 200%)</span>
                    <span className={`font-mono font-bold ${volume > 1.0 ? 'text-amber-300' : 'text-white'}`}>
                      {Math.round(volume * 100)}%{volume > 1.0 ? ' ⚡ 200% BOOST' : ''}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                  <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                    <span>0%</span>
                    <span>100% (Clean)</span>
                    <span className="text-amber-300 font-semibold">200% (Boost)</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10">
                  <span className="block text-white/70 mb-2 font-bold">🎧 Sound Modes & Spatial Effects</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setAudioMode('normal')}
                      className={`p-2 rounded-lg text-left transition border ${
                        audioMode === 'normal'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-xs">🎵 Clean / Standard</div>
                      <div className="text-[10px] text-white/50">Original pure sound</div>
                    </button>

                    <button
                      onClick={() => setAudioMode('bass')}
                      className={`p-2 rounded-lg text-left transition border ${
                        audioMode === 'bass'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-xs">🔊 Deep Bass Boost</div>
                      <div className="text-[10px] text-white/50">+11dB punch & rumble</div>
                    </button>

                    <button
                      onClick={() => setAudioMode('8d')}
                      className={`p-2 rounded-lg text-left transition border ${
                        audioMode === '8d'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-xs">🎧 8D Mode (AirPods)</div>
                      <div className="text-[10px] text-white/50">360° dynamic rotation</div>
                    </button>

                    <button
                      onClick={() => setAudioMode('hall')}
                      className={`p-2 rounded-lg text-left transition border ${
                        audioMode === 'hall'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-xs">🏛️ Big Cinema Hall</div>
                      <div className="text-[10px] text-white/50">Immersive room reverb</div>
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10">
                  <span className="block text-white/70 mb-1 font-bold">Select Audio Language Track</span>
                  {audioTracks.length === 0 ? (
                    <p className="text-[11px] text-white/50">Direct Stereo Track Active</p>
                  ) : (
                    <div className="space-y-1">
                      {audioTracks.map((tr) => (
                        <button
                          key={tr.id}
                          onClick={() => handleSelectAudioTrack(tr.id)}
                          className={`w-full py-1.5 px-2.5 rounded-lg text-left text-xs transition flex justify-between ${
                            currentAudioTrack === tr.id ? 'bg-blue-600 text-white font-bold' : 'bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          <span>{tr.name}</span>
                          {currentAudioTrack === tr.id && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'subtitles' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-white/70 mb-1">Custom File (.srt / .vtt)</label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 rounded-lg bg-blue-600/30 hover:bg-blue-600 border border-blue-400/40 text-blue-200 hover:text-white font-bold transition"
                  >
                    📂 Choose Subtitle File (or Drag & Drop)
                  </button>
                </div>

                <div>
                  <div className="flex justify-between text-white/70 mb-1">
                    <span>Sync Delay Offset</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {subtitleOffset > 0 ? `+${subtitleOffset}s` : `${subtitleOffset}s`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSubtitleOffset((prev) => parseFloat((prev - 0.5).toFixed(1)))}
                      className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 font-bold"
                    >
                      -0.5s Earlier
                    </button>
                    <button
                      onClick={() => setSubtitleOffset(0)}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 font-bold"
                    >
                      Reset (0s)
                    </button>
                    <button
                      onClick={() => setSubtitleOffset((prev) => parseFloat((prev + 0.5).toFixed(1)))}
                      className="flex-1 py-1 rounded bg-white/10 hover:bg-white/20 font-bold"
                    >
                      +0.5s Later
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-white/70 mb-1">Subtitle Font Size</span>
                  <div className="grid grid-cols-4 gap-1 text-[11px]">
                    {['small', 'normal', 'large', 'xl'].map((sz) => (
                      <button
                        key={sz}
                        onClick={() => setSubtitleSize(sz)}
                        className={`py-1 rounded font-bold uppercase transition ${
                          subtitleSize === sz
                            ? 'bg-amber-400 text-black'
                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'hotkeys' && (
              <div className="space-y-1.5 text-[11px] font-mono">
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">Space / K</span>
                  <span className="text-amber-300">Play / Pause</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">← / →</span>
                  <span className="text-amber-300">Seek ±5s (Shift: ±10s, Ctrl: ±30s)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">↑ / ↓ or Scroll</span>
                  <span className="text-amber-300">Volume ±5%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">M</span>
                  <span className="text-amber-300">Mute / Unmute</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">F / Enter</span>
                  <span className="text-amber-300">Toggle Fullscreen</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">C / X / Z</span>
                  <span className="text-amber-300">Speed Up / Down / Reset</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">D / A</span>
                  <span className="text-amber-300">Step 1 Frame Next / Prev</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">S</span>
                  <span className="text-amber-300">Save Frame Snapshot (PNG)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">[ / ] / \</span>
                  <span className="text-amber-300">A-B Repeat (Set A, Set B, Clear)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">E / R / W</span>
                  <span className="text-amber-300">Brightness Down / Up / Reset</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">L</span>
                  <span className="text-amber-300">Toggle Subtitles</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">P</span>
                  <span className="text-amber-300">Picture-in-Picture</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-white/60">F7</span>
                  <span className="text-amber-300">Toggle Control Panel</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
