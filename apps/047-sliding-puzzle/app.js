(function () {
  "use strict";

  const Core = window.PuzzleCore;
  const DEFAULT_IMAGE = "assets/default-puzzle.svg";
  const STORAGE_KEY = "shift47.records.v1";
  const MAX_FILE_SIZE = 8 * 1024 * 1024;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
    imageKey: "default",
    imageName: "内置信号塔",
    status: "ready",
    moves: 0,
    elapsedMs: 0,
    startTime: 0,
    timerFrame: 0,
    timerSecond: -1,
    pendingAction: null,
    noticeTimer: 0,
    helpTimer: 0,
    touchStart: null,
    suppressClickUntil: 0,
    trails: [],
    trailId: 0
  };

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
    return `${state.imageKey}-${state.dimension}`;
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
    elements.bestValue.title = best ? `最佳纪录：${best.moves} 步` : "暂无完成纪录";
  }

  function updateRunState() {
    const labels = {
      ready: "等待第一步",
      running: "信号修复中",
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

  function appendTrailMarkers() {
    for (const trail of state.trails) {
      const marker = document.createElement("span");
      marker.className = "trail-marker";
      marker.dataset.trailId = String(trail.id);
      marker.setAttribute("aria-hidden", "true");
      positionStyle(marker, trail.index);
      elements.puzzleGrid.append(marker);
    }
  }

  function renderBoard() {
    elements.puzzleGrid.replaceChildren();
    elements.puzzleGrid.style.setProperty("--size", state.dimension);
    elements.puzzleGrid.setAttribute(
      "aria-label",
      `${state.dimension} 乘 ${state.dimension} 滑块拼图，使用方向键移动空格`
    );
    const movable = new Set(Core.getMovableIndexes(state.board, state.dimension));

    state.board.forEach((tile, index) => {
      if (tile === 0) {
        const empty = document.createElement("div");
        empty.className = "puzzle-empty";
        empty.setAttribute("role", "gridcell");
        empty.setAttribute("aria-label", `第 ${index + 1} 格，空格`);
        positionStyle(empty, index);
        elements.puzzleGrid.append(empty);
        return;
      }

      const targetIndex = tile - 1;
      const targetRow = Math.floor(targetIndex / state.dimension);
      const targetColumn = targetIndex % state.dimension;
      const tileButton = document.createElement("button");
      tileButton.type = "button";
      tileButton.className = `puzzle-tile${movable.has(index) ? " is-movable" : ""}`;
      tileButton.dataset.index = String(index);
      tileButton.setAttribute("role", "gridcell");
      tileButton.setAttribute("aria-label", `方块 ${tile}，目标位置第 ${targetRow + 1} 行第 ${targetColumn + 1} 列`);
      tileButton.setAttribute("aria-disabled", movable.has(index) ? "false" : "true");
      tileButton.tabIndex = movable.has(index) ? 0 : -1;
      tileButton.style.backgroundImage = `url("${state.imageUrl}")`;
      tileButton.style.backgroundSize = `${state.dimension * 100}% ${state.dimension * 100}%`;
      const x = state.dimension === 1 ? 0 : targetColumn * 100 / (state.dimension - 1);
      const y = state.dimension === 1 ? 0 : targetRow * 100 / (state.dimension - 1);
      tileButton.style.backgroundPosition = `${x}% ${y}%`;
      positionStyle(tileButton, index);

      const number = document.createElement("span");
      number.className = "tile-number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(tile).padStart(2, "0");
      tileButton.append(number);
      elements.puzzleGrid.append(tileButton);
    });

    appendTrailMarkers();
    elements.previewLayer.style.backgroundImage = `url("${state.imageUrl}")`;
    elements.previewLayer.classList.toggle("is-complete", state.status === "complete");
    updateRunState();
  }

  function showBoardMessage(message, temporary = false) {
    window.clearTimeout(state.helpTimer);
    elements.boardHelp.textContent = message;
    if (temporary) {
      state.helpTimer = window.setTimeout(() => {
        elements.boardHelp.textContent = "点击相邻方块，或用方向键移动空格。";
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

  function addTrail(index) {
    if (reduceMotion.matches) return;
    const trail = { id: ++state.trailId, index };
    state.trails = [...state.trails.slice(-2), trail];
    window.setTimeout(() => {
      state.trails = state.trails.filter(item => item.id !== trail.id);
      elements.puzzleGrid.querySelector(`[data-trail-id="${trail.id}"]`)?.remove();
    }, 700);
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
    cancelTimer();
    const candidate = { elapsedMs: Math.round(state.elapsedMs), moves: state.moves };
    const isNewRecord = saveCompletedRecord(candidate);
    renderBoard();
    updateMetrics();
    showBoardMessage("图像已恢复。查看成绩，或再来一局。");

    elements.completionCopy.textContent = `你用 ${formatTime(state.elapsedMs)} 和 ${state.moves} 步恢复了信号。`;
    elements.recordCopy.textContent = isNewRecord ? "NEW RECORD · 新的本机最佳纪录" : "本局完成，最佳纪录仍在等你刷新。";
    if (typeof elements.completionDialog.showModal === "function") elements.completionDialog.showModal();
    else elements.completionDialog.setAttribute("open", "");
  }

  function tryMove(tileIndex, returnFocus = false) {
    if (state.status === "complete") return false;
    const previousEmpty = state.board.indexOf(0);
    const result = Core.moveTile(state.board, tileIndex, state.dimension);
    if (!result.moved) {
      showBoardMessage("这块离空格太远，只能移动相邻方块。", true);
      return false;
    }

    if (state.status === "ready") beginTimer();
    state.board = result.board;
    state.moves += 1;
    state.elapsedMs = performance.now() - state.startTime;
    addTrail(previousEmpty);

    if (Core.isSolved(state.board)) finishGame();
    else {
      renderBoard();
      updateMetrics();
      if (returnFocus) elements.puzzleGrid.focus({ preventScroll: true });
    }
    return true;
  }

  function closeCompletionDialog() {
    if (elements.completionDialog.open && typeof elements.completionDialog.close === "function") {
      elements.completionDialog.close();
    } else {
      elements.completionDialog.removeAttribute("open");
    }
  }

  function startNewGame(message = "新拼图已就位，第一步开始计时。") {
    closeCompletionDialog();
    cancelTimer();
    state.board = Core.shuffleBoard(state.dimension);
    state.status = "ready";
    state.moves = 0;
    state.elapsedMs = 0;
    state.startTime = 0;
    state.timerSecond = -1;
    state.trails = [];
    elements.previewLayer.classList.remove("is-active", "is-complete");
    elements.previewButton.classList.remove("is-held");
    renderBoard();
    updateMetrics();
    showBoardMessage("点击相邻方块，或用方向键移动空格。新局第一步开始计时。");
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

  function directionTarget(direction) {
    const emptyIndex = state.board.indexOf(0);
    const row = Math.floor(emptyIndex / state.dimension);
    const column = emptyIndex % state.dimension;
    const vectors = {
      left: [0, -1],
      right: [0, 1],
      up: [-1, 0],
      down: [1, 0]
    };
    const vector = vectors[direction];
    const nextRow = row + vector[0];
    const nextColumn = column + vector[1];
    if (nextRow < 0 || nextRow >= state.dimension || nextColumn < 0 || nextColumn >= state.dimension) return -1;
    return nextRow * state.dimension + nextColumn;
  }

  function moveDirection(direction) {
    const target = directionTarget(direction);
    if (target === -1) {
      showBoardMessage("空格已经到达这一侧边缘。", true);
      return;
    }
    tryMove(target, true);
  }

  function squareImage(dataUrl, mimeType) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - side) / 2;
        const sourceY = (image.naturalHeight - side) / 2;
        const outputSize = Math.min(1200, side);
        const canvas = document.createElement("canvas");
        canvas.width = outputSize;
        canvas.height = outputSize;
        const context = canvas.getContext("2d");
        context.fillStyle = "#d8e0d0";
        context.fillRect(0, 0, outputSize, outputSize);
        context.drawImage(image, sourceX, sourceY, side, side, 0, 0, outputSize, outputSize);
        const outputType = mimeType === "image/png" ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(outputType, .9));
      };
      image.onerror = () => reject(new Error("图片内容无法读取"));
      image.src = dataUrl;
    });
  }

  function loadImageFile(file) {
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

    const reader = new FileReader();
    reader.onerror = () => showNotice("图片读取失败，请换一张图片重试。", true);
    reader.onload = async () => {
      try {
        const imageUrl = await squareImage(String(reader.result), file.type);
        requestAction("换图会结束当前进度，继续使用这张图片吗？", () => {
          state.imageUrl = imageUrl;
          state.imageKey = "local";
          state.imageName = file.name.length > 22 ? `${file.name.slice(0, 20)}…` : file.name;
          elements.defaultImageButton.classList.remove("is-active");
          startNewGame("本地图片已载入并裁成正方形。文件不会上传。" );
        });
      } catch {
        showNotice("图片内容无法识别，请换一张常见格式的图片。", true);
      } finally {
        elements.imageInput.value = "";
      }
    };
    reader.readAsDataURL(file);
  }

  elements.puzzleGrid.addEventListener("click", event => {
    if (performance.now() < state.suppressClickUntil) return;
    const tile = event.target.closest(".puzzle-tile");
    if (!tile) return;
    tryMove(Number(tile.dataset.index), true);
  });

  elements.puzzleGrid.addEventListener("keydown", event => {
    const directions = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down"
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    moveDirection(direction);
  });

  elements.puzzleFrame.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse") return;
    state.touchStart = { x: event.clientX, y: event.clientY };
  });

  elements.puzzleFrame.addEventListener("pointerup", event => {
    if (!state.touchStart || event.pointerType === "mouse") return;
    const deltaX = event.clientX - state.touchStart.x;
    const deltaY = event.clientY - state.touchStart.y;
    state.touchStart = null;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
    state.suppressClickUntil = performance.now() + 300;
    if (Math.abs(deltaX) > Math.abs(deltaY)) moveDirection(deltaX < 0 ? "left" : "right");
    else moveDirection(deltaY < 0 ? "up" : "down");
  });

  elements.puzzleFrame.addEventListener("pointercancel", () => {
    state.touchStart = null;
  });

  for (const input of elements.difficultyInputs) {
    input.addEventListener("change", () => {
      const nextDimension = Number(input.value);
      if (nextDimension === state.dimension) return;
      syncDifficultyInputs();
      requestAction(`切换到 ${nextDimension}×${nextDimension} 会结束当前进度，继续吗？`, () => {
        state.dimension = nextDimension;
        syncDifficultyInputs();
        startNewGame(`已切换为 ${nextDimension}×${nextDimension} 拼图。`);
      });
    });
  }

  elements.defaultImageButton.addEventListener("click", () => {
    if (state.imageKey === "default") return;
    requestAction("恢复内置图会结束当前进度，继续吗？", () => {
      state.imageUrl = DEFAULT_IMAGE;
      state.imageKey = "default";
      state.imageName = "内置信号塔";
      elements.defaultImageButton.classList.add("is-active");
      startNewGame("已恢复内置信号塔图片。" );
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
    event.preventDefault();
    setPreview(true);
  });
  window.addEventListener("pointerup", () => setPreview(false));
  window.addEventListener("pointercancel", () => setPreview(false));
  elements.previewButton.addEventListener("keydown", event => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    setPreview(true);
  });
  elements.previewButton.addEventListener("keyup", event => {
    if (event.key === " " || event.key === "Enter") setPreview(false);
  });
  elements.previewButton.addEventListener("blur", () => setPreview(false));

  elements.playAgainButton.addEventListener("click", () => startNewGame("新一轮信号修复已就位。"));
  elements.closeDialogButton.addEventListener("click", closeCompletionDialog);

  window.addEventListener("pagehide", cancelTimer);

  startNewGame("");
})();
