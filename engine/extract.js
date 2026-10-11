// 文本抽取层：按扩展名分流。
// 支持：txt 系列 / Word / PDF / OFD / PowerPoint / Excel / 图片 OCR。
// OOXML（docx/pptx/xlsx）与 OFD 本质都是 zip 套 XML，用纯 JS 的 jszip 解开；pdf 用纯 JS 的 pdfjs。
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// 提前用 @napi-rs/canvas（免编译）注入 DOMMatrix/Path2D 等全局，
// 否则 pdfjs 会去加载需要编译的 node-canvas，导致 PDF 渲染（OCR 用）损坏。
try {
  const napi = require('@napi-rs/canvas');
  for (const k of ['DOMMatrix', 'Path2D', 'ImageData', 'DOMPoint']) {
    if (!globalThis[k] && napi[k]) globalThis[k] = napi[k];
  }
} catch {}

function extractTxt(p) {
  return fs.readFileSync(p, 'utf8');
}

// 去掉中文字符/中文标点之间的多余空格（pdf 抽取、OCR 都会产生这种空格，
// 不处理的话"杭 州"既难看又导致搜"杭州"搜不到）。英文、数字间空格保留。
function dedupeCJKSpaces(s) {
  const C = '\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef';
  // 只合并普通空格，保留换行和制表符作为自然段/页/表格边界。
  return (s || '').replace(new RegExp('([' + C + ']) +(?=[' + C + '])', 'g'), '$1');
}

// 全角字母/数字 → 半角（只动字母数字，不碰全角标点，保留中文 ，。等）。
// 中文学术 PDF 的摘要/参考文献常用全角拉丁数字（２０２２、Ｂｕｉｌｄ），统一成半角便于阅读与检索。
function toHalfWidthAlnum(s) {
  return (s || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

// 合并"被拆成碎片"的拉丁/数字串：PDF 拉开字距时 pdfjs 会把 "Build"/"DENG"/"2022" 抽成
// "B u i l d"/"DE NG"/"2 0 2 2"。这里合并“连续的 1~2 字符短碎片(被边界包住)”运行，
// 既能修复单字符与两字符碎片（DE NG→DENG、L YU→LYU），又基本不误伤正常多字符英文词
// （high quality、of the 中的长词≥3 不参与，保持原样）。
function dedupeLatinSpacing(s) {
  return (s || '').replace(/\b[A-Za-z0-9]{1,2}\b(?: +\b[A-Za-z0-9]{1,2}\b)+/g, (m) => m.replace(/ +/g, ''));
}

// 去掉"宽标点"(中文标点 + 全角标点)两侧的多余空格：PDF 拉开字距会变成
// "39 （ 5 ） ： 32 － 38 ． ［ J ］" 这种。只动标点周围（不含全角字母数字），不碰正常英文词间空格。
function dedupeWidePunctSpaces(s) {
  // 中文标点 U+3000–303F；全角标点 FF01–FF0F, FF1A–FF20, FF3B–FF40, FF5B–FF65（排除全角字母数字）
  const WP = '\\u3000-\\u303f\\uff01-\\uff0f\\uff1a-\\uff20\\uff3b-\\uff40\\uff5b-\\uff65';
  return (s || '').replace(new RegExp('[ \\t]*([' + WP + '])[ \\t]*', 'g'), '$1');
}

// PDF/OCR 文本统一清洗：全角→半角字母数字、合并拉开的拉丁串、去宽标点两侧空格、合并中文字间空格。
function normalizeExtracted(s) {
  return dedupeCJKSpaces(dedupeWidePunctSpaces(dedupeLatinSpacing(toHalfWidthAlnum(s))));
}

// 解码常见 XML 实体
function decodeEntities(s) {
  return (s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function extractDocx(p) {
  const zip = await JSZip.loadAsync(fs.readFileSync(p));
  const file = zip.file('word/document.xml');
  if (!file) return '';
  let xml = await file.async('string');
  xml = xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t');
  return decodeEntities(xml.replace(/<[^>]+>/g, ''));
}

// 抽取一段 OOXML 中所有可见文本节点。PowerPoint/Excel 的文本通常位于 <a:t>/<t> 中；
// 不依赖完整 XML DOM，既减小安装体积，也能容忍 Office 写出的不同命名空间前缀。
function textNodes(xml, localName = 't') {
  const out = [];
  const re = new RegExp('<(?:\\w+:)?' + localName + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?' + localName + '>', 'gi');
  let m;
  while ((m = re.exec(xml || ''))) out.push(decodeEntities(m[1].replace(/<[^>]+>/g, '')));
  return out;
}

function numberFromPath(name, stem) {
  const m = new RegExp(stem + '(\\d+)', 'i').exec(name);
  return m ? +m[1] : Number.MAX_SAFE_INTEGER;
}

// PowerPoint（OOXML）：按幻灯片顺序抽取标题、文本框、表格和 SmartArt 文字。
async function extractPptx(p) {
  const zip = await JSZip.loadAsync(fs.readFileSync(p));
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => numberFromPath(a, 'slide') - numberFromPath(b, 'slide'));
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const xml = await zip.file(names[i]).async('string');
    const lines = [];
    const paraRe = /<(?:\w+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?p>/gi;
    let m;
    while ((m = paraRe.exec(xml))) {
      const line = textNodes(m[1]).join('').trim();
      if (line) lines.push(line);
    }
    // 少数生成器不写 a:p；仍保留所有 a:t，避免整页漏掉。
    const text = lines.length ? lines.join('\n') : textNodes(xml).join(' ');
    if (text.trim()) out.push(`【第 ${i + 1} 页】\n${text}`);
  }
  return normalizeExtracted(out.join('\n'));
}

function xmlAttr(attrs, name) {
  const m = new RegExp('(?:^|\\s)' + name.replace(':', '\\:') + '="([^"]*)"', 'i').exec(attrs || '');
  return m ? decodeEntities(m[1]) : '';
}

// Excel（OOXML）：解析共享字符串和 inlineStr；数字、公式结果也进入索引。
async function extractXlsx(p) {
  const zip = await JSZip.loadAsync(fs.readFileSync(p));
  const shared = [];
  const sst = zip.file('xl/sharedStrings.xml');
  if (sst) {
    const xml = await sst.async('string');
    const re = /<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/gi;
    let m;
    while ((m = re.exec(xml))) shared.push(textNodes(m[1]).join(''));
  }

  const labels = new Map();
  const workbook = zip.file('xl/workbook.xml');
  const rels = zip.file('xl/_rels/workbook.xml.rels');
  if (workbook && rels) {
    const relTargets = new Map();
    const relXml = await rels.async('string');
    for (const m of relXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/gi)) {
      const id = xmlAttr(m[1], 'Id');
      let target = xmlAttr(m[1], 'Target').replace(/^\//, '');
      if (!target.startsWith('xl/')) target = 'xl/' + target.replace(/^\.\//, '');
      if (id) relTargets.set(id, target);
    }
    const wbXml = await workbook.async('string');
    for (const m of wbXml.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?\s*>/gi)) {
      const target = relTargets.get(xmlAttr(m[1], 'r:id'));
      if (target) labels.set(target, xmlAttr(m[1], 'name'));
    }
  }

  const names = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
    .sort((a, b) => numberFromPath(a, 'sheet') - numberFromPath(b, 'sheet'));
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const xml = await zip.file(names[i]).async('string');
    const rows = [];
    const rowRe = /<(?:\w+:)?row(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?row>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(xml))) {
      const cells = [];
      const cellRe = /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/gi;
      let cell;
      while ((cell = cellRe.exec(rowMatch[1]))) {
        const type = xmlAttr(cell[1], 't');
        const body = cell[2];
        let value = '';
        if (type === 'inlineStr') value = textNodes(body).join('');
        else {
          const vm = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/i.exec(body);
          const raw = vm ? decodeEntities(vm[1]).trim() : '';
          value = type === 's' ? (shared[+raw] || '') : raw;
          const fm = /<(?:\w+:)?f(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?f>/i.exec(body);
          if (fm && decodeEntities(fm[1]).trim()) value = `${decodeEntities(fm[1]).trim()} ${value}`.trim();
        }
        if (value !== '') cells.push(value);
      }
      if (cells.length) rows.push(cells.join('\t'));
    }
    if (rows.length) out.push(`【工作表：${labels.get(names[i]) || `Sheet${i + 1}`}】\n${rows.join('\n')}`);
  }
  return normalizeExtracted(out.join('\n'));
}

// OFD：遍历所有页面 Content.xml，抽取 <TextCode> 里的可见文字（兼容各种命名空间前缀）
async function extractOfd(p) {
  const zip = await JSZip.loadAsync(fs.readFileSync(p));
  const names = Object.keys(zip.files).filter((n) => /Content\.xml$/i.test(n)).sort();
  const out = [];
  for (const name of names) {
    const xml = await zip.file(name).async('string');
    const matches = xml.match(/<(?:\w+:)?TextCode[^>]*>([\s\S]*?)<\/(?:\w+:)?TextCode>/g) || [];
    for (const m of matches) {
      out.push(decodeEntities(m.replace(/<[^>]+>/g, '')));
    }
    out.push('\n');
  }
  return out.join('');
}

// 老式 .doc（二进制 Word）/ 部分 .wps：用 word-extractor 读取（纯 JS，免编译）。
// 很多 .wps 底层是 OLE 复合格式，可一并尝试；无法解析的会被上层跳过。
async function extractDoc(p) {
  const WordExtractor = require('word-extractor');
  const ext = new WordExtractor();
  const doc = await ext.extract(p);
  return doc.getBody() || '';
}

// PDF（文字版）：用 pdfjs 逐页取文字。若几乎抽不出文字（扫描件）且开启了 OCR，则走 OCR。
async function extractPdf(p, opts = {}) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(p));
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    cMapUrl: path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'cmaps') + path.sep,
    cMapPacked: true
  });
  const doc = await loadingTask.promise;
  const pageTexts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pageTexts.push(tc.items.map((it) => it.str).join(' '));
    page.cleanup();
  }
  if (typeof doc.destroy === 'function') await doc.destroy();
  else if (typeof loadingTask.destroy === 'function') await loadingTask.destroy();

  // 按页判断扫描内容：混合型 PDF 中已有文字的页面保留原抽取结果，空白/图片页单独 OCR。
  // 最多识别 30 个扫描页，避免误选超长档案后耗时失控。
  const scanPages = [];
  if (opts.ocr) {
    for (let i = 0; i < pageTexts.length && scanPages.length < 30; i++) {
      if (pageTexts[i].replace(/\s/g, '').length < 3) scanPages.push(i + 1);
    }
  }
  if (scanPages.length) {
    try {
      const { ocrPdfPages } = require('./ocr');
      const recognized = await ocrPdfPages(p, scanPages, opts.onLog);
      for (const [pageNo, text] of recognized) {
        if (text && text.trim()) pageTexts[pageNo - 1] = text;
      }
    } catch (e) {
      if (opts.onLog) opts.onLog('OCR 失败：' + e.message);
    }
  }
  return normalizeExtracted(pageTexts.join('\n')); // 全角→半角、合并拉开的拉丁串、修复中文字间空格
}

async function extractImage(p, opts = {}) {
  if (!opts.ocr) return null;
  const { ocrImage } = require('./ocr');
  return normalizeExtracted(await ocrImage(p, opts.onLog));
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tif', '.tiff']);

const EXTRACTORS = {
  '.txt': extractTxt,
  '.md': extractTxt,
  '.csv': extractTxt,
  '.log': extractTxt,
  '.docx': extractDocx,
  '.pptx': extractPptx,
  '.pptm': extractPptx,
  '.ppsx': extractPptx,
  '.potx': extractPptx,
  '.xlsx': extractXlsx,
  '.xlsm': extractXlsx,
  '.ofd': extractOfd,
  '.pdf': extractPdf,
  '.doc': extractDoc,
  '.wps': extractDoc,
  '.png': extractImage,
  '.jpg': extractImage,
  '.jpeg': extractImage,
  '.bmp': extractImage,
  '.webp': extractImage,
  '.tif': extractImage,
  '.tiff': extractImage
};

function isSupported(p) {
  return !!EXTRACTORS[path.extname(p).toLowerCase()];
}

function isImage(p) { return IMAGE_EXTS.has(path.extname(p).toLowerCase()); }

async function extract(p, opts = {}) {
  const fn = EXTRACTORS[path.extname(p).toLowerCase()];
  if (!fn) return null;
  return await fn(p, opts);
}

module.exports = {
  extract, isSupported, isImage, EXTRACTORS,
  extractPptx, extractXlsx,
  normalizeExtracted, toHalfWidthAlnum, dedupeLatinSpacing, dedupeCJKSpaces
};
