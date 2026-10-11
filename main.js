// 主进程：开窗口、选文件夹、建索引/搜索，并把索引持久化到本地。
// 全部本地运行，不联网、无后台服务。
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { buildIndex } = require('./engine/indexer');
const { search } = require('./engine/search');
const persist = require('./engine/persist');
// promo/ 仅为录屏演示工具（含示例数据），不打进正式包；正式包 asar 内无此模块，
// 这里容错回退为“非演示”，保证生产环境正常启动（demoMode.* 调用均被 DEMO_MODE 门控，永不触发）。
let demoMode;
try { demoMode = require('./promo/demo-data/demoMode'); }
catch { demoMode = { isDemoMode: () => false }; }

const DEMO_MODE = demoMode.isDemoMode();

// Windows / 国产麒麟(信创) 的弱 GPU 环境默认只关闭硬件加速；Chromium 沙箱保持开启。
// 极少数受管控机器若仍出现 launch-failed，可由运维显式设置 QUICKDOCS_DISABLE_SANDBOX=1
// 启用兼容模式。不要把 no-sandbox 作为所有用户的默认配置。
if (process.platform === 'win32' || process.platform === 'linux') {
  app.disableHardwareAcceleration();
  if (process.env.QUICKDOCS_DISABLE_SANDBOX === '1') {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
  }
}

let win;
let tray = null;
let isQuiting = false;            // true 时才真正退出（否则关闭窗口=隐藏到托盘）
const DEFAULT_HOTKEY = 'CommandOrControl+Shift+Space'; // 默认全局呼出/隐藏快捷键
let currentHotkey = DEFAULT_HOTKEY;
let indexData = null; // 当前内存中的索引
let buildInProgress = false;
const authorizedFolders = new Set(); // 仅允许索引由系统文件夹选择器授权过的目录
let indexedPaths = new Set();        // 仅允许打开当前索引中实际存在的文件
const APP_URL = pathToFileURL(path.join(__dirname, 'index.html')).href;

function syncIndexAccess() {
  indexedPaths = new Set((indexData && indexData.docs || []).map((d) => path.resolve(d.path)));
  for (const folder of (indexData && indexData.folders || [])) authorizedFolders.add(path.resolve(folder));
}

function requireTrustedSender(event) {
  const senderUrl = (event.senderFrame && event.senderFrame.url) || (event.sender && event.sender.getURL()) || '';
  if (senderUrl !== APP_URL) throw new Error('拒绝来自非应用页面的请求');
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    requireTrustedSender(event);
    return fn(event, ...args);
  });
}

// 全局错误兜底：把崩溃写进日志并尽量弹框，避免“白屏闪退”查不到原因。
// 日志路径：userData/快文-错误日志.txt（Windows 即 %APPDATA%\doc-search\）。
function logPath() { try { return path.join(app.getPath('userData'), '快文-错误日志.txt'); } catch { return null; } }
function errLog(tag, info) {
  const line = `[${new Date().toISOString()}] ${tag}: ${(info && info.stack) || info}\n`;
  try {
    const p = logPath();
    if (p) {
      // 防日志无限增长：超过 512KB 就轮转为 .old（仅留一份备份，总占用封顶约 1MB）
      try { if (fs.statSync(p).size > 512 * 1024) fs.renameSync(p, p + '.old'); } catch {}
      fs.appendFileSync(p, line);
    }
  } catch {}
  try { console.error(line); } catch {}
}
process.on('uncaughtException', (e) => { errLog('uncaughtException', e); try { dialog.showErrorBox(mt('err.title'), String((e && e.stack) || e) + mt('err.logSuffix') + logPath()); } catch {} });
process.on('unhandledRejection', (e) => errLog('unhandledRejection', e));

// 轻量配置持久化（呼出快捷键等），存 userData/config.json
function configPath() { return path.join(app.getPath('userData'), 'config.json'); }
function loadConfig() { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; } }
function saveConfig(c) { try { fs.writeFileSync(configPath(), JSON.stringify(c)); } catch {} }

// ---- 主进程界面语言（托盘菜单 / 系统对话框），与渲染层 i18n.js 字典同步维护 ----
const UI_LANGS = ['zh', 'en', 'fr', 'es'];
const MT = {
  'tray.show':    { zh: '显示 / 呼出快文', en: 'Show QuickDocs', fr: 'Afficher QuickDocs', es: 'Mostrar QuickDocs' },
  'tray.hide':    { zh: '隐藏到后台', en: 'Hide to background', fr: 'Masquer en arrière-plan', es: 'Ocultar en segundo plano' },
  'tray.hotkey':  { zh: '呼出快捷键', en: 'Hotkey', fr: 'Raccourci', es: 'Atajo' },
  'tray.quit':    { zh: '退出快文', en: 'Quit QuickDocs', fr: 'Quitter QuickDocs', es: 'Salir de QuickDocs' },
  'tray.tooltip': { zh: '快文 — 本地文档内容搜索', en: 'QuickDocs — local document content search', fr: 'QuickDocs — recherche locale dans vos documents', es: 'QuickDocs — búsqueda local en documentos' },
  'app.name':     { zh: '快文', en: 'QuickDocs', fr: 'QuickDocs', es: 'QuickDocs' },
  'dlg.cancel':   { zh: '取消', en: 'Cancel', fr: 'Annuler', es: 'Cancelar' },
  'dlg.clearOk':  { zh: '清空索引', en: 'Clear index', fr: 'Effacer l’index', es: 'Borrar índice' },
  'dlg.clearTitle': { zh: '清空索引', en: 'Clear Index', fr: 'Effacer l’index', es: 'Borrar el índice' },
  'dlg.clearMsg': { zh: '确定清空全部索引吗？', en: 'Clear the entire index?', fr: 'Effacer tout l’index ?', es: '¿Borrar todo el índice?' },
  'dlg.clearDetail': { zh: '这会删除快文保存的文档正文副本和索引数据，但不会删除原始文件。', en: 'This deletes the document text copies and index data saved by QuickDocs. Your original files are not touched.', fr: 'Cela supprime les copies de texte et les données d’index enregistrées par QuickDocs. Vos fichiers d’origine ne sont pas touchés.', es: 'Esto elimina las copias de texto y los datos del índice guardados por QuickDocs. Tus archivos originales no se tocan.' },
  'stage.saving': { zh: '正在保存索引到磁盘（请稍候，不要关闭窗口）…', en: 'Saving index to disk (please wait — do not close the window)…', fr: 'Enregistrement de l’index sur le disque (veuillez patienter, ne fermez pas la fenêtre)…', es: 'Guardando el índice en disco (espera, no cierres la ventana)…' },
  'err.title':    { zh: '快文启动/运行出错', en: 'QuickDocs startup/runtime error', fr: 'Erreur QuickDocs', es: 'Error de QuickDocs' },
  'err.crashed':  { zh: '快文界面进程异常退出', en: 'The QuickDocs UI process exited unexpectedly', fr: 'Le processus d’interface QuickDocs a quitté inopinément', es: 'El proceso de interfaz de QuickDocs se cerró inesperadamente' },
  'err.logSuffix': { zh: '\n\n详见日志：', en: '\n\nSee log: ', fr: '\n\nVoir le journal : ', es: '\n\nVer registro: ' }
};
function uiLang() {
  const c = loadConfig();
  if (c.uiLang && UI_LANGS.includes(c.uiLang)) return c.uiLang;
  const loc = (app.getLocale() || 'zh').toLowerCase();
  for (const l of UI_LANGS) if (loc.startsWith(l)) return l;
  return 'zh';
}
function mt(key) { const e = MT[key]; return e ? (e[uiLang()] || e.zh) : key; }

function createWindow() {
  const isMac = process.platform === 'darwin';
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 820,
    minHeight: 580,
    title: DEMO_MODE ? '快文 QuickDocs' : mt('app.name'),
    // Windows/Linux 不显示 Electron 默认 File/Edit/View/Window 菜单行，只保留快文自身界面。
    autoHideMenuBar: !isMac,
    // macOS：系统级毛玻璃 + 隐藏式标题栏（交通灯内嵌）；其他系统优雅降级
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: 'active',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 20, y: 20 } : undefined, // 红黄绿按钮放到 LOGO 正上方、左对齐
    backgroundColor: isMac ? '#00000000' : '#eef0f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (!isMac) {
    win.setMenu(null);
    win.setMenuBarVisibility(false);
  }
  win.loadFile('index.html').catch((e) => errLog('loadFile', e));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (url !== APP_URL) e.preventDefault(); });
  // 渲染/预加载失败或渲染进程崩溃时记录，便于定位“白屏”
  win.webContents.on('did-fail-load', (_e, code, desc, url) => errLog('did-fail-load', `${code} ${desc} ${url}`));
  win.webContents.on('preload-error', (_e, p, err) => errLog('preload-error', `${p} ${(err && err.stack) || err}`));
  win.webContents.on('render-process-gone', (_e, d) => { errLog('render-process-gone', JSON.stringify(d)); try { dialog.showErrorBox(mt('err.crashed'), JSON.stringify(d) + mt('err.logSuffix') + logPath()); } catch {} });

  // 关闭窗口=隐藏到后台（留在菜单栏托盘），真正退出走托盘「退出」或 Cmd+Q
  win.on('close', (e) => {
    if (!isQuiting) { e.preventDefault(); win.hide(); }
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  win.show(); win.focus();
}
function toggleWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isVisible() && win.isFocused()) win.hide();
  else { win.show(); win.focus(); }
}

// 菜单栏托盘：呼出 / 隐藏到后台 / 直接退出
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: mt('tray.show'), click: showWindow },
    { label: mt('tray.hide'), click: () => win && win.hide() },
    { type: 'separator' },
    { label: `${mt('tray.hotkey')}  ${currentHotkey.replace('CommandOrControl', '⌘')}`, enabled: false },
    { type: 'separator' },
    { label: mt('tray.quit'), click: () => { isQuiting = true; app.quit(); } }
  ]);
}
function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
    tray.setToolTip(DEMO_MODE ? '快文 QuickDocs — Demo Mode' : mt('tray.tooltip'));
    tray.setContextMenu(trayMenu());
    tray.on('click', showWindow); // 单击托盘呼出（Win/Linux 友好）
  } catch (e) {
    console.error('create tray failed:', e.message);
  }
}

// 注册/切换全局呼出快捷键；失败则回退到当前可用键
function registerHotkey(accel) {
  globalShortcut.unregisterAll();
  try {
    if (globalShortcut.register(accel, toggleWindow)) {
      currentHotkey = accel;
      if (tray) tray.setContextMenu(trayMenu());
      return true;
    }
  } catch {}
  try { globalShortcut.register(currentHotkey, toggleWindow); } catch {}
  return false;
}

// 单实例锁：避免旧实例常驻托盘时再次启动产生多个进程（会让人看到旧版本界面）
if (!DEMO_MODE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (!DEMO_MODE) app.on('second-instance', () => showWindow()); // 再次启动时唤起已有窗口
  app.on('child-process-gone', (_e, d) => errLog('child-process-gone', JSON.stringify(d))); // GPU/工具子进程被杀(如被安全软件拦)
  app.whenReady().then(() => {
    errLog('startup', `app ready · platform=${process.platform} · resourcesPath=${process.resourcesPath} · exec=${process.execPath}`);
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    currentHotkey = loadConfig().hotkey || DEFAULT_HOTKEY;
    createWindow();
    createTray();
    if (!globalShortcut.register(currentHotkey, toggleWindow)) {
      console.warn('呼出快捷键注册失败（可能被其他应用占用）：', currentHotkey);
    }
  });
}

// 呼出快捷键：读取与设置（设置弹窗里自定义）
handle('get-hotkey', () => currentHotkey);

handle('get-ui-lang', () => uiLang());
handle('set-ui-lang', (_e, l) => {
  if (typeof l !== 'string' || !UI_LANGS.includes(l)) return false;
  const c = loadConfig(); c.uiLang = l; saveConfig(c);
  if (tray) { tray.setContextMenu(trayMenu()); tray.setToolTip(DEMO_MODE ? '快文 QuickDocs — Demo Mode' : mt('tray.tooltip')); }
  return true;
});
handle('set-hotkey', (_e, accel) => {
  if (typeof accel !== 'string' || accel.length > 80 || !/^[A-Za-z0-9+]+$/.test(accel)) {
    return { ok: false, accel: currentHotkey };
  }
  const ok = registerHotkey(accel);
  if (ok) { const c = loadConfig(); c.hotkey = accel; saveConfig(c); }
  return { ok, accel: currentHotkey };
});

app.on('before-quit', () => { isQuiting = true; });   // 标记真正退出，放行窗口关闭
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {});                 // 不随窗口关闭而退出（常驻托盘）
app.on('activate', showWindow);                        // 点 Dock 图标重新呼出

// 界面启动后询问：是否有上次保存的索引可直接用（只读 meta.json，正文懒加载，启动快）
handle('get-state', async () => {
  if (DEMO_MODE) return demoMode.getState();
  if (!indexData) indexData = await persist.openIndex();
  if (indexData) {
    syncIndexAccess();
    const folders = indexData.folders || [];
    return { folders, count: indexData.docs.length, builtAt: indexData.builtAt, ocr: !!indexData.ocr };
  }
  return null;
});

// 选择文件夹：允许一次选多个
handle('pick-folders', async () => {
  if (DEMO_MODE) return demoMode.getFolders();
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'multiSelections'] });
  if (r.canceled || !r.filePaths.length) return [];
  for (const folder of r.filePaths) authorizedFolders.add(path.resolve(folder));
  return r.filePaths;
});

// 建立/更新索引：传入文件夹数组，自动增量复用，完成后保存到磁盘
handle('build-index', async (_e, folders, options = {}) => {
  if (buildInProgress) throw new Error('已有索引任务正在运行');
  const sendProgress = (p) => { if (win && !win.isDestroyed()) win.webContents.send('index-progress', p); };
  if (DEMO_MODE) {
    sendProgress({ stage: '演示模式：正在建立示例资料库索引…' });
    return demoMode.getBuildResult();
  }
  if (!Array.isArray(folders) || folders.length === 0 || folders.length > 64) throw new Error('搜索文件夹参数无效');
  folders = [...new Set(folders.map((p) => typeof p === 'string' ? path.resolve(p) : ''))].filter(Boolean);
  if (!folders.length || folders.some((p) => !path.isAbsolute(p) || !authorizedFolders.has(p))) {
    throw new Error('包含未经文件夹选择器授权的目录');
  }
  buildInProgress = true;
  try {
    // 复用内存里已加载的索引作为 prev，避免再从磁盘读+parse 一遍（千份文档时这一步很贵）
    const prev = indexData || await persist.openIndex();
    const prevTokens = prev ? await persist.loadTokens(prev) : {};
    const built = await buildIndex(folders, prev, sendProgress, { ...options, prevTokens });
    // 无任何文件变化：buildIndex 已判定内容与上次完全一致，沿用已加载索引，跳过关闭/重写。
    if (built.unchanged) {
      indexData = prev;
      syncIndexAccess();
      return { count: built.count, skipped: built.skipped, reused: built.reused, total: built.total,
               ignoredImages: built.ignoredImages || 0, unchanged: true };
    }
    // 保存前关闭旧正文读取器，避免 Windows 阻止清理上一代文件。
    if (prev && prev.close) prev.close();
    // 写盘是大量正文落盘，可能数秒到数十秒且无逐项进度——先给个明确提示，避免误判为假死
    sendProgress({ stage: mt('stage.saving') });
    const saved = await persist.saveIndex(built);
    indexData = saved;
    syncIndexAccess();
    return {
      count: indexData.docs.length,
      skipped: built.skipped,
      reused: built.reused,
      total: built.total,
      ignoredImages: built.ignoredImages || 0
    };
  } finally {
    buildInProgress = false;
  }
});

handle('clear-index', async () => {
  if (buildInProgress) throw new Error('索引正在建立，请完成后再清空');
  if (DEMO_MODE) return { ok: true };
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: [mt('dlg.cancel'), mt('dlg.clearOk')],
    defaultId: 0,
    cancelId: 0,
    title: mt('dlg.clearTitle'),
    message: mt('dlg.clearMsg'),
    detail: mt('dlg.clearDetail')
  });
  if (result.response !== 1) return { ok: false };
  if (indexData && indexData.close) indexData.close();
  indexData = null;
  indexedPaths.clear();
  authorizedFolders.clear();
  await persist.clearIndex();
  return { ok: true };
});

handle('search', async (_e, keyword) => {
  if (DEMO_MODE) return { ready: true, results: demoMode.search(keyword) };
  if (!indexData) return { ready: false, results: [] };
  if (typeof keyword !== 'string' || keyword.length > 500) return { ready: true, results: [] };
  return { ready: true, results: search(indexData, keyword) };
});

handle('copy-text', async (_e, text) => {
  if (typeof text !== 'string' || text.length > 5_000_000) return false;
  clipboard.writeText(text);
  return true;
});
handle('reveal-file', async (_e, p) => {
  const resolved = typeof p === 'string' ? path.resolve(p) : '';
  if (!DEMO_MODE && indexedPaths.has(resolved)) shell.showItemInFolder(resolved);
  return indexedPaths.has(resolved);
});
handle('open-file', async (_e, p) => {
  const resolved = typeof p === 'string' ? path.resolve(p) : '';
  if (DEMO_MODE) return true;
  if (!indexedPaths.has(resolved)) return false;
  return (await shell.openPath(resolved)) === '';
});
