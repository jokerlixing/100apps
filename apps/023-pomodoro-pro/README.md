# #023 番茄钟 Pro (Pomodoro Pro)

番茄钟进阶版：任务关联 + 番茄计数 + 每周专注图表。

## 功能
- **三模式状态机**：🍅 专注 25 分 → ☕ 小憩 5 分，每 4 个番茄 → 🛌 长休 15 分（自动流转）
- **任务关联**：添加任务清单，点选关联当前番茄钟；完成后任务自动累加 🍅 计数
- **环形进度**：SVG 圆环（C=2πr=628），金色专注/绿色小憩/蓝色长休三色联动
- **今日统计**：今日番茄数 + 累计专注分钟
- **每周图表**：近 7 天柱状图（div 实现），今天绿色高亮，含本周合计
- **移动端振动提醒**（navigator.vibrate）+ toast
- **数据持久化**：任务/历史/番茄数全存 localStorage

## 核心知识点：时间戳锚定计时器
```
❌ 误区：setInterval 每秒 leftMs -= 1000
   → 切后台被节流，回来时间"变慢"
✅ 正解：endTime = Date.now() + leftMs 锚定
   每 250ms tick 计算 leftMs = endTime - Date.now()
   → 无论 interval 被节流多少，时间永远精确

visibilitychange 监听：切回前台立即校准显示
状态机流转：
  focus 完成 → focusCount++
    count % 4 === 0 ? long : short
  休息完成 → 回 focus
```

## 数据结构
```
tasks:   [{id, name, count}]          # count = 该任务番茄数
history: [{date, minutes, pomos}]     # 按日聚合
周图表 = 近7天日期序列 join history，group by date
```

## 技术栈
纯 HTML/CSS/JS 单文件，零依赖。图表为纯 CSS 柱状图。

---
100 Apps Challenge · 2026-08-27 · App #023/100
