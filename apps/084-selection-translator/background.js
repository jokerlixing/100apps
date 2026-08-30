(function initializeBackground(root, factory) {
  if (typeof importScripts === 'function' && !root.MarginCore) importScripts('translator-core.js');
  const core = root.MarginCore || (typeof require === 'function' ? require('./translator-core.js') : null);
  const api = factory(core);
  root.MarginBackground = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createBackground(Core) {
  'use strict';

  const CACHE_KEY = 'margin84Cache';
  const HISTORY_KEY = 'margin84History';
  const SETTINGS_KEY = 'margin84Settings';
  const CACHE_LIMIT = 60;
  const DEFAULT_TIMEOUT_MS = 8000;
  const DEFAULT_SETTINGS = Object.freeze({
    sourceLanguage: 'auto',
    targetLanguage: 'zh-CN',
    autoTranslate: false,
    paused: false,
  });

  function pruneCache(cacheValue, limitValue) {
    const cache = cacheValue && typeof cacheValue === 'object' ? cacheValue : {};
    const limit = Number.isInteger(limitValue) && limitValue > 0 ? limitValue : CACHE_LIMIT;
    return Object.fromEntries(Object.entries(cache)
      .sort((left, right) => String(right[1].savedAt || '').localeCompare(String(left[1].savedAt || '')))
      .slice(0, limit));
  }

  async function getSettings(storage) {
    const stored = await storage.get([SETTINGS_KEY]);
    const incoming = stored[SETTINGS_KEY] || {};
    const pair = Core.validateLanguagePair(incoming.sourceLanguage || DEFAULT_SETTINGS.sourceLanguage, incoming.targetLanguage || DEFAULT_SETTINGS.targetLanguage);
    return {
      sourceLanguage: pair.ok ? pair.source : DEFAULT_SETTINGS.sourceLanguage,
      targetLanguage: pair.ok ? pair.target : DEFAULT_SETTINGS.targetLanguage,
      autoTranslate: Boolean(incoming.autoTranslate),
      paused: Boolean(incoming.paused),
    };
  }

  async function recordHistory(storage, input) {
    const stored = await storage.get([HISTORY_KEY]);
    const history = Core.mergeHistory(stored[HISTORY_KEY], input);
    await storage.set({ [HISTORY_KEY]: history });
    return history[0];
  }

  async function requestRemote(text, sourceLanguage, targetLanguage, fetchImpl, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(Core.buildApiUrl(text, sourceLanguage, targetLanguage), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller ? controller.signal : undefined,
      });
      if (!response || !response.ok) {
        const status = response && Number(response.status);
        if (status === 429 || status === 403) {
          return { ok: false, code: 'remote-quota', message: '翻译服务今日额度已用尽，请稍后再试。' };
        }
        return { ok: false, code: 'remote-error', message: `在线翻译服务返回 ${status || '未知'} 状态。` };
      }
      return Core.parseApiPayload(await response.json());
    } catch (error) {
      const timedOut = error && error.name === 'AbortError';
      return {
        ok: false,
        code: timedOut ? 'remote-timeout' : 'remote-network',
        message: timedOut ? '在线翻译超过 8 秒，已停止等待。' : '无法连接在线翻译服务。',
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function translateRequest(requestValue, dependencies) {
    const request = requestValue || {};
    const deps = dependencies || {};
    const storage = deps.storage || (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);
    const fetchImpl = deps.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const timeoutMs = Number.isFinite(deps.timeoutMs) ? deps.timeoutMs : DEFAULT_TIMEOUT_MS;
    if (!storage || !fetchImpl) {
      return { ok: false, code: 'runtime-unavailable', message: '扩展后台尚未准备好，请重新加载页面。' };
    }

    const selection = Core.validateSelection(request.text);
    if (!selection.ok) return selection;
    const settings = await getSettings(storage);
    if (settings.paused) {
      return { ok: false, code: 'extension-paused', message: 'MARGIN 已暂停，可在扩展弹窗中重新启用。' };
    }
    const pair = Core.validateLanguagePair(
      request.sourceLanguage || settings.sourceLanguage,
      request.targetLanguage || settings.targetLanguage,
    );
    if (!pair.ok) return pair;

    const key = Core.makeCacheKey(selection.text, pair.source, pair.target);
    const stored = await storage.get([CACHE_KEY]);
    const cache = stored[CACHE_KEY] && typeof stored[CACHE_KEY] === 'object' ? stored[CACHE_KEY] : {};
    const cached = cache[key];
    if (cached && Core.normalizeText(cached.text)) {
      const entry = await recordHistory(storage, {
        sourceText: selection.text,
        translatedText: cached.text,
        sourceLanguage: cached.detectedSource || (pair.source === 'auto' ? Core.detectLanguage(selection.text) : pair.source),
        targetLanguage: pair.target,
        provider: 'cache',
      });
      return {
        ok: true,
        text: cached.text,
        provider: 'cache',
        detectedSource: entry.sourceLanguage,
        targetLanguage: pair.target,
        confidence: cached.confidence,
        note: '来自浏览器本地缓存。',
      };
    }

    const remote = await requestRemote(selection.text, pair.source, pair.target, fetchImpl, timeoutMs);
    if (remote.ok) {
      const detectedSource = remote.detectedSource || (pair.source === 'auto' ? Core.detectLanguage(selection.text) : pair.source);
      const savedAt = new Date().toISOString();
      cache[key] = {
        text: remote.text,
        detectedSource,
        confidence: remote.confidence,
        savedAt,
      };
      await storage.set({ [CACHE_KEY]: pruneCache(cache) });
      await recordHistory(storage, {
        sourceText: selection.text,
        translatedText: remote.text,
        sourceLanguage: detectedSource,
        targetLanguage: pair.target,
        provider: 'remote',
        createdAt: savedAt,
      });
      return {
        ok: true,
        text: remote.text,
        provider: 'remote',
        detectedSource,
        targetLanguage: pair.target,
        confidence: remote.confidence,
        note: '由 MyMemory 在线翻译返回。',
      };
    }

    const local = Core.localTranslate(selection.text, pair.source, pair.target);
    if (local.ok) {
      await recordHistory(storage, {
        sourceText: selection.text,
        translatedText: local.text,
        sourceLanguage: local.detectedSource,
        targetLanguage: pair.target,
        provider: 'local-phrasebook',
      });
      return {
        ok: true,
        text: local.text,
        provider: 'local-phrasebook',
        detectedSource: local.detectedSource,
        targetLanguage: pair.target,
        confidence: 1,
        note: `在线服务不可用；已使用内置示例短语。${remote.message ? ` ${remote.message}` : ''}`,
      };
    }

    return {
      ok: false,
      code: 'network-unavailable',
      message: `无法完成在线翻译，请检查网络后再试。${remote.message ? ` ${remote.message}` : ''}`,
    };
  }

  async function ensureDefaults(storage) {
    const stored = await storage.get([SETTINGS_KEY]);
    if (!stored[SETTINGS_KEY]) await storage.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS } });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.storage && chrome.storage.local) {
    chrome.runtime.onInstalled.addListener(() => {
      ensureDefaults(chrome.storage.local).catch(() => {});
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== 'MARGIN_TRANSLATE') return false;
      translateRequest(message, { storage: chrome.storage.local })
        .then(sendResponse)
        .catch(() => sendResponse({
          ok: false,
          code: 'unexpected-error',
          message: '翻译后台遇到意外错误，请重新加载扩展。',
        }));
      return true;
    });
  }

  return Object.freeze({
    CACHE_KEY,
    HISTORY_KEY,
    SETTINGS_KEY,
    CACHE_LIMIT,
    DEFAULT_SETTINGS,
    pruneCache,
    getSettings,
    requestRemote,
    translateRequest,
    ensureDefaults,
  });
});
