import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { progress, api, API_BASE } from '../api.js';

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
  if (!s) return { size: null, resolution: 'HD', serverName: 'Direct' };
  const fullText = `${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.behaviorHints?.filename || ''}`;
  
  // Extract file size: e.g. 2.45 GB, 750 MB, 1.2 GiB
  const sizeMatch = fullText.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|GiB|MiB))/i);
  const size = sizeMatch ? sizeMatch[1].toUpperCase() : null;

  // Extract resolution: 4K, 2160p, 1080p, 720p, 480p, HDR
  const resMatch = fullText.match(/(4K|2160p|1080p|720p|480p|HDR10\+|HDR|DV|UHD)/i);
  const resolution = resMatch ? resMatch[1].toUpperCase() : 'HD';

  // Extract codec / sound: e.g. DDP5.1, Atmos, AAC, HEVC, H.264
  const soundMatch = fullText.match(/(DDP5\.1|Atmos|5\.1|7\.1|AAC|DTS|Dolby)/i);
  const sound = soundMatch ? soundMatch[1] : null;

  const serverName = s.addonName || s.name?.split('\n')[0] || 'Server';

  return { size, resolution, sound, serverName, fullText };
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
  const [isScanning, setIsScanning] = useState(!initialStream && Boolean(id));

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
  const [volume, setVolume] = useState(1); // 0.0 to 1.0 (Clean native sound)
  const [isMuted, setIsMuted] = useState(false);
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

  // Video Equalizer (Brightness, Contrast, Saturation)
  const [brightness, setBrightness] = useState(100); // 50% - 150%
  const [contrast, setContrast] = useState(100);     // 50% - 150%
  const [saturation, setSaturation] = useState(100); // 0% - 200%
  const [aspectRatio, setAspectRatio] = useState('auto');

  // Multi-Audio Tracks
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);

  // Subtitles (Internal + External)
  const [internalSubtitles, setInternalSubtitles] = useState([]);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState(-1); // -1 = Off
  const [customSubtitles, setCustomSubtitles] = useState([]);
  const [activeCueText, setActiveCueText] = useState('');
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleSize, setSubtitleSize] = useState('normal');

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

  // Stream auto-fetch & real-time resource scanner if opened directly
  useEffect(() => {
    if (initialStream) return;
    if (!id) return;

    let active = true;
    setIsScanning(true);
    setError('');

    api.getStreams(type, id)
      .then((data) => {
        if (!active) return;
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
        if (active) setError(err.message || 'Error scanning live sources.');
      })
      .finally(() => {
        if (active) setIsScanning(false);
      });

    return () => { active = false; };
  }, [type, id, initialStream, showOsd]);

  const rawUrl = directUrl || stream?.url;
  const effectiveUrl = (rawUrl && rawUrl.startsWith('/api/')) ? `${API_BASE}${rawUrl}` : rawUrl;
  const isEmbed = !directUrl && isEmbedUrl(stream?.url);
  const activeStreamInfo = parseStreamInfo(stream);

  const handleVideoError = () => {
    if (directUrl && directUrl !== stream?.url) {
      setDirectUrl(null);
      showOsd('Direct stream failed, trying fallback...');
      return;
    }
    const currentSrc = effectiveUrl || stream?.url;
    if (currentSrc && !currentSrc.includes('/api/proxy/stream') && !isEmbedUrl(currentSrc)) {
      const proxied = `${API_BASE}/api/proxy/stream?url=${encodeURIComponent(currentSrc)}`;
      setDirectUrl(proxied);
      showOsd('⚡ Routing through Stream Proxy...');
      return;
    }
    if (allStreams.length > 1) {
      const curIdx = allStreams.findIndex((s) => s.url === stream?.url);
      const nextStream = allStreams[(curIdx + 1) % allStreams.length];
      if (nextStream && nextStream !== stream) {
        showOsd(`Auto-switching to ${parseStreamInfo(nextStream).serverName}...`);
        handleSwitchServer(nextStream);
        return;
      }
    }
    setError('Unable to play this direct stream. Please select another server from the top menu.');
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

    // Ensure audio plays directly through browser native sound engine (never silenced)
    video.muted = false;
    video.volume = volume;

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
          setAudioTracks(hls.audioTracks.map((t, idx) => ({
            id: idx,
            name: t.name || t.lang || `Track ${idx + 1}`,
            lang: t.lang || ''
          })));
          setCurrentAudioTrack(hls.audioTrack);
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
          setAudioTracks(data.audioTracks.map((t, idx) => ({
            id: idx,
            name: t.name || t.lang || `Track ${idx + 1}`,
            lang: t.lang || ''
          })));
          setCurrentAudioTrack(hls.audioTrack);
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
          setError('Unable to play this stream directly. Please switch to another server in the top menu.');
        }
      });
    } else {
      video.src = streamUrl;
      if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
        setError('HLS video is not natively supported in this browser.');
      }
    }

    video.play().then(() => setIsPlaying(true)).catch(() => {});

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [effectiveUrl, isEmbed, volume]);

  // Volume & Mute Update
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    video.volume = isMuted ? 0 : Math.min(1.0, Math.max(0, volume));
  }, [volume, isMuted]);

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
    const target = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
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

  // Adjust Volume
  const adjustVolume = (delta) => {
    setVolume((prev) => {
      const next = Math.max(0, Math.min(1.0, parseFloat((prev + delta).toFixed(2))));
      if (next > 0 && isMuted) setIsMuted(false);
      showOsd(`Volume: ${Math.round(next * 100)}%`);
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
      showOsd(`Audio: ${tr?.name || `Track ${trackId + 1}`}`);
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

  // Switch Stream Server
  const handleSwitchServer = (newStream) => {
    setInternalStream(newStream);
    if (onSelectStream) {
      onSelectStream(newStream);
    }
    const info = parseStreamInfo(newStream);
    showOsd(`Switched to: ${info.serverName} (${info.resolution}${info.size ? ' • ' + info.size : ''})`);
    setShowServerMenu(false);
  };

  // Reset Video Filters
  const resetFilters = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    showOsd('Reset Video Colors (100%)');
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
    if (!rect || !video || !video.duration) return;
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pos * video.duration;
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

  // CSS Filter string for video element
  const filterStyle = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

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
              {directUrl ? (
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
                      const isCurrent = (s.url && s.url === stream.url) || idx === 0;

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
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v) {
                setDuration(v.duration || 0);
                v.muted = isMuted;
                v.volume = isMuted ? 0 : volume;
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

        {/* Live Resource Scanner Overlay */}
        {isScanning && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#070b14]/95 p-6 backdrop-blur-xl animate-fadeIn text-center">
            <div className="relative mb-5">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin" />
              <div className="absolute inset-0 grid place-items-center text-xl sm:text-2xl animate-pulse">
                ⚡
              </div>
            </div>
            <h2 className="text-sm sm:text-base md:text-lg font-black text-white tracking-wide">
              Scanning Live Streaming Sources...
            </h2>
            <p className="mt-2 text-xs text-amber-300 font-semibold animate-pulse max-w-md">
              Hunting live streams & size details across MovieLinkBD (BDIX), HDHub4u, CineFreak, PenguPlay, Sootio...
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-md">
              <span className="rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-3 py-1 border border-emerald-500/30">
                🇧🇩 MovieLinkBD BDIX
              </span>
              <span className="rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold px-3 py-1 border border-amber-500/30">
                ⚡ HDHub4u (HubCloud)
              </span>
              <span className="rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold px-3 py-1 border border-blue-500/30">
                🎬 CineFreak & UHD
              </span>
              <span className="rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-3 py-1 border border-indigo-500/30">
                🐧 PenguPlay & Sootio
              </span>
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
                {allStreams.length > 1 && (
                  <button
                    onClick={() => {
                      const curIdx = allStreams.findIndex((s) => s.url === stream.url);
                      const nextStream = allStreams[(curIdx + 1) % allStreams.length];
                      setError('');
                      if (onSelectStream) onSelectStream(nextStream);
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
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-black hover:bg-amber-400 transition"
                >
                  Open in Desktop PotPlayer
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

              <div className="flex items-center gap-1.5 w-16 sm:w-24" onKeyDown={(e) => e.stopPropagation()}>
                <input
                  type="range"
                  min="0"
                  max="1"
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
                <span className="text-[10px] font-mono text-white/70 w-7">
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
                <div className="absolute right-0 bottom-full mb-2 w-72 rounded-2xl bg-[#0e1424]/95 backdrop-blur-2xl border border-amber-400/40 shadow-2xl p-4 z-50 animate-fadeIn text-xs text-white">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                    <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                      Video Equalizer
                    </span>
                    <button
                      onClick={resetFilters}
                      title="Reset all to 100% (W)"
                      className="text-[10px] text-white/60 hover:text-white font-mono underline"
                    >
                      Reset (W)
                    </button>
                  </div>

                  <div className="space-y-3">
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
                        onChange={(e) => setBrightness(Number(e.target.value))}
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
                        onChange={(e) => setContrast(Number(e.target.value))}
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
                        onChange={(e) => setSaturation(Number(e.target.value))}
                        className="w-full accent-amber-400"
                      />
                    </div>

                    {/* Quick Presets */}
                    <div className="grid grid-cols-4 gap-1 pt-1 text-[10px] font-bold">
                      <button
                        onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); }}
                        className="py-1 rounded bg-white/10 hover:bg-white/20"
                      >
                        Normal
                      </button>
                      <button
                        onClick={() => { setBrightness(110); setContrast(120); setSaturation(130); }}
                        className="py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30"
                      >
                        Vivid
                      </button>
                      <button
                        onClick={() => { setBrightness(95); setContrast(115); setSaturation(105); }}
                        className="py-1 rounded bg-white/10 hover:bg-white/20"
                      >
                        Cinema
                      </button>
                      <button
                        onClick={() => { setBrightness(100); setContrast(120); setSaturation(0); }}
                        className="py-1 rounded bg-white/10 hover:bg-white/20"
                      >
                        B&W
                      </button>
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
                title="Select Audio Track (Language)"
                className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition flex items-center gap-1 ${
                  showAudioMenu
                    ? 'bg-blue-600 text-white border-blue-400'
                    : 'bg-white/10 text-white/80 hover:bg-white/20 border-white/15'
                }`}
              >
                <span>🎙 Audio</span>
                {audioTracks.length > 0 && (
                  <span className="rounded bg-black/40 px-1 py-0.2 text-[9px] text-blue-300 font-mono">
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
                      <div className="px-2 py-1.5 text-[11px] text-white/60 bg-white/5 rounded-lg">
                        Direct Stream Track Active
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
                    onChange={(e) => setBrightness(Number(e.target.value))}
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
                    onChange={(e) => setContrast(Number(e.target.value))}
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
                    onChange={(e) => setSaturation(Number(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={resetFilters}
                    className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 font-bold text-white transition"
                  >
                    Reset Colors (W)
                  </button>
                  <button
                    onClick={captureSnapshot}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 font-bold transition"
                  >
                    Capture Snapshot (S)
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="space-y-3">
                <div className="flex justify-between text-white/70 mb-1">
                  <span>Native Volume</span>
                  <span className="font-mono text-amber-300 font-bold">{Math.round(volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full accent-amber-400"
                />

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
