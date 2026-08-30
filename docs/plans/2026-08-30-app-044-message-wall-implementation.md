# App 044 留言墙实现计划

## Step 1：建立可测试的数据核心

- 输出：`apps/044-message-wall/wall-core.js` 与 Node 测试。
- 内容：字段清洗、留言规范化、幂等合并、80 条裁剪、点赞切换、筛选和排序。
- 验证：`node --test apps/044-message-wall/wall-core.test.js`。

## Step 2：实现夜班邮局界面

- 输出：`apps/044-message-wall/index.html`。
- 内容：投递表单、字符计数、邮戳色、两条弹幕分拣带、暂停按钮、留言格、筛选和空状态。
- 验证：脚本语法、唯一 ID、按钮类型、单一 H1、纯文本渲染。

## Step 3：接入持久化与跨标签同步

- 输出：本地数据仓库和 `BroadcastChannel` 消息处理。
- 内容：损坏存储回退、写入合并、发布与点赞广播、刷新恢复、无通道降级。
- 验证：两个浏览器标签页互相收到发布和点赞更新。

## Step 4：完善说明与追踪器

- 输出：应用 README 和根 `index.html` 的 App 044 链接及完成状态。
- 验证：追踪器页面显示 44/100，App 044 卡片链接正确。

## Step 5：全量验证与发布

- 输出：通过测试的提交与 GitHub Pages 页面。
- 验证：自动化测试、浏览器关键流程、控制台、`git diff --check`、远端对象哈希和 Pages 标记。
- 发布：仅同步 GitHub `origin/main`，不推送其他远程仓库。
