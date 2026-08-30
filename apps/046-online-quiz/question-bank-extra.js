(function (root, factory) {
  const questions = factory();
  if (typeof module === "object" && module.exports) module.exports = questions;
  root.QuizBankExtra = questions;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const optionIds = ["a", "b", "c", "d"];
  const options = labels => labels.map((label, index) => ({ id: optionIds[index], label }));
  const single = (id, category, difficulty, prompt, labels, answerIndex, explanation) => ({
    id, category, difficulty, type: "single", prompt,
    options: options(labels), answerIds: [optionIds[answerIndex]], explanation
  });
  const multiple = (id, category, difficulty, prompt, labels, answerIndexes, explanation) => ({
    id, category, difficulty, type: "multiple", prompt,
    options: options(labels), answerIds: answerIndexes.map(index => optionIds[index]), explanation
  });
  const boolean = (id, category, difficulty, prompt, answer, explanation) => ({
    id, category, difficulty, type: "boolean", prompt,
    options: [{ id: "true", label: "正确" }, { id: "false", label: "错误" }],
    answerIds: [answer ? "true" : "false"], explanation
  });

  const web = [
    single("web-x01", "Web", "basic", "需要一个可由键盘直接激活的普通操作控件时，应优先使用哪个元素？", ["<div>", "<span>", "<button>", "<p>"], 2, "button 原生支持焦点、键盘激活和按钮语义。"),
    multiple("web-x02", "Web", "advanced", "哪些做法能改善网页的无障碍体验？", ["为输入框关联 label", "为信息图片提供 alt", "移除所有焦点样式", "保持合理的标题层级"], [0, 1, 3], "标签、替代文字和清晰的标题结构有助于辅助技术理解页面；焦点不应被完全移除。"),
    boolean("web-x03", "Web", "basic", "同一 HTML 文档中的 id 属性值应保持唯一。", true, "重复 id 会造成标签关联、脚本选择和页面导航歧义。"),
    single("web-x04", "Web", "advanced", "在没有 !important 的情况下，哪个 CSS 选择器通常具有最高优先级？", ["p", ".note", "#notice", "article p"], 2, "ID 选择器的特异性高于类选择器和元素选择器。"),
    multiple("web-x05", "Web", "basic", "Flexbox 中哪些属性常用于控制项目排列？", ["justify-content", "align-items", "flex-wrap", "font-variant"], [0, 1, 2], "前三项分别控制主轴、交叉轴和换行；font-variant 属于字体排版。"),
    boolean("web-x06", "Web", "advanced", "多个带 defer 的经典脚本会在文档解析后按文档顺序执行。", true, "defer 脚本不会阻塞 HTML 解析，并在解析完成后保持相对顺序执行。"),
    single("web-x07", "Web", "basic", "JavaScript 中用于严格相等比较的运算符是？", ["=", "===", "!=", "=>"], 1, "=== 比较值和类型，不进行隐式类型转换。"),
    multiple("web-x08", "Web", "advanced", "哪些措施有助于降低跨站脚本（XSS）风险？", ["对输出做上下文编码", "配置内容安全策略 CSP", "信任所有 URL 参数", "避免把不可信文本直接写入 innerHTML"], [0, 1, 3], "输出编码、CSP 和安全的 DOM 写入方式都能降低脚本注入风险。"),
    boolean("web-x09", "Web", "basic", "大多数 DOM 事件默认会从目标元素向祖先元素冒泡。", true, "点击等常见事件会经过冒泡阶段，可用于事件委托。"),
    single("web-x10", "Web", "advanced", "Promise.all 中任意一个输入 Promise 被拒绝时，返回的 Promise 通常会怎样？", ["永远等待", "忽略错误", "以该原因拒绝", "自动重试"], 2, "Promise.all 会快速失败，并以首先观察到的拒绝原因进入 rejected 状态。"),
    multiple("web-x11", "Web", "basic", "哪些 HTTP 状态码属于成功响应？", ["200", "201", "204", "404"], [0, 1, 2], "2xx 表示成功；404 表示资源未找到。"),
    boolean("web-x12", "Web", "advanced", "标准 JSON 文本允许使用 // 单行注释。", false, "JSON 标准不支持注释；带注释格式需要专门解析器。"),
    single("web-x13", "Web", "basic", "Flexbox 中用于沿主轴分配空间的属性是？", ["justify-content", "align-items", "z-index", "overflow"], 0, "justify-content 控制 flex 项目在主轴上的对齐与空间分配。"),
    multiple("web-x14", "Web", "advanced", "哪些是有效的 Cache-Control 指令？", ["no-store", "max-age", "private", "run-now"], [0, 1, 2], "no-store、max-age 和 private 都是标准缓存指令；run-now 不是。"),
    boolean("web-x15", "Web", "basic", "设置 display:none 后，元素通常不再占据布局空间。", true, "display:none 会让元素退出渲染布局；visibility:hidden 则仍保留空间。"),
    single("web-x16", "Web", "advanced", "HTTPS 的默认端口通常是？", ["21", "53", "80", "443"], 3, "HTTPS 默认使用 TCP 443 端口。"),
    multiple("web-x17", "Web", "basic", "哪些技术常用于响应式网页设计？", ["viewport 元信息", "媒体查询", "流式宽度", "固定 1600px 页面"], [0, 1, 2], "视口设置、媒体查询和弹性尺寸可以适配不同屏幕。"),
    boolean("web-x18", "Web", "advanced", "JavaScript 的 async 函数总会返回一个 Promise。", true, "即使返回普通值，async 函数也会把它包装为已解决的 Promise。"),
    single("web-x19", "Web", "basic", "哪种网页图像格式以矢量路径为核心，并适合图标？", ["JPEG", "BMP", "SVG", "TIFF"], 2, "SVG 是可缩放矢量图形，适合图标、图表等清晰线条内容。"),
    multiple("web-x20", "Web", "advanced", "DNS 的典型职责包括哪些？", ["把域名解析为地址", "提供邮件服务器记录", "保存别名记录", "渲染网页 CSS"], [0, 1, 2], "DNS 管理地址、MX、CNAME 等记录；页面渲染由浏览器完成。"),
    boolean("web-x21", "Web", "basic", "在用户未主动清除的情况下，localStorage 数据通常可以跨浏览器会话保留。", true, "localStorage 没有会话结束即删除的默认行为，与 sessionStorage 不同。"),
    single("web-x22", "Web", "advanced", "阻止链接或表单执行默认浏览器行为时，通常调用哪个方法？", ["stopTimer()", "preventDefault()", "removeNode()", "cancelBubbleOnly()"], 1, "event.preventDefault() 用于取消可取消事件的默认行为。"),
    multiple("web-x23", "Web", "basic", "哪些做法通常能改善网页加载性能？", ["启用文本压缩", "延迟加载非首屏图片", "利用合理缓存", "为所有元素添加巨大阴影"], [0, 1, 2], "压缩、延迟加载和缓存能减少传输与关键路径开销。"),
    boolean("web-x24", "Web", "advanced", "合理设置 Cookie 的 SameSite 属性有助于降低部分 CSRF 风险。", true, "SameSite 可限制跨站请求携带 Cookie，是 CSRF 防护的一层措施。"),
    single("web-x25", "Web", "basic", "哪种浏览器能力可拦截网络请求并支持离线缓存？", ["Service Worker", "CSS Counter", "HTML Template", "Web Font"], 0, "Service Worker 可在页面之外处理 fetch 事件并实现缓存策略。")
  ];

  const science = [
    single("science-x01", "科学", "basic", "一种元素的原子序数由什么决定？", ["中子数", "质子数", "电子层数", "分子数"], 1, "原子核中的质子数定义了元素的原子序数。"),
    multiple("science-x02", "科学", "advanced", "哪些属于物质的常见状态？", ["固态", "液态", "气态", "亮度"], [0, 1, 2], "固态、液态和气态是常见物态；亮度是视觉/光学属性。"),
    boolean("science-x03", "科学", "basic", "月球本身不发可见光，我们看到的月光主要是反射的太阳光。", true, "月球表面反射太阳光，因此从地球上可见。"),
    single("science-x04", "科学", "advanced", "物体做匀速圆周运动时仍有加速度，原因是？", ["质量改变", "速度方向改变", "时间变慢", "没有受力"], 1, "速度是矢量，方向持续改变意味着存在向心加速度。"),
    multiple("science-x05", "科学", "basic", "哪些气体会产生温室效应？", ["二氧化碳", "甲烷", "水蒸气", "氦气"], [0, 1, 2], "二氧化碳、甲烷和水蒸气都能吸收部分红外辐射。"),
    boolean("science-x06", "科学", "advanced", "在孤立系统中，能量总量遵循守恒规律。", true, "能量可以转化形式，但孤立系统中的总能量保持不变。"),
    single("science-x07", "科学", "basic", "天然物质中常被用作硬度标尺最高等级的是？", ["石英", "金刚石", "石膏", "方解石"], 1, "金刚石在莫氏硬度表中为 10 级。"),
    multiple("science-x08", "科学", "advanced", "血液的主要有形成分包括哪些？", ["红细胞", "白细胞", "血小板", "叶绿体"], [0, 1, 2], "红细胞、白细胞和血小板是血液的主要有形成分。"),
    boolean("science-x09", "科学", "basic", "真菌在现代生物分类中属于植物。", false, "真菌构成独立的生物类群，不属于植物界。"),
    single("science-x10", "科学", "advanced", "25°C 左右的纯水通常接近哪个 pH 值？", ["1", "4", "7", "12"], 2, "常温纯水中氢离子和氢氧根浓度相等，pH 约为 7。"),
    multiple("science-x11", "科学", "basic", "哪些物理量与单位对应正确？", ["力—牛顿", "能量—焦耳", "功率—瓦特", "温度—米"], [0, 1, 2], "牛顿、焦耳和瓦特分别是力、能量和功率单位。"),
    boolean("science-x12", "科学", "advanced", "电子通常带负电荷。", true, "电子带一个单位负电荷，质子带正电荷。"),
    single("science-x13", "科学", "basic", "距离地球最近的恒星是？", ["太阳", "天狼星", "北极星", "织女星"], 0, "太阳就是地球所在行星系统的恒星。"),
    multiple("science-x14", "科学", "advanced", "哪些是太阳系的类地行星？", ["水星", "金星", "地球", "木星"], [0, 1, 2], "水星、金星、地球和火星属于类地行星；木星是气态巨行星。"),
    boolean("science-x15", "科学", "basic", "地球核心的主要成分被认为包括铁和镍。", true, "地震学与地球化学证据表明地核以铁、镍为主。"),
    single("science-x16", "科学", "advanced", "化学元素符号 Na 代表？", ["氮", "钠", "氖", "镍"], 1, "Na 来自钠的拉丁名 natrium。"),
    multiple("science-x17", "科学", "basic", "哪些结构存在于典型真核细胞中？", ["细胞核", "线粒体", "核糖体", "发动机"], [0, 1, 2], "细胞核、线粒体和核糖体都属于典型细胞结构。"),
    boolean("science-x18", "科学", "advanced", "在空气中，光的传播速度远高于声音。", true, "光速约为每秒 30 万千米，空气中声速约为每秒数百米。"),
    single("science-x19", "科学", "basic", "液体沸腾时，其饱和蒸气压与什么相等？", ["外界压强", "零", "液体质量", "容器体积"], 0, "当饱和蒸气压达到外界压强时，液体内部能够形成并长大气泡。"),
    multiple("science-x20", "科学", "advanced", "岩石按成因通常分为哪些大类？", ["岩浆岩", "沉积岩", "变质岩", "塑料岩"], [0, 1, 2], "岩浆岩、沉积岩和变质岩构成常见三大岩石类型。"),
    boolean("science-x21", "科学", "basic", "叶绿素看起来主要呈绿色，是因为它较多反射绿色波段的光。", true, "叶绿素吸收红光和蓝紫光较强，对绿色光反射较多。"),
    single("science-x22", "科学", "advanced", "国际单位制中电流的基本单位是？", ["伏特", "欧姆", "安培", "库仑"], 2, "安培是国际单位制的电流基本单位。"),
    multiple("science-x23", "科学", "basic", "哪些因素通常会加快水的蒸发？", ["升高温度", "加快表面空气流动", "增大表面积", "密封容器"], [0, 1, 2], "更高温度、更快空气流动和更大表面积都能促进蒸发。"),
    boolean("science-x24", "科学", "advanced", "在封闭系统的普通化学反应中，总质量保持守恒。", true, "反应物原子重新组合，但封闭系统内总质量不变。"),
    single("science-x25", "科学", "basic", "地震和火山活动常与什么运动密切相关？", ["板块运动", "云层移动", "昼夜交替", "潮汐表"], 0, "板块边界的碰撞、俯冲和张裂与许多地震、火山活动有关。")
  ];

  const logic = [
    single("logic-x01", "逻辑", "basic", "数列 1、1、2、3、5 的下一项是？", ["6", "7", "8", "10"], 2, "每项等于前两项之和，所以下一项是 3+5=8。"),
    multiple("logic-x02", "逻辑", "advanced", "下列哪些数是偶数？", ["14", "21", "32", "47"], [0, 2], "14 和 32 都能被 2 整除。"),
    boolean("logic-x03", "逻辑", "basic", "仅由“如果 P 则 Q”就能推出“如果 Q 则 P”。", false, "这是把原命题错误地转换成逆命题，逆命题不一定成立。"),
    single("logic-x04", "逻辑", "advanced", "集合 {1,2,3} 与 {2,3,4} 的交集是？", ["{1,4}", "{2,3}", "{1,2,3,4}", "空集"], 1, "交集由同时属于两个集合的元素组成，即 2 和 3。"),
    multiple("logic-x05", "逻辑", "basic", "下列哪些数是质数？", ["2", "3", "4", "5"], [0, 1, 3], "2、3、5 只有 1 和自身两个正因数；4 不是质数。"),
    boolean("logic-x06", "逻辑", "advanced", "抛一枚均匀硬币一次，正面朝上的概率是 1/2。", true, "在正反两种等可能结果下，正面事件概率为 1/2。"),
    single("logic-x07", "逻辑", "basic", "数列 1、4、9、16 的下一项是？", ["20", "24", "25", "32"], 2, "各项依次是 1²、2²、3²、4²，下一项为 5²=25。"),
    multiple("logic-x08", "逻辑", "advanced", "哪些表达式与“如果 P 则 Q”等价？", ["如果非 Q 则非 P", "非 P 或 Q", "如果 Q 则 P", "P 且非 Q"], [0, 1], "原命题等价于逆否命题，也等价于逻辑式 ¬P∨Q。"),
    boolean("logic-x09", "逻辑", "basic", "异或（XOR）在两个输入不同时结果为真。", true, "XOR 表示恰有一个输入为真。"),
    single("logic-x10", "逻辑", "advanced", "三个不同物品排成一列，共有多少种排列？", ["3", "6", "8", "9"], 1, "排列数为 3!=3×2×1=6。"),
    multiple("logic-x11", "逻辑", "basic", "“并非 A 且 B”与哪些说法等价？", ["非 A 或非 B", "A、B 中至少一个不成立", "A 和 B 都不成立", "A 或 B 成立"], [0, 1], "德摩根律给出 ¬(A∧B)=¬A∨¬B，即至少一个不成立。"),
    boolean("logic-x12", "逻辑", "advanced", "任意 13 个人中，至少两个人出生在同一个月份。", true, "一年只有 12 个月，根据抽屉原理，13 人中至少两人落在同一月。"),
    single("logic-x13", "逻辑", "basic", "二进制数 1010 对应十进制多少？", ["8", "9", "10", "12"], 2, "1010₂=1×8+0×4+1×2+0=10。"),
    multiple("logic-x14", "逻辑", "advanced", "哪些分数大于 1/2？", ["3/4", "1/3", "5/8", "2/3"], [0, 2, 3], "3/4、5/8 和 2/3 都大于 1/2。"),
    boolean("logic-x15", "逻辑", "basic", "若所有 A 都是 B，且 x 是 A，则 x 必然是 B。", true, "这是全称包含关系的直接推论。"),
    single("logic-x16", "逻辑", "advanced", "字母序列 A、C、F、J 的下一项是？", ["M", "N", "O", "P"], 2, "位置差依次为 2、3、4，下一次增加 5，从 J 到 O。"),
    multiple("logic-x17", "逻辑", "basic", "一个整数能被 6 整除时，哪些条件必然满足？", ["能被 2 整除", "能被 3 整除", "一定是奇数", "末位一定是 6"], [0, 1], "6=2×3，因此该数必须同时能被 2 和 3 整除。"),
    boolean("logic-x18", "逻辑", "advanced", "“有些学生是运动员”可以推出“有些运动员是学生”。", true, "存在同一个人同时属于两个集合，交换描述顺序仍然成立。"),
    single("logic-x19", "逻辑", "basic", "4、6、8 的算术平均数是？", ["5", "6", "7", "8"], 1, "(4+6+8)÷3=6。"),
    multiple("logic-x20", "逻辑", "advanced", "若 A 是 B 的子集，哪些等式必然成立？", ["A∩B=A", "A∪B=B", "B∩A=B", "A=B"], [0, 1], "A 的元素都在 B 中，因此交集为 A、并集为 B。"),
    boolean("logic-x21", "逻辑", "basic", "标准数独的每一行都需要恰好包含数字 1 到 9 各一次。", true, "这是标准 9×9 数独的基本约束之一。"),
    single("logic-x22", "逻辑", "advanced", "两部分之比为 2:3，总数为 25，较小部分是多少？", ["5", "10", "12", "15"], 1, "总份数为 5，每份 5，较小部分为 2×5=10。"),
    multiple("logic-x23", "逻辑", "basic", "哪些运算结果一定是奇数？", ["奇数+偶数", "奇数×奇数", "偶数+偶数", "奇数+奇数"], [0, 1], "奇加偶和奇乘奇均为奇数；后两项为偶数。"),
    boolean("logic-x24", "逻辑", "advanced", "命题“如果 P 则 Q”与“如果非 Q 则非 P”逻辑等价。", true, "后者是前者的逆否命题，两者真值始终相同。"),
    single("logic-x25", "逻辑", "basic", "数列 2、6、12、20 的下一项是？", ["24", "28", "30", "32"], 2, "各项可写为 n(n+1)：1×2、2×3、3×4、4×5，下一项是 5×6=30。")
  ];

  const life = [
    single("life-x01", "常识", "basic", "收到自称银行的陌生登录链接时，首先应该？", ["直接输入密码", "从官方 App 或电话独立核验", "转发链接", "回复验证码"], 1, "应绕开陌生消息中的入口，从官方渠道独立核验。"),
    multiple("life-x02", "常识", "advanced", "哪些做法有助于保护账号安全？", ["每站使用不同密码", "启用多因素认证", "把验证码告诉他人", "使用密码管理器"], [0, 1, 3], "唯一密码、多因素认证和密码管理器能降低撞库及账号接管风险。"),
    boolean("life-x03", "常识", "basic", "及时安装可信来源的软件更新通常有助于修复安全漏洞。", true, "安全更新常包含已知漏洞修复和稳定性改进。"),
    single("life-x04", "常识", "advanced", "火灾产生浓烟时，撤离过程中更合适的姿势是？", ["贴近地面低姿前进", "乘坐电梯", "返回取物", "站在烟层中等待"], 0, "较低位置通常烟气和热量相对较少，应按疏散路线迅速离开。"),
    multiple("life-x05", "常识", "basic", "家庭应急包通常可以准备哪些物品？", ["饮用水", "手电筒", "基础急救用品", "易燃溶剂"], [0, 1, 2], "水、照明和急救用品是常见应急物资。"),
    boolean("life-x06", "常识", "advanced", "含氯漂白剂不应与酸性清洁剂混合使用。", true, "混合可能释放有毒气体，应按标签单独使用并保持通风。"),
    single("life-x07", "常识", "basic", "发现手机电池明显鼓包时，更安全的做法是？", ["继续充电", "刺破电池", "停止使用并交由专业渠道处理", "放入火中"], 2, "鼓包电池存在安全风险，应停止使用，避免挤压、穿刺或继续充电。"),
    multiple("life-x08", "常识", "advanced", "核验网络消息时哪些做法更可靠？", ["查找原始出处", "核对发布日期和上下文", "只看点赞数", "与多个可信来源交叉验证"], [0, 1, 3], "出处、时间语境和独立来源交叉核对比热度更能支持真实性判断。"),
    boolean("life-x09", "常识", "basic", "使用公共电脑后应退出账号，并避免让浏览器保存密码。", true, "退出登录并不保留凭据可降低后续使用者访问账号的风险。"),
    single("life-x10", "常识", "advanced", "扫描来源不明的二维码前，更稳妥的做法是？", ["直接授权全部权限", "确认来源并查看目标域名", "关闭安全提示", "输入所有个人信息"], 1, "二维码可能隐藏目标地址，应先核验来源和域名。"),
    multiple("life-x11", "常识", "basic", "哪些属于隐私保护中的最小化原则？", ["只收集必要数据", "只授予必要权限", "定期复查授权", "永久公开所有记录"], [0, 1, 2], "减少收集、限制权限并复查授权可以缩小数据暴露面。"),
    boolean("life-x12", "常识", "advanced", "公共 Wi-Fi 通常比受控的私人网络更需要警惕钓鱼和窃听风险。", true, "公共网络环境更难验证，应确认 HTTPS、域名并避免敏感操作。"),
    single("life-x13", "常识", "basic", "废旧电子设备更合适的处理方式是？", ["随意丢入河流", "交给合规回收渠道", "露天焚烧", "拆开后散落垃圾桶"], 1, "合规回收能更安全地处理电池、金属和其他电子材料。"),
    multiple("life-x14", "常识", "advanced", "哪些是常见钓鱼消息特征？", ["制造异常紧迫感", "域名拼写可疑", "诱导打开未知附件", "通过已核验官方渠道正常通知"], [0, 1, 2], "紧迫催促、仿冒域名和未知附件都是常见风险信号。"),
    boolean("life-x15", "常识", "basic", "备份只有在能够成功恢复时才真正有用，因此应定期做恢复检查。", true, "恢复演练可以及早发现损坏、遗漏或流程问题。"),
    single("life-x16", "常识", "advanced", "多个大功率电器同时接入同一插线板可能造成什么风险？", ["过载和发热", "自动提高电压", "永久省电", "增强信号"], 0, "超过额定负载可能引起导线过热、跳闸甚至火灾。"),
    multiple("life-x17", "常识", "basic", "哪些做法有助于日常食品安全？", ["生熟分开", "易腐食品及时冷藏", "处理食物前洗手", "仅靠品尝判断是否变质"], [0, 1, 2], "分开处理、适当冷藏和手卫生都能降低污染风险。"),
    boolean("life-x18", "常识", "advanced", "宣称“零风险、保证高收益”的投资邀约通常是需要警惕的风险信号。", true, "收益与风险通常相关，绝对保证常被用于误导或诈骗。"),
    single("life-x19", "常识", "basic", "在文章中使用他人观点或短句时，更规范的做法是？", ["隐去来源", "注明引用和出处", "改几个字冒充原创", "删除作者名"], 1, "清晰标注引用和来源有助于尊重作者并让读者核验。"),
    multiple("life-x20", "常识", "advanced", "分享云端文件时哪些做法更安全？", ["只授予必要权限", "设置有效期", "定期检查共享成员", "始终设为任何人可编辑"], [0, 1, 2], "限制权限、控制时效和复查成员可减少意外泄露或篡改。"),
    boolean("life-x21", "常识", "basic", "为手机设置自动锁屏和可靠解锁方式有助于降低丢失后的未授权访问。", true, "设备锁是保护本地数据的基础措施。"),
    single("life-x22", "常识", "advanced", "拨打紧急求助电话时，最应优先清楚说明什么？", ["所在位置和现场情况", "社交账号", "购物清单", "手机型号"], 0, "准确位置、事件性质和人员状况有助于救援资源快速到达。"),
    multiple("life-x23", "常识", "basic", "长时间使用电脑时哪些习惯更合理？", ["定时起身活动", "让屏幕高度较舒适", "保持自然坐姿", "连续数小时不休息"], [0, 1, 2], "适当休息、合理屏幕位置和自然姿势有助于减少疲劳。"),
    boolean("life-x24", "常识", "advanced", "短信验证码通常不应提供给任何主动索要它的陌生人。", true, "验证码常是登录或交易凭证，正规人员通常不会向用户索要。"),
    single("life-x25", "常识", "basic", "下载手机应用时，更可靠的来源通常是？", ["来历不明的网盘包", "随机弹窗", "官方应用商店或开发者官网", "陌生群文件"], 2, "可信官方渠道更便于核验发布者、版本和安全检查。")
  ];

  return [...web, ...science, ...logic, ...life];
});
