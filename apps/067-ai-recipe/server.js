'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeRequest, sanitizeAIRecipes } = require('./recipe-core');

const APP_DIR = __dirname;
const BODY_LIMIT = 32 * 1024;
const PUBLIC_FILES = new Set(['index.html', 'styles.css', 'app.js', 'recipe-core.js']);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function apiError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sendJSON(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function readJSONBody(request) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(request.headers['content-length'] || 0);
    if (declaredLength > BODY_LIMIT) {
      reject(apiError('请求内容过大。', 413, 'BODY_TOO_LARGE'));
      request.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        reject(apiError('请求内容过大。', 413, 'BODY_TOO_LARGE'));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(apiError('请求不是有效的 JSON。', 400, 'INVALID_JSON'));
      }
    });
    request.on('error', () => reject(apiError('请求读取失败。', 400, 'REQUEST_READ_FAILED')));
  });
}

function buildMessages(rawRequest) {
  const request = normalizeRequest(rawRequest);
  const system = [
    '你是严谨的家庭厨房配餐助手。根据用户已有食材生成 3 道真正可执行且彼此不同的菜谱。',
    '饮食偏好和忌口是硬约束，不得擅自放宽；缺少食材必须如实列出。营养值是每份估算。',
    '只返回 JSON，不要 Markdown 或解释。根对象格式为 {"recipes":[...]}。',
    '每道菜包含 title、cuisine、minutes、difficulty(容易/中等/挑战)、servings、reason、diets、allergens、utensils、ingredients、steps、substitutions、nutrition。',
    'ingredients 每项格式为 {"name":"食材","amount":"用量","required":true,"alternatives":[]}；steps 为 3-8 条明确步骤；nutrition 包含 calories、protein、carbs、fat 数字。',
  ].join('\n');
  const user = JSON.stringify({
    已有食材: request.ingredients,
    用餐人数: request.servings,
    最长用时分钟: request.maxMinutes,
    饮食偏好: request.diet,
    菜系偏好: request.cuisine,
    忌口与过敏原: request.exclude,
    可用厨具: request.utensils,
  });
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function extractProviderText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const chatText = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  if (typeof chatText === 'string') return chatText;
  if (typeof payload.output_text === 'string') return payload.output_text;
  if (Array.isArray(payload.output)) {
    return payload.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
      .map((item) => item && item.text)
      .filter((item) => typeof item === 'string')
      .join('\n');
  }
  return '';
}

function parseProviderJSON(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); } catch { throw apiError('AI 返回的数据无法验证。', 503, 'AI_INVALID_RESPONSE'); }
}

async function requestAIRecipes(rawRequest, options) {
  const settings = options && typeof options === 'object' ? options : {};
  const env = settings.env || process.env;
  const fetchImpl = settings.fetchImpl || globalThis.fetch;
  if (!env.AI_API_KEY || !env.AI_MODEL) {
    throw apiError('AI 增强未配置，本地推荐仍可正常使用。', 503, 'AI_NOT_CONFIGURED');
  }
  if (typeof fetchImpl !== 'function') throw apiError('AI 增强暂时不可用，请继续使用本地结果。', 503, 'AI_UNAVAILABLE');

  const request = normalizeRequest(rawRequest);
  if (!request.ingredients.length) throw apiError('至少需要一种食材。', 400, 'INGREDIENTS_REQUIRED');
  const baseUrl = String(env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const providerResponse = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.AI_API_KEY}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages: buildMessages(request),
        temperature: 0.7,
        store: false,
      }),
      signal: controller.signal,
    });
    if (!providerResponse.ok) throw apiError('AI 增强暂时不可用，请继续使用本地结果。', 503, 'AI_UPSTREAM_ERROR');
    let providerPayload;
    try { providerPayload = await providerResponse.json(); } catch { throw apiError('AI 增强暂时不可用，请继续使用本地结果。', 503, 'AI_INVALID_RESPONSE'); }
    const parsed = parseProviderJSON(extractProviderText(providerPayload));
    const recipes = sanitizeAIRecipes(parsed, request);
    if (!recipes.length) throw apiError('AI 增强暂时不可用，请继续使用本地结果。', 503, 'AI_INVALID_RESPONSE');
    return recipes;
  } catch (error) {
    if (error && error.status) throw error;
    throw apiError('AI 增强暂时不可用，请继续使用本地结果。', 503, 'AI_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

function publicPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded === '/' || decoded === '/apps/067-ai-recipe/' || decoded === '/apps/067-ai-recipe') return 'index.html';
  const prefix = '/apps/067-ai-recipe/';
  const relative = decoded.startsWith(prefix) ? decoded.slice(prefix.length) : decoded.replace(/^\/+/, '');
  if (PUBLIC_FILES.has(relative)) return relative;
  if (relative.startsWith('assets/') && !relative.includes('..')) return relative;
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
    if (request.method === 'HEAD') response.end(); else response.end(body);
    return true;
  } catch {
    return false;
  }
}

function createPantryServer(options) {
  const settings = options && typeof options === 'object' ? options : {};
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    try {
      if (url.pathname === '/api/recommend') {
        if (request.method !== 'POST') {
          sendJSON(response, 405, { error: '只支持 POST 请求。', code: 'METHOD_NOT_ALLOWED' });
          return;
        }
        if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
          request.resume();
          sendJSON(response, 415, { error: '请使用 application/json。', code: 'CONTENT_TYPE_REQUIRED' });
          return;
        }
        const body = await readJSONBody(request);
        const recipes = await requestAIRecipes(body, settings);
        sendJSON(response, 200, { source: 'ai', recipes });
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
  createPantryServer().listen(port, '127.0.0.1', () => {
    console.log(`PANTRY/67 listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { createPantryServer, buildMessages, requestAIRecipes };
