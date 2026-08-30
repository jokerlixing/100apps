# App 050 · BEAM/50 实现计划

## Step 1：建立传输核心

- Output：`transfer-core.js`，提供文件队列校验、文件名净化、进度计算、传输协议消息与握手载荷编解码。
- Test：Node 测试覆盖正常路径、损坏输入、大小上限和边界值。

## Step 2：完成 WebRTC 会话控制

- Output：`app.js`，实现发送/接收角色、ICE 收集、DataChannel 生命周期、双向握手和会话重置。
- Test：两个本地页面通过连接文本建立通道；断开和无效文本均得到页面内反馈。

## Step 3：实现分片文件传输

- Output：可靠有序的元数据、32 KiB 二进制分片、背压、队列、速度与进度统计，以及接收文件下载。
- Test：传输多种大小的文本/二进制文件，校验文件名、大小和内容一致；超限文件被拒绝。

## Step 4：完成二维码配对与 BEAM/50 界面

- Output：响应式 `index.html` 与 `styles.css`，包含角色选择、配对票据、摄像头/图片扫码、连接轨道和传输清单。
- Test：二维码可被扫描还原；库或摄像头不可用时复制粘贴仍能完成配对。

## Step 5：文档、追踪器与发布

- Output：项目 README、50 号 GitHub Pages 链接和完成状态；提交并仅推送 GitHub `origin`。
- Test：单元测试、语法检查、HTTP 资源检查、桌面/移动端浏览器回归、GitHub 远端与 Pages 核对。
