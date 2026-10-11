const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

app.commandLine.appendSwitch('force-device-scale-factor', '1');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'promo/export');
const STAGE = path.join(OUT, 'promo_video_stage.html');
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const SAMPLE_RATE = 44100;
const BPM = 124;
const FFMPEG = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';

const allJobs = [
  { variant: '24', duration: 24, output: 'QuickDocs_promo_combined_24s.mp4' },
  { variant: '30', duration: 30, output: 'QuickDocs_promo_30s.mp4' },
  { variant: '15', duration: 15, output: 'QuickDocs_promo_15s.mp4' }
];
const requestedVariants = (process.env.PROMO_VARIANTS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const jobs = requestedVariants.length
  ? allJobs.filter((job) => requestedVariants.includes(job.variant))
  : allJobs;

function frameName(dir, index) {
  return path.join(dir, `frame_${String(index).padStart(5, '0')}.jpg`);
}

function midiToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function seededNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function osc(phase, type) {
  if (type === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
  if (type === 'saw') return 2 * (phase / (Math.PI * 2) - Math.floor(phase / (Math.PI * 2) + .5));
  return Math.sin(phase);
}

function panGains(pan) {
  const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI * .25;
  return [Math.cos(angle), Math.sin(angle)];
}

function addStereo(left, right, index, value, pan = 0) {
  if (index < 0 || index >= left.length) return;
  const [lGain, rGain] = panGains(pan);
  left[index] += value * lGain;
  right[index] += value * rGain;
}

function addTone(left, right, start, duration, freq, amp, type = 'sine', pan = 0, attack = .012, release = .08) {
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(left.length, Math.floor((start + duration) * SAMPLE_RATE));
  const inc = (Math.PI * 2 * freq) / SAMPLE_RATE;
  let phase = 0;

  for (let i = first; i < last; i++) {
    const t = (i - first) / SAMPLE_RATE;
    const a = attack <= 0 ? 1 : Math.min(1, t / attack);
    const r = release <= 0 ? 1 : Math.min(1, (duration - t) / release);
    const env = Math.max(0, Math.min(a, r));
    addStereo(left, right, i, osc(phase, type) * amp * env * env, pan);
    phase += inc;
  }
}

function addKick(left, right, start) {
  const duration = .42;
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(left.length, Math.floor((start + duration) * SAMPLE_RATE));
  let phase = 0;

  for (let i = first; i < last; i++) {
    const t = (i - first) / SAMPLE_RATE;
    const sweep = 118 * Math.pow(38 / 118, t / duration);
    phase += (Math.PI * 2 * sweep) / SAMPLE_RATE;
    const env = Math.exp(-t * 8.5);
    const click = t < .006 ? (1 - t / .006) * .24 : 0;
    addStereo(left, right, i, (Math.sin(phase) + click) * env * .56, 0);
  }
}

function addSnare(left, right, start, noise) {
  const duration = .18;
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(left.length, Math.floor((start + duration) * SAMPLE_RATE));

  for (let i = first; i < last; i++) {
    const t = (i - first) / SAMPLE_RATE;
    const env = Math.exp(-t * 17) * (1 - t / duration);
    const tone = Math.sin(Math.PI * 2 * 190 * t) * .26;
    addStereo(left, right, i, (noise() * .74 + tone) * env * .28, .08);
  }
}

function addHat(left, right, start, noise, amp) {
  const duration = .055;
  const first = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const last = Math.min(left.length, Math.floor((start + duration) * SAMPLE_RATE));

  for (let i = first; i < last; i++) {
    const t = (i - first) / SAMPLE_RATE;
    const env = Math.exp(-t * 65);
    const shimmer = Math.sin(Math.PI * 2 * 8500 * t) * .08;
    addStereo(left, right, i, (noise() + shimmer) * env * amp, .38);
  }
}

function addPad(left, right, start, duration, notes) {
  notes.forEach((note, index) => {
    addTone(left, right, start, duration, midiToFreq(note), .026, 'triangle', (index - 1.5) * .22, .35, .7);
  });
}

function writeWav(outputPath, left, right, duration) {
  const sampleCount = Math.floor(duration * SAMPLE_RATE);
  const dataSize = sampleCount * 2 * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2 * 2, 28);
  buffer.writeUInt16LE(2 * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let peak = 0;
  for (let i = 0; i < sampleCount; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }

  const gain = peak > 0 ? Math.min(1.5, .92 / peak) : 1;
  let offset = 44;
  for (let i = 0; i < sampleCount; i++) {
    const t = i / SAMPLE_RATE;
    const fade = Math.min(1, t / .45, (duration - t) / .7);
    const l = Math.max(-1, Math.min(1, Math.tanh(left[i] * gain * 1.12) * .86 * fade));
    const r = Math.max(-1, Math.min(1, Math.tanh(right[i] * gain * 1.12) * .86 * fade));
    buffer.writeInt16LE(Math.round(l * 32767), offset);
    buffer.writeInt16LE(Math.round(r * 32767), offset + 2);
    offset += 4;
  }

  fs.writeFileSync(outputPath, buffer);
}

function generateMusic(job) {
  const sampleCount = Math.ceil(job.duration * SAMPLE_RATE);
  const left = new Float32Array(sampleCount);
  const right = new Float32Array(sampleCount);
  const noise = seededNoise(job.variant === '15' ? 15015 : 30030);
  const beat = 60 / BPM;
  const bar = beat * 4;
  const chords = [
    { root: 48, notes: [60, 64, 67, 72] },
    { root: 43, notes: [59, 62, 67, 71] },
    { root: 45, notes: [57, 60, 64, 69] },
    { root: 41, notes: [57, 60, 65, 69] }
  ];
  const arp = [0, 1, 2, 3, 2, 1, 0, 2];

  for (let barIndex = 0; barIndex * bar < job.duration + bar; barIndex++) {
    const barStart = barIndex * bar;
    const chord = chords[barIndex % chords.length];
    addPad(left, right, barStart, Math.min(bar * 1.12, Math.max(0, job.duration - barStart)), chord.notes);

    for (let beatIndex = 0; beatIndex < 4; beatIndex++) {
      const t = barStart + beatIndex * beat;
      if (t >= job.duration) continue;
      addKick(left, right, t);
      addTone(left, right, t, beat * .52, midiToFreq(chord.root + (beatIndex % 2 === 0 ? 0 : 12)), .075, 'triangle', -.12, .006, .1);
      if (beatIndex === 1 || beatIndex === 3) addSnare(left, right, t, noise);
    }

    for (let step = 0; step < 8; step++) {
      const t = barStart + step * beat * .5;
      if (t >= job.duration) continue;
      const octaveLift = step === 3 || step === 7 ? 12 : 0;
      addTone(left, right, t, beat * .32, midiToFreq(chord.notes[arp[step]] + octaveLift), .034, 'triangle', .24, .01, .09);
    }
  }

  for (let step = 0, t = 0; t < job.duration; step++, t += beat * .5) {
    addHat(left, right, t, noise, step % 2 === 0 ? .034 : .022);
  }

  const outputPath = path.join(OUT, `QuickDocs_music_${job.variant}s.wav`);
  writeWav(outputPath, left, right, job.duration);
  console.log(`Wrote ${outputPath}`);
  return outputPath;
}

function getAudioInput(job) {
  const referenceAudio = process.env.QUICKDOCS_PROMO_AUDIO;
  if (job.variant === '24' && referenceAudio && fs.existsSync(referenceAudio)) {
    console.log(`Using reference audio ${referenceAudio}`);
    return { path: referenceAudio, filter: 'volume=20dB,alimiter=limit=0.89' };
  }
  return { path: generateMusic(job), filter: null };
}

async function setTime(win, t) {
  await win.webContents.executeJavaScript(`
    window.__setPromoTime(${JSON.stringify(t)});
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  `, true);
}

async function renderFrames(win, job, frameDir) {
  const total = Math.round(job.duration * FPS);
  for (let i = 0; i < total; i++) {
    await setTime(win, i / FPS);
    let image = await win.webContents.capturePage({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
    const size = image.getSize();
    if (size.width !== WIDTH || size.height !== HEIGHT) {
      image = image.resize({ width: WIDTH, height: HEIGHT, quality: 'best' });
    }
    fs.writeFileSync(frameName(frameDir, i), image.toJPEG(92));
    if (i % FPS === 0) console.log(`${job.output}: rendered ${i / FPS}s / ${job.duration}s`);
  }
}

function runFfmpeg(args, label) {
  const result = spawnSync(FFMPEG, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg failed while ${label}`);
}

function encode(job, frameDir) {
  const outputPath = path.join(OUT, job.output);
  const silentPath = path.join(OUT, `.silent_${job.variant}s.mp4`);
  const audioInput = getAudioInput(job);

  runFfmpeg([
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(frameDir, 'frame_%05d.jpg'),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    silentPath
  ], `encoding silent video for ${job.output}`);

  runFfmpeg([
    '-y',
    '-i', silentPath,
    '-i', audioInput.path,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    ...(audioInput.filter ? ['-filter:a', audioInput.filter] : []),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-ar', '44100',
    '-shortest',
    '-movflags', '+faststart',
    outputPath
  ], `muxing audio for ${job.output}`);

  fs.rmSync(silentPath, { force: true });
  return outputPath;
}

async function renderJob(win, job) {
  const frameDir = path.join(OUT, `.frames_${job.variant}s`);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  await win.loadFile(STAGE, { query: { variant: job.variant } });
  await setTime(win, 0);
  await renderFrames(win, job, frameDir);
  const outputPath = encode(job, frameDir);
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(`Wrote ${outputPath}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: '#07122f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  for (const job of jobs) await renderJob(win, job);
  win.destroy();
  app.quit();
}

app.whenReady().then(main).catch((error) => {
  console.error(error);
  app.quit();
});
