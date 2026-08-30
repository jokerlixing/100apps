# GALLEY/74 · 在线协同文档

100 个应用挑战的第 74 个项目。GALLEY/74 把浏览器变成一张编辑部校样桌：成员进入同一房间后共同修改文档、留下可解决的批注、查看历史版本，并在误改后把旧稿恢复成一个新版本。GitHub Pages 页面无需账号或密钥，打开两个同源标签页即可验证本机实时协作；启动仓库内的 WebSocket 服务后，可在局域网或已部署的服务上跨设备协作。

![GALLEY/74 桌面端校样纸、文档抽屉与红铅笔批注轨道](assets/screenshot-desktop.png)

## 功能

- 房间链接、显示名、连接状态与在线成员头像
- 标题、正文、二级标题、引用、粗体、斜体、下划线和列表编辑
- 240ms 自动保存与明确的“本机协作 / 跨设备在线”线路状态
- `BroadcastChannel` 同浏览器多标签页实时同步与 `localStorage` 刷新恢复
- WebSocket 房间快照、成员状态、断线本机降级与自动重连
- 选中文字后添加批注、待处理筛选、解决与重新打开
- 最近 16 个版本的元数据与正文历史，恢复旧稿时生成新版本
- 最近房间抽屉、新建房间、复制房间号与分享链接
- JSON 备份导入导出、独立 HTML 文档导出
- 1440px 桌面三栏和 390px 手机单面板布局
- 可见键盘焦点、语义化标签、打印样式和 reduced-motion 支持

## 在线体验

```text
https://jokerlixing.github.io/100apps/apps/074-collaborative-document/
```

GitHub Pages 只能托管静态文件，无法接受 WebSocket Upgrade。因此在线地址会明确显示“本机协作”，支持同一浏览器、同一站点、同一房间的多个标签页同步；它不会把这种模式描述成互联网跨设备协作。

## 启动 WebSocket 协作服务

```powershell
cd apps/074-collaborative-document
npm install
npm start
```

默认访问：

```text
http://127.0.0.1:8765/?room=GALLEY-74
```

要让同一局域网中的其他设备访问，可监听全部网卡：

```powershell
$env:HOST="0.0.0.0"
npm start
```

若前端和服务端分别部署，可在静态页面 URL 中指定 TLS WebSocket 地址：

```text
?room=TEAM-DOC&ws=wss://example.com/ws
```

房间内容只保存在服务进程内存中，最后一名成员离开 30 分钟后释放。需要长期保留时，应在浏览器导出 JSON 备份；当前版本不提供账号、数据库或服务器文件存储。

## 同步模型与冲突边界

协议版本为 `v: 1`，核心消息包括：

- `join` / `snapshot` / `presence`
- `document:update` / `document:conflict`
- `version:restore` / `version:restored`
- `ping` / `pong` / `error`

服务端以单调递增的房间 `revision` 为权威。客户端提交时必须携带 `baseRevision`；旧版本更新会收到权威快照，并在最新版本上重新发送尚未保存的本地修改。这个模型适合小团队共同编辑短文档，但它是受版本号保护的整份快照同步，不是 CRDT 或 OT：两个人同时修改同一段时，较晚被服务端接受的整份稿件会成为当前版本。产品界面和说明不会把它宣传成无损字符级并发合并。

## 安全与资源限制

- 标题最多 120 字，正文 HTML 最多 120,000 字符
- 每房间最多 24 名 WebSocket 成员、200 条批注、16 份历史正文
- 单条批注最多 1,000 字，引用摘要最多 280 字
- 单个 WebSocket 载荷最大 192KB，每成员 10 秒最多 30 次写操作
- 客户端仅保留基础排版标签并删除全部属性
- 服务端拒绝脚本、嵌入内容、事件属性和危险 `href/src` 协议
- 姓名、批注、版本和成员信息通过 `textContent` 创建，不拼接远端 HTML
- HTTP 服务只公开页面、样式、浏览器脚本和截图，不公开服务端、测试、依赖或包清单
- `ws` 锁定到通过当前 `npm audit` 的 8.21.3

## 测试

在应用目录执行：

```powershell
npm test
npm run test:browser
npm audit --audit-level=high
node --check sync-core.js
node --check server.js
node --check app.js
```

核心与服务端测试覆盖输入裁剪、危险 HTML、版本冲突、历史裁剪、恢复、健康检查、静态文件边界、真实 WebSocket 快照、成员、房间隔离和批注同步。浏览器烟测启动临时服务和无头 Chrome/Edge，在两个真实标签页中完成编辑、成员同步、批注、版本恢复、JSON/HTML 下载，并检查桌面与 390px 手机布局以及运行时异常。

需要重新生成 README 截图时：

```powershell
$env:UPDATE_SCREENSHOTS="1"
npm run test:browser
```

## 技术栈

- 语义化 HTML、原生 CSS、原生 JavaScript
- `contenteditable`、Selection/Range、BroadcastChannel、localStorage、Blob
- Node.js 18+、`ws` 8.21.3、`node:test`
- Chrome DevTools Protocol 双标签页浏览器验收

## 项目信息

- 100 Apps Challenge：App #074
- 产品代号：GALLEY/74
- 视觉主题：编辑部校样桌 / 红铅笔批注轨道
- 部署模式：GitHub Pages 本机协作 + 可选 WebSocket 跨设备服务
