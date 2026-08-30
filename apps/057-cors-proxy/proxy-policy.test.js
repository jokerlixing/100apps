const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ProxyPolicyError,
  parseAllowedHosts,
  hostMatchesAllowlist,
  isPrivateAddress,
  validateTarget,
  filterRequestHeaders,
  filterResponseHeaders,
} = require("./proxy-policy");

test("parseAllowedHosts normalizes and deduplicates patterns", () => {
  assert.deepEqual(
    parseAllowedHosts(" API.GitHub.com, *.Example.com,api.github.com "),
    ["api.github.com", "*.example.com"],
  );
});

test("hostMatchesAllowlist distinguishes exact hosts and subdomain patterns", () => {
  const allowed = parseAllowedHosts("api.github.com,*.example.com");
  assert.equal(hostMatchesAllowlist("api.github.com", allowed), true);
  assert.equal(hostMatchesAllowlist("cdn.example.com", allowed), true);
  assert.equal(hostMatchesAllowlist("deep.cdn.example.com", allowed), true);
  assert.equal(hostMatchesAllowlist("example.com", allowed), false);
  assert.equal(hostMatchesAllowlist("notexample.com", allowed), false);
  assert.equal(hostMatchesAllowlist("evil.github.com", allowed), false);
  assert.equal(hostMatchesAllowlist("anything.invalid", ["*"]), true);
});

test("isPrivateAddress rejects non-public IPv4 ranges", () => {
  const privateAddresses = [
    "0.0.0.0",
    "10.20.30.40",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.2.3",
    "172.16.8.9",
    "172.31.255.255",
    "192.168.1.2",
    "192.0.2.10",
    "198.18.0.1",
    "198.51.100.8",
    "203.0.113.9",
    "224.0.0.1",
  ];

  privateAddresses.forEach((address) => {
    assert.equal(isPrivateAddress(address), true, address);
  });
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("1.1.1.1"), false);
});

test("isPrivateAddress rejects local and special IPv6 ranges", () => {
  ["::", "::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1"].forEach(
    (address) => assert.equal(isPrivateAddress(address), true, address),
  );
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("validateTarget accepts an allowlisted public HTTP target", async () => {
  const result = await validateTarget("https://api.github.com/repos/octocat/Hello-World", {
    allowedHosts: ["api.github.com"],
    lookup: async () => [{ address: "140.82.121.5", family: 4 }],
  });

  assert.equal(result.url.hostname, "api.github.com");
  assert.deepEqual(result.address, { address: "140.82.121.5", family: 4 });
});

test("validateTarget rejects unsupported schemes, credentials and unlisted hosts", async () => {
  const lookup = async () => [{ address: "8.8.8.8", family: 4 }];

  await assert.rejects(
    validateTarget("file:///etc/passwd", { allowedHosts: ["*"], lookup }),
    (error) => error instanceof ProxyPolicyError && error.code === "UNSUPPORTED_PROTOCOL",
  );
  await assert.rejects(
    validateTarget("https://user:secret@example.com/data", { allowedHosts: ["*"], lookup }),
    (error) => error.code === "TARGET_CREDENTIALS_BLOCKED",
  );
  await assert.rejects(
    validateTarget("https://example.com/data", { allowedHosts: ["api.github.com"], lookup }),
    (error) => error.code === "HOST_NOT_ALLOWED" && error.statusCode === 403,
  );
});

test("validateTarget rejects literal and DNS-resolved private targets", async () => {
  await assert.rejects(
    validateTarget("http://127.0.0.1:8080/admin", { allowedHosts: ["*"] }),
    (error) => error.code === "PRIVATE_TARGET",
  );
  await assert.rejects(
    validateTarget("https://mixed.example.com", {
      allowedHosts: ["*.example.com"],
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.4", family: 4 },
      ],
    }),
    (error) => error.code === "PRIVATE_TARGET",
  );
});

test("validateTarget returns a stable DNS failure", async () => {
  await assert.rejects(
    validateTarget("https://missing.example.com", {
      allowedHosts: ["*.example.com"],
      lookup: async () => {
        throw new Error("ENOTFOUND details");
      },
    }),
    (error) => error.code === "DNS_LOOKUP_FAILED" && !error.message.includes("ENOTFOUND"),
  );
});

test("filterRequestHeaders strips browser identity, cookies and hop-by-hop headers", () => {
  const filtered = filterRequestHeaders({
    accept: "application/json",
    authorization: "Bearer demo",
    connection: "keep-alive, x-remove-me",
    "x-remove-me": "secret",
    host: "localhost:4057",
    origin: "https://local.test",
    referer: "https://local.test/page",
    cookie: "session=secret",
    "content-length": "400",
    "sec-fetch-site": "same-origin",
    "x-client-label": "relay-bench",
  });

  assert.deepEqual(filtered, {
    accept: "application/json",
    authorization: "Bearer demo",
    "x-client-label": "relay-bench",
  });
});

test("filterResponseHeaders strips cookies, CORS and hop-by-hop metadata", () => {
  const filtered = filterResponseHeaders({
    "content-type": "application/json",
    "content-length": "99",
    connection: "close",
    "set-cookie": ["session=secret"],
    "access-control-allow-origin": "https://upstream.test",
    etag: '"demo"',
  });

  assert.deepEqual(filtered, {
    "content-type": "application/json",
    etag: '"demo"',
  });
});
