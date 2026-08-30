(function () {
  "use strict";

  const core = window.PerformanceCore;
  const HISTORY_KEY = "trace58_history_v1";
  const RUN_TIMEOUT_MS = 90_000;
  const RESOURCE_TYPES = new Set(["document", "script", "stylesheet", "image", "font", "media", "xhr", "fetch"]);

  const samplePayload = {
    id: "https://demo.trace58.dev/",
    analysisUTCTimestamp: "2026-08-30T14:58:00.000Z",
    lighthouseResult: {
      requestedUrl: "https://demo.trace58.dev/",
      finalUrl: "https://demo.trace58.dev/",
      fetchTime: "2026-08-30T14:58:00.000Z",
      lighthouseVersion: "12.8.1",
      configSettings: { formFactor: "mobile" },
      categories: { performance: { score: 0.64 } },
      audits: {
        "first-contentful-paint": { score: 0.78, numericValue: 1820, displayValue: "1.8 s" },
        "largest-contentful-paint": { score: 0.42, numericValue: 3640, displayValue: "3.6 s" },
        "speed-index": { score: 0.61, numericValue: 2980, displayValue: "3.0 s" },
        "total-blocking-time": { score: 0.58, numericValue: 410, displayValue: "410 ms" },
        "cumulative-layout-shift": { score: 0.96, numericValue: 0.07, displayValue: "0.07" },
        "render-blocking-resources": {
          title: "移除阻塞渲染的资源",
          description: "关键 CSS 和同步脚本阻塞了页面首次绘制。",
          score: 0.31,
          displayValue: "预计可节省 1.1 s",
          details: { type: "opportunity", overallSavingsMs: 1120, overallSavingsBytes: 28600 }
        },
        "unused-javascript": {
          title: "减少未使用的 JavaScript",
          description: "拆分首屏暂时不需要的代码，并延后加载低优先级模块。",
          score: 0.45,
          displayValue: "预计可节省 168 KB",
          details: { type: "opportunity", overallSavingsMs: 760, overallSavingsBytes: 172000 }
        },
        "uses-optimized-images": {
          title: "使用新一代图片格式",
          description: "将大图转换为 WebP 或 AVIF，并提供与显示尺寸匹配的资源。",
          score: 0.52,
          displayValue: "预计可节省 246 KB",
          details: { type: "opportunity", overallSavingsMs: 430, overallSavingsBytes: 252000 }
        },
        "network-requests": {
          details: {
            items: [
              { url: "https://demo.trace58.dev/", resourceType: "Document", transferSize: 17800, networkRequestTime: 1, networkEndTime: 1.21, statusCode: 200 },
              { url: "https://demo.trace58.dev/styles.css", resourceType: "Stylesheet", transferSize: 32600, networkRequestTime: 1.08, networkEndTime: 1.38, statusCode: 200 },
              { url: "https://demo.trace58.dev/app.js", resourceType: "Script", transferSize: 238000, networkRequestTime: 1.11, networkEndTime: 1.92, statusCode: 200 },
              { url: "https://demo.trace58.dev/hero.webp", resourceType: "Image", transferSize: 326000, networkRequestTime: 1.28, networkEndTime: 2.36, statusCode: 200 },
              { url: "https://demo.trace58.dev/logo.svg", resourceType: "Image", transferSize: 7200, networkRequestTime: 1.31, networkEndTime: 1.48, statusCode: 200 },
              { url: "https://cdn.trace58.dev/charts.js", resourceType: "Script", transferSize: 173000, networkRequestTime: 1.82, networkEndTime: 2.61, statusCode: 200 },
              { url: "https://demo.trace58.dev/inter.woff2", resourceType: "Font", transferSize: 49800, networkRequestTime: 1.42, networkEndTime: 1.97, statusCode: 200 },
              { url: "https://api.trace58.dev/summary", resourceType: "Fetch", transferSize: 4600, networkRequestTime: 2.03, networkEndTime: 2.78, statusCode: 200 }
            ]
          }
        }
      }
    }
  };

  const dom = {
    form: document.querySelector("#auditForm"),
    input: document.querySelector("#urlInput"),
    urlRail: document.querySelector(".url-rail"),
    urlError: document.querySelector("#urlError"),
    runButton: document.querySelector("#runButton"),
    sampleButton: document.querySelector("#sampleButton"),
    loadingView: document.querySelector("#loadingView"),
    loadingMessage: document.querySelector("#loadingMessage"),
    progressTrack: document.querySelector("#progressTrack"),
    progressFill: document.querySelector("#progressFill"),
    progressValue: document.querySelector("#progressValue"),
    cancelButton: document.querySelector("#cancelButton"),
    errorView: document.querySelector("#errorView"),
    errorMessage: document.querySelector("#errorMessage"),
    retryButton: document.querySelector("#retryButton"),
    errorSampleButton: document.querySelector("#errorSampleButton"),
    resultView: document.querySelector("#resultView"),
    emptyView: document.querySelector("#emptyView"),
    reportMode: document.querySelector("#reportMode"),
    reportTime: document.querySelector("#reportTime"),
    reportUrl: document.querySelector("#reportUrl"),
    scoreCard: document.querySelector("#scoreCard"),
    scoreDial: document.querySelector("#scoreDial"),
    scoreValue: document.querySelector("#scoreValue"),
    scoreLabel: document.querySelector("#scoreLabel"),
    scoreGrade: document.querySelector("#scoreGrade"),
    scoreSummary: document.querySelector("#scoreSummary"),
    metricGrid: document.querySelector("#metricGrid"),
    requestCount: document.querySelector("#requestCount"),
    pageWeight: document.querySelector("#pageWeight"),
    traceDuration: document.querySelector("#traceDuration"),
    traceList: document.querySelector("#traceList"),
    opportunityCount: document.querySelector("#opportunityCount"),
    opportunityList: document.querySelector("#opportunityList"),
    historyList: document.querySelector("#historyList"),
    clearHistoryButton: document.querySelector("#clearHistoryButton"),
    liveStatus: document.querySelector("#liveStatus")
  };

  let history = loadHistory();
  let activeController = null;
  let progressTimer = null;
  let progress = 0;
  let cancelledByUser = false;
  let timedOut = false;

  function loadHistory() {
    try {
      return core.normalizeHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"));
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // The report still works when storage is unavailable.
    }
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function announce(message) {
    dom.liveStatus.textContent = "";
    requestAnimationFrame(() => { dom.liveStatus.textContent = message; });
  }

  function setView(name) {
    dom.emptyView.hidden = name !== "empty";
    dom.loadingView.hidden = name !== "loading";
    dom.errorView.hidden = name !== "error";
    dom.resultView.hidden = name !== "result";
  }

  function setFormBusy(busy) {
    dom.runButton.disabled = busy;
    dom.sampleButton.disabled = busy;
    dom.input.disabled = busy;
    dom.form.querySelectorAll("input[name='strategy']").forEach((input) => { input.disabled = busy; });
    dom.runButton.querySelector("span").textContent = busy ? "检测中…" : "开始检测";
  }

  function setInputError(message = "") {
    dom.urlError.textContent = message;
    dom.urlError.hidden = !message;
    dom.urlRail.classList.toggle("has-error", Boolean(message));
    dom.input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function getStrategy() {
    return new FormData(dom.form).get("strategy") === "desktop" ? "desktop" : "mobile";
  }

  function updateProgress(value, message) {
    progress = Math.max(0, Math.min(100, value));
    const rounded = Math.round(progress);
    dom.progressFill.style.width = `${rounded}%`;
    dom.progressValue.textContent = `${String(rounded).padStart(2, "0")}%`;
    dom.progressTrack.setAttribute("aria-valuenow", String(rounded));
    if (message) dom.loadingMessage.textContent = message;
  }

  function startProgress(strategy) {
    stopProgress();
    updateProgress(6, "正在连接 PageSpeed 服务…");
    progressTimer = window.setInterval(() => {
      const step = progress < 30 ? 3.4 : progress < 65 ? 1.7 : progress < 84 ? 0.7 : 0.25;
      const next = Math.min(91, progress + step);
      let message = `正在运行${strategy === "desktop" ? "桌面" : "移动"}网络与 CPU 模拟…`;
      if (next >= 30) message = "正在采集绘制、阻塞与布局指标…";
      if (next >= 60) message = "正在整理网络请求和优化机会…";
      if (next >= 82) message = "审计仍在进行，正在等待最终报告…";
      updateProgress(next, message);
    }, 900);
  }

  function stopProgress() {
    if (progressTimer) window.clearInterval(progressTimer);
    progressTimer = null;
  }

  function describeHttpError(status, detail) {
    if (status === 400) return "PageSpeed 无法读取这个网址。请确认页面可公开访问，并检查地址是否正确。";
    if (status === 403) return "PageSpeed 服务拒绝了这次请求。公共无密钥额度可能暂时不可用。";
    if (status === 429) return "公共检测额度当前繁忙。请稍后重试，或先加载示例报告查看完整界面。";
    if (status >= 500) return "PageSpeed 服务暂时不可用。请稍后重新检测。";
    return detail ? `PageSpeed 返回错误：${detail}` : "PageSpeed 没有返回可用报告。";
  }

  function describeRunError(error) {
    if (cancelledByUser) return "本次检测已取消。你可以修改网址或设备后重新开始。";
    if (timedOut) return "检测超过 90 秒仍未完成。目标页面或 PageSpeed 服务可能正处于繁忙状态。";
    if (error && error.httpStatus) return describeHttpError(error.httpStatus, error.message);
    if (error && error.name === "TypeError") return "无法连接 PageSpeed 服务。请检查网络后重试；也可以先打开示例报告。";
    return error && error.message ? error.message : "检测遇到未知错误，请稍后重试。";
  }

  async function runAudit(url, strategy) {
    cancelledByUser = false;
    timedOut = false;
    activeController = new AbortController();
    setFormBusy(true);
    setView("loading");
    startProgress(strategy);
    announce("性能检测已开始");

    const timeout = window.setTimeout(() => {
      timedOut = true;
      activeController?.abort();
    }, RUN_TIMEOUT_MS);

    try {
      const response = await fetch(core.buildApiUrl(url, strategy), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: activeController.signal,
        referrerPolicy: "no-referrer"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.error?.message || response.statusText || "PageSpeed request failed");
        error.httpStatus = response.status;
        throw error;
      }

      const report = core.parsePageSpeedResult(payload, strategy);
      updateProgress(100, "报告整理完成");
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      addHistory(report);
      renderReport(report, false);
    } catch (error) {
      dom.errorMessage.textContent = describeRunError(error);
      setView("error");
      announce("检测没有完成");
    } finally {
      window.clearTimeout(timeout);
      stopProgress();
      activeController = null;
      setFormBusy(false);
    }
  }

  function addHistory(report) {
    const entry = core.createHistoryEntry(report);
    if (!entry) return;
    history = core.normalizeHistory([entry, ...history], 6);
    saveHistory();
  }

  function formatDate(value) {
    const time = new Date(value);
    if (!Number.isFinite(time.getTime())) return "时间未知";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(time);
  }

  function cleanAuditText(value) {
    return String(value || "")
      .replace(/\[([^\]]+)]\([^\s)]+(?:\s+"[^"]*")?\)/g, "$1")
      .replace(/[`*_#]/g, "")
      .trim();
  }

  function renderMetrics(report) {
    dom.metricGrid.replaceChildren();
    report.metrics.forEach((metric) => {
      const card = createElement("article", `metric-card ${metric.band.key}`);
      card.append(
        createElement("span", "metric-short", metric.shortLabel),
        createElement("strong", "", metric.displayValue),
        createElement("small", "", metric.label),
        createElement("span", "metric-band", metric.band.label)
      );
      dom.metricGrid.append(card);
    });
  }

  function renderTrace(report) {
    dom.requestCount.textContent = String(report.requestCount);
    dom.pageWeight.textContent = core.formatBytes(report.pageWeight);
    dom.traceDuration.textContent = core.formatDuration(report.traceDuration);
    dom.traceList.replaceChildren();

    const selected = report.requests
      .slice()
      .sort((a, b) => b.transferSize - a.transferSize)
      .slice(0, 12)
      .sort((a, b) => a.startMs - b.startMs);

    if (!selected.length) {
      const empty = createElement("li", "trace-empty", "这次报告没有提供可显示的网络请求明细。");
      dom.traceList.append(empty);
      return;
    }

    const total = Math.max(1, report.traceDuration);
    selected.forEach((request) => {
      const rawType = request.resourceType.toLowerCase();
      const safeType = RESOURCE_TYPES.has(rawType) ? rawType : "other";
      const item = createElement("li", `trace-item type-${safeType}`);
      const label = createElement("div", "request-label");
      const type = createElement("span", "request-type", request.resourceType);
      const path = createElement("span", "request-path", request.path || "/");
      path.title = request.url;
      const size = createElement("span", "request-size", core.formatBytes(request.transferSize));
      label.append(type, path, size);

      const lane = createElement("div", "request-lane");
      const bar = createElement("i", "request-bar");
      const left = Math.min(99, Math.max(0, request.startMs / total * 100));
      const width = Math.min(100 - left, Math.max(.8, request.durationMs / total * 100));
      bar.style.setProperty("--left", `${left}%`);
      bar.style.setProperty("--width", `${width}%`);
      bar.title = `${core.formatDuration(request.durationMs)} · ${request.statusCode || "状态未知"}`;
      lane.append(bar);
      item.append(label, lane);
      dom.traceList.append(item);
    });
  }

  function renderOpportunities(report) {
    const items = report.opportunities.slice(0, 5);
    dom.opportunityCount.textContent = String(items.length);
    dom.opportunityList.replaceChildren();
    if (!items.length) {
      dom.opportunityList.append(createElement("li", "opportunity-empty", "这次审计没有发现高优先级性能机会。"));
      return;
    }

    items.forEach((opportunity) => {
      const item = createElement("li", "opportunity-item");
      const copy = createElement("div", "opportunity-copy");
      copy.append(
        createElement("strong", "", opportunity.title),
        createElement("p", "", cleanAuditText(opportunity.description) || opportunity.displayValue || "查看 Lighthouse 报告获取详细建议。")
      );
      let saving = opportunity.savingsMs > 0 ? `省 ${core.formatDuration(opportunity.savingsMs)}` : "";
      if (!saving && opportunity.savingsBytes > 0) saving = `省 ${core.formatBytes(opportunity.savingsBytes)}`;
      if (!saving) saving = opportunity.displayValue || "建议处理";
      item.append(copy, createElement("span", "saving-badge", saving));
      dom.opportunityList.append(item);
    });
  }

  function renderHistory() {
    dom.historyList.replaceChildren();
    dom.clearHistoryButton.disabled = history.length === 0;
    if (!history.length) {
      dom.historyList.append(createElement("p", "history-empty", "完成一次实时检测后，记录会出现在这里。"));
      return;
    }

    history.forEach((entry) => {
      const button = createElement("button", "history-item");
      button.type = "button";
      button.setAttribute("aria-label", `重新检测 ${entry.url}`);
      const band = core.scoreBand(entry.score);
      const score = createElement("span", `history-score ${band.key}`, String(entry.score));
      const copy = createElement("span", "history-copy");
      let host = entry.url;
      try { host = new URL(entry.url).host; } catch { /* Already normalized by the core. */ }
      copy.append(
        createElement("strong", "", host),
        createElement("small", "", `${entry.strategy === "desktop" ? "桌面端" : "移动端"} · ${formatDate(entry.fetchedAt)}`)
      );
      button.append(score, copy, createElement("span", "history-arrow", "→"));
      button.addEventListener("click", () => {
        dom.input.value = entry.url;
        const radio = dom.form.querySelector(`input[name="strategy"][value="${entry.strategy}"]`);
        if (radio) radio.checked = true;
        dom.form.requestSubmit();
      });
      dom.historyList.append(button);
    });
  }

  function renderReport(report, isSample) {
    const deviceLabel = report.strategy === "desktop" ? "DESKTOP" : "MOBILE";
    dom.reportMode.textContent = `${isSample ? "SAMPLE REPORT" : "LIVE REPORT"} / ${deviceLabel}`;
    dom.reportTime.textContent = `${formatDate(report.fetchedAt)} · LIGHTHOUSE ${report.lighthouseVersion || "V5"}`;
    dom.reportUrl.href = report.url;
    dom.reportUrl.textContent = report.url;
    dom.reportUrl.title = report.url;
    dom.resultView.dataset.mode = isSample ? "sample" : "live";

    dom.scoreCard.className = `score-card ${report.band.key}`;
    dom.scoreDial.style.setProperty("--score-angle", `${report.score * 3.6}deg`);
    dom.scoreDial.setAttribute("aria-label", `性能分数 ${report.score}，${report.band.label}`);
    dom.scoreValue.textContent = String(report.score);
    dom.scoreLabel.textContent = report.band.label;
    dom.scoreGrade.textContent = report.band.grade;
    dom.scoreSummary.textContent = isSample ? "示例数据 · 非实时检测结果" : "本次 Lighthouse 实验室性能分数";

    renderMetrics(report);
    renderTrace(report);
    renderOpportunities(report);
    renderHistory();
    setView("result");
    dom.resultView.focus({ preventScroll: true });
    dom.resultView.scrollIntoView({ behavior: "smooth", block: "start" });
    announce(`${isSample ? "示例" : "实时"}性能报告已加载，得分 ${report.score}`);
  }

  function showSample() {
    try {
      const report = core.parsePageSpeedResult(samplePayload, "mobile");
      renderReport(report, true);
    } catch (error) {
      dom.errorMessage.textContent = error.message;
      setView("error");
    }
  }

  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (activeController) return;
    let url;
    try {
      url = core.normalizeUrl(dom.input.value);
      setInputError();
      dom.input.value = url;
    } catch (error) {
      setInputError(error.message);
      dom.input.focus();
      return;
    }
    runAudit(url, getStrategy());
  });

  dom.input.addEventListener("input", () => {
    if (!dom.urlError.hidden) setInputError();
  });

  dom.cancelButton.addEventListener("click", () => {
    cancelledByUser = true;
    activeController?.abort();
  });
  dom.sampleButton.addEventListener("click", showSample);
  dom.errorSampleButton.addEventListener("click", showSample);
  dom.retryButton.addEventListener("click", () => dom.form.requestSubmit());
  dom.clearHistoryButton.addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
    announce("本地检测历史已清空");
  });

  renderHistory();
  setView("empty");
})();
