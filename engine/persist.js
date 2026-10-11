// 索引持久化（v3 起改为「正文 / 倒排表」分离存储，大幅加快启动）：
//   - meta.json                 当前有效索引清单（最后原子替换）。
//   - texts-<generation>.bin    正文数据；每篇按 off/len 随机读取，命中时才懒加载。
//   - tokens-<generation>.json  分词缓存，仅「建立/更新索引」时读取。
//
// generation 文件名由 meta.json 指向。保存时先完整写入新 generation，再原子替换 meta.json，
// 最后清理旧 generation。这样进程在任一步退出，旧 meta 都不会误读新 texts，避免正文错位。
// 这样千份文档启动时无需再 JSON.parse 上百 MB 的全文，启动从数秒级降到亚秒级。
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// 索引目录：默认在系统 userData 下；支持环境变量覆盖（便于无 Electron 环境下测试）。
function dir() {
  let base = process.env.DOCSEARCH_INDEX_DIR;
  if (!base) {
    // 测试可通过环境变量运行在纯 Node；生产环境才延迟读取 Electron app。
    const { app } = require('electron');
    base = path.join(app.getPath('userData'), 'indexes');
  }
  fs.mkdirSync(base, { recursive: true });
  return base;
}
const metaFile = () => path.join(dir(), 'meta.json');
function dataFile(meta, key, fallback) {
  const name = meta && meta[key];
  // 文件名只允许 basename，拒绝损坏/外来 meta 借此越出索引目录。
  if (typeof name === 'string' && name === path.basename(name)) return path.join(dir(), name);
  return path.join(dir(), fallback); // 兼容 v3-v6 的固定文件名
}
const textsFile = (meta) => dataFile(meta, 'textsFile', 'texts.bin');
const tokensFile = (meta) => dataFile(meta, 'tokensFile', 'tokens.json');

// 原子写：先写临时文件再 rename，避免写一半进程退出导致索引损坏后被迫全量重建。
async function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, file);
  } catch (e) {
    try { await fsp.unlink(tmp); } catch {}
    throw e;
  }
}

// 流式原子写 texts.bin：逐篇写入并记录 off/len，避免一次性 Buffer.concat 造成内存峰值翻倍。
function writeTextsAtomic(file, docs) {
  return new Promise((resolve, reject) => {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const ws = fs.createWriteStream(tmp);
    let settled = false;
    const fail = (e) => {
      if (settled) return;
      settled = true;
      try { ws.destroy(); } catch {}
      fsp.unlink(tmp).catch(() => {}).finally(() => reject(e));
    };
    ws.on('error', fail);
    let i = 0, off = 0;
    (function pump() {
      while (i < docs.length) {
        const d = docs[i++];
        const buf = Buffer.from(d.text || '', 'utf8');
        d._off = off; d._len = buf.length; off += buf.length;
        if (!ws.write(buf)) { ws.once('drain', pump); return; } // 背压：等排空再继续，内存可控
      }
      ws.end(() => fsp.rename(tmp, file).then(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, fail));
    })();
  });
}

// 懒加载正文读取器：按 off/len 从 texts.bin 随机读取，带 LRU 缓存（覆盖连续输入时的重复读取）。
function makeTextReader(textPath, docs) {
  const byId = {};
  for (const d of docs) byId[d.id] = d;
  let fd = null;
  const cache = new Map();
  const MAX = 200; // 最多缓存 200 篇正文，兼顾命中复用与内存占用
  return {
    get(id) {
      if (cache.has(id)) { const v = cache.get(id); cache.delete(id); cache.set(id, v); return v; }
      const d = byId[id];
      if (!d || !d.len) return '';
      try {
        if (fd === null) fd = fs.openSync(textPath, 'r');
        const buf = Buffer.allocUnsafe(d.len);
        fs.readSync(fd, buf, 0, d.len, d.off);
        const text = buf.toString('utf8');
        cache.set(id, text);
        if (cache.size > MAX) cache.delete(cache.keys().next().value);
        return text;
      } catch { return ''; }
    },
    close() { if (fd !== null) { try { fs.closeSync(fd); } catch {} fd = null; } cache.clear(); }
  };
}

// 给元信息附上懒加载能力，得到可直接用于搜索的内存索引对象。
function attachReader(meta) {
  const reader = makeTextReader(textsFile(meta), meta.docs || []);
  meta.getText = (id) => reader.get(id);
  meta.close = () => reader.close();
  return meta;
}

// 校验是否本程序 v3 格式的 meta（防止外来/旧版/损坏文件让启动崩溃）。
function isValidMeta(m) {
  if (!m || !Array.isArray(m.docs) || !m.inverted || typeof m.inverted !== 'object') return false;
  return m.docs.every((d, i) => d && Number.isInteger(d.id) && d.id === i
    && typeof d.path === 'string' && Number.isFinite(d.off) && d.off >= 0
    && Number.isFinite(d.len) && d.len >= 0);
}

async function hasValidTextStore(meta) {
  try {
    const st = await fsp.stat(textsFile(meta));
    return meta.docs.every((d) => d.off + d.len <= st.size);
  } catch { return false; }
}

// 启动时打开索引：只 parse meta.json（倒排+元信息），正文懒加载。返回 null 表示尚无可用索引。
async function openIndex() {
  let meta;
  try { meta = JSON.parse(await fsp.readFile(metaFile(), 'utf8')); }
  catch { return null; }
  if (!isValidMeta(meta)) return null; // 非本格式（如旧版 {lastFolder} 或损坏）→ 当作无索引
  if (!await hasValidTextStore(meta)) return null;
  return attachReader(meta);
}

// 仅建索引时使用：读上次的 per-doc 分词（{path: [tokens]}），用于复用未改动文档、跳过重新分词。
async function loadTokens(index) {
  try { return JSON.parse(await fsp.readFile(tokensFile(index), 'utf8')); }
  catch { return {}; }
}

async function cleanupStores(keep = new Set(), strict = false) {
  let names = [];
  try { names = await fsp.readdir(dir()); } catch { return; }
  const removable = /^(?:texts(?:-[^.]+)?\.bin|tokens(?:-[^.]+)?\.json|index\.json|.+\.tmp)$/;
  const failures = [];
  await Promise.all(names.map(async (name) => {
    if (!removable.test(name) || keep.has(name)) return;
    try { await fsp.unlink(path.join(dir(), name)); }
    catch (e) { if (e && e.code !== 'ENOENT') failures.push(`${name}: ${e.message}`); }
  }));
  if (strict && failures.length) throw new Error(`索引文件未能完全删除：${failures.join('；')}`);
}

// 保存：把建好的索引（docs 形如 {id,path,name,mtime,text,tokens}）拆成三份落盘，
// 并返回「懒加载形态」的内存索引（丢弃内存中的全文，省内存），供主进程直接用于搜索。
async function saveIndex(index) {
  const docs = index.docs;
  const generation = `${Date.now()}-${process.pid}`;
  const textName = `texts-${generation}.bin`;
  const tokenName = `tokens-${generation}.json`;
  const textPath = path.join(dir(), textName);
  const tokenPath = path.join(dir(), tokenName);

  try {
    // 1) 完整写入新一代正文（顺带写回每篇 _off/_len）
    await writeTextsAtomic(textPath, docs);

    // 2) 完整写入同一代分词缓存
    const tokensMap = {};
    for (const d of docs) if (d.tokens) tokensMap[d.path] = d.tokens;
    await atomicWrite(tokenPath, JSON.stringify(tokensMap));

    // 3) 最后才切换 meta 指针；此前异常退出仍会使用完整的旧 generation
    const metaDocs = docs.map((d) => ({ id: d.id, path: d.path, name: d.name, mtime: d.mtime, off: d._off, len: d._len }));
    const meta = {
      storageVersion: 1, textsFile: textName, tokensFile: tokenName,
      version: index.version, folders: index.folders, ocr: !!index.ocr, builtAt: index.builtAt,
      docs: metaDocs, inverted: index.inverted,
      skipped: index.skipped, reused: index.reused, total: index.total
    };
    await atomicWrite(metaFile(), JSON.stringify(meta));

    // meta 已提交，此时再删除旧数据；清理失败只浪费少量磁盘，不影响正确性。
    await cleanupStores(new Set([textName, tokenName]));
    return attachReader(meta);
  } catch (e) {
    // meta 未切换时，新 generation 不可见，可安全回收。
    try { await fsp.unlink(textPath); } catch {}
    try { await fsp.unlink(tokenPath); } catch {}
    throw e;
  }
}

async function clearIndex() {
  try { await fsp.unlink(metaFile()); }
  catch (e) { if (e && e.code !== 'ENOENT') throw e; }
  await cleanupStores(new Set(), true);
}

module.exports = { openIndex, saveIndex, loadTokens, clearIndex };
