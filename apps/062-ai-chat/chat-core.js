(function attachChatCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChatCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createChatCore() {
  'use strict';

  const MAX_MODEL_LENGTH = 160;
  const MAX_SYSTEM_LENGTH = 6000;
  const MAX_MESSAGE_LENGTH = 20000;
  const MAX_MESSAGES = 100;
  const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;

  class ChatCoreError extends Error {
    constructor(message, code) {
      super(message);
      this.name = 'ChatCoreError';
      this.code = code || 'CHAT_CORE_ERROR';
    }
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cleanText(value, limit) {
    if (typeof value !== 'string') return '';
    return value.replace(/\0/g, '').trim().slice(0, limit);
  }

  function normalizeTemperature(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 2
      ? Math.round(number * 100) / 100
      : 0.7;
  }

  function isLoopback(hostname) {
    const host = String(hostname).toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  }

  function normalizeEndpoint(value) {
    const raw = cleanText(value, 2048);
    if (!raw) throw new ChatCoreError('请输入接口地址。', 'ENDPOINT_REQUIRED');

    let url;
    try {
      url = new URL(raw);
    } catch (_error) {
      throw new ChatCoreError('接口地址不是有效 URL。', 'ENDPOINT_INVALID');
    }

    if (url.username || url.password) {
      throw new ChatCoreError('接口地址不能包含账号或密钥。', 'ENDPOINT_CREDENTIALS');
    }
    if (url.hash || url.search) {
      throw new ChatCoreError('接口地址不能包含查询参数或片段。', 'ENDPOINT_EXTRAS');
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
      throw new ChatCoreError('接口必须使用 HTTPS；本机回环地址可使用 HTTP。', 'ENDPOINT_PROTOCOL');
    }

    let pathname = url.pathname.replace(/\/+$/, '');
    if (!pathname) pathname = '/v1';
    if (!/\/chat\/completions$/i.test(pathname)) pathname += '/chat/completions';
    url.pathname = pathname;
    return url.toString();
  }

  function sanitizeSettings(value) {
    const source = isPlainObject(value) ? value : {};
    let endpoint = '';
    try {
      endpoint = normalizeEndpoint(source.endpoint);
    } catch (_error) {
      endpoint = '';
    }

    return {
      endpoint,
      model: cleanText(source.model, MAX_MODEL_LENGTH),
      systemPrompt: cleanText(source.systemPrompt, MAX_SYSTEM_LENGTH),
      temperature: normalizeTemperature(source.temperature)
    };
  }

  function makeId(prefix) {
    let suffix = '';
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    } else {
      suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    }
    return `${prefix}_${suffix}`;
  }

  function safeId(value, prefix) {
    const candidate = cleanText(value, 80);
    return ID_PATTERN.test(candidate) ? candidate : makeId(prefix);
  }

  function safeISO(value, fallback) {
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
      return new Date(value).toISOString();
    }
    if (typeof fallback === 'string' && Number.isFinite(Date.parse(fallback))) {
      return new Date(fallback).toISOString();
    }
    return new Date().toISOString();
  }

  function createConversation(options) {
    const source = isPlainObject(options) ? options : {};
    const now = safeISO(source.now);
    return {
      id: safeId(source.id, 'chat'),
      title: '新对话',
      createdAt: now,
      updatedAt: now,
      messages: []
    };
  }

  function sanitizeMessage(value, fallbackTime) {
    if (!isPlainObject(value)) return null;
    if (value.role !== 'user' && value.role !== 'assistant') return null;
    const content = cleanText(value.content, MAX_MESSAGE_LENGTH);
    if (!content) return null;

    let status = 'complete';
    if (value.role === 'assistant' && ['complete', 'stopped', 'error'].includes(value.status)) {
      status = value.status;
    } else if (value.role === 'assistant' && value.status === 'streaming') {
      status = 'stopped';
    }

    return {
      id: safeId(value.id, 'msg'),
      role: value.role,
      content,
      status,
      createdAt: safeISO(value.createdAt, fallbackTime)
    };
  }

  function sanitizeConversation(value) {
    if (!isPlainObject(value)) return null;
    const id = cleanText(value.id, 80);
    if (!ID_PATTERN.test(id)) return null;

    const createdAt = safeISO(value.createdAt);
    const updatedAt = safeISO(value.updatedAt, createdAt);
    const sourceMessages = Array.isArray(value.messages) ? value.messages.slice(-MAX_MESSAGES) : [];
    const messages = sourceMessages
      .map((message) => sanitizeMessage(message, createdAt))
      .filter(Boolean);

    return {
      id,
      title: cleanText(value.title, 60) || deriveTitle(messages.find((message) => message.role === 'user')?.content),
      createdAt,
      updatedAt,
      messages
    };
  }

  function deriveTitle(value) {
    const title = cleanText(value, MAX_MESSAGE_LENGTH)
      .replace(/^#{1,6}\s*/, '')
      .replace(/\s+/g, ' ')
      .replace(/^[>*_`~-]+\s*/, '')
      .trim();
    if (!title) return '新对话';
    return title.length > 24 ? `${title.slice(0, 24)}…` : title;
  }

  function normalizeRequestMessage(message) {
    if (!isPlainObject(message)) return null;
    if (message.role !== 'user' && message.role !== 'assistant') return null;
    const content = cleanText(message.content, MAX_MESSAGE_LENGTH);
    return content ? { role: message.role, content } : null;
  }

  function buildRequestMessages(messages, systemPrompt, maxChars) {
    const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 32000;
    const source = Array.isArray(messages)
      ? messages.map(normalizeRequestMessage).filter(Boolean)
      : [];
    const selected = [];
    let used = 0;

    for (let index = source.length - 1; index >= 0; index -= 1) {
      const message = source[index];
      if (used + message.content.length <= limit) {
        selected.unshift(message);
        used += message.content.length;
      } else if (!selected.length) {
        selected.unshift({ ...message, content: message.content.slice(-limit) });
        break;
      } else {
        break;
      }
    }

    const system = cleanText(systemPrompt, MAX_SYSTEM_LENGTH);
    return system ? [{ role: 'system', content: system }, ...selected] : selected;
  }

  function buildRequestBody(settings, messages) {
    const source = isPlainObject(settings) ? settings : {};
    const model = cleanText(source.model, MAX_MODEL_LENGTH);
    const safeMessages = Array.isArray(messages)
      ? messages
        .filter((message) => isPlainObject(message) && ['system', 'user', 'assistant'].includes(message.role))
        .map((message) => ({
          role: message.role,
          content: cleanText(message.content, MAX_MESSAGE_LENGTH)
        }))
        .filter((message) => message.content)
      : [];

    if (!model) throw new ChatCoreError('请输入模型名称。', 'MODEL_REQUIRED');
    if (!safeMessages.some((message) => message.role === 'user')) {
      throw new ChatCoreError('没有可发送的用户消息。', 'MESSAGES_REQUIRED');
    }

    return {
      model,
      messages: safeMessages,
      temperature: normalizeTemperature(source.temperature),
      stream: true
    };
  }

  function createSSEParser(handlers) {
    const options = isPlainObject(handlers) ? handlers : {};
    const onEvent = typeof options.onEvent === 'function' ? options.onEvent : function noop() {};
    const onDone = typeof options.onDone === 'function' ? options.onDone : function noop() {};
    const onError = typeof options.onError === 'function' ? options.onError : function noop() {};
    let buffer = '';
    let finished = false;
    let done = false;

    function consumeBlock(block) {
      const lines = block.replace(/\r\n/g, '\n').split('\n');
      const data = lines
        .filter((line) => line === 'data:' || line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) return;
      if (data.trim() === '[DONE]') {
        if (!done) onDone();
        done = true;
        return;
      }
      try {
        onEvent(JSON.parse(data));
      } catch (error) {
        onError(error, data);
      }
    }

    function drain(allowPartial) {
      const separator = /\r?\n\r?\n/;
      let match = separator.exec(buffer);
      while (match) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        consumeBlock(block);
        match = separator.exec(buffer);
      }
      if (allowPartial && buffer.trim()) consumeBlock(buffer);
      if (allowPartial) buffer = '';
    }

    return {
      push(chunk) {
        if (finished) throw new ChatCoreError('流解析器已经结束。', 'STREAM_FINISHED');
        buffer += String(chunk == null ? '' : chunk);
        drain(false);
      },
      finish() {
        if (finished) return;
        drain(true);
        finished = true;
      },
      get done() {
        return done;
      }
    };
  }

  function contentPartText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .filter((part) => isPlainObject(part) && (part.type === 'text' || part.type === 'output_text'))
      .map((part) => typeof part.text === 'string' ? part.text : '')
      .join('');
  }

  function extractDeltaText(payload) {
    if (!isPlainObject(payload) || !Array.isArray(payload.choices) || !payload.choices.length) return '';
    const choice = payload.choices[0];
    if (!isPlainObject(choice)) return '';
    if (isPlainObject(choice.delta)) return contentPartText(choice.delta.content);
    if (isPlainObject(choice.message)) return contentPartText(choice.message.content);
    return '';
  }

  return Object.freeze({
    ChatCoreError,
    normalizeEndpoint,
    sanitizeSettings,
    createConversation,
    sanitizeConversation,
    deriveTitle,
    buildRequestMessages,
    buildRequestBody,
    createSSEParser,
    extractDeltaText
  });
});
