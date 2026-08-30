(function attachMarginCore(root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.MarginCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMarginCore() {
  'use strict';

  const MAX_SELECTION_BYTES = 500;
  const DEFAULT_HISTORY_LIMIT = 8;
  const SUPPORTED_LANGUAGES = Object.freeze({
    auto: { label: '自动识别', apiCode: 'auto' },
    en: { label: 'English', apiCode: 'en' },
    'zh-CN': { label: '简体中文', apiCode: 'zh-CN' },
    ja: { label: '日本語', apiCode: 'ja' },
    ko: { label: '한국어', apiCode: 'ko' },
    fr: { label: 'Français', apiCode: 'fr' },
    es: { label: 'Español', apiCode: 'es' },
    de: { label: 'Deutsch', apiCode: 'de' },
  });

  const LANGUAGE_ALIASES = Object.freeze({
    'zh': 'zh-CN',
    'zh-cn': 'zh-CN',
    'zh_cn': 'zh-CN',
    'cn': 'zh-CN',
    'jp': 'ja',
    'kr': 'ko',
    'autodetect': 'auto',
  });

  const LOCAL_PHRASES = Object.freeze([
    {
      source: 'en',
      target: 'zh-CN',
      from: 'Measure twice, translate once.',
      to: '先确认两遍，再翻译一次。',
    },
    {
      source: 'zh-CN',
      target: 'en',
      from: '先确认两遍，再翻译一次。',
      to: 'Measure twice, translate once.',
    },
    {
      source: 'en',
      target: 'zh-CN',
      from: 'A good translation carries context, not just words.',
      to: '好的翻译传递语境，而不只是替换词语。',
    },
    {
      source: 'zh-CN',
      target: 'en',
      from: '语言不是替换词语，而是转移语境。',
      to: 'Language is not word replacement; it is the transfer of context.',
    },
    {
      source: 'en',
      target: 'zh-CN',
      from: 'Leave enough room for meaning to breathe.',
      to: '给含义留下足够的呼吸空间。',
    },
    {
      source: 'en',
      target: 'ja',
      from: 'Read slowly. Keep the context.',
      to: 'ゆっくり読み、文脈を保ちましょう。',
    },
    {
      source: 'en',
      target: 'es',
      from: 'Words travel with their context.',
      to: 'Las palabras viajan con su contexto.',
    },
    {
      source: 'en',
      target: 'fr',
      from: 'The margin is part of the conversation.',
      to: 'La marge fait partie de la conversation.',
    },
  ]);

  function normalizeText(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }

  function byteLength(value) {
    const text = String(value || '');
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
    return unescape(encodeURIComponent(text)).length;
  }

  function validateSelection(value) {
    const text = normalizeText(value);
    if (!text) {
      return { ok: false, code: 'empty-selection', message: '请先选择一段文字。' };
    }
    const bytes = byteLength(text);
    if (bytes > MAX_SELECTION_BYTES) {
      return {
        ok: false,
        code: 'selection-too-long',
        message: `选区为 ${bytes} 字节，请缩短到 500 字节以内。`,
      };
    }
    return { ok: true, text, bytes };
  }

  function normalizeLanguage(value) {
    const raw = normalizeText(value);
    if (!raw) return '';
    if (SUPPORTED_LANGUAGES[raw]) return raw;
    const lowered = raw.toLowerCase();
    if (LANGUAGE_ALIASES[lowered]) return LANGUAGE_ALIASES[lowered];
    return SUPPORTED_LANGUAGES[lowered] ? lowered : '';
  }

  function validateLanguagePair(sourceValue, targetValue) {
    const source = normalizeLanguage(sourceValue);
    const target = normalizeLanguage(targetValue);
    if (!source || !target || target === 'auto') {
      return {
        ok: false,
        code: 'unsupported-language',
        message: '请选择支持的源语言和目标语言。',
      };
    }
    if (source === target) {
      return {
        ok: false,
        code: 'same-language',
        message: '源语言与目标语言不能相同。',
      };
    }
    return { ok: true, source, target };
  }

  function detectLanguage(value) {
    const text = normalizeText(value);
    if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return 'ja';
    if (/\p{Script=Hangul}/u.test(text)) return 'ko';
    if (/\p{Script=Han}/u.test(text)) return 'zh-CN';
    if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) return 'fr';
    if (/[áéíñóúü¿¡]/i.test(text)) return 'es';
    if (/[äöüß]/i.test(text)) return 'de';
    return 'en';
  }

  function makeCacheKey(textValue, sourceValue, targetValue) {
    const text = normalizeText(textValue);
    const source = normalizeLanguage(sourceValue) || String(sourceValue || '').toLowerCase();
    const target = normalizeLanguage(targetValue) || String(targetValue || '').toLowerCase();
    return `${source}>${target}:${text}`;
  }

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  function parseApiPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, code: 'invalid-response', message: '翻译服务返回了无法读取的数据。' };
    }
    const status = Number(payload.responseStatus || 0);
    if (status === 429 || status === 403) {
      return { ok: false, code: 'remote-quota', message: '翻译服务今日额度已用尽，请稍后再试。' };
    }
    if (status && (status < 200 || status >= 300)) {
      return { ok: false, code: 'remote-error', message: '翻译服务暂时不可用。' };
    }
    const data = payload.responseData;
    const text = data && normalizeText(decodeEntities(data.translatedText));
    if (!text) {
      return { ok: false, code: 'invalid-response', message: '翻译服务没有返回译文。' };
    }
    const confidence = Number(data.match);
    return {
      ok: true,
      text,
      detectedSource: normalizeLanguage(data.detectedLanguage) || undefined,
      confidence: Number.isFinite(confidence) ? confidence : undefined,
    };
  }

  function localTranslate(textValue, sourceValue, targetValue) {
    const selection = validateSelection(textValue);
    if (!selection.ok) return selection;
    const pair = validateLanguagePair(sourceValue, targetValue);
    if (!pair.ok) return pair;
    const detectedSource = pair.source === 'auto' ? detectLanguage(selection.text) : pair.source;
    const normalized = selection.text.toLocaleLowerCase();
    const match = LOCAL_PHRASES.find((phrase) => (
      phrase.source === detectedSource
      && phrase.target === pair.target
      && normalizeText(phrase.from).toLocaleLowerCase() === normalized
    ));
    if (!match) {
      return {
        ok: false,
        code: 'local-miss',
        message: '本地示例词库没有这段译文；安装扩展后可使用在线翻译。',
      };
    }
    return {
      ok: true,
      text: match.to,
      source: 'local-phrasebook',
      detectedSource,
      confidence: 1,
    };
  }

  function createHistoryEntry(input) {
    const sourceText = normalizeText(input && input.sourceText);
    const translatedText = normalizeText(input && input.translatedText);
    const sourceLanguage = normalizeLanguage(input && input.sourceLanguage) || detectLanguage(sourceText);
    const targetLanguage = normalizeLanguage(input && input.targetLanguage) || 'zh-CN';
    const createdAt = input && input.createdAt ? input.createdAt : new Date().toISOString();
    return {
      id: `${Date.parse(createdAt) || Date.now()}-${makeCacheKey(sourceText, sourceLanguage, targetLanguage).length}`,
      sourceText,
      translatedText,
      sourceLanguage,
      targetLanguage,
      provider: normalizeText(input && input.provider) || 'local-phrasebook',
      createdAt,
    };
  }

  function mergeHistory(historyValue, entryValue, limitValue) {
    const history = Array.isArray(historyValue) ? historyValue : [];
    const entry = createHistoryEntry(entryValue || {});
    const limit = Number.isInteger(limitValue) && limitValue > 0 ? limitValue : DEFAULT_HISTORY_LIMIT;
    const entryKey = makeCacheKey(entry.sourceText, entry.sourceLanguage, entry.targetLanguage);
    return [entry, ...history.filter((item) => (
      makeCacheKey(item.sourceText, item.sourceLanguage, item.targetLanguage) !== entryKey
    ))].slice(0, limit);
  }

  function buildApiUrl(textValue, sourceValue, targetValue) {
    const selection = validateSelection(textValue);
    if (!selection.ok) throw new TypeError(selection.message);
    const pair = validateLanguagePair(sourceValue, targetValue);
    if (!pair.ok) throw new TypeError(pair.message);
    const source = pair.source === 'auto' ? detectLanguage(selection.text) : pair.source;
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', selection.text);
    url.searchParams.set('langpair', `${SUPPORTED_LANGUAGES[source].apiCode}|${SUPPORTED_LANGUAGES[pair.target].apiCode}`);
    url.searchParams.set('mt', '1');
    return url.toString();
  }

  return Object.freeze({
    MAX_SELECTION_BYTES,
    DEFAULT_HISTORY_LIMIT,
    SUPPORTED_LANGUAGES,
    LOCAL_PHRASES,
    normalizeText,
    byteLength,
    validateSelection,
    normalizeLanguage,
    validateLanguagePair,
    detectLanguage,
    makeCacheKey,
    parseApiPayload,
    localTranslate,
    createHistoryEntry,
    mergeHistory,
    buildApiUrl,
  });
});
