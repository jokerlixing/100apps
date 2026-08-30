# STAMP/41 二维码名片

> 把联系人资料制成标准 vCard 3.0，并在浏览器本地生成可扫码保存的二维码、VCF 文件和 PNG 图片。

## 在线体验

https://jokerlixing.github.io/100apps/apps/041-qr-business-card/

## 功能

- 姓名、职位、公司、电话、邮箱、网站、地址与备注编辑
- 电子名片与 QR 版本、矩阵、UTF-8 字节数实时预览
- 生成兼容手机通讯录的 vCard 3.0 二维码
- 下载 UTF-8 `.vcf` 联系人文件
- 下载带四模块静区的高分辨率二维码 PNG
- 复制完整 vCard 原始文本
- 姓名、联系人方式、电话、邮箱和网址校验
- 二维码容量溢出、依赖失败与无效字段状态提示
- 本机草稿恢复、虚构测试资料与二次确认清空
- 响应式布局、键盘焦点与减少动态效果支持

## 隐私边界

联系人资料不会提交到服务器。vCard、二维码、VCF 与 PNG 都在当前浏览器生成；可编辑草稿只保存在当前浏览器的 `localStorage`，点击两次“清空草稿”即可删除。

页面从 jsDelivr 加载二维码计算库，但不会把表单内容传给该服务。二维码矩阵在加载后的本地 JavaScript 中计算和绘制。

## vCard 规则

- 版本：vCard 3.0
- 换行：CRLF
- 编码：UTF-8，VCF 下载带 BOM 以兼容常见中文通讯录工具
- 输出字段：`N`、`FN`、`ORG`、`TITLE`、`TEL`、`EMAIL`、`URL`、`ADR`、`NOTE`
- 文本中的反斜线、分号、逗号和换行会按 vCard 规则转义
- 姓名必填；电话和邮箱至少填写一项
- 未带协议的网站自动补全为 `https://`

## 技术实现

- 单页 HTML / CSS / Vanilla JavaScript
- [qrcode-generator 1.4.4](https://github.com/kazuhikoarase/qrcode-generator)（MIT License）
- Canvas、Blob、Object URL、Clipboard、Download 与 localStorage API
- GitHub Pages 静态部署，无后端、无构建步骤

## 本地运行

在仓库根目录执行：

```bash
python -m http.server 8765
```

访问：

```text
http://127.0.0.1:8765/apps/041-qr-business-card/
```

## 项目信息

- 100 Apps Challenge：App #041
- 视觉主题：通讯录制版室 / 套色印刷
- 存储键：`stamp41-draft-v2`
