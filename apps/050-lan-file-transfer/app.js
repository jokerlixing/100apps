(function () {
  "use strict";

  const Core = window.BeamTransferCore;
  const byId = (id) => document.getElementById(id);
  const elements = {
    rolePanel: byId("rolePanel"),
    workspace: byId("workspace"),
    senderSetup: byId("senderSetup"),
    receiverSetup: byId("receiverSetup"),
    pairingPanel: byId("pairingPanel"),
    transferPanel: byId("transferPanel"),
    workspaceTitle: byId("workspaceTitle"),
    workspaceHint: byId("workspaceHint"),
    roleEyebrow: byId("roleEyebrow"),
    fileInput: byId("fileInput"),
    dropZone: byId("dropZone"),
    fileSummary: byId("fileSummary"),
    selectedCount: byId("selectedCount"),
    selectedSize: byId("selectedSize"),
    selectedFileList: byId("selectedFileList"),
    createInvite: byId("createInvite"),
    receiverInviteToken: byId("receiverInviteToken"),
    localToken: byId("localToken"),
    localQr: byId("localQr"),
    localQrHelp: byId("localQrHelp"),
    localTicketStep: byId("localTicketStep"),
    localTicketTitle: byId("localTicketTitle"),
    ticketType: byId("ticketType"),
    remoteResponsePanel: byId("remoteResponsePanel"),
    remoteTicketStep: byId("remoteTicketStep"),
    remoteTicketTitle: byId("remoteTicketTitle"),
    remoteTicketHelp: byId("remoteTicketHelp"),
    remoteTicketType: byId("remoteTicketType"),
    remoteTokenLabel: byId("remoteTokenLabel"),
    remoteToken: byId("remoteToken"),
    applyRemoteToken: byId("applyRemoteToken"),
    waitingCard: byId("waitingCard"),
    errorNotice: byId("errorNotice"),
    errorText: byId("errorText"),
    secureIndicator: byId("secureIndicator"),
    secureText: byId("secureText"),
    connectionTitle: byId("connectionTitle"),
    connectionBadge: byId("connectionBadge"),
    transferTitle: byId("transferTitle"),
    transferDirection: byId("transferDirection"),
    progressPercent: byId("progressPercent"),
    progressStatus: byId("progressStatus"),
    progressTrack: byId("progressTrack"),
    progressBar: byId("progressBar"),
    metricTransferred: byId("metricTransferred"),
    metricSpeed: byId("metricSpeed"),
    metricFiles: byId("metricFiles"),
    sendFiles: byId("sendFiles"),
    transferGuidance: byId("transferGuidance"),
    deliveryList: byId("deliveryList"),
    manifestCount: byId("manifestCount"),
    scanDialog: byId("scanDialog"),
    scanVideo: byId("scanVideo"),
    scanCanvas: byId("scanCanvas"),
    cameraMessage: byId("cameraMessage"),
    resetDialog: byId("resetDialog"),
    toast: byId("toast")
  };

  const state = {
    role: null,
    queue: null,
    pc: null,
    channel: null,
    localToken: "",
    sending: false,
    transferred: 0,
    totalBytes: 0,
    completedFiles: 0,
    expectedFiles: 0,
    startedAt: 0,
    receiveCurrent: null,
    receivedFiles: [],
    receivedDeclaredBytes: 0,
    objectUrls: [],
    scannerStream: null,
    scannerTimer: 0,
    scannerTarget: null,
    toastTimer: 0,
    closedIntentionally: false
  };

  function showToast(message) {
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    state.toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2300);
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error || "发生未知错误");
    elements.errorText.textContent = message;
    elements.errorNotice.hidden = false;
    elements.errorNotice.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearError() {
    elements.errorNotice.hidden = true;
    elements.errorText.textContent = "";
  }

  function setRoute(step) {
    const order = ["prepare", "invite", "reply", "transfer"];
    const activeIndex = order.indexOf(step);
    document.querySelectorAll("[data-route-step]").forEach((node) => {
      const index = order.indexOf(node.dataset.routeStep);
      node.classList.toggle("active", index === activeIndex);
      node.classList.toggle("done", index < activeIndex || step === "transfer");
      const connector = node.nextElementSibling;
      if (connector && connector.tagName === "I") connector.classList.toggle("done", index < activeIndex);
    });
  }

  function startRole(role) {
    clearError();
    state.role = role;
    elements.rolePanel.hidden = true;
    elements.workspace.hidden = false;
    elements.senderSetup.hidden = role !== "sender";
    elements.receiverSetup.hidden = role !== "receiver";
    elements.pairingPanel.hidden = true;
    elements.transferPanel.hidden = true;
    elements.roleEyebrow.textContent = role === "sender" ? "SENDER DESK" : "RECEIVER DESK";
    elements.workspaceTitle.textContent = role === "sender" ? "准备发送" : "准备接收";
    elements.workspaceHint.textContent = role === "sender"
      ? "选择要交付的文件，生成这次会话的邀请。"
      : "读取发送设备给出的邀请，生成配对回应。";
    setRoute("prepare");
    elements.workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function extensionLabel(name) {
    const extension = String(name).split(".").pop();
    if (!extension || extension === name || extension.length > 5) return "FILE";
    return extension.toUpperCase();
  }

  function makeFileRow(meta, statusText) {
    const item = document.createElement("li");
    item.dataset.fileId = meta.id;
    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = extensionLabel(meta.name);
    const copy = document.createElement("span");
    copy.className = "file-copy";
    const name = document.createElement("b");
    name.textContent = meta.name;
    const size = document.createElement("span");
    size.textContent = Core.formatBytes(meta.size);
    copy.append(name, size);
    const stateLabel = document.createElement("span");
    stateLabel.className = "file-state";
    stateLabel.textContent = statusText;
    item.append(icon, copy, stateLabel);
    return item;
  }

  function selectFiles(fileList) {
    clearError();
    try {
      state.queue = Core.createFileQueue(fileList);
      elements.fileSummary.hidden = false;
      elements.selectedCount.textContent = `${state.queue.files.length} 个文件`;
      elements.selectedSize.textContent = Core.formatBytes(state.queue.totalBytes);
      elements.selectedFileList.replaceChildren(...state.queue.files.map((meta) => makeFileRow(meta, "待发送")));
      elements.createInvite.disabled = false;
    } catch (error) {
      state.queue = null;
      elements.fileInput.value = "";
      elements.fileSummary.hidden = true;
      elements.selectedFileList.replaceChildren();
      elements.createInvite.disabled = true;
      showError(error);
    }
  }

  function clearFiles() {
    state.queue = null;
    elements.fileInput.value = "";
    elements.fileSummary.hidden = true;
    elements.selectedFileList.replaceChildren();
    elements.createInvite.disabled = true;
  }

  function createPeer(role) {
    if (!("RTCPeerConnection" in window)) throw new Error("当前浏览器不支持 WebRTC 点对点连接");
    if (state.pc) state.pc.close();
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceCandidatePoolSize: 2
    });
    state.pc = peer;
    state.closedIntentionally = false;
    peer.addEventListener("connectionstatechange", () => {
      const connectionState = peer.connectionState;
      if (connectionState === "connected") setConnectionStatus("本地通道已接通", "P2P / READY");
      if (connectionState === "connecting") setConnectionStatus("正在建立本地通道", "P2P / LINKING");
      if (connectionState === "failed" && !state.closedIntentionally) {
        showError("点对点通道已中断。请确认两台设备仍在同一网络，然后重新开始配对。");
        setConnectionStatus("通道已中断", "P2P / OFFLINE");
      }
    });
    peer.addEventListener("iceconnectionstatechange", () => {
      if (["checking", "new"].includes(peer.iceConnectionState)) {
        elements.workspaceHint.textContent = "正在寻找两台设备之间可用的本地路线…";
      }
    });
    if (role === "receiver") {
      peer.addEventListener("datachannel", (event) => setupChannel(event.channel));
    }
    return peer;
  }

  function setConnectionStatus(title, badge) {
    elements.connectionTitle.textContent = title;
    elements.connectionBadge.textContent = badge;
  }

  function waitForIce(peer, timeoutMs) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        peer.removeEventListener("icegatheringstatechange", check);
        resolve();
      };
      const check = () => {
        if (peer.iceGatheringState === "complete") finish();
      };
      peer.addEventListener("icegatheringstatechange", check);
      setTimeout(finish, timeoutMs || 5000);
    });
  }

  async function packHandshake(payload) {
    const clean = Core.validateHandshake(payload);
    if (!("CompressionStream" in window)) return Core.encodeRawHandshake(clean);
    const source = new TextEncoder().encode(JSON.stringify(clean));
    try {
      const compressedStream = new Blob([source]).stream().pipeThrough(new CompressionStream("gzip"));
      const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer());
      return `${Core.TOKEN_PREFIX}z.${Core.bytesToBase64Url(compressed)}`;
    } catch (_) {
      return Core.encodeRawHandshake(clean);
    }
  }

  async function unpackHandshake(token) {
    const value = String(token || "").trim();
    const codec = Core.tokenCodec(value);
    if (codec === "raw") return Core.decodeRawHandshake(value);
    if (codec !== "gzip") throw new Error("这不是有效的 BEAM/50 连接文本");
    if (!("DecompressionStream" in window)) throw new Error("当前浏览器无法读取压缩连接文本，请换用最新版浏览器");
    try {
      const encoded = value.slice(`${Core.TOKEN_PREFIX}z.`.length);
      const stream = new Blob([Core.base64UrlToBytes(encoded)]).stream().pipeThrough(new DecompressionStream("gzip"));
      const json = await new Response(stream).text();
      return Core.validateHandshake(JSON.parse(json));
    } catch (error) {
      if (error && /浏览器|连接/.test(error.message)) throw error;
      throw new Error("连接文本内容损坏或不完整");
    }
  }

  function renderQr(token) {
    elements.localQr.replaceChildren();
    if (typeof window.qrcode !== "function") {
      const note = document.createElement("span");
      note.className = "qr-placeholder";
      note.textContent = "二维码组件未加载，请复制下方连接文本";
      elements.localQr.append(note);
      return;
    }
    try {
      const qr = window.qrcode(0, "L");
      qr.addData(token, "Byte");
      qr.make();
      const image = document.createElement("img");
      image.src = qr.createDataURL(5, 12);
      image.alt = "BEAM/50 配对二维码";
      elements.localQr.append(image);
    } catch (_) {
      const note = document.createElement("span");
      note.className = "qr-placeholder";
      note.textContent = "连接信息较长，请复制下方连接文本完成配对";
      elements.localQr.append(note);
    }
  }

  function presentLocalToken(token) {
    state.localToken = token;
    elements.localToken.value = token;
    renderQr(token);
  }

  async function createInvite() {
    clearError();
    if (!state.queue) throw new Error("请先选择要发送的文件");
    elements.createInvite.disabled = true;
    elements.createInvite.textContent = "正在生成本地邀请…";
    try {
      const peer = createPeer("sender");
      const channel = peer.createDataChannel("beam50-files", { ordered: true });
      setupChannel(channel);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIce(peer);
      const token = await packHandshake({ version: Core.VERSION, role: "sender", description: peer.localDescription.toJSON() });
      presentLocalToken(token);
      configurePairing("sender");
      elements.senderSetup.hidden = true;
      elements.pairingPanel.hidden = false;
      elements.workspaceTitle.textContent = "交出邀请，读入回应";
      elements.workspaceHint.textContent = "先让接收设备读取左侧邀请，再把它生成的回应读回这台设备。";
      setRoute("invite");
      elements.pairingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      elements.createInvite.disabled = false;
      elements.createInvite.innerHTML = "重新生成配对邀请 <span>→</span>";
      throw error;
    }
  }

  function configurePairing(role) {
    const controls = elements.remoteResponsePanel.querySelectorAll(".field-help,.scan-actions,.token-field,#applyRemoteToken");
    if (role === "sender") {
      elements.localTicketStep.textContent = "STEP 02";
      elements.localTicketTitle.textContent = "把邀请交给接收设备";
      elements.ticketType.textContent = "OFFER / QR";
      elements.localQrHelp.textContent = "让接收设备扫描此码，或复制下方连接文本";
      elements.remoteTicketStep.textContent = "STEP 03";
      elements.remoteTicketTitle.textContent = "读入接收设备的回应";
      elements.remoteTicketType.textContent = "ANSWER / QR";
      elements.remoteTicketHelp.textContent = "接收设备会生成第二张票据。扫描它，或粘贴回应文本。";
      elements.remoteTokenLabel.textContent = "回应文本";
      elements.applyRemoteToken.innerHTML = "应用回应并连接 <span>→</span>";
      controls.forEach((node) => { node.hidden = false; });
      elements.waitingCard.hidden = true;
    } else {
      elements.localTicketStep.textContent = "STEP 02";
      elements.localTicketTitle.textContent = "把回应交回发送设备";
      elements.ticketType.textContent = "ANSWER / QR";
      elements.localQrHelp.textContent = "让发送设备扫描此码，或复制下方连接文本";
      elements.remoteTicketStep.textContent = "STEP 03";
      elements.remoteTicketTitle.textContent = "等待发送设备确认";
      elements.remoteTicketType.textContent = "STANDBY";
      controls.forEach((node) => { node.hidden = true; });
      elements.waitingCard.hidden = false;
    }
  }

  async function acceptInvite() {
    clearError();
    const acceptButton = byId("acceptInvite");
    acceptButton.disabled = true;
    acceptButton.textContent = "正在生成配对回应…";
    try {
      const payload = await unpackHandshake(elements.receiverInviteToken.value);
      if (payload.role !== "sender") throw new Error("接收设备需要读取发送端的邀请文本");
      const peer = createPeer("receiver");
      await peer.setRemoteDescription(payload.description);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIce(peer);
      const token = await packHandshake({ version: Core.VERSION, role: "receiver", description: peer.localDescription.toJSON() });
      presentLocalToken(token);
      configurePairing("receiver");
      elements.receiverSetup.hidden = true;
      elements.pairingPanel.hidden = false;
      elements.workspaceTitle.textContent = "交回应答，等待接通";
      elements.workspaceHint.textContent = "让发送设备读取这张回应票据；确认后通道会自动接通。";
      setRoute("reply");
      elements.pairingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      acceptButton.disabled = false;
      acceptButton.innerHTML = "重新读取邀请 <span>→</span>";
      throw error;
    }
  }

  async function applyRemoteToken() {
    clearError();
    if (!state.pc || state.role !== "sender") throw new Error("请先生成发送邀请");
    const payload = await unpackHandshake(elements.remoteToken.value);
    if (payload.role !== "receiver") throw new Error("发送设备需要读取接收端的回应文本");
    elements.applyRemoteToken.disabled = true;
    elements.applyRemoteToken.textContent = "正在建立点对点通道…";
    try {
      await state.pc.setRemoteDescription(payload.description);
      elements.workspaceTitle.textContent = "正在接通本地路线";
      elements.workspaceHint.textContent = "两台设备正在协商可用的局域网路径。";
      setRoute("reply");
    } catch (error) {
      elements.applyRemoteToken.disabled = false;
      elements.applyRemoteToken.innerHTML = "重新应用回应 <span>→</span>";
      throw error;
    }
  }

  function setupChannel(channel) {
    state.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 512 * 1024;
    channel.addEventListener("open", onChannelOpen);
    channel.addEventListener("close", () => {
      if (!state.closedIntentionally) {
        setConnectionStatus("通道已关闭", "P2P / CLOSED");
        if (state.sending || state.receiveCurrent) showError("传输通道提前关闭，本次未完成的文件需要重新发送。");
      }
    });
    channel.addEventListener("error", () => showError("文件通道发生错误，请重新建立连接。"));
    channel.addEventListener("message", (event) => {
      Promise.resolve(handleChannelMessage(event.data)).catch(showError);
    });
  }

  function onChannelOpen() {
    clearError();
    elements.pairingPanel.hidden = true;
    elements.transferPanel.hidden = false;
    elements.workspaceTitle.textContent = state.role === "sender" ? "通道已接通，可以发送" : "通道已接通，等待文件";
    elements.workspaceHint.textContent = "文件内容现在只会沿着这条临时点对点通道移动。";
    setConnectionStatus("本地通道已接通", "P2P / READY");
    setRoute("transfer");
    configureTransferBoard();
    sendControl("hello", state.role === "sender" && state.queue ? {
      role: state.role,
      totalBytes: state.queue.totalBytes,
      fileCount: state.queue.files.length
    } : { role: state.role });
    elements.transferPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function configureTransferBoard() {
    state.transferred = 0;
    state.completedFiles = 0;
    state.startedAt = 0;
    if (state.role === "sender") {
      state.totalBytes = state.queue.totalBytes;
      state.expectedFiles = state.queue.files.length;
      elements.transferTitle.textContent = "文件已装车";
      elements.transferDirection.textContent = "SEND →";
      elements.progressStatus.textContent = "点按下方按钮开始发送";
      elements.sendFiles.hidden = false;
      elements.sendFiles.disabled = false;
      elements.sendFiles.innerHTML = "开始发送 <span>→</span>";
      elements.deliveryList.replaceChildren(...state.queue.files.map((meta) => makeFileRow(meta, "待发送")));
      elements.manifestCount.textContent = `${state.queue.files.length} ITEMS`;
    } else {
      state.totalBytes = 0;
      state.expectedFiles = 0;
      elements.transferTitle.textContent = "等待文件抵达";
      elements.transferDirection.textContent = "← RECEIVE";
      elements.progressStatus.textContent = "发送设备尚未开始传输";
      elements.sendFiles.hidden = true;
      elements.deliveryList.innerHTML = '<li class="empty-delivery">已接通，等待发送设备发出文件</li>';
      elements.manifestCount.textContent = "0 ITEMS";
    }
    updateProgress();
  }

  function sendControl(type, payload) {
    if (!state.channel || state.channel.readyState !== "open") throw new Error("点对点通道尚未接通");
    state.channel.send(Core.encodeControl(type, payload));
  }

  async function handleChannelMessage(data) {
    if (typeof data === "string") {
      handleControlMessage(Core.decodeControl(data));
      return;
    }
    const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
    receiveChunk(buffer);
  }

  function handleControlMessage(message) {
    if (message.type === "hello" && state.role === "receiver" && message.role === "sender") {
      const totalBytes = Number(message.totalBytes);
      const fileCount = Number(message.fileCount);
      if (!Number.isFinite(totalBytes) || totalBytes < 0 || totalBytes > Core.MAX_SESSION_BYTES || !Number.isInteger(fileCount) || fileCount < 0 || fileCount > Core.MAX_FILES) {
        throw new Error("发送设备给出的文件清单无效");
      }
      state.totalBytes = totalBytes;
      state.expectedFiles = fileCount;
      elements.manifestCount.textContent = `${fileCount} ITEMS`;
      updateProgress();
      return;
    }
    if (message.type === "file-meta") beginReceiveFile(message);
    if (message.type === "file-end") finishReceiveFile(message);
    if (message.type === "batch-end") finishReceiveBatch();
    if (message.type === "error") throw new Error(message.message || "发送设备报告传输错误");
  }

  function beginReceiveFile(message) {
    if (state.role !== "receiver") return;
    if (state.receiveCurrent) throw new Error("上一文件尚未完成，收到新的文件头");
    const size = Number(message.size);
    if (typeof message.id !== "string" || !Number.isFinite(size) || size < 0) throw new Error("收到的文件信息无效");
    if (state.receivedDeclaredBytes + size > Core.MAX_SESSION_BYTES) throw new Error("接收文件总量超过 200 MB 安全上限");
    const meta = {
      id: message.id,
      name: Core.sanitizeFileName(message.name),
      size,
      type: typeof message.mime === "string" ? message.mime : "application/octet-stream",
      received: 0,
      chunks: []
    };
    state.receivedDeclaredBytes += size;
    state.receiveCurrent = meta;
    if (!state.startedAt) state.startedAt = performance.now();
    if (elements.deliveryList.querySelector(".empty-delivery")) elements.deliveryList.replaceChildren();
    const row = makeFileRow(meta, "接收中");
    row.classList.add("active");
    const progress = document.createElement("span");
    progress.className = "inline-progress";
    progress.innerHTML = "<i></i>";
    row.querySelector(".file-copy").append(progress);
    elements.deliveryList.append(row);
    elements.manifestCount.textContent = `${Math.max(state.expectedFiles, elements.deliveryList.children.length)} ITEMS`;
    elements.transferTitle.textContent = `正在接收 ${meta.name}`;
    elements.progressStatus.textContent = "文件正在沿本地通道传输";
  }

  function receiveChunk(buffer) {
    const current = state.receiveCurrent;
    if (!current) throw new Error("收到没有文件头的二进制分片");
    if (current.received + buffer.byteLength > current.size) throw new Error(`文件 ${current.name} 的数据长度超出声明大小`);
    current.chunks.push(buffer);
    current.received += buffer.byteLength;
    state.transferred += buffer.byteLength;
    const row = findDeliveryRow(current.id);
    if (row) {
      row.querySelector(".file-state").textContent = `${Math.round(Core.progressPercentage(current.received, current.size))}%`;
      const bar = row.querySelector(".inline-progress i");
      if (bar) bar.style.width = `${Core.progressPercentage(current.received, current.size)}%`;
    }
    updateProgress();
  }

  function finishReceiveFile(message) {
    const current = state.receiveCurrent;
    if (!current || message.id !== current.id) throw new Error("收到的文件结束标记不匹配");
    if (current.received !== current.size) throw new Error(`文件 ${current.name} 接收不完整`);
    const blob = new Blob(current.chunks, { type: current.type });
    const url = URL.createObjectURL(blob);
    state.objectUrls.push(url);
    state.receivedFiles.push({ id: current.id, name: current.name, size: current.size, url });
    state.completedFiles += 1;
    const row = findDeliveryRow(current.id);
    if (row) {
      row.classList.remove("active");
      row.classList.add("done");
      row.querySelector(".file-state").remove();
      const download = document.createElement("a");
      download.className = "download-button";
      download.href = url;
      download.download = current.name;
      download.textContent = "保存文件";
      row.append(download);
      const inline = row.querySelector(".inline-progress i");
      if (inline) inline.style.width = "100%";
    }
    state.receiveCurrent = null;
    elements.transferTitle.textContent = "文件已安全抵达";
    updateProgress();
  }

  function finishReceiveBatch() {
    if (state.receiveCurrent) throw new Error("文件尚未完成就收到了批次结束标记");
    elements.transferTitle.textContent = "本批文件已全部抵达";
    elements.progressStatus.textContent = "请选择需要的文件并保存到设备";
    elements.transferGuidance.textContent = "文件只暂存在当前标签页；关闭页面前请完成保存。";
    updateProgress(true);
    showToast("全部文件接收完成");
  }

  function findDeliveryRow(id) {
    return Array.from(elements.deliveryList.children).find((node) => node.dataset.fileId === id) || null;
  }

  function updateDeliveryRow(id, status, percent) {
    const row = findDeliveryRow(id);
    if (!row) return;
    row.classList.toggle("active", status === "发送中");
    row.classList.toggle("done", status === "已发送");
    const stateLabel = row.querySelector(".file-state");
    if (stateLabel) stateLabel.textContent = percent === undefined ? status : `${Math.round(percent)}%`;
  }

  function updateProgress(forceComplete) {
    const percent = forceComplete ? 100 : Core.progressPercentage(state.transferred, state.totalBytes);
    const elapsedSeconds = state.startedAt ? Math.max(.001, (performance.now() - state.startedAt) / 1000) : 0;
    const speed = elapsedSeconds ? state.transferred / elapsedSeconds : 0;
    elements.progressPercent.textContent = `${Math.round(percent)}%`;
    elements.progressBar.style.width = `${percent}%`;
    elements.progressTrack.setAttribute("aria-valuenow", String(Math.round(percent)));
    elements.metricTransferred.textContent = `${Core.formatBytes(state.transferred)} / ${Core.formatBytes(state.totalBytes)}`;
    elements.metricSpeed.textContent = Core.formatRate(speed);
    elements.metricFiles.textContent = `${state.completedFiles} / ${state.expectedFiles}`;
  }

  function waitForChannelBuffer() {
    if (!state.channel || state.channel.readyState !== "open") return Promise.reject(new Error("点对点通道已关闭"));
    if (state.channel.bufferedAmount <= 1024 * 1024) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (!state.channel || state.channel.readyState !== "open") reject(new Error("点对点通道已关闭"));
        else if (state.channel.bufferedAmount <= 512 * 1024) resolve();
        else setTimeout(check, 24);
      };
      check();
    });
  }

  async function sendFiles() {
    if (state.sending || !state.queue) return;
    clearError();
    state.sending = true;
    state.startedAt = performance.now();
    state.transferred = 0;
    state.completedFiles = 0;
    elements.sendFiles.disabled = true;
    elements.sendFiles.textContent = "正在发送…";
    elements.transferTitle.textContent = "正在沿本地路线发送";
    elements.progressStatus.textContent = "请保持页面打开，不要切换网络";
    try {
      sendControl("hello", { role: "sender", totalBytes: state.queue.totalBytes, fileCount: state.queue.files.length });
      for (const meta of state.queue.files) {
        sendControl("file-meta", { id: meta.id, name: meta.name, size: meta.size, mime: meta.type, lastModified: meta.lastModified });
        updateDeliveryRow(meta.id, "发送中", 0);
        for (let offset = 0; offset < meta.size; offset += Core.CHUNK_SIZE) {
          await waitForChannelBuffer();
          const buffer = await meta.file.slice(offset, offset + Core.CHUNK_SIZE).arrayBuffer();
          if (!state.channel || state.channel.readyState !== "open") throw new Error("点对点通道已关闭");
          state.channel.send(buffer);
          state.transferred += buffer.byteLength;
          updateDeliveryRow(meta.id, "发送中", Core.progressPercentage(Math.min(offset + buffer.byteLength, meta.size), meta.size));
          updateProgress();
        }
        sendControl("file-end", { id: meta.id, size: meta.size });
        state.completedFiles += 1;
        updateDeliveryRow(meta.id, "已发送");
        updateProgress();
      }
      sendControl("batch-end", { fileCount: state.queue.files.length, totalBytes: state.queue.totalBytes });
      elements.transferTitle.textContent = "本批文件已全部发出";
      elements.progressStatus.textContent = "等待接收设备保存文件";
      elements.sendFiles.textContent = "发送完成";
      updateProgress(true);
      showToast("全部文件发送完成");
    } catch (error) {
      try {
        if (state.channel && state.channel.readyState === "open") sendControl("error", { message: error.message });
      } catch (_) {}
      showError(error);
      elements.sendFiles.disabled = false;
      elements.sendFiles.textContent = "重新发送";
    } finally {
      state.sending = false;
    }
  }

  async function copyText(value) {
    if (!value) throw new Error("当前没有可复制的连接文本");
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (!copied) throw new Error("浏览器未允许复制，请手动选择连接文本");
    }
    showToast("连接文本已复制");
  }

  async function decodeQrSource(source) {
    const canvas = elements.scanCanvas;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const width = source.videoWidth || source.width;
    const height = source.videoHeight || source.height;
    if (!width || !height) return null;
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / width);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (typeof window.jsQR === "function") {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
      return result ? result.data : null;
    }
    if ("BarcodeDetector" in window) {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const results = await detector.detect(canvas);
      return results[0] ? results[0].rawValue : null;
    }
    throw new Error("二维码识别组件未加载，请粘贴连接文本");
  }

  function acceptScannedToken(token) {
    if (!Core.tokenCodec(token)) {
      elements.cameraMessage.textContent = "这不是 BEAM/50 配对二维码";
      return false;
    }
    const target = byId(state.scannerTarget);
    if (target) target.value = token;
    closeScanner();
    showToast("已读取配对二维码");
    if (target) target.focus();
    return true;
  }

  async function scanCameraFrame() {
    if (!state.scannerStream || !elements.scanDialog.open) return;
    try {
      if (elements.scanVideo.readyState >= 2) {
        const token = await decodeQrSource(elements.scanVideo);
        if (token && acceptScannedToken(token)) return;
      }
    } catch (error) {
      elements.cameraMessage.textContent = error.message;
      return;
    }
    state.scannerTimer = window.setTimeout(scanCameraFrame, 120);
  }

  async function openScanner(targetId) {
    clearError();
    state.scannerTarget = targetId;
    elements.cameraMessage.textContent = "正在请求摄像头权限…";
    elements.scanDialog.showModal();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      elements.cameraMessage.textContent = "当前环境不能使用摄像头，请上传二维码图片或粘贴文本";
      return;
    }
    try {
      state.scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      elements.scanVideo.srcObject = state.scannerStream;
      await elements.scanVideo.play();
      elements.cameraMessage.textContent = "请把二维码完整放入取景框";
      scanCameraFrame();
    } catch (_) {
      elements.cameraMessage.textContent = "无法打开摄像头，请允许权限或改用二维码图片";
    }
  }

  function closeScanner() {
    clearTimeout(state.scannerTimer);
    state.scannerTimer = 0;
    if (state.scannerStream) state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
    elements.scanVideo.srcObject = null;
    if (elements.scanDialog.open) elements.scanDialog.close();
  }

  async function scanImage(file, targetId) {
    if (!file) return;
    clearError();
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const token = await decodeQrSource(bitmap);
      if (!token || !Core.tokenCodec(token)) throw new Error("图片中没有可识别的 BEAM/50 配对二维码");
      byId(targetId).value = token;
      showToast("二维码图片识别成功");
    } finally {
      if (bitmap) bitmap.close();
    }
  }

  function cleanup() {
    state.closedIntentionally = true;
    closeScanner();
    if (state.channel) state.channel.close();
    if (state.pc) state.pc.close();
    state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.objectUrls = [];
  }

  function runAction(action) {
    return async function (event) {
      if (event) event.preventDefault();
      try {
        await action(event);
      } catch (error) {
        showError(error);
      }
    };
  }

  function bindEvents() {
    byId("chooseSender").addEventListener("click", () => startRole("sender"));
    byId("chooseReceiver").addEventListener("click", () => startRole("receiver"));
    elements.fileInput.addEventListener("change", () => selectFiles(elements.fileInput.files));
    ["dragenter", "dragover"].forEach((type) => elements.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach((type) => elements.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("dragover");
    }));
    elements.dropZone.addEventListener("drop", (event) => selectFiles(event.dataTransfer.files));
    byId("clearFiles").addEventListener("click", clearFiles);
    elements.createInvite.addEventListener("click", runAction(createInvite));
    byId("acceptInvite").addEventListener("click", runAction(acceptInvite));
    elements.applyRemoteToken.addEventListener("click", runAction(applyRemoteToken));
    byId("copyLocalToken").addEventListener("click", runAction(() => copyText(elements.localToken.value)));
    elements.sendFiles.addEventListener("click", runAction(sendFiles));
    byId("dismissError").addEventListener("click", clearError);
    document.querySelectorAll("[data-scan-target]").forEach((button) => {
      button.addEventListener("click", runAction(() => openScanner(button.dataset.scanTarget)));
    });
    document.querySelectorAll("[data-qr-upload]").forEach((input) => {
      input.addEventListener("change", runAction(() => scanImage(input.files[0], input.dataset.qrUpload)));
    });
    byId("closeScanner").addEventListener("click", closeScanner);
    elements.scanDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeScanner(); });
    byId("resetSession").addEventListener("click", () => elements.resetDialog.showModal());
    byId("cancelReset").addEventListener("click", () => elements.resetDialog.close());
    byId("confirmReset").addEventListener("click", () => { cleanup(); window.location.reload(); });
    window.addEventListener("beforeunload", cleanup);
  }

  function initialize() {
    if (!Core) {
      elements.secureIndicator.classList.add("warn");
      elements.secureText.textContent = "传输核心未加载";
      return;
    }
    const secureEnough = window.isSecureContext || ["localhost", "127.0.0.1"].includes(location.hostname);
    if (!secureEnough) {
      elements.secureIndicator.classList.add("warn");
      elements.secureText.textContent = "请使用 HTTPS 打开";
    } else if (!("RTCPeerConnection" in window)) {
      elements.secureIndicator.classList.add("warn");
      elements.secureText.textContent = "浏览器不支持 WebRTC";
      byId("chooseSender").disabled = true;
      byId("chooseReceiver").disabled = true;
    } else {
      elements.secureText.textContent = "本地通道可用";
    }
    bindEvents();
  }

  initialize();
})();
