# 快文（DocSearch）— 项目交接文档

> 给下一个会话/开发者：读完这份就能接手。全程**简体中文**，软件定位是**纯本地、离线、无后台**。

---

## 1. 项目简介

面向政企机关文秘/技术人员的**纯本地、离线**文档**内容**搜索器——搜的是文件**里面的文字**，
不是文件名。卖点：格式兼容广（含国产红头 **OFD**）、中文检索准、千份文件启动稳、开箱即用、不联网无后台。

典型用法：选若干文件夹 → 建索引 → 即输即搜，命中正文按"文件分组/时间/类型"排列，可展开整段、定位文件（点文件名直接打开）。

---

## 2. 技术栈

- **外壳**：Electron 44.1.1。一套代码跨 Mac / Win / 麒麟。macOS 用 vibrancy 毛玻璃 + 隐藏标题栏。
- **索引**：纯 JS 内存倒排索引 + 自研磁盘持久化（**非 SQLite，零原生编译依赖**）。
- **中文检索**：二元分词（bigram，无需词典，保证任意子串可被检索）。
- **解析**：txt/csv/md、docx、pptx/pptm/ppsx/potx、xlsx/xlsm、ofd（自研 zip+XML）、pdf（`pdfjs-dist@6.3.289`，锁版本）、doc/wps（`word-extractor`）。
- **OCR（可选）**：`tesseract.js` + `@napi-rs/canvas`，JPG/PNG/BMP/WebP/TIFF 与扫描 PDF 转图识别中文；只接受 `langs/` 或发行包内置语言包，不静默联网下载。
- **打包**：`electron-builder` 26.15.3。镜像可走 npmmirror。
- 无前端框架，界面是原生 HTML/CSS/JS（`index.html` + `renderer.js`）。

---

## 3. 目录结构与关键文件

```
main.js              主进程：开窗、选文件夹、建索引/搜索、IPC、持久化、托盘、全局快捷键、单实例锁
preload.js           contextBridge 安全桥，向渲染层暴露 window.api（get-state/search/build-index 等）
index.html           界面结构 + 全部样式（UI v2 浅色磨砂方案）
renderer.js          界面逻辑（见下「已完成功能」全在这里）
engine/
  tokenize.js        中文二元分词
  extract.js         各格式文本抽取（含 pdf/ofd；dedupeCJKSpaces 清理汉字间空格）
  indexer.js         递归扫描 + 增量建索引（按 mtime 复用；EXTRACT_VERSION 变更则全量重建）
  extractPool.js     抽取 worker 线程池（解析+分词多核并行；创建失败自动回退串行）
  extractWorker.js   worker 入口：单文件解析+分词，结果回主线程
  search.js          倒排筛选 + 上下文片段 + 整段全文 + 正文/标题(目录)分类
  persist.js         索引持久化（meta 原子指向分代 texts/tokens，正文懒加载、损坏校验、可彻底清空）
  ocr.js             扫描件 OCR
assets/              logo-mark.svg（回形针 LOGO，已内联进 index.html）、icon.icns/ico/png、tray.png
启动.command         Mac 一键启动器（封装内核下载+依赖安装+启动）
启动_Windows.bat     Win 启动器
运行说明.md          面向最终用户的使用说明
dist/                electron-builder 本机构建产物目录（不入库；当前工作副本未保留历史安装包）
示例文档/            测试用样例文件
```

### 数据流（一句话）
渲染层 `window.api.*` → preload → main.js 的 `ipcMain.handle` → engine。索引存在
**Electron userData/indexes/**（不在工程目录，重新解压工程不丢索引）。

---

## 4. 已完成的功能

**引擎/性能**
- 多文件夹递归建索引；增量复用（未改动文件按 mtime 跳过重新解析+分词）。
- **无改动快路径**：点"更新"但所有文件 mtime 未变、无增删、文件夹范围未变时，`buildIndex` 直接返回
  `{unchanged:true}`，跳过"读全文+重建倒排+重写三件套"，近乎瞬时（见 `indexer.js` 第二遍前的短路；`main.js`
  build-index 据此沿用已加载索引、不关句柄不写盘）。复用阶段每 300 篇让出事件循环，进度/界面跟手。
- worker 线程池并行解析+分词；失败回退串行。
- 分代事务持久化 + 正文懒加载（LRU），**千份文档启动亚秒级**；切换 meta 前异常退出仍保留完整旧索引。
- 多关键词搜索（空格/逗号/顿号分隔），段落级 AND 命中。搜索时按 doc id 缓存文档元信息（`analyzeDoc` 结果存
  `index._docMetaCache`，索引重建即失效），避免每次按键重跑类型判定+日期正则链；渲染层缓存 `typeOverrides`/`classifyFileType`，
  避免大结果集排序时反复 `JSON.parse(localStorage)`+正则。

**界面（UI v2，浅色，分支 `feature/ui-v2`）**
- 完全复刻设计稿：白色半透明磨砂底，仅一个回形针 LOGO 圆 + 黑框胶囊搜索栏。
- 红黄绿系统按钮放在 LOGO 正上方（`trafficLightPosition`）；点 LOGO 向下弹出 +／▶／× 三个操作按钮。
- 搜索栏内右侧两个圆按钮：设置（左滑出"搜索范围+高级设置"面板）、折叠/全部切换。
- 三列结果：时间 / 内容 / 文件，**列宽可拖拽**（表头分界手柄，持久化），且**文件列随窗口自适应加宽**。
- 折叠分组（按文件聚合，可展开其他命中处）/ 全部平铺两种视图，图标随状态切换（☰ / 双矩形）。
- **排序**：默认文件修改时间由近到远；时间表头可切换“修改 / 文内”，也可按文件类型排序。类型升序＝红头→法规→规范→规划→普通。
- **文件类型标签（6 类）**：红头/法规/规范/规划/**学术期刊**/普通。引擎(`search.js` 的 `classifyDocType`)给出自动类型——
  红头看文件名发文字号；**学术期刊看正文特征(卷/期·Vol/No·DOI·ISSN·收稿日期)**，文件名通常看不出故看内容；其余按文件名关键词。
  **点类型标签弹小菜单直接选类型**（含"恢复自动判定"，localStorage `typeOverrides` 持久化）；设置面板可按类型筛选。
- **时间列可手动修改**：点左侧时间格弹输入框，填 `年 / 年-月 / 年-月-日`（容忍 `2020年3月`、`/`、`.`），存 localStorage
  `timeOverrides`，带 ✎ 标记；"用自动时间"清除。手动时间 > 类型对应的自动日期 > 文件 mtime。
- 命中关键词高亮（LOGO 黄底 + 橙色立体阴影）；正文行数随窗口高度自适应（最少 3 行，最多 10）。
- 左键展开整段（平铺、不再有突兀蓝卡片）/ 右键复制 / **定位文件**（点文件名直接打开；已移除冗余的"打开文件"链接，文件名带 `title="点击打开文件"` 提示）。
- 全局呼出快捷键（设置里可自定义并持久化）、菜单栏托盘、关闭=隐藏到后台、单实例锁。
- **首次使用引导**：初次打开不再展示说明书式欢迎卡，而是高亮真实控件并等待用户严格依次完成“曲别针→添加文件夹→建立索引→输入搜索”四步；即使已有历史文件夹或索引也不跳步。设置面板可重新启动引导，当前 `ONBOARD_VER='4'`。
- **近期搜索**：点击或聚焦搜索框显示最近 10 条本机搜索历史，可筛选、复用和清空。
- 左下角版本号 `v1.1.1`；搜索栏下方右侧浅灰署名 `Designed and Created by ZhengHao`。

**打包**
- 历史开发记录显示曾产出 mac dmg/zip(arm64) + Windows NSIS(x64) v1.0.4，并**内置 OCR 离线语言包**；当前工作副本未保留 `dist/`，需要重新构建验证
  (`package.json > build.extraResources`)，核心搜索与 OCR **全程离线**、断网可用。
- Windows 自检通过：Electron 运行时 DLL 齐全 + `@napi-rs/canvas` 的 **win32-x64** 原生二进制已解包进包内，
  干净 Win10+ x64 机器开箱即用。**但系在 mac 上跨平台构建，建议最终在真实 Windows 机冒烟一次。**

---

## 5. 待完成 / 待修改（具体）

> ✅ UI v2 已进入 `main`。`feature/ui-v2` 停留在较早提交，仅作历史参考。

### 5.0 最近一次会话进展摘要（接手先看）
**当前功能轮次（v1.1.1）**：
- 新增 PPTX 系列、XLSX 系列和图片 OCR；图片仅在 OCR 开启时纳入索引，切换模式会正确重建。
- 默认改按文件修改时间由近到远；结果表头可切换文内时间。论文日期改为出版/卷期优先，收稿/修回仅兜底，并用桌面真实论文验证。
- 欢迎卡改为四步实操引导；加入近期搜索下拉；曲别针操作改为只做合成层动画，消除首次高度重排卡顿。
- 修复旧版索引存在时引导从第 1 步直接跳到第 4 步；现严格按 1→2→3→4 执行，并将 `ONBOARD_VER` 升至 `4`。
- `EXTRACT_VERSION=8`，工作区版本 `1.1.1`；产物分别输出到 `dist/macos/` 与 `dist/windows-x64/`。

**上一修复轮次（v1.0.5）**：
- 索引存储改为 `meta.json` 原子指向同代 `texts-<generation>.bin` / `tokens-<generation>.json`，增加偏移边界校验与真正的“清空索引”。
- 修复单汉字无法命中、500 条上限偏向旧文档、异步搜索结果乱序；路径输出补全 HTML 属性转义。
- IPC 校验调用页面、索引目录必须经系统选择器授权、打开文件必须属于当前索引；Win/Linux 默认恢复 Chromium 沙箱，兼容模式改为显式环境变量开关。
- Electron 升至 44.1.1、PDF.js 升至 6.3.289、electron-builder 升至 26.15.3；依赖审计为 0，PDF CMap 随包提供。
- OCR 禁止联网回退，所有发行包强制携带中英文语言包；混合型 PDF 会逐页补识别扫描页（每份最多 30 个）；新增打包资源预检、路径安全构建包装器和 Node 自动化测试。

**最新一轮（UI 微调 → v1.0.4）**已整合进当前唯一开发仓库。历史安装包未保留在本工作副本，需要按下述流程重新构建：
- **欢迎卡片 LOGO 换成真实 app 图标**：原先卡片用界面那只「漂浮型细回形针」内联 SVG，放进 54px 圆角方块后尖端被圆角切到、小尺寸细节挤成一团显得"烂"。改为 `index.html` 里 `.ob-mark` → `<img src="assets/icon.png">`（满铺出血、与 Dock 图标一致），CSS 加 `.ob-mark img{object-fit:cover}`。注意 CSP 是 `img-src 'self' data:`，本地图可用。**坑(已修)**：`assets/icon.png` 原不在打包 `files` 白名单里（只列了 tray.png），首版重打后 asar 内无此文件→打包后卡片裂图(开发态因从工程目录跑而正常)；已把 `assets/icon.png` 加进**顶层 files + mac.files + win.files** 三处再重打。凡渲染层运行时引用的 `assets/*` 文件都得进白名单。
- **引导卡片新增第 ⑤ 步「两个圆钮」**：说明搜索栏右侧两个圆按钮——左「设置」(左滑出搜索范围/高级设置：选文件夹、设快捷键、按类型筛选)、右「视图」(折叠分组 ⇄ 全部平铺切换)；开头"四步即可上手"改为"上手很简单"避免数字打架；步骤 ④ 文案改为"点文件名直接打开，或用「定位文件」"。
- **删除结果区"打开文件"链接，只留"定位文件"**（点文件名本就打开，功能重复）：`renderer.js` 两处(分组/平铺视图)移除带 `data-open` 的"打开文件" `lk`；文件名 `.fname` 仍带 `data-open`（点名即开）并加 `title="点击打开文件"` 提示，配合原有 hover 下划线/变色。
- **引导改为「版本门控」自动弹**（`renderer.js`）：原先 `if(!localStorage.onboarded) show()` 看过一次就永不再弹——用户反复装/开测试后标记已置位，导致"欢迎界面没了"。改为 `const ONBOARD_VER='2'`，`if(localStorage.onboarded !== ONBOARD_VER) show()`，关闭时写 `ONBOARD_VER`。**全新用户首启必弹；老用户更新到引导内容有变的新版会再自动弹一次；看过当前版后不再弹**。以后**改动引导卡片(步骤/图标/文案)就把 `ONBOARD_VER` +1**。设置面板「查看使用指南」仍可手动再看。
- **OCR 文案更新**（`index.html` 设置面板 `.fp-adv`）：扫描件 OCR 说明为“已内置离线语言包、无需联网”。当前 `package.json` 已固定 `build.extraResources`，打包前脚本会校验两份语言包；`ocr.js` 找不到时直接报错，不再回退 CDN。
- **打包历史**：版本最终 **1.0.4**（1.0.0 首发；1.0.1 连修 icon 白名单+promo require 两坑；1.0.2 升号绕开 Win 同号重装；1.0.3 加引导版本门控；1.0.4 改 OCR 离线文案）。当时曾重出 mac dmg/zip(arm64)、Windows NSIS(x64)、Windows 便携版 zip，并用 `-c.extraResources=langs` 内置离线 OCR；当前副本不含这些生成物。
- **Linux deb 历史**：曾生成面向麒麟/信创的 x64、arm64 包。因 electron-builder 在 mac 上 `fpm` 打 deb 坏（出 96B 空壳），改用 `--linux dir` + `dpkg-deb` 手工打包；`main.js` 关沙箱/硬件加速扩到 linux；内置离线 OCR；ASCII 安装路径 `/opt/doc-search`。**未在真机验证，需真实麒麟 V10 冒烟**。打法详见第 6 节“Linux deb（麒麟）打法”。
- **坑(已修)：Windows 同版本号重装不覆盖**。1.0.1 修好后重打的 exe 本身没问题，但用户在 Win 上重装仍报旧错（堆栈指向旧 `main.js:9` 布局）→ 说明装的还是旧 app.asar。NSIS 同版本号(1.0.1→1.0.1)重装常不真正替换文件、或用户误用了早先拷过去的旧 exe。**对策：每次给 Windows 重发都升版本号**（故 →1.0.2），文件名变化+NSIS 识别更高版本→干净升级；或让用户先在"应用和功能"里卸载旧「快文」再装。
- **坑(已修)：promo 演示模块导致正式包启动崩溃**。`main.js` 顶层无条件 `require('./promo/demo-data/demoMode')`，但 `promo/`（录屏演示工具+示例数据，不入打包白名单）不在 asar 里 → mac/win 正式包一启动就报 `Cannot find module './promo/demo-data/demoMode'`、主进程崩。已改为 **try/catch 容错 require**，缺失即回退 `{isDemoMode:()=>false}`（`demoMode.*` 全被 `DEMO_MODE` 门控，正式包永不触发）；`npm run promo`(`QUICKDOCS_DEMO=1`) 从源码跑时 promo/ 存在照常工作。**promo/ 刻意不打进正式包**（演示数据不发给最终用户）。
- 验证：按 CLAUDE.md 离屏渲染法核对——卡片新图标加载正常(`naturalWidth=1024`)、引导 5 步齐、结果区无"打开文件"链接。

**上一轮（性能 + 文档时间按类型重做 + 学术期刊类型 + 手动改时间/类型 + 新图标 + 首次使用引导 + 打包）已提交 `main`**（功能细节见第 4 节、算法/坑见第 6 节）：
- **性能（启动/建索引）**：建索引加「无改动快路径」(mtime 全未变+无增删+范围未变 → 直接沿用已加载索引，跳过读全文/重建倒排/重写三件套，近乎瞬时)；复用阶段定期让出事件循环；搜索按 doc id 缓存文档元信息(`index._docMetaCache`)；渲染层缓存 `typeOverrides`/`classifyFileType`；`errLog` 超 512KB 轮转。
- **文档时间「按文件类型分别取」**（`search.js` 的 `analyzeDoc`，**搜索时算、不需 +EXTRACT_VERSION**）：红头取印发/首末页(绝不取正文中段)；学术期刊取 修订/收稿/页眉卷期年月；其余取 文件名(排除"2025-2035年"编制期限)/首末页，无则回退 mtime。渲染层按"手动时间 > 当前类型候选 > mtime"显示。解决了上一轮"论文 2023-02-21 修订日期 / 西部城市论文 2022-07 出版年月"显示不准的问题。
- **新增第 6 类「学术期刊」**：靠正文卷期/DOI/ISSN/收稿特征识别(文件名看不出)；排序 红头>法规>规范>规划>学术期刊>普通。
- **交互**：左侧时间点击手动改(`timeOverrides`，带 ✎)；右侧类型标签点击弹菜单选类型(替代原循环切换，含"恢复自动判定")。
- **首次使用引导**：初次打开弹上手引导卡片，设置面板「查看使用指南」可再次看。
- **新图标**：以工程上级目录 `快文-LOGO.svg`(彩色回形针)派生 `icon.icns/ico/png`。**坑**：离屏渲染 SVG 必须让设计**四周出血**(容器 -16px 铺到深底)，否则右/下边缘留 1~2px 浅色条 → macOS 圆角遮罩后显成白边(已修)。
- **打包**：mac dmg/zip(arm64) + Windows NSIS(x64) 均重出，**内置 OCR 离线语言包**(`-c.extraResources=langs`，断网可 OCR)，各带本平台 canvas 二进制。本机已冒烟 mac 包：4 进程、零错误、引导/新图标正常。

**✅ CJK CMap 已修复**：`extractPdf` 已配置本地 `cMapUrl`/`cMapPacked`，`pdfjs-dist` 随包解开；`EXTRACT_VERSION=7` 会触发旧索引全量重抽。


1. **合并与打包**（已完成）：
   - ✅ `version` `1.0.4`（1.0.0 首发；1.0.1 修 icon/promo 两坑；1.0.2 升号避开 Windows 同号重装；1.0.3 加引导版本门控；1.0.4 改 OCR 离线文案）；UI v2 已在 `main`。
   - ✅ 最新一版 mac dmg/zip(arm64) + Windows NSIS(x64) 均含本阶段全部成果，且**内置 OCR 离线语言包**
     (`-c.extraResources=langs` → `resources/langs/`，断网可 OCR)，各平台只带本平台 canvas 二进制。
   - ⬜ **建议**：发布前在真实 Windows x64 机器冒烟一次（尤其 OCR）。mac 包本机已冒烟通过。
2. **真机"滚动露行"复核**：用户反馈快速滚动时吸顶表头/年份条偶发被内容透出。已做硬化（吸顶元素提升为
   独立 GPU 合成层 `translateZ(0)` + 提高 z-index + 顶端贴合），但**离屏渲染复现不出**，需真机最终确认是否根治；
   若仍露，让用户说明露在"表头上方"还是"年份条附近"再针对性处理。
3. **Windows 安装包已出（x64 NSIS）；Linux deb 已出（x64+arm64，针对麒麟/信创）**：详见第 6 节"Linux deb（麒麟）打法"。
   mac 未公证、win 未签名（安装时会有"未知发布者"提示，不影响运行）。如需消除提示再配签名/公证。
   ⚠️ **Linux deb 在 mac 上构建、未在真机验证**：务必在真实麒麟机冒烟（能否启动、OCR、中文显示）。
4. **多关键词"命中聚焦优先"排序已被移除**：为让时间/类型排序按钮可预期生效而去掉。若将来要兼顾"聚焦优先"，
   需重新设计排序优先级（不要简单加回，会再次盖过时间排序）。
5. 可选优化（用户暂未要求）：搜索历史、导出结果、深色模式（**用户明确只要浅色，暂不做**）。

---

## 6. 重要约定与注意事项

**分支/版本状态（先看这个）**
- `main` = **当前 UI v2 v1.1.1（浅色复刻 UI）**；`feature/ui-v2` 是合并前的历史分支指针，不再作为开发入口。
- 旧"色块强调"UI 仅存在于历史提交（合并前的 `main`），不再有活动分支；如需回看用 git 历史。
- **界面内联回形针**在 `index.html`（源 `assets/logo-mark.svg`）；**app 图标** `assets/icon.icns/ico/png` 由**工程上级目录的
  `快文-LOGO.svg`**（彩色回形针，满铺方形设计）派生——与界面内联那只不是同一文件，改图标只动 icns/ico/png。
  重生成流程见第 6 节"Windows 图标"坑：离屏渲染 SVG 时**务必四周出血**(容器 -16px 铺深底)，否则边缘留浅色条→macOS 圆角后白边。

**不能随意改 / 容易踩的坑**
- `npm install` **必须加 `--ignore-scripts`**（否则 electron 的 install.js 缺 debug 崩溃）。内核由启动器手动下载：
  Mac 解压必须用 `ditto -x -k`（普通 unzip 丢 .app 内符号链接→缺 Framework）；写 `node_modules/electron/path.txt`
  用 `printf`（不能带换行）。内核缓存在 `~/.docsearch_cache/electron-<ver>-darwin-<arch>`。
- **`engine/indexer.js` 的 `EXTRACT_VERSION`（当前 8）**：改解析逻辑或存储格式后必须 +1，下次"建立/更新索引"才会全量重建生效。
- **PDF 文本清洗（`extract.js` 的 `normalizeExtracted`）**：pdfjs 抽取会①汉字间塞空格②把拉开字距的拉丁/数字逐字符拆开
  （"B u i l d"/"2 0 2 2"）③用全角字母数字。已串联 `toHalfWidthAlnum`(全角→半角，不动中文标点) +
  `dedupeLatinSpacing`(合并1~2字符碎片) + `dedupeWidePunctSpaces`(去宽标点两侧空格) + `dedupeCJKSpaces`。不处理则整词/数字搜不到。
- **文档显示时间「按文件类型分别取」（`search.js` 的 `analyzeDoc`，搜索时算，随每条结果回传 `docType`+三套候选 `dRed`/`dJournal`/`dGeneric`）**：
  渲染层按"手动时间 > 当前类型对应候选 > 文件 mtime"显示。三套规则：
  - **红头**(`redDocDate`)：印发(文末 `stampDate`) > 首页日期 > 末页日期，**绝不取正文中段**。
  - **学术期刊**(`journalDocDate`)：出版/发表标签 > 页眉卷期出版年月 > 文末规范引用 > 文件名刊期 > 修回/收稿（仅兜底）> 首/末页；不能把研究过程日期冒充正式刊期。
  - **法规/规范/规划/普通**(`genericDocDate`)：**文件名**(`filenameDate`：年月日 > 独立四位年份) > 首页 > 末页；都没有 → null → 回退 mtime。
  - **编制期限区间**(如 `2025-2035年`、`2025年至2035年`)由 `stripPeriodRanges` 在文件名与首/末页里剔除，**绝不当文档时间**。
  解析前整段全角 ASCII→半角(`toHalf`，含全角连字符 `－`)。**保留精度不编造**：prec='d'/'m'/'y'，时间列按精度显示
  （日 MM-DD / 月 MM月 / 年 年份）。**改这里不需 +EXTRACT_VERSION（搜索时解析）**；候选按 doc id 缓存于 `index._docMetaCache`(重建即失效)。
- **持久化原子写**：meta/texts/tokens 走临时文件 + rename；`openIndex` 会校验格式，外来/旧版/损坏 meta 当作"无索引"。
- **打包 asarUnpack**：`engine/**` 与原生/重依赖（`@napi-rs/canvas`、`pdfjs-dist`、`tesseract.js`）必须 unpack，
  否则 worker 线程内 `require` 从 asar 虚拟路径失败。
- **Windows 打包（在 mac 上跨平台）三要点**（缺一则 OCR 在 Windows 上缺运行时或打错架构）：
  1. **必须显式 `--x64`**：electron-builder 默认跟随宿主架构，在 Apple Silicon 上会误打成 win32-arm64。
     `dist:win` 脚本已固定为 `electron-builder --win --x64`。
  2. **先补装 win32-x64 的 canvas 原生二进制**（mac 上 `npm install` 因平台不符默认跳过）：
     `npm i @napi-rs/canvas-win32-x64-msvc@<与 @napi-rs/canvas 同版本> --no-save --force --ignore-scripts`。
     否则 `dist/win-unpacked/.../@napi-rs/` 里没有 `skia.win32-x64-msvc.node`，勾选 OCR 会崩。
     （`@napi-rs/canvas`/`tesseract.js` 都是 ocr.js 内**懒加载**，缺它不影响核心搜索，只影响 OCR。）
  3. **镜像**：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`、
     `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`，否则下载 win 内核/nsis 易卡。
  electron-builder 24 自带工具链（nsis/winCodeSign，缓存在 `~/Library/Caches/electron-builder/`）即可出 NSIS，**无需系统 wine**。
- **`build.files` 白名单别被平台 files 冲掉（踩过大坑）**：`mac.files`/`win.files` 若只写排除项（如 `!canvas-darwin-*`），
  会**覆盖**顶层 `files` 白名单，导致 electron-builder 打包整个工程目录（把 `CLAUDE.md`/`.claude`/`示例文档`/旧 `dist/`
  都塞进 asar，泄露+暴涨）。务必把**完整白名单 + 本平台 canvas 排除项**一起写进每个平台的 `files`（现配置即如此）。
  验证：`npx asar list <app.asar>` 顶层应只有 `main/preload/renderer/index/engine/assets/node_modules`。
  **同理：渲染层运行时引用的任何 `assets/*` 文件（如欢迎卡片的 `assets/icon.png`）必须同时进顶层+mac+win 三处 `files`，否则 asar 内缺文件→运行时裂图/404（开发态从工程目录跑看不出来）。**
- **图标生成（icns/ico/png 全套）**：源用工程上级目录 `快文-LOGO.svg`。流程：离屏 Chromium 渲染 SVG→PNG 主图 →
  `sips` 切各尺寸 → macOS `iconutil` 合 `.icns`（含 16~1024 iconset）、Windows `icotool`(icoutils) 合 `.ico`（16/24/32/48/64/128/256）、`icon.png`=1024。
  - **Windows 的 `.ico` 必须用 `icotool`，别用 ImageMagick**：IM 的 32 位 BMP AND 掩码会写坏 → 快捷方式空白。（rcedit 嵌 exe 时丢 256 帧是其硬限制，正常视图够清晰。）
  - **离屏渲染务必让设计四周出血**（容器绝对定位 `-16px`、SVG 放大到 1056、铺在 `#000` 深底上）：否则 capturePage 在右/下边缘留 1~2px 未覆盖→合成成不透明浅灰 `#ededed`，烤进图标后 **macOS 圆角遮罩会显成白边**。验证：`magick icon.png -format "%[pixel:p{1023,512}]"` 应为深色不透明，不能是 `srgba(237,237,237,1)`。
  - zsh 下写生成脚本注意：`for x in "a b"; do set -- $x` **不会**按空格拆词（zsh 默认不做 word splitting）→ 用 `bash` 跑脚本或显式 `${=x}`。
- **OCR 语言包（所有发行包强制内置）**：把 `chi_sim.traineddata.gz`+`eng.traineddata.gz` 放到工程根 `langs/`（已 gitignore）。
  `package.json > build.extraResources` 会把它们复制到 `resources/langs/`，所有 `dist*` 脚本在打包前运行
  `scripts/verify-build-assets.js`，缺任一文件就失败。`ocr.js` 找不到语言包时直接报错，不允许回退网络。
- **绿色便携版（zip，免安装，双击即用，最稳）**：`electron-builder --win zip --x64
  -c.directories.output=dist-portable -c.artifactName='快文-便携版-${version}-x64.${ext}'`。
  解压后 `快文.exe` 在文件夹根目录，双击即运行；数据仍存 `%APPDATA%\doc-search`。**推荐内网分发用这个**。
- **Linux deb（麒麟/信创，x64+arm64）历史打法**（过去曾生成 1.0.4，当前副本不含产物）：
  - **坑：electron-builder 自带的老 `fpm` 在 mac(尤其 Apple Silicon)上打 deb 会调系统 BSD `ar`，产出只有 `__.SYMDEF` 的 96 字节空壳、不是合法 deb**（`--linux deb` 直接打不可用；且并行 `--x64 --arm64` 还会抢 fpm 下载报 race）。
  - **可靠打法 = `--linux dir` 出解压目录 + `dpkg-deb` 手工打包**：① `brew install dpkg`（得 `dpkg-deb`）；② 先装 Linux canvas 二进制 `npm i @napi-rs/canvas-linux-x64-gnu@<canvas版本> @napi-rs/canvas-linux-arm64-gnu@<同版本> --no-save --force --ignore-scripts`（glibc/gnu 变体；**注意：之后 `npm i ...win32...` 恢复 win 二进制时 `--force` 会把 linux 这两个删掉，要打 linux 就重装**）；③ 分架构出目录 `electron-builder --linux dir --x64 -c.extraResources=langs`、`--arm64 …`（**串行**，别并行）；④ 用 `dpkg-deb --build --root-owner-group <stage> <out.deb>` 手工组包。手工脚本结构见本次会话：app 主体→`/opt/doc-search/`(**ASCII 路径避开中文路径坑**)、`/usr/bin/doc-search` 软链、`/usr/share/applications/doc-search.desktop`(显示名「快文」)、`hicolor/{128,256,512}` 图标、`DEBIAN/control`(Package=doc-search、Architecture=amd64/arm64、Maintainer、Homepage、Depends: libgtk-3-0,libnss3,libasound2)、`DEBIAN/postinst`(chrome-sandbox `chmod 4755`+刷新桌面库)。
  - **deb 需 package.json 有 `homepage` 字段**（fpm/控制信息要），否则 `--linux deb` 报 `Please specify project homepage`（已加占位 `https://kuaiwen.local`）。
  - **麒麟兼容关键**：Win/Linux 默认关闭硬件加速但保留 Chromium 沙箱；只有确认受管控环境因沙箱出现白屏/`launch-failed` 时，才显式设置 `QUICKDOCS_DISABLE_SANDBOX=1` 使用兼容模式。装包使用 ASCII 路径，并内置 `langs/` 离线 OCR。
  - **未在真机验证**（mac 上构建）：Electron 44 升级后必须在真实**麒麟 V10**重新确认系统库兼容性。装：`sudo dpkg -i 快文-1.0.4-<amd64|arm64>.deb`；若提示缺依赖 `sudo apt-get install -f`。
- **受管控 Windows 机器疑难合集（均已修，实测可用）**：
  1. **双击白屏/闪退、渲染进程 `launch-failed exitCode 18`**：受限策略/安全软件下 Chromium 渲染沙箱起不来。
     `main.js` 默认只执行 `disableHardwareAcceleration()`、保留 Chromium 沙箱。只有确认是沙箱策略冲突时，才从命令行设置
     `QUICKDOCS_DISABLE_SANDBOX=1` 后启动兼容模式；此模式安全边界更弱，不作为默认发行配置。
  2. **建索引报 `EPERM: rename texts.bin.tmp -> texts.bin`**：Windows 不允许 rename 覆盖被打开的文件。
     `main.js` 必须在 `saveIndex` **之前** `prev.close()` 释放旧 texts.bin 句柄（macOS 无此限制，故只在 Win 复现）。
  3. **安装版桌面快捷方式无效/图标空白**（开始菜单与"手动发送到桌面"都正常）：electron-builder 默认桌面快捷方式
     在该机器上失效。已 `nsis.createDesktopShortcut:false` + `nsis.include:assets/installer.nsh`，用最基础 `CreateShortCut` 自建。
  4. **图标显示空白/低像素**：多为 **Windows 图标缓存**（旧坏图标被缓存）。重启资源管理器/`ie4uinit.exe -show`/
     解压到新文件夹名即可刷新。注意 `taskkill /f /im explorer.exe` 后必须 `start explorer.exe`（否则黑屏，用任务管理器→运行新任务恢复）。
     图标用 `assets/icon.ico`（icotool 多尺寸）；rcedit 嵌不进 256 帧是其硬限制，正常视图够清晰。
  5. 排查工具：`main.js` 已加全局崩溃日志/弹框 → `%APPDATA%\doc-search\快文-错误日志.txt`。
  6. **以上信任摩擦的根治是代码签名证书**（未配）；签名后未知发布者/SmartScreen/沙箱限制等基本消失。
  7. **崩溃的旧版会锁住 `app.asar`，导致新安装包"装了却没真覆盖"**（实测踩过）：Electron 主进程抛 `uncaughtException` 后默认弹**模态错误框、进程不退出**（`快文.exe` 仍在跑）。此时运行新安装器→NSIS 报"**快文 无法关闭，请手动关闭后重试**"；若用户没真正杀掉进程就点"重试"，被占用的 `app.asar` 替换不了→装完打开仍是**旧代码**（错误堆栈行号还停在旧布局，极易误判为"没修好"）。**对策**：① 先把所有「快文」错误框点掉 + 任务管理器结束所有 `快文`/`快文 Helper` 进程，再装；② 或发**绿色便携版 zip**（见上一条），解压到新文件夹双击即用，**完全绕开安装器与文件占用**——给已陷入此坑的机器最省事。注：1.0.2 起 app 本身不再崩，进程不会卡死锁文件，后续安装器更新即正常。
- **macOS 拖拽区**：`.app` 是 `-webkit-app-region: drag`，子元素要 `no-drag` 才能点击/滚动；全屏遮罩的 no-drag
  只在打开时加（否则整窗不可拖）。改布局时小心这一点。

**代码风格 / 命名**
- 全程简体中文（回答、注释、commit message）。
- 原生 HTML/CSS/JS，无构建步骤；样式集中在 `index.html` `<style>`，逻辑集中在 `renderer.js`。
- 配色用 CSS 变量（`--accent`/`--blue`/`--hl`/`--ink` 等）；列宽用 `--tw`/`--fw`，自适应行数用 `--clamp`。
- 文件类型六类固定键：`red/law/spec/plan/journal/normal`（`TYPE_INFO`/`TYPE_ORDER`/`TYPE_RANK`；排序 红头>法规>规范>规划>学术期刊>普通）。
  渲染层 `fileType` 取值优先级：手动 `typeOverrides` > 引擎 `autoTypeByPath`(随结果回传) > 文件名兜底 `classifyFileType`。

**如何验证改动（关键）**
- 本项目是 Electron，**浏览器预览跑不起来**。验证 UI 用「离屏渲染 + mock window.api」：
  起一个 `offscreen` BrowserWindow，注入假的 `window.api`，把临时 HTML 写进**工程目录**（这样 `renderer.js`
  相对路径能解析），`capturePage()` 截图核对。（红黄绿原生窗口按钮截不到，属正常。）
  - **mock 必须作为同源 `.js` 文件注入**（如临时写 `__verify_mock.js` 再 `<script src>` 它），**不能内联 `<script>`**：
    `index.html` 有 CSP `script-src 'self'`，内联脚本会被拦 → `window.api` 为 undefined → renderer 在 `getState` 处崩。
  - 验证用的临时文件（`__verify_*.html/js`）跑完**务必删掉**，别留在工程目录/被提交。
  - 也可 `executeJavaScript` 直接读 DOM/状态做断言（比截图更快更准），或直接调 `doSearch()`/点按钮验证交互。
- 验证纯引擎用环境变量 `DOCSEARCH_INDEX_DIR` 指定索引目录，在纯 node 下跑端到端断言（见记忆 `verify-engine-without-gui`）。
- 重启真机实例前先用 `pgrep -af "node_modules/electron"` 确认本项目进程，再结束对应实例（配合单实例锁，避免看到旧版本界面）。
  冒烟**打包后的** mac 包：`open dist/mac-arm64/快文.app` → `pgrep -f '快文.app/Contents'` 应 4 进程 →
  看 `userData/快文-错误日志.txt`(即 `~/Library/Application Support/doc-search/`) 启动后无 Error 即干净。

**硬约束**
- 保持纯本地、离线、无后台；不引入需要联网的运行时依赖（OCR 语言包首次下载除外）。
- 优先零原生编译依赖，保证小白电脑开箱即用。

---

## 运行（开发模式）
```bash
npm install --ignore-scripts   # 装依赖，跳过会崩的 electron 下载脚本
npm start                      # 启动（= electron .）
```
Mac 也可双击 `启动.command`。打包：`npm run dist:mac` / `dist:win` / `dist:linux`。
