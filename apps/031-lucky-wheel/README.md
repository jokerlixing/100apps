# #031 抽奖转盘 (Lucky Wheel)

可配置奖项权重的抽奖转盘：Canvas 绘制 + 加密级随机 + 拟真减速动画。

## 功能
- **Canvas 转盘**：扇区大小=权重比例，文字沿半径方向排布，12 色轮换
- **奖项管理**：改名/调权重（1-99）/添加/删除（二次确认），至少 2 项
- **权重随机**：`crypto.getRandomValues` 加密级随机（不可预测）
- **拟真动画**：cubic-bezier(.15,.85,.25,1) 缓动 4.5s，快起慢停 + 随机 6-8 圈
- **灯圈闪烁**：16 灯泡跑马灯，转时 160ms 交替闪烁
- **中心 GO 按钮**：金色径向渐变，按下缩放
- **抽奖记录**：最近 30 条，一键清空
- **状态持久化**：奖项/历史/转盘角度全存 localStorage

## 核心知识点：先定果后转盘
```
真实抽奖流程（动画是表演，概率开局已定）：
① r = secureRandom() × 总权重
② 逐项扣减权重 → 落在奖项 hitIdx
③ 反算 hitIdx 扇区中心角 midAng（与绘制同基准 -π/2）
④ 计算转盘需转过的绝对角度 = 对齐差 + 6~8圈
⑤ CSS transition 转过去，4.6s 后揭示结果

角度对齐公式：
  midFrac = (前缀权重 + 权重/2) / 总权重
  midAng = midFrac × 2π - π/2
  delta = (1.5×2π - midAng) mod 2π - 当前相对角
```

## 防作弊说明
Math.random 可被控制台预测；crypto.getRandomValues 用系统熵源，
权重概率真实——扇区多大中奖率就多高。

## 技术栈
纯 HTML/CSS/JS 单文件，Canvas 2D + CSS transition。

---
100 Apps Challenge · 2026-08-28 · App #031/100 · 🏆 L2 通关
