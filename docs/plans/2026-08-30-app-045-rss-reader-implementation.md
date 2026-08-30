# App 045 RSS 阅读器实现计划

## Step 1：数据核心

- 输出：`apps/045-rss-reader/rss-core.js` 与 Node 测试。
- 内容：订阅与文章清洗、URL 约束、幂等合并、容量裁剪、已读切换、筛选和统计。
- 验证：`node --test apps/045-rss-reader/rss-core.test.js`。

## Step 2：RSS/Atom 读取与解析

- 输出：浏览器解析器与本地 `sample-feed.xml`。
- 内容：直接 Fetch、XML 错误识别、RSS/Atom 常用字段、HTML 转纯文本、相对链接解析、失败状态。
- 验证：本地示例源能生成文章，无效源不覆盖原数据。

## Step 3：调谐台界面

- 输出：`apps/045-rss-reader/index.html`。
- 内容：调谐刻度、频道预设、添加频道面板、刷新、聚合列表、搜索、状态筛选、已读切换和批量已读。
- 验证：关键交互、键盘焦点、390px 布局、减少动态效果和空状态。

## Step 4：说明与追踪器

- 输出：应用 README 与根追踪器 App 045 完成状态和 Pages 链接。
- 验证：本地追踪器显示 45/100。

## Step 5：发布

- 输出：完成提交和 GitHub Pages 页面。
- 验证：自动化测试、浏览器流程、控制台、`git diff --check`、GitHub 对象哈希和 Pages 标记。
- 同步：仅推送 GitHub `origin/main`，不推送其他远程。
