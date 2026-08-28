# #026 读书笔记应用 (Reading Notes)

书摘收藏应用：多字段搜索 + 标签分类 + 星标收藏 + 一键复制。

## 功能
- **摘录收藏**：书名 + 作者 + 书摘多行内容 + 多标签（空格分隔）
- **全字段搜索**：书名/作者/书摘内容/标签 联合匹配，实时过滤
- **标签聚合**：标签栏动态生成（distinct 聚合），点击精确过滤，可与搜索叠加
- **★ 收藏**：星标心头好，标签栏"★ 收藏"快速筛选
- **一键复制**：格式化书摘「引文」——《书名》作者，剪贴板 API + fallback
- **统计条**：笔记数 / 书籍数（去重）/ 标签数 / 收藏数
- **删除**：内联二次确认（2.5s 超时），无 confirm 弹窗
- localStorage 持久化

## 核心知识点：多字段联合搜索
```
数据模型：notes[{id, book, author, quote, tags[], fav, ts}]

搜索策略（haystack 拼接法）：
  hay = (book + author + quote + tags.join()).toLowerCase()
  hay.includes(query) → 命中
  
  一次拼接，全字段覆盖——数据量 < 千条时性能绰绰有余
  （更大的数据才需要倒排索引）

标签聚合：
  allTags() = Set 遍历去重 → 排序渲染
  过滤链：标签过滤 ∩ 文本搜索（可叠加）
```

## 细节
- 书摘换行保留（\n → <br>）
- toast 动态创建（首次调用才注入 DOM）
- Ctrl+Enter 快速提交
- esc() 全量转义防注入
- hover 已包 @media(hover:hover)（移动端不卡亮）

## 技术栈
纯 HTML/CSS/JS 单文件，零依赖。

---
100 Apps Challenge · 2026-08-27 · App #026/100
