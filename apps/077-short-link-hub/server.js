"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const core = require("./route-core.js");

const APP_DIR = __dirname;
const DEFAULT_STORE = path.join(APP_DIR, "data", "links.json");
const BODY_LIMIT = 32 * 1024;
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/route-core.js", ["route-core.js", "text/javascript; charset=utf-8"]],
  ["/README.md", ["README.md", "text/markdown; charset=utf-8"]],
]);

function securityHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  };
}

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...securityHeaders(),
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(body);
}

function sendText(response, status, message) {
  const body = String(message);
  response.writeHead(status, {
    ...securityHeaders("text/plain; charset=utf-8"),
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        settled = true;
        const error = new Error("请求内容不能超过 32 KiB");
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      if (size === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        const error = new Error("请求内容不是有效 JSON");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

class LinkStore {
  constructor({ storePath = DEFAULT_STORE, now = Date.now, random = Math.random } = {}) {
    this.storePath = storePath;
    this.now = now;
    this.random = random;
    this.workspace = null;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    if (this.workspace) return this.workspace;
    try {
      const parsed = JSON.parse(await fsp.readFile(this.storePath, "utf8"));
      const normalized = core.normalizeWorkspace(parsed);
      this.workspace = normalized.links.length ? normalized : core.seedWorkspace(this.now());
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      this.workspace = core.seedWorkspace(this.now());
    }
    return this.workspace;
  }

  async persist() {
    const snapshot = JSON.stringify(this.workspace, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await fsp.mkdir(path.dirname(this.storePath), { recursive: true });
      const temporary = `${this.storePath}.${process.pid}.tmp`;
      await fsp.writeFile(temporary, snapshot, { encoding: "utf8", mode: 0o600 });
      await fsp.rename(temporary, this.storePath);
    });
    return this.writeQueue;
  }

  async list() {
    const workspace = await this.load();
    return workspace.links;
  }

  async create(input) {
    const workspace = await this.load();
    const link = core.createLink(input, workspace.links, { now: this.now, random: this.random });
    workspace.links.unshift(link);
    await this.persist();
    return link;
  }

  async update(id, changes) {
    const workspace = await this.load();
    const link = workspace.links.find((item) => item.id === id);
    if (!link) {
      const error = new Error("路线不存在");
      error.statusCode = 404;
      throw error;
    }
    if (Object.hasOwn(changes, "active")) {
      if (typeof changes.active !== "boolean") throw new Error("active 必须是布尔值");
      link.active = changes.active;
    }
    if (Object.hasOwn(changes, "target")) link.target = core.normalizeUrl(changes.target);
    if (Object.hasOwn(changes, "label")) link.label = core.cleanText(changes.label, 60) || new URL(link.target).hostname;
    if (Object.hasOwn(changes, "campaign")) link.campaign = core.cleanText(changes.campaign, 40) || "日常入口";
    if (Object.hasOwn(changes, "slug")) {
      const slug = core.validateSlug(changes.slug);
      if (workspace.links.some((item) => item.id !== id && item.slug === slug)) throw new Error("这个别名已被占用");
      link.slug = slug;
    }
    await this.persist();
    return link;
  }

  async remove(id) {
    const workspace = await this.load();
    const index = workspace.links.findIndex((item) => item.id === id);
    if (index < 0) {
      const error = new Error("路线不存在");
      error.statusCode = 404;
      throw error;
    }
    const [removed] = workspace.links.splice(index, 1);
    await this.persist();
    return removed;
  }

  async record(slug, visit) {
    const link = await this.resolve(slug);
    Object.assign(link, core.recordVisit(link, visit, this.now));
    await this.persist();
    return link;
  }

  async resolve(slug) {
    const workspace = await this.load();
    const link = workspace.links.find((item) => item.slug === slug);
    if (!link) {
      const error = new Error("短链不存在");
      error.statusCode = 404;
      throw error;
    }
    if (!link.active) {
      const error = new Error("这条路线已暂停");
      error.statusCode = 410;
      throw error;
    }
    return link;
  }

  async reset() {
    this.workspace = core.seedWorkspace(this.now());
    await this.persist();
    return this.workspace.links;
  }
}

function createServer(options = {}) {
  const store = options.store || new LinkStore(options);

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const method = request.method || "GET";

    try {
      if (url.pathname === "/api/health" && method === "GET") {
        return sendJson(response, 200, { ok: true, app: "route-77", storage: "json-file" });
      }

      if (url.pathname === "/api/links" && method === "GET") {
        return sendJson(response, 200, { links: await store.list() });
      }

      if (url.pathname === "/api/links" && method === "POST") {
        const link = await store.create(await readJsonBody(request));
        return sendJson(response, 201, { link }, { Location: `/api/links/${encodeURIComponent(link.id)}` });
      }

      if (url.pathname === "/api/reset" && method === "POST") {
        await readJsonBody(request);
        return sendJson(response, 200, { links: await store.reset() });
      }

      const apiMatch = url.pathname.match(/^\/api\/links\/([^/]+)$/);
      if (apiMatch && method === "PATCH") {
        const link = await store.update(decodeURIComponent(apiMatch[1]), await readJsonBody(request));
        return sendJson(response, 200, { link });
      }
      if (apiMatch && method === "DELETE") {
        await store.remove(decodeURIComponent(apiMatch[1]));
        response.writeHead(204, { ...securityHeaders(), "Cache-Control": "no-store" });
        return response.end();
      }

      const redirectMatch = url.pathname.match(/^\/r\/([a-z0-9-]{3,32})$/);
      if (redirectMatch && ["GET", "HEAD"].includes(method)) {
        const link = method === "HEAD"
          ? await store.resolve(redirectMatch[1])
          : await store.record(redirectMatch[1], {
            source: core.classifySource({ source: url.searchParams.get("src") || "", referer: request.headers.referer || "" }),
            device: core.classifyDevice(request.headers["user-agent"] || ""),
          });
        response.writeHead(302, {
          ...securityHeaders("text/plain; charset=utf-8"),
          Location: link.target,
          "Cache-Control": "no-store",
        });
        return response.end(method === "HEAD" ? undefined : "Redirecting");
      }

      if (STATIC_FILES.has(url.pathname) && ["GET", "HEAD"].includes(method)) {
        const [filename, contentType] = STATIC_FILES.get(url.pathname);
        const filePath = path.join(APP_DIR, filename);
        const stat = await fsp.stat(filePath);
        response.writeHead(200, {
          ...securityHeaders(contentType),
          "Cache-Control": filename === "index.html" ? "no-cache" : "public, max-age=300",
          "Content-Length": stat.size,
        });
        if (method === "HEAD") return response.end();
        return fs.createReadStream(filePath).pipe(response);
      }

      if (url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "API 路径不存在" });
      return sendText(response, 404, "Route not found");
    } catch (error) {
      const status = error.statusCode || (/占用|必须|地址|别名|保留|字符/.test(error.message) ? 400 : 500);
      return sendJson(response, status, { error: status === 500 ? "服务暂时无法处理请求" : error.message });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4177);
  const storePath = process.env.ROUTE_STORE_PATH || DEFAULT_STORE;
  const server = createServer({ storePath });
  server.listen(port, "127.0.0.1", () => {
    console.log(`ROUTE/77 running at http://127.0.0.1:${port}`);
    console.log(`Data store: ${storePath}`);
  });
}

module.exports = { BODY_LIMIT, LinkStore, createServer, securityHeaders };
