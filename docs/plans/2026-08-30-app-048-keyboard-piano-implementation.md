# App 048 · TAPE/48 实现计划

## Step 1：建立可测试的音乐核心

- Output：`piano-core.js`，提供两组八度音符表、键位映射、频率、录音事件规范化、时长、时间轴布局和存档校验。
- Test：Node 测试覆盖正常路径、边界输入、悬空音符和损坏存档。

## Step 2：实现 Web Audio 合成器

- Output：`app.js` 中的音频引擎，支持钢琴、电钢琴、风琴三种合成音色、主音量、延音和安全释放全部 voice。
- Test：首次交互恢复 AudioContext；重复 keydown 不叠音；keyup、失焦和换音色都会正确释放声音。

## Step 3：完成多输入演奏台

- Output：`index.html` 与 `styles.css`，提供两组八度琴键、电脑键位提示、鼠标/触摸按钮语义、状态与参数控制。
- Test：键盘、点击与触屏路径汇入相同 note 生命周期；桌面和移动端焦点、滚动和布局正确。

## Step 4：完成磁带录制与回放

- Output：录制、停止、播放、暂停、清空、本地恢复及可视化磁带时间轴。
- Test：音符起止时间准确；停止时补齐仍按住音符；空录音不覆盖；回放结束恢复待机状态。

## Step 5：文档、追踪器与发布

- Output：项目 `README.md`、根追踪器的 48/100 完成状态与 GitHub Pages 链接。
- Test：单元测试、语法检查、资源检查、桌面/移动端浏览器验证和 `git diff --check` 全部通过；提交后只推送 GitHub `origin`。
