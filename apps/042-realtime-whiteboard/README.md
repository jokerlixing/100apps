# BOARD/42 多人实时白板

> 一张带 WebSocket 房间同步、协作光标和本机多标签回退的 Canvas 描图纸白板。

## 在线体验

https://jokerlixing.github.io/100apps/apps/042-realtime-whiteboard/

GitHub Pages 是静态托管，无法承载 WebSocket 服务，因此在线页面会明确显示“本机协作”，支持同一浏览器、同一站点、同一房间的多个标签页实时同步。

## 功能

- 画笔、荧光笔、直线和整笔橡皮
- 6 种预设颜色、自定义颜色与 1—28px 笔触
- 分辨率无关坐标和高 DPI Canvas
- 自己操作范围内的撤销与重做
- 二次确认清空整个房间
- 纸白背景高分辨率 PNG 导出
- 房间链接复制、显示名与在线成员针盘
- WebSocket 新成员快照、增量笔画、presence、光标和断线重连
- BroadcastChannel 同浏览器多标签协作回退
- 不同房间隔离、幂等笔画 ID 与服务端资源限制
- 响应式工具栏、键盘快捷键、可见焦点与减少动态效果支持

## 启动真正的 WebSocket 多人协作

进入应用目录：

```bash
cd apps/042-realtime-whiteboard
npm install
npm start
```

默认访问：

```text
http://127.0.0.1:8765/?room=IDEA-42
```

同一局域网中的其他设备可以把 `127.0.0.1` 替换成运行服务电脑的局域网 IP。若需要监听所有网卡：

```bash
$env:HOST="0.0.0.0"
npm start
```

也可以在静态页面 URL 上通过 `ws` 参数连接自建的 TLS WebSocket 服务：

```text
?room=IDEA-42&ws=wss://example.com/ws
```

## 同步协议

协议版本为 `v: 1`，核心事件包括：

- `join` / `snapshot` / `presence`
- `stroke:start` / `stroke:points` / `stroke:commit`
- `stroke:remove` / `board:clear`
- `cursor` / `ping` / `pong`

服务端以房间快照为权威，新成员先获取当前 2,000 条以内的已提交笔画，再接收实时增量。所有坐标使用 0—1 归一化值，缩放窗口或在不同尺寸设备上查看不会改变图形比例。

## 限制与安全

- 房间最多 20 名 WebSocket 成员
- 房间最多 2,000 条已提交笔画
- 单笔最多 4,000 个点，点位批次最多 160 个
- 单条 WebSocket 消息最大 256KB
- 房间号、成员 ID、笔画 ID、工具、颜色、粗细和坐标均做白名单或范围校验
- 服务端只保留内存状态，不使用账号、数据库或文件上传
- 进程重启后白板会清空；需要长期保存请导出 PNG

## 测试

```bash
npm test
```

测试覆盖输入校验、快照归并、幂等笔画、删除/清空、非法消息、真实 WebSocket 房间隔离与新成员快照。

## 项目信息

- 100 Apps Challenge：App #042
- 视觉主题：透明描图纸会议桌
- 运行时：Node.js 18+、`ws` 8.21.3
- 设计决策：`docs/adr/0042-websocket-with-local-fallback.md`
