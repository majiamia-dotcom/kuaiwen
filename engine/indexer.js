// 建索引：递归扫描文件夹 -> 抽取文本 -> 二元分词 -> 倒排索引（内存）。
// 增量复用：上次索引里路径与 mtime 都没变的文档，正文与分词都直接复用，不重新解析、不重新分词。
// 性能：需要解析的文档交给 worker 线程池多核并行（见 extractPool.js）；线程池不可用时自动回退串行。
const fs = require('fs');
const path = require('path');
const { extract, isSupported, isImage } = require('./extract');
const { tokenize } = require('./tokenize');
const { createPool } = require('./extractPool');

// 用 withFileTypes 一次拿到类型，省去对每个条目额外的 statSync（千份文件即省上千次系统调用）。
function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

// 两组文件夹是否一致（顺序无关）——用于判断“搜索范围未变”。
function sameFolders(a, b) {
  a = a || []; b = b || [];
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

// 解析逻辑/存储格式版本号：升级后旧缓存不再复用。v3 起改为 meta+texts 分离存储。
// v4：PDF 抽取增加 全角→半角字母数字 + 合并被逐字符拆开的拉丁/数字串。
// v5：合并规则扩到 1~2 字符短碎片（DE NG→DENG、L YU→LYU）。
// v6：去掉宽标点(中文/全角标点)两侧空格（39 （ 5 ） ： → 39（5）：）。
// v7：PDF 启用内置 CMap，修复部分 Adobe-GB1 等中文 PDF 缺字/乱码。
// v8：新增 PPTX / XLSX 抽取和图片 OCR；索引记录 OCR 模式，切换后正确增删图片。
const EXTRACT_VERSION = 8;

// 并行解析一批文档，结果按原始下标写回 results；线程池创建失败则回退到主进程串行解析。
async function extractMany(tasks, results, { ocr, onItem, onLog }) {
  if (!tasks.length) return;

  let pool = null;
  try { pool = createPool({ ocr }); } catch { pool = null; }

  if (pool) {
    try {
      await Promise.all(tasks.map(async (t) => {
        try {
          const { text, tokens } = await pool.run(t.path, ocr, onLog);
          if (text != null) results[t.idx] = { path: t.path, name: path.basename(t.path), mtime: t.mtime, text, tokens };
        } catch { /* 该文件解析失败 -> 保持 null（上层计入跳过） */ }
        onItem(path.basename(t.path));
      }));
    } finally {
      await pool.destroy();
    }
    return;
  }

  // 回退：主进程串行解析（与无 worker 时行为一致）
  for (const t of tasks) {
    try {
      const text = await extract(t.path, { ocr, onLog });
      if (text != null) {
        const tokens = [...new Set(tokenize(text))];
        results[t.idx] = { path: t.path, name: path.basename(t.path), mtime: t.mtime, text, tokens };
      }
    } catch { /* skip */ }
    onItem(path.basename(t.path));
  }
}

// folders 为文件夹数组（也兼容单个字符串）。prev 为上次索引（懒加载形态，可为 null）。
// onProgress 回报进度。opts.ocr 控制扫描件 OCR；opts.prevTokens 为上次的 {path:[tokens]} 分词缓存。
async function buildIndex(folders, prev, onProgress, opts = {}) {
  if (typeof folders === 'string') folders = [folders];
  folders = (folders || []).filter(Boolean);
  if (prev && prev.version !== EXTRACT_VERSION) prev = null; // 版本变化则全部重新解析

  // 汇总所有文件夹下的受支持文件，按路径去重
  const all = [];
  const seenPath = new Set();
  let ignoredImages = 0;
  for (const folder of folders) {
    for (const p of walk(folder)) {
      // 图片只有开启 OCR 后才进入索引；避免默认扫描照片库造成长时间等待。
      if (!isSupported(p) || seenPath.has(p)) continue;
      seenPath.add(p);
      if (isImage(p) && !opts.ocr) { ignoredImages++; continue; }
      all.push(p);
    }
  }

  const prevByPath = {};
  if (prev && prev.docs) for (const d of prev.docs) prevByPath[d.path] = d;
  const prevTokens = opts.prevTokens || {};

  const results = new Array(all.length); // 下标 -> {path,name,mtime,text,tokens}，null 表示跳过
  const toExtract = [];                  // 需要解析的文件 {idx,path,mtime}
  const reuseList = [];                  // 可复用文件 {idx,path,mtime,oldId}（正文与分词均沿用上次）
  let done = 0;
  const tick = (name) => { done++; if (onProgress) onProgress({ done, total: all.length, name }); };

  // 第一遍（只 stat，不读正文）：按 路径+mtime 判定可复用，其余排队等解析。
  // 用 old.len>0 代替“读出来非空”，避免在这一步就把每篇正文从 texts.bin 读进内存（千份文档时很贵）。
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    let mtime = 0;
    try { mtime = fs.statSync(p).mtimeMs; } catch {}
    const old = prevByPath[p];
    if (prev && old && old.mtime === mtime && old.len > 0) reuseList.push({ idx: i, path: p, mtime, oldId: old.id });
    else toExtract.push({ idx: i, path: p, mtime });
  }

  // 快路径：无文件需解析、无文档被删除、且搜索范围(文件夹)未变 → 内容与上次完全一致，
  // 直接沿用已加载索引，跳过“读全文 + 重建倒排 + 重写三件套”（点“更新”但其实没改动时近乎瞬时）。
  if (prev && toExtract.length === 0 && reuseList.length === prev.docs.length && sameFolders(prev.folders, folders)
      && !!prev.ocr === !!opts.ocr) {
    return { unchanged: true, version: EXTRACT_VERSION, folders, ocr: !!opts.ocr, builtAt: prev.builtAt,
             count: prev.docs.length, skipped: 0, reused: all.length, total: all.length, ignoredImages };
  }

  // 第二遍：把可复用文件的正文从上次索引读出（定期让出事件循环，保持进度/界面跟手）。
  let reused = 0, scanned = 0;
  for (const r of reuseList) {
    const text = prev.getText(r.oldId);
    if (text) {
      const tokens = prevTokens[r.path] || [...new Set(tokenize(text))];
      results[r.idx] = { path: r.path, name: path.basename(r.path), mtime: r.mtime, text, tokens };
      reused++;
    } else {
      toExtract.push({ idx: r.idx, path: r.path, mtime: r.mtime }); // 意外读空 → 改为重新解析
    }
    tick(path.basename(r.path));
    if ((++scanned % 300) === 0) await new Promise((res) => setImmediate(res)); // 让出事件循环
  }

  // 第三遍：并行解析需要解析的文件
  await extractMany(toExtract, results, {
    ocr: !!opts.ocr,
    onItem: (name) => tick(name),
    onLog: (msg) => { if (onProgress) onProgress({ done, total: all.length, name: msg }); }
  });

  // 文件解析阶段结束，进入合并阶段（此后到写盘前不再有逐文件进度，给个明确阶段提示，避免看起来卡住）
  if (onProgress) onProgress({ stage: `正在合并索引（共 ${all.length} 份，复用 ${reused} 份）…` });

  // 按原始顺序组装 docs（顺序确定 -> doc id 与倒排确定，与串行结果一致），统计跳过数。
  const docs = [];
  let skipped = 0;
  for (let i = 0; i < all.length; i++) {
    const r = results[i];
    if (!r) { skipped++; continue; }
    docs.push({ id: docs.length, path: r.path, name: r.name, mtime: r.mtime, text: r.text, tokens: r.tokens });
  }

  // 基于各文档的 token 集合重建倒排（复用/并行得到的 token 只做字典装填，不再重新分词）
  // 用无原型字典：token 可能恰好等于 Object 原型属性名（如英文词 constructor、__proto__），
  // 普通 {} 会让 inverted[tk] 取到继承的原型属性（非数组）导致 .push 崩溃。
  const inverted = Object.create(null);
  docs.forEach((d, id) => {
    d.id = id;
    for (const tk of d.tokens) (inverted[tk] || (inverted[tk] = [])).push(id);
  });

  return { version: EXTRACT_VERSION, folders, ocr: !!opts.ocr, builtAt: Date.now(), docs, inverted, skipped, reused, total: all.length, ignoredImages };
}

module.exports = { buildIndex };
