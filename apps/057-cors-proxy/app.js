const STORAGE_KEY = "relay57_request_draft_v1";
const SAMPLE = {
  method: "GET",
  targetUrl: "https://api.github.com/repos/jokerlixing/100apps",
  requestHeaders: JSON.stringify({ Accept: "application/vnd.github+json", "X-Client-Label": "relay-57" }, null, 2),
  requestBody: "",
};

const onStaticHost = location.protocol === "file:" || /\.github\.io$/i.test(location.hostname);
const serviceOrigin = onStaticHost ? "http://127.0.0.1:4057" : location.origin;
const $ = (selector) => document.querySelector(selector);
const ui = {
  form: $("#requestForm"), method: $("#method"), target: $("#targetUrl"), headers: $("#requestHeaders"), body: $("#requestBody"),
  bodyField: $("#bodyField"), bodyHint: $("#bodyHint"), error: $("#formError"), send: $("#sendRequest"), reset: $("#resetSample"),
  route: $("#patchRoute"), routeMessage: $("#routeMessage"), serviceState: $("#retryService"), serviceLamp: $("#serviceLamp"),
  serviceStatus: $("#serviceStatus"), offlineNote: $("#offlineNote"), hostCount: $("#hostCount"), bind: $("#bindValue"),
  allow: $("#allowValue"), timeout: $("#timeoutValue"), responseLimit: $("#responseLimitValue"), requestId: $("#requestId"),
  status: $("#statusMetric"), time: $("#timeMetric"), size: $("#sizeMetric"), output: $("#responseOutput"), monitor: $("#monitor"),
  bodyTab: $("#bodyTab"), headersTab: $("#headersTab"), copy: $("#copyFetch"), toast: $("#toast"),
};

let serviceConfig = null;
let responseBody = "";
let responseHeaders = "";
let activeTab = "body";
let lastSnippet = "";
let toastTimer;
let draftTimer;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toast(message, error = false) {
  ui.toast.textContent = message;
  ui.toast.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.className = "toast"; }, 2400);
}

function setRoute(state, message) {
  ui.route.dataset.state = state;
  ui.routeMessage.textContent = message;
}

function setServiceState(state, label) {
  ui.serviceState.className = `service-state ${state}`;
  ui.serviceStatus.textContent = label;
  ui.offlineNote.hidden = state !== "offline";
  if (state === "offline") setRoute("offline", "本地代理未连接。启动服务后再发送请求。");
}

function updateMethod() {
  const disabled = ui.method.value === "GET" || ui.method.value === "HEAD";
  ui.body.disabled = disabled;
  ui.bodyField.classList.toggle("is-disabled", disabled);
  ui.bodyHint.textContent = disabled ? `${ui.method.value} 不发送正文` : "正文受本地体积限制";
  saveDraftSoon();
}

function currentDraft() {
  return { method: ui.method.value, targetUrl: ui.target.value, requestHeaders: ui.headers.value, requestBody: ui.body.value };
}

function applyDraft(draft) {
  const source = { ...SAMPLE, ...(draft || {}) };
  ui.method.value = source.method;
  ui.target.value = source.targetUrl;
  ui.headers.value = source.requestHeaders;
  ui.body.value = source.requestBody;
  updateMethod();
}

function saveDraftSoon() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentDraft())); } catch {}
  }, 180);
}

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || SAMPLE; } catch { return SAMPLE; }
}

function parseHeaders() {
  let parsed;
  try { parsed = JSON.parse(ui.headers.value || "{}"); } catch { throw new Error("请求头不是有效 JSON，请检查逗号和引号。"); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("请求头必须是 JSON 对象。");
  const headers = {};
  Object.entries(parsed).forEach(([name, value]) => {
    if (!name.trim() || !/^[a-z0-9!#$%&'*+.^_`|~-]+$/i.test(name)) throw new Error(`请求头名称无效：${name || "(空)"}`);
    if (["string", "number", "boolean"].includes(typeof value)) headers[name] = String(value);
    else throw new Error(`请求头 ${name} 的值必须是文字或数字。`);
  });
  return headers;
}

function buildSnippet(target, method, headers, body) {
  const options = { method, headers };
  if (!new Set(["GET", "HEAD"]).has(method) && body) options.body = body;
  return `const target = ${JSON.stringify(target)};\nconst response = await fetch(${JSON.stringify(serviceOrigin + "/proxy?url=")} + encodeURIComponent(target), ${JSON.stringify(options, null, 2)});\nconst data = await response.text();\nconsole.log(response.status, data);`;
}

function showTab(tab) {
  activeTab = tab;
  ui.bodyTab.setAttribute("aria-selected", String(tab === "body"));
  ui.headersTab.setAttribute("aria-selected", String(tab === "headers"));
  ui.output.textContent = tab === "body" ? responseBody : responseHeaders;
}

function readableBody(bytes, contentType) {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (contentType.includes("json")) {
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
  }
  if (contentType.startsWith("text/") || contentType.includes("xml") || contentType.includes("javascript") || !contentType) return text;
  return `[二进制响应：${formatBytes(bytes.byteLength)}]\nContent-Type: ${contentType}`;
}

async function checkService(showToast = false) {
  setServiceState("checking", "正在检测服务");
  try {
    const response = await fetch(`${serviceOrigin}/config`, { cache: "no-store", signal: AbortSignal.timeout(1800) });
    if (!response.ok) throw new Error("config unavailable");
    serviceConfig = await response.json();
    const count = serviceConfig.allowedHosts.length;
    ui.hostCount.textContent = `${count} 条主机规则`;
    ui.bind.textContent = serviceConfig.bind;
    ui.allow.textContent = count ? serviceConfig.allowedHosts.join(", ") : "无目标";
    ui.timeout.textContent = `${(serviceConfig.limits.timeoutMs / 1000).toFixed(1).replace(".0", "")} s`;
    ui.responseLimit.textContent = formatBytes(serviceConfig.limits.maxResponseBytes);
    setServiceState("online", "本地服务已连接");
    setRoute("idle", "跳线待命。填写目标后发出请求。");
    if (showToast) toast("本地代理已连接");
    return true;
  } catch {
    serviceConfig = null;
    setServiceState("offline", "本地服务未连接");
    if (showToast) toast("仍未检测到本地服务", true);
    return false;
  }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const area = document.createElement("textarea");
    area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
    document.body.append(area); area.select(); document.execCommand("copy"); area.remove();
  }
}

async function sendRequest(event) {
  event.preventDefault();
  ui.error.textContent = "";
  let target;
  let headers;
  try {
    target = new URL(ui.target.value.trim());
    if (!new Set(["http:", "https:"]).has(target.protocol)) throw new Error("目标只支持 HTTP 或 HTTPS。");
    headers = parseHeaders();
  } catch (error) {
    ui.error.textContent = error.message || "请求配置无效。";
    setRoute("blocked", "请求未发出：请先修正输入。");
    return;
  }

  const method = ui.method.value;
  const body = new Set(["GET", "HEAD"]).has(method) ? "" : ui.body.value;
  lastSnippet = buildSnippet(target.toString(), method, headers, body);
  ui.copy.disabled = false;
  ui.send.disabled = true;
  ui.send.querySelector("span").textContent = "正在穿过闸门";
  ui.status.className = ""; ui.status.textContent = "…";
  ui.time.textContent = "…"; ui.size.textContent = "…";
  ui.requestId.textContent = "ID CONNECTING";
  ui.monitor.dataset.empty = "true";
  responseBody = "请求已发出，等待远端返回…"; responseHeaders = "等待响应头…"; showTab("body");
  setRoute("sending", `正在连接 ${target.hostname}…`);
  saveDraftSoon();
  const localStart = performance.now();

  try {
    const requestOptions = { method, headers, cache: "no-store" };
    if (body) requestOptions.body = body;
    const response = await fetch(`${serviceOrigin}/proxy?url=${encodeURIComponent(target.toString())}`, requestOptions);
    const bytes = await response.arrayBuffer();
    const duration = response.headers.get("x-relay-duration");
    const relayed = duration !== null;
    const contentType = response.headers.get("content-type") || "";
    responseBody = readableBody(bytes, contentType);
    responseHeaders = [...response.headers.entries()].map(([name, value]) => `${name}: ${value}`).join("\n") || "（没有可见响应头）";
    ui.status.textContent = `${response.status}`;
    ui.status.className = response.ok ? "good" : "bad";
    ui.time.textContent = `${duration || (performance.now() - localStart).toFixed(1)} ms`;
    ui.size.textContent = formatBytes(bytes.byteLength);
    ui.requestId.textContent = `ID ${response.headers.get("x-relay-request-id") || "LOCAL"}`;
    ui.monitor.dataset.empty = "false";
    showTab(activeTab);

    if (relayed) {
      setRoute("success", `${target.hostname} 已返回 HTTP ${response.status}。`);
      toast(`请求返回 ${response.status}`);
    } else {
      let message = `代理拒绝了请求（${response.status}）`;
      try { message = JSON.parse(responseBody).error.message || message; } catch {}
      setRoute("blocked", message);
      toast("请求被策略闸门拒绝", true);
    }
  } catch {
    responseBody = "无法连接本地代理。\n\n请在项目目录运行 node server.js，然后点击页面顶部状态灯重试。";
    responseHeaders = "（服务离线，没有响应头）";
    ui.status.textContent = "OFF"; ui.status.className = "bad";
    ui.time.textContent = `${(performance.now() - localStart).toFixed(1)} ms`; ui.size.textContent = "—";
    ui.requestId.textContent = "ID OFFLINE"; ui.monitor.dataset.empty = "false"; showTab("body");
    setServiceState("offline", "本地服务未连接");
    toast("未连接本地代理", true);
  } finally {
    ui.send.disabled = false;
    ui.send.querySelector("span").textContent = "发送至本地代理";
  }
}

ui.form.addEventListener("submit", sendRequest);
ui.method.addEventListener("change", updateMethod);
[ui.target, ui.headers, ui.body].forEach((control) => control.addEventListener("input", saveDraftSoon));
ui.reset.addEventListener("click", () => { applyDraft(SAMPLE); ui.error.textContent = ""; toast("已恢复 GitHub API 样例"); });
ui.serviceState.addEventListener("click", () => checkService(true));
ui.bodyTab.addEventListener("click", () => showTab("body"));
ui.headersTab.addEventListener("click", () => showTab("headers"));
ui.copy.addEventListener("click", async () => { await copyText(lastSnippet); toast("fetch 示例已复制"); });

applyDraft(loadDraft());
checkService();
