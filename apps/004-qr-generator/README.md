# 🔲 #004 二维码生成器 · QR Generator

> 输入文字/链接实时生成二维码，自定义颜色、尺寸、容错率，支持 WiFi 分享模板，一键下载 PNG 或复制到剪贴板。

## ✨ 功能

- 实时生成（300ms 防抖，输入停顿才重绘）
- 自定义：尺寸三档 / 容错率 L·M·Q·H / 前景背景颜色
- 对比度检测：颜色太接近时提醒"扫码可能失败"（相对亮度算法）
- WiFi 分享模板（`WIFI:T:WPA;S:名;P:密码;;`，手机扫码直连）
- 下载 PNG / 复制图片到剪贴板（Clipboard API）
- 版本、模块数等技术信息实时展示
- CDN 加载失败友好提示

## 🛠 技术栈

- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)（jsdelivr CDN）——只负责"算"出二维码矩阵
- Canvas 手动绘制码点——`isDark(r,c)` 逐格画方块，颜色尺寸完全自主可控
- 新知识点：**CDN 引库 + Canvas 逐像素绘制 + 防抖**

## 🚀 运行

直接打开 `index.html`，或访问 GitHub Pages。需要联网加载 CDN 库（约 8KB）。

## 🔮 未来可加

- 中间嵌 logo（配合 H 容错）
- 批量生成
- 生成历史记录
