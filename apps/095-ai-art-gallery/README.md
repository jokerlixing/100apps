# MUSE/95 · AI 绘画广场

MUSE/95 是一个完全运行在浏览器里的提示词绘画工作台。输入画面描述，选择画面语言、比例和随机种子，即可生成可复现、可收藏、可下载的作品，并在本地画廊里继续检索和管理。

## 功能

- 五种画面语言：梦境拼贴、版画建筑、墨线生长、几何海报、地形光谱
- 三种画幅：1:1、3:4、3:2
- 确定性种子：相同提示词、风格、比例和种子会得到相同作品
- 本地画廊：保存最近 18 张用户作品，支持全部、我的、收藏筛选与搜索
- 作品管理：单件删除或一键清空全部个人作品，并同步清理关联收藏
- 作品操作：收藏、复制提示词配方、导出 PNG
- 响应式布局：覆盖 1440px 桌面和 390px 移动端
- 零构建依赖：原生 HTML、CSS、JavaScript 与 Canvas 2D

## 运行

在仓库根目录启动任意静态文件服务器，例如：

```powershell
python -m http.server 4173
```

然后访问：

- 本地：<http://127.0.0.1:4173/apps/095-ai-art-gallery/>
- 线上：<https://jokerlixing.github.io/100apps/apps/095-ai-art-gallery/>

## 验证

```powershell
node --test apps/095-ai-art-gallery/gallery-core.test.js
node --check apps/095-ai-art-gallery/gallery-core.js
node --check apps/095-ai-art-gallery/art-engine.js
node --check apps/095-ai-art-gallery/app.js
node --check apps/095-ai-art-gallery/qa/browser-smoke.mjs
node apps/095-ai-art-gallery/qa/browser-smoke.mjs
```

浏览器冒烟测试会验证生成、持久化、收藏、筛选、搜索、复制配方、PNG 下载、单件删除、清空全部个人作品，以及桌面和移动端布局；截图写入 `assets/screenshot-desktop.png` 与 `assets/screenshot-mobile.png`。

## 生成边界与隐私

公开应用不会请求云端 AI 接口，也不会上传提示词或作品。浏览器根据提示词关键词、画面语言和种子，使用 Canvas 2D 生成确定性的程序化作品；作品配方只保存在当前浏览器的 `localStorage` 中。

首页特色样片 `assets/floating-library.png` 由 OpenAI 内置图像生成模式制作，提示方向为“蓝色时刻漂浮在镜面海上的不可能图书馆”，采用编辑感水粉与纸雕风格、薰衣草蓝/钴蓝/珊瑚红/薄荷绿/炭黑配色，无文字、标志或水印。其余画廊作品均由应用本地 Canvas 引擎绘制。
