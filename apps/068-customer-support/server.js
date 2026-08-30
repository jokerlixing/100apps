'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const Core = require('./support-core.js');

const APP_DIR = path.resolve(__dirname);
const MAX_BODY_BYTES = 64 * 1024;
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'app.js', 'support-core.js']);
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
});

function apiError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sendJSON(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(body);
}

function readJSONBody(request) {
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    request.resume();
    return Promise.reject(apiError('请求内容超过 64 KiB 限制。', 413, 'BODY_TOO_LARGE'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        request.resume();
        reject(apiError('请求内容超过 64 KiB 限制。', 413, 'BODY_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(apiError('请求 JSON 无法解析。', 400, 'INVALID_JSON'));
      }
    });
    request.on('error', () => {
      if (settled) return;
      settled = true;
      reject(apiError('请求读取失败。', 400, 'REQUEST_FAILED'));
    });
  });
}

function sanitizeConversation(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-8)
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : null;
      const content = String(message.content || message.text || '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1200);
      return role && content ? { role, content } : null;
    })
    .filter(Boolean);
}

function normalizeRequest(rawRequest) {
  const request = rawRequest && typeof rawRequest === 'object' ? rawRequest : {};
  return {
    question: Core.normalizeText(request.question),
    knowledgeBase: Core.normalizeKnowledgeBase(request.knowledgeBase).filter((faq) => faq.enabled).slice(0, 40),
    conversation: sanitizeConversation(request.conversation),
  };
}

function buildMessages(rawRequest) {
  const request = normalizeRequest(rawRequest);
  const system = [
    '你是 RELAY 电商客服回答整理器。',
    '只允许依据用户提供且启用的 knowledgeBase 回答，不得编造订单状态、物流轨迹、退款结果、联系方式或政策。',
    '问题超出知识库时不要猜测；但本接口只用于已有本地引用的增强，因此每次回答必须引用至少一张提供的知识卡。',
    '只返回 JSON，不要 Markdown 或额外解释。',
    '格式为 {"answer":"纯文本回答","intent":"意图代码","confidence":0到1,"citationIds":["知识卡ID"],"suggestedReplies":["最多三条"]}。',
    `有效意图代码：${Core.VALID_INTENTS.join(', ')}。`,
  ].join('\n');
  const user = JSON.stringify({
    question: request.question,
    knowledgeBase: request.knowledgeBase.map((faq) => ({
      id: faq.id,
      intent: faq.intent,
      question: faq.question,
      answer: faq.answer,
      keywords: faq.keywords,
    })),
    conversation: request.conversation,
  });
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function extractProviderText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const chatText = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  if (typeof chatText === 'string') return chatText;
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (Array.isArray(payload.output)) {
    return payload.output
      .flatMap((item) => Array.isArray(item && item.content) ? item.content : [])
      .map((item) => item && item.text)
      .filter((item) => typeof item === 'string')
      .join('\n');
  }
  return '';
}

function parseProviderJSON(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw apiError('AI 返回的数据无法验证，本地路由仍可使用。', 503, 'AI_INVALID_RESPONSE');
  }
}

async function requestAIReply(rawRequest, options) {
  const settings = options && typeof options === 'object' ? options : {};
  const env = settings.env || process.env;
  const fetchImpl = settings.fetchImpl || globalThis.fetch;
  const request = normalizeRequest(rawRequest);
  if (!request.question) throw apiError('请提供客户问题。', 400, 'QUESTION_REQUIRED');
  if (!request.knowledgeBase.length) throw apiError('至少需要一张启用的知识卡。', 400, 'KNOWLEDGE_REQUIRED');
  if (!env.AI_API_KEY || !env.AI_MODEL) {
    throw apiError('AI 增强未配置，本地路由仍可正常使用。', 503, 'AI_NOT_CONFIGURED');
  }
  if (typeof fetchImpl !== 'function') {
    throw apiError('AI 增强暂时不可用，请继续使用本地路由。', 503, 'AI_UNAVAILABLE');
  }

  const baseUrl = String(env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  let providerUrl;
  try {
    providerUrl = new URL(`${baseUrl}/chat/completions`);
    if (!['https:', 'http:'].includes(providerUrl.protocol)) throw new Error('unsupported protocol');
  } catch {
    throw apiError('AI 服务地址配置无效。', 503, 'AI_CONFIGURATION_ERROR');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const providerResponse = await fetchImpl(providerUrl.toString(), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.AI_API_KEY}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages: buildMessages(request),
        temperature: 0.2,
        store: false,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!providerResponse.ok) {
      throw apiError('AI 增强暂时不可用，请继续使用本地路由。', 503, 'AI_UPSTREAM_ERROR');
    }
    let providerPayload;
    try {
      providerPayload = await providerResponse.json();
    } catch {
      throw apiError('AI 返回的数据无法验证，本地路由仍可使用。', 503, 'AI_INVALID_RESPONSE');
    }
    const parsed = parseProviderJSON(extractProviderText(providerPayload));
    const reply = Core.sanitizeAIReply(parsed, request.knowledgeBase);
    if (!reply) throw apiError('AI 返回的数据无法验证，本地路由仍可使用。', 503, 'AI_INVALID_RESPONSE');
    return reply;
  } catch (error) {
    if (error && error.status) throw error;
    throw apiError('AI 增强暂时不可用，请继续使用本地路由。', 503, 'AI_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

function publicPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded === '/' || decoded === '/apps/068-customer-support' || decoded === '/apps/068-customer-support/') return 'index.html';
  const prefix = '/apps/068-customer-support/';
  const relative = decoded.startsWith(prefix) ? decoded.slice(prefix.length) : decoded.replace(/^\/+/, '');
  if (PUBLIC_FILES.has(relative)) return relative;
  if (relative.startsWith('assets/') && !relative.includes('..') && !relative.includes('\\')) return relative;
  return null;
}

async function servePublic(request, response, pathname) {
  const relative = publicPath(pathname);
  if (!relative) return false;
  const filename = path.resolve(APP_DIR, relative);
  if (!filename.startsWith(`${APP_DIR}${path.sep}`)) return false;
  try {
    const body = await fs.readFile(filename);
    const extension = path.extname(filename).toLowerCase();
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extension] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
    return true;
  } catch {
    return false;
  }
}

function createRelayServer(options) {
  const settings = options && typeof options === 'object' ? options : {};
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    try {
      if (url.pathname === '/api/reply') {
        if (request.method !== 'POST') {
          sendJSON(response, 405, { error: '只支持 POST 请求。', code: 'METHOD_NOT_ALLOWED' });
          return;
        }
        if (!String(request.headers['content-type'] || '').toLocaleLowerCase().startsWith('application/json')) {
          request.resume();
          sendJSON(response, 415, { error: '请使用 application/json。', code: 'CONTENT_TYPE_REQUIRED' });
          return;
        }
        const body = await readJSONBody(request);
        const reply = await requestAIReply(body, settings);
        sendJSON(response, 200, { source: 'ai', reply });
        return;
      }

      if (!['GET', 'HEAD'].includes(request.method)) {
        sendJSON(response, 405, { error: '不支持该请求方法。', code: 'METHOD_NOT_ALLOWED' });
        return;
      }
      if (await servePublic(request, response, url.pathname)) return;
      sendJSON(response, 404, { error: '未找到资源。', code: 'NOT_FOUND' });
    } catch (error) {
      const status = Number(error && error.status) || 500;
      const code = error && error.code || 'INTERNAL_ERROR';
      const message = status >= 500 && !String(code).startsWith('AI_')
        ? '服务暂时不可用。'
        : error.message;
      sendJSON(response, status, { error: message, code });
    }
  });
}

if (require.main === module) {
  const port = Math.min(65535, Math.max(1, Number(process.env.PORT) || 4173));
  createRelayServer().listen(port, '127.0.0.1', () => {
    console.log(`RELAY/68 listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { createRelayServer, buildMessages, requestAIReply };
