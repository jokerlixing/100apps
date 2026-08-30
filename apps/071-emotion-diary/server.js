'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const Core = require('./emotion-core.js');

const MAX_BODY_BYTES = 48 * 1024;
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const PUBLIC_FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/emotion-core.js': ['emotion-core.js', 'text/javascript; charset=utf-8'],
});

function sendJson(response, status, body) {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(content);
}

function sendText(response, status, text) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(text);
}

function uniqueAllowed(values, allowed, limit) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const text = Core.clampText(value, 20);
    if (!allowed.includes(text) || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function todayKey() {
  return Core.dayKey(new Date());
}

function normalizeInsightRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.records)) return null;
  if (!input.records.length || input.records.length > Core.MAX_AI_RECORDS) return null;
  const includeNotes = input.includeNotes === true;
  const records = [];
  for (const raw of input.records) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const date = String(raw.date || '');
    const mood = Number(raw.mood);
    const energy = Number(raw.energy);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || date > todayKey()) continue;
    const parsedDate = new Date(`${date}T12:00:00.000Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) continue;
    if (!Number.isInteger(mood) || mood < 1 || mood > 5 || !Number.isInteger(energy) || energy < 1 || energy > 5) continue;
    const record = {
      date,
      mood,
      energy,
      emotions: uniqueAllowed(raw.emotions, Core.EMOTIONS, 5),
      factors: uniqueAllowed(raw.factors, Core.FACTORS, 5),
    };
    if (includeNotes && raw.noteExcerpt) record.noteExcerpt = Core.clampText(raw.noteExcerpt, 240);
    records.push(record);
  }
  if (!records.length) return null;
  records.sort((a, b) => a.date.localeCompare(b.date));
  const average = (field) => Math.round((records.reduce((sum, record) => sum + record[field], 0) / records.length) * 10) / 10;
  return {
    version: 1,
    rangeDays: Core.normalizeRange(input.rangeDays),
    includeNotes,
    summary: {
      count: records.length,
      averageMood: average('mood'),
      averageEnergy: average('energy'),
    },
    records,
  };
}

function buildMessages(input) {
  const payload = normalizeInsightRequest(input);
  if (!payload) throw new Error('invalid insight request');
  return [
    {
      role: 'system',
      content: [
        '你是一个克制的中文反思助手，只依据用户主动发送的情绪记录摘要工作。',
        '不得诊断疾病、判断风险等级、提供治疗或药物建议，也不得把同时出现写成因果。',
        '每个观察必须使用样本数量或明确日期范围作为依据；样本少时要直接说明不确定。',
        '只返回 JSON 对象，字段为 observations、questions、actions；每项都是最多 3 条的字符串数组。',
        'observations 描述数据，questions 提供开放式反思问题，actions 只给低风险且具体的小步骤。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify(payload),
    },
  ];
}

function providerEndpoint(baseUrl) {
  const candidate = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/u, '');
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('invalid AI base URL');
  }
  const localHttp = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !localHttp) throw new Error('invalid AI base URL');
  return `${candidate}/chat/completions`;
}

function parseProviderContent(content) {
  if (content && typeof content === 'object') return content;
  if (typeof content !== 'string') throw new Error('invalid provider response');
  const cleaned = content.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('invalid provider response');
  }
}

async function requestAIInsights(input, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!env.AI_API_KEY) throw new Error('AI service is not configured');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');

  const messages = buildMessages(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15_000);
  try {
    const response = await fetchImpl(providerEndpoint(env.AI_BASE_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.AI_MODEL || DEFAULT_MODEL,
        messages,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!response || !response.ok) throw new Error('upstream request failed');
    const data = await response.json().catch(() => null);
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const insights = Core.sanitizeAIInsights(parseProviderContent(content));
    if (!insights) throw new Error('invalid provider response');
    return insights;
  } finally {
    clearTimeout(timeout);
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('body too large');
        error.statusCode = 413;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        const error = new Error('invalid JSON');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function serveStatic(pathname, response) {
  const definition = PUBLIC_FILES[pathname];
  if (!definition) {
    sendText(response, 404, 'Not found');
    return;
  }
  const [filename, contentType] = definition;
  fs.readFile(path.join(__dirname, filename), (error, content) => {
    if (error) {
      sendText(response, 404, 'Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(content);
  });
}

function createEmotionServer(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/api/insights') {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        sendJson(response, 405, { error: '仅支持 POST 请求。' });
        return;
      }
      if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        sendJson(response, 415, { error: '请求必须使用 application/json。' });
        return;
      }
      let input;
      try {
        input = await readJsonBody(request);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.statusCode === 413 ? '请求内容过大。' : '请求 JSON 无效。' });
        return;
      }
      const normalized = normalizeInsightRequest(input);
      if (!normalized) {
        sendJson(response, 400, { error: '请求中没有有效记录。' });
        return;
      }
      if (!env.AI_API_KEY) {
        sendJson(response, 503, { error: 'AI 反思服务尚未配置。' });
        return;
      }
      try {
        const insights = await requestAIInsights(normalized, { env, fetchImpl, timeoutMs: options.timeoutMs });
        sendJson(response, 200, { insights });
      } catch {
        sendJson(response, 503, { error: 'AI 反思服务暂时不可用。' });
      }
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method not allowed');
      return;
    }
    serveStatic(url.pathname, response);
  });
}

module.exports = Object.freeze({
  MAX_BODY_BYTES,
  normalizeInsightRequest,
  buildMessages,
  requestAIInsights,
  createEmotionServer,
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 4171;
  createEmotionServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`TIDE/71 listening on http://127.0.0.1:${port}\n`);
  });
}
