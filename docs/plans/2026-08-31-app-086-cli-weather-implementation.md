# App 086 · CLI 天气工具实现计划

## Step 1：建立 CLI 骨架

- 输出：`apps/086-cli-weather` 的包元数据、可执行入口和参数解析模块。
- 验证：帮助、版本、必填位置与所有参数边界都有确定输出和退出码。

## Step 2：实现天气数据层

- 输出：Open-Meteo 城市解析、预报请求、超时与错误归一化。
- 验证：使用注入的 mock fetch 检查 URL、响应映射、空结果和异常响应。

## Step 3：实现终端体验

- 输出：WMO 天气码映射、ASCII 图、当前天气卡片、未来预报、双语和 JSON。
- 验证：固定输入快照不含意外 ANSI 字符，单位、风向和未知天气码均有降级。

## Step 4：补齐使用文档与测试

- 输出：README、package lock、单元及 CLI 集成测试。
- 验证：`npm test`、`npm run check` 与 `npm pack --dry-run` 全部通过。

## Step 5：实况与追踪器收尾

- 输出：真实城市查询成功；根追踪器含 086 最终名称、说明、GitHub 目录链接与完成状态。
- 验证：根追踪器测试断言编号、链接、状态及陈旧 localStorage 迁移。

## Step 6：GitHub 同步

- 输出：应用、设计、测试与追踪器提交到主分支并仅推送 `origin`。
- 验证：本地 HEAD、`origin/main` 与远端提交一致，官方链接可访问。
