# 快文 QuickDocs 视频剪辑说明

## 素材目录

- 软件截图：`promo/export/screens/`
- 蓝紫动态渐变开场/结尾：`promo/export/intro_*.png`、`promo/export/outro_*.png`
- 朋友圈封面：`promo/export/QuickDocs_cover_moments_16x9.png`、`promo/export/QuickDocs_cover_moments_square.png`
- 蓝紫动态渐变 HTML/CSS 原型：`promo/export/blue_concept_prototype.html`、`promo/export/blue_concept.css`
- 最终顺滑合成版：`promo/export/QuickDocs_promo_final_smooth_26s.mp4`

## 最终顺滑合成版

| 时间 | 使用素材 | 画面 | 处理 |
| --- | --- | --- | --- |
| 0-1.2s | `QuickDocs_cover_moments_16x9.png` | 朋友圈封面作为首帧，未播放时直接显示完整品牌页 | 固定停留，轻微呼吸 |
| 1.2-3.4s | `QuickDocs_reference_search_intro.jpg` | 平滑过渡到“一个关键词，找到所有正文”搜索概念页 | 叠化 + 轻微推近 |
| 3.4-7.6s | `final_sequence_intro.html` | 白底 APP 图标立体悬浮，大鼠标指针双击打开 | 鼠标曲线移动、双击波纹、主界面展开 |
| 7.6-23.5s | `quickdocs_promo_v2_24s.mp4` 4-21s | 软件操作演示：LOGO 操作、添加资料、索引、搜索、结果、筛选 | 0.55s 叠化接入，色彩轻微压暗匹配首帧渐变 |
| 23.5-25.5s | `QuickDocs_promo_15s.mp4` 13-15s | 口号与 LOGO 结尾 | 0.55s 叠化接入，音频淡出 |

成片规格：1920×1080、30fps、25.5 秒、H.264 + AAC。首帧已固定为封面图，适合直接发朋友圈视频。

复现命令：

```bash
QUICKDOCS_REFERENCE_VIDEO="/Users/m/Downloads/quickdocs_promo_v2_24s.mp4" node_modules/.bin/electron promo/scripts/render_final_sequence.js
```

## 动态渐变背景使用方式

- 参考色已按提供截图复刻：深黑蓝、紫蓝、青色光晕、底部洋红光团。
- HTML/CSS 原型自带动效：大面积渐变缓慢漂移，颜色轻微变化，纹理柔和移动。
- 可直接在浏览器或 Electron 窗口打开并录屏：
  - `blue_concept_prototype.html?scene=search`
  - `blue_concept_prototype.html?scene=keyword`
  - `blue_concept_prototype.html?scene=files`
  - `blue_concept_prototype.html?scene=logo`
  - `blue_concept_prototype.html?scene=slogan`
  - `blue_concept_prototype.html?scene=cover`
- 如只做静态剪辑，使用已导出的 PNG；如要背景颜色持续变化，优先录制 HTML 动态原型。

## 30 秒版本逐秒分镜

| 时间 | 使用素材 | 画面 | 字幕 | 旁白 | 转场 |
| --- | --- | --- | --- | --- | --- |
| 0-3s | `intro_01_search_box.png` 或动态原型 `scene=search` | 蓝紫动态渐变背景，大搜索框输入“关键词A” | 一个关键词，找到所有正文 | 一个关键词，找到所有正文。 | 搜索框轻微放大 |
| 3-5s | `outro_01_logo.png` | 圆形 LOGO 与“快文 QuickDocs” | 快文 QuickDocs，本地文档内容搜索器 | 快文 QuickDocs，是面向政企办公场景的本地文档内容搜索器。 | 淡入 |
| 5-8s | `screens/00_home.png` | 软件主界面，LOGO、搜索框、索引状态 | 打开即用，即输即搜 | 打开即用，即输即搜。 | 轻推入 |
| 8-10s | `screens/01_actions.png` | 点击 LOGO 后展开三个圆形按钮 | 点击 LOGO，展开操作 | 选择文件夹，建立索引。 | 局部放大 |
| 10-11s | `screens/02_choose_folder.png` | 模拟添加文件夹面板 | 选择文件夹，建立本地索引 | 选择需要检索的资料库。 | 叠化 |
| 11-14s | `screens/03_index_done.png` | 索引完成状态，显示 1286 份文档 | 千份文档，稳定检索 | 千份资料也能稳定检索。 | 状态文字高亮 |
| 14-18s | `screens/04_search_input.png` | 搜索框输入“关键词A” | 输入关键词，搜索文件正文 | 输入关键词，直接搜索文件正文。 | 打字音效可选 |
| 18-21s | `screens/05_results_grouped.png` | 三列搜索结果 | 时间｜正文｜文件 | 时间、正文、文件三列展示。 | 横向轻移 |
| 21-23s | `screens/06_result_highlight.png` | 关键词黄色高亮与命中段落 | 一屏定位来源 | 命中段落高亮，来源一屏定位。 | 局部缩放 |
| 23-25.5s | `screens/07_filter_panel.png` | 搜索范围与文件类型筛选 | 按范围筛选，按类型聚焦 | 还可以按搜索范围和文件类型快速聚焦。 | 面板滑入 |
| 25.5-27s | 动态视频舞台 | 安全卖点字幕 | 纯本地｜离线运行｜无后台上传 | 纯本地、离线运行、无后台上传。 | 徽章浮入 |
| 27-28.6s | `outro_02_slogan.png` 或动态原型 `scene=slogan` | 蓝紫动态渐变口号页 | 搜文件，不如搜正文 | 搜文件，不如搜正文。 | 口号推入 |
| 28.6-30s | `outro_01_logo.png` 或动态原型 `scene=logo` | LOGO 与产品名 | 快文 QuickDocs，搜文件，不如搜正文 | 快文 QuickDocs，搜文件，不如搜正文。 | LOGO 呼吸淡出 |

## 24 秒结合版逐秒分镜

| 时间 | 使用素材 | 画面 | 字幕 | 旁白 | 转场 |
| --- | --- | --- | --- | --- | --- |
| 0-2.2s | 动态视频舞台 | 浅色渐变背景，LOGO 与产品名 | 快文 QuickDocs | 快文 QuickDocs。 | LOGO 淡入 |
| 2.2-4s | 动态视频舞台 | 搜索框输入“关键词A” | 不用记文件名 | 不用记文件名，直接搜索正文。 | 搜索框轻推入 |
| 4-5.8s | `screens/00_home.png` | 打开软件主界面 | 打开软件，进入本地资料库 | 打开软件，进入本地资料库。 | 软件窗口推入 |
| 5.8-7.6s | `screens/01_actions.png` | 点击 LOGO 展开操作按钮 | 点击 LOGO，常用操作直接弹出 | 添加资料、开始索引、关闭入口一屏可见。 | 鼠标指示 |
| 7.6-9.4s | `screens/02_choose_folder.png` | 添加文件夹面板 | 选择文件夹，建立本地索引 | 选择文件夹，建立本地索引。 | 稳定停留 |
| 9.4-11s | `screens/03_index_done.png` | 索引完成状态 | 索引完成，千份文档稳定检索 | 索引完成后，即可稳定检索千份文档。 | 轻微脉冲 |
| 11-13.2s | `screens/04_search_input.png` | 搜索框输入关键词 | 模拟动态输入关键词 | 输入关键词，立即搜索所有文件正文。 | 轻微聚焦 |
| 13.2-16s | `screens/05_results_grouped.png` | 时间、正文、文件三列结果 | 搜索结果按时间、正文、文件展开 | 搜索结果按时间、正文、文件展开。 | 横向稳定展示 |
| 16-18.2s | `screens/06_result_highlight.png` | 关键词高亮与结果上下文 | 点开结果，看完整上下文 | 点开结果，查看完整上下文。 | 鼠标指示 |
| 18.2-20.4s | `screens/07_filter_panel.png` | 范围、OCR、类型筛选 | 范围、OCR、类型筛选 | 按范围、OCR 和文件类型快速聚焦。 | 面板滑入 |
| 20.4-21.8s | 动态视频舞台 | 本地安全卖点 | 纯本地｜离线运行｜无后台上传 | 纯本地、离线运行、无后台上传。 | 徽章浮入 |
| 21.8-23s | `outro_02_slogan.png` | 口号页 | 搜文件，不如搜正文 | 搜文件，不如搜正文。 | 口号强化 |
| 23-24s | `outro_01_logo.png` | LOGO 收尾 | 快文 QuickDocs | 快文 QuickDocs。 | 淡出 |

## 15 秒版本逐秒分镜

| 时间 | 使用素材 | 画面 | 字幕 | 旁白 | 转场 |
| --- | --- | --- | --- | --- | --- |
| 0-2s | `intro_01_search_box.png` 或动态原型 `scene=search` | 大搜索框输入“关键词A” | 一个关键词，找到所有正文 | 一个关键词，找到所有正文。 | 快速推入 |
| 2-4s | `outro_01_logo.png` | LOGO 与产品名 | 快文 QuickDocs | 快文 QuickDocs，本地文档内容搜索器。 | 淡入 |
| 4-6s | `screens/00_home.png` | 主界面和索引状态 | 本地资料，一次索引 | 一次索引，本地检索。 | 轻推入 |
| 6-9s | `screens/04_search_input.png` | 输入关键词 | 搜索正文 | 输入关键词，搜索文件正文。 | 打字节奏 |
| 9-12s | `screens/06_result_highlight.png` | 结果三列和高亮 | 定位来源文件 | 快速定位来源文件。 | 局部缩放 |
| 12-13s | `screens/07_filter_panel.png` | 范围和类型筛选 | 按类型聚焦，按范围筛选 | 按类型聚焦，按范围筛选。 | 面板滑入 |
| 13-14.2s | `outro_02_slogan.png` | 口号强化页 | 搜文件，不如搜正文 | 搜文件，不如搜正文。 | 口号推入 |
| 14.2-15s | `outro_01_logo.png` | LOGO 与产品名 | 快文 QuickDocs | 快文 QuickDocs。 | 淡出 |

## 字幕样式建议

- 字体：中文用苹方、思源黑体、阿里巴巴普惠体或剪映默认黑体加粗；英文 QuickDocs 用 Inter、SF Pro、Avenir Next。
- 颜色：蓝紫渐变概念画面用白字；软件截图画面用白字加半透明深色底条，或放在画面底部安全区。
- 大小：1080p 横屏建议主字幕 54-68px，辅助字幕 32-40px。
- 英文统一写作：QuickDocs。

## 音乐风格建议

- 轻快、活力、干净、有推进感。
- 推荐关键词：corporate pop、bright tech、light electronic、uplifting beat。
- BPM：110-128。
- 避免低沉、厚重、悬疑、赛博朋克、强粒子音效。
- 可加入轻微键盘输入音、按钮点击音和柔和 whoosh 转场音。

## 打码与脱敏说明

- 实际成片只使用 `promo/export/` 下的演示素材。
- 搜索关键词只展示“关键词A”。
- 文件名只展示示例文件名。
- 路径只展示“示例资料库”。
- 如额外录屏真实软件，必须逐帧检查状态栏、文件列、弹窗、设置面板、系统窗口。
- 禁止出现真实地名、真实文件名、真实路径、真实项目名称、真实正文。

## 剪映 / CapCut 操作建议

- 项目比例：16:9，1920×1080。
- 导入 PNG 后设置每张图持续时间，使用“关键帧”做 3%-6% 的缓慢缩放。
- 打字效果可用文本动画叠加在 `intro_01_search_box.png` 或 `screens/04_search_input.png` 上。
- 转场优先使用淡入淡出、轻推、缩放，不使用炫光爆炸或复杂粒子。
- 字幕放在底部 120px 安全区内。

## Premiere / After Effects 操作建议

- 建立 1920×1080、30fps 序列。
- PNG 素材统一缩放到满屏，保留 16:9。
- 软件截图段可用 adjustment layer 添加轻微锐化和 2%-4% 亮度提升。
- 高亮镜头可用 mask 放大正文区域，添加 8-12px 柔和阴影。
- LOGO 收尾可加 0.3s scale ease-out 和轻微光晕。
- 导出：H.264，1080p，目标码率 12-16 Mbps。

## 最终检查

- 成片中不出现真实地名。
- 成片中不出现真实文件名、真实路径、真实项目名称。
- 所有英文产品名均为 QuickDocs。
- 口号统一为“搜文件，不如搜正文”。
- 安全卖点统一为“纯本地｜离线运行｜无后台上传”。
