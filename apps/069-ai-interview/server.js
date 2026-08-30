'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  ROLE_LABELS,
  normalizeConfig,
  sanitizeText,
  sanitizeAIQuestions,
  sanitizeAIEvaluation,
} = require('./interview-core');

const MAX_BODY_BYTES = 32 * 1024;
const MAX_PROVIDER_BYTES = 96 * 1024;
const PUBLIC_FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/interview-core.js': ['interview-core.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
});

class PublicError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function securityHeaders(contentType) {
  return {
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  };
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...securityHeaders('application/json; charset=utf-8'),
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new PublicError(413, 'BODY_TOO_LARGE', '请求内容超过 32 KiB 限制。');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (_error) {
    throw new PublicError(400, 'INVALID_JSON', '请求必须是有效 JSON。');
  }
}

function normalizeQuestion(raw, config) {
  const questions = sanitizeAIQuestions({ questions: [raw] }, { ...config, questionCount: 3 });
  if (!questions.length) return null;
  const question = questions[0];
  question.id = sanitizeText(raw?.id, 80) || question.id;
  return question;
}

function normalizePayload(raw) {
  if (!raw || typeof raw !== 'object' || !['plan', 'evaluate'].includes(raw.action)) {
    throw new PublicError(400, 'INVALID_ACTION', 'action 只能是 plan 或 evaluate。');
  }
  const config = normalizeConfig(raw.config);
  if (raw.action === 'plan') return { action: 'plan', config };
  const question = normalizeQuestion(raw.question, config);
  const answer = sanitizeText(raw.answer, 6000);
  if (!question || answer.length < 4) {
    throw new PublicError(400, 'INVALID_EVALUATION_INPUT', '回答评分需要有效题目和完整回答。');
  }
  return { action: 'evaluate', config, question, answer };
}

function buildMessages(rawPayload) {
  const payload = normalizePayload(rawPayload);
  const role = ROLE_LABELS[payload.config.role] || ROLE_LABELS.frontend;
  if (payload.action === 'plan') {
    const system = [
      '你是严谨的中文模拟面试出题教练。只返回 JSON，不要 Markdown。',
      '输出格式：{"questions":[{"prompt":"...","category":"intro|behavioral|role|scenario","hint":"...","keywords":["...","..."]}]}。',
      `必须恰好生成 ${payload.config.questionCount} 题；开场、行为、岗位专业和情境题应符合所选面试类型。`,
      '问题不得询问年龄、婚育、宗教、疾病等与岗位无关的敏感信息。每题只问一个核心问题，keywords 为 2 至 8 个评分关键词。',
    ].join('\n');
    const user = JSON.stringify({
      role,
      level: payload.config.level,
      interviewType: payload.config.type,
      questionCount: payload.config.questionCount,
      focus: payload.config.focus,
      jobDescription: payload.config.jobDescription,
    });
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  const system = [
    '你是证据导向的中文面试教练。只返回 JSON，不要 Markdown。不要推测录用概率、人格或情绪。',
    '输出格式：{"evaluation":{"score":0,"dimensions":{"relevance":0,"structure":0,"evidence":0,"depth":0},"strengths":["..."],"improvements":["..."],"followUp":"...","suggestedOutline":["..."]}}。',
    '所有分数为 0 到 100 的数字。strengths 和 improvements 各 1 至 3 条，只引用回答中可观察的内容；followUp 只追问最明显缺口。',
  ].join('\n');
  const user = JSON.stringify({
    role,
    level: payload.config.level,
    focus: payload.config.focus,
    jobDescription: payload.config.jobDescription,
    question: payload.question.prompt,
    keywords: payload.question.keywords,
    answer: payload.answer,
  });
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function providerUrl(env) {
  const base = String(env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(`${base}/chat/completions`);
  } catch (_error) {
    throw new Error('invalid provider url');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid provider protocol');
  return parsed.toString();
}

function parseProviderJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!cleaned || Buffer.byteLength(cleaned) > MAX_PROVIDER_BYTES) throw new Error('invalid provider content');
  return JSON.parse(cleaned);
}

async function requestAICoaching(rawPayload, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!env.AI_API_KEY || !env.AI_MODEL) {
    throw new PublicError(503, 'AI_NOT_CONFIGURED', 'AI 教练未配置，本地面试仍可正常使用。');
  }
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const payload = normalizePayload(rawPayload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let response;
  try {
    response = await fetchImpl(providerUrl(env), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.AI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages: buildMessages(payload),
        temperature: payload.action === 'plan' ? 0.55 : 0.2,
        response_format: { type: 'json_object' },
        store: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response || !response.ok) throw new Error('provider request failed');
  const outerText = await response.text();
  if (Buffer.byteLength(outerText) > MAX_PROVIDER_BYTES) throw new Error('provider response too large');
  const outer = JSON.parse(outerText);
  const content = outer?.choices?.[0]?.message?.content;
  const parsed = parseProviderJson(content);
  if (payload.action === 'plan') {
    const questions = sanitizeAIQuestions(parsed, payload.config);
    if (questions.length < payload.config.questionCount) throw new Error('invalid question plan');
    return { source: 'ai', questions: questions.slice(0, payload.config.questionCount) };
  }
  const evaluation = sanitizeAIEvaluation(parsed);
  if (!evaluation) throw new Error('invalid evaluation');
  return { source: 'ai', evaluation };
}

async function serveStatic(response, pathname, rootDirectory, method) {
  const asset = PUBLIC_FILES[pathname];
  if (!asset) {
    sendJson(response, 404, { error: '未找到此资源。', code: 'NOT_FOUND' });
    return;
  }
  const [fileName, contentType] = asset;
  const body = await fs.readFile(path.join(rootDirectory, fileName));
  response.writeHead(200, {
    ...securityHeaders(contentType),
    'cache-control': fileName === 'index.html' ? 'no-cache' : 'public, max-age=300',
    'content-length': body.length,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function createInterviewServer(options = {}) {
  const rootDirectory = options.rootDirectory || __dirname;
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/api/coach') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          sendJson(response, 405, { error: '该接口只接受 POST。', code: 'METHOD_NOT_ALLOWED' });
          return;
        }
        const contentType = String(request.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) {
          sendJson(response, 415, { error: '请使用 application/json。', code: 'CONTENT_TYPE_REQUIRED' });
          return;
        }
        const rawPayload = await readJson(request);
        const payload = normalizePayload(rawPayload);
        const result = await requestAICoaching(payload, { env, fetchImpl });
        sendJson(response, 200, result);
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
        response.setHeader('allow', 'GET, HEAD');
        sendJson(response, 405, { error: '静态资源只接受 GET 或 HEAD。', code: 'METHOD_NOT_ALLOWED' });
        return;
      }
      await serveStatic(response, url.pathname, rootDirectory, request.method);
    } catch (error) {
      if (error instanceof PublicError) {
        sendJson(response, error.status, { error: error.message, code: error.code });
        return;
      }
      sendJson(response, 503, { error: 'AI 教练暂时不可用，本地反馈已保留。', code: 'AI_UNAVAILABLE' });
    }
  });
}

if (require.main === module) {
  const port = Math.min(65535, Math.max(1, Number(process.env.PORT) || 4173));
  createInterviewServer().listen(port, '127.0.0.1', () => {
    console.log(`PANEL/69 listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createInterviewServer,
  buildMessages,
  requestAICoaching,
};
