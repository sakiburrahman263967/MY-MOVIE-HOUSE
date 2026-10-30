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
    const cleanedText = fullText.replace(/~?[\d.]+\s*Mbps/gi, '');
    const sizeMatch = cleanedText.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|GiB|MiB))/i);
    size = sizeMatch ? sizeMatch[1].toUpperCase() : null;
  }

  // 3. Audio / Codec
  let sound = stream.sound;
  if (!sound) {
    const soundMatch = fullText.match(/(DDP5\.1|Atmos|Dolby\s*Digital|5\.1|7\.1|AAC|DTS-HD|DTS|Dolby)/i);
    sound = soundMatch ? soundMatch[1] : null;
  }

  // 4. Detailed Language & Multi-Audio Detection
  const audioLangs = [];
  const lowerText = fullText.toLowerCase();

  const langMap = [
    { name: 'Bangla', pattern: /\b(bangla|bengali|ben)\b/i },
    { name: 'Hindi', pattern: /\b(hindi|hin)\b/i },
    { name: 'English', pattern: /\b(english|eng)\b/i },
    { name: 'Tamil', pattern: /\b(tamil|tam)\b/i },
    { name: 'Telugu', pattern: /\b(telugu|tel)\b/i },
    { name: 'Malayalam', pattern: /\b(malayalam|mal)\b/i },
    { name: 'Kannada', pattern: /\b(kannada|kan)\b/i },
    { name: 'Urdu', pattern: /\b(urdu|urd)\b/i },
    { name: 'Korean', pattern: /\b(korean|kor)\b/i },
    { name: 'Japanese', pattern: /\b(japanese|jap|jpn)\b/i },
    { name: 'Spanish', pattern: /\b(spanish|spa|es)\b/i },
    { name: 'French', pattern: /\b(french|fre|fra)\b/i },
    { name: 'German', pattern: /\b(german|ger|deu)\b/i },
    { name: 'Arabic', pattern: /\b(arabic|ara)\b/i }
  ];

  for (const item of langMap) {
    if (item.pattern.test(fullText)) {
      audioLangs.push(item.name);
    }
  }

  const isDual = /\b(dual\s*audio|dual)\b/i.test(fullText) || audioLangs.length >= 2;
  const isMulti = /\b(multi\s*audio|multi\s*sub|multiaudio|multi)\b/i.test(fullText) || audioLangs.length > 2;
  const isDubbed = /\b(dubbed|dub)\b/i.test(fullText);

  let language = stream.language;
  if (!language) {
    if (isMulti) language = 'Multi Audio';
    else if (isDual) language = 'Dual Audio';
    else if (audioLangs.length > 0) language = audioLangs.join(', ');
    else language = 'Audio: unknown';
  }

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
    audioLangs,
    isDual,
    isMulti,
    isDubbed,
    serverName,
    fullText
  };
}
