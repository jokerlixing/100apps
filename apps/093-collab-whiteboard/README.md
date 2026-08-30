# ROOM/93 · 团队协作白板

ROOM/93 是 100 Apps Challenge 的第 93 个项目：一个不依赖后端、打开即用的团队协作白板。它把模板、便签、文本、形状、连接线、编辑历史、成员状态和导出整合在一张“项目作战室”画布中。

## 访问与本地运行

公开版本：

`https://jokerlixing.github.io/100apps/apps/093-collab-whiteboard/`

本地建议从仓库根目录启动静态服务器：

```powershell
python -m http.server 4193
```

然后打开 `http://127.0.0.1:4193/apps/093-collab-whiteboard/`。

## 核心功能

- 四套起始模板：空白画布、项目启动会、冲刺复盘和用户旅程。
- 创建便签、文本与三种形状；拖动、双击编辑、复制、删除、调色、精确定位和层级调整。
- 选择两个对象创建贝塞尔连接线；移动对象时连线实时跟随。
- 撤销与重做，房间级 localStorage 持久化，刷新后继续编辑。
- 通过 BroadcastChannel 在同源、同一浏览器的多个标签页间同步白板、在线成员和协作光标。
- 导出可编辑 JSON 备份或当前白板 PNG 快照，支持校验后导入 JSON。
- 桌面端三栏作战室布局，移动端保留完整画布操作和横向浏览。

## 键盘操作

- `V`：选择工具
- `N`：新建便签
- `T`：新建文本
- `S`：新建形状
- `C`：连接线工具
- `Delete` / `Backspace`：删除已选对象
- `Ctrl/Cmd + D`：复制已选对象
- `Ctrl/Cmd + Z`：撤销
- `Ctrl/Cmd + Shift + Z` 或 `Ctrl/Cmd + Y`：重做
- `Escape`：退出连接线工具并取消选择

## 数据与协作边界

- 白板内容保存在当前站点的 localStorage 中，不会上传到第三方。
- “邀请链接”只携带房间码。实时协作依赖 BroadcastChannel，只在同一浏览器、同一站点来源的标签页之间生效；它不是跨设备或公网协作服务。
- 清除浏览器站点数据会删除所有本地房间。需要长期保留时，请导出 JSON 备份。
- PNG 导出是当前对象范围的静态快照；JSON 才能重新导入并继续编辑。
- 无法使用 BroadcastChannel、剪贴板或本地存储时，界面会说明降级状态或可执行的替代操作。

## 无障碍与响应式

- 页面只有一个主标题，工具栏、画布、模板架和检查器均有语义化标签。
- 交互控件支持键盘遍历并显示清晰焦点；对象可以通过 Enter 或空格选择。
- 状态变化通过 `aria-live` 播报；颜色选择包含文字标题，不以颜色作为唯一信息。
- `prefers-reduced-motion` 下关闭非必要动画。
- 390 px 窄屏下隐藏模板架、压缩顶栏，并允许白板水平浏览；选中对象时检查器作为底部浮层出现。

## 验证

```powershell
node --test apps/093-collab-whiteboard/board-core.test.js
node --check apps/093-collab-whiteboard/board-core.js
node --check apps/093-collab-whiteboard/app.js
node apps/093-collab-whiteboard/qa/browser-smoke.mjs
```

浏览器冒烟测试会使用临时 Chrome/Edge 用户目录，真实覆盖双标签成员上线、跨标签状态同步、对象编辑、撤销重做、模板切换、刷新持久化、JSON 校验、PNG 导出和桌面/移动布局，并将验收截图写入 `assets/`。

## 技术栈

原生 HTML、CSS、JavaScript，浏览器 localStorage、BroadcastChannel 与 Canvas 2D；自动化测试使用 Node.js 内置测试运行器和 Chrome DevTools Protocol。项目无第三方运行时依赖。
