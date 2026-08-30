(function attachWriterCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WriterCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createWriterCore() {
  'use strict';

  const MODE_LABELS = Object.freeze({
    polish: '润色',
    expand: '扩写',
    translate: '翻译',
    style: '风格改写',
  });

  const STYLE_LABELS = Object.freeze({
    concise: '简洁有力',
    professional: '专业可信',
    social: '社交媒体',
    literary: '自然叙事',
  });

  const STRENGTH_LABELS = Object.freeze({
    conservative: '保守：尽量保留原句结构，只修正明显问题',
    balanced: '均衡：允许调整句序和用词，但保持原意与语气',
    bold: '大胆：可以重组结构，优先获得更清晰有力的成稿',
  });

  function asText(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }

  function normalizeDraft(value) {
    return asText(value).replace(/\r\n?/g, '\n').trim();
  }

  function countTextMetrics(value) {
    const text = normalizeDraft(value);
    if (!text) {
      return { characters: 0, words: 0, paragraphs: 0, readingMinutes: 0 };
    }

    const characters = Array.from(text.replace(/\s/gu, '')).length;
    const hanWords = text.match(/[\p{Script=Han}]/gu) || [];
    const latinWords = text.match(/[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*/gu) || [];
    const words = hanWords.length + latinWords.length;
    const paragraphs = text.split(/\n\s*\n/).filter((part) => part.trim()).length;

    return {
      characters,
      words,
      paragraphs,
      readingMinutes: words ? Math.max(1, Math.ceil(words / 300)) : 0,
    };
  }

  function splitTerms(value) {
    return asText(value)
      .split(/[,，;；\n]/)
      .map((term) => term.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  function buildPrompt(options) {
    const settings = options || {};
    const text = normalizeDraft(settings.text);
    const mode = asText(settings.mode || 'polish');
    if (!text) throw new Error('请先输入需要处理的原稿');
    if (!MODE_LABELS[mode]) throw new Error('请选择有效的改写模式');

    const strength = STRENGTH_LABELS[settings.strength] || STRENGTH_LABELS.balanced;
    const terms = splitTerms(settings.preserveTerms);
    const notes = normalizeDraft(settings.notes);
    const targetLanguage = normalizeDraft(settings.targetLanguage) || 'English';
    const style = STYLE_LABELS[settings.style] || STYLE_LABELS.professional;
    const taskByMode = {
      polish: '润色这段文字：修正语病、重复和不自然表达，让语言清楚顺畅。',
      expand: '扩写这段文字：补足背景、逻辑和有用细节，但不要虚构事实、数字或引用。',
      translate: `把这段文字准确翻译为 ${targetLanguage}，保留专有名词、段落和语气。`,
      style: `把这段文字改写为“${style}”风格，保持事实与核心观点不变。`,
    };

    const constraints = [
      `改写力度：${strength}。`,
      terms.length ? `必须原样保留这些词：${terms.join('、')}。` : '',
      notes ? `额外要求：${notes}` : '',
    ].filter(Boolean);

    return {
      system: '你是一名资深中文编辑。忠实于原意，不编造事实，不解释过程，只输出可以直接使用的最终成稿。',
      user: [
        `任务：${taskByMode[mode]}`,
        ...constraints,
        '',
        '原稿：',
        text,
      ].join('\n'),
      mode,
      modeLabel: MODE_LABELS[mode],
    };
  }

  function validateProviderSettings(options) {
    const settings = options || {};
    if (settings.provider !== 'remote') return { valid: true, errors: [] };

    const endpoint = normalizeDraft(settings.endpoint);
    const model = normalizeDraft(settings.model);
    const errors = [];

    if (!endpoint) {
      errors.push('请填写接口地址');
    } else {
      try {
        const url = new URL(endpoint);
        const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHosts.has(url.hostname))) {
          errors.push('远程接口必须使用 HTTPS；本机 localhost 可使用 HTTP');
        }
      } catch {
        errors.push('接口地址格式无效');
      }
    }

    if (!model) errors.push('请填写模型名称');
    return { valid: errors.length === 0, errors };
  }

  function parseSSEBuffer(value) {
    const normalized = asText(value).replace(/\r\n/g, '\n');
    const blocks = normalized.split('\n\n');
    const remainder = blocks.pop() || '';
    const events = [];
    let done = false;

    blocks.forEach((block) => {
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim();
      if (!data) return;
      if (data === '[DONE]') {
        done = true;
        return;
      }
      try {
        events.push(JSON.parse(data));
      } catch {
        events.push({ raw: data });
      }
    });

    return { events, remainder, done };
  }

  function contentToText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item?.text === 'string') return item.text;
      if (typeof item?.text?.value === 'string') return item.text.value;
      return '';
    }).join('');
  }

  function extractResponseText(payload) {
    if (typeof payload === 'string') return payload;
    if (!payload || typeof payload !== 'object') return '';

    const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
    const choiceText = contentToText(choice?.delta?.content) || contentToText(choice?.message?.content);
    if (choiceText) return choiceText;
    if (typeof payload.output_text === 'string') return payload.output_text;
    if (typeof payload.delta === 'string') return payload.delta;

    if (Array.isArray(payload.output)) {
      return payload.output.map((item) => contentToText(item?.content)).join('');
    }
    return '';
  }

  function cleanDemoText(value) {
    let text = normalizeDraft(value)
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*([，。！？；：、,.!?;:])\s*/g, '$1')
      .replace(/非常非常/g, '格外')
      .replace(/(?:我觉得其实|其实我觉得|我觉得|其实)[，,：:\s]*/g, '')
      .replace(/,/g, '，')
      .replace(/;/g, '；');
    if (/\p{Script=Han}/u.test(text)) text = text.replace(/\.(?=\s|$)/g, '。');
    return text;
  }

  function createDemoRewrite(options) {
    const settings = options || {};
    const mode = asText(settings.mode || 'polish');
    if (!MODE_LABELS[mode]) throw new Error('请选择有效的改写模式');
    const original = normalizeDraft(settings.text);
    if (!original) throw new Error('请先输入需要处理的原稿');
    const polished = cleanDemoText(original);

    if (mode === 'polish') {
      return `【本地演示 · 润色】\n${polished}`;
    }
    if (mode === 'expand') {
      const topic = polished.replace(/[。！？!?].*$/s, '').slice(0, 28) || '这段内容';
      return [
        '【本地演示 · 扩写结构预览】',
        polished,
        '',
        `进一步展开“${topic}”时，可以先交代它要解决的具体问题，再说明采取的方法与判断依据。`,
        '最后补充可验证的结果、适用边界和下一步行动，读者就能更快理解重点，也知道如何把观点落到实际场景中。',
      ].join('\n');
    }
    if (mode === 'translate') {
      const language = normalizeDraft(settings.targetLanguage) || 'English';
      return [
        `【本地演示 · ${language} 翻译流程预览】`,
        `Source meaning preview: ${polished}`,
        '',
        'Connect a real AI endpoint to produce an accurate, publication-ready translation while preserving names and paragraph structure.',
      ].join('\n');
    }

    const style = STYLE_LABELS[settings.style] || STYLE_LABELS.professional;
    return [
      `【本地演示 · ${style}风格】`,
      polished,
      '',
      `风格处理会围绕“${style}”调整节奏、用词和句长，同时保留原稿的事实与核心观点。连接真实 AI 接口后可生成完整成稿。`,
    ].join('\n');
  }

  function tokenize(value) {
    return normalizeDraft(value).match(/[\p{Script=Han}]|[A-Za-z0-9]+(?:['’_-][A-Za-z0-9]+)*|\s+|[^\s]/gu) || [];
  }

  function mergeSegments(segments) {
    return segments.reduce((merged, segment) => {
      if (!segment.text) return merged;
      const previous = merged[merged.length - 1];
      if (previous && previous.type === segment.type) previous.text += segment.text;
      else merged.push({ type: segment.type, text: segment.text });
      return merged;
    }, []);
  }

  function diffText(beforeValue, afterValue, maxTokens) {
    const before = tokenize(beforeValue);
    const after = tokenize(afterValue);
    const limit = Number.isFinite(maxTokens) ? Math.max(20, maxTokens) : 360;

    if (!before.length && !after.length) return [];
    if (before.length > limit || after.length > limit) {
      return [
        before.length ? { type: 'delete', text: before.join('') } : null,
        after.length ? { type: 'add', text: after.join('') } : null,
      ].filter(Boolean);
    }

    const table = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
    for (let left = before.length - 1; left >= 0; left -= 1) {
      for (let right = after.length - 1; right >= 0; right -= 1) {
        table[left][right] = before[left] === after[right]
          ? table[left + 1][right + 1] + 1
          : Math.max(table[left + 1][right], table[left][right + 1]);
      }
    }

    const segments = [];
    let left = 0;
    let right = 0;
    while (left < before.length && right < after.length) {
      if (before[left] === after[right]) {
        segments.push({ type: 'equal', text: before[left] });
        left += 1;
        right += 1;
      } else if (table[left + 1][right] >= table[left][right + 1]) {
        segments.push({ type: 'delete', text: before[left] });
        left += 1;
      } else {
        segments.push({ type: 'add', text: after[right] });
        right += 1;
      }
    }
    while (left < before.length) segments.push({ type: 'delete', text: before[left++] });
    while (right < after.length) segments.push({ type: 'add', text: after[right++] });

    return mergeSegments(segments);
  }

  return Object.freeze({
    MODE_LABELS,
    STYLE_LABELS,
    countTextMetrics,
    buildPrompt,
    validateProviderSettings,
    parseSSEBuffer,
    extractResponseText,
    createDemoRewrite,
    diffText,
  });
}));
