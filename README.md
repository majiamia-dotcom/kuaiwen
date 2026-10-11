# QuickDocs (快文)

**Search what's *inside* your documents — fully offline, local-first, no account, no upload.**

QuickDocs is a desktop search tool that indexes the **content** of your files, not just their names. Built for anyone who thinks *"I know I wrote this somewhere… but which file?"* — government and enterprise offices, secretaries, engineers, researchers.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]()
[![UI languages](https://img.shields.io/badge/UI-%E4%B8%AD%E6%96%87%20%7C%20English%20%7C%20Fran%C3%A7ais%20%7C%20Espa%C3%B1ol-green)]()
[中文介绍](#中文介绍) · [Download 下载](https://github.com/majiamia-dotcom/quickdocs/releases)

## Features

- **100% offline & private** — indexing, search and OCR all run locally. Nothing leaves your machine; no background full-disk scanning.
- **Real content search** — recursive multi-folder indexing with incremental updates; pure-JavaScript inverted index persisted on disk.
- **Wide format support** — TXT, CSV, Markdown, DOCX, PDF, OFD, DOC, WPS, PPTX/PPTM/PPSX/POTX, XLSX/XLSM.
- **Offline OCR** — JPG/PNG/BMP/WebP/TIFF and scanned PDF pages, via bundled Tesseract.js Chinese + English language data. No network fallback, ever.
- **Multi-keyword paragraph-level AND search** with hit highlighting.
- **Multilingual UI** — 中文 / English / Français / Español, auto-detected from your system language, switchable in settings.
- **Document classification** — official notices, laws & regulations, standards, plans, academic journals, general files (auto-detected, manually correctable).
- **Cross-platform** — macOS (Apple Silicon), Windows x64, Linux/Kylin.
- **Thoughtful details** — guided 4-step first-run tour, recent-searches dropdown, system tray, single-instance, global hotkey (customizable).

## Download

Grab the latest installer from [**Releases**](https://github.com/majiamia-dotcom/quickdocs/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `QuickDocs-*-macos-arm64.dmg` |
| Windows x64 | `QuickDocs-*-windows-x64-setup.exe` |

> The macOS build is not yet notarized and the Windows build is not yet code-signed. Your OS may warn about an unidentified developer on first launch — allow it in security settings.

## Build from source

```bash
npm ci
npm start        # run the app
npm test         # engine tests
npm run dist     # build installers (mac / win / linux)
```

## Tech stack

Electron · vanilla HTML/CSS/JS UI · custom JS inverted index with generational on-disk persistence · Tesseract.js offline OCR · pdfjs-dist with bundled CJK CMaps

## Roadmap

- [x] v1.1 — OCR for images & scanned PDFs, first-run guided tour, recent searches
- [x] v1.2 — Multilingual UI (中文 / English / Français / Español)
- [ ] Signed & notarized installers
- [ ] Search history export, dark mode (on request)

## License

[MIT](LICENSE) © 2026 majiamia-dotcom

---

# 中文介绍

**快文是一款纯本地、离线运行的桌面文档正文搜索工具**——搜的是文件里的字，不是文件名。面向政企机关、文秘和技术人员，解决"记得文件里写过，但不知道文件在哪里"的问题。

## 功能特性

- **完全离线**：索引、搜索、OCR 全部本地完成；不上传、不注册、不后台全盘扫描
- **正文搜索**：多材料库文件夹递归扫描和增量更新；纯 JavaScript 倒排索引，磁盘持久化
- **格式广泛**：TXT、CSV、Markdown、DOCX、PDF、OFD、DOC、WPS、PPTX 系列、XLSX 系列
- **离线 OCR**：JPG/PNG/BMP/WebP/TIFF 图片与扫描版 PDF（内置中英文语言包，绝不联网回退）
- **多关键词段落级 AND 搜索**、关键词高亮
- **多语言界面**：中文 / English / Français / Español，跟随系统自动识别，可在设置中切换
- **文件自动归类**：红头、法规、规范、规划、学术期刊、普通文件；可手动修正时间与类型
- **跨平台**：macOS（Apple Silicon）、Windows x64、Linux/麒麟
- **细节**：四步实操引导、近期搜索下拉、托盘常驻、单实例、可自定义全局呼出快捷键

## 下载安装

见 [Releases](https://github.com/majiamia-dotcom/quickdocs/releases) 页面。macOS 尚未公证、Windows 尚未签名，首次启动请在系统安全设置中允许。

## 从源码构建

```bash
npm ci
npm start        # 开发运行
npm test         # 引擎测试
npm run dist     # 打包安装包（mac / win / linux）
```

## 许可证

[MIT](LICENSE) © 2026 majiamia-dotcom
