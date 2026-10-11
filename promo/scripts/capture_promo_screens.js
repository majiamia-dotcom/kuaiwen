const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

process.env.QUICKDOCS_DEMO = '1';
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'promo/export/screens');
const PRELOAD = path.join(ROOT, 'promo/scripts/promo-preload.js');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJS(win, code) {
  const result = await win.webContents.executeJavaScript(`(async () => {
    try {
${code}
    } catch (error) {
      return { __promoError: String((error && error.stack) || error) };
    }
  })()`, true);
  if (result && result.__promoError) throw new Error(result.__promoError);
  return result;
}

async function capture(win, name, delay = 500) {
  await wait(delay);
  let image = await win.webContents.capturePage({ x: 0, y: 0, width: 1920, height: 1080 });
  const size = image.getSize();
  if (size.width !== 1920 || size.height !== 1080) {
    image = image.resize({ width: 1920, height: 1080, quality: 'best' });
  }
  fs.writeFileSync(path.join(OUT, name), image.toPNG());
}

async function resetForCapture(win) {
  await runJS(win, `
    try {
      localStorage.setItem('onboarded', '1');
      localStorage.removeItem('colWidths');
      localStorage.removeItem('typeOverrides');
      localStorage.removeItem('timeOverrides');
    } catch {}
    document.getElementById('onboard')?.classList.remove('show');
    document.getElementById('app')?.classList.remove('expanded', 'panelopen');
    document.getElementById('folderPanel')?.classList.remove('open');
    document.getElementById('scrim')?.classList.remove('open');
    const credit = document.querySelector('.credit');
    if (credit) credit.textContent = 'QuickDocs Demo';
  `);
}

async function setSearch(win, value) {
  await runJS(win, `
    const input = document.getElementById('searchInput');
    input.disabled = false;
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return (typeof doSearch === 'function' ? doSearch() : Promise.resolve());
  `);
  await wait(650);
}

async function debugCaptureState(win, label) {
  if (process.env.PROMO_CAPTURE_DEBUG !== '1') return;
  const info = await runJS(win, `
    return window.api.search('关键词A').then((r) => ({
      label: ${JSON.stringify(label)},
      apiResults: r.results.length,
      currentKw: typeof currentKw === 'undefined' ? null : currentKw,
      indexed: typeof indexed === 'undefined' ? null : indexed,
      lastResults: typeof lastResults === 'undefined' ? null : lastResults.length,
      shown: typeof shown === 'undefined' ? null : shown.length,
      rowsHtml: document.getElementById('rows').innerHTML.length,
      rowsText: document.getElementById('rows').innerText.slice(0, 120)
    }));
  `);
  console.log(JSON.stringify(info, null, 2));
}

async function addFakeFolderPicker(win) {
  await runJS(win, `
    const old = document.getElementById('promo-folder-picker');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'promo-folder-picker';
    el.innerHTML = \`
      <div class="pf-card">
        <div class="pf-title">选择文件夹</div>
        <div class="pf-sub">添加需要检索的本地资料库</div>
        <div class="pf-row selected"><span>示例资料库</span><small>政策资料 / 规划资料 / 规范资料</small></div>
        <div class="pf-row"><span>会议资料</span><small>纪要、记录与归档材料</small></div>
        <div class="pf-actions"><button>取消</button><button class="primary">添加文件夹</button></div>
      </div>\`;
    const style = document.createElement('style');
    style.textContent = \`
      #promo-folder-picker { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; background: rgba(15,23,42,.22); backdrop-filter: blur(5px); }
      #promo-folder-picker .pf-card { width: 520px; border-radius: 18px; background: rgba(255,255,255,.98); box-shadow: 0 32px 80px rgba(0,0,0,.24); padding: 28px; font-family: -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif; color: #111827; }
      #promo-folder-picker .pf-title { font-size: 22px; font-weight: 850; margin-bottom: 6px; }
      #promo-folder-picker .pf-sub { font-size: 13px; color: #6b7280; margin-bottom: 18px; }
      #promo-folder-picker .pf-row { border: 1px solid rgba(43,94,245,.18); border-radius: 14px; padding: 14px 16px; margin: 10px 0; display: flex; align-items: center; justify-content: space-between; }
      #promo-folder-picker .pf-row.selected { border-color: #2b5ef5; box-shadow: 0 0 0 4px rgba(43,94,245,.12); }
      #promo-folder-picker .pf-row span { font-size: 15px; font-weight: 800; }
      #promo-folder-picker .pf-row small { color: #6b7280; font-size: 12px; }
      #promo-folder-picker .pf-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
      #promo-folder-picker button { border: 0; border-radius: 999px; padding: 10px 18px; font-weight: 800; background: #eef2ff; color: #334155; }
      #promo-folder-picker button.primary { background: #2b5ef5; color: #fff; }
    \`;
    el.appendChild(style);
    document.body.appendChild(el);
  `);
}

async function addLogoEnd(win) {
  await runJS(win, `
    const old = document.getElementById('promo-logo-end');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'promo-logo-end';
    el.innerHTML = \`
      <div class="end-bg"></div><div class="end-texture"></div>
      <div class="end-glow a"></div><div class="end-glow b"></div><div class="end-glow c"></div>
      <div class="end-lockup">
        <div class="end-icon"><img src="assets/icon.png" alt=""></div>
        <div class="end-name">快文 <span>QuickDocs</span></div>
        <div class="end-slogan">搜文件，不如搜正文</div>
      </div>\`;
    const style = document.createElement('style');
    style.textContent = \`
      #promo-logo-end { position: fixed; inset: 0; z-index: 500; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #07122f; color: #fff; font-family: -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif; isolation: isolate; }
      #promo-logo-end .end-bg { position: absolute; inset: -9%; z-index: 0; background: radial-gradient(48% 54% at 13% 39%, rgba(22,200,255,.9) 0%, rgba(36,213,242,.46) 29%, rgba(22,200,255,0) 61%), radial-gradient(50% 56% at 50% 22%, rgba(106,34,255,.94) 0%, rgba(124,58,237,.58) 34%, rgba(106,34,255,0) 67%), radial-gradient(48% 50% at 47% 76%, rgba(255,60,157,.88) 0%, rgba(224,23,143,.43) 35%, rgba(224,23,143,0) 68%), radial-gradient(42% 62% at 91% 41%, rgba(10,16,64,.96) 0%, rgba(7,18,47,.95) 50%, rgba(7,18,47,0) 78%), linear-gradient(125deg, #10155a 0%, #25127a 28%, #3922a8 46%, #0a1040 78%, #07122f 100%); background-size: 122% 122%; filter: saturate(1.12) contrast(1.04); animation: endGradientDrift 14s ease-in-out infinite alternate, endColorBreath 9s ease-in-out infinite alternate; }
      #promo-logo-end .end-texture { position: absolute; inset: 0; z-index: 1; opacity: .2; mix-blend-mode: soft-light; background: linear-gradient(100deg, rgba(255,255,255,.06), transparent 18%, rgba(255,255,255,.04) 44%, transparent 72%), repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 1px, transparent 1px 19px); animation: endTextureFloat 18s ease-in-out infinite alternate; }
      #promo-logo-end .end-glow { position: absolute; border-radius: 50%; filter: blur(82px); z-index: 2; }
      #promo-logo-end .end-glow.a { width: 760px; height: 720px; left: -180px; top: 230px; background: #16c8ff; opacity: .34; animation: endGlowLeft 13s ease-in-out infinite alternate; }
      #promo-logo-end .end-glow.b { width: 820px; height: 760px; left: 520px; bottom: -330px; background: #ff3c9d; opacity: .34; animation: endGlowBottom 15s ease-in-out infinite alternate; }
      #promo-logo-end .end-glow.c { width: 620px; height: 620px; right: -170px; top: 105px; background: #0a1040; opacity: .5; animation: endGlowLeft 17s ease-in-out infinite alternate-reverse; }
      #promo-logo-end .end-lockup { position: relative; z-index: 3; text-align: center; }
      #promo-logo-end .end-icon { width: 190px; height: 190px; margin: 0 auto 32px; border-radius: 50%; overflow: hidden; box-shadow: 0 30px 96px rgba(4,0,25,.38); background: #111827; display: flex; align-items: center; justify-content: center; }
      #promo-logo-end .end-icon img { width: 86%; height: 86%; object-fit: contain; display: block; }
      #promo-logo-end .end-name { font-size: 76px; line-height: 1; font-weight: 900; letter-spacing: 0; text-shadow: 0 22px 70px rgba(4,0,25,.34); }
      #promo-logo-end .end-name span { font-weight: 760; opacity: .92; }
      #promo-logo-end .end-slogan { margin-top: 26px; font-size: 34px; font-weight: 700; opacity: .92; text-shadow: 0 12px 46px rgba(4,0,25,.28); }
      @keyframes endGradientDrift { 0% { transform: translate3d(-1.8%, -1.2%, 0) scale(1.02); background-position: 0% 45%; } 45% { transform: translate3d(1.4%, .8%, 0) scale(1.05); background-position: 54% 52%; } 100% { transform: translate3d(2.6%, -1.4%, 0) scale(1.04); background-position: 100% 42%; } }
      @keyframes endColorBreath { 0% { filter: saturate(1.03) hue-rotate(-5deg) brightness(.96) contrast(1.05); } 100% { filter: saturate(1.22) hue-rotate(8deg) brightness(1.04) contrast(1.08); } }
      @keyframes endTextureFloat { 0% { transform: translateX(-28px); opacity: .14; } 100% { transform: translateX(38px); opacity: .24; } }
      @keyframes endGlowLeft { 0% { transform: translate3d(-24px, 18px, 0) scale(1); opacity: .34; } 100% { transform: translate3d(58px, -34px, 0) scale(1.08); opacity: .46; } }
      @keyframes endGlowBottom { 0% { transform: translate3d(26px, 22px, 0) scale(1); opacity: .33; } 100% { transform: translate3d(-46px, -30px, 0) scale(1.1); opacity: .47; } }
    \`;
    el.appendChild(style);
    document.body.appendChild(el);
  `);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await win.loadFile(path.join(ROOT, 'index.html'));
  await wait(900);
  await resetForCapture(win);

  await runJS(win, `document.getElementById('status').textContent = '已加载演示索引：1286 份文档（2026-06-18 建立）。可直接搜索。';`);
  await capture(win, '00_home.png');

  await runJS(win, `document.getElementById('logoBtn').click();`);
  await capture(win, '01_actions.png');

  await addFakeFolderPicker(win);
  await capture(win, '02_choose_folder.png');
  await runJS(win, `document.getElementById('promo-folder-picker')?.remove();`);

  await runJS(win, `document.getElementById('status').textContent = '✅ 索引完成：共 1286 份文档（复用未改动 420 份，跳过 0 个）。即输即搜。';`);
  await capture(win, '03_index_done.png');

  await setSearch(win, '关键词A');
  await debugCaptureState(win, 'after-search');
  await capture(win, '04_search_input.png');

  await capture(win, '05_results_grouped.png');

  await runJS(win, `document.querySelector('.expandable')?.click();`);
  await capture(win, '06_result_highlight.png');

  await runJS(win, `document.getElementById('settingsBtn').click();`);
  await capture(win, '07_filter_panel.png');

  await runJS(win, `
    document.getElementById('fpClose')?.click();
    if (document.getElementById('app').classList.contains('expanded')) document.getElementById('logoBtn').click();
    document.getElementById('foldBtn').click();
  `);
  await capture(win, '08_flat_results.png');

  await addLogoEnd(win);
  await capture(win, '09_logo_end.png');

  win.destroy();
  app.quit();
}

app.whenReady().then(main).catch((error) => {
  console.error(error);
  app.quit();
});
