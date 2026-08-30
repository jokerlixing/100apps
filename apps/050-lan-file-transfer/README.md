# BEAM/50 局域网文件快传

100 个应用挑战的第 50 个项目。一个部署在静态页面上的 WebRTC 点对点文件快传工具：两台设备通过二维码或连接文本交换握手信息，文件随后直接在设备之间传输，不上传应用服务器。

## 功能

- 发送端与接收端双角色工作台
- WebRTC DataChannel 可靠、有序的点对点传输
- 邀请与回应两步二维码配对
- 摄像头扫码、二维码图片识别和连接文本复制粘贴三种入口
- 多文件队列与 32 KiB 分片传输
- 发送背压控制，避免浏览器通道缓冲区无限堆积
- 实时整体进度、传输速度与逐文件状态
- 接收完成后逐个保存，避免浏览器拦截批量下载
- 单次最多 50 个文件、总大小 200 MB
- 响应式布局、键盘焦点和 reduced-motion 支持

## 使用方法

1. 两台设备连接同一个局域网，并分别打开 BEAM/50 页面。
2. 一台选择“发送文件”，添加文件并生成邀请。
3. 另一台选择“接收文件”，扫描或粘贴邀请，生成回应。
4. 发送端扫描或粘贴回应，等待本地通道接通。
5. 发送端开始传输；接收端在文件完成后选择“保存文件”。

二维码只是连接信息的可视化。摄像头或二维码组件不可用时，可以完整复制 `beam50.v1...` 连接文本继续配对。

## 本地运行

摄像头与 WebRTC 需要安全上下文。可在仓库根目录启动本地服务器：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:8765/apps/050-lan-file-transfer/
```

## 测试

```powershell
node --test apps/050-lan-file-transfer/transfer-core.test.js
```

## 技术与限制

- 原生 HTML、CSS、JavaScript
- WebRTC DataChannel、CompressionStream、MediaDevices、Canvas、Blob URL
- [qrcode-generator 1.4.4](https://github.com/kazuhikoarase/qrcode-generator)（MIT）生成二维码
- [jsQR 1.4.0](https://github.com/cozmo/jsQR)（Apache-2.0）识别二维码
- 公共 STUN 只协助设备发现网络路径，文件内容不经过 STUN；应用不配置 TURN 中继
- 企业防火墙、访客 Wi-Fi 隔离或严格 NAT 可能阻止点对点连接
- 页面刷新或关闭会立即断开通道，未保存的接收文件不会保留
