(function () {
  "use strict";

  const Core = window.PuzzleCore;
  const DEFAULT_IMAGE = "assets/colorful-desk-puzzle.webp";
  const STORAGE_KEY = "shift47.records.v1";
  const MAX_FILE_SIZE = 8 * 1024 * 1024;

  const elements = {
    screenModule: document.querySelector(".screen-module"),
    puzzleFrame: document.querySelector(".puzzle-frame"),
    puzzleGrid: document.querySelector("#puzzle-grid"),
    previewLayer: document.querySelector("#preview-layer"),
    runState: document.querySelector("#run-state"),
    imageName: document.querySelector("#image-name"),
    timeValue: document.querySelector("#time-value"),
    moveValue: document.querySelector("#move-value"),
    bestValue: document.querySelector("#best-value"),
    boardHelp: document.querySelector("#board-help"),
    difficultyInputs: [...document.querySelectorAll('input[name="difficulty"]')],
    defaultImageButton: document.querySelector("#default-image-button"),
    imageInput: document.querySelector("#image-input"),
    previewButton: document.querySelector("#preview-button"),
    shuffleButton: document.querySelector("#shuffle-button"),
    confirmStrip: document.querySelector("#confirm-strip"),
    confirmMessage: document.querySelector("#confirm-message"),
    confirmYes: document.querySelector("#confirm-yes"),
    confirmNo: document.querySelector("#confirm-no"),
    notice: document.querySelector("#notice"),
    completionDialog: document.querySelector("#completion-dialog"),
    completionCopy: document.querySelector("#completion-copy"),
    recordCopy: document.querySelector("#record-copy"),
    playAgainButton: document.querySelector("#play-again-button"),
    closeDialogButton: document.querySelector("#close-dialog-button")
  };

  const state = {
    dimension: 3,
    board: Core.createSolved(3),
    imageUrl: DEFAULT_IMAGE,
    imageKey: "desk",
    imageName: "彩色创意桌面",
    status: "ready",
    moves: 0,
    elapsedMs: 0,
    startTime: 0,
    timerFrame: 0,
    timerSecond: -1,
    selectedIndex: null,
    focusIndex: 0,
    dragSourceIndex: null,
    dragTargetIndex: null,
    pointerSession: null,
    ignoreClickUntil: 0,
    pendingAction: null,
    noticeTimer: 0,
    helpTimer: 0
  };
  let renderedImageUrl = null;

  function readRecords() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeRecords(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch {
      showNotice("纪录无法写入浏览器，但本局仍可继续。", true);
      return false;
    }
  }

  function recordKey() {
    return `${state.imageKey}-${state.dimension}-swap`;
  }

  function getBestRecord() {
    const record = readRecords()[recordKey()];
    if (!record) return null;
    try {
      return Core.pickBestRecord(null, record);
    } catch {
      return null;
    }
  }

  function formatTime(elapsedMs) {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function updateMetrics() {
    elements.timeValue.textContent = formatTime(state.elapsedMs);
    elements.moveValue.textContent = String(state.moves).padStart(3, "0");
    const best = getBestRecord();
    elements.bestValue.textContent = best ? formatTime(best.elapsedMs) : "--:--";
    elements.bestValue.title = best ? `最佳纪录：${best.moves} 次交换` : "暂无完成纪录";
  }

  function updateRunState() {
    const labels = {
      ready: "等待第一次交换",
      running: "图像重组中",
      complete: "图像已恢复"
    };
    elements.runState.textContent = labels[state.status];
    elements.imageName.textContent = state.imageName;
    elements.screenModule.classList.toggle("is-running", state.status === "running");
  }

  function positionStyle(element, index) {
    element.style.setProperty("--row", Math.floor(index / state.dimension) + 1);
    element.style.setProperty("--column", index % state.dimension + 1);
  }

  function renderBoard() {
    // Keep the same cells while playing so a selection or swap does not rebuild the image.
    if (elements.puzzleGrid.children.length !== state.board.length) {
      const fragment = document.createDocumentFragment();
      state.board.forEach((_, index) => {
        const tileButton = document.createElement("button");
        tileButton.type = "button";
        tileButton.className = "puzzle-tile";
        tileButton.dataset.index = String(index);
        tileButton.setAttribute("role", "gridcell");
        tileButton.style.backgroundSize = `${state.dimension * 100}% ${state.dimension * 100}%`;
        positionStyle(tileButton, index);

        const number = document.createElement("span");
        number.className = "tile-number";
        number.setAttribute("aria-hidden", "true");
        tileButton.append(number);
        fragment.append(tileButton);
      });
      elements.puzzleGrid.replaceChildren(fragment);
      elements.puzzleGrid.style.setProperty("--size", state.dimension);
      elements.puzzleGrid.setAttribute(
        "aria-label",
        `${state.dimension} 乘 ${state.dimension} 全图交换拼图，拖拽或依次选择两块进行交换`
      );
    }

    // Share one short image URL with every tile and the preview.
    if (renderedImageUrl !== state.imageUrl) {
      elements.puzzleFrame.style.setProperty("--puzzle-image", `url("${state.imageUrl}")`);
      renderedImageUrl = state.imageUrl;
    }

    state.board.forEach((tile, index) => {
      const tileButton = elements.puzzleGrid.children[index];
      if (tileButton.dataset.tile !== String(tile)) {
        const targetIndex = tile - 1;
        const targetRow = Math.floor(targetIndex / state.dimension);
        const targetColumn = targetIndex % state.dimension;
        tileButton.dataset.tile = String(tile);
        tileButton.setAttribute(
          "aria-label",
          `图片块 ${tile}，当前位置第 ${Math.floor(index / state.dimension) + 1} 行第 ${index % state.dimension + 1} 列，目标第 ${targetRow + 1} 行第 ${targetColumn + 1} 列`
        );
        const x = targetColumn * 100 / (state.dimension - 1);
        const y = targetRow * 100 / (state.dimension - 1);
        tileButton.style.backgroundPosition = `${x}% ${y}%`;
        tileButton.firstElementChild.textContent = String(tile).padStart(2, "0");
      }
      tileButton.setAttribute("aria-pressed", state.selectedIndex === index ? "true" : "false");
      tileButton.tabIndex = index === state.focusIndex ? 0 : -1;
      tileButton.classList.toggle("is-selected", state.selectedIndex === index);
      tileButton.classList.toggle("is-drag-source", state.dragSourceIndex === index);
      tileButton.classList.toggle("is-drop-target", state.dragTargetIndex === index);
    });

    elements.previewLayer.classList.toggle("is-complete", state.status === "complete");
    elements.puzzleGrid.classList.toggle("has-selection", state.selectedIndex !== null);
    updateRunState();
  }

  function focusTile(index) {
    const normalized = Math.max(0, Math.min(state.board.length - 1, index));
    state.focusIndex = normalized;
    for (const tile of elements.puzzleGrid.querySelectorAll(".puzzle-tile")) {
      tile.tabIndex = Number(tile.dataset.index) === normalized ? 0 : -1;
    }
    elements.puzzleGrid.querySelector(`.puzzle-tile[data-index="${normalized}"]`)?.focus({ preventScroll: true });
  }

  function updateDragClasses() {
    elements.puzzleGrid.classList.toggle("is-dragging", state.dragSourceIndex !== null);
    for (const tile of elements.puzzleGrid.querySelectorAll(".puzzle-tile")) {
      const index = Number(tile.dataset.index);
      tile.classList.toggle("is-drag-source", index === state.dragSourceIndex);
      tile.classList.toggle("is-drop-target", index === state.dragTargetIndex);
    }
  }

  function clearDragState() {
    state.dragSourceIndex = null;
    state.dragTargetIndex = null;
    state.pointerSession = null;
    updateDragClasses();
  }

  function showBoardMessage(message, temporary = false) {
    window.clearTimeout(state.helpTimer);
    elements.boardHelp.textContent = message;
    if (temporary) {
      state.helpTimer = window.setTimeout(() => {
        elements.boardHelp.textContent = "拖动一块到另一块上交换；也可以依次点击两块。";
      }, 2200);
    }
  }

  function showNotice(message, isError = false) {
    window.clearTimeout(state.noticeTimer);
    elements.notice.textContent = message;
    elements.notice.classList.toggle("is-error", isError);
    elements.notice.hidden = false;
    state.noticeTimer = window.setTimeout(() => {
      elements.notice.hidden = true;
    }, 3600);
  }

  function cancelTimer() {
    window.cancelAnimationFrame(state.timerFrame);
    state.timerFrame = 0;
  }

  function timerTick(now) {
    if (state.status !== "running") return;
    state.elapsedMs = now - state.startTime;
    const second = Math.floor(state.elapsedMs / 1000);
    if (second !== state.timerSecond) {
      state.timerSecond = second;
      elements.timeValue.textContent = formatTime(state.elapsedMs);
    }
    state.timerFrame = window.requestAnimationFrame(timerTick);
  }

  function beginTimer() {
    state.status = "running";
    state.startTime = performance.now() - state.elapsedMs;
    state.timerSecond = -1;
    updateRunState();
    state.timerFrame = window.requestAnimationFrame(timerTick);
  }

  function saveCompletedRecord(candidate) {
    const records = readRecords();
    const current = getBestRecord();
    const best = Core.pickBestRecord(current, candidate);
    const isNewRecord = current == null || best.elapsedMs !== current.elapsedMs || best.moves !== current.moves;
    if (isNewRecord) {
      records[recordKey()] = best;
      writeRecords(records);
    }
    return isNewRecord;
  }

  function finishGame() {
    state.elapsedMs = performance.now() - state.startTime;
    state.status = "complete";
    state.selectedIndex = null;
    cancelTimer();
    const candidate = { elapsedMs: Math.round(state.elapsedMs), moves: state.moves };
    const isNewRecord = saveCompletedRecord(candidate);
    renderBoard();
    updateMetrics();
    showBoardMessage("图像已恢复。查看成绩，或再来一局。");

    elements.completionCopy.textContent = `你用 ${formatTime(state.elapsedMs)} 和 ${state.moves} 次交换恢复了图像。`;
    elements.recordCopy.textContent = isNewRecord ? "NEW RECORD · 新的本机最佳纪录" : "本局完成，最佳纪录仍在等你刷新。";
    if (typeof elements.completionDialog.showModal === "function") elements.completionDialog.showModal();
    else elements.completionDialog.setAttribute("open", "");
  }

  function performSwap(sourceIndex, targetIndex, returnFocus = true) {
    if (state.status === "complete") return false;
    const result = Core.swapTiles(state.board, sourceIndex, targetIndex, state.dimension);
    if (!result.swapped) {
      state.selectedIndex = null;
      renderBoard();
      if (returnFocus) focusTile(sourceIndex);
      showBoardMessage("已取消选择。", true);
      return false;
    }

    if (state.status === "ready") beginTimer();
    state.board = result.board;
    state.moves += 1;
    state.elapsedMs = performance.now() - state.startTime;
    state.selectedIndex = null;
    state.focusIndex = targetIndex;
    clearDragState();

    if (Core.isSolved(state.board)) finishGame();
    else {
      renderBoard();
      updateMetrics();
      showBoardMessage(`已交换第 ${sourceIndex + 1} 格与第 ${targetIndex + 1} 格。`, true);
      if (returnFocus) focusTile(targetIndex);
    }
    return true;
  }

  function selectOrSwap(index, returnFocus = true) {
    if (state.status === "complete") return;
    state.focusIndex = index;
    if (state.selectedIndex === null) {
      state.selectedIndex = index;
      renderBoard();
      showBoardMessage("已选中第一块，再选择另一块进行交换。", true);
      if (returnFocus) focusTile(index);
      return;
    }
    performSwap(state.selectedIndex, index, returnFocus);
  }

  function closeCompletionDialog() {
    if (elements.completionDialog.open && typeof elements.completionDialog.close === "function") {
      elements.completionDialog.close();
    } else {
      elements.completionDialog.removeAttribute("open");
    }
  }

  function startNewGame(message = "新拼图已铺满，第一次交换开始计时。") {
    closeCompletionDialog();
    cancelTimer();
    state.board = Core.shuffleBoard(state.dimension);
    state.status = "ready";
    state.moves = 0;
    state.elapsedMs = 0;
    state.startTime = 0;
    state.timerSecond = -1;
    state.selectedIndex = null;
    state.focusIndex = 0;
    clearDragState();
    elements.previewLayer.classList.remove("is-active", "is-complete");
    elements.previewButton.classList.remove("is-held");
    renderBoard();
    updateMetrics();
    showBoardMessage("拖动一块到另一块上交换；也可以依次点击两块。第一次交换开始计时。");
    if (message) showNotice(message);
  }

  function syncDifficultyInputs() {
    for (const input of elements.difficultyInputs) input.checked = Number(input.value) === state.dimension;
  }

  function hideConfirmation() {
    elements.confirmStrip.hidden = true;
    state.pendingAction = null;
  }

  function requestAction(message, action) {
    if (state.status === "running" && state.moves > 0) {
      state.pendingAction = action;
      elements.confirmMessage.textContent = message;
      elements.confirmStrip.hidden = false;
      elements.confirmYes.focus();
      return;
    }
    action();
  }

  function setPreview(active) {
    if (state.status === "complete") return;
    elements.previewLayer.classList.toggle("is-active", active);
    elements.previewButton.classList.toggle("is-held", active);
  }

  function moveFocus(index, key) {
    const row = Math.floor(index / state.dimension);
    const column = index % state.dimension;
    const next = {
      ArrowLeft: column > 0 ? index - 1 : index,
      ArrowRight: column < state.dimension - 1 ? index + 1 : index,
      ArrowUp: row > 0 ? index - state.dimension : index,
      ArrowDown: row < state.dimension - 1 ? index + state.dimension : index
    }[key];
    focusTile(next);
  }

  function squareImage(imageUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const side = Math.min(image.naturalWidth, image.naturalHeight);
          const sourceX = (image.naturalWidth - side) / 2;
          const sourceY = (image.naturalHeight - side) / 2;
          const outputSize = Math.min(1024, side);
          const canvas = document.createElement("canvas");
          canvas.width = outputSize;
          canvas.height = outputSize;
          const context = canvas.getContext("2d");
          context.fillStyle = "#d8e0d0";
          context.fillRect(0, 0, outputSize, outputSize);
          context.drawImage(image, sourceX, sourceY, side, side, 0, 0, outputSize, outputSize);
          canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error("图片转换失败"));
          }, "image/webp", .86);
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error("图片内容无法读取"));
      image.src = imageUrl;
    });
  }

  async function loadImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showNotice("请选择 JPG、PNG、WebP 等图片文件。", true);
      elements.imageInput.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showNotice("图片超过 8 MB，请压缩后再试。", true);
      elements.imageInput.value = "";
      return;
    }

    let sourceUrl;
    try {
      sourceUrl = URL.createObjectURL(file);
      const imageBlob = await squareImage(sourceUrl);
      requestAction("换图会结束当前进度，继续使用这张图片吗？", () => {
        const previousImageUrl = state.imageUrl;
        state.imageUrl = URL.createObjectURL(imageBlob);
        state.imageKey = "local";
        state.imageName = file.name.length > 22 ? `${file.name.slice(0, 20)}…` : file.name;
        elements.defaultImageButton.classList.remove("is-active");
        startNewGame("本地图片已载入并裁成正方形。文件不会上传。" );
        if (previousImageUrl.startsWith("blob:")) URL.revokeObjectURL(previousImageUrl);
      });
    } catch {
      showNotice("图片内容无法识别，请换一张常见格式的图片。", true);
    } finally {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      elements.imageInput.value = "";
    }
  }

  function tileFromPoint(clientX, clientY) {
    return document.elementFromPoint(clientX, clientY)?.closest(".puzzle-tile") || null;
  }

  elements.puzzleGrid.addEventListener("click", event => {
    if (performance.now() < state.ignoreClickUntil) return;
    const tile = event.target.closest(".puzzle-tile");
    if (!tile) return;
    selectOrSwap(Number(tile.dataset.index), true);
  });

  elements.puzzleGrid.addEventListener("keydown", event => {
    const tile = event.target.closest(".puzzle-tile");
    if (!tile) return;
    const index = Number(tile.dataset.index);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      moveFocus(index, event.key);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOrSwap(index, true);
      return;
    }
    if (event.key === "Escape" && state.selectedIndex !== null) {
      event.preventDefault();
      state.selectedIndex = null;
      renderBoard();
      focusTile(index);
      showBoardMessage("已取消选择。", true);
    }
  });

  elements.puzzleGrid.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const tile = event.target.closest(".puzzle-tile");
    if (!tile) return;
    state.pointerSession = {
      pointerId: event.pointerId,
      sourceIndex: Number(tile.dataset.index),
      startX: event.clientX,
      startY: event.clientY,
      dragging: false
    };
    tile.setPointerCapture?.(event.pointerId);
  });

  elements.puzzleGrid.addEventListener("pointermove", event => {
    const session = state.pointerSession;
    if (!session || session.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
    if (!session.dragging && distance < 10) return;
    session.dragging = true;
    event.preventDefault();
    const target = tileFromPoint(event.clientX, event.clientY);
    const targetIndex = target ? Number(target.dataset.index) : null;
    const nextTargetIndex = targetIndex !== session.sourceIndex ? targetIndex : null;
    if (state.dragSourceIndex === session.sourceIndex && state.dragTargetIndex === nextTargetIndex) return;
    state.dragSourceIndex = session.sourceIndex;
    state.dragTargetIndex = nextTargetIndex;
    updateDragClasses();
  });

  elements.puzzleGrid.addEventListener("pointerup", event => {
    const session = state.pointerSession;
    if (!session || session.pointerId !== event.pointerId) return;
    const sourceIndex = session.sourceIndex;
    const targetIndex = state.dragTargetIndex;
    const wasDragging = session.dragging;
    clearDragState();
    if (!wasDragging) return;
    state.ignoreClickUntil = performance.now() + 350;
    if (targetIndex !== null) performSwap(sourceIndex, targetIndex, true);
    else showBoardMessage("未落在另一块图片上，本次没有交换。", true);
  });

  elements.puzzleGrid.addEventListener("pointercancel", () => {
    state.ignoreClickUntil = performance.now() + 350;
    clearDragState();
  });

  for (const input of elements.difficultyInputs) {
    input.addEventListener("change", () => {
      const nextDimension = Number(input.value);
      if (nextDimension === state.dimension) return;
      syncDifficultyInputs();
      requestAction(`切换到 ${nextDimension}×${nextDimension} 会结束当前进度，继续吗？`, () => {
        state.dimension = nextDimension;
        syncDifficultyInputs();
        startNewGame(`已切换为 ${nextDimension}×${nextDimension} 全图拼图。`);
      });
    });
  }

  elements.defaultImageButton.addEventListener("click", () => {
    if (state.imageKey === "desk") return;
    requestAction("恢复内置图会结束当前进度，继续吗？", () => {
      const previousImageUrl = state.imageUrl;
      state.imageUrl = DEFAULT_IMAGE;
      state.imageKey = "desk";
      state.imageName = "彩色创意桌面";
      elements.defaultImageButton.classList.add("is-active");
      startNewGame("已恢复彩色创意桌面图片。" );
      if (previousImageUrl.startsWith("blob:")) URL.revokeObjectURL(previousImageUrl);
    });
  });

  elements.imageInput.addEventListener("change", () => loadImageFile(elements.imageInput.files[0]));
  elements.shuffleButton.addEventListener("click", () => {
    requestAction("重新打乱会结束当前进度，继续吗？", () => startNewGame());
  });

  elements.confirmYes.addEventListener("click", () => {
    const action = state.pendingAction;
    hideConfirmation();
    action?.();
  });
  elements.confirmNo.addEventListener("click", () => {
    hideConfirmation();
    syncDifficultyInputs();
    showNotice("已保留当前拼图进度。" );
  });

  elements.previewButton.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    elements.previewButton.setPointerCapture?.(event.pointerId);
    setPreview(true);
  });
  elements.previewButton.addEventListener("contextmenu", event => event.preventDefault());
  elements.previewButton.addEventListener("selectstart", event => event.preventDefault());
  elements.previewButton.addEventListener("lostpointercapture", () => setPreview(false));
  window.addEventListener("pointerup", () => setPreview(false));
  window.addEventListener("pointercancel", () => setPreview(false));
  window.addEventListener("blur", () => setPreview(false));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPreview(false);
  });
  elements.previewButton.addEventListener("keydown", event => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    setPreview(true);
  });
  elements.previewButton.addEventListener("keyup", event => {
    if (event.key === " " || event.key === "Enter") setPreview(false);
  });
  elements.previewButton.addEventListener("blur", () => setPreview(false));

  elements.playAgainButton.addEventListener("click", () => startNewGame("新一轮全图拼图已就位。"));
  elements.closeDialogButton.addEventListener("click", closeCompletionDialog);
  window.addEventListener("pagehide", cancelTimer);

  startNewGame("");
})();
