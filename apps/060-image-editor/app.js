(function initializePrismWorkspace() {
  "use strict";

  const Core = window.EditorCore;
  if (!Core) return;

  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 40_000_000;
  const MAX_HISTORY = 30;
  const DEFAULT_TEXT = Object.freeze({
    content: "",
    size: 7,
    color: "#ffffff",
    align: "center",
    position: "center",
  });

  const elements = {
    applyCropButton: document.querySelector("#applyCropButton"),
    brightnessCalibration: document.querySelector("#calibrationBrightness"),
    cancelCropButton: document.querySelector("#cancelCropButton"),
    canvasShell: document.querySelector("#canvasShell"),
    canvasViewport: document.querySelector("#canvasViewport"),
    clearTextButton: document.querySelector("#clearTextButton"),
    colorValue: document.querySelector("#colorValue"),
    contrastCalibration: document.querySelector("#calibrationContrast"),
    cropBox: document.querySelector("#cropBox"),
    cropOverlay: document.querySelector("#cropOverlay"),
    cropSize: document.querySelector("#cropSize"),
    cropState: document.querySelector("#cropState"),
    dropZone: document.querySelector("#dropZone"),
    exportButton: document.querySelector("#exportButton"),
    exportCanvas: document.querySelector("#exportCanvas"),
    exportDimensions: document.querySelector("#exportDimensions"),
    fileDimensions: document.querySelector("#fileDimensions"),
    fileInput: document.querySelector("#fileInput"),
    fileName: document.querySelector("#fileName"),
    formatSelect: document.querySelector("#formatSelect"),
    loadDemoButton: document.querySelector("#loadDemoButton"),
    outputReadout: document.querySelector("#outputReadout"),
    previewCanvas: document.querySelector("#previewCanvas"),
    qualityInput: document.querySelector("#qualityInput"),
    qualityValue: document.querySelector("#qualityValue"),
    redoButton: document.querySelector("#redoButton"),
    resetButton: document.querySelector("#resetButton"),
    resetFiltersButton: document.querySelector("#resetFiltersButton"),
    saturationCalibration: document.querySelector("#calibrationSaturation"),
    sourceBadge: document.querySelector("#sourceBadge"),
    statusMessage: document.querySelector("#statusMessage"),
    statusToast: document.querySelector("#statusToast"),
    textColorInput: document.querySelector("#textColorInput"),
    textCount: document.querySelector("#textCount"),
    textInput: document.querySelector("#textInput"),
    textSizeInput: document.querySelector("#textSizeInput"),
    textSizeValue: document.querySelector("#textSizeValue"),
    topExportButton: document.querySelector("#topExportButton"),
    undoButton: document.querySelector("#undoButton"),
    viewModeLabel: document.querySelector("#viewModeLabel"),
    zoomReadout: document.querySelector("#zoomReadout"),
  };

  const filterInputs = [...document.querySelectorAll("[data-filter]")];
  const presetButtons = [...document.querySelectorAll("[data-preset]")];
  const ratioButtons = [...document.querySelectorAll("[data-ratio]")];
  const alignButtons = [...document.querySelectorAll("[data-align]")];
  const positionButtons = [...document.querySelectorAll("[data-position]")];
  const scaleButtons = [...document.querySelectorAll("[data-scale]")];
  const toolButtons = [...document.querySelectorAll("[data-scroll-to]")];

  let sourceImage = null;
  let sourceName = "AFTERGLOW-DEMO.PNG";
  let sourceIsDemo = true;
  let renderFrame = 0;
  let statusTimer = 0;
  let cropMode = false;
  let cropDraft = Core.normalizeCrop();
  let activeRatio = "free";
  let pointerSession = null;
  let history = [];
  let historyIndex = -1;
  let exportSettings = {
    format: "image/png",
    quality: 0.92,
    scale: 1,
  };
  let recipe = freshRecipe();

  function freshRecipe() {
    return {
      crop: Core.normalizeCrop(),
      filters: { ...Core.DEFAULT_FILTERS },
      text: { ...DEFAULT_TEXT },
    };
  }

  function snapshotRecipe() {
    return JSON.stringify(recipe);
  }

  function showStatus(message, type = "success", duration = 3600) {
    window.clearTimeout(statusTimer);
    elements.statusMessage.textContent = message;
    elements.statusToast.classList.remove("is-hidden", "is-error");
    elements.statusToast.classList.toggle("is-error", type === "error");
    if (duration > 0) {
      statusTimer = window.setTimeout(() => {
        elements.statusToast.classList.add("is-hidden");
      }, duration);
    }
  }

  function resetHistory() {
    history = [snapshotRecipe()];
    historyIndex = 0;
    updateHistoryButtons();
  }

  function commitHistory(message) {
    const snapshot = snapshotRecipe();
    if (history[historyIndex] === snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    if (history.length > MAX_HISTORY) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
    if (message) showStatus(message);
  }

  function restoreHistory(index) {
    if (index < 0 || index >= history.length) return;
    historyIndex = index;
    recipe = JSON.parse(history[historyIndex]);
    leaveCropMode();
    syncControls();
    requestRender();
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    elements.undoButton.disabled = historyIndex <= 0;
    elements.redoButton.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
  }

  function undo() {
    if (historyIndex <= 0) return;
    restoreHistory(historyIndex - 1);
    showStatus("已撤销上一步编辑。");
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    restoreHistory(historyIndex + 1);
    showStatus("已恢复下一步编辑。");
  }

  function currentSourceSize() {
    if (!sourceImage) return { width: 1, height: 1 };
    return {
      width: sourceImage.naturalWidth || sourceImage.width || 1,
      height: sourceImage.naturalHeight || sourceImage.height || 1,
    };
  }

  function drawTextOverlay(context, width, height) {
    const text = recipe.text.content.trim();
    if (!text) return;

    const fontSize = Math.max(12, width * (recipe.text.size / 100));
    const horizontalMargin = width * 0.065;
    const verticalMargin = height * 0.07;
    let x = width / 2;
    if (recipe.text.align === "left") x = horizontalMargin;
    if (recipe.text.align === "right") x = width - horizontalMargin;

    let y = height / 2;
    if (recipe.text.position === "top") y = verticalMargin + (fontSize / 2);
    if (recipe.text.position === "bottom") y = height - verticalMargin - (fontSize / 2);

    context.save();
    context.filter = "none";
    context.font = `700 ${fontSize}px "Arial Narrow", "Segoe UI", sans-serif`;
    context.textAlign = recipe.text.align;
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.shadowColor = "rgba(0, 0, 0, 0.58)";
    context.shadowBlur = Math.max(4, fontSize * 0.12);
    context.shadowOffsetY = Math.max(2, fontSize * 0.04);
    context.strokeStyle = "rgba(0, 0, 0, 0.28)";
    context.lineWidth = Math.max(1, fontSize * 0.025);
    context.strokeText(text, x, y, width * 0.88);
    context.fillStyle = recipe.text.color;
    context.fillText(text, x, y, width * 0.88);
    context.restore();
  }

  function renderScene(canvas, width, height, options = {}) {
    if (!sourceImage) return;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext("2d");
    const source = currentSourceSize();
    const crop = Core.normalizeCrop(recipe.crop);

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (options.background) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.save();
    context.filter = Core.buildCanvasFilter(recipe.filters);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      sourceImage,
      crop.x * source.width,
      crop.y * source.height,
      crop.width * source.width,
      crop.height * source.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    context.restore();
    drawTextOverlay(context, canvas.width, canvas.height);
  }

  function requestRender() {
    window.cancelAnimationFrame(renderFrame);
    renderFrame = window.requestAnimationFrame(renderPreview);
  }

  function renderPreview() {
    if (!sourceImage) return;
    const source = currentSourceSize();
    const dimensions = Core.getOutputDimensions(source.width, source.height, recipe.crop, 1);
    const previewScale = Math.min(1, 1440 / dimensions.width, 1080 / dimensions.height);
    const previewWidth = Math.max(1, Math.round(dimensions.width * previewScale));
    const previewHeight = Math.max(1, Math.round(dimensions.height * previewScale));
    renderScene(elements.previewCanvas, previewWidth, previewHeight);
    updateReadouts();
    window.requestAnimationFrame(() => {
      updateCropBox();
      const renderedWidth = elements.previewCanvas.clientWidth || previewWidth;
      const displayScale = Math.round((renderedWidth / dimensions.width) * 100);
      elements.zoomReadout.textContent = `适合窗口 · ${Math.max(1, displayScale)}%`;
    });
  }

  function updateReadouts() {
    if (!sourceImage) return;
    const source = currentSourceSize();
    const originalOutput = Core.getOutputDimensions(source.width, source.height, recipe.crop, 1);
    const exportOutput = Core.getOutputDimensions(
      source.width,
      source.height,
      recipe.crop,
      exportSettings.scale,
    );
    elements.fileName.textContent = sourceName;
    elements.fileDimensions.textContent = `${source.width} × ${source.height} PX`;
    elements.sourceBadge.textContent = sourceIsDemo ? "样例画面" : "本地图片";
    elements.outputReadout.textContent = `输出 ${originalOutput.width} × ${originalOutput.height} PX`;
    elements.exportDimensions.textContent = `${exportOutput.width} × ${exportOutput.height}`;
    elements.cropState.textContent = recipe.crop.width < 0.999 || recipe.crop.height < 0.999
      ? "已裁剪"
      : "原画幅";
    elements.brightnessCalibration.textContent = Math.round(recipe.filters.brightness);
    elements.saturationCalibration.textContent = Math.round(recipe.filters.saturation);
    elements.contrastCalibration.textContent = Math.round(recipe.filters.contrast);
  }

  function syncControls() {
    filterInputs.forEach((input) => {
      const key = input.dataset.filter;
      input.value = recipe.filters[key];
      const output = document.querySelector(`#${key}Value`);
      if (output) output.value = recipe.filters[key];
    });

    presetButtons.forEach((button) => {
      const preset = Core.FILTER_PRESETS[button.dataset.preset];
      const matches = Object.keys(Core.DEFAULT_FILTERS)
        .every((key) => Number(preset[key]) === Number(recipe.filters[key]));
      button.classList.toggle("is-selected", matches);
    });

    elements.textInput.value = recipe.text.content;
    elements.textCount.textContent = `${recipe.text.content.length} / 80`;
    elements.textSizeInput.value = recipe.text.size;
    elements.textSizeValue.value = `${recipe.text.size}%`;
    elements.textColorInput.value = recipe.text.color;
    elements.colorValue.textContent = recipe.text.color.toUpperCase();

    alignButtons.forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.align === recipe.text.align);
    });
    positionButtons.forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.position === recipe.text.position);
    });
    ratioButtons.forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.ratio === activeRatio);
    });
    scaleButtons.forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.scale) === exportSettings.scale);
    });

    elements.formatSelect.value = exportSettings.format;
    elements.qualityInput.value = Math.round(exportSettings.quality * 100);
    elements.qualityValue.value = `${Math.round(exportSettings.quality * 100)}%`;
    elements.qualityInput.disabled = exportSettings.format === "image/png";
    updateReadouts();
  }

  function enterCropMode(ratioValue = activeRatio) {
    if (!sourceImage) return;
    activeRatio = String(ratioValue || "free");
    const source = currentSourceSize();
    const baseWidth = source.width * recipe.crop.width;
    const baseHeight = source.height * recipe.crop.height;
    const numericRatio = activeRatio === "free" ? 0 : Number(activeRatio);
    cropDraft = Core.makeAspectCrop(baseWidth, baseHeight, numericRatio);
    cropMode = true;
    elements.cropOverlay.hidden = false;
    elements.applyCropButton.textContent = "应用裁剪";
    elements.cancelCropButton.hidden = false;
    elements.viewModeLabel.textContent = "裁剪预览";
    elements.cropState.textContent = "调整中";
    syncControls();
    window.requestAnimationFrame(updateCropBox);
  }

  function leaveCropMode() {
    cropMode = false;
    pointerSession = null;
    elements.cropOverlay.hidden = true;
    elements.applyCropButton.textContent = "开始裁剪";
    elements.cancelCropButton.hidden = true;
    elements.viewModeLabel.textContent = "编辑预览";
    if (sourceImage) updateReadouts();
  }

  function applyCrop() {
    if (!cropMode) {
      enterCropMode(activeRatio);
      return;
    }
    recipe.crop = Core.mapCrop(recipe.crop, cropDraft);
    leaveCropMode();
    commitHistory("裁剪已应用，仍可通过撤销恢复原画幅。");
    requestRender();
  }

  function updateCropBox() {
    if (!cropMode || elements.cropOverlay.hidden) return;
    const crop = Core.normalizeCrop(cropDraft);
    elements.cropBox.style.left = `${crop.x * 100}%`;
    elements.cropBox.style.top = `${crop.y * 100}%`;
    elements.cropBox.style.width = `${crop.width * 100}%`;
    elements.cropBox.style.height = `${crop.height * 100}%`;
    const source = currentSourceSize();
    const width = Math.round(source.width * recipe.crop.width * crop.width);
    const height = Math.round(source.height * recipe.crop.height * crop.height);
    elements.cropSize.textContent = `${width} × ${height}`;
  }

  function startCropPointer(event) {
    if (!cropMode || event.button !== 0) return;
    const bounds = elements.cropOverlay.getBoundingClientRect();
    const handle = event.target.closest("[data-handle]");
    pointerSession = {
      startX: event.clientX,
      startY: event.clientY,
      bounds,
      crop: { ...cropDraft },
      action: handle ? handle.dataset.handle : "move",
    };
    elements.cropBox.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveCropPointer(event) {
    if (!pointerSession || !cropMode) return;
    const deltaX = (event.clientX - pointerSession.startX) / Math.max(1, pointerSession.bounds.width);
    const deltaY = (event.clientY - pointerSession.startY) / Math.max(1, pointerSession.bounds.height);
    const start = pointerSession.crop;
    const action = pointerSession.action;
    const minimum = 0.05;
    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;

    if (action === "move") {
      left = Core.clamp(start.x + deltaX, 0, 1 - start.width);
      top = Core.clamp(start.y + deltaY, 0, 1 - start.height);
      right = left + start.width;
      bottom = top + start.height;
    } else {
      if (action.includes("w")) left = Core.clamp(start.x + deltaX, 0, right - minimum);
      if (action.includes("e")) right = Core.clamp(right + deltaX, left + minimum, 1);
      if (action.includes("n")) top = Core.clamp(start.y + deltaY, 0, bottom - minimum);
      if (action.includes("s")) bottom = Core.clamp(bottom + deltaY, top + minimum, 1);
    }

    cropDraft = Core.normalizeCrop({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
    updateCropBox();
    event.preventDefault();
  }

  function endCropPointer(event) {
    if (!pointerSession) return;
    pointerSession = null;
    if (elements.cropBox.hasPointerCapture(event.pointerId)) {
      elements.cropBox.releasePointerCapture(event.pointerId);
    }
  }

  function createDemoDataUrl() {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const context = canvas.getContext("2d");
    const sky = context.createLinearGradient(0, 0, 1600, 1000);
    sky.addColorStop(0, "#17324a");
    sky.addColorStop(0.42, "#72577b");
    sky.addColorStop(0.72, "#f28f6c");
    sky.addColorStop(1, "#f7c96f");
    context.fillStyle = sky;
    context.fillRect(0, 0, 1600, 1000);

    const sun = context.createRadialGradient(1180, 280, 15, 1180, 280, 240);
    sun.addColorStop(0, "rgba(255,244,190,0.98)");
    sun.addColorStop(0.35, "rgba(255,209,102,0.82)");
    sun.addColorStop(1, "rgba(255,107,157,0)");
    context.fillStyle = sun;
    context.fillRect(900, 0, 700, 600);

    context.fillStyle = "rgba(13, 34, 47, 0.42)";
    context.beginPath();
    context.moveTo(0, 740);
    context.bezierCurveTo(260, 570, 480, 650, 730, 510);
    context.bezierCurveTo(950, 390, 1160, 610, 1600, 430);
    context.lineTo(1600, 1000);
    context.lineTo(0, 1000);
    context.closePath();
    context.fill();

    context.fillStyle = "rgba(8, 24, 32, 0.72)";
    context.beginPath();
    context.moveTo(0, 860);
    context.bezierCurveTo(340, 650, 560, 860, 900, 650);
    context.bezierCurveTo(1160, 500, 1330, 720, 1600, 620);
    context.lineTo(1600, 1000);
    context.lineTo(0, 1000);
    context.closePath();
    context.fill();

    context.fillStyle = "rgba(234, 240, 242, 0.92)";
    context.font = "700 124px Arial Narrow, Arial, sans-serif";
    context.fillText("AFTERGLOW", 112, 182);
    context.font = "26px Cascadia Mono, monospace";
    context.fillStyle = "rgba(234, 240, 242, 0.78)";
    context.fillText("A LOCAL COLOR STUDY · PRISM / 060", 120, 228);

    const colors = ["#ff6b6b", "#78d7a9", "#58d6e7"];
    colors.forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(120 + (index * 104), 264, 84, 6);
    });
    return canvas.toDataURL("image/png");
  }

  function decodeImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片解码失败"));
      image.src = url;
    });
  }

  function installSource(image, name, isDemo) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("图片没有可读取的尺寸");
    if ((width * height) > MAX_IMAGE_PIXELS) {
      throw new Error("图片超过 4000 万像素，请先缩小后再导入");
    }

    sourceImage = image;
    sourceName = String(name || "image.png").toUpperCase();
    sourceIsDemo = Boolean(isDemo);
    recipe = freshRecipe();
    activeRatio = "free";
    leaveCropMode();
    resetHistory();
    syncControls();
    requestRender();
  }

  async function loadDemo() {
    try {
      const image = await decodeImage(createDemoDataUrl());
      installSource(image, "AFTERGLOW-DEMO.PNG", true);
      showStatus("样例画面已就绪，可以直接试用或导入自己的图片。", "success", 5200);
    } catch (error) {
      showStatus(error.message || "样例画面载入失败。", "error", 0);
    }
  }

  async function loadFile(file) {
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!file || !allowedTypes.has(file.type)) {
      showStatus("请选择 PNG、JPEG 或 WebP 图片；SVG 与其他文件不会载入。", "error", 0);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showStatus("图片超过 20 MB，请压缩后再导入。", "error", 0);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      showStatus("正在读取本地图片…", "success", 0);
      const image = await decodeImage(objectUrl);
      installSource(image, file.name, false);
      showStatus(`已载入 ${file.name}，原图仍只保存在当前浏览器中。`);
    } catch (error) {
      showStatus(error.message || "无法读取这张图片，请尝试重新导出后再导入。", "error", 0);
    } finally {
      URL.revokeObjectURL(objectUrl);
      elements.fileInput.value = "";
    }
  }

  function resetRecipe() {
    recipe = freshRecipe();
    activeRatio = "free";
    leaveCropMode();
    syncControls();
    commitHistory("已复原裁剪、调色和文字设置。");
    requestRender();
  }

  function applyFilterPreset(name) {
    const preset = Core.FILTER_PRESETS[name];
    if (!preset) return;
    recipe.filters = { ...preset };
    syncControls();
    requestRender();
    const presetNames = { original: "原片", warm: "暖光", mono: "黑白", vivid: "鲜明" };
    commitHistory(`已应用${presetNames[name]}预设。`);
  }

  async function exportImage() {
    if (!sourceImage) return;
    if (cropMode) {
      showStatus("请先应用或取消当前裁剪，再导出图片。", "error");
      return;
    }

    const source = currentSourceSize();
    const dimensions = Core.getOutputDimensions(
      source.width,
      source.height,
      recipe.crop,
      exportSettings.scale,
    );
    if ((dimensions.width * dimensions.height) > MAX_IMAGE_PIXELS) {
      showStatus("当前导出超过 4000 万像素，请选择 75% 或 50% 尺寸。", "error", 0);
      return;
    }

    elements.exportButton.disabled = true;
    elements.topExportButton.disabled = true;
    showStatus(`正在生成 ${dimensions.width} × ${dimensions.height} 图片…`, "success", 0);

    try {
      renderScene(elements.exportCanvas, dimensions.width, dimensions.height, {
        background: exportSettings.format === "image/jpeg" ? "#111820" : null,
      });
      const blob = await new Promise((resolve, reject) => {
        elements.exportCanvas.toBlob(
          (result) => result ? resolve(result) : reject(new Error("浏览器没有生成图片数据")),
          exportSettings.format,
          exportSettings.quality,
        );
      });
      const actualMime = blob.type || exportSettings.format;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const downloadName = Core.buildExportName(sourceName, actualMime);
      link.href = url;
      link.download = downloadName;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus(`已导出 ${downloadName}，文件保存在浏览器下载目录。`, "success", 5200);
    } catch (error) {
      showStatus(error.message || "导出失败，请降低尺寸后重试。", "error", 0);
    } finally {
      elements.exportButton.disabled = false;
      elements.topExportButton.disabled = false;
    }
  }

  filterInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.filter;
      recipe.filters[key] = Number(input.value);
      const output = document.querySelector(`#${key}Value`);
      if (output) output.value = input.value;
      presetButtons.forEach((button) => button.classList.remove("is-selected"));
      requestRender();
    });
    input.addEventListener("change", () => commitHistory("调色参数已更新。"));
  });

  presetButtons.forEach((button) => {
    button.addEventListener("click", () => applyFilterPreset(button.dataset.preset));
  });

  ratioButtons.forEach((button) => {
    button.addEventListener("click", () => enterCropMode(button.dataset.ratio));
  });

  alignButtons.forEach((button) => {
    button.addEventListener("click", () => {
      recipe.text.align = button.dataset.align;
      syncControls();
      requestRender();
      commitHistory("文字对齐方式已更新。");
    });
  });

  positionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      recipe.text.position = button.dataset.position;
      syncControls();
      requestRender();
      commitHistory("文字位置已更新。");
    });
  });

  scaleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      exportSettings.scale = Number(button.dataset.scale);
      syncControls();
      showStatus(`导出尺寸已设为 ${button.textContent.trim()}。`);
    });
  });

  toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      toolButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      const section = document.querySelector(`#${button.dataset.scrollTo}`);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  elements.textInput.addEventListener("input", () => {
    recipe.text.content = elements.textInput.value.slice(0, 80);
    elements.textCount.textContent = `${recipe.text.content.length} / 80`;
    requestRender();
  });
  elements.textInput.addEventListener("change", () => commitHistory("画面文字已更新。"));

  elements.textSizeInput.addEventListener("input", () => {
    recipe.text.size = Number(elements.textSizeInput.value);
    elements.textSizeValue.value = `${recipe.text.size}%`;
    requestRender();
  });
  elements.textSizeInput.addEventListener("change", () => commitHistory("文字大小已更新。"));

  elements.textColorInput.addEventListener("input", () => {
    recipe.text.color = elements.textColorInput.value;
    elements.colorValue.textContent = recipe.text.color.toUpperCase();
    requestRender();
  });
  elements.textColorInput.addEventListener("change", () => commitHistory("文字颜色已更新。"));

  elements.clearTextButton.addEventListener("click", () => {
    recipe.text.content = "";
    syncControls();
    requestRender();
    commitHistory("画面文字已清除。");
  });

  elements.resetFiltersButton.addEventListener("click", () => applyFilterPreset("original"));
  elements.resetButton.addEventListener("click", resetRecipe);
  elements.applyCropButton.addEventListener("click", applyCrop);
  elements.cancelCropButton.addEventListener("click", () => {
    leaveCropMode();
    showStatus("已取消本次裁剪调整。");
  });
  elements.undoButton.addEventListener("click", undo);
  elements.redoButton.addEventListener("click", redo);
  elements.loadDemoButton.addEventListener("click", loadDemo);
  elements.exportButton.addEventListener("click", exportImage);
  elements.topExportButton.addEventListener("click", exportImage);
  elements.fileInput.addEventListener("change", () => loadFile(elements.fileInput.files?.[0]));

  elements.formatSelect.addEventListener("change", () => {
    exportSettings.format = elements.formatSelect.value;
    syncControls();
    showStatus(`导出格式已设为 ${elements.formatSelect.selectedOptions[0].textContent}。`);
  });

  elements.qualityInput.addEventListener("input", () => {
    exportSettings.quality = Number(elements.qualityInput.value) / 100;
    elements.qualityValue.value = `${elements.qualityInput.value}%`;
  });

  elements.cropBox.addEventListener("pointerdown", startCropPointer);
  elements.cropBox.addEventListener("pointermove", moveCropPointer);
  elements.cropBox.addEventListener("pointerup", endCropPointer);
  elements.cropBox.addEventListener("pointercancel", endCropPointer);

  let dragDepth = 0;
  elements.dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    elements.dropZone.classList.add("is-dragging");
  });
  elements.dropZone.addEventListener("dragover", (event) => event.preventDefault());
  elements.dropZone.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) elements.dropZone.classList.remove("is-dragging");
  });
  elements.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    elements.dropZone.classList.remove("is-dragging");
    loadFile(event.dataTransfer?.files?.[0]);
  });

  window.addEventListener("paste", (event) => {
    const imageFile = [...(event.clipboardData?.files || [])]
      .find((file) => file.type.startsWith("image/"));
    if (!imageFile) return;
    event.preventDefault();
    loadFile(imageFile);
  });

  window.addEventListener("keydown", (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier || event.altKey) return;
    if (event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redo();
    } else if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
  });

  window.addEventListener("resize", () => {
    window.requestAnimationFrame(updateCropBox);
  });

  syncControls();
  updateHistoryButtons();
  loadDemo();
})();
