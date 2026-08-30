# ADR-0043: 内存型 WebSocket 聊天室与静态回退

## Status

Accepted

## Context

App #043 需要群聊、在线成员与历史消息，同时继续从 GitHub Pages 提供公开入口。静态托管无法承载 WebSocket 服务；挑战项目又不应要求用户配置外部 SaaS 密钥。聊天室内容属于用户输入，必须限制长度、频率和渲染方式，并明确历史是否持久。

## Decision

使用 Node.js HTTP 服务托管单页客户端，并通过 `ws` 8.21.3 提供内存型 WebSocket 房间。每个房间保留最近 120 条经过验证的纯文本消息和最多 30 个在线成员。客户端优先连接同源或 `?ws=` 指定服务；不可用时用 BroadcastChannel 提供同站点多标签回退。

服务端是 WebSocket 历史和 presence 的权威来源，消息 ID 用于幂等合并。BroadcastChannel 模式沿用相同消息结构，通过历史请求/响应让新标签恢复最近消息。断线重连时客户端合并服务端历史，并补发本地仍未出现在快照中的己方消息。

## Consequences

### Positive

- 本地与局域网可以真正跨设备群聊
- GitHub Pages 无需账号即可体验多标签群聊、历史和输入状态
- 历史上限、消息限流与纯文本渲染降低滥用和内存风险
- 服务端只有一个生产依赖，易于运行、测试和审阅

### Negative

- GitHub Pages 不能跨浏览器或跨设备聊天，只能明确显示本机线路
- 进程重启后历史消失，不适合作为长期归档或重要通信工具
- 无账号系统无法提供私密身份验证，房间号本质上是可分享入口

### Neutral

- 若部署到支持 WebSocket 的主机，可以通过同源或 `?ws=wss://...` 启用公网聊天
- 输入状态是临时事件，不计入历史或重连队列

## Alternatives Considered

**托管 Realtime / Chat SaaS**
- 未采用：需要账号、公开密钥、配额与供应商运维

**HTTP 轮询或 SSE**
- 未采用：双向消息、typing 与 presence 需要额外写入通道，协议反而更复杂

**只做 BroadcastChannel**
- 未采用：无法满足题目明确要求的网页多人群聊能力

## Security and failure handling

- 单消息最大 32KB、文本最大 600 字、房间最多 30 人、历史最多 120 条
- 房间号、客户端 ID、消息 ID、姓名、颜色、正文和回复目标均验证
- 服务端 10 秒最多接受 8 条聊天消息，并限制通用事件窗口
- 前端远端内容只写入 `textContent`，不解析 HTML 或 Markdown
- 新连接替换同客户端旧连接时，旧连接的迟到关闭事件不能注销新连接
- 断线消息保留在客户端内存；恢复失败时继续使用本机线路并显示真实状态

## References

- RFC 6455: The WebSocket Protocol
- `ws` project: https://github.com/websockets/ws
