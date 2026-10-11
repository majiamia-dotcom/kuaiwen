# 快文 QuickDocs

快文是一款纯本地、离线运行的桌面文档正文搜索工具。它面向政企机关、文秘和技术人员，重点解决“记得文件里写过，但不知道文件在哪里”的问题。

本目录是项目唯一开发主线。原 `DocSearch/` 内容已经提升到当前目录；历史 DocPivot 试验代码不属于本产品主线。

## 当前版本

- 工作区版本：`1.1.1`
- Electron：`44`
- 界面：原生 HTML / CSS / JavaScript
- 索引：纯 JavaScript 倒排索引，磁盘持久化
- 中文搜索：二元分词 + 段落级精确校验
- 数据原则：本地运行、不上传、不后台全盘扫描

## 已实现能力

- 多材料库文件夹递归扫描和增量更新
- worker 线程池并行解析与分词
- 索引分代事务写入、损坏校验、正文懒加载和 LRU 缓存
- TXT、CSV、Markdown、DOCX、PDF、OFD、DOC、WPS、PPTX/PPTM/PPSX/POTX、XLSX/XLSM 文本提取
- 图片与扫描件 OCR（JPG/PNG/BMP/WebP/TIFF；Tesseract.js，强制使用本地中英文语言包）
- 多关键词段落级 AND 搜索、关键词高亮
- 红头、法规、规范、规划、学术期刊、普通文件分类
- 默认按文件修改时间由近到远；可切换文内发布/出版时间，并允许手动修正日期和类型
- macOS、Windows x64、Linux/麒麟打包配置
- 跟随真实控件推进的四步首次使用引导、近期搜索下拉、托盘、单实例和全局快捷键

## 目录

```text
assets/       应用图标、托盘图标和安装器资源
engine/       解析、OCR、索引、搜索和持久化引擎
promo/        宣传片脚本、文案和本机渲染产物
界面设计/     Illustrator、SVG 和界面参考稿
示例文档/     本地功能演示样本
main.js       Electron 主进程
preload.js    安全上下文桥
renderer.js   页面交互和结果渲染
index.html    页面结构及样式
CLAUDE.md     详细开发交接、平台打包经验和已知问题
运行说明.md   面向使用者的启动与操作说明
```

`promo/export/` 中的 MP4、WAV、PNG、JPG 成片和渲染帧保留在本机，但不进入 Git；宣传脚本、文案、HTML/CSS 舞台文件进入版本管理。

## 开发启动

首次准备依赖：

```bash
npm ci
```

随后启动：

```bash
npm start
```

macOS 也可以双击 `启动.command`。OCR 离线语言包放在 `langs/`，该目录不进入 Git。

## 基础检查

无需安装依赖即可先检查 JavaScript 语法：

```bash
node --check main.js
node --check preload.js
node --check renderer.js
for file in engine/*.js; do node --check "$file"; done
```

Electron 界面验证、跨平台打包流程以及 Windows/麒麟注意事项见 `CLAUDE.md`。

运行自动化回归测试：

```bash
npm test
```

打包前会自动检查 `langs/chi_sim.traineddata.gz` 和 `langs/eng.traineddata.gz`，缺失时停止构建，避免误发需要联网下载语言包的版本。
构建脚本会兼容当前含空格和引号的开发路径；必要时先在系统临时目录打包，再分别复制到 `dist/macos/`、`dist/windows-x64/`。

## 当前交付注意事项

- `node_modules/` 和 `dist/` 不进入 Git，依赖与安装包需在本机重新生成。
- Windows x64 和麒麟 Linux 仍应在真实机器进行最终冒烟。
- macOS 尚未公证，Windows 尚未代码签名。
- 图片只有在设置中开启 OCR 后才进入索引，避免默认扫描照片库导致长时间等待。
- OCR 会逐页补识别混合型 PDF 中的扫描页，单份文件最多处理 30 个扫描页；结果仍需用原文件复核。
