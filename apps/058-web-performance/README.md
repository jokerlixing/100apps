# TRACE/58 · 网页性能检测器

一台部署在浏览器里的网络飞行记录器。输入公开网址并选择移动端或桌面端后，TRACE/58 会调用 Google PageSpeed Insights v5，把 Lighthouse 性能分数、核心指标、优化机会和请求瀑布整理成一份可直接行动的中文报告。

## 功能

- 自动补全 `https://`，拒绝非 HTTP(S)、带账号凭据、localhost 和私网地址
- 支持移动端和桌面端 Lighthouse 性能审计
- 展示性能总分、FCP、LCP、Speed Index、TBT 与 CLS
- 按预计节省时间排列最多 5 条高价值优化机会
- 从网络请求中选出最多 12 个主要资源，绘制相对时间瀑布
- 90 秒超时、主动取消、HTTP 状态分类和明确的限流提示
- 公共 API 不可用时可加载明确标记的示例报告
- 最近 6 次成功实时检测保存在当前浏览器，可一键重新检测或清空
- 键盘焦点、`aria-live` 状态播报、减少动态效果和 360px 移动端布局

## 数据来源与限制

实时报告来自 [Google PageSpeed Insights API v5](https://developers.google.com/speed/docs/insights/v5/get-started)。该接口可以无 API Key 调用，但公共额度可能返回 429；应用会说明当前状态，并提供不冒充实时结果的示例报告。频繁或自动化使用应按 Google 文档配置自己的服务端配额方案，不要把私人 API Key 写入公开的 GitHub Pages 代码。

页面展示的是一次受控 Lighthouse 实验室测试。实际访客体验会受到设备、网络、地理位置和缓存状态影响。目标页面必须能被 Google 服务从公网访问，因此本机开发地址、内网服务和登录后页面无法检测。

## 隐私

开始实时检测时，输入的网址会发送给 Google PageSpeed Insights。应用不会收集账号密码，也会拒绝网址中携带的凭据。最近检测仅以摘要形式保存在当前浏览器 `localStorage`，不会上传到本项目的服务器。

## 本地运行

从仓库根目录启动静态服务器：

```bash
python -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/apps/058-web-performance/
```

## 测试

```bash
node --test apps/058-web-performance/tests/performance-core.test.js
node --check apps/058-web-performance/performance-core.js
node --check apps/058-web-performance/app.js
```

核心测试覆盖 URL 规范化与私网拦截、API 查询参数、Lighthouse 分数分级、缺失指标、优化机会排序、请求瀑布时间线、历史数据清理和显示格式化。

## 文件

- `index.html`：检测表单、状态区和报告语义结构
- `styles.css`：TRACE/58 网络飞行记录器视觉、响应式和无障碍状态
- `performance-core.js`：可在浏览器和 Node 中运行的纯数据核心
- `app.js`：PageSpeed 请求、超时取消、视图渲染、示例报告和本地历史
- `tests/performance-core.test.js`：Node 内置测试套件
