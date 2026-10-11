const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('force-device-scale-factor', '1');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'promo/export');
const HTML = path.join(OUT, 'blue_concept_prototype.html');

const shots = [
  { fileName: 'intro_01_search_box.png', scene: 'search', width: 1920, height: 1080 },
  { fileName: 'intro_02_keyword.png', scene: 'keyword', width: 1920, height: 1080 },
  { fileName: 'intro_03_files.png', scene: 'files', width: 1920, height: 1080 },
  { fileName: 'outro_01_logo.png', scene: 'logo', width: 1920, height: 1080 },
  { fileName: 'outro_02_slogan.png', scene: 'slogan', width: 1920, height: 1080 },
  { fileName: 'QuickDocs_cover_moments_16x9.png', scene: 'cover', width: 1920, height: 1080 },
  { fileName: 'QuickDocs_cover_moments_square.png', scene: 'cover', format: 'square', width: 1080, height: 1080 }
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: '#0b46c7',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  for (const shot of shots) {
    const { fileName, scene, format = 'landscape', width, height } = shot;
    win.setContentSize(width, height);
    await win.loadFile(HTML, { query: { scene, format } });
    await wait(500);
    let image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
    const size = image.getSize();
    if (size.width !== width || size.height !== height) {
      image = image.resize({ width, height, quality: 'best' });
    }
    fs.writeFileSync(path.join(OUT, fileName), image.toPNG());
    console.log(`Wrote ${fileName}`);
  }

  win.destroy();
  app.quit();
}

app.whenReady().then(main).catch((error) => {
  console.error(error);
  app.quit();
});
