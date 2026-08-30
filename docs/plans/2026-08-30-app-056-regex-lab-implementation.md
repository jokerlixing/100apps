# App 056 · Pattern Lab 实施计划

## Step 1：可测试的正则核心

- 输出：`regex-core.js` 与 `regex-core.test.js`。
- 内容：标志规范化、安全编译、匹配快照、高亮分段、替换预览。
- 验证：`node --test apps/056-regex-tester/regex-core.test.js`。

## Step 2：语义结构与视觉系统

- 输出：`index.html` 和 `styles.css`。
- 内容：表达式工具条、预设库、镜像高亮编辑区、匹配检验带、替换预览与响应式布局。
- 验证：关键控件均有 label，键盘焦点可见，移动端不溢出。

## Step 3：UI 状态和交互

- 输出：`app.js`。
- 内容：实时计算、滚动同步、预设载入、匹配选中、替换复制、清空/样例恢复和本地持久化。
- 验证：`node --check apps/056-regex-tester/app.js`，再以浏览器覆盖正常、空、错误和超限状态。

## Step 4：项目交付

- 输出：应用 `README.md`，根追踪器中 #056 的文案、链接与完成态。
- 验证：运行全部 App 056 测试和语法检查，在本地静态服务器中检查桌面与移动截图，确认 Git 差异只包含本项目。
