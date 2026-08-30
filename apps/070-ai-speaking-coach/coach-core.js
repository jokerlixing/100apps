(function initCoachCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CoachCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCoachCore() {
  'use strict';

  const MAX_TEXT = 2000;
  const FILLERS = ['you know', 'i mean', 'kind of', 'sort of', 'actually', 'basically', 'erm', 'hmm', 'um', 'uh'];

  function deepFreezeScenario(scenario) {
    scenario.prompts.forEach((prompt) => {
      Object.freeze(prompt.expectedKeywords);
      Object.freeze(prompt.targetPhrases);
      Object.freeze(prompt);
    });
    Object.freeze(scenario.prompts);
    return Object.freeze(scenario);
  }

  const SCENARIOS = Object.freeze([
    deepFreezeScenario({
      id: 'coffee',
      title: '咖啡店点单',
      englishTitle: 'At the coffee shop',
      level: 'A2',
      duration: '5–7 分钟',
      goal: '清楚说明饮品、规格、冷热和额外需求',
      prompts: [
        { coach: 'Hi there! What can I get for you today?', expectedKeywords: [['coffee', 'tea', 'latte', 'drink']], targetPhrases: ['i would like', 'could i have'], modelAnswer: 'Could I have a medium latte, please?', fallbackReply: 'Great. Let us make the order more specific.' },
        { coach: 'What size would you like?', expectedKeywords: [['small', 'medium', 'large']], targetPhrases: ['i would like', 'medium please'], modelAnswer: 'I would like a medium, please.', fallbackReply: 'Good. The size is clear.' },
        { coach: 'Would you like that hot or iced?', expectedKeywords: [['hot', 'iced', 'cold']], targetPhrases: ['i would prefer', 'make it'], modelAnswer: 'I would prefer it iced.', fallbackReply: 'Nice. You answered the choice directly.' },
        { coach: 'Would you like any changes to the milk or sweetness?', expectedKeywords: [['milk', 'sugar', 'sweet', 'oat', 'regular']], targetPhrases: ['could you make it', 'without'], modelAnswer: 'Could you make it with oat milk and less sugar?', fallbackReply: 'Clear customization. One last detail.' },
        { coach: 'Is that for here or to go?', expectedKeywords: [['here', 'go', 'takeaway']], targetPhrases: ['to go please', 'for here'], modelAnswer: 'To go, please. That is everything.', fallbackReply: 'Order complete.' }
      ]
    }),
    deepFreezeScenario({
      id: 'hotel',
      title: '酒店入住',
      englishTitle: 'Hotel check-in',
      level: 'A2–B1',
      duration: '6–8 分钟',
      goal: '完成预订确认、证件交接和入住需求表达',
      prompts: [
        { coach: 'Good evening. Welcome to Northline Hotel. How can I help you?', expectedKeywords: [['reservation', 'booking', 'check in']], targetPhrases: ['i have a reservation', 'i would like to check in'], modelAnswer: 'Good evening. I have a reservation under the name Li.', fallbackReply: 'Nice — that was clear and task-focused.' },
        { coach: 'May I have the name on the reservation and see your passport?', expectedKeywords: [['name', 'reservation'], ['passport', 'here']], targetPhrases: ['under the name', 'here you are'], modelAnswer: 'The reservation is under the name Li. Here is my passport.', fallbackReply: 'Good. You supplied both pieces of information.' },
        { coach: 'You booked a standard room for two nights. Is that correct?', expectedKeywords: [['two', 'nights'], ['correct', 'yes']], targetPhrases: ['that is correct', 'for two nights'], modelAnswer: 'Yes, that is correct. I am staying for two nights.', fallbackReply: 'Clear confirmation. Now add a room preference.' },
        { coach: 'Do you have any room preferences?', expectedKeywords: [['quiet', 'floor', 'room', 'view']], targetPhrases: ['could i have', 'i would prefer'], modelAnswer: 'Could I have a quiet room on a higher floor, please?', fallbackReply: 'Good request. The preference is specific.' },
        { coach: 'Breakfast starts at seven. Is there anything else you need?', expectedKeywords: [['breakfast', 'checkout', 'nothing', 'wifi']], targetPhrases: ['could you tell me', 'that will be all'], modelAnswer: 'Could you tell me the Wi-Fi password? That will be all, thank you.', fallbackReply: 'Check-in complete.' }
      ]
    }),
    deepFreezeScenario({
      id: 'airport',
      title: '机场入境',
      englishTitle: 'At immigration',
      level: 'B1',
      duration: '6–8 分钟',
      goal: '简洁回答出行目的、停留时间与住宿安排',
      prompts: [
        { coach: 'Good afternoon. What is the purpose of your visit?', expectedKeywords: [['business', 'holiday', 'vacation', 'visit']], targetPhrases: ['i am here for', 'the purpose of my visit'], modelAnswer: 'I am here for a one-week holiday.', fallbackReply: 'Good. Your purpose is easy to understand.' },
        { coach: 'How long will you be staying?', expectedKeywords: [['day', 'week', 'night', 'staying']], targetPhrases: ['i will be staying', 'for one week'], modelAnswer: 'I will be staying for seven days.', fallbackReply: 'Clear duration. Keep the answer concise.' },
        { coach: 'Where will you be staying?', expectedKeywords: [['hotel', 'friend', 'address', 'staying']], targetPhrases: ['i will be staying at', 'i have booked'], modelAnswer: 'I will be staying at the Northline Hotel downtown.', fallbackReply: 'Good. The accommodation is specific.' },
        { coach: 'Do you have a return ticket?', expectedKeywords: [['return', 'ticket', 'flight', 'yes']], targetPhrases: ['yes i do', 'my return flight'], modelAnswer: 'Yes, I do. My return flight is next Friday.', fallbackReply: 'That answers the question directly.' },
        { coach: 'Are you carrying any food or restricted items?', expectedKeywords: [['no', 'food', 'items', 'carrying']], targetPhrases: ['i am not carrying', 'nothing to declare'], modelAnswer: 'No, I am not carrying any restricted items.', fallbackReply: 'Immigration interview complete.' }
      ]
    }),
    deepFreezeScenario({
      id: 'introduction',
      title: '职场自我介绍',
      englishTitle: 'Professional introduction',
      level: 'B1',
      duration: '7–9 分钟',
      goal: '用有结构的短回答介绍职责、经验与近期目标',
      prompts: [
        { coach: 'Welcome to the team. Could you introduce yourself?', expectedKeywords: [['name', 'developer', 'designer', 'manager', 'work']], targetPhrases: ['i work as', 'my name is'], modelAnswer: 'My name is Li, and I work as a frontend developer.', fallbackReply: 'Good opening. Add one detail about your focus.' },
        { coach: 'What are you mainly responsible for?', expectedKeywords: [['responsible', 'build', 'manage', 'design', 'support']], targetPhrases: ['i am responsible for', 'my main focus is'], modelAnswer: 'I am responsible for building accessible web interfaces.', fallbackReply: 'Nice. Your responsibility is concrete.' },
        { coach: 'What experience will help you in this role?', expectedKeywords: [['experience', 'years', 'project', 'worked']], targetPhrases: ['i have experience in', 'i previously worked on'], modelAnswer: 'I have experience in product design and frontend performance.', fallbackReply: 'Good evidence. Keep the example specific.' },
        { coach: 'What would you like to learn from this team?', expectedKeywords: [['learn', 'improve', 'understand', 'grow']], targetPhrases: ['i would like to learn', 'i hope to improve'], modelAnswer: 'I would like to learn more about large-scale design systems.', fallbackReply: 'Clear learning goal.' },
        { coach: 'How can your teammates best work with you?', expectedKeywords: [['feedback', 'communicate', 'message', 'work']], targetPhrases: ['i work best when', 'please feel free to'], modelAnswer: 'I work best with clear feedback, so please feel free to message me early.', fallbackReply: 'Introduction complete.' }
      ]
    }),
    deepFreezeScenario({
      id: 'small-talk',
      title: '社交寒暄',
      englishTitle: 'Conference small talk',
      level: 'B1',
      duration: '6–8 分钟',
      goal: '自然开启、延续并礼貌结束一段陌生人对话',
      prompts: [
        { coach: 'Hi, I do not think we have met. I am Alex.', expectedKeywords: [['name', 'nice', 'meet']], targetPhrases: ['nice to meet you', 'my name is'], modelAnswer: 'Hi Alex, nice to meet you. My name is Li.', fallbackReply: 'Warm opening. Now find a shared topic.' },
        { coach: 'What brings you to this event?', expectedKeywords: [['event', 'learn', 'meet', 'speaker']], targetPhrases: ['i came here to', 'i am interested in'], modelAnswer: 'I came here to learn about AI products and meet other builders.', fallbackReply: 'Good. You gave the other person two topics to continue.' },
        { coach: 'Which talk have you enjoyed most so far?', expectedKeywords: [['talk', 'speaker', 'session', 'enjoyed']], targetPhrases: ['i really enjoyed', 'my favorite talk'], modelAnswer: 'I really enjoyed the session about reliable AI evaluation.', fallbackReply: 'Specific answer. Add a reason next.' },
        { coach: 'What made that session useful for you?', expectedKeywords: [['because', 'useful', 'example', 'learned']], targetPhrases: ['it was useful because', 'what i liked was'], modelAnswer: 'It was useful because the speaker shared practical examples.', fallbackReply: 'Nice reason. Finish the conversation politely.' },
        { coach: 'I am going to the next session. Shall we stay in touch?', expectedKeywords: [['yes', 'contact', 'connect', 'touch']], targetPhrases: ['it was great talking with you', 'let us stay in touch'], modelAnswer: 'Absolutely. It was great talking with you. Let us stay in touch.', fallbackReply: 'Small-talk practice complete.' }
      ]
    }),
    deepFreezeScenario({
      id: 'meeting',
      title: '会议表达',
      englishTitle: 'Project meeting',
      level: 'B1–B2',
      duration: '8–10 分钟',
      goal: '汇报进展、解释风险、提出建议并确认下一步',
      prompts: [
        { coach: 'Could you give us a quick project update?', expectedKeywords: [['finished', 'completed', 'progress', 'working']], targetPhrases: ['we have completed', 'we are currently working on'], modelAnswer: 'We have completed the prototype and are currently testing the main flow.', fallbackReply: 'Clear update. Now name the main risk.' },
        { coach: 'What is the biggest risk right now?', expectedKeywords: [['risk', 'delay', 'issue', 'concern']], targetPhrases: ['the main risk is', 'we may need'], modelAnswer: 'The main risk is a possible delay in the external API integration.', fallbackReply: 'Good. The risk is concrete.' },
        { coach: 'What do you recommend we do about it?', expectedKeywords: [['recommend', 'suggest', 'plan', 'test']], targetPhrases: ['i recommend that we', 'my suggestion is'], modelAnswer: 'I recommend that we build a local fallback and test it this week.', fallbackReply: 'Actionable recommendation. Add ownership next.' },
        { coach: 'Who should own that action, and when can it be done?', expectedKeywords: [['i can', 'team', 'friday', 'week', 'done']], targetPhrases: ['i can take ownership', 'by the end of'], modelAnswer: 'I can take ownership and finish the fallback by Friday.', fallbackReply: 'Good ownership and deadline.' },
        { coach: 'Could you summarize the next step for everyone?', expectedKeywords: [['next', 'test', 'finish', 'share']], targetPhrases: ['the next step is', 'i will share'], modelAnswer: 'The next step is to build and test the fallback. I will share the results on Friday.', fallbackReply: 'Meeting update complete.' }
      ]
    })
  ]);

  function cleanText(value, maxLength = MAX_TEXT) {
    if (typeof value !== 'string') return '';
    return value
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, Math.max(0, maxLength));
  }

  function tokenizeEnglish(value) {
    const matches = cleanText(value).toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g);
    return matches ? matches.map((token) => token.replace('’', "'")) : [];
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function countFillers(value) {
    const text = ` ${tokenizeEnglish(value).join(' ')} `;
    const counts = {};
    let total = 0;
    for (const filler of FILLERS) {
      const pattern = new RegExp(`\\b${escapeRegex(filler).replace(/\\ /g, '\\s+')}\\b`, 'g');
      const matches = text.match(pattern);
      const count = matches ? matches.length : 0;
      if (count) counts[filler] = count;
      total += count;
    }
    return { total, counts };
  }

  function calculateWordsPerMinute(value, durationMs) {
    const words = tokenizeEnglish(value).length;
    if (!words) return 0;
    const safeDuration = Math.max(1000, Number(durationMs) || 0);
    return Math.round(words / (safeDuration / 60000));
  }

  function calculateLexicalDiversity(value) {
    const words = tokenizeEnglish(value);
    if (!words.length) return 0;
    return Number((new Set(words).size / words.length).toFixed(2));
  }

  function normalizeComparable(value) {
    return tokenizeEnglish(value).join(' ');
  }

  function calculatePhraseCoverage(value, targetPhrases) {
    const text = ` ${normalizeComparable(value)} `;
    const phrases = Array.isArray(targetPhrases)
      ? targetPhrases.map((item) => cleanText(item, 100).toLowerCase()).filter(Boolean).slice(0, 10)
      : [];
    const found = phrases.filter((phrase) => text.includes(` ${normalizeComparable(phrase)} `));
    const missing = phrases.filter((phrase) => !found.includes(phrase));
    return {
      matched: found.length,
      total: phrases.length,
      ratio: phrases.length ? Number((found.length / phrases.length).toFixed(2)) : 1,
      found,
      missing
    };
  }

  function calculateConceptCoverage(value, expectedKeywords) {
    const words = new Set(tokenizeEnglish(value));
    const groups = Array.isArray(expectedKeywords)
      ? expectedKeywords.slice(0, 10).map((group) => (Array.isArray(group) ? group : [group]))
      : [];
    const matchedGroups = groups.filter((group) => group.some((word) => words.has(normalizeComparable(word))));
    return {
      matched: matchedGroups.length,
      total: groups.length,
      ratio: groups.length ? Number((matchedGroups.length / groups.length).toFixed(2)) : 1
    };
  }

  function analyzeTurn(input) {
    const source = input && typeof input === 'object' ? input : {};
    const text = cleanText(source.text);
    const wordCount = tokenizeEnglish(text).length;
    const wpm = calculateWordsPerMinute(text, source.durationMs);
    const fillers = countFillers(text);
    const lexicalDiversity = calculateLexicalDiversity(text);
    const phraseCoverage = calculatePhraseCoverage(text, source.targetPhrases);
    const conceptCoverage = calculateConceptCoverage(text, source.expectedKeywords);
    const rawConfidence = Number(source.confidence);
    const transcriptConfidence = Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1
      ? Math.round(rawConfidence * 100)
      : null;

    const lengthScore = Math.min(20, Math.round((wordCount / 12) * 20));
    const paceScore = !wordCount ? 0 : wpm >= 80 && wpm <= 170 ? 25 : wpm >= 60 && wpm <= 200 ? 18 : 10;
    const fillerScore = Math.max(0, 20 - fillers.total * 5);
    const phraseScore = Math.round(phraseCoverage.ratio * 20);
    const conceptScore = Math.round(conceptCoverage.ratio * 15);
    const score = Math.max(0, Math.min(100, lengthScore + paceScore + fillerScore + phraseScore + conceptScore));

    const suggestions = [];
    if (wordCount < 5) suggestions.push('把回答扩展到至少一个完整句，并补充一个具体细节。');
    if (wpm > 170) suggestions.push(`把语速从 ${wpm} WPM 放慢到 130–160 WPM，句末留出停顿。`);
    if (wordCount >= 5 && wpm > 0 && wpm < 80) suggestions.push(`把语速从 ${wpm} WPM 提到约 100–140 WPM，先按意群练习。`);
    if (fillers.total) {
      const used = Object.keys(fillers.counts).map((item) => item === 'um' ? 'Um' : item).join('、');
      suggestions.push(`本轮出现 ${fillers.total} 个停顿词（${used}）；卡住时先静默半秒再继续。`);
    }
    if (phraseCoverage.missing.length) suggestions.push(`下一轮尝试加入 “${phraseCoverage.missing[0]}”。`);
    if (conceptCoverage.ratio < 0.5) suggestions.push('先直接回答问题，再补充原因或细节。');
    if (!suggestions.length) suggestions.push('保持当前节奏，下一轮尝试换一种句型表达同样意思。');

    let strength = '你完成了这轮回答。';
    if (phraseCoverage.matched) strength = `你准确用上了 ${phraseCoverage.matched} 个目标表达。`;
    else if (conceptCoverage.ratio >= 1 && conceptCoverage.total) strength = '你覆盖了问题要求的关键信息。';
    else if (wpm >= 100 && wpm <= 160) strength = `本轮 ${wpm} WPM，处于清晰易懂的练习区间。`;

    return {
      text,
      wordCount,
      wpm,
      fillerCount: fillers.total,
      fillers: fillers.counts,
      lexicalDiversity,
      phraseCoverage,
      conceptCoverage,
      transcriptConfidence,
      score,
      strength,
      suggestions: suggestions.slice(0, 3)
    };
  }

  function getScenario(id) {
    return SCENARIOS.find((scenario) => scenario.id === id) || SCENARIOS[0];
  }

  function advanceLocalScenario(scenarioId, stepIndex, analysis) {
    const scenario = getScenario(scenarioId);
    const safeStep = Math.max(0, Math.min(scenario.prompts.length - 1, Math.floor(Number(stepIndex) || 0)));
    const current = scenario.prompts[safeStep];
    const completed = safeStep >= scenario.prompts.length - 1;
    const score = Number(analysis && analysis.score) || 0;
    const coachReply = completed
      ? `Nice work. You completed “${scenario.englishTitle}”. Open the report to choose your next practice goal.`
      : score >= 75
        ? `Nice — that was clear and task-focused. ${current.fallbackReply}`
        : current.fallbackReply;
    return {
      coachReply,
      completed,
      nextStep: completed ? safeStep : safeStep + 1,
      nextPrompt: completed ? null : scenario.prompts[safeStep + 1].coach
    };
  }

  function normalizeEndpoint(value) {
    const text = cleanText(value, 500);
    let url;
    try {
      url = new URL(text);
    } catch {
      throw new Error('请输入有效的 HTTPS 接口地址。');
    }
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) {
      throw new Error('远程接口必须使用 HTTPS；本机 localhost 可以使用 HTTP。');
    }
    if (url.username || url.password) throw new Error('接口地址不能包含账号凭据。');
    url.search = '';
    url.hash = '';
    let pathname = url.pathname.replace(/\/+$/, '');
    pathname = pathname.replace(/\/chat\/completions$/i, '');
    url.pathname = pathname || '/';
    return url.toString().replace(/\/$/, '');
  }

  function buildAIRequest(options) {
    const source = options && typeof options === 'object' ? options : {};
    const endpoint = normalizeEndpoint(source.endpoint);
    const model = cleanText(source.model, 120);
    if (!model) throw new Error('请输入模型名称。');
    const scenario = source.scenario && source.scenario.id ? source.scenario : getScenario('coffee');
    const turns = Array.isArray(source.turns) ? source.turns.slice(-3) : [];
    const messages = [{
      role: 'system',
      content: `You are a concise English speaking coach for the scenario "${cleanText(scenario.englishTitle, 100)}". Return JSON only with coachReply, rewrite, and tips (an array of up to 3 short Chinese actions). Do not claim phoneme-level pronunciation scoring.`
    }];
    for (const turn of turns) {
      messages.push({ role: 'assistant', content: cleanText(turn.coach, 500) });
      messages.push({ role: 'user', content: cleanText(turn.user, 1000) });
    }
    const metrics = source.analysis && typeof source.analysis === 'object' ? source.analysis : {};
    messages.push({
      role: 'user',
      content: `Give feedback for the latest answer. Local metrics: score ${Number(metrics.score) || 0}, WPM ${Number(metrics.wpm) || 0}, fillers ${Number(metrics.fillerCount) || 0}. Keep the next reply suitable for ${cleanText(scenario.level, 20)}.`
    });
    return {
      url: `${endpoint}/chat/completions`,
      body: { model, messages, temperature: 0.5 }
    };
  }

  function sanitizeAIReply(value) {
    let source = value;
    if (typeof source === 'string') {
      const stripped = source.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      try {
        source = JSON.parse(stripped);
      } catch {
        return null;
      }
    }
    if (!source || typeof source !== 'object') return null;
    const coachReply = cleanText(source.coachReply || source.reply, 500);
    const rewrite = cleanText(source.rewrite, 500);
    const tips = Array.isArray(source.tips)
      ? source.tips.map((tip) => cleanText(tip, 180)).filter(Boolean).slice(0, 3)
      : [];
    if (!coachReply || !rewrite) return null;
    return { coachReply, rewrite, tips };
  }

  function sanitizeAnalysis(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      score: Math.max(0, Math.min(100, Math.round(Number(source.score) || 0))),
      wpm: Math.max(0, Math.min(400, Math.round(Number(source.wpm) || 0))),
      fillerCount: Math.max(0, Math.min(99, Math.round(Number(source.fillerCount) || 0))),
      wordCount: Math.max(0, Math.min(1000, Math.round(Number(source.wordCount) || 0))),
      lexicalDiversity: Math.max(0, Math.min(1, Number(source.lexicalDiversity) || 0)),
      transcriptConfidence: Number.isFinite(Number(source.transcriptConfidence)) ? Math.max(0, Math.min(100, Math.round(Number(source.transcriptConfidence)))) : null,
      phraseCoverage: {
        matched: Math.max(0, Math.min(10, Math.round(Number(source.phraseCoverage && source.phraseCoverage.matched) || 0))),
        total: Math.max(0, Math.min(10, Math.round(Number(source.phraseCoverage && source.phraseCoverage.total) || 0)))
      },
      strength: cleanText(source.strength, 300),
      suggestions: Array.isArray(source.suggestions) ? source.suggestions.map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 3) : []
    };
  }

  function sanitizeSession(value) {
    const source = value && typeof value === 'object' ? value : {};
    const scenario = getScenario(source.scenarioId);
    const turns = Array.isArray(source.turns)
      ? source.turns.slice(-20).map((turn) => {
        const coach = cleanText(turn && turn.coach, 800);
        const user = cleanText(turn && turn.user, MAX_TEXT);
        if (!coach || !user) return null;
        return {
          coach,
          user,
          durationMs: Math.max(1000, Math.min(600000, Math.round(Number(turn.durationMs) || 1000))),
          source: turn.source === 'speech' ? 'speech' : turn.source === 'demo' ? 'demo' : 'typed',
          analysis: sanitizeAnalysis(turn.analysis),
          coachReply: cleanText(turn.coachReply, 800),
          rewrite: cleanText(turn.rewrite, 800),
          aiEnhanced: Boolean(turn.aiEnhanced)
        };
      }).filter(Boolean)
      : [];

    const settingsSource = source.settings && typeof source.settings === 'object' ? source.settings : {};
    let endpoint = '';
    if (settingsSource.endpoint) {
      try { endpoint = normalizeEndpoint(settingsSource.endpoint); } catch { endpoint = ''; }
    }
    const reports = Array.isArray(source.reports)
      ? source.reports.slice(-10).map((report) => ({
        scenarioTitle: cleanText(report && report.scenarioTitle, 100),
        completedAt: cleanText(report && report.completedAt, 50),
        score: Math.max(0, Math.min(100, Math.round(Number(report && report.score) || 0))),
        averageWpm: Math.max(0, Math.min(400, Math.round(Number(report && report.averageWpm) || 0)))
      })).filter((report) => report.scenarioTitle && report.completedAt)
      : [];

    return {
      version: 1,
      scenarioId: scenario.id,
      stepIndex: Math.max(0, Math.min(4, Math.floor(Number(source.stepIndex) || 0))),
      startedAt: cleanText(source.startedAt, 50),
      completed: Boolean(source.completed),
      turns,
      settings: {
        level: ['A2', 'B1', 'B2'].includes(settingsSource.level) ? settingsSource.level : 'B1',
        autoSpeak: settingsSource.autoSpeak !== false,
        endpoint,
        model: cleanText(settingsSource.model, 120)
      },
      reports
    };
  }

  function summarizeSession(value) {
    const source = value && typeof value === 'object' ? value : {};
    const scenario = getScenario(source.scenarioId);
    const turns = Array.isArray(source.turns) ? source.turns.filter((turn) => turn && turn.user && turn.analysis) : [];
    const sum = (field) => turns.reduce((total, turn) => total + (Number(turn.analysis[field]) || 0), 0);
    const averageScore = turns.length ? Math.round(sum('score') / turns.length) : 0;
    const averageWpm = turns.length ? Math.round(sum('wpm') / turns.length) : 0;
    const totalFillers = sum('fillerCount');
    const targetPhrasesUsed = turns.reduce((total, turn) => total + (Number(turn.analysis.phraseCoverage && turn.analysis.phraseCoverage.matched) || 0), 0);
    const durationMs = turns.reduce((total, turn) => total + (Number(turn.durationMs) || 0), 0);
    const goals = [];
    if (averageWpm > 170) goals.push('下一次把平均语速控制在 130–160 WPM。');
    else if (averageWpm && averageWpm < 100) goals.push('下一次先按意群朗读，再把平均语速提高到 100 WPM 以上。');
    if (turns.length && totalFillers / turns.length >= 0.5) goals.push('用短暂停顿替代 Um、Uh 等停顿词。');
    if (targetPhrasesUsed < turns.length) goals.push('每轮主动使用至少一个场景目标表达。');
    if (!goals.length) goals.push('换一个场景，用不同句型保持同样的清晰度。');
    return {
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      englishTitle: scenario.englishTitle,
      completedAt: new Date().toISOString(),
      turnCount: turns.length,
      averageScore,
      averageWpm,
      totalFillers,
      targetPhrasesUsed,
      durationMs,
      goals: goals.slice(0, 3)
    };
  }

  return Object.freeze({
    SCENARIOS,
    cleanText,
    tokenizeEnglish,
    countFillers,
    calculateWordsPerMinute,
    calculateLexicalDiversity,
    calculatePhraseCoverage,
    analyzeTurn,
    getScenario,
    advanceLocalScenario,
    normalizeEndpoint,
    buildAIRequest,
    sanitizeAIReply,
    sanitizeSession,
    summarizeSession
  });
});
