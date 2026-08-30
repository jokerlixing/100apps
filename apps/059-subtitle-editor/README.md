# CUT/59 · 字幕走片台

一款纯前端、本地优先的字幕时间轴编辑器。打开本地视频后，可以导入 SRT 或 WebVTT，跟随播放头逐条校正字幕，再导出为通用字幕文件。

## 功能

- 本地选择视频并播放、暂停、拖动，支持约 40ms 的逐帧步进
- 导入 UTF-8 SRT / WebVTT，兼容多行字幕、VTT cue id 和 cue settings
- 播放画面实时叠加当前字幕，字幕列表、总览走片尺和播放头保持联动
- 新增、删除、复制、拆分字幕，直接编辑起止时间与文字
- 整条字幕可按 100ms / 500ms 前后微调，也可用播放头设置入点和出点
- 标记无效时间范围、空字幕、超长字幕、阅读速度过快和相邻字幕重叠
- 搜索字幕并导出标准 SRT / WebVTT
- 带版本的浏览器草稿恢复、键盘快捷键、可见焦点和减少动效支持

## 隐私与限制

视频通过浏览器 Object URL 在本机预览，不会上传，也不会写入草稿。刷新页面后需要重新选择视频。

字幕草稿只保存在当前浏览器的 `localStorage` 中。字幕文件限制为 2MB、2,000 条；单条文字最多 1,000 字符。视频格式支持范围由当前浏览器决定，通常建议使用 MP4 或 WebM。

## 快捷键

- `Space`：播放 / 暂停
- `J` / `L`：后退 / 前进约一帧
- `K`：暂停
- `[` / `]`：把当前播放头设为所选字幕的入点 / 出点
- `Alt + ←` / `Alt + →`：整条字幕前后微调 100ms
- `Ctrl/Cmd + Enter`：在当前播放位置新增字幕

## 本地运行

从仓库根目录启动静态服务器：

```bash
python -m http.server 8000
```

打开：

```text
http://127.0.0.1:8000/apps/059-subtitle-editor/
```

## 测试

```bash
node --test apps/059-subtitle-editor/subtitle-core.test.js
node --check apps/059-subtitle-editor/subtitle-core.js
node --check apps/059-subtitle-editor/app.js
```

核心测试覆盖 SRT/VTT 时间码、双格式解析、异常块恢复、条目规范化、重叠诊断、当前字幕选择、拆分、平移和双格式导出。

## 文件

- `index.html`：语义结构、视频监视器、字幕清单、走片尺和检查器
- `styles.css`：CUT/59 剪辑台视觉、响应式布局和交互状态
- `subtitle-core.js`：无 DOM 依赖的字幕领域逻辑
- `subtitle-core.test.js`：Node 单元测试
- `app.js`：视频、编辑、草稿、导入导出和键盘交互
