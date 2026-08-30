const dns = require("node:dns").promises;
const net = require("node:net");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

class ProxyPolicyError extends Error {
  constructor(code, statusCode, message) {
    super(message);
    this.name = "ProxyPolicyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function policyError(code, statusCode, message) {
  return new ProxyPolicyError(code, statusCode, message);
}

function normalizeHostname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function parseAllowedHosts(value) {
  const entries = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(entries.map(normalizeHostname).filter(Boolean))];
}

function hostMatchesAllowlist(hostname, allowedHosts) {
  const host = normalizeHostname(hostname);
  return parseAllowedHosts(allowedHosts).some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1);
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === pattern;
  });
}

function parseIpv4(address) {
  const parts = String(address).split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part, index) => !Number.isInteger(part) || part < 0 || part > 255 || String(part) !== parts[index])) {
    return null;
  }
  return octets;
}

function parseIpv6(address) {
  let source = String(address).toLowerCase().split("%")[0];
  if (!source.includes(":")) return null;

  if (source.includes(".")) {
    const lastColon = source.lastIndexOf(":");
    const ipv4 = parseIpv4(source.slice(lastColon + 1));
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    source = `${source.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = source.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  const groups = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;

  const bytes = [];
  groups.forEach((group) => {
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  });
  return bytes;
}

function isPrivateIpv4(octets) {
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(parseIpv4(address));
  if (family !== 6) return true;

  const bytes = parseIpv6(address);
  if (!bytes) return true;

  const isMappedIpv4 = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isMappedIpv4) return isPrivateIpv4(bytes.slice(12));

  const allZero = bytes.every((byte) => byte === 0);
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  const uniqueLocal = (bytes[0] & 0xfe) === 0xfc;
  const linkLocal = bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80;
  const multicast = bytes[0] === 0xff;
  const documentation = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8;
  const teredo = bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00;
  const globalUnicast = (bytes[0] & 0xe0) === 0x20;

  if (allZero || loopback || uniqueLocal || linkLocal || multicast || documentation || teredo || !globalUnicast) {
    return true;
  }

  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return isPrivateIpv4(bytes.slice(2, 6));
  }
  return false;
}

async function validateTarget(rawTarget, options = {}) {
  let url;
  try {
    url = new URL(String(rawTarget || ""));
  } catch {
    throw policyError("INVALID_TARGET", 400, "目标 URL 无效，请填写完整的 http(s) 地址。");
  }

  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw policyError("UNSUPPORTED_PROTOCOL", 400, "目标仅支持 HTTP 或 HTTPS 协议。");
  }
  if (url.username || url.password) {
    throw policyError("TARGET_CREDENTIALS_BLOCKED", 400, "目标 URL 不能包含用户名或密码。");
  }
  url.hash = "";

  const hostname = normalizeHostname(url.hostname);
  const allowedHosts = parseAllowedHosts(options.allowedHosts);
  if (!hostMatchesAllowlist(hostname, allowedHosts)) {
    throw policyError("HOST_NOT_ALLOWED", 403, `目标主机 ${hostname} 不在代理白名单中。`);
  }

  let addresses;
  const literalFamily = net.isIP(hostname);
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    const lookup = options.lookup || dns.lookup;
    try {
      const result = await lookup(hostname, { all: true, verbatim: true });
      addresses = Array.isArray(result) ? result : [result];
    } catch {
      throw policyError("DNS_LOOKUP_FAILED", 502, "无法解析目标主机，请检查地址或网络连接。");
    }
  }

  if (!addresses.length || addresses.some((entry) => !entry || !net.isIP(entry.address))) {
    throw policyError("DNS_LOOKUP_FAILED", 502, "目标主机没有可用的网络地址。");
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw policyError("PRIVATE_TARGET", 403, "目标解析到了本机、私网或保留地址，代理已拒绝连接。");
  }

  const address = addresses.find((entry) => Number(entry.family) === 4) || addresses[0];
  return {
    url,
    hostname,
    address: { address: address.address, family: Number(address.family) || net.isIP(address.address) },
  };
}

function headerEntries(headers) {
  if (!headers) return [];
  if (typeof headers.entries === "function") return [...headers.entries()];
  return Object.entries(headers);
}

function headerValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  return value == null ? "" : String(value);
}

function filterRequestHeaders(headers) {
  const entries = headerEntries(headers);
  const connection = entries.find(([name]) => String(name).toLowerCase() === "connection");
  const connectionTokens = new Set(
    connection ? headerValue(connection[1]).split(",").map((token) => token.trim().toLowerCase()).filter(Boolean) : [],
  );
  const blocked = new Set([
    ...HOP_BY_HOP_HEADERS,
    ...connectionTokens,
    "host",
    "origin",
    "referer",
    "cookie",
    "content-length",
    "forwarded",
    "via",
  ]);
  const filtered = {};

  entries.forEach(([rawName, rawValue]) => {
    const name = String(rawName).toLowerCase();
    if (blocked.has(name) || name.startsWith("x-forwarded-") || name.startsWith("sec-") || name.startsWith("proxy-")) return;
    const value = headerValue(rawValue);
    if (value) filtered[name] = value;
  });
  return filtered;
}

function filterResponseHeaders(headers) {
  const entries = headerEntries(headers);
  const connection = entries.find(([name]) => String(name).toLowerCase() === "connection");
  const connectionTokens = new Set(
    connection ? headerValue(connection[1]).split(",").map((token) => token.trim().toLowerCase()).filter(Boolean) : [],
  );
  const filtered = {};

  entries.forEach(([rawName, rawValue]) => {
    const name = String(rawName).toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(name) ||
      connectionTokens.has(name) ||
      name === "set-cookie" ||
      name === "content-length" ||
      name.startsWith("access-control-")
    ) {
      return;
    }
    const value = headerValue(rawValue);
    if (value) filtered[name] = value;
  });
  return filtered;
}

module.exports = {
  ProxyPolicyError,
  parseAllowedHosts,
  hostMatchesAllowlist,
  isPrivateAddress,
  validateTarget,
  filterRequestHeaders,
  filterResponseHeaders,
};
