# 项目理解报告

## 1. 项目技术栈

- 桌面框架：Electron 31。
- 前端：原生 HTML / CSS / JavaScript，无前端框架。
- 主进程：Node.js + Electron IPC。
- 搜索引擎：本地 JavaScript 倒排索引，中文 bigram 分词，正文精确定位。
- 文档解析：自研解析管线，覆盖 txt / csv / md / docx / ofd / pdf / doc / wps 等类型。
- 可选 OCR：`tesseract.js` 与 `@napi-rs/canvas`，用于扫描件识别。
- 持久化：本地索引元数据、正文、token 文件拆分保存。
- 打包：`electron-builder`。

## 2. 软件入口文件

- 主入口：`main.js`。
- 渲染入口：`index.html` 加载 `renderer.js`。
- 安全桥：`preload.js` 通过 `contextBridge` 暴露有限 IPC 能力。

## 3. UI 结构所在文件

- 主要 DOM 与样式：`index.html`。
- UI 交互、状态管理、搜索结果渲染：`renderer.js`。
- 首次使用引导、左侧操作区、搜索栏、设置面板、结果列表都在 `index.html` 中定义，在 `renderer.js` 中驱动。

## 4. LOGO 和图标资源位置

- 界面内嵌圆形 LOGO：`index.html` 中的 `#logoBtn` SVG。
- 品牌标记 SVG：`assets/logo-mark.svg`。
- 应用图标：`assets/icon.png`、`assets/icon.icns`、`assets/icon.ico`。
- 托盘图标：`assets/tray.png`、`assets/tray@2x.png`。

## 5. 搜索框、结果列表、左侧按钮、设置面板相关代码位置

- 搜索框 DOM：`index.html` 中 `#searchInput`。
- 搜索输入逻辑：`renderer.js` 中 `doSearch()` 与 `searchInput` 的 `input` 事件。
- 结果列表 DOM：`index.html` 中 `#rows`。
- 结果列表渲染：`renderer.js` 中 `render()`、`groupByDoc()`、`ctxHTML()`。
- 左侧 LOGO 和三个圆形按钮：`index.html` 中 `#logoBtn`、`#addBtn`、`#indexBtn`、`#clearBtn`。
- LOGO 展开/收起逻辑：`renderer.js` 的 LOGO 事件处理。
- 设置面板 DOM：`index.html` 中 `#folderPanel`。
- 设置面板开关、文件夹范围、文件类型筛选：`renderer.js` 中 `openPanel()`、`closePanel()`、`renderFolders()`、`typeChk` 事件。

## 6. 索引状态、搜索结果、文件类型标签相关代码位置

- 索引状态展示：`renderer.js` 中 `init()`、`indexBtn` 点击事件、`onProgress()` 回调。
- 索引建立主逻辑：`main.js` 中 `build-index` IPC，调用 `engine/indexer.js`。
- 索引持久化：`engine/persist.js`。
- 搜索结果生成：`main.js` 中 `search` IPC，调用 `engine/search.js`。
- 搜索结果字段：`engine/search.js` 返回 `name`、`path`、`mtime`、`docType`、`dRed`、`dJournal`、`dGeneric`、`before`、`hit`、`after`、`para`、`kind`。
- 文件类型自动判定：`engine/search.js` 中 `classifyDocType()`。
- 文件类型标签 UI：`renderer.js` 中 `TYPE_INFO`、`TYPE_ORDER`、`fileTagHTML()`。

## 7. 当前项目如何启动

```bash
npm install
npm start
```

## 8. 如何在开发模式下运行

```bash
npm start
```

宣传录屏专用演示模式：

```bash
npm run promo
```

或：

```bash
QUICKDOCS_DEMO=1 npm start
```

## 9. 如何打包

```bash
npm run dist
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## 10. 哪些文件不应纳入宣传素材或不应外传

- `node_modules/`：第三方依赖，体积大且无宣传价值。
- `dist/`、`dist-portable/`：构建产物，可能含签名、平台包或历史产物。
- `langs/`：OCR 语言包，体积大，不作为宣传素材。
- `.git/`、`.claude/`、开发日志和本地调试文件。
- `CLAUDE.md`：开发上下文文档，不作为对外宣传素材。
- 本机真实文档、真实索引、真实搜索结果、真实文件路径、真实截图、错误日志。
- 任何包含地名、政策文号、内部项目名称、个人姓名、单位名称、真实目录结构的素材。

## 命名约束

- 软件中文名：快文。
- 软件英文名：QuickDocs。
- 所有宣传字幕、旁白、视觉稿、视频剪辑说明统一使用 QuickDocs。
