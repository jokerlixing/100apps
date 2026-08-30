(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeamTransferCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROTOCOL = "beam50";
  const VERSION = 1;
  const TOKEN_PREFIX = "beam50.v1.";
  const MAX_SESSION_BYTES = 200 * 1024 * 1024;
  const MAX_FILES = 50;
  const CHUNK_SIZE = 32 * 1024;
  const CONTROL_TYPES = new Set(["hello", "file-meta", "file-end", "batch-end", "error"]);

  function assertFiniteNumber(value, label) {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
  }

  function formatBytes(value) {
    assertFiniteNumber(value, "bytes");
    const bytes = Math.max(0, value);
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let amount = bytes;
    let unit = -1;
    do {
      amount /= 1024;
      unit += 1;
    } while (amount >= 1024 && unit < units.length - 1);
    const digits = amount >= 100 ? 0 : amount >= 10 ? 1 : 2;
    return `${amount.toFixed(digits)} ${units[unit]}`;
  }

  function formatRate(bytesPerSecond) {
    assertFiniteNumber(bytesPerSecond, "rate");
    return `${formatBytes(Math.max(0, bytesPerSecond))}/s`;
  }

  function sanitizeFileName(value, fallback) {
    const safeFallback = typeof fallback === "string" && fallback.trim() ? fallback.trim() : "received-file";
    if (typeof value !== "string") return safeFallback;
    const cleaned = value
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/^[. ]+|[. ]+$/g, "")
      .slice(0, 160)
      .replace(/[. ]+$/g, "");
    return cleaned || safeFallback;
  }

  function createFileQueue(files, options) {
    const source = Array.from(files || []);
    const config = options || {};
    const maxFiles = Number.isInteger(config.maxFiles) ? config.maxFiles : MAX_FILES;
    const maxTotalBytes = Number.isFinite(config.maxTotalBytes) ? config.maxTotalBytes : MAX_SESSION_BYTES;
    if (!source.length) throw new Error("请至少选择一个文件");
    if (source.length > maxFiles) throw new Error(`单次最多选择 ${maxFiles} 个文件`);
    let totalBytes = 0;
    const queue = source.map(function (file, index) {
      if (!file || typeof file.name !== "string" || !Number.isFinite(file.size) || file.size < 0) {
        throw new TypeError(`第 ${index + 1} 个文件无效`);
      }
      totalBytes += file.size;
      return {
        id: `file-${index + 1}`,
        file,
        name: sanitizeFileName(file.name, `file-${index + 1}`),
        size: file.size,
        type: typeof file.type === "string" && file.type ? file.type : "application/octet-stream",
        lastModified: Number.isFinite(file.lastModified) ? file.lastModified : 0
      };
    });
    if (totalBytes > maxTotalBytes) {
      throw new Error(`文件总大小不能超过 ${formatBytes(maxTotalBytes)}`);
    }
    return { files: queue, totalBytes };
  }

  function progressPercentage(transferred, total) {
    assertFiniteNumber(transferred, "transferred");
    assertFiniteNumber(total, "total");
    if (total <= 0) return transferred > 0 ? 100 : 0;
    return Math.max(0, Math.min(100, (transferred / total) * 100));
  }

  function chunkCount(size, chunkSize) {
    assertFiniteNumber(size, "size");
    const unit = chunkSize === undefined ? CHUNK_SIZE : chunkSize;
    assertFiniteNumber(unit, "chunkSize");
    if (size < 0 || unit <= 0) throw new RangeError("size and chunkSize must be positive");
    return Math.ceil(size / unit);
  }

  function encodeControl(type, payload) {
    if (!CONTROL_TYPES.has(type)) throw new Error(`不支持的协议消息：${type}`);
    return JSON.stringify(Object.assign({ protocol: PROTOCOL, version: VERSION, type }, payload || {}));
  }

  function decodeControl(value) {
    if (typeof value !== "string") throw new TypeError("协议消息必须是文本");
    let message;
    try {
      message = JSON.parse(value);
    } catch (_) {
      throw new Error("协议消息不是有效 JSON");
    }
    if (!message || message.protocol !== PROTOCOL || message.version !== VERSION) {
      throw new Error("协议版本不匹配");
    }
    if (!CONTROL_TYPES.has(message.type)) throw new Error("未知的协议消息");
    return message;
  }

  function validateHandshake(payload) {
    if (!payload || payload.version !== VERSION) throw new Error("连接文本版本不匹配");
    if (payload.role !== "sender" && payload.role !== "receiver") throw new Error("连接角色无效");
    const description = payload.description;
    if (!description || (description.type !== "offer" && description.type !== "answer") || typeof description.sdp !== "string" || !description.sdp) {
      throw new Error("连接描述无效");
    }
    if (payload.role === "sender" && description.type !== "offer") throw new Error("发送端连接描述应为邀请");
    if (payload.role === "receiver" && description.type !== "answer") throw new Error("接收端连接描述应为回应");
    return {
      version: VERSION,
      role: payload.role,
      description: { type: description.type, sdp: description.sdp }
    };
  }

  function bytesToBase64Url(bytes) {
    const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let binary = "";
    for (let offset = 0; offset < input.length; offset += 8192) {
      binary += String.fromCharCode.apply(null, input.subarray(offset, offset + 8192));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    if (typeof value !== "string" || !value) throw new Error("连接载荷为空");
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    let binary;
    try {
      binary = atob(padded);
    } catch (_) {
      throw new Error("连接载荷编码无效");
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function encodeRawHandshake(payload) {
    const clean = validateHandshake(payload);
    const json = JSON.stringify(clean);
    return `${TOKEN_PREFIX}r.${bytesToBase64Url(new TextEncoder().encode(json))}`;
  }

  function decodeRawHandshake(token) {
    if (typeof token !== "string" || !token.trim().startsWith(`${TOKEN_PREFIX}r.`)) {
      throw new Error("不是 BEAM/50 原始连接文本");
    }
    const encoded = token.trim().slice(`${TOKEN_PREFIX}r.`.length);
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
    } catch (error) {
      if (error && /连接载荷编码/.test(error.message)) throw error;
      throw new Error("连接文本内容损坏");
    }
    return validateHandshake(payload);
  }

  function tokenCodec(token) {
    const value = typeof token === "string" ? token.trim() : "";
    if (value.startsWith(`${TOKEN_PREFIX}r.`)) return "raw";
    if (value.startsWith(`${TOKEN_PREFIX}z.`)) return "gzip";
    return null;
  }

  return Object.freeze({
    PROTOCOL,
    VERSION,
    TOKEN_PREFIX,
    MAX_SESSION_BYTES,
    MAX_FILES,
    CHUNK_SIZE,
    formatBytes,
    formatRate,
    sanitizeFileName,
    createFileQueue,
    progressPercentage,
    chunkCount,
    encodeControl,
    decodeControl,
    validateHandshake,
    bytesToBase64Url,
    base64UrlToBytes,
    encodeRawHandshake,
    decodeRawHandshake,
    tokenCodec
  });
});
