# App 083 · TACK/83 实现计划

## Step 1：可测试便签核心

- Output：`note-core.js` 提供便签创建、更新、复制、筛选排序及 JSON 备份导入导出；`note-core.test.js` 覆盖正常与错误边界。
- Test：`node --test note-core.test.js`。

## Step 2：网页演示与本地持久化

- Output：响应式便签匣、编辑台、颜色与置顶管理、搜索筛选、归档、删除、导入导出、键盘快捷键和首次引导数据。
- Test：语法检查、静态资源检查和浏览器烟雾流程。

## Step 3：Electron 桌面能力

- Output：安全隔离的主进程与 preload 桥接，支持原生始终置顶、紧凑窗口和窗口状态恢复；提供 npm 启动脚本。
- Test：主进程/预加载脚本语法检查、IPC 契约测试与 Electron 启动检查。

## Step 4：交付与追踪器

- Output：README 包含网页入口、桌面运行、隐私边界和测试命令；根追踪器登记 83 号名称、说明、GitHub Pages 链接及正式完成状态。
- Test：运行 App 083 全部测试和根追踪器测试，检查 Git 差异只包含本项目及追踪器更新，提交并仅推送 GitHub `origin`。
