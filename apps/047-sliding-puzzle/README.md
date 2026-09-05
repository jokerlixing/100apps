# SHIFT/47 全图交换拼图

100 个应用挑战的第 47 个项目。一台复古便携游戏机风格的图片修复台：整张图片铺满棋盘，拖动任意方块到另一块上交换位置，直到恢复原图。

![SHIFT/47 彩色创意桌面拼图](assets/colorful-desk-puzzle.png)

## 功能

- 棋盘铺满完整图片，不留空格
- 拖动任意方块到另一块上直接交换
- 点击两块交换，兼顾手机与无障碍操作
- 方向键移动焦点，Enter/空格选择方块
- 3×3、4×4、5×5 三档难度
- Fisher–Yates 随机打乱，方块完整且不重复
- 内置高对比彩色创意桌面插画，也可上传最大 8 MB 的本地图片
- 网页预加载约 124 KB 的 WebP 内置图；选择、交换与重新打乱复用方块节点，减少移动端重复渲染
- 上传图片在浏览器内居中裁成正方形，不会发送到服务器
- 本地图片异步压缩至最大 1024×1024，使用共享 Blob URL，换图后释放旧资源
- 第一笔有效交换开始计时，实时显示交换次数与用时
- 按住查看完整原图，完成后自动展示成品
- 按图片类型、玩法和难度保存本机最佳纪录
- 换图、换难度和重新打乱均使用页面内二次确认
- 响应式布局、清晰焦点状态和 reduced-motion 支持

## 操作

- 鼠标或触屏：抓住一块图片，拖到另一块上松开。
- 点击：依次点击两块图片；再次点击已选方块可取消。
- 键盘：方向键移动焦点，Enter 或空格选择并交换，Esc 取消选择。
- 按住棋盘正下方的「按住查看原图」进行比对，松开后继续拼图；手机长按不会选中文字或弹出复制菜单。

## 本地运行

在仓库根目录启动静态服务器：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

访问 `http://127.0.0.1:8765/apps/047-sliding-puzzle/`。

线上地址：`https://jokerlixing.github.io/100apps/apps/047-sliding-puzzle/`

## 测试

```powershell
node --test apps/047-sliding-puzzle/*.test.js
```

浏览器回归检查需要 Python 和 Playwright（首次运行前安装 `playwright` 包及 Chromium）：

```powershell
python apps/047-sliding-puzzle/qa/verify-rendering.py
```

该检查覆盖三档难度、节点复用、键盘/触屏交换、完成后重玩、本地换图、取消操作、PNG 编码回退和资源释放；截图与结果写入临时目录。

## 技术栈

- 语义化 HTML 与原生 CSS 响应式布局
- 原生 JavaScript、Pointer Events、HTML Drag and Drop
- Blob URL、Canvas 与 localStorage
- Node.js 内置 `node:test` 单元测试
- OpenAI 内置图像生成工具制作项目插画

项目不依赖第三方运行时库或在线 API。仅最佳纪录写入 localStorage；上传的图片不会持久化或离开当前页面。
