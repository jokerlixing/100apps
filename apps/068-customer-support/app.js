(function startRelay() {
  'use strict';

  const Core = window.SupportCore;
  if (!Core) throw new Error('SupportCore failed to load.');

  const STORAGE_KEY = 'relay68.state.v1';
  const offlineMode = new URLSearchParams(window.location.search).get('offline') === '1';
  const DEFAULT_FAQS = [
    {
      id: 'order-status', intent: 'order', question: '在哪里查看订单状态？',
      answer: '进入“我的订单”并打开对应订单，即可查看待付款、待发货、运输中或已完成状态。RELAY 不连接真实订单系统，具体状态请以订单详情为准。',
      keywords: ['订单状态', '我的订单', '订单详情'], aliases: ['订单到哪一步了', '找不到订单'],
      suggestedReplies: ['可以取消订单吗？', '发货后怎么查物流？'], enabled: true,
    },
    {
      id: 'order-address', intent: 'order', question: '下单后可以修改收货地址吗？',
      answer: '订单尚未进入配货时，可在订单详情尝试修改地址；若按钮不可用，说明仓库可能已经处理，请尽快转人工确认。不要重复下单。',
      keywords: ['修改地址', '收货地址', '改地址'], aliases: ['地址填错了', '换一个收货地址'],
      suggestedReplies: ['如何联系人工客服？', '可以取消订单吗？'], enabled: true,
    },
    {
      id: 'order-cancel', intent: 'order', question: '订单可以取消吗？',
      answer: '未付款订单可直接取消；已付款但尚未配货的订单通常可在订单详情申请取消。已发货订单需签收后按退货流程处理。',
      keywords: ['取消订单', '不要了', '撤销订单'], aliases: ['不想买了', '怎么取消购买'],
      suggestedReplies: ['退货需要什么条件？', '退款多久能到账？'], enabled: true,
    },
    {
      id: 'shipping-progress', intent: 'shipping', question: '发货后怎么查询物流？',
      answer: '打开订单详情即可查看承运商、运单号和最新轨迹。轨迹通常在承运商揽收后更新，刚发货时可能暂时只有运单号。',
      keywords: ['物流', '快递', '发货', '运单', '轨迹'], aliases: ['快递到哪里了', '什么时候送到', '查包裹'],
      suggestedReplies: ['物流一直没更新怎么办？', '下单后可以改地址吗？'], enabled: true,
    },
    {
      id: 'shipping-delay', intent: 'shipping', question: '物流长时间没有更新怎么办？',
      answer: '先核对订单详情中的预计送达时间。超过 48 小时没有新轨迹或已经超出预计时间时，请带上订单号转人工，由客服向承运商核查。',
      keywords: ['物流不更新', '快递停了', '延迟', '超时'], aliases: ['包裹卡住了', '两天没有物流'],
      suggestedReplies: ['如何联系人工客服？', '发货后怎么查物流？'], enabled: true,
    },
    {
      id: 'return-policy', intent: 'return', question: '退货需要满足什么条件？',
      answer: '商品符合页面标注的退货政策、保持完好且配件齐全时，可在订单详情发起申请。定制、易耗或影响二次销售的商品可能不支持无理由退货，请以商品页说明为准。',
      keywords: ['退货', '七天无理由', '退回', '不想要'], aliases: ['收到后不要了', '能不能退'],
      suggestedReplies: ['退货运费由谁承担？', '退款多久能到账？'], enabled: true,
    },
    {
      id: 'return-exchange', intent: 'return', question: '商品尺码不合适可以换货吗？',
      answer: '支持换货的商品可在订单详情选择“退换售后”。请保持吊牌、包装与附件完整；目标尺码是否可换取决于当前库存。',
      keywords: ['换货', '尺码不合', '换尺寸', '换颜色'], aliases: ['买大了', '买小了'],
      suggestedReplies: ['退货需要什么条件？', '怎么查看尺码库存？'], enabled: true,
    },
    {
      id: 'return-freight', intent: 'return', question: '退货运费由谁承担？',
      answer: '因质量问题或发错商品产生的合理退货运费通常由商家承担；个人原因退货的运费按商品页与售后政策执行。请先提交售后申请再寄回。',
      keywords: ['退货运费', '邮费', '寄回费用'], aliases: ['退货谁出快递费'],
      suggestedReplies: ['如何提交退货？', '商品有质量问题怎么办？'], enabled: true,
    },
    {
      id: 'refund-arrival', intent: 'refund', question: '退款审核通过后多久能到账？',
      answer: '退款审核通过后会原路退回。平台处理通常需要 1–3 个工作日，银行卡或支付渠道的实际入账时间可能更长，请以渠道账单为准。',
      keywords: ['退款', '到账', '原路退回', '审核通过'], aliases: ['钱怎么还没退', '退款什么时候回来'],
      suggestedReplies: ['在哪里看退款进度？', '如何联系人工客服？'], enabled: true,
    },
    {
      id: 'refund-progress', intent: 'refund', question: '在哪里查看退款进度？',
      answer: '进入订单详情的售后记录，可查看申请、审核、退货验收和退款处理节点。RELAY 无法读取你的实时退款状态。',
      keywords: ['退款进度', '售后记录', '退款状态'], aliases: ['退款到哪一步了'],
      suggestedReplies: ['退款多久能到账？', '退货需要什么条件？'], enabled: true,
    },
    {
      id: 'payment-failed', intent: 'payment', question: '订单支付失败怎么办？',
      answer: '请先确认网络、账户余额和支付限额，再回到订单页重新支付。不要连续快速重复付款；若已经扣款但订单仍未支付，请保存账单记录并转人工核对。',
      keywords: ['支付失败', '付款失败', '无法支付'], aliases: ['付不了钱', '支付报错'],
      suggestedReplies: ['重复扣款怎么办？', '如何联系人工客服？'], enabled: true,
    },
    {
      id: 'payment-duplicate', intent: 'payment', question: '支付时出现重复扣款怎么办？',
      answer: '先在支付渠道账单中确认是否存在两笔已完成交易。若确有重复扣款，请不要再次支付，保留交易时间与金额并转人工核查。',
      keywords: ['重复扣款', '扣了两次', '多扣款'], aliases: ['付了两遍', '重复支付'],
      suggestedReplies: ['如何联系人工客服？', '退款多久能到账？'], enabled: true,
    },
    {
      id: 'invoice-company', intent: 'invoice', question: '怎样申请企业发票？',
      answer: '在订单的发票入口选择企业类型，准确填写企业名称、统一社会信用代码和接收方式。已开票信息如需修改，请按订单页提示申请重开。',
      keywords: ['企业发票', '抬头', '税号', '开票'], aliases: ['公司发票怎么开', '增值税发票'],
      suggestedReplies: ['个人发票怎么开？', '发票信息填错了怎么办？'], enabled: true,
    },
    {
      id: 'account-password', intent: 'account', question: '忘记登录密码怎么办？',
      answer: '在登录页选择“忘记密码”，通过已绑定手机号或邮箱完成验证后重设。验证码、密码和支付口令都不要提供给客服。',
      keywords: ['忘记密码', '重置密码', '登录不了'], aliases: ['密码不记得了', '无法登录'],
      suggestedReplies: ['收不到验证码怎么办？', '如何联系人工客服？'], enabled: true,
    },
    {
      id: 'account-code', intent: 'account', question: '一直收不到验证码怎么办？',
      answer: '请核对手机号、短信拦截和网络状态，并等待 60 秒后重试。多次失败时先暂停操作，避免触发安全限制，再通过人工渠道核验账户。',
      keywords: ['验证码', '收不到短信', '安全验证'], aliases: ['验证码没来'],
      suggestedReplies: ['忘记密码怎么办？', '如何联系人工客服？'], enabled: true,
    },
    {
      id: 'product-stock', intent: 'product', question: '怎么查看商品尺码和库存？',
      answer: '在商品详情页选择颜色和尺码后，会显示当前是否可购买。库存随订单变化，加入购物车不代表已经锁定库存。',
      keywords: ['尺码', '尺寸', '库存', '颜色'], aliases: ['还有货吗', '有没有我的码'],
      suggestedReplies: ['尺码不合可以换货吗？', '商品什么时候补货？'], enabled: true,
    },
    {
      id: 'product-quality', intent: 'product', question: '收到商品有质量问题怎么办？',
      answer: '请保留商品、包装和问题照片，在订单详情发起售后并描述情况。未经确认不要自行维修或寄回，以免影响责任判断。',
      keywords: ['质量问题', '破损', '瑕疵', '发错商品'], aliases: ['收到坏的', '商品坏了'],
      suggestedReplies: ['退货运费谁承担？', '如何提交退货？'], enabled: true,
    },
    {
      id: 'coupon-use', intent: 'coupon', question: '优惠券为什么无法使用？',
      answer: '请检查有效期、适用商品、最低金额、使用渠道和是否可叠加。结算页只会展示当前订单满足条件的优惠券。',
      keywords: ['优惠券', '无法使用', '满减', '折扣'], aliases: ['券用不了', '没有优惠'],
      suggestedReplies: ['优惠券过期了怎么办？', '支付失败怎么办？'], enabled: true,
    },
    {
      id: 'contact-human', intent: 'contact', question: '如何联系人工客服？',
      answer: '你可以使用页面中的“生成工单”整理问题摘要，再通过店铺公布的在线客服或售后渠道提交。不要在公开留言中填写完整手机号、地址或支付信息。',
      keywords: ['人工客服', '联系人工', '投诉', '电话'], aliases: ['转人工', '找真人客服'],
      suggestedReplies: ['查询物流', '退款进度'], enabled: true,
    },
  ];

  const elements = Object.fromEntries([
    'source-status', 'clear-conversation', 'manage-knowledge', 'message-count', 'helpful-count', 'handoff-count',
    'conversation-log', 'welcome-state', 'quick-questions', 'composer-form', 'message-input', 'character-count', 'send-message',
    'route-trace', 'route-state', 'route-question', 'route-intent', 'route-source', 'confidence-value', 'confidence-meter',
    'route-reason', 'source-card', 'source-card-title', 'source-card-intent', 'source-card-question', 'source-card-answer',
    'feedback-panel', 'feedback-status', 'handoff-button', 'enabled-knowledge-count', 'knowledge-search', 'knowledge-preview',
    'open-knowledge-bottom', 'knowledge-dialog', 'close-knowledge', 'manager-search', 'manager-faq-list', 'faq-editor-title',
    'faq-form', 'faq-id', 'faq-question', 'faq-answer', 'faq-intent', 'faq-enabled', 'faq-keywords', 'faq-aliases',
    'faq-suggestions', 'cancel-faq-edit', 'reset-knowledge', 'handoff-dialog', 'handoff-summary', 'copy-handoff',
    'close-handoff', 'toast', 'live-region',
  ].map((id) => [id, document.getElementById(id)]));

  const cloneFaqs = (faqs) => Core.normalizeKnowledgeBase(faqs).map((faq) => ({
    ...faq,
    keywords: [...faq.keywords],
    aliases: [...faq.aliases],
    suggestedReplies: [...faq.suggestedReplies],
  }));

  function defaultState() {
    return {
      knowledge: cloneFaqs(DEFAULT_FAQS),
      messages: [],
      feedback: { helpful: 0, unhelpful: 0 },
      ratings: {},
      handoffs: 0,
      lastHandoffQuestion: '',
      currentQuestion: '',
      currentRoute: null,
    };
  }

  function cleanMessage(message) {
    if (!message || typeof message !== 'object' || !['user', 'assistant'].includes(message.role)) return null;
    const text = String(message.text || '').replace(/<[^>]*>/g, '').trim().slice(0, 1200);
    if (!text) return null;
    return {
      id: String(message.id || `msg-${Date.now()}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 64) || `msg-${Date.now()}`,
      role: message.role,
      text,
      time: Number(message.time) || Date.now(),
      source: message.source === 'ai' ? 'ai' : message.source === 'local' ? 'local' : '',
      intent: Core.VALID_INTENTS.includes(message.intent) ? message.intent : 'unknown',
      faqIds: Array.isArray(message.faqIds) ? message.faqIds.map(String).slice(0, 3) : [],
      suggestions: Array.isArray(message.suggestions) ? message.suggestions.map((item) => String(item).slice(0, 80)).filter(Boolean).slice(0, 3) : [],
      needsHandoff: message.needsHandoff === true,
    };
  }

  function restoreState() {
    const fallback = defaultState();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return fallback;
      const knowledge = cloneFaqs(saved.knowledge);
      const messages = Array.isArray(saved.messages) ? saved.messages.map(cleanMessage).filter(Boolean).slice(-30) : [];
      const ratings = saved.ratings && typeof saved.ratings === 'object'
        ? Object.fromEntries(Object.entries(saved.ratings).slice(-30).filter(([, value]) => ['helpful', 'unhelpful'].includes(value)))
        : {};
      return {
        ...fallback,
        knowledge: knowledge.length ? knowledge : fallback.knowledge,
        messages,
        feedback: {
          helpful: Math.max(0, Number(saved.feedback && saved.feedback.helpful) || 0),
          unhelpful: Math.max(0, Number(saved.feedback && saved.feedback.unhelpful) || 0),
        },
        ratings,
        handoffs: Math.max(0, Number(saved.handoffs) || 0),
        lastHandoffQuestion: String(saved.lastHandoffQuestion || '').slice(0, 120),
      };
    } catch {
      return fallback;
    }
  }

  let state = restoreState();
  let pending = false;
  let toastTimer;

  function saveState() {
    const serializable = {
      knowledge: state.knowledge,
      messages: state.messages.slice(-30),
      feedback: state.feedback,
      ratings: state.ratings,
      handoffs: state.handoffs,
      lastHandoffQuestion: state.lastHandoffQuestion,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable)); } catch {}
  }

  function announce(message) {
    elements['live-region'].textContent = '';
    window.setTimeout(() => { elements['live-region'].textContent = message; }, 20);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
  }

  function timeLabel(timestamp) {
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp));
  }

  function findFaq(id) {
    return state.knowledge.find((faq) => faq.id === id) || null;
  }

  function setSourceStatus(source, handoff) {
    document.body.dataset.source = source;
    if (handoff) {
      elements['source-status'].innerHTML = '<i aria-hidden="true"></i>需要人工接管';
      return;
    }
    if (source === 'ai') elements['source-status'].innerHTML = '<i aria-hidden="true"></i>AI 增强 · 已引用知识卡';
    else if (offlineMode) elements['source-status'].innerHTML = '<i aria-hidden="true"></i>本地路由 · 离线模式';
    else elements['source-status'].innerHTML = '<i aria-hidden="true"></i>AI 未连接 · 本地路由';
  }

  function renderStats() {
    elements['message-count'].textContent = String(state.messages.length);
    elements['helpful-count'].textContent = String(state.feedback.helpful);
    elements['handoff-count'].textContent = String(state.handoffs);
  }

  function createMessageElement(message) {
    const article = document.createElement('article');
    article.className = `message message-${message.role}`;
    article.dataset.messageId = message.id;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const sender = document.createElement('span');
    sender.textContent = message.role === 'user' ? '客户来电' : message.source === 'ai' ? 'RELAY · AI 增强' : 'RELAY · 本地知识';
    const clock = document.createElement('time');
    clock.dateTime = new Date(message.time).toISOString();
    clock.textContent = timeLabel(message.time);
    meta.append(sender, clock);
    const content = document.createElement('p');
    content.textContent = message.text;
    bubble.append(meta, content);
    if (message.role === 'assistant') {
      const source = document.createElement('span');
      source.className = 'message-source';
      const faq = findFaq(message.faqIds[0]);
      source.textContent = message.needsHandoff
        ? '⚠ 无可靠知识卡 · 建议人工接管'
        : `↳ ${Core.INTENT_LABELS[message.intent] || '待确认'} · ${faq ? faq.question : '知识卡已更新'}`;
      bubble.append(source);
    }
    article.append(bubble);
    if (message.role === 'assistant' && message.suggestions.length) {
      const row = document.createElement('div');
      row.className = 'suggestion-row';
      message.suggestions.forEach((suggestion) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.question = suggestion;
        button.textContent = suggestion;
        row.append(button);
      });
      article.append(row);
    }
    return article;
  }

  function renderConversation() {
    elements['conversation-log'].replaceChildren();
    if (!state.messages.length) {
      elements['conversation-log'].append(elements['welcome-state']);
      elements['welcome-state'].hidden = false;
    } else {
      elements['welcome-state'].hidden = true;
      state.messages.forEach((message) => elements['conversation-log'].append(createMessageElement(message)));
      elements['conversation-log'].scrollTop = elements['conversation-log'].scrollHeight;
    }
    renderStats();
  }

  function showTyping() {
    const article = document.createElement('article');
    article.className = 'message message-assistant';
    article.id = 'typing-message';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.innerHTML = '<span>RELAY · 正在查线</span>';
    const dots = document.createElement('span');
    dots.className = 'typing-dots';
    dots.setAttribute('aria-label', '正在检索知识库');
    dots.innerHTML = '<i></i><i></i><i></i>';
    bubble.append(meta, dots);
    article.append(bubble);
    elements['conversation-log'].append(article);
    elements['conversation-log'].scrollTop = elements['conversation-log'].scrollHeight;
  }

  function setStage(stage, active) {
    const node = elements['route-trace'].querySelector(`[data-stage="${stage}"]`);
    node.classList.toggle('is-active', active);
    node.classList.toggle('is-idle', !active);
  }

  function resetRoutePanel() {
    elements['route-trace'].classList.remove('is-routed');
    ['incoming', 'intent', 'source'].forEach((stage) => setStage(stage, false));
    elements['route-question'].textContent = '尚未接入';
    elements['route-intent'].textContent = '待识别';
    elements['route-source'].textContent = '待匹配';
    elements['route-state'].textContent = '等待来电';
    elements['confidence-value'].textContent = '—';
    elements['confidence-meter'].setAttribute('aria-valuenow', '0');
    elements['confidence-meter'].querySelector('span').style.width = '0%';
    elements['route-reason'].textContent = '发送问题后显示路由依据';
    elements['source-card'].classList.add('is-empty');
    elements['source-card-title'].textContent = '回答依据';
    elements['source-card-intent'].textContent = '未连接';
    elements['source-card-question'].textContent = '匹配成功后，这里会显示被引用的 FAQ 知识卡。';
    elements['source-card-answer'].hidden = true;
    elements['feedback-panel'].hidden = true;
    elements['handoff-button'].disabled = true;
  }

  function updateRoutePanel(question, route) {
    state.currentQuestion = question;
    state.currentRoute = route;
    const percent = Math.round(route.confidence * 100);
    const faq = findFaq(route.faqIds[0]);
    elements['route-trace'].classList.toggle('is-routed', Boolean(faq));
    setStage('incoming', true);
    setStage('intent', route.intent !== 'unknown');
    setStage('source', Boolean(faq));
    elements['route-question'].textContent = question;
    elements['route-intent'].textContent = Core.INTENT_LABELS[route.intent] || '待确认';
    elements['route-source'].textContent = faq ? faq.id : '转人工';
    elements['route-state'].textContent = route.needsHandoff ? '需要人工' : route.source === 'ai' ? 'AI 已增强' : '本地已接通';
    elements['confidence-value'].textContent = `${percent}%`;
    elements['confidence-meter'].setAttribute('aria-valuenow', String(percent));
    elements['confidence-meter'].querySelector('span').style.width = `${percent}%`;
    elements['route-reason'].textContent = route.routingReason;
    elements['source-card'].classList.toggle('is-empty', !faq);
    elements['source-card-title'].textContent = faq ? '已引用知识卡' : '没有可靠引用';
    elements['source-card-intent'].textContent = Core.INTENT_LABELS[route.intent] || '待确认';
    elements['source-card-question'].textContent = faq ? faq.question : '建议生成待跟进工单，由人工确认客户上下文。';
    elements['source-card-answer'].hidden = !faq;
    elements['source-card-answer'].textContent = faq ? faq.answer : '';
    elements['feedback-panel'].hidden = false;
    elements['feedback-status'].textContent = '';
    elements['feedback-panel'].querySelectorAll('[data-feedback]').forEach((button) => button.classList.remove('is-selected'));
    elements['handoff-button'].disabled = false;
    setSourceStatus(route.source, route.needsHandoff);
    renderStats();
  }

  function addMessage(message) {
    state.messages.push(cleanMessage(message));
    state.messages = state.messages.filter(Boolean).slice(-30);
    saveState();
    renderConversation();
  }

  function messageId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  async function tryAIReply(question, localRoute, assistantId) {
    if (offlineMode || localRoute.needsHandoff || !localRoute.faqIds.length) {
      setSourceStatus('local', localRoute.needsHandoff);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          question,
          conversation: state.messages.slice(-8).map((message) => ({ role: message.role, content: message.text })),
          knowledgeBase: state.knowledge.filter((faq) => faq.enabled),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('AI unavailable');
      const payload = await response.json();
      const enhanced = Core.sanitizeAIReply(payload.reply || payload, state.knowledge);
      if (!enhanced) throw new Error('AI reply failed validation');
      const message = state.messages.find((item) => item.id === assistantId);
      if (!message) return;
      Object.assign(message, {
        text: enhanced.answer,
        source: 'ai',
        intent: enhanced.intent,
        faqIds: [...enhanced.faqIds],
        suggestions: [...enhanced.suggestedReplies],
        needsHandoff: false,
      });
      saveState();
      renderConversation();
      updateRoutePanel(question, enhanced);
      announce('AI 已基于引用知识卡增强回答。');
    } catch {
      setSourceStatus('local', localRoute.needsHandoff);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function submitQuestion(rawQuestion) {
    const question = String(rawQuestion || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!question || pending) return;
    pending = true;
    elements['send-message'].disabled = true;
    elements['message-input'].value = '';
    elements['character-count'].textContent = '0 / 120';
    addMessage({ id: messageId('user'), role: 'user', text: question, time: Date.now(), faqIds: [], suggestions: [] });
    showTyping();
    elements['route-question'].textContent = question;
    setStage('incoming', true);
    elements['route-state'].textContent = '正在查线';
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    const localRoute = Core.routeQuestion(question, state.knowledge);
    const assistantId = messageId('reply');
    addMessage({
      id: assistantId,
      role: 'assistant',
      text: localRoute.answer,
      time: Date.now(),
      source: 'local',
      intent: localRoute.intent,
      faqIds: [...localRoute.faqIds],
      suggestions: [...localRoute.suggestedReplies],
      needsHandoff: localRoute.needsHandoff,
    });
    updateRoutePanel(question, localRoute);
    announce(localRoute.needsHandoff ? '没有可靠知识卡，建议人工接管。' : `已识别为${Core.INTENT_LABELS[localRoute.intent]}并引用知识卡。`);
    pending = false;
    elements['send-message'].disabled = false;
    elements['message-input'].focus();
    void tryAIReply(question, localRoute, assistantId);
  }

  function splitList(value) {
    return String(value || '').split(/[\n,，、;；]+/).map((item) => item.trim()).filter(Boolean);
  }

  function renderKnowledgePreview() {
    const query = Core.normalizeText(elements['knowledge-search'].value);
    const enabled = state.knowledge.filter((faq) => faq.enabled);
    elements['enabled-knowledge-count'].textContent = String(enabled.length);
    const visible = enabled.filter((faq) => {
      if (!query) return true;
      return Core.normalizeText([faq.question, faq.answer, faq.intent, ...faq.keywords].join(' ')).includes(query);
    }).slice(0, 6);
    elements['knowledge-preview'].replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('p');
      empty.textContent = '没有匹配的启用知识卡。';
      empty.style.fontSize = '11px';
      empty.style.color = 'rgba(243,233,210,.55)';
      elements['knowledge-preview'].append(empty);
      return;
    }
    visible.forEach((faq) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preview-card';
      button.dataset.editFaq = faq.id;
      const light = document.createElement('i');
      const title = document.createElement('span');
      title.textContent = faq.question;
      const intent = document.createElement('small');
      intent.textContent = Core.INTENT_LABELS[faq.intent];
      button.append(light, title, intent);
      elements['knowledge-preview'].append(button);
    });
  }

  function renderManagerList() {
    const query = Core.normalizeText(elements['manager-search'].value);
    const faqs = state.knowledge.filter((faq) => {
      if (!query) return true;
      return Core.normalizeText([faq.question, faq.answer, faq.intent, ...faq.keywords].join(' ')).includes(query);
    });
    elements['manager-faq-list'].replaceChildren();
    faqs.forEach((faq) => {
      const card = document.createElement('article');
      card.className = `manager-card${faq.enabled ? '' : ' is-disabled'}`;
      card.dataset.faqId = faq.id;
      const header = document.createElement('header');
      const question = document.createElement('strong');
      question.textContent = faq.question;
      const intent = document.createElement('small');
      intent.textContent = Core.INTENT_LABELS[faq.intent];
      header.append(question, intent);
      const footer = document.createElement('footer');
      const status = document.createElement('span');
      status.textContent = `${faq.enabled ? '已启用' : '已停用'} · ${faq.keywords.length} 个关键词${faq.custom ? ' · 自定义' : ''}`;
      const actions = document.createElement('div');
      actions.className = 'manager-card-actions';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.dataset.action = 'toggle';
      toggle.textContent = faq.enabled ? '停用' : '启用';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.dataset.action = 'edit';
      edit.textContent = '编辑';
      actions.append(toggle, edit);
      if (faq.custom) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.dataset.action = 'delete';
        remove.textContent = '删除';
        actions.append(remove);
      }
      footer.append(status, actions);
      card.append(header, footer);
      elements['manager-faq-list'].append(card);
    });
  }

  function renderKnowledge() {
    renderKnowledgePreview();
    renderManagerList();
  }

  function resetFaqForm() {
    elements['faq-form'].reset();
    elements['faq-id'].value = '';
    elements['faq-enabled'].checked = true;
    elements['faq-editor-title'].textContent = '新增知识卡';
    elements['cancel-faq-edit'].hidden = true;
  }

  function editFaq(id) {
    const faq = findFaq(id);
    if (!faq) return;
    elements['faq-id'].value = faq.id;
    elements['faq-question'].value = faq.question;
    elements['faq-answer'].value = faq.answer;
    elements['faq-intent'].value = faq.intent;
    elements['faq-enabled'].checked = faq.enabled;
    elements['faq-keywords'].value = faq.keywords.join(', ');
    elements['faq-aliases'].value = faq.aliases.join('\n');
    elements['faq-suggestions'].value = faq.suggestedReplies.join(', ');
    elements['faq-editor-title'].textContent = '编辑知识卡';
    elements['cancel-faq-edit'].hidden = false;
    elements['faq-question'].focus();
  }

  function openKnowledge(id) {
    renderKnowledge();
    if (!elements['knowledge-dialog'].open) elements['knowledge-dialog'].showModal();
    if (id) editFaq(id);
    else window.setTimeout(() => elements['manager-search'].focus(), 20);
  }

  function saveFaq(event) {
    event.preventDefault();
    const existingId = elements['faq-id'].value;
    const existing = findFaq(existingId);
    const raw = {
      id: existingId || `custom-${Date.now().toString(36)}`,
      intent: elements['faq-intent'].value,
      question: elements['faq-question'].value,
      answer: elements['faq-answer'].value,
      keywords: splitList(elements['faq-keywords'].value),
      aliases: splitList(elements['faq-aliases'].value),
      suggestedReplies: splitList(elements['faq-suggestions'].value),
      enabled: elements['faq-enabled'].checked,
      custom: existing ? existing.custom : true,
    };
    const faq = Core.sanitizeFaq(raw, state.knowledge.length);
    if (!faq) {
      showToast('请填写完整的问题和标准回答。');
      return;
    }
    const next = existing
      ? state.knowledge.map((item) => item.id === existingId ? faq : item)
      : [...state.knowledge, faq];
    state.knowledge = cloneFaqs(next);
    saveState();
    renderKnowledge();
    resetFaqForm();
    showToast(existing ? '知识卡已更新。' : '知识卡已接入路由。');
    announce(existing ? '知识卡已更新。' : '新的知识卡已保存并启用。');
  }

  function handleManagerAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('[data-faq-id]');
    const id = card && card.dataset.faqId;
    const faq = findFaq(id);
    if (!faq) return;
    if (button.dataset.action === 'edit') {
      editFaq(id);
      return;
    }
    if (button.dataset.action === 'toggle') {
      state.knowledge = cloneFaqs(state.knowledge.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item));
      saveState();
      renderKnowledge();
      showToast(faq.enabled ? '知识卡已停用。' : '知识卡已启用。');
      return;
    }
    if (button.dataset.action === 'delete' && faq.custom && window.confirm(`删除知识卡“${faq.question}”？`)) {
      state.knowledge = cloneFaqs(state.knowledge.filter((item) => item.id !== id));
      saveState();
      renderKnowledge();
      resetFaqForm();
      showToast('自定义知识卡已删除。');
    }
  }

  function buildHandoffSummary() {
    const route = state.currentRoute;
    const faq = route && findFaq(route.faqIds[0]);
    const transcript = state.messages.slice(-4).map((message) => `${message.role === 'user' ? '客户' : 'RELAY'}：${message.text}`).join('\n');
    return [
      `RELAY/68 人工待跟进 · ${new Date().toLocaleString('zh-CN')}`,
      `客户问题：${state.currentQuestion || '未记录'}`,
      `识别意图：${route ? Core.INTENT_LABELS[route.intent] : '待确认'}`,
      `路由置信度：${route ? Math.round(route.confidence * 100) : 0}%`,
      `引用知识：${faq ? `${faq.id} · ${faq.question}` : '无可靠知识卡'}`,
      '',
      '最近会话：',
      transcript || '暂无会话',
      '',
      '处理提醒：请在授权系统内核对订单；不要要求客户提供密码、验证码或完整支付信息。',
    ].join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function openHandoff() {
    if (!state.currentRoute) return;
    elements['handoff-summary'].textContent = buildHandoffSummary();
    if (state.lastHandoffQuestion !== state.currentQuestion) {
      state.handoffs += 1;
      state.lastHandoffQuestion = state.currentQuestion;
      saveState();
      renderStats();
    }
    if (!elements['handoff-dialog'].open) elements['handoff-dialog'].showModal();
    announce('人工待跟进摘要已生成。');
  }

  function recordFeedback(value, button) {
    const lastAssistant = [...state.messages].reverse().find((message) => message.role === 'assistant');
    if (!lastAssistant) return;
    const previous = state.ratings[lastAssistant.id];
    if (previous === value) return;
    if (previous) state.feedback[previous] = Math.max(0, state.feedback[previous] - 1);
    state.ratings[lastAssistant.id] = value;
    state.feedback[value] += 1;
    saveState();
    renderStats();
    elements['feedback-panel'].querySelectorAll('[data-feedback]').forEach((item) => item.classList.toggle('is-selected', item === button));
    elements['feedback-status'].textContent = value === 'helpful' ? '已记录为解决。' : '已记录，建议生成工单继续跟进。';
    if (value === 'unhelpful') elements['handoff-button'].focus();
  }

  elements['composer-form'].addEventListener('submit', (event) => {
    event.preventDefault();
    void submitQuestion(elements['message-input'].value);
  });
  elements['message-input'].addEventListener('input', () => {
    elements['character-count'].textContent = `${elements['message-input'].value.length} / 120`;
  });
  elements['message-input'].addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      elements['composer-form'].requestSubmit();
    }
  });
  document.addEventListener('click', (event) => {
    const questionButton = event.target.closest('[data-question]');
    if (questionButton) void submitQuestion(questionButton.dataset.question);
    const feedbackButton = event.target.closest('[data-feedback]');
    if (feedbackButton) recordFeedback(feedbackButton.dataset.feedback, feedbackButton);
    const editButton = event.target.closest('[data-edit-faq]');
    if (editButton) openKnowledge(editButton.dataset.editFaq);
  });
  elements['clear-conversation'].addEventListener('click', () => {
    state.messages = [];
    state.ratings = {};
    state.currentQuestion = '';
    state.currentRoute = null;
    saveState();
    renderConversation();
    resetRoutePanel();
    setSourceStatus('local', false);
    showToast('本次会话已清空，知识库未改变。');
  });
  elements['manage-knowledge'].addEventListener('click', () => openKnowledge());
  elements['open-knowledge-bottom'].addEventListener('click', () => openKnowledge());
  elements['close-knowledge'].addEventListener('click', () => elements['knowledge-dialog'].close());
  elements['manager-search'].addEventListener('input', renderManagerList);
  elements['knowledge-search'].addEventListener('input', renderKnowledgePreview);
  elements['manager-faq-list'].addEventListener('click', handleManagerAction);
  elements['faq-form'].addEventListener('submit', saveFaq);
  elements['cancel-faq-edit'].addEventListener('click', resetFaqForm);
  elements['reset-knowledge'].addEventListener('click', () => {
    if (!window.confirm('恢复默认知识库？所有自定义知识卡和本地编辑都会被移除。')) return;
    state.knowledge = cloneFaqs(DEFAULT_FAQS);
    saveState();
    renderKnowledge();
    resetFaqForm();
    showToast('已恢复 19 条默认知识卡。');
  });
  elements['handoff-button'].addEventListener('click', openHandoff);
  elements['close-handoff'].addEventListener('click', () => elements['handoff-dialog'].close());
  elements['copy-handoff'].addEventListener('click', async () => {
    try {
      await copyText(elements['handoff-summary'].textContent);
      showToast('待跟进摘要已复制。');
    } catch {
      showToast('复制失败，请手动选择摘要。');
    }
  });

  renderConversation();
  renderKnowledge();
  resetRoutePanel();
  setSourceStatus('local', false);
  document.body.classList.add('ready');
})();
