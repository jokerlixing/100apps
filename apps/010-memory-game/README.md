# 🃏 #010 记忆翻牌 · Memory Game

> 经典配对翻牌游戏：CSS 3D 翻转动画、三档难度、步数/计时统计、按难度的最佳纪录。

## ✨ 功能

- 三档难度：6 对（3列）/ 8 对（4列）/ 12 对（4列）
- CSS 3D 卡片翻转（perspective + rotateY + backface-visibility），带弹性的翻转曲线
- 配对成功卡片定格变绿，失败短暂展示后自动翻回
- 状态机防作弊：一对最多翻两张、翻回期间锁定点击
- 步数/用时实时统计，胜利结算 + 新纪录提示
- 最佳纪录按难度分开存 localStorage

## 🛠 技术栈

纯 HTML / CSS / JS 单文件，零依赖。

**核心知识点——CSS 3D 翻转四件套：**
1. 父容器 `perspective:1200px`（给 3D 场景一个视深）
2. 卡片 `transform-style:preserve-3d`（让子元素共享 3D 空间）
3. 翻转 `transform:rotateY(180deg)` + `transition`（Y 轴旋转动画）
4. 正反两面 `backface-visibility:hidden`（背对屏幕时隐藏）

**发牌算法**：emoji 池取前 N → 复制成对 → Fisher-Yates 洗牌——和点名器同款洗牌，游戏公平性的基础。

## 🚀 运行

直接打开 `index.html`，或访问 GitHub Pages。

## 🔮 未来可加

- 音效（翻牌/配对/胜利）
- 翻牌记忆辅助（新手模式：开局预览 2 秒）
- 多人对战（L3 阶段 WebSocket）
