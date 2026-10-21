// Shared stream details parser used across VideoPlayer, StreamModal, and Detail pages

export function parseStreamDetails(stream) {
  if (!stream) {
    return {
      quality: 'HD',
      resolution: 'HD',
      size: null,
      sound: null,
      language: null,
      serverName: 'Direct',
      isDual: false,
      fullText: ''
    };
  }

  const fullText = `${stream.name || ''} ${stream.title || ''} ${stream.description || ''} ${stream.behaviorHints?.filename || ''}`.trim();

  // 1. Resolution / Quality
  let quality = stream.quality;
  if (!quality) {
    const qMatch = fullText.match(/(4K|2160p|1440p|1080p|720p|480p|360p|UHD|FHD|HD\b|SD\b)/i);
    quality = qMatch ? qMatch[1].toUpperCase() : 'HD';
  }

  // Normalize resolution string for UI consistency
  let resolution = quality;
  if (/2160p|4k|uhd/i.test(quality)) resolution = '4K UHD';
  else if (/1080p|fhd/i.test(quality)) resolution = '1080p FHD';
  else if (/720p|hd\b/i.test(quality)) resolution = '720p HD';
  else if (/480p|sd/i.test(quality)) resolution = '480p SD';

  // 2. File Size
  let size = stream.size;
  if (!size) {
    const sizeMatch = fullText.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|GiB|MiB))/i);
    size = sizeMatch ? sizeMatch[1].toUpperCase() : null;
  }

  // 3. Audio / Codec
  let sound = stream.sound;
  if (!sound) {
    const soundMatch = fullText.match(/(DDP5\.1|Atmos|Dolby\s*Digital|5\.1|7\.1|AAC|DTS-HD|DTS|Dolby)/i);
    sound = soundMatch ? soundMatch[1] : null;
  }

  // 4. Language / Audio type
  let language = stream.language;
  if (!language) {
    if (/dual\s*audio/i.test(fullText)) language = 'Dual Audio';
    else if (/multi\s*(?:audio|lang)?/i.test(fullText)) language = 'Multi Audio';
    else if (/hindi\s*\+\s*eng/i.test(fullText)) language = 'Hindi + Eng';
    else if (/bengali|bangla/i.test(fullText)) language = 'Bengali';
    else if (/hindi/i.test(fullText)) language = 'Hindi';
    else if (/english/i.test(fullText)) language = 'English';
  }
  const isDual = Boolean(language && /dual|multi|hindi\s*\+/i.test(language));

  // 5. Server Name
  let serverName = stream.serverName;
  if (!serverName) {
    serverName = stream.addonName || stream.name?.split('\n')[0] || 'Stream Server';
    if (serverName.includes('[CloudStream]')) {
      serverName = serverName.replace('[CloudStream] ', '').trim();
    }
  }

  return {
    quality,
    resolution,
    size,
    sound,
    language,
    serverName,
    isDual,
    fullText
  };
}
