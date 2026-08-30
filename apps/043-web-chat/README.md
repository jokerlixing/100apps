# PATCH/43 网页聊天室

> 一个带最近历史、在线成员、输入状态、消息回复和静态回退的房间制 WebSocket 群聊。

## 在线体验

https://jokerlixing.github.io/100apps/apps/043-web-chat/

GitHub Pages 只能托管静态文件，无法接受 WebSocket Upgrade。在线页面会明确显示“本机线路”，支持同一浏览器、同一站点、同一房间的多个标签页实时群聊、成员状态、输入提示和历史交换。

## 功能

- 房间链接、显示名与彩色成员插孔板
- 群聊纯文本消息与最近 120 条内存历史
- 新成员快照、刷新恢复和幂等消息 ID
- 乐观发送、发送中/等待线路/已送达/发送失败状态
- 回复指定历史消息并显示一行摘要
- Enter 发送、Shift+Enter 换行、Esc 取消回复
- 600 字计数和四个快捷表情
- 在线成员、输入状态与自动过期
- 只在接近底部时自动滚动，否则显示新消息按钮
- WebSocket 断线重连、未送达补发和 BroadcastChannel 回退
- 服务端房间隔离、消息限流、容量限制和输入校验
- 响应式成员条、键盘焦点与减少动态效果支持

## 启动真正的 WebSocket 群聊

```bash
cd apps/043-web-chat
npm install
npm start
```

默认访问：

```text
http://127.0.0.1:8765/?room=HELLO-43
```

若需要让局域网其他设备访问，可监听全部网卡：

```powershell
$env:HOST="0.0.0.0"
npm start
```

部署到支持 WebSocket 的主机后，也可以从静态页面指定服务地址：

```text
?room=HELLO-43&ws=wss://example.com/ws
```

## 协议

协议版本为 `v: 1`：

- `join` / `snapshot` / `presence`
- `chat:send` / `chat:message`
- `typing`
- `ping` / `pong` / `error`

服务端负责 WebSocket 房间历史和成员状态。客户端使用消息 ID 幂等合并；断线恢复时先合并服务端历史，再补发仍缺失的己方消息。

## 限制与安全

- 房间最多 30 人
- 每房间保留最近 120 条消息
- 单条消息最多 600 字，单个 WebSocket 载荷最大 32KB
- 单成员 10 秒最多发送 8 条聊天消息
- 服务端历史只在内存，空房间 30 分钟后释放，进程重启后清空
- 不使用账号、数据库、文件上传或 HTML/Markdown 渲染
- 远端姓名、消息和回复摘要都通过 `textContent` 写入页面

## 测试

```bash
npm test
```

测试覆盖纯文本安全、历史裁剪、消息幂等、回复目标、非法载荷、真实 WebSocket 群聊、输入状态、房间隔离、新成员历史和刷新连接替换。

## 项目信息

- 100 Apps Challenge：App #043
- 视觉主题：话路交换局 / 打孔纸带
- 运行时：Node.js 18+、`ws` 8.21.3
- 设计决策：`docs/adr/0043-ephemeral-websocket-chat.md`
