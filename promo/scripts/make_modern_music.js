// 生成「现代 / 活泼 / 有节奏感」的纯合成背景音乐（无版权、离线）。
// 用法：node make_modern_music.js <输出wav> <时长秒>
// 风格：128 BPM，four-on-the-floor 底鼓 + 拍掌 + 闭/开镲 + 明亮拨弦 arp + sidechain 泵感。
const fs = require('fs');

const OUT = process.argv[2] || 'modern_music.wav';
const DURATION = parseFloat(process.argv[3] || '24');
const SR = 44100;
const BPM = 128;
const beat = 60 / BPM;
const bar = beat * 4;

const N = Math.ceil(DURATION * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function noiseGen(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 0xffffffff) * 2 - 1; };
}
function osc(ph, type) {
  if (type === 'tri') return (2 / Math.PI) * Math.asin(Math.sin(ph));
  if (type === 'saw') return 2 * (ph / (2 * Math.PI) - Math.floor(ph / (2 * Math.PI) + .5));
  if (type === 'sq') return Math.sin(ph) >= 0 ? 1 : -1;
  return Math.sin(ph);
}
function pan(p) { const a = (Math.max(-1, Math.min(1, p)) + 1) * Math.PI * .25; return [Math.cos(a), Math.sin(a)]; }
function add(i, v, p) { if (i < 0 || i >= N) return; const [lg, rg] = pan(p); L[i] += v * lg; R[i] += v * rg; }

// sidechain 泵感：每拍开头猛压、随后回弹（现代 EDM/house 标志性律动）
function duck(t) {
  const ph = (t / beat) % 1;
  return 0.32 + 0.68 * Math.pow(ph, 0.55);
}

function tone(start, dur, freq, amp, type, p = 0, attack = .008, release = .06, sidechain = false) {
  const i0 = Math.max(0, Math.floor(start * SR));
  const i1 = Math.min(N, Math.floor((start + dur) * SR));
  const inc = (2 * Math.PI * freq) / SR;
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const a = attack <= 0 ? 1 : Math.min(1, t / attack);
    const r = release <= 0 ? 1 : Math.min(1, (dur - t) / release);
    const env = Math.max(0, Math.min(a, r));
    let v = osc(ph, type) * amp * env * env;
    if (sidechain) v *= duck(i / SR);
    add(i, v, p);
    ph += inc;
  }
}

function kick(start) {
  const dur = .4;
  const i0 = Math.max(0, Math.floor(start * SR));
  const i1 = Math.min(N, Math.floor((start + dur) * SR));
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const sweep = 130 * Math.pow(42 / 130, t / dur);
    ph += (2 * Math.PI * sweep) / SR;
    const env = Math.exp(-t * 9);
    const click = t < .005 ? (1 - t / .005) * .3 : 0;
    add(i, (Math.sin(ph) + click) * env * .62, 0);
  }
}

function clap(start, noise) {
  const dur = .2;
  const i0 = Math.max(0, Math.floor(start * SR));
  const i1 = Math.min(N, Math.floor((start + dur) * SR));
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    // 三连闪 + 尾响，模拟拍掌
    const burst = (t < .01 ? 1 : t < .02 ? .8 : t < .03 ? .6 : Math.exp(-(t - .03) * 24));
    const env = burst * (1 - t / dur);
    const band = Math.sin(2 * Math.PI * 1600 * t);
    add(i, (noise() * .8 + band * .15) * env * .3, .05);
  }
}

function hat(start, noise, amp, open) {
  const dur = open ? .14 : .045;
  const i0 = Math.max(0, Math.floor(start * SR));
  const i1 = Math.min(N, Math.floor((start + dur) * SR));
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const env = Math.exp(-t * (open ? 22 : 60));
    const shim = Math.sin(2 * Math.PI * 9000 * t) * .1;
    add(i, (noise() + shim) * env * amp, .42);
  }
}

function riser(start, dur) {
  const noise = noiseGen(999);
  const i0 = Math.max(0, Math.floor(start * SR));
  const i1 = Math.min(N, Math.floor((start + dur) * SR));
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / SR;
    const prog = t / dur;
    const freq = 300 + 2600 * prog * prog;
    ph += (2 * Math.PI * freq) / SR;
    const env = prog * prog * .12;
    add(i, (Math.sin(ph) * .5 + noise() * .5) * env, 0);
  }
}

const noise = noiseGen(2026);
// I–V–vi–IV（明亮流行进行），bass 根音 + 三和弦
const chords = [
  { root: 45, notes: [57, 60, 64, 69] }, // Am
  { root: 41, notes: [57, 60, 65, 69] }, // F
  { root: 48, notes: [60, 64, 67, 72] }, // C
  { root: 43, notes: [59, 62, 67, 71] }, // G
];
const arpPat = [0, 2, 1, 3, 2, 3, 1, 2]; // 8 个 8 分音符
const totalBars = Math.ceil(DURATION / bar) + 1;

for (let b = 0; b < totalBars; b++) {
  const barStart = b * bar;
  if (barStart >= DURATION) break;
  const chord = chords[b % chords.length];

  // 铺底 pad（受 sidechain 泵感影响）
  chord.notes.forEach((n, k) => tone(barStart, bar * 1.02, midi(n), .03, 'tri', (k - 1.5) * .25, .25, .5, true));

  // 鼓组：每拍底鼓，2/4 拍掌
  for (let q = 0; q < 4; q++) {
    const t = barStart + q * beat;
    if (t >= DURATION) continue;
    kick(t);
    if (q === 1 || q === 3) clap(t, noise);
    // bass：每拍根音 + 反拍切分（sidechain）
    tone(t, beat * .46, midi(chord.root), .12, 'saw', -.1, .006, .08, true);
    tone(t + beat * .5, beat * .3, midi(chord.root + 12), .06, 'saw', -.1, .006, .07, true);
  }

  // 镲：8 分闭镲，反拍开镲
  for (let s = 0; s < 8; s++) {
    const t = barStart + s * beat * .5;
    if (t >= DURATION) continue;
    const open = (s % 2 === 1);
    hat(t, noise, open ? .03 : .05, open);
  }

  // 明亮拨弦 arp（16 分律动的 8 分骨架）
  for (let s = 0; s < 8; s++) {
    const t = barStart + s * beat * .5;
    if (t >= DURATION) continue;
    const lift = (s === 3 || s === 7) ? 12 : 0;
    tone(t, beat * .42, midi(chord.notes[arpPat[s]] + 12 + lift), .05, 'sq', .28, .004, .09);
  }
}

// 开头一个 riser 带入
riser(0, bar * 0.9);

// 归一化 + 软限幅 + 首尾淡入淡出
function write() {
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = peak > 0 ? Math.min(1.6, .95 / peak) : 1;
  const dataSize = N * 4;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / .2, (DURATION - t) / 1.0);
    const l = Math.tanh(L[i] * gain * 1.15) * .9 * fade;
    const r = Math.tanh(R[i] * gain * 1.15) * .9 * fade;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(l * 32767))), off);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(r * 32767))), off + 2);
    off += 4;
  }
  fs.writeFileSync(OUT, buf);
  console.log(`Wrote ${OUT}  (${DURATION}s, ${BPM} BPM)`);
}
write();
