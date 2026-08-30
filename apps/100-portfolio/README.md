# INDEX/100 · 个人作品集网站

100 Apps Challenge 的第 100 个项目，也是这次挑战的收官入口。INDEX/100 把一百个应用整理成一份可浏览的作品档案：访问者可以从 10×10 项目索引、代表作和完整档案三个层次理解挑战，并直接打开已有部署链接。

![INDEX/100 桌面端首页](assets/screenshot-desktop.png)

## 核心功能

- 从根追踪器读取最新的前 100 个项目，不复制第二份官方进度
- 10×10 项目打孔索引用真实项目状态编码，可悬停、聚焦和点击翻阅
- 按项目名称、说明、编号、难度和完成状态组合筛选
- 项目详情弹窗展示难度、状态、说明和公开访问入口
- 下载当前作品清单为 JSON，方便备份或二次整理
- 明暗阅读模式保存在浏览器本地
- 追踪器读取失败时切换到内置精选集，并明确标记数据来源
- 适配键盘、减少动态效果偏好、桌面与移动端布局

## 数据与隐私

页面只请求同一 GitHub Pages 站点下的根 `index.html`，通过纯文本解析读取 `IDEAS` 和 `INIT_DONE`。解析过程不会执行追踪器中的 JavaScript，只接受 `http` / `https` 项目链接。除阅读模式外不保存个人数据，也不调用第三方 API。

## 本地运行

从仓库根目录启动任意静态服务器，例如：

```powershell
python -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/apps/100-portfolio/
```

直接双击 `index.html` 时，浏览器通常会阻止页面读取上级目录文件；此时作品集会使用内置精选集。要检查完整 100 项，请使用静态服务器。

## 验证

```powershell
node --test apps/100-portfolio/portfolio-core.test.js
node apps/100-portfolio/qa/browser-smoke.mjs
```

浏览器验收会检查真实追踪器加载、100 个项目格、项目选择、组合筛选、详情弹窗、JSON 导出、焦点样式、移动端 44px 触控格、页面溢出和运行时错误，并更新以下视觉证据：

- `assets/screenshot-desktop.png`
- `assets/screenshot-archive.png`
- `assets/screenshot-mobile.png`

## 技术栈

- Semantic HTML
- Modern CSS（Grid、custom properties、`color-mix()`、原生 `dialog`）
- Vanilla JavaScript
- Node.js test runner
- Chrome DevTools Protocol 浏览器验收

## 部署地址

https://jokerlixing.github.io/100apps/apps/100-portfolio/
