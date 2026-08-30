(() => {
  "use strict";

  const core = window.RouteCore;
  const STORAGE_KEY = "route77.workspace.v1";
  const API_TIMEOUT = 1100;
  const state = {
    links: [],
    mode: "local",
    selectedId: null,
    filter: "all",
    query: "",
    busy: false,
  };

  const elements = Object.fromEntries([
    "modeLabel", "boundaryCopy", "railRoutes", "railVisits", "railActive",
    "routeForm", "targetInput", "slugInput", "labelInput", "campaignInput", "slugPrefix",
    "formError", "createButton", "ticketStatus", "ticketUrl", "ticketCampaign", "qrCanvas",
    "qrPlaceholder", "downloadQrButton", "exportButton", "resetButton", "searchInput", "routesBody",
    "emptyState", "selectedSlug", "weekTotal", "dayChart", "sourceList", "deviceList",
    "copySelectedButton", "visitSelectedButton", "confirmDialog", "dialogTitle", "dialogCopy",
    "dialogConfirm", "redirectDialog", "redirectCopy", "redirectLink", "redirectCancel", "toast",
  ].map((id) => [id, document.getElementById(id)]));

  let toastTimer;
  let qrReady = false;

  function shortBase() {
    if (state.mode === "server") return `${location.origin}/r/`;
    const page = new URL(location.href);
    page.search = "";
    page.hash = "";
    return `${page.toString()}?go=`;
  }

  function shortUrl(link) {
    return `${shortBase()}${encodeURIComponent(link.slug)}`;
  }

  function showToast(message, type = "success") {
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", type === "error");
    elements.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2300);
  }

  function setBusy(value) {
    state.busy = value;
    elements.createButton.disabled = value;
    elements.createButton.querySelector("span").textContent = value ? "正在接线…" : "生成路线";
  }

  function showFormError(message = "") {
    elements.formError.textContent = message;
    elements.formError.hidden = !message;
  }

  async function fetchJson(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 5000);
    try {
      const response = await fetch(path, {
        ...options,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function loadLocal() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const workspace = core.normalizeWorkspace(JSON.parse(stored));
        if (workspace.links.length) return workspace.links;
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    const seeded = core.seedWorkspace();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded.links;
  }

  function saveLocal() {
    if (state.mode !== "local") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: core.STORAGE_VERSION, links: state.links }));
  }

  async function detectMode() {
    if (new URLSearchParams(location.search).get("offline") === "1") return false;
    try {
      const result = await fetchJson("./api/health", { timeout: API_TIMEOUT });
      return result?.app === "route-77";
    } catch {
      return false;
    }
  }

  async function boot() {
    if (!core) {
      document.body.innerHTML = '<main class="fatal-error">核心脚本未能加载，请刷新页面。</main>';
      return;
    }
    configureQr();
    const serverAvailable = await detectMode();
    state.mode = serverAvailable ? "server" : "local";
    if (serverAvailable) {
      const payload = await fetchJson("./api/links");
      state.links = core.normalizeWorkspace({ links: payload.links }).links;
      elements.modeLabel.textContent = "共享服务在线";
      elements.boundaryCopy.textContent = "短链和访问数据写入本机 Node 服务的数据文件，可供同一服务的访客共享。";
      elements.resetButton.textContent = "恢复服务演示数据";
    } else {
      state.links = loadLocal();
      elements.modeLabel.textContent = "浏览器本地演示";
      elements.boundaryCopy.textContent = "此页面的数据只保存在当前浏览器，不会同步到其他设备。";
    }
    elements.slugPrefix.textContent = state.mode === "server" ? `${location.host}/r/` : "…?go=";
    state.selectedId = state.links.find((link) => link.active)?.id || state.links[0]?.id || null;
    bindEvents();
    renderAll();
    await openIncomingRoute();
  }

  function configureQr() {
    if (typeof window.qrcode !== "function") return;
    if (window.qrcode.stringToBytesFuncs?.["UTF-8"]) {
      window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs["UTF-8"];
    } else if (window.TextEncoder) {
      window.qrcode.stringToBytes = (text) => Array.from(new TextEncoder().encode(text));
    }
    qrReady = true;
  }

  function bindEvents() {
    elements.routeForm.addEventListener("submit", createRoute);
    elements.slugInput.addEventListener("input", () => {
      const normalized = core.normalizeSlug(elements.slugInput.value);
      if (elements.slugInput.value !== normalized) elements.slugInput.value = normalized;
      updateDraftTicket();
    });
    [elements.targetInput, elements.labelInput, elements.campaignInput].forEach((input) => input.addEventListener("input", updateDraftTicket));
    elements.routesBody.addEventListener("click", handleTableAction);
    elements.searchInput.addEventListener("input", () => {
      state.query = elements.searchInput.value.trim().toLocaleLowerCase("zh-CN");
      renderTable();
    });
    document.querySelectorAll(".filter-button").forEach((button) => button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll(".filter-button").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderTable();
    }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && !/input|textarea/i.test(document.activeElement?.tagName)) {
        event.preventDefault();
        elements.searchInput.focus();
      }
    });
    elements.downloadQrButton.addEventListener("click", downloadQr);
    elements.copySelectedButton.addEventListener("click", copySelected);
    elements.visitSelectedButton.addEventListener("click", visitSelected);
    elements.exportButton.addEventListener("click", exportWorkspace);
    elements.resetButton.addEventListener("click", resetWorkspace);
    elements.redirectCancel.addEventListener("click", () => {
      elements.redirectDialog.close();
      const clean = new URL(location.href);
      clean.searchParams.delete("go");
      clean.searchParams.delete("src");
      history.replaceState({}, "", clean);
    });
  }

  async function createRoute(event) {
    event.preventDefault();
    if (state.busy) return;
    showFormError();
    setBusy(true);
    try {
      const input = {
        target: elements.targetInput.value,
        slug: elements.slugInput.value,
        label: elements.labelInput.value,
        campaign: elements.campaignInput.value,
      };
      let created;
      if (state.mode === "server") {
        const payload = await fetchJson("./api/links", { method: "POST", body: JSON.stringify(input) });
        created = core.normalizeLink(payload.link);
      } else {
        created = core.createLink(input, state.links);
      }
      if (!created) throw new Error("服务返回的路线数据无效");
      state.links.unshift(created);
      state.selectedId = created.id;
      saveLocal();
      elements.routeForm.reset();
      renderAll();
      showToast(`已发布 /${created.slug}`);
      document.getElementById("registryTitle").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      showFormError(error.message || "无法创建路线");
      elements.targetInput.focus();
    } finally {
      setBusy(false);
    }
  }

  async function handleTableAction(event) {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;
    const link = state.links.find((item) => item.id === actionButton.dataset.id);
    if (!link) return;
    const action = actionButton.dataset.action;
    if (action === "select") {
      state.selectedId = link.id;
      renderAll();
      document.getElementById("analyticsTitle").scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (action === "copy") {
      await copyText(shortUrl(link));
      showToast(`已复制 /${link.slug}`);
    } else if (action === "toggle") {
      await toggleLink(link);
    } else if (action === "delete") {
      await deleteLink(link);
    }
  }

  async function toggleLink(link) {
    try {
      const active = !link.active;
      if (state.mode === "server") {
        const payload = await fetchJson(`./api/links/${encodeURIComponent(link.id)}`, {
          method: "PATCH", body: JSON.stringify({ active }),
        });
        Object.assign(link, core.normalizeLink(payload.link));
      } else {
        link.active = active;
        saveLocal();
      }
      renderAll();
      showToast(active ? "路线已恢复运行" : "路线已暂停");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function deleteLink(link) {
    const confirmed = await confirmAction("删除这条路线？", `/${link.slug} 及其 ${link.visits.length} 条访问记录会一起删除，操作无法撤销。`, "删除路线");
    if (!confirmed) return;
    try {
      if (state.mode === "server") await fetchJson(`./api/links/${encodeURIComponent(link.id)}`, { method: "DELETE" });
      state.links = state.links.filter((item) => item.id !== link.id);
      if (state.selectedId === link.id) state.selectedId = state.links[0]?.id || null;
      saveLocal();
      renderAll();
      showToast("路线已删除");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function confirmAction(title, copy, label) {
    if (typeof elements.confirmDialog.showModal !== "function") return Promise.resolve(window.confirm(copy));
    elements.dialogTitle.textContent = title;
    elements.dialogCopy.textContent = copy;
    elements.dialogConfirm.textContent = label;
    elements.confirmDialog.showModal();
    return new Promise((resolve) => {
      elements.confirmDialog.addEventListener("close", () => resolve(elements.confirmDialog.returnValue === "confirm"), { once: true });
    });
  }

  async function resetWorkspace() {
    const confirmed = await confirmAction("恢复演示工作区？", "当前路线和访问统计会被四条演示路线替换。请先导出需要保留的数据。", "恢复数据");
    if (!confirmed) return;
    try {
      if (state.mode === "server") {
        const payload = await fetchJson("./api/reset", { method: "POST", body: "{}" });
        state.links = core.normalizeWorkspace({ links: payload.links }).links;
      } else {
        state.links = core.seedWorkspace().links;
        saveLocal();
      }
      state.selectedId = state.links[0]?.id || null;
      renderAll();
      showToast("演示工作区已恢复");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function exportWorkspace() {
    const payload = {
      product: "ROUTE/77",
      mode: state.mode,
      exportedAt: new Date().toISOString(),
      version: core.STORAGE_VERSION,
      links: state.links,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `route-77-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    showToast("工作区 JSON 已导出");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  async function copySelected() {
    const link = selectedLink();
    if (!link) return showToast("先选择一条路线", "error");
    await copyText(shortUrl(link));
    showToast(`已复制 /${link.slug}`);
  }

  async function visitSelected() {
    const link = selectedLink();
    if (!link) return showToast("先选择一条路线", "error");
    if (!link.active) return showToast("这条路线已暂停，请先恢复", "error");
    if (state.mode === "server") {
      window.open(`${shortUrl(link)}?src=route-console`, "_blank", "noopener,noreferrer");
      showToast("已在新窗口测试真实跳转");
      setTimeout(refreshServerLinks, 700);
      return;
    }
    const updated = core.recordVisit(link, { source: "调度台测试", device: core.classifyDevice(navigator.userAgent) });
    Object.assign(link, updated);
    saveLocal();
    renderAll();
    window.open(link.target, "_blank", "noopener,noreferrer");
    showToast("已记录一次本地测试访问");
  }

  async function refreshServerLinks() {
    if (state.mode !== "server") return;
    try {
      const payload = await fetchJson("./api/links");
      state.links = core.normalizeWorkspace({ links: payload.links }).links;
      renderAll();
    } catch { /* the current snapshot remains usable */ }
  }

  function selectedLink() {
    return state.links.find((link) => link.id === state.selectedId) || state.links[0] || null;
  }

  function renderAll() {
    renderMetrics();
    renderTable();
    renderSelected();
  }

  function renderMetrics() {
    const metrics = core.aggregateWorkspace(state.links);
    elements.railRoutes.textContent = metrics.routes.toLocaleString("zh-CN");
    elements.railVisits.textContent = metrics.visits.toLocaleString("zh-CN");
    elements.railActive.textContent = metrics.active.toLocaleString("zh-CN");
  }

  function filteredLinks() {
    return state.links.filter((link) => {
      const matchesState = state.filter === "all" || (state.filter === "active" ? link.active : !link.active);
      const haystack = `${link.label} ${link.slug} ${link.campaign} ${link.target}`.toLocaleLowerCase("zh-CN");
      return matchesState && (!state.query || haystack.includes(state.query));
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]);
  }

  function renderTable() {
    const links = filteredLinks();
    elements.emptyState.hidden = links.length > 0;
    elements.routesBody.innerHTML = links.map((link) => {
      const report = core.aggregateLink(link);
      const selected = link.id === state.selectedId ? "selected" : "";
      return `<tr class="${selected}" data-route-id="${escapeHtml(link.id)}">
        <td><button class="route-name-button" data-action="select" data-id="${escapeHtml(link.id)}" type="button"><strong>${escapeHtml(link.label)}</strong><small>${formatDate(link.createdAt)} 建线</small></button></td>
        <td class="short-link-cell">/${escapeHtml(link.slug)}</td>
        <td><span class="campaign-chip">${escapeHtml(link.campaign)}</span></td>
        <td class="metric-cell">${report.total}</td>
        <td class="metric-cell">${report.last7}</td>
        <td><span class="state-chip ${link.active ? "" : "paused"}">${link.active ? "运行中" : "已暂停"}</span></td>
        <td><div class="row-actions">
          <button class="icon-button" data-action="copy" data-id="${escapeHtml(link.id)}" type="button" title="复制短链" aria-label="复制 ${escapeHtml(link.label)} 的短链">⧉</button>
          <button class="icon-button" data-action="toggle" data-id="${escapeHtml(link.id)}" type="button" title="${link.active ? "暂停" : "恢复"}" aria-label="${link.active ? "暂停" : "恢复"} ${escapeHtml(link.label)}">${link.active ? "Ⅱ" : "▶"}</button>
          <button class="icon-button delete" data-action="delete" data-id="${escapeHtml(link.id)}" type="button" title="删除" aria-label="删除 ${escapeHtml(link.label)}">×</button>
        </div></td>
      </tr>`;
    }).join("");
  }

  function renderSelected() {
    const link = selectedLink();
    if (!link) {
      elements.selectedSlug.textContent = "尚未选择路线";
      elements.weekTotal.textContent = "0";
      elements.dayChart.innerHTML = '<p class="no-data">创建第一条路线后，这里会显示近七日访问。</p>';
      elements.sourceList.innerHTML = '<p class="no-data">暂无来源数据</p>';
      elements.deviceList.innerHTML = '<p class="no-data">暂无设备数据</p>';
      elements.copySelectedButton.disabled = true;
      elements.visitSelectedButton.disabled = true;
      renderTicket(null);
      return;
    }
    elements.copySelectedButton.disabled = false;
    elements.visitSelectedButton.disabled = false;
    elements.selectedSlug.textContent = `/${link.slug}`;
    const report = core.aggregateLink(link);
    elements.weekTotal.textContent = report.last7.toLocaleString("zh-CN");
    const maximum = Math.max(1, ...report.days.map((item) => item.count));
    elements.dayChart.innerHTML = report.days.map((item, index) => `<div class="day-bar ${index === report.days.length - 1 ? "today" : ""}">
      <div class="bar-track"><i class="bar-fill" data-count="${item.count}" style="height:${Math.max(item.count ? 8 : 2, Math.round(item.count / maximum * 100))}%"></i></div>
      <small>${formatChartDay(item.day, index === report.days.length - 1)}</small>
    </div>`).join("");
    renderRanks(elements.sourceList, report.sources, report.total, "暂无访问来源");
    renderDevices(report.devices, report.total);
    renderTicket(link);
  }

  function renderRanks(container, items, total, emptyCopy) {
    if (!items.length) {
      container.innerHTML = `<p class="no-data">${emptyCopy}<br>测试一次短链后即可查看。</p>`;
      return;
    }
    container.innerHTML = items.slice(0, 5).map((item) => `<div class="rank-row">
      <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
      <span class="rank-track"><i style="width:${Math.round(item.count / Math.max(total, 1) * 100)}%"></i></span>
      <b>${item.count}</b>
    </div>`).join("");
  }

  function renderDevices(items, total) {
    if (!items.length) {
      elements.deviceList.innerHTML = '<p class="no-data">暂无设备数据<br>真实或测试访问会在这里归类。</p>';
      return;
    }
    elements.deviceList.innerHTML = items.slice(0, 4).map((item) => `<div class="device-row" data-device="${escapeHtml(item.name)}">
      <span>${escapeHtml(item.name)}</span><b>${Math.round(item.count / Math.max(total, 1) * 100)}%</b>
    </div>`).join("");
  }

  function updateDraftTicket() {
    const slug = core.normalizeSlug(elements.slugInput.value);
    if (!elements.targetInput.value.trim() && !slug) return renderTicket(selectedLink());
    elements.ticketStatus.textContent = "正在规划";
    elements.ticketUrl.textContent = slug ? `${shortBase()}${slug}` : "别名将自动生成";
    elements.ticketCampaign.textContent = elements.campaignInput.value.trim() || "日常入口";
    elements.qrPlaceholder.hidden = false;
    elements.downloadQrButton.disabled = true;
  }

  function renderTicket(link) {
    if (!link) {
      elements.ticketStatus.textContent = "等待发车";
      elements.ticketUrl.textContent = "填写目标后生成";
      elements.ticketCampaign.textContent = "待分配";
      elements.qrPlaceholder.hidden = false;
      elements.downloadQrButton.disabled = true;
      return;
    }
    elements.ticketStatus.textContent = link.active ? "路线运行中" : "路线已暂停";
    elements.ticketUrl.textContent = shortUrl(link);
    elements.ticketCampaign.textContent = link.campaign;
    drawQr(shortUrl(link));
  }

  function drawQr(text) {
    if (!qrReady) configureQr();
    if (!qrReady) {
      elements.qrPlaceholder.hidden = false;
      elements.qrPlaceholder.querySelector("p").innerHTML = "二维码组件未加载<br>短链仍可复制使用";
      elements.downloadQrButton.disabled = true;
      return;
    }
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      const count = qr.getModuleCount();
      const margin = 4;
      const cell = Math.max(3, Math.floor(184 / (count + margin * 2)));
      const size = cell * (count + margin * 2);
      const canvas = elements.qrCanvas;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size, size);
      context.fillStyle = "#10232b";
      for (let row = 0; row < count; row += 1) {
        for (let column = 0; column < count; column += 1) {
          if (qr.isDark(row, column)) context.fillRect((column + margin) * cell, (row + margin) * cell, cell, cell);
        }
      }
      elements.qrPlaceholder.hidden = true;
      elements.downloadQrButton.disabled = false;
    } catch {
      elements.qrPlaceholder.hidden = false;
      elements.downloadQrButton.disabled = true;
    }
  }

  function downloadQr() {
    const link = selectedLink();
    if (!link || elements.downloadQrButton.disabled) return;
    const anchor = document.createElement("a");
    anchor.href = elements.qrCanvas.toDataURL("image/png");
    anchor.download = `route-77-${link.slug}.png`;
    anchor.click();
    showToast("二维码 PNG 已下载");
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
  }

  function formatChartDay(day, today) {
    if (today) return "今天";
    const date = new Date(`${day}T00:00:00Z`);
    return new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "UTC" }).format(date).replace("周", "周");
  }

  async function openIncomingRoute() {
    if (state.mode !== "local") return;
    const params = new URLSearchParams(location.search);
    const slug = core.normalizeSlug(params.get("go") || "");
    if (!slug) return;
    const link = state.links.find((item) => item.slug === slug);
    elements.redirectDialog.showModal();
    if (!link) {
      elements.redirectCopy.textContent = `当前浏览器没有 /${slug} 这条本地路线。静态演示路线不会跨设备同步。`;
      elements.redirectLink.hidden = true;
      return;
    }
    if (!link.active) {
      elements.redirectCopy.textContent = `/${slug} 已暂停，暂时不能前往目标地址。`;
      elements.redirectLink.hidden = true;
      return;
    }
    const source = core.classifySource({ source: params.get("src") || "" });
    Object.assign(link, core.recordVisit(link, { source, device: core.classifyDevice(navigator.userAgent) }));
    saveLocal();
    renderAll();
    elements.redirectCopy.textContent = `/${slug} 将前往 ${new URL(link.target).hostname}。这次抵达已记入当前浏览器的演示统计。`;
    elements.redirectLink.hidden = false;
    elements.redirectLink.href = link.target;
  }

  boot().catch((error) => {
    elements.modeLabel.textContent = "初始化失败";
    showToast(error.message || "无法载入工作区", "error");
  });
})();
