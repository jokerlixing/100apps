const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const { proxyRequest: defaultProxyRequest } = require("./proxy-client");
const { filterResponseHeaders, parseAllowedHosts } = require("./proxy-policy");

const SERVICE_NAME = "relay-bench";
const SERVICE_VERSION = 1;
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const STATIC_FILES = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
]);

function boundedInteger(value, fallback, minimum, maximum) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function validPort(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : 4057;
}

function loadConfig(env = process.env) {
  return {
    host: String(env.HOST || "127.0.0.1"),
    port: validPort(env.PORT || 4057),
    allowedHosts: parseAllowedHosts(env.PROXY_ALLOWED_HOSTS || "api.github.com"),
    timeoutMs: boundedInteger(env.PROXY_TIMEOUT_MS, 10_000, 250, 60_000),
    maxRequestBytes: boundedInteger(env.PROXY_MAX_REQUEST_BYTES, 1024 * 1024, 1024, 10 * 1024 * 1024),
    maxResponseBytes: boundedInteger(env.PROXY_MAX_RESPONSE_BYTES, 5 * 1024 * 1024, 1024, 50 * 1024 * 1024),
    maxRedirects: boundedInteger(env.PROXY_MAX_REDIRECTS, 3, 0, 10),
  };
}

function requestId() {
  return crypto.randomBytes(4).toString("hex");
}

function commonSecurityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "cross-origin",
  };
}

function requestedCorsHeaders(request) {
  const requested = String(request.headers["access-control-request-headers"] || "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter((header) => /^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(header));
  return requested.length ? requested.join(", ") : "content-type, authorization, x-client-label";
}

function corsHeaders(request) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
    "access-control-allow-headers": requestedCorsHeaders(request),
    "access-control-expose-headers": "content-type, content-length, x-relay-request-id, x-relay-duration, x-relay-redirects",
    "access-control-max-age": "600",
    vary: "Access-Control-Request-Headers",
  };
}

function sendJson(response, statusCode, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    ...commonSecurityHeaders(),
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.length),
    "cache-control": "no-store",
    ...headers,
  });
  response.end(body);
}

function serviceError(code, statusCode, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function readBody(request, limit) {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    request.resume();
    return Promise.reject(serviceError("REQUEST_BODY_TOO_LARGE", 413, `请求体超过 ${limit} 字节限制。`));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;

    request.on("data", (chunk) => {
      if (finished) return;
      size += chunk.length;
      if (size > limit) {
        finished = true;
        request.resume();
        reject(serviceError("REQUEST_BODY_TOO_LARGE", 413, `请求体超过 ${limit} 字节限制。`));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (finished) return;
      finished = true;
      resolve(Buffer.concat(chunks));
    });
    request.on("aborted", () => {
      if (finished) return;
      finished = true;
      reject(serviceError("REQUEST_ABORTED", 400, "请求体读取完成前连接已断开。"));
    });
    request.on("error", () => {
      if (finished) return;
      finished = true;
      reject(serviceError("REQUEST_READ_FAILED", 400, "无法读取请求体。"));
    });
  });
}

function publicConfig(config) {
  return {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    bind: config.host,
    port: config.port,
    allowedHosts: config.allowedHosts,
    limits: {
      timeoutMs: config.timeoutMs,
      maxRequestBytes: config.maxRequestBytes,
      maxResponseBytes: config.maxResponseBytes,
      maxRedirects: config.maxRedirects,
    },
  };
}

function safeError(error) {
  const statusCode = Number(error && error.statusCode);
  return {
    code: error && typeof error.code === "string" ? error.code : "INTERNAL_ERROR",
    statusCode: Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500,
    message: error && typeof error.message === "string" ? error.message : "服务处理请求时发生错误。",
  };
}

function serveStatic(request, response, pathname) {
  const descriptor = STATIC_FILES.get(pathname);
  if (!descriptor || (request.method !== "GET" && request.method !== "HEAD")) return false;
  const filePath = path.join(__dirname, descriptor.file);
  let body;
  try {
    body = fs.readFileSync(filePath);
  } catch {
    sendJson(response, 404, { error: { code: "STATIC_NOT_FOUND", message: "界面文件尚未生成。" } });
    return true;
  }
  response.writeHead(200, {
    ...commonSecurityHeaders(),
    "content-type": descriptor.type,
    "content-length": String(body.length),
    "cache-control": "no-cache",
    "content-security-policy": "default-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:*; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(request.method === "HEAD" ? undefined : body);
  return true;
}

function createServer(options = {}) {
  const config = { ...loadConfig({}), ...(options.config || {}) };
  config.allowedHosts = parseAllowedHosts(config.allowedHosts);
  const proxyRequest = options.proxyRequest || defaultProxyRequest;
  const logger = options.logger || console;

  return http.createServer(async (request, response) => {
    const id = requestId();
    const startedAt = process.hrtime.bigint();
    let route;
    try {
      route = new URL(request.url || "/", "http://relay.local");
    } catch {
      sendJson(response, 400, { error: { code: "INVALID_REQUEST_URL", message: "请求路径无效。", requestId: id } });
      return;
    }

    if (route.pathname === "/health" && request.method === "GET") {
      sendJson(response, 200, { ok: true, service: SERVICE_NAME, version: SERVICE_VERSION });
      return;
    }
    if (route.pathname === "/config" && request.method === "GET") {
      sendJson(response, 200, publicConfig(config));
      return;
    }
    if (route.pathname !== "/proxy") {
      if (serveStatic(request, response, route.pathname)) return;
      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "没有这个服务路径。", requestId: id } });
      return;
    }

    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      response.writeHead(204, { ...commonSecurityHeaders(), ...cors, "cache-control": "no-store" });
      response.end();
      return;
    }

    let target = "";
    try {
      if (!ALLOWED_METHODS.has(request.method || "")) {
        throw serviceError("METHOD_NOT_ALLOWED", 405, `不支持 ${request.method || "UNKNOWN"} 方法。`);
      }
      target = route.searchParams.get("url") || "";
      if (!target) throw serviceError("TARGET_REQUIRED", 400, "缺少目标 URL，请使用 /proxy?url=...。");

      const body = request.method === "GET" || request.method === "HEAD" ? Buffer.alloc(0) : await readBody(request, config.maxRequestBytes);
      const upstream = await proxyRequest(target, {
        method: request.method,
        headers: request.headers,
        body,
        allowedHosts: config.allowedHosts,
        timeoutMs: config.timeoutMs,
        maxResponseBytes: config.maxResponseBytes,
        maxRedirects: config.maxRedirects,
      });
      if (upstream.body.length > config.maxResponseBytes) {
        throw serviceError("UPSTREAM_RESPONSE_TOO_LARGE", 502, `上游响应超过 ${config.maxResponseBytes} 字节限制。`);
      }

      const responseHeaders = filterResponseHeaders(upstream.headers);
      const duration = Number(upstream.durationMs || 0).toFixed(1).replace(/\.0$/, "");
      response.writeHead(upstream.statusCode, {
        ...responseHeaders,
        ...commonSecurityHeaders(),
        ...cors,
        "content-length": String(upstream.body.length),
        "x-relay-request-id": id,
        "x-relay-duration": duration,
        "x-relay-redirects": String(upstream.redirects || 0),
      });
      response.end(request.method === "HEAD" ? undefined : upstream.body);

      const hostname = (() => {
        try {
          return new URL(target).hostname;
        } catch {
          return "invalid";
        }
      })();
      logger.info({ requestId: id, method: request.method, hostname, statusCode: upstream.statusCode, bytes: upstream.body.length, durationMs: duration });
    } catch (error) {
      const safe = safeError(error);
      sendJson(
        response,
        safe.statusCode,
        { error: { code: safe.code, message: safe.message, requestId: id } },
        { ...cors, "x-relay-request-id": id },
      );
      const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.error({ requestId: id, method: request.method, code: safe.code, statusCode: safe.statusCode, durationMs: elapsed.toFixed(1) });
    }
  });
}

if (require.main === module) {
  const config = loadConfig();
  const server = createServer({ config });
  server.listen(config.port, config.host, () => {
    console.log(`RELAY/57 listening on http://${config.host}:${config.port}`);
    console.log(`Allowed hosts: ${config.allowedHosts.join(", ") || "none"}`);
  });
  server.on("error", (error) => {
    console.error(`RELAY/57 failed to start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  createServer,
  loadConfig,
};
