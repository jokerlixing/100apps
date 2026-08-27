# #021 扫雷小游戏 Minesweeper

纯前端、零依赖的经典扫雷单页面应用。打开 `index.html` 即可游玩。

![tech](https://img.shields.io/badge/tech-HTML%20%2B%20CSS%20%2B%20JS-ff6b35)
![deps](https://img.shields.io/badge/dependencies-none-brightgreen)
![tests](https://img.shields.io/badge/tests-89%2F89%20passing-success)

## 🎮 玩法

| 操作 | 效果 |
|------|------|
| 左键 | 翻开格子 |
| 右键 | 插旗 🚩 → 问号 ❓ → 取消 |
| 双击数字格 | 和弦快开：旗数 = 数字时一键展开周围 |
| R | 重新开局 |
| Esc | 关闭结果浮层 |
| 触屏 | 点按翻开 / 长按插旗 |

## ✨ 特性

- 三档难度：初级 9×9/10雷 · 中级 16×16/40雷 · 高级 16×30/99雷
- 首次点击保护：第一下绝不踩雷（首点及周围 8 格无雷）
- 空白格 BFS 连锁展开
- 和弦操作（chord）
- 剩余雷数计数（支持负数）/ 计时器（封顶 999）/ 笑脸重开
- 深色现代 UI，翻开/爆炸动画，移动端响应式

## 🚀 运行

直接双击 `index.html`，或部署到任意静态服务器。

在线版：[GitHub Pages](https://jokerlixing.github.io/minesweeper-game/)

## 🧪 测试

```bash
node run-logic-tests.js     # 工程师自测 21 项
node qa/qa-logic-tests.js   # QA 独立逻辑复核 50 项
node qa/qa-static-checks.js # 页面静态检查 18 项
```

## 📁 结构

```
├── index.html            入口页面
├── css/minesweeper.css   样式（深色主题/动画/配色）
├── js/board.js           核心数据层（纯函数）
├── js/game.js            对局状态机
├── js/ui.js              渲染层
├── js/app.js             事件装配层
├── run-logic-tests.js    逻辑自测
├── test.html             浏览器版自测页
└── qa/                   QA 独立验证脚本与输出
```

---
100 Apps Challenge · 2026-08-27 · App #021/100 · 来源：[minesweeper-game](https://github.com/jokerlixing/minesweeper-game)
