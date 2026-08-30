# ADR-0042: WebSocket 房间服务与本机协作回退

## Status

Accepted

## Context

App #042 必须演示多人实时白板，同时继续通过 GitHub Pages 提供公开入口。GitHub Pages 只能托管静态文件，无法接受 WebSocket Upgrade。项目还需要做到无账号即可体验、同步边界诚实、服务端可在本机独立运行和验证。

## Decision

使用一个无框架的 Node.js HTTP 服务托管静态前端，并通过 `ws` 8.21.3 提供内存型房间 WebSocket。前端优先连接同源或 `?ws=` 指定端点；连接不可用时使用 BroadcastChannel 作为同浏览器、同站点、同房间的本机协作通道。

服务端是房间状态权威来源，新成员收到完整快照；客户端用增量事件保持低延迟。BroadcastChannel 模式选举最早打开的标签页作为快照响应者，但所有已提交操作使用幂等笔画 ID 合并。

## Consequences

### Positive

- 本地与局域网具备真正的跨设备 WebSocket 协作
- GitHub Pages 无需密钥即可体验多标签协作
- 同一套消息协议可以测试两种传输路径
- 服务端没有数据库、账号和部署供应商绑定，易于理解和运行

### Negative

- GitHub Pages 公网入口不能跨设备实时协作，必须明确标记为本机回退
- 内存房间在服务重启后丢失，不能用于长期存档
- BroadcastChannel 快照选举只是轻量实现，不提供强一致性保证

### Neutral

- 用户若部署到支持 WebSocket 的主机，可通过同源访问或 `?ws=wss://...` 直接启用公网协作
- `ws` 是唯一服务端生产依赖，前端保持零依赖

## Alternatives Considered

**托管 Realtime / PubSub**
- 未采用：需要外部账号、公开密钥、配额和供应商运维

**WebRTC 数据通道**
- 未采用：仍需信令，且多人网状连接和 NAT 失败恢复超出白板 MVP

**只做 BroadcastChannel**
- 未采用：无法满足题目明确要求的 WebSocket 跨设备协作

## Security and failure handling

- 服务端限制消息为 256KB、房间最多 20 人、快照最多 2,000 笔、单笔最多 4,000 点
- 房间 ID、客户端 ID、笔画 ID、坐标、颜色、粗细和消息类型都经过白名单与范围校验
- 未识别或非法消息返回错误而不广播；高频光标和点位消息做窗口限流
- 断线不会删除已提交笔画；临时笔画和 presence 会被清理
- 客户端 WebSocket 重连失败时保持 BroadcastChannel 可用并显示真实传输状态

## References

- RFC 6455: The WebSocket Protocol
- `ws` project: https://github.com/websockets/ws
