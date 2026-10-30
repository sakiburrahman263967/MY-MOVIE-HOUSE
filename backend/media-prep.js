import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const jobs = new Map();
const queue = [];
let activeJobs = 0;
const MAX_CONCURRENT = 1;

function now() { return Date.now(); }

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return Array.from(jobs.values()).map(j => ({
    id: j.id,
    status: j.status,
    progress: j.progress,
    input: j.input,
    output: j.output,
    audioTracks: j.audioTracks,
    error: j.error,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt
  }));
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: now() });
  jobs.set(id, job);
}

function isSafeAudioCodec(codec = '') {
  const c = codec.toLowerCase();
  return ['aac','mp3','opus','vorbis','flac'].includes(c);
}

function isH264Codec(codec = '') {
  const c = codec.toLowerCase();
  return c.includes('h264') || c.includes('avc');
}

async function probeFile(filePath) {
  return new Promise((resolve) => {
    try {
      const args = ['-v','quiet','-print_format','json','-show_streams','-show_format', filePath];
      const proc = spawn('ffprobe', args, { timeout: 15000 });
      let out = '';
      proc.stdout.on('data', d => out += d.toString());
      const t = setTimeout(() => { try { proc.kill(); } catch {} }, 15000);
      proc.on('close', () => {
        clearTimeout(t);
        try {
          const json = JSON.parse(out || '{}');
          const streams = Array.isArray(json.streams) ? json.streams : [];
          const v = streams.find(s => s.codec_type === 'video') || {};
          const audioStreams = streams.filter(s => s.codec_type === 'audio').map((a, idx) => ({
            index: a.index,
            audioIdx: idx,
            codec: (a.codec_name || '').toLowerCase(),
            channels: a.channels || 2,
            language: a.tags?.language || a.tags?.LANGUAGE || '',
            title: a.tags?.title || a.tags?.TITLE || `Audio ${idx+1}`
          }));
          resolve({
            videoCodec: v.codec_name || '',
            audioTracks: audioStreams,
            duration: Number(json.format?.duration || 0),
            container: json.format?.format_name || ''
          });
        } catch {
          resolve({ videoCodec:'', audioTracks:[], duration:0, container:'' });
        }
      });
      proc.on('error', () => { clearTimeout(t); resolve({ videoCodec:'', audioTracks:[], duration:0, container:'' }); });
    } catch {
      resolve({ videoCodec:'', audioTracks:[], duration:0, container:'' });
    }
  });
}

function processNext() {
  if (activeJobs >= MAX_CONCURRENT) return;
  const job = queue.shift();
  if (!job) return;
  activeJobs++;
  runJob(job).finally(() => {
    activeJobs--;
    processNext();
  });
}

async function runJob(job) {
  updateJob(job.id, { status: 'probing', progress: 5 });
  const probe = await probeFile(job.inputPath);
  updateJob(job.id, { status: 'running', progress: 10, audioTracks: probe.audioTracks });

  const base = job.inputPath.replace(/\.[^/.]+$/, '');
  const outDir = base + '.webready';
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}

  const videoIsH264 = isH264Codec(probe.videoCodec);
  const args = ['-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1'];
  args.push('-i', job.inputPath);
  args.push('-map', '0:v:0');
  
  // Map all audio tracks
  for (let i = 0; i < probe.audioTracks.length; i++) {
    args.push('-map', `0:${probe.audioTracks[i].index}`);
  }
  
  // Video
  if (videoIsH264) {
    args.push('-c:v', 'copy');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p');
  }
  
  // Convert EVERY non-safe audio track to AAC, keep safe as copy? But ensure browser compatible - convert all to AAC for safety
  for (let i = 0; i < probe.audioTracks.length; i++) {
    args.push(`-c:a:${i}`, 'aac');
    args.push(`-b:a:${i}`, probe.audioTracks[i].channels >= 6 ? '384k' : '192k');
    if (probe.audioTracks[i].channels >= 2) {
      args.push(`-ac:${i}`, probe.audioTracks[i].channels >= 6 ? '6' : '2');
    }
    if (probe.audioTracks[i].language) {
      args.push(`-metadata:s:a:${i}`, `language=${probe.audioTracks[i].language}`);
    }
    if (probe.audioTracks[i].title) {
      args.push(`-metadata:s:a:${i}`, `title=${probe.audioTracks[i].title}`);
    }
  }
  
  // HLS output with separate renditions per audio track - use var_stream_map
  const varMap = [];
  varMap.push('v:0,name:video');
  for (let i = 0; i < probe.audioTracks.length; i++) {
    varMap.push(`a:${i},name:audio_${i}`);
  }
  
  args.push('-f', 'hls');
  args.push('-hls_time', '6');
  args.push('-hls_playlist_type', 'vod');
  args.push('-hls_segment_filename', path.join(outDir, 'segment_%v_%03d.ts'));
  args.push('-master_pl_name', 'master.m3u8');
  args.push('-var_stream_map', varMap.join(' '));
  args.push(path.join(outDir, 'stream_%v.m3u8'));
  
  updateJob(job.id, { status: 'transcoding', progress: 15 });
  
  const proc = spawn('ffmpeg', args);
  let lastProgress = 15;
  
  proc.stdout.on('data', (data) => {
    const str = data.toString();
    // Parse out_time_ms or progress
    const m = str.match(/out_time_ms=(\d+)/);
    if (m && probe.duration > 0) {
      const secs = parseInt(m[1], 10) / 1000000;
      const pct = Math.min(95, 15 + Math.floor((secs / probe.duration) * 80));
      if (pct > lastProgress) {
        lastProgress = pct;
        updateJob(job.id, { progress: pct });
      }
    }
  });
  
  proc.stderr.on('data', () => {});
  
  proc.on('close', (code) => {
    if (code === 0) {
      updateJob(job.id, { 
        status: 'done', 
        progress: 100,
        output: {
          type: 'hls',
          master: path.join(outDir, 'master.m3u8'),
          dir: outDir
        }
      });
    } else {
      updateJob(job.id, { status: 'failed', error: `ffmpeg exited with code ${code}` });
    }
  });
  
  proc.on('error', (err) => {
    updateJob(job.id, { status: 'failed', error: err.message });
  });
}

export function createPrepareJob(inputPath, options = {}) {
  const id = randomUUID();
  const job = {
    id,
    status: 'queued',
    progress: 0,
    input: inputPath,
    inputPath,
    output: null,
    audioTracks: [],
    error: null,
    createdAt: now(),
    updatedAt: now(),
    options
  };
  jobs.set(id, job);
  queue.push(job);
  processNext();
  return job;
}
