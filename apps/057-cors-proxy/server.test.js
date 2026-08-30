const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createServer, loadConfig } = require("./server");

async function startServer(t, overrides = {}) {
  const calls = [];
  const config = {
    host: "127.0.0.1",
    port: 0,
    allowedHosts: ["api.github.com"],
    timeoutMs: 200,
    maxRequestBytes: 64,
    maxResponseBytes: 1024,
    maxRedirects: 2,
    ...overrides.config,
  };
  const proxyRequest =
    overrides.proxyRequest ||
    (async (target, options) => {
      calls.push({ target, options });
      return {
        statusCode: 201,
        statusMessage: "Created",
        headers: {
          "content-type": "application/json",
          "x-upstream": "fixture",
          "set-cookie": "should=be-stripped",
        },
        body: Buffer.from('{"relayed":true}'),
        durationMs: 12.4,
        redirects: 1,
        finalUrl: target,
      };
    });
  const server = createServer({ config, proxyRequest, logger: { info() {}, error() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { origin: `http://127.0.0.1:${port}`, calls };
}

function rawRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

test("loadConfig applies safe defaults and bounded numeric environment values", () => {
  const defaults = loadConfig({});
  assert.equal(defaults.host, "127.0.0.1");
  assert.equal(defaults.port, 4057);
  assert.deepEqual(defaults.allowedHosts, ["api.github.com"]);

  const bounded = loadConfig({
    PORT: "99999",
    PROXY_TIMEOUT_MS: "2",
    PROXY_MAX_REQUEST_BYTES: "999999999",
    PROXY_MAX_REDIRECTS: "40",
  });
  assert.equal(bounded.port, 4057);
  assert.equal(bounded.timeoutMs, 250);
  assert.equal(bounded.maxRequestBytes, 10 * 1024 * 1024);
  assert.equal(bounded.maxRedirects, 10);
});

test("health and config routes expose service state without secrets", async (t) => {
  const fixture = await startServer(t);
  const health = await fetch(`${fixture.origin}/health`);
  const config = await fetch(`${fixture.origin}/config`);

  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: "relay-bench", version: 1 });
  assert.equal(config.status, 200);
  assert.deepEqual(await config.json(), {
    service: "relay-bench",
    version: 1,
    bind: "127.0.0.1",
    port: 0,
    allowedHosts: ["api.github.com"],
    limits: { timeoutMs: 200, maxRequestBytes: 64, maxResponseBytes: 1024, maxRedirects: 2 },
  });
});

test("proxy preflight returns CORS metadata without requiring a target", async (t) => {
  const fixture = await startServer(t);
  const response = await fetch(`${fixture.origin}/proxy`, {
    method: "OPTIONS",
    headers: {
      origin: "https://tool.local",
      "access-control-request-headers": "content-type, x-client-label",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("access-control-allow-methods"), /PATCH/);
  assert.equal(response.headers.get("access-control-allow-headers"), "content-type, x-client-label");
});

test("proxy route rejects missing targets and unsupported methods", async (t) => {
  const fixture = await startServer(t);
  const missing = await fetch(`${fixture.origin}/proxy`);
  const unsupported = await rawRequest(`${fixture.origin}/proxy?url=https%3A%2F%2Fapi.github.com`, { method: "TRACE" });

  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, "TARGET_REQUIRED");
  assert.equal(unsupported.status, 405);
  assert.equal(JSON.parse(unsupported.body).error.code, "METHOD_NOT_ALLOWED");
});

test("proxy route stops oversized request bodies", async (t) => {
  const fixture = await startServer(t, { config: { maxRequestBytes: 8 } });
  const response = await fetch(`${fixture.origin}/proxy?url=${encodeURIComponent("https://api.github.com/repos/demo")}`, {
    method: "POST",
    body: "123456789",
  });

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "REQUEST_BODY_TOO_LARGE");
  assert.equal(fixture.calls.length, 0);
});

test("proxy route forwards request options and decorates the safe response", async (t) => {
  const fixture = await startServer(t);
  const target = "https://api.github.com/repos/jokerlixing/100apps";
  const response = await fetch(`${fixture.origin}/proxy?url=${encodeURIComponent(target)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client-label": "bench" },
    body: '{"ping":true}',
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("access-control-expose-headers").includes("x-relay-duration"), true);
  assert.equal(response.headers.get("access-control-expose-headers").includes("x-upstream"), true);
  assert.equal(response.headers.get("x-upstream"), "fixture");
  assert.equal(response.headers.get("x-relay-duration"), "12.4");
  assert.equal(response.headers.get("x-relay-redirects"), "1");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.deepEqual(await response.json(), { relayed: true });
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].target, target);
  assert.equal(fixture.calls[0].options.method, "POST");
  assert.equal(fixture.calls[0].options.body.toString("utf8"), '{"ping":true}');
  assert.deepEqual(fixture.calls[0].options.allowedHosts, ["api.github.com"]);
});
