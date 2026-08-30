const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { ProxyClientError, proxyRequest } = require("./proxy-client");

async function startFixture(t) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://fixture.test");
    if (url.pathname === "/redirect") {
      response.writeHead(302, { location: "/final" });
      response.end();
      return;
    }
    if (url.pathname === "/final") {
      response.writeHead(200, { "content-type": "text/plain", "x-finish": "yes" });
      response.end("redirect complete");
      return;
    }
    if (url.pathname === "/slow") {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("too late");
      }, 100);
      return;
    }
    if (url.pathname === "/large") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("x".repeat(256));
      return;
    }

    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const result = {
        method: request.method,
        body: Buffer.concat(chunks).toString("utf8"),
        host: request.headers.host,
        label: request.headers["x-client-label"],
        cookie: request.headers.cookie || null,
      };
      response.writeHead(201, {
        "content-type": "application/json",
        "x-upstream": "fixture",
        "set-cookie": "session=do-not-forward",
        "access-control-allow-origin": "https://wrong.example",
      });
      response.end(JSON.stringify(result));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { port, origin: `http://fixture.test:${port}` };
}

function validatorFor(port) {
  return async (rawTarget) => ({
    url: new URL(rawTarget),
    hostname: "fixture.test",
    address: { address: "127.0.0.1", family: 4 },
    port,
  });
}

test("proxyRequest forwards the method, bounded body and safe request headers", async (t) => {
  const fixture = await startFixture(t);
  const response = await proxyRequest(`${fixture.origin}/echo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-client-label": "relay-test",
      cookie: "private=1",
    },
    body: Buffer.from('{"hello":"relay"}'),
    validateTarget: validatorFor(fixture.port),
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.headers["set-cookie"], undefined);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.equal(response.headers["x-upstream"], "fixture");
  assert.deepEqual(JSON.parse(response.body.toString("utf8")), {
    method: "POST",
    body: '{"hello":"relay"}',
    host: `fixture.test:${fixture.port}`,
    label: "relay-test",
    cookie: null,
  });
});

test("proxyRequest follows and reports a relative redirect", async (t) => {
  const fixture = await startFixture(t);
  const response = await proxyRequest(`${fixture.origin}/redirect`, {
    validateTarget: validatorFor(fixture.port),
    maxRedirects: 2,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.toString("utf8"), "redirect complete");
  assert.equal(response.redirects, 1);
  assert.equal(response.finalUrl, `${fixture.origin}/final`);
});

test("proxyRequest returns a stable timeout error", async (t) => {
  const fixture = await startFixture(t);

  await assert.rejects(
    proxyRequest(`${fixture.origin}/slow`, {
      validateTarget: validatorFor(fixture.port),
      timeoutMs: 20,
    }),
    (error) => error instanceof ProxyClientError && error.code === "UPSTREAM_TIMEOUT" && error.statusCode === 504,
  );
});

test("proxyRequest stops responses above the configured limit", async (t) => {
  const fixture = await startFixture(t);

  await assert.rejects(
    proxyRequest(`${fixture.origin}/large`, {
      validateTarget: validatorFor(fixture.port),
      maxResponseBytes: 64,
    }),
    (error) => error.code === "UPSTREAM_RESPONSE_TOO_LARGE" && error.statusCode === 502,
  );
});

test("proxyRequest refuses redirects beyond the configured limit", async (t) => {
  const fixture = await startFixture(t);

  await assert.rejects(
    proxyRequest(`${fixture.origin}/redirect`, {
      validateTarget: validatorFor(fixture.port),
      maxRedirects: 0,
    }),
    (error) => error.code === "TOO_MANY_REDIRECTS",
  );
});
