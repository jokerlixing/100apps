(function (root, factory) {
  const bank = factory();
  if (typeof module === "object" && module.exports) module.exports = bank;
  root.QuizBank = bank;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const questions = [
    {
      id: "web-01", category: "Web", difficulty: "basic", type: "single",
      prompt: "HTML 中，哪个元素用于表示页面的主要导航链接？",
      options: [{ id: "a", label: "<nav>" }, { id: "b", label: "<main>" }, { id: "c", label: "<aside>" }, { id: "d", label: "<footer>" }],
      answerIds: ["a"], explanation: "<nav> 专门表示页面内的重要导航链接区域。"
    },
    {
      id: "web-02", category: "Web", difficulty: "basic", type: "multiple",
      prompt: "下面哪些做法有助于网页的键盘可访问性？",
      options: [{ id: "a", label: "使用原生 button 元素" }, { id: "b", label: "提供清晰的焦点样式" }, { id: "c", label: "把所有文字做成图片" }, { id: "d", label: "为表单控件关联 label" }],
      answerIds: ["a", "b", "d"], explanation: "原生控件、可见焦点和正确标签都能帮助键盘及辅助技术用户；图片文字会降低可访问性。"
    },
    {
      id: "web-03", category: "Web", difficulty: "basic", type: "boolean",
      prompt: "CSS 的 margin 会计入元素默认的 content-box 宽度之内。",
      options: [{ id: "true", label: "正确" }, { id: "false", label: "错误" }],
      answerIds: ["false"], explanation: "margin 位于盒模型外侧，不计入 content-box 的内容宽度。"
    },
    {
      id: "web-04", category: "Web", difficulty: "advanced", type: "single",
      prompt: "JavaScript 事件循环中，当前同步代码结束后通常优先处理哪一类任务？",
      options: [{ id: "a", label: "微任务队列" }, { id: "b", label: "定时器队列" }, { id: "c", label: "渲染后的随机任务" }, { id: "d", label: "所有任务同时执行" }],
      answerIds: ["a"], explanation: "一个任务结束后，事件循环会先清空微任务队列，再进入下一任务及可能的渲染。"
    },
    {
      id: "web-05", category: "Web", difficulty: "advanced", type: "multiple",
      prompt: "哪些 HTTP 方法通常被定义为幂等？",
      options: [{ id: "a", label: "GET" }, { id: "b", label: "PUT" }, { id: "c", label: "DELETE" }, { id: "d", label: "POST" }],
      answerIds: ["a", "b", "c"], explanation: "按 HTTP 语义，GET、PUT、DELETE 是幂等的；重复相同请求的预期效果与执行一次相同。"
    },
    {
      id: "web-06", category: "Web", difficulty: "advanced", type: "boolean",
      prompt: "localStorage 中存储的值会自动保持原始 JavaScript 对象类型。",
      options: [{ id: "true", label: "正确" }, { id: "false", label: "错误" }],
      answerIds: ["false"], explanation: "localStorage 只保存字符串，对象需要显式 JSON 序列化和解析。"
    },
    {
      id: "science-01", category: "科学", difficulty: "basic", type: "single",
      prompt: "标准大气压下，纯水的冰点是多少摄氏度？",
      options: [{ id: "a", label: "0°C" }, { id: "b", label: "10°C" }, { id: "c", label: "32°C" }, { id: "d", label: "100°C" }],
      answerIds: ["a"], explanation: "在标准大气压下，纯水在 0°C 附近发生固液相变。"
    },
    {
      id: "science-02", category: "科学", difficulty: "basic", type: "multiple",
      prompt: "下列哪些属于可再生能源？",
      options: [{ id: "a", label: "太阳能" }, { id: "b", label: "风能" }, { id: "c", label: "煤炭" }, { id: "d", label: "潮汐能" }],
      answerIds: ["a", "b", "d"], explanation: "太阳、风和潮汐能可在自然循环中补充；煤炭属于有限的化石能源。"
    },
    {
      id: "science-03", category: "科学", difficulty: "basic", type: "boolean",
      prompt: "声音可以在真空中传播。",
      options: [{ id: "true", label: "正确" }, { id: "false", label: "错误" }],
      answerIds: ["false"], explanation: "声音是机械波，需要介质传递振动，不能在真空中传播。"
    },
    {
      id: "science-04", category: "科学", difficulty: "advanced", type: "single",
      prompt: "一颗卫星在圆形轨道上匀速运行时，它的速度为何仍在变化？",
      options: [{ id: "a", label: "方向持续改变" }, { id: "b", label: "质量持续改变" }, { id: "c", label: "时间停止流动" }, { id: "d", label: "没有受到力" }],
      answerIds: ["a"], explanation: "速度是矢量；即使速率不变，方向改变也代表速度发生变化，并产生向心加速度。"
    },
    {
      id: "science-05", category: "科学", difficulty: "advanced", type: "multiple",
      prompt: "DNA 分子中通常包含哪些含氮碱基？",
      options: [{ id: "a", label: "腺嘌呤 A" }, { id: "b", label: "胸腺嘧啶 T" }, { id: "c", label: "尿嘧啶 U" }, { id: "d", label: "鸟嘌呤 G" }],
      answerIds: ["a", "b", "d"], explanation: "DNA 通常含 A、T、C、G；尿嘧啶 U 主要出现在 RNA 中。"
    },
    {
      id: "science-06", category: "科学", difficulty: "advanced", type: "boolean",
      prompt: "在封闭系统中，熵永远只能保持不变。",
      options: [{ id: "true", label: "正确" }, { id: "false", label: "错误" }],
      answerIds: ["false"], explanation: "热力学第二定律指出孤立系统的熵不会减少；可保持不变，也可以增加。"
    },
    {
      id: "logic-01", category: "逻辑", difficulty: "basic", type: "single",
      prompt: "数列 2、4、8、16 的下一项是？",
      options: [{ id: "a", label: "18" }, { id: "b", label: "24" }, { id: "c", label: "32" }, { id: "d", label: "64" }],
      answerIds: ["c"], explanation: "每一项都是前一项乘以 2，因此下一项是 32。"
    },
    {
      id: "logic-02", category: "逻辑", difficulty: "basic", type: "multiple",
      prompt: "若所有蓝盒都是方盒，哪些陈述必然成立？",
      options: [{ id: "a", label: "某个蓝盒是方盒" }, { id: "b", label: "不存在非方形的蓝盒" }, { id: "c", label: "所有方盒都是蓝盒" }, { id: "d", label: "蓝盒集合是方盒集合的子集" }],
      answerIds: ["b", "d"], explanation: "“所有蓝盒都是方盒”说明蓝盒集合包含于方盒集合，但不能保证蓝盒一定存在，也不能反推所有方盒都是蓝盒。"
    },
    {
      id: "logic-03", category: "逻辑", difficulty: "basic", type: "boolean",
      prompt: "如果命题 P 为真、命题 Q 为假，那么“P 且 Q”为真。",
      options: [{ id: "true", label: "正确" }, { id: "false", label: "错误" }],
      answerIds: ["false"], explanation: "合取命题只有两个分命题都为真时才为真。"
    },
    {
      id: "logic-04", category: "逻辑", difficulty: "advanced", type: "single",
      prompt: "三扇门中只有一扇通向出口。已知甲说真话、乙说假话；甲说“出口不在 1 号门”，乙说“出口在 2 号门”。出口在哪？",
      options: [{ id: "a", label: "1 号门" }, { id: "b", label: "2 号门" }, { id: "c", label: "3 号门" }, { id: "d", label: "无法确定" }],
      answerIds: ["c"], explanation: "甲为真排除 1 号；乙为假排除 2 号，所以出口只能在 3 号门。"
    },
    {
      id: "logic-05", category: "逻辑", difficulty: "advanced", type: "multiple",
      prompt: "哪些命题与“并非所有测试都通过”逻辑等价？",
      options: [{ id: "a", label: "至少有一个测试未通过" }, { id: "b", label: "所有测试都未通过" }, { id: "c", label: "存在未通过的测试" }, { id: "d", label: "没有测试通过" }],
      answerIds: ["a", "c"], explanation: "对全称命题取否定，等价于存在至少一个反例，并不代表全部失败。"
    },
    {
      id: "logic-06", category: "逻辑", difficulty: "advanced", type: "boolean",
      prompt: "从“如果下雨，地面会湿”和“地面湿了”可以必然推出“下雨了”。",
      options: [{ id: "true", label: "正确" }, { id: "false", label: "错误" }],
      answerIds: ["false"], explanation: "这是肯定后件的错误；洒水等其他原因也可能让地面湿。"
    },
    {
      id: "life-01", category: "常识", difficulty: "basic", type: "single",
      prompt: "处理电器起火时，首先更合适的做法是？",
      options: [{ id: "a", label: "在安全前提下切断电源" }, { id: "b", label: "直接泼水" }, { id: "c", label: "用手搬走设备" }, { id: "d", label: "打开设备外壳" }],
      answerIds: ["a"], explanation: "应先在安全前提下切断电源并使用适用的灭火器材；带电设备不应直接泼水。"
    },
    {
      id: "life-02", category: "常识", difficulty: "basic", type: "multiple",
      prompt: "创建强密码时，哪些策略更合理？",
      options: [{ id: "a", label: "使用足够长的随机组合" }, { id: "b", label: "不同网站使用不同密码" }, { id: "c", label: "把生日重复三遍" }, { id: "d", label: "使用密码管理器" }],
      answerIds: ["a", "b", "d"], explanation: "长度、随机性、唯一性和密码管理器都能降低撞库与猜测风险；生日属于易猜信息。"
    },
    {
      id: "life-03", category: "常识", difficulty: "basic", type: "boolean",
      prompt: "在公共 Wi-Fi 上，只要网页能打开，就可以忽略网址和加密状态。",
      options: [{ id: "true", label: "正确" }, { id: "false", label: "错误" }],
      answerIds: ["false"], explanation: "公共网络风险更高，应确认域名和 HTTPS，并避免在不可信网络提交敏感信息。"
    },
    {
      id: "life-04", category: "常识", difficulty: "advanced", type: "single",
      prompt: "看到“研究发现 A 与 B 同时出现”时，最稳妥的理解是？",
      options: [{ id: "a", label: "A 一定导致 B" }, { id: "b", label: "B 一定导致 A" }, { id: "c", label: "二者相关，但因果仍需更多证据" }, { id: "d", label: "研究必然错误" }],
      answerIds: ["c"], explanation: "相关性本身不能确定因果方向，也可能受到第三变量影响。"
    },
    {
      id: "life-05", category: "常识", difficulty: "advanced", type: "multiple",
      prompt: "核验一条网络消息时，哪些做法更可靠？",
      options: [{ id: "a", label: "找到原始出处" }, { id: "b", label: "检查发布时间和上下文" }, { id: "c", label: "只看转发数量" }, { id: "d", label: "与多个独立可信来源交叉核对" }],
      answerIds: ["a", "b", "d"], explanation: "原始出处、时间上下文和独立来源交叉验证能提高判断质量；热度不等于真实性。"
    },
    {
      id: "life-06", category: "常识", difficulty: "advanced", type: "boolean",
      prompt: "备份策略中的“3-2-1”通常意味着保留 3 份数据、使用 2 种介质、其中 1 份异地保存。",
      options: [{ id: "true", label: "正确" }, { id: "false", label: "错误" }],
      answerIds: ["true"], explanation: "3-2-1 是常见备份原则，用介质和位置冗余降低单点故障风险。"
    }
  ];

  return { version: "2026.08.30-1", questions };
});
