/**
 * HLS Playlist Rewriter for My-Movie-House Proxy
 * Rewrites all variant, media rendition, encryption key, init segment, and sub-playlist URIs
 * so they are fetched through the proxy (/api/proxy/stream).
 * Keeps GROUP-ID, LANGUAGE, NAME, DEFAULT, AUTOSELECT and all metadata tags 100% intact.
 */

export function rewriteHlsManifest(manifestText, baseUrl, customHeaders = {}) {
  if (!manifestText || typeof manifestText !== 'string') return manifestText;
  if (!manifestText.includes('#EXTM3U')) return manifestText;

  const headersParam = Object.keys(customHeaders).length > 0
    ? `&headers=${encodeURIComponent(JSON.stringify(customHeaders))}`
    : '';

  const toProxiedUrl = (uri) => {
    if (!uri) return uri;
    const cleanUri = uri.trim();
    if (!cleanUri || cleanUri.startsWith('data:') || cleanUri.startsWith('/api/proxy/stream')) {
      return cleanUri;
    }
    let resolved;
    try {
      resolved = new URL(cleanUri, baseUrl).toString();
    } catch {
      return cleanUri;
    }
    return `/api/proxy/stream?url=${encodeURIComponent(resolved)}${headersParam}`;
  };

  const lines = manifestText.split(/\r?\n/);
  const rewrittenLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // 1. Attribute-based URIs in tags:
    // Examples:
    // #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="eng",URI="audio_eng.m3u8"
    // #EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key.bin",IV=0x...
    // #EXT-X-MAP:URI="init.mp4",BYTERANGE="1234@0"
    // #EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=...,URI="..."
    // #EXT-X-SESSION-DATA:...URI="..."
    if (trimmed.startsWith('#EXT')) {
      if (
        trimmed.startsWith('#EXT-X-MEDIA:') ||
        trimmed.startsWith('#EXT-X-KEY:') ||
        trimmed.startsWith('#EXT-X-MAP:') ||
        trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF:') ||
        trimmed.startsWith('#EXT-X-SESSION-DATA:') ||
        trimmed.startsWith('#EXT-X-PRELOAD-HINT:')
      ) {
        return line.replace(/URI=(["'])(.*?)\1/g, (_match, quote, uriVal) => {
          return `URI=${quote}${toProxiedUrl(uriVal)}${quote}`;
        });
      }
      return line;
    }

    // 2. Plain URI lines (variant playlists in master, media segments .ts/.m4s/.mp4 in media playlist)
    if (!trimmed.startsWith('#')) {
      return toProxiedUrl(trimmed);
    }

    return line;
  });

  return rewrittenLines.join('\n');
}
