const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const {
  ProxyPolicyError,
  validateTarget,
  filterRequestHeaders,
  filterResponseHeaders,
} = require("./proxy-policy");

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

class ProxyClientError extends Error {
  constructor(code, statusCode, message) {
    super(message);
    this.name = "ProxyClientError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function clientError(code, statusCode, message) {
  return new ProxyClientError(code, statusCode, message);
}

function requestOnce(validation, options) {
  const target = validation.url;
  const transport = target.protocol === "https:" ? https : http;
  const body = options.body && options.body.length ? options.body : null;
  const headers = filterRequestHeaders(options.headers);
  headers.host = target.host;
  headers.connection = "close";
  if (body) headers["content-length"] = String(body.length);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;

    const finishWithError = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = transport.request(
      {
        protocol: target.protocol,
        hostname: validation.address.address,
        family: validation.address.family,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: options.method,
        headers,
        servername: target.protocol === "https:" && !net.isIP(validation.hostname) ? validation.hostname : undefined,
        rejectUnauthorized: true,
      },
      (response) => {
        const chunks = [];
        let received = 0;

        response.on("data", (chunk) => {
          if (settled) return;
          received += chunk.length;
          if (received > options.maxResponseBytes) {
            finishWithError(
              clientError(
                "UPSTREAM_RESPONSE_TOO_LARGE",
                502,
                `上游响应超过 ${options.maxResponseBytes} 字节限制。`,
              ),
            );
            response.destroy();
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });

        response.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            statusCode: response.statusCode || 502,
            statusMessage: response.statusMessage || "",
            headers: filterResponseHeaders(response.headers),
            body: Buffer.concat(chunks),
          });
        });

        response.on("aborted", () => {
          finishWithError(clientError("UPSTREAM_ABORTED", 502, "上游在响应完成前断开了连接。"));
        });
      },
    );

    request.setTimeout(options.timeoutMs, () => {
      timedOut = true;
      request.destroy();
    });

    request.on("error", () => {
      if (timedOut) {
        finishWithError(clientError("UPSTREAM_TIMEOUT", 504, `上游在 ${options.timeoutMs} ms 内没有完成响应。`));
      } else {
        finishWithError(clientError("UPSTREAM_CONNECTION_FAILED", 502, "无法连接上游服务，请检查目标状态。"));
      }
    });

    if (body && options.method !== "GET" && options.method !== "HEAD") request.write(body);
    request.end();
  });
}

function redirectedMethod(statusCode, method) {
  if (statusCode === 303) return "GET";
  if ((statusCode === 301 || statusCode === 302) && method === "POST") return "GET";
  return method;
}

async function proxyRequest(rawTarget, options = {}) {
  const startedAt = process.hrtime.bigint();
  const method = String(options.method || "GET").toUpperCase();
  const maxRedirects = options.maxRedirects ?? 3;
  const requestOptions = {
    timeoutMs: options.timeoutMs ?? 10_000,
    maxResponseBytes: options.maxResponseBytes ?? 5 * 1024 * 1024,
  };
  const validator = options.validateTarget || validateTarget;
  const initialHeaders = filterRequestHeaders(options.headers);
  const initialBody = Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body || "");

  async function run(target, activeMethod, activeBody, redirects, previousHostname, activeHeaders) {
    const validation = await validator(target, {
      allowedHosts: options.allowedHosts,
      lookup: options.lookup,
    });
    const headers = { ...activeHeaders };
    if (previousHostname && previousHostname !== validation.hostname) delete headers.authorization;

    const response = await requestOnce(validation, {
      ...requestOptions,
      method: activeMethod,
      headers,
      body: activeBody,
    });

    const location = response.headers.location;
    if (!REDIRECT_CODES.has(response.statusCode) || !location) {
      return {
        ...response,
        finalUrl: validation.url.toString(),
        redirects,
      };
    }
    if (redirects >= maxRedirects) {
      throw clientError("TOO_MANY_REDIRECTS", 502, `上游跳转超过 ${maxRedirects} 次限制。`);
    }

    const nextMethod = redirectedMethod(response.statusCode, activeMethod);
    const nextBody = nextMethod === "GET" || nextMethod === "HEAD" ? Buffer.alloc(0) : activeBody;
    return run(
      new URL(location, validation.url).toString(),
      nextMethod,
      nextBody,
      redirects + 1,
      validation.hostname,
      headers,
    );
  }

  try {
    const response = await run(rawTarget, method, initialBody, 0, null, initialHeaders);
    response.durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    return response;
  } catch (error) {
    if (error instanceof ProxyClientError || error instanceof ProxyPolicyError) throw error;
    throw clientError("UPSTREAM_FAILURE", 502, "代理请求失败，请检查目标和网络状态。");
  }
}

module.exports = {
  ProxyClientError,
  proxyRequest,
};
