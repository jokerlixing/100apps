# DIAL/45 频道调谐台

> 一款本地优先、以广播调谐仪器为视觉主题的 RSS/Atom 阅读器。

## 在线地址

<https://jokerlixing.github.io/100apps/apps/045-rss-reader/>

## 功能

- 三个内置演示频道与 9 篇示例文章
- 添加自定义 RSS 2.0 / Atom 订阅源
- 频道选择、启用、暂停、刷新和本地移除确认
- 全部 / 未读 / 已读筛选
- 标题与摘要搜索
- 单篇标记已读/未读
- 将当前可见文章全部标为已读
- 最多 40 个订阅、300 篇文章
- `localStorage` 保存订阅、文章和已读状态
- 刷新内容时保留较新的本地阅读状态
- 390px 响应式布局、键盘焦点和减少动画支持

## 跨域边界

GitHub Pages 没有后端代理。自定义订阅源由浏览器直接请求，只有原站允许 CORS 时才能读取。读取失败时应用会：

- 保留频道及已有文章
- 显示明确错误状态
- 允许暂停、启用和再次刷新
- 不调用第三方公共代理

内置演示频道无需联网，可以完整体验聚合、搜索和已读流程。

## 安全与数据

- 只接受 `http:` 与 `https:` 链接
- RSS 摘要中的 HTML 转换为纯文本
- 页面使用 `textContent` 渲染订阅内容
- 原文链接使用新标签页和 `noopener noreferrer`
- 数据只保存在当前浏览器

## 文件

- `index.html`：调谐台界面、RSS/Atom 解析、Fetch 与本地状态
- `rss-core.js`：订阅和文章规范化、幂等合并、已读与筛选
- `rss-core.test.js`：Node 自动化测试
- `sample-feed.xml`：浏览器端真实读取测试源

## 测试

```bash
node --check rss-core.js
node --test rss-core.test.js
```

在仓库根目录启动本地服务器：

```bash
python -m http.server 8765
```

应用地址：

<http://127.0.0.1:8765/apps/045-rss-reader/>

可添加以下地址验证真实 RSS 解析：

<http://127.0.0.1:8765/apps/045-rss-reader/sample-feed.xml>
