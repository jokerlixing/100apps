# FITROOM/92 · 简历投递助手

FITROOM/92 是 100 Apps Challenge 的第 92 个项目。它让求职者只维护一份母版资料，再根据不同职位描述生成、比较和管理多个可追溯的简历快照。

公开版本：

`https://jokerlixing.github.io/100apps/apps/092-resume-application-assistant/`

## 本地运行

在仓库根目录启动任意静态服务器：

```powershell
python -m http.server 4192
```

然后访问：

`http://127.0.0.1:4192/apps/092-resume-application-assistant/`

应用没有构建步骤或第三方运行时依赖。建议通过 HTTP 访问，以获得与 GitHub Pages 一致的本地存储、下载和打印行为。

## 功能

- 在一份母版中维护联系信息、简介、技能、工作经历、项目与教育经历。
- 粘贴职位描述后，本地提取明确的工具、方法和能力关键词。
- 生成包含母版快照的岗位定制版本，并把命中内容排到更靠前的位置。
- 用“岗位合身尺”查看文本关键词覆盖和缺口；分数变化可追溯。
- 给版本重命名并标记草稿、可投递、已投递、面试中、已录用或已结束。
- 母版更新后由用户主动“重新裁版”，历史快照不会被悄悄改写。
- 复制纯文本简历，或通过浏览器打印对话框保存 PDF。
- 导出和导入完整 JSON 备份；导入时只接受已知字段。

## 数据与匹配边界

- 母版和版本都保存在当前浏览器的 `localStorage`，页面不发起网络请求，也不会上传个人信息。
- 示例资料用于演示，首次使用应替换成自己的真实信息。
- 生成器只会规范化、重排和强调母版中已有的文字，不会补写不存在的经历或业绩。
- “岗位合身尺”是确定性的文本覆盖率，不是招聘平台 ATS 分数、录用概率或职业建议。
- 浏览器数据可能被清理；重要内容应定期导出备份。

## 键盘与打印

- `Tab` 可以遍历全部字段、版本和操作按钮，焦点环始终可见。
- 表单错误通过页面内 `role="alert"` 提示，保存、复制和导入结果通过 `aria-live` 播报。
- 主要触控目标不小于 44px；390px 窄屏不产生横向溢出。
- `prefers-reduced-motion` 下关闭过渡动画。
- 打印样式只输出当前简历成品，不包含编辑器和岗位合身尺。

## 验证

```powershell
node --test apps/092-resume-application-assistant/resume-core.test.js
node --check apps/092-resume-application-assistant/resume-core.js
node --check apps/092-resume-application-assistant/app.js
node apps/092-resume-application-assistant/qa/browser-smoke.mjs
node --test qa/tracker.test.js
```

浏览器冒烟测试会使用临时 Chrome/Edge 用户目录和独立存储键，真实覆盖生成、重裁、版本改名、投递状态、复制、备份、刷新持久化、错误提示、桌面/移动布局、焦点可见性和运行时错误，并把验收截图写入 `assets/`。
