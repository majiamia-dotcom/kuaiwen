const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'promo/export');
const STAGE = path.join(OUT, 'final_sequence_intro.html');
const WORK = path.join(OUT, '.final_sequence_work');
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const FFMPEG = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';
const INTRO_DURATION = 7.6;
const MID_START = 4;
const MID_DURATION = 17;
const TAIL_START = 13;
const TAIL_DURATION = 2;
const FADE = .55;
const FINAL_DURATION = INTRO_DURATION + MID_DURATION + TAIL_DURATION - FADE * 2;

const referenceVideo = process.env.QUICKDOCS_REFERENCE_VIDEO;
const tailVideo = process.env.QUICKDOCS_TAIL_VIDEO || path.join(OUT, 'QuickDocs_promo_15s.mp4');
const outputPath = path.join(OUT, 'QuickDocs_promo_final_smooth_26s.mp4');

function assertFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath || '(empty)'}`);
  }
}

function frameName(index) {
  return path.join(WORK, 'frames', `frame_${String(index).padStart(5, '0')}.jpg`);
}

function run(command, args, label) {
  console.log(`\n${label}`);
  console.log([command, ...args.map((arg) => JSON.stringify(arg))].join(' '));
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${label} failed`);
}

async function waitForStage(win) {
  await win.webContents.executeJavaScript(`
    Promise.all([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      ...Array.from(document.images).map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', reject, { once: true });
        });
      })
    ]);
  `, true);
}

async function setTime(win, t) {
  await win.webContents.executeJavaScript(`
    window.__setFinalIntroTime(${JSON.stringify(t)});
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  `, true);
}

async function renderIntroFrames(win) {
  const framesDir = path.join(WORK, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  await win.loadFile(STAGE);
  await waitForStage(win);

  const total = Math.round(INTRO_DURATION * FPS);
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    await setTime(win, t);
    let image = await win.webContents.capturePage({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
    const size = image.getSize();
    if (size.width !== WIDTH || size.height !== HEIGHT) {
      image = image.resize({ width: WIDTH, height: HEIGHT, quality: 'best' });
    }
    fs.writeFileSync(frameName(i), image.toJPEG(93));
    if (i % FPS === 0) console.log(`intro rendered ${Math.round(t)}s / ${INTRO_DURATION}s`);
  }
}

function encodeIntro() {
  const introPath = path.join(WORK, 'intro.mp4');
  run(FFMPEG, [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(WORK, 'frames', 'frame_%05d.jpg'),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    introPath
  ], 'Encoding custom intro');
  return introPath;
}

function cutMiddle() {
  const middlePath = path.join(WORK, 'middle_reference_4_21.mp4');
  run(FFMPEG, [
    '-y',
    '-i', referenceVideo,
    '-ss', String(MID_START),
    '-t', String(MID_DURATION),
    '-vf', [
      `fps=${FPS}`,
      'scale=1920:1080:force_original_aspect_ratio=increase',
      'crop=1920:1080',
      'eq=brightness=-0.02:contrast=1.055:saturation=1.06',
      'format=yuv420p',
      'setpts=PTS-STARTPTS'
    ].join(','),
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    middlePath
  ], 'Cutting reference video 4s-21s');
  return middlePath;
}

function cutTail() {
  const tailPath = path.join(WORK, 'tail_15s_13_15.mp4');
  run(FFMPEG, [
    '-y',
    '-i', tailVideo,
    '-ss', String(TAIL_START),
    '-t', String(TAIL_DURATION),
    '-vf', [
      `fps=${FPS}`,
      'scale=1920:1080:force_original_aspect_ratio=increase',
      'crop=1920:1080',
      'format=yuv420p',
      'setpts=PTS-STARTPTS'
    ].join(','),
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    tailPath
  ], 'Cutting current 15s video 13s-15s');
  return tailPath;
}

function joinVisual(introPath, middlePath, tailPath) {
  const visualPath = path.join(WORK, 'visual_joined.mp4');
  const firstOffset = INTRO_DURATION - FADE;
  const secondOffset = INTRO_DURATION + MID_DURATION - FADE * 2;
  const filter = [
    '[0:v]settb=AVTB[v0]',
    '[1:v]settb=AVTB[v1]',
    '[2:v]settb=AVTB[v2]',
    `[v0][v1]xfade=transition=fade:duration=${FADE}:offset=${firstOffset.toFixed(2)}[v01]`,
    `[v01][v2]xfade=transition=fade:duration=${FADE}:offset=${secondOffset.toFixed(2)},format=yuv420p[v]`
  ].join(';');

  run(FFMPEG, [
    '-y',
    '-i', introPath,
    '-i', middlePath,
    '-i', tailPath,
    '-filter_complex', filter,
    '-map', '[v]',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    visualPath
  ], 'Joining visual sequence with smooth fades');
  return visualPath;
}

function muxAudio(visualPath) {
  run(FFMPEG, [
    '-y',
    '-stream_loop', '-1',
    '-i', referenceVideo,
    '-i', visualPath,
    '-map', '1:v:0',
    '-map', '0:a:0',
    '-filter:a', `volume=20dB,alimiter=limit=0.89,afade=t=out:st=${(FINAL_DURATION - .8).toFixed(2)}:d=0.8`,
    '-t', FINAL_DURATION.toFixed(2),
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-ar', '44100',
    '-movflags', '+faststart',
    outputPath
  ], 'Adding upbeat reference music bed');
}

async function main() {
  assertFile(referenceVideo, 'QUICKDOCS_REFERENCE_VIDEO');
  assertFile(tailVideo, 'QuickDocs tail video');
  assertFile(STAGE, 'Final intro stage');

  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await renderIntroFrames(win);
    const introPath = encodeIntro();
    const middlePath = cutMiddle();
    const tailPath = cutTail();
    const visualPath = joinVisual(introPath, middlePath, tailPath);
    muxAudio(visualPath);
    console.log(`\nWrote ${outputPath}`);
  } finally {
    win.destroy();
    fs.rmSync(WORK, { recursive: true, force: true });
  }
}

app.whenReady().then(main).then(() => app.quit()).catch((error) => {
  console.error(error);
  app.quit();
});
