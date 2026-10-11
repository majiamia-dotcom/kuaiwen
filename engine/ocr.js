// OCR 模块（可选）：把扫描版 PDF 逐页渲染成图片，再用 tesseract.js 识别中文+英文。
// 语言包必须来自随安装包分发的 resources/langs/，不允许静默联网下载。
// 进度通过 tesseract.js 的 logger 实时回报。
const fs = require('fs');
const path = require('path');
const os = require('os');

const TESS_DIR = path.join(os.homedir(), '.docsearch_cache', 'tessdata');
// 内置语言包目录（打进 resources/langs/）。
// tesseract.js 在 Node 下 langPath 为本地目录时直接 fs 读 <lang>.traineddata.gz（见其 worker-script/index.js）。
function bundledLangDir() {
  const cands = [];
  if (process.resourcesPath) cands.push(path.join(process.resourcesPath, 'langs')); // 打包：resources/langs
  cands.push(path.join(__dirname, '..', '..', 'langs')); // 打包兜底：app.asar.unpacked/engine → resources/langs
  cands.push(path.join(__dirname, '..', 'langs'));        // 开发态：项目根/langs
  for (const d of cands) {
    try { if (fs.existsSync(path.join(d, 'chi_sim.traineddata.gz'))) return d; } catch {}
  }
  return null;
}

// 把 tesseract 的英文状态翻译成中文
function zhStatus(s) {
  if (!s) return '';
  if (s.indexOf('downloading') >= 0) return '下载语言包（首次，约15-20MB）';
  const map = {
    'loading tesseract core': '加载识别核心',
    'initializing tesseract': '初始化识别核心',
    'initialized tesseract': '识别核心就绪',
    'loading language traineddata': '加载语言包（首次较慢，请稍候）',
    'loading language traineddata (from cache)': '加载语言包',
    'loaded language traineddata': '语言包就绪',
    'initializing api': '初始化识别引擎',
    'initialized api': '识别引擎就绪',
    'recognizing text': '识别文字中'
  };
  return map[s] || s;
}

let _worker = null;
async function getWorker(onLog) {
  if (_worker) return _worker;
  fs.mkdirSync(TESS_DIR, { recursive: true });
  const { createWorker } = require('tesseract.js');
  const localDir = bundledLangDir();
  if (!localDir) throw new Error('缺少离线 OCR 语言包，请重新安装完整版本');
  _worker = await createWorker('chi_sim+eng', 1, {
    langPath: localDir,
    cachePath: TESS_DIR,     // 解压后缓存到本地，之后离线
    logger: (m) => {
      if (!onLog || !m || !m.status) return;
      const pct = (typeof m.progress === 'number' && m.progress > 0 && m.progress < 1)
        ? ` ${Math.floor(m.progress * 100)}%` : '';
      onLog(`扫描识别：${zhStatus(m.status)}${pct}`);
    }
  });
  return _worker;
}

// 去掉中文字符/中文标点之间的多余空格（Tesseract 会在每个汉字间插空格，
// 这不仅难看，还会让"张婷婷"被存成"张 婷 婷"导致搜不到）。英文、数字间空格保留。
function dedupeCJKSpaces(s) {
  const C = '\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef';
  return (s || '').replace(new RegExp('([' + C + ']) +(?=[' + C + '])', 'g'), '$1');
}

function makeCanvasFactory(createCanvas) {
  return {
    create(w, h) { const canvas = createCanvas(Math.ceil(w), Math.ceil(h)); return { canvas, context: canvas.getContext('2d') }; },
    reset(cc, w, h) { cc.canvas.width = Math.ceil(w); cc.canvas.height = Math.ceil(h); },
    destroy(cc) { cc.canvas.width = 0; cc.canvas.height = 0; cc.canvas = null; cc.context = null; }
  };
}

async function ocrPdfPages(filePath, requestedPages, onLog, maxPages = 30) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = require('@napi-rs/canvas');
  const canvasFactory = makeCanvasFactory(createCanvas);

  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false, canvasFactory });
  const doc = await loadingTask.promise;
  const worker = await getWorker(onLog);

  const pages = (Array.isArray(requestedPages) ? [...new Set(requestedPages)] : Array.from({ length: doc.numPages }, (_, i) => i + 1))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= doc.numPages)
    .slice(0, maxPages);
  const out = new Map();
  for (let j = 0; j < pages.length; j++) {
    const pageNo = pages[j];
    onLog && onLog(`OCR 识别 ${path.basename(filePath)} 第 ${j + 1}/${pages.length} 页（原第 ${pageNo} 页）`);
    const page = await doc.getPage(pageNo);
    const viewport = page.getViewport({ scale: 2 });
    const cc = canvasFactory.create(viewport.width, viewport.height);
    await page.render({ canvasContext: cc.context, viewport, canvasFactory }).promise;
    const png = cc.canvas.toBuffer('image/png');
    canvasFactory.destroy(cc);
    const { data: { text } } = await worker.recognize(png);
    out.set(pageNo, dedupeCJKSpaces(text));
    page.cleanup();
  }
  if (typeof doc.destroy === 'function') await doc.destroy();
  else if (typeof loadingTask.destroy === 'function') await loadingTask.destroy();
  return out;
}

async function ocrPdf(filePath, onLog, maxPages = 30) {
  const pages = await ocrPdfPages(filePath, null, onLog, maxPages);
  return [...pages.values()].join('\n');
}

async function ocrImage(filePath, onLog) {
  const worker = await getWorker(onLog);
  onLog && onLog(`OCR 识别图片：${path.basename(filePath)}`);
  const { data: { text } } = await worker.recognize(fs.readFileSync(filePath));
  return dedupeCJKSpaces(text || '');
}

module.exports = { ocrPdf, ocrPdfPages, ocrImage };
