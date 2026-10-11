// 界面逻辑（v2 交互）：LOGO 展开/收起操作 · 左滑出文件夹面板(搜索范围+高级设置) · 即输即搜 · 三列结果。
// v1.2.0：界面文案全部走 i18n.js 的 t()，支持 中/英/法/西；静态控件用 data-i18n 标注。
const app = document.getElementById('app');
const logoBtn = document.getElementById('logoBtn');
const actionsEl = document.getElementById('actions');
const addBtn = document.getElementById('addBtn');
const indexBtn = document.getElementById('indexBtn');
const clearBtn = document.getElementById('clearBtn');
const settingsBtn = document.getElementById('settingsBtn');
const foldBtn = document.getElementById('foldBtn');
const scrim = document.getElementById('scrim');
const folderPanel = document.getElementById('folderPanel');
const fpClose = document.getElementById('fpClose');
const folderList = document.getElementById('folderList');
const ocrChk = document.getElementById('ocrChk');
const titleChk = document.getElementById('titleChk');
const hotkeyBtn = document.getElementById('hotkeyBtn');
const langSel = document.getElementById('langSel');
const searchInput = document.getElementById('searchInput');
const searchHistoryEl = document.getElementById('searchHistory');
const statusEl = document.getElementById('status');
const rowsEl = document.getElementById('rows');
const toastEl = document.getElementById('toast');

let folders = [];
let activeFolders = new Set();   // 参与搜索的文件夹（默认全部）
let indexed = false;
let lastResults = [];
let shown = [];
let hitById = {};
let currentKw = '';
let sortDesc = true;   // 时间：true=由近到远（新→旧）
let typeDesc = false;  // 类型：false=升序，true=降序
let sortKey = 'time';  // 默认以时间为主排序
let timeBasis = 'mtime'; // 默认按文件修改时间；可切换为文内发布/出版时间
let folded = true;

function zhUI() { return window.I18N ? I18N.lang() === 'zh' : true; }
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 1600); }
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function fmtDate(ms) { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtMD(ms) { if (!ms) return ''; const d = new Date(ms); return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function yearOf(ms) { return ms ? new Date(ms).getFullYear() : t('year.unknown'); }
function baseName(p) { return (p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p; }
// 文内时间：手动设置 > 当前文件类型对应的候选日期(红头/期刊/通用)。
function pickDate(r) {
  if (!r) return null;
  const ov = manualTimes()[r.path];
  if (ov && typeof ov.ts === 'number') return ov;            // 手动设置优先
  const ty = fileType(r.path, r.name);
  const d = ty === 'red' ? r.dRed : (ty === 'journal' ? r.dJournal : r.dGeneric);
  return (d && typeof d.ts === 'number') ? d : null;
}
function resultDate(r) {
  if (!r) return { ts: 0, prec: 'd', source: '' };
  if (timeBasis === 'mtime') return { ts: r.mtime || 0, prec: 'd', source: t('src.mtime') };
  const d = pickDate(r);
  return d || { ts: r.mtime || 0, prec: 'd', source: t('src.fallback'), fallback: true };
}
function docTime(r) { return resultDate(r).ts; }
function docPrec(r) { return resultDate(r).prec || 'd'; }
function docSource(r) { return resultDate(r).source || ''; }
function isDateFallback(r) { return !!resultDate(r).fallback; }
function hasManualTime(path) { const o = manualTimes()[path]; return !!(o && typeof o.ts === 'number'); }
function termsOf(kw) { return (kw || '').split(/[\s,，、;；]+/).filter(Boolean); }
function paraScore(para) { const low = (para || '').toLowerCase(); return termsOf(currentKw).reduce((n, term) => n + (low.includes(term.toLowerCase()) ? 1 : 0), 0); }
function inActiveScope(p) {
  if (!activeFolders.size) return true;
  for (const f of activeFolders) { if (p === f || p.startsWith(f + '/') || p.startsWith(f + '\\')) return true; }
  return false;
}

/* ---------- 文件类型分类（样式类名；显示名走 i18n） ---------- */
const TYPE_CLS = {
  red: 't-red', law: 't-law', spec: 't-spec', plan: 't-plan', journal: 't-journal', normal: 't-normal'
};
function typeLabel(code) { return t('type.' + code); }
const TYPE_ORDER = ['red', 'law', 'spec', 'plan', 'journal', 'normal'];
const TYPE_RANK = { red: 0, law: 1, spec: 2, plan: 3, journal: 4, normal: 5 }; // 排序优先级
function typeRank(path, name) { return TYPE_RANK[fileType(path, name)]; }
// 引擎按内容/文件名给出的自动类型（“学术期刊”文件名通常看不出，靠正文卷期/DOI 判定），按 path 建表供 fileType 读。
let autoTypeByPath = new Map();
function setAutoTypes(results) { autoTypeByPath = new Map(); for (const r of results) if (r && r.docType) autoTypeByPath.set(r.path, r.docType); }
// 文件名兜底归类（引擎类型缺失时用）。缓存避免大结果集排序时对同名重复跑正则。
// 注意：归类依据是中文文件名特征（〔〕号、条例、规范等），属数据规则而非界面文案，不做多语言。
const _clsCache = new Map();
function classifyFileType(name) {
  const n = name || '';
  if (_clsCache.has(n)) return _clsCache.get(n);
  let ty;
  if (/〔\s*\d{2,4}\s*〕\s*\d+\s*号/.test(n) || /\[\s*\d{2,4}\s*\]\s*\d+\s*号/.test(n)) ty = 'red';
  else if (/条例|办法/.test(n)) ty = 'law';
  else if (/技术规程|规程|标准|规范|指南/.test(n)) ty = 'spec';
  else if (/规划|计划/.test(n)) ty = 'plan';
  else ty = 'normal';
  _clsCache.set(n, ty);
  return ty;
}
// 手动归类 / 手动时间 都缓存在内存，避免每次 fileType()/docTime() 都 JSON.parse(localStorage)。
let _typeOv = null, _manualOv = null;
function typeOverrides() { if (!_typeOv) { try { _typeOv = JSON.parse(localStorage.getItem('typeOverrides') || '{}'); } catch { _typeOv = {}; } } return _typeOv; }
function manualTimes() { if (!_manualOv) { try { _manualOv = JSON.parse(localStorage.getItem('timeOverrides') || '{}'); } catch { _manualOv = {}; } } return _manualOv; }
// 当前类型：手动归类 > 引擎自动类型 > 文件名兜底。
function fileType(path, name) { return typeOverrides()[path] || autoTypeByPath.get(path) || classifyFileType(name); }
function setFileType(path, ty) { const o = typeOverrides(); o[path] = ty; try { localStorage.setItem('typeOverrides', JSON.stringify(o)); } catch {} }
function clearFileType(path) { const o = typeOverrides(); delete o[path]; try { localStorage.setItem('typeOverrides', JSON.stringify(o)); } catch {} }
function setManualTime(path, d) { const o = manualTimes(); if (d) o[path] = d; else delete o[path]; try { localStorage.setItem('timeOverrides', JSON.stringify(o)); } catch {} }
function fileTagHTML(path, name) { const ty = fileType(path, name); return `<span class="ftag ${TYPE_CLS[ty]}" data-typepath="${esc(path)}" data-curtype="${ty}" title="${esc(t('tag.selectType'))}">${typeLabel(ty)}</span>`; }
let activeTypes = new Set(TYPE_ORDER);

/* ---------- 结果上下文行数随窗口高度自适应（最少 3 行） ---------- */
function updateClamp() {
  const n = Math.max(3, Math.min(10, Math.floor((window.innerHeight - 300) / 80)));
  document.documentElement.style.setProperty('--clamp', n);
}
window.addEventListener('resize', updateClamp);
updateClamp();
function hl(text, kw) {
  const terms = termsOf(kw);
  if (!terms.length) return esc(text);
  const re = new RegExp(terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  return esc(text).replace(re, (m) => `<mark>${esc(m)}</mark>`);
}
function ctxHTML(it) {
  // 折叠片段：从命中词前一点起，一直取到自然段末尾；具体显示几行由 CSS line-clamp
  // 按窗口高度自适应截断。窗口大→显示更多行填满空间；自然段短→自然压缩，不留空白。
  const para = it.para || ((it.before || '') + (it.hit || '') + (it.after || ''));
  const terms = termsOf(currentKw);
  const low = para.toLowerCase();
  let lo = Infinity;
  for (const term of terms) { const i = low.indexOf(term.toLowerCase()); if (i >= 0 && i < lo) lo = i; }
  let start = 0;
  if (lo !== Infinity) start = Math.max(0, lo - 24); // 让命中词靠近片段开头但保留少量上文
  const s = (start > 0 ? '…' : '') + para.slice(start);
  return hl(s, currentKw);
}

/* ---------- LOGO 展开/收起操作 ---------- */
logoBtn.addEventListener('click', () => {
  app.classList.add('touched');
  app.classList.toggle('expanded');
  tourAction('logo');
});
// 启动后空闲帧预热合成层，第一次点击与后续点击保持一致。
requestAnimationFrame(() => { void actionsEl.offsetHeight; void logoBtn.offsetHeight; });

/* ---------- 文件夹面板（搜索范围） ---------- */
function openPanel() { renderFolders(); scrim.classList.add('open'); folderPanel.classList.add('open'); app.classList.add('panelopen'); }
function closePanel() { scrim.classList.remove('open'); folderPanel.classList.remove('open'); app.classList.remove('panelopen'); }
settingsBtn.addEventListener('click', openPanel);
fpClose.addEventListener('click', closePanel);
scrim.addEventListener('click', closePanel);

function renderFolders() {
  indexBtn.disabled = !folders.length;
  if (!folders.length) { folderList.innerHTML = `<div class="fp-empty">${esc(t('folder.empty'))}</div>`; return; }
  folderList.innerHTML = folders.map((f, i) => {
    const on = activeFolders.has(f);
    return `<div class="frow" title="${esc(f)}">
      <div class="sw${on ? ' on' : ''}" data-tg="${i}" title="${esc(on ? t('folder.toggleOff') : t('folder.toggleOn'))}"></div>
      <span class="fn" data-tg="${i}">${esc(baseName(f))}</span>
      <span class="rm" data-rm="${i}" title="${esc(t('folder.remove'))}">✕</span>
    </div>`;
  }).join('');
}
folderList.addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm]');
  if (rm) { const i = +rm.dataset.rm; activeFolders.delete(folders[i]); folders.splice(i, 1); renderFolders(); if (lastResults.length) applyFilter(); return; }
  const tg = e.target.closest('[data-tg]');
  if (tg) {
    const f = folders[+tg.dataset.tg];
    if (activeFolders.has(f)) { if (activeFolders.size <= 1) { toast(t('toast.keepOneFolder')); return; } activeFolders.delete(f); }
    else activeFolders.add(f);
    renderFolders(); if (lastResults.length) applyFilter();
  }
});

/* ---------- 初始化 ---------- */
async function init() {
  if (langSel) {
    langSel.value = I18N.lang();
    langSel.addEventListener('change', () => switchLang(langSel.value));
  }
  const st = await window.api.getState();
  if (st) {
    folders = st.folders || [];
    activeFolders = new Set(folders);
    indexed = true;
    ocrChk.checked = !!st.ocr;
    searchInput.disabled = false;
    statusEl.textContent = t('status.loaded', { count: st.count, date: fmtDate(st.builtAt) });
    searchInput.focus();
  } else {
    statusEl.textContent = t('status.welcome');
  }
  renderFolders();
  maybeStartTour();
}
init();

// 切换界面语言：静态标注由 setLang 内部套用，动态区域这里重绘
function switchLang(l) {
  I18N.setLang(l);
  updateFoldBtn();
  renderFolders();
  if (lastResults.length) render();
  if (tourCurrent) showTourStep(tourCurrent);
}

addBtn.addEventListener('click', async () => {
  const picked = await window.api.pickFolders();
  if (!picked || !picked.length) return;
  for (const p of picked) { if (!folders.includes(p)) folders.push(p); activeFolders.add(p); }
  renderFolders();
  statusEl.textContent = t('status.added', { n: folders.length });
  tourAction('folder');
});
clearBtn.addEventListener('click', async () => {
  if (clearBtn.disabled) return;
  clearBtn.disabled = true;
  try {
    const result = await window.api.clearIndex();
    if (!result || !result.ok) return;
    folders = [];
    activeFolders = new Set();
    indexed = false;
    lastResults = [];
    shown = [];
    hitById = {};
    currentKw = '';
    searchInput.value = '';
    searchInput.disabled = true;
    rowsEl.innerHTML = '';
    try {
      localStorage.removeItem('typeOverrides');
      localStorage.removeItem('timeOverrides');
      _typeOv = null;
      _manualOv = null;
    } catch {}
    renderFolders();
    statusEl.textContent = t('status.cleared');
  } catch (e) {
    statusEl.textContent = t('status.clearFail', { msg: e && e.message ? e.message : e });
  } finally {
    clearBtn.disabled = false;
  }
});

indexBtn.addEventListener('click', async () => {
  if (!folders.length || indexBtn.disabled) return;
  indexBtn.disabled = true; addBtn.disabled = true; clearBtn.disabled = true;
  const ocr = ocrChk.checked;
  tourBusy(t('tour.busyIndexing'));
  statusEl.textContent = ocr ? t('status.indexingOcr') : t('status.indexing');
  try {
    const r = await window.api.buildIndex(folders, { ocr });
    indexed = true; searchInput.disabled = false;
    const imageNote = r.ignoredImages ? t('status.imageNote', { n: r.ignoredImages }) : '';
    statusEl.textContent = t('status.indexDone', { count: r.count, reused: r.reused, skipped: r.skipped, imageNote });
    searchInput.focus();
    if (searchInput.value.trim()) doSearch();
    tourAction('indexed');
  } catch (e) {
    // 不再让失败表现为“假死”：明确报错并恢复按钮可用
    statusEl.textContent = t('status.indexFail', { msg: e && e.message ? e.message : e });
  } finally {
    indexBtn.disabled = false; addBtn.disabled = false; clearBtn.disabled = false;
  }
});
// 进度：带 stage 的为阶段提示（合并/写盘等无 done/total 的阶段），否则显示 已处理/总数：文件名
window.api.onProgress((p) => {
  if (!p) return;
  statusEl.textContent = p.stage ? p.stage : t('progress.building', { done: p.done, total: p.total, name: p.name });
});

titleChk.addEventListener('change', () => { if (lastResults.length) applyFilter(); });

/* ---------- 文件类型筛选（设置面板里的六个勾选） ---------- */
const typeChks = Array.from(document.querySelectorAll('.typeChk'));
typeChks.forEach((c) => c.addEventListener('change', () => {
  activeTypes = new Set(typeChks.filter((x) => x.checked).map((x) => x.value));
  if (!activeTypes.size) { c.checked = true; activeTypes.add(c.value); toast(t('toast.keepOneType')); }
  if (lastResults.length) applyFilter();
}));

/* ---------- 三列列宽：随窗口自适应 + 可拖拽手动调整（持久化到 localStorage） ---------- */
let colManual = false; // 用户手动拖过列宽后，就不再自动按窗口调整
function loadColWidths() {
  try {
    const w = JSON.parse(localStorage.getItem('colWidths') || '{}');
    if (w.tw || w.fw) {
      colManual = true;
      if (w.tw) document.documentElement.style.setProperty('--tw', w.tw + 'px');
      if (w.fw) document.documentElement.style.setProperty('--fw', w.fw + 'px');
    }
  } catch {}
}
// 文件列随窗口加宽：宽窗口时长文件名少折行、行更紧凑，正文列也不至于过宽留白
function autoCols() {
  if (colManual) return;
  // 1180 设计宽度时保持 220px，窗口更大时按比例加宽，最多 480px
  const fw = Math.round(Math.max(220, Math.min(480, (window.innerWidth - 1180) * 0.36 + 220)));
  document.documentElement.style.setProperty('--fw', fw + 'px');
}
function saveColWidths() {
  try {
    const cs = getComputedStyle(document.documentElement);
    localStorage.setItem('colWidths', JSON.stringify({
      tw: parseFloat(cs.getPropertyValue('--tw')) || 116,
      fw: parseFloat(cs.getPropertyValue('--fw')) || 220
    }));
  } catch {}
}
loadColWidths();
autoCols();
window.addEventListener('resize', autoCols);
(function initColResize() {
  let cur = null, sx = 0, s0 = 0, hEl = null;
  document.addEventListener('mousedown', (e) => {
    const h = e.target.closest('.colsep'); if (!h) return;
    cur = h.classList.contains('t') ? 'tw' : 'fw';
    colManual = true; // 一旦手动拖动，关闭自动列宽
    hEl = h; h.classList.add('drag'); sx = e.clientX;
    s0 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--' + cur)) || (cur === 'tw' ? 116 : 220);
    document.body.style.cursor = 'col-resize'; e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!cur) return;
    const dx = e.clientX - sx;
    const v = cur === 'tw' ? Math.max(48, Math.min(160, s0 + dx)) : Math.max(120, Math.min(440, s0 - dx));
    document.documentElement.style.setProperty('--' + cur, v + 'px');
  });
  document.addEventListener('mouseup', () => {
    if (!cur) return;
    if (hEl) hEl.classList.remove('drag');
    cur = null; hEl = null; document.body.style.cursor = ''; saveColWidths();
  });
})();

/* ---------- 折叠 / 全部 切换 ---------- */
// 折叠显示=三横线（☰）；全部显示=两个堆叠矩形（见界面图示）
const FOLD_ICON = {
  fold: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><line x1="10" y1="16" x2="38" y2="16"/><line x1="10" y1="24" x2="38" y2="24"/><line x1="10" y1="32" x2="38" y2="32"/></svg>',
  all:  '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="3"><rect x="11" y="13.5" width="26" height="8.5" rx="2.4"/><rect x="11" y="26" width="26" height="8.5" rx="2.4"/></svg>'
};
function updateFoldBtn() {
  foldBtn.innerHTML = folded ? FOLD_ICON.fold : FOLD_ICON.all;
  foldBtn.title = folded ? t('fold.toAll') : t('fold.toFold');
}
updateFoldBtn();
foldBtn.addEventListener('click', () => {
  folded = !folded;
  updateFoldBtn();
  applyFilter();
});

/* ---------- 全局呼出快捷键自定义 ---------- */
let recordingHotkey = false;
function fmtAccel(a) {
  return (a || '').replace('CommandOrControl', '⌘').replace('Command', '⌘').replace('Control', 'Ctrl')
    .replace('Alt', '⌥').replace('Shift', '⇧').replace('Super', '⊞').split('+').join(' ');
}
function accelFromEvent(e) {
  const mods = [];
  if (e.metaKey || e.ctrlKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  let key = e.key;
  if (key === ' ' || e.code === 'Space') key = 'Space';
  else if (/^[a-z]$/i.test(key)) key = key.toUpperCase();
  else if (/^[0-9]$/.test(key)) { /* keep */ }
  else if (/^F\d{1,2}$/.test(key)) { /* keep */ }
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';
  else if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null;
  else if (key.length !== 1) return null;
  if (!mods.length) return null;
  return mods.concat(key).join('+');
}
if (hotkeyBtn) {
  window.api.getHotkey().then((a) => { if (a) hotkeyBtn.textContent = fmtAccel(a); });
  hotkeyBtn.addEventListener('click', () => { recordingHotkey = true; hotkeyBtn.classList.add('recording'); hotkeyBtn.textContent = t('hotkey.press'); });
  document.addEventListener('keydown', async (e) => {
    if (!recordingHotkey) return;
    e.preventDefault();
    if (e.key === 'Escape') { recordingHotkey = false; hotkeyBtn.classList.remove('recording'); hotkeyBtn.textContent = fmtAccel(await window.api.getHotkey()); return; }
    const accel = accelFromEvent(e);
    if (!accel) return;
    recordingHotkey = false; hotkeyBtn.classList.remove('recording');
    const res = await window.api.setHotkey(accel);
    hotkeyBtn.textContent = fmtAccel(res.accel);
    toast(res.ok ? t('hotkey.setOk', { accel: fmtAccel(res.accel) }) : t('hotkey.setFail'));
  }, true);
}

/* ---------- 搜索 ---------- */
let timer = null;
let historyTimer = null;
let searchSeq = 0;
const HISTORY_KEY = 'recentSearchesV1';
function recentSearches() {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, 10) : [];
  } catch { return []; }
}
function saveRecentSearches(items) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 10))); } catch {} }
function rememberSearch(raw) {
  const kw = (raw || '').trim().slice(0, 100);
  if (!kw) return;
  saveRecentSearches([kw, ...recentSearches().filter((x) => x !== kw)]);
}
function hideSearchHistory() { if (searchHistoryEl) searchHistoryEl.classList.remove('show'); }
function showSearchHistory() {
  if (!searchHistoryEl || searchInput.disabled) return;
  const q = searchInput.value.trim().toLowerCase();
  const items = recentSearches().filter((x) => !q || x.toLowerCase().includes(q));
  if (!items.length) { hideSearchHistory(); return; }
  searchHistoryEl.innerHTML = `<div class="history-head"><span>${esc(t('history.head'))}</span><button class="history-clear" data-history-clear="1">${esc(t('history.clear'))}</button></div>`
    + items.map((x) => `<button class="history-item" type="button" role="option" data-history="${esc(x)}"><span class="history-icon">↺</span><span>${esc(x)}</span></button>`).join('');
  searchHistoryEl.classList.add('show');
}
searchInput.addEventListener('input', () => {
  clearTimeout(timer); timer = setTimeout(doSearch, 150);
  clearTimeout(historyTimer); historyTimer = setTimeout(() => rememberSearch(searchInput.value), 900);
  showSearchHistory();
});
searchInput.addEventListener('focus', showSearchHistory);
searchInput.addEventListener('click', showSearchHistory);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { rememberSearch(searchInput.value); hideSearchHistory(); doSearch(); }
  else if (e.key === 'Escape') hideSearchHistory();
  else if (e.key === 'ArrowDown' && searchHistoryEl && searchHistoryEl.classList.contains('show')) {
    const first = searchHistoryEl.querySelector('.history-item'); if (first) { e.preventDefault(); first.focus(); }
  }
});
if (searchHistoryEl) {
  searchHistoryEl.addEventListener('mousedown', (e) => e.preventDefault());
  searchHistoryEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-history-clear]')) { saveRecentSearches([]); hideSearchHistory(); searchInput.focus(); return; }
    const item = e.target.closest('[data-history]');
    if (!item) return;
    searchInput.value = item.dataset.history;
    rememberSearch(searchInput.value);
    hideSearchHistory();
    searchInput.focus();
    doSearch();
  });
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.searchwrap')) hideSearchHistory(); });
async function doSearch() {
  const kw = searchInput.value.trim();
  const seq = ++searchSeq;
  currentKw = kw;
  if (!kw) { rowsEl.innerHTML = ''; lastResults = []; shown = []; return; }
  if (!indexed) return;
  const r = await window.api.search(kw);
  // 输入很快时，较早请求可能较晚返回；丢弃过期结果，避免列表和搜索框不一致。
  if (seq !== searchSeq || kw !== searchInput.value.trim()) return;
  lastResults = r.results || [];
  setAutoTypes(lastResults); // 记录每个文件的引擎自动类型，供 fileType 判定（手动归类仍优先）
  applyFilter();
  tourAction('searched');
}
function applyFilter() {
  const scoped = lastResults.filter((r) => inActiveScope(r.path) && activeTypes.has(fileType(r.path, r.name)));
  shown = titleChk.checked ? scoped : scoped.filter((r) => r.kind === 'body');
  hitById = {};
  shown.forEach((h, i) => { h._id = 'h' + i; hitById['h' + i] = h; });
  render();
}

/* ---------- 分组、排序、渲染 ---------- */
function groupByDoc(hits) {
  const map = new Map();
  for (const h of hits) {
    if (!map.has(h.path)) map.set(h.path, {
      path: h.path, name: h.name, time: docTime(h), prec: docPrec(h), source: docSource(h),
      fallback: isDateFallback(h), row: h, hits: []
    });
    map.get(h.path).hits.push(h);
  }
  const groups = [...map.values()];
  const tcount = termsOf(currentKw).length;
  for (const g of groups) {
    const seen = new Set(); g.uhits = [];
    for (const h of g.hits) { if (!seen.has(h.para)) { seen.add(h.para); h._score = paraScore(h.para); g.uhits.push(h); } }
    g.uhits.sort((a, b) => (b._score - a._score) || (b.para.length - a.para.length));
    g.best = g.uhits[0];
    g.maxScore = g.best ? g.best._score : 0;
    g.coHits = g.uhits.filter((h) => h._score >= tcount).length;
    g.count = g.uhits.length;
  }
  return groups;
}
function sortHead() {
  const on = sortKey === 'time'; // 仅当时间为主排序时高亮其箭头
  return `<div>${esc(t('head.time'))} <span class="timebasis" title="${esc(t('head.timeBasis'))}">
    <span data-timebasis="mtime" class="${timeBasis === 'mtime' ? 'active' : ''}">${esc(t('tb.mtime'))}</span>
    <span data-timebasis="doc" class="${timeBasis === 'doc' ? 'active' : ''}">${esc(t('tb.doc'))}</span></span><span class="sortbtns">
    <span data-sort="asc" class="${on && !sortDesc ? 'active' : ''}" title="${esc(t('sort.timeAsc'))}">▲</span>
    <span data-sort="desc" class="${on && sortDesc ? 'active' : ''}" title="${esc(t('sort.timeDesc'))}">▼</span></span></div>`;
}
function typeHead() {
  const on = sortKey === 'type'; // 仅当类型为主排序时高亮其箭头
  return `<div>${esc(t('head.file'))} <span class="sortbtns">
    <span data-tsort="asc" class="${on && !typeDesc ? 'active' : ''}" title="${esc(t('sort.typeAsc'))}">▲</span>
    <span data-tsort="desc" class="${on && typeDesc ? 'active' : ''}" title="${esc(t('sort.typeDesc'))}">▼</span></span></div>`;
}
function render() {
  const hidden = lastResults.filter((r) => inActiveScope(r.path) && activeTypes.has(fileType(r.path, r.name))).length - shown.length;
  if (!shown.length) {
    const tip = hidden > 0 ? t('empty.hiddenTip', { n: hidden }) : '';
    rowsEl.innerHTML = currentKw ? `<div class="empty">${t('empty.noResult', { kw: esc(currentKw) })}${esc(tip)}</div>` : '';
    return;
  }
  const hiddenNote = hidden > 0 ? t('head.hiddenNote', { n: hidden }) : '';
  let html = `<div class="rowhead">${sortHead()}<div>${esc(t('head.content'))}${esc(hiddenNote)}　${esc(t('head.hint'))}</div>${typeHead()}<div class="colsep t" title="${esc(t('colsep.drag'))}"></div><div class="colsep f" title="${esc(t('colsep.drag'))}"></div></div>`;

  const multi = termsOf(currentKw).length > 1;
  // 年份分隔带只在“按时间为主排序 + 单关键词”时出现；按类型排序/多关键词时列表非按年顺序，
  // 改为把年份内联到时间列（如 07-10 / 2024），避免年份带反复跳变。
  const timeAxis = sortKey === 'time' && !multi;
  let curYear = null;
  const yearBar = (ts) => {
    if (!timeAxis) return '';
    const y = yearOf(ts);
    if (y === curYear) return '';
    curYear = y;
    const label = (typeof y === 'number') ? (zhUI() ? y + ' 年' : String(y)) : t('year.unknownBar');
    return `<div class="yeardiv">${label}</div>`;
  };
  const monthOf = (ts) => String(new Date(ts).getMonth() + 1).padStart(2, '0');
  // 按精度显示，不补缺失的月/日：日→MM-DD；月→MM月（非中文界面用 YYYY-MM）；年→年份
  const timeCell = (ts, prec) => {
    const y = yearOf(ts);
    if (prec === 'y') return `${y}`;
    if (prec === 'm') {
      if (zhUI()) return timeAxis ? `${monthOf(ts)}月` : `${monthOf(ts)}月<span class="yr">${y}</span>`;
      return `${y}-${monthOf(ts)}`;
    }
    return timeAxis ? fmtMD(ts) : `${fmtMD(ts)}<span class="yr">${y}</span>`;
  };
  const timeCellHTML = (row, ts, prec, source, fallback) => {
    const editable = timeBasis === 'doc';
    const cls = `col-time${editable && hasManualTime(row.path) ? ' manual' : ''}${fallback ? ' fallback' : ''}`;
    const attr = editable ? ` data-timepath="${esc(row.path)}"` : '';
    const hint = editable ? t('time.hintDoc', { source: source || t('src.doc') }) : t('time.hintMtime');
    return `<div class="${cls}"${attr} title="${esc(hint)}">${timeCell(ts, prec)}</div>`;
  };

  if (folded) {
    const groups = groupByDoc(shown);
    const dir = sortDesc ? -1 : 1;
    groups.sort((a, b) => {
      const ra = typeRank(a.path, a.name), rb = typeRank(b.path, b.name);
      const byTime = a.time !== b.time ? (a.time - b.time) * dir : 0;           // 当前时间依据（修改/文内）
      const byType = ra !== rb ? (typeDesc ? (rb - ra) : (ra - rb)) : 0;          // 类型优先级（可升降）
      const byLen = (b.best ? b.best.para.length : 0) - (a.best ? a.best.para.length : 0); // 命中自然段字数 多→少
      // 主排序列由 sortKey 决定，另一列退为次级裁决；字数始终垫底
      return sortKey === 'type' ? (byType || byTime || byLen) : (byTime || byType || byLen);
    });
    for (const g of groups) {
      const it = g.best;
      const others = g.uhits.filter((h) => h !== it);
      html += yearBar(g.time) + `<div class="row">
        ${timeCellHTML(g.row, g.time, g.prec, g.source, g.fallback)}
        <div class="col-snippet expandable" data-hid="${it._id}">${ctxHTML(it)}</div>
        <div class="col-file">
          <div class="fline">${fileTagHTML(g.path, g.name)}<span class="fname" data-open="${esc(g.path)}" title="${esc(t('file.openTitle'))}">${esc(g.name)}</span></div>
          <div class="meta">${esc(t('hits.count', { n: g.count }))}</div>
          <div class="acts">
            ${others.length ? `<span class="more" data-group="${esc(g.path)}">${esc(t('hits.more', { n: others.length }))}</span>` : ''}
            <span class="lk" data-reveal="${esc(g.path)}">${esc(t('file.reveal'))}</span>
          </div>
        </div>
      </div>
      <div class="subwrap" data-subwrap="${esc(g.path)}" style="display:none">
        ${others.map((h) => `<div class="subhit expandable" data-hid="${h._id}">${ctxHTML(h)}</div>`).join('')}
      </div>`;
    }
  } else {
    const flat = shown.slice();
    const dir = sortDesc ? -1 : 1;
    flat.sort((a, b) => {
      const ra = typeRank(a.path, a.name), rb = typeRank(b.path, b.name);
      const ta = docTime(a), tb = docTime(b);
      const byTime = ta !== tb ? (ta - tb) * dir : 0;                            // 时间
      const byType = ra !== rb ? (typeDesc ? (rb - ra) : (ra - rb)) : 0;          // 类型优先级(可升降)
      const byLen = (b.para || '').length - (a.para || '').length;                // 自然段字数 多→少
      return sortKey === 'type' ? (byType || byTime || byLen) : (byTime || byType || byLen);
    });
    for (const it of flat) {
      html += yearBar(docTime(it)) + `<div class="row">
        ${timeCellHTML(it, docTime(it), docPrec(it), docSource(it), isDateFallback(it))}
        <div class="col-snippet expandable" data-hid="${it._id}">${ctxHTML(it)}</div>
        <div class="col-file">
          <div class="fline">${fileTagHTML(it.path, it.name)}<span class="fname" data-open="${esc(it.path)}" title="${esc(t('file.openTitle'))}">${esc(it.name)}</span></div>
          <div class="acts">
            <span class="lk" data-reveal="${esc(it.path)}">${esc(t('file.reveal'))}</span>
          </div>
        </div>
      </div>`;
    }
  }
  rowsEl.innerHTML = html;
}

/* ---------- 浮层小弹窗：改文件类型 / 改显示时间（复用一个挂在 body 上的容器） ---------- */
const popEl = document.createElement('div');
popEl.id = 'popmenu';
document.body.appendChild(popEl);
let popPath = null;
function placePop(anchor) {
  popEl.style.display = 'block';
  const r = anchor.getBoundingClientRect();
  const w = popEl.offsetWidth, h = popEl.offsetHeight;
  let left = r.left, top = r.bottom + 6;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6); // 下方放不下就放上方
  popEl.style.left = Math.max(8, left) + 'px';
  popEl.style.top = top + 'px';
}
function closePop() { popEl.style.display = 'none'; popEl.innerHTML = ''; popPath = null; }
function openTypePopup(anchor, path, curType) {
  popPath = path;
  const items = TYPE_ORDER.map((ty) =>
    `<div class="popitem${ty === curType ? ' cur' : ''}" data-settype="${ty}"><span class="ftag ${TYPE_CLS[ty]}">${typeLabel(ty)}</span>${ty === curType ? '<span class="popck">✓</span>' : ''}</div>`).join('');
  popEl.innerHTML = `<div class="poptitle">${esc(t('pop.typeTitle'))}</div>${items}<div class="popitem popauto" data-settype="__auto">${esc(t('pop.auto'))}</div>`;
  placePop(anchor);
}
function openTimePopup(anchor, path) {
  popPath = path;
  const cur = manualTimes()[path];
  const val = (cur && typeof cur.ts === 'number') ? fmtByPrec(cur.ts, cur.prec) : '';
  popEl.innerHTML = `<div class="poptitle">${esc(t('pop.timeTitle'))}</div>
    <input id="popTimeInput" type="text" placeholder="${esc(t('pop.timePh'))}" value="${esc(val)}" />
    <div class="pophint">${esc(t('pop.timeHint'))}</div>
    <div class="poprow"><span class="popbtn" data-timeok="1">${esc(t('pop.save'))}</span><span class="popbtn ghost" data-timeauto="1">${esc(t('pop.useAuto'))}</span></div>`;
  placePop(anchor);
  const inp = document.getElementById('popTimeInput');
  if (inp) {
    inp.focus(); inp.select();
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); saveManualTimeFromInput(); }
      else if (ev.key === 'Escape') closePop();
    });
  }
}
function fmtByPrec(ts, prec) {
  const d = new Date(ts), y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0'), day = String(d.getUTCDate()).padStart(2, '0');
  return prec === 'y' ? `${y}` : (prec === 'm' ? `${y}-${m}` : `${y}-${m}-${day}`);
}
// 解析手动输入：接受 2022 / 2022-07 / 2022-07-15（也容忍 年月日、/、. 分隔），越界返回 null。
function parseManualTime(s) {
  s = (s || '').trim().replace(/[／./]/g, '-').replace(/[年月]/g, '-').replace(/[日号]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    const y = +m[1], mo = +m[2], d = +m[3], ts = Date.UTC(y, mo - 1, d), check = new Date(ts);
    if (y >= 1900 && y <= 2100 && check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d) return { ts, prec: 'd' };
  }
  else if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) { const y = +m[1], mo = +m[2]; if (y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12) return { ts: Date.UTC(y, mo - 1, 1), prec: 'm' }; }
  else if ((m = /^(\d{4})$/.exec(s))) { const y = +m[1]; if (y >= 1900 && y <= 2100) return { ts: Date.UTC(y, 0, 1), prec: 'y' }; }
  return null;
}
function saveManualTimeFromInput() {
  const inp = document.getElementById('popTimeInput'); if (!inp) return;
  const raw = inp.value.trim();
  if (!raw) { setManualTime(popPath, null); closePop(); toast(t('toast.autoTime')); applyFilter(); return; }
  const d = parseManualTime(raw);
  if (!d) { toast(t('toast.badTime')); return; }
  const p = popPath; setManualTime(p, d); closePop(); toast(t('toast.timeSet', { v: fmtByPrec(d.ts, d.prec) })); applyFilter();
}
popEl.addEventListener('click', (e) => {
  const st = e.target.closest('[data-settype]');
  if (st) {
    const ty = st.dataset.settype, p = popPath;
    if (ty === '__auto') { clearFileType(p); toast(t('toast.autoType')); } else { setFileType(p, ty); toast(t('toast.typeSet', { label: typeLabel(ty) })); }
    closePop(); applyFilter(); return;
  }
  if (e.target.closest('[data-timeok]')) { saveManualTimeFromInput(); return; }
  if (e.target.closest('[data-timeauto]')) { const p = popPath; setManualTime(p, null); closePop(); toast(t('toast.autoTime')); applyFilter(); return; }
});
// 点空白处/滚动/缩放关闭（点开标签或时间格本身不算空白，避免刚打开就被关掉）
document.addEventListener('mousedown', (e) => {
  if (popEl.style.display === 'block' && !popEl.contains(e.target) && !e.target.closest('[data-typepath]') && !e.target.closest('[data-timepath]')) closePop();
}, true);
window.addEventListener('resize', closePop);
rowsEl.addEventListener('scroll', closePop, true);

/* ---------- 交互：排序 / 展开其他 / 打开 / 展开整段 / 复制 ---------- */
rowsEl.addEventListener('click', async (e) => {
  const basis = e.target.closest('[data-timebasis]');
  if (basis) { timeBasis = basis.dataset.timebasis; sortKey = 'time'; render(); return; }
  const sort = e.target.closest('[data-sort]');
  if (sort) { sortDesc = sort.dataset.sort === 'desc'; sortKey = 'time'; render(); return; }
  const tsort = e.target.closest('[data-tsort]');
  if (tsort) { typeDesc = tsort.dataset.tsort === 'desc'; sortKey = 'type'; render(); return; }
  const tcell = e.target.closest('[data-timepath]');
  if (tcell) { e.stopPropagation(); openTimePopup(tcell, tcell.dataset.timepath); return; } // 左侧时间：点击手动修改
  const open = e.target.closest('[data-open]');
  if (open) { e.stopPropagation(); await window.api.openFile(open.dataset.open); return; }
  const rev = e.target.closest('[data-reveal]');
  if (rev) { e.stopPropagation(); await window.api.revealFile(rev.dataset.reveal); return; }
  const tag = e.target.closest('[data-typepath]');
  if (tag) { e.stopPropagation(); openTypePopup(tag, tag.dataset.typepath, tag.dataset.curtype); return; } // 右侧类型：点击弹出菜单选类型
  const more = e.target.closest('[data-group]');
  if (more) {
    const wrap = rowsEl.querySelector(`[data-subwrap="${CSS.escape(more.dataset.group)}"]`);
    if (wrap) { const showing = wrap.style.display !== 'none'; wrap.style.display = showing ? 'none' : 'block'; more.textContent = showing ? t('hits.more', { n: wrap.children.length }) : t('hits.collapse'); }
    return;
  }
  const exp = e.target.closest('.expandable');
  if (!exp) return;
  const it = hitById[exp.dataset.hid];
  if (!it) return;
  if (exp.classList.contains('expanded')) {
    const sel = (window.getSelection && window.getSelection().toString()) || '';
    if (sel.trim()) return;
    exp.classList.remove('expanded');
    exp.innerHTML = ctxHTML(it);
  } else {
    exp.classList.add('expanded');
    exp.innerHTML = hl(it.para, currentKw);
  }
});
rowsEl.addEventListener('contextmenu', async (e) => {
  const exp = e.target.closest('.expandable');
  if (!exp) return;
  e.preventDefault();
  const it = hitById[exp.dataset.hid];
  const sel = (window.getSelection && window.getSelection().toString()) || '';
  const text = sel.trim() ? sel : (it ? it.para : '');
  await window.api.copyText(text);
  toast(sel.trim() ? t('toast.copiedSel') : t('toast.copiedPara'));
});

/* ---------- 首次使用逐步实操引导 ---------- */
// v1.2.0 引导文案多语言化，按约定 ONBOARD_VER 4→5（内容变化让老用户再看一次，顺带按新语言显示）
const ONBOARD_VER = '5';
const tourEl = document.getElementById('tour');
const tourSpot = document.getElementById('tourSpot');
const tourCard = document.getElementById('tourCard');
const tourStepEl = document.getElementById('tourStep');
const tourTitleEl = document.getElementById('tourTitle');
const tourTextEl = document.getElementById('tourText');
const tourWaitEl = document.getElementById('tourWait');
const tourSkip = document.getElementById('tourSkip');
const guideBtn = document.getElementById('guideBtn');
const searchBarEl = searchInput.closest('.searchbar');
let tourCurrent = '';
let tourTarget = null;
let tourSpotTarget = null;
const TOUR_STEPS = ['logo', 'add', 'index', 'search'];
function tourCopy(step) {
  const n = TOUR_STEPS.indexOf(step) + 1;
  return {
    no: t('tour.step', { n, total: TOUR_STEPS.length }),
    title: t(`tour${n}.title`),
    text: t(`tour${n}.text`),
    wait: t(`tour${n}.wait`)
  };
}
function targetForTour(step) {
  return step === 'logo' ? logoBtn : (step === 'add' ? addBtn : (step === 'index' ? indexBtn : searchInput));
}
function spotTargetForTour(step) {
  // 第四步要框住完整的胶囊搜索框，而不只是内部 input。
  // 可操作目标仍是 input，因此引导中不会误放行右侧设置/视图按钮。
  return step === 'search' ? searchBarEl : targetForTour(step);
}
function layoutRectIgnoringTransforms(el) {
  let left = 0;
  let top = 0;
  for (let cur = el; cur; cur = cur.offsetParent) {
    left += cur.offsetLeft;
    top += cur.offsetTop;
  }
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  return { left, top, width, height, right: left + width, bottom: top + height };
}
function positionTour() {
  if (!tourCurrent || !tourTarget || !tourSpotTarget || !tourEl.classList.contains('show')) return;
  // 左侧按钮的外层在展开时有 transform。用布局坐标直接定位到动画结束点，
  // 避免高亮圆逐帧重启 CSS 缓动而出现追赶、卡顿或最终错位。
  const r = tourCurrent === 'add' || tourCurrent === 'index'
    ? layoutRectIgnoringTransforms(tourSpotTarget)
    : tourSpotTarget.getBoundingClientRect();
  const pad = tourCurrent === 'search' ? 7 : 8;
  tourSpot.style.width = (r.width + pad * 2) + 'px';
  tourSpot.style.height = (r.height + pad * 2) + 'px';
  // 位移只交给合成层，不再逐帧改 left/top 触发布局和大范围阴影重绘。
  tourSpot.style.transform = `translate3d(${r.left - pad}px, ${r.top - pad}px, 0)`;
  tourSpot.style.borderRadius = tourCurrent === 'search' ? '32px' : '50%';

  const cardW = Math.min(330, window.innerWidth - 32);
  const cardH = tourCard.offsetHeight || 190;
  let left = r.right + 24;
  let top = Math.max(16, r.top - 8);
  if (left + cardW > window.innerWidth - 16) {
    left = Math.max(16, Math.min(window.innerWidth - cardW - 16, r.left));
    top = r.bottom + 22;
    if (top + cardH > window.innerHeight - 16) top = Math.max(16, r.top - cardH - 22);
  }
  tourCard.style.left = left + 'px';
  tourCard.style.top = top + 'px';
}
function showTourStep(step) {
  const copy = tourCopy(step);
  if (!copy || !tourEl) return;
  if (tourSpotTarget) tourSpotTarget.classList.remove('tour-target');
  tourCurrent = step;
  if (step === 'add' || step === 'index') app.classList.add('expanded', 'touched');
  tourTarget = targetForTour(step);
  tourSpotTarget = spotTargetForTour(step);
  tourSpotTarget.classList.add('tour-target');
  tourStepEl.textContent = copy.no;
  tourTitleEl.textContent = copy.title;
  tourTextEl.textContent = copy.text;
  tourWaitEl.textContent = copy.wait;
  tourEl.classList.add('show');
  requestAnimationFrame(positionTour);
  if (step === 'search') { searchInput.focus(); showSearchHistory(); }
}
function startTour() {
  closePanel(); hideSearchHistory(); closePop();
  app.classList.remove('expanded');
  showTourStep('logo');
}
function finishTour(completed) {
  if (tourSpotTarget) tourSpotTarget.classList.remove('tour-target');
  tourTarget = null; tourSpotTarget = null; tourCurrent = '';
  if (tourEl) tourEl.classList.remove('show');
  try { localStorage.setItem('onboarded', ONBOARD_VER); } catch {}
  if (completed) toast(t('toast.tourDone'));
}
function tourAction(action) {
  if (!tourCurrent) return;
  if (tourCurrent === 'logo' && action === 'logo' && app.classList.contains('expanded')) {
    // 引导必须严格按 1→2→3→4 进行。即使升级用户已有历史文件夹/索引，
    // 也不能从第 1 步跳到第 3/4 步，否则用户无法学到完整操作链。
    showTourStep('add');
  } else if (tourCurrent === 'add' && action === 'folder' && folders.length) showTourStep('index');
  else if (tourCurrent === 'index' && action === 'indexed' && indexed) showTourStep('search');
  else if (tourCurrent === 'search' && action === 'searched' && searchInput.value.trim()) finishTour(true);
}
function tourBusy(text) { if (tourCurrent === 'index' && tourWaitEl) tourWaitEl.textContent = text; }
function maybeStartTour() {
  try { if (localStorage.getItem('onboarded') !== ONBOARD_VER) startTour(); } catch { startTour(); }
}
if (tourSkip) tourSkip.addEventListener('click', () => finishTour(false));
if (guideBtn) guideBtn.addEventListener('click', startTour);
window.addEventListener('resize', positionTour);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tourCurrent) finishTour(false); });
// 引导中只允许操作当前高亮控件和“暂不引导”，防止误点导致步骤与界面失配。
document.addEventListener('click', (e) => {
  if (!tourCurrent || !tourTarget || tourCard.contains(e.target) || tourTarget.contains(e.target)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  positionTour();
}, true);
