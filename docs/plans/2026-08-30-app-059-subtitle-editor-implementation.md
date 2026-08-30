# App 059 · CUT/59 实施计划

## Step 1：可测试的字幕核心

- 输出：`subtitle-core.js` 与 `subtitle-core.test.js`。
- 内容：时间码、SRT/VTT 解析、条目规范化、诊断、活动字幕、拆分和导出。
- 验证：`node --test apps/059-subtitle-editor/subtitle-core.test.js`。

## Step 2：剪辑台结构与视觉系统

- 输出：`index.html` 与 `styles.css`。
- 内容：设备铭牌、视频监视器、字幕叠加、走片尺、字幕单列表与检查器。
- 验证：语义标签齐全、键盘焦点可见、桌面与移动端无溢出。

## Step 3：视频与编辑交互

- 输出：`app.js`。
- 内容：本地视频 Object URL、播放联动、导入/导出、条目增删复制拆分、时间微调、搜索、持久化和快捷键。
- 验证：`node --check apps/059-subtitle-editor/app.js`，浏览器覆盖正常、空、错误、重叠与无视频状态。

## Step 4：交付与追踪

- 输出：应用 `README.md`，根追踪器中 #059 的文案、链接和完成态。
- 验证：运行全部核心测试、脚本语法检查和本地静态服务器视觉检查，确认 Git 差异只包含 App 059 与对应文档/追踪项。
