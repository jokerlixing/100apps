(function exposeEditorCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EditorCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEditorCore() {
  "use strict";

  const DEFAULT_FILTERS = Object.freeze({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    sepia: 0,
    blur: 0,
  });

  const FILTER_PRESETS = Object.freeze({
    original: Object.freeze({ ...DEFAULT_FILTERS }),
    warm: Object.freeze({
      brightness: 106,
      contrast: 104,
      saturation: 112,
      grayscale: 0,
      sepia: 18,
      blur: 0,
    }),
    mono: Object.freeze({
      brightness: 102,
      contrast: 118,
      saturation: 0,
      grayscale: 100,
      sepia: 0,
      blur: 0,
    }),
    vivid: Object.freeze({
      brightness: 104,
      contrast: 112,
      saturation: 138,
      grayscale: 0,
      sepia: 0,
      blur: 0,
    }),
  });

  function clamp(value, minimum, maximum) {
    const safeMinimum = Number.isFinite(minimum) ? minimum : 0;
    const safeMaximum = Number.isFinite(maximum)
      ? Math.max(safeMinimum, maximum)
      : safeMinimum;
    if (!Number.isFinite(value)) return safeMinimum;
    return Math.min(safeMaximum, Math.max(safeMinimum, value));
  }

  function roundNormalized(value) {
    return Number(value.toFixed(6));
  }

  function normalizeCrop(crop) {
    const source = crop && typeof crop === "object" ? crop : {};
    const width = clamp(Number(source.width ?? 1), 0.05, 1);
    const height = clamp(Number(source.height ?? 1), 0.05, 1);
    const x = clamp(Number(source.x ?? 0), 0, 1 - width);
    const y = clamp(Number(source.y ?? 0), 0, 1 - height);

    return {
      x: roundNormalized(x),
      y: roundNormalized(y),
      width: roundNormalized(width),
      height: roundNormalized(height),
    };
  }

  function makeAspectCrop(sourceWidth, sourceHeight, ratio) {
    if (
      !Number.isFinite(sourceWidth) || sourceWidth <= 0 ||
      !Number.isFinite(sourceHeight) || sourceHeight <= 0 ||
      !Number.isFinite(ratio) || ratio <= 0
    ) {
      return normalizeCrop();
    }

    const sourceRatio = sourceWidth / sourceHeight;
    if (sourceRatio > ratio) {
      const width = ratio / sourceRatio;
      return normalizeCrop({ x: (1 - width) / 2, y: 0, width, height: 1 });
    }

    const height = sourceRatio / ratio;
    return normalizeCrop({ x: 0, y: (1 - height) / 2, width: 1, height });
  }

  function mapCrop(baseCrop, childCrop) {
    const base = normalizeCrop(baseCrop);
    const child = normalizeCrop(childCrop);
    return normalizeCrop({
      x: base.x + (child.x * base.width),
      y: base.y + (child.y * base.height),
      width: child.width * base.width,
      height: child.height * base.height,
    });
  }

  function filterValue(filters, key, minimum, maximum, fallback) {
    const value = Number(filters && filters[key]);
    return Number.isFinite(value) ? clamp(value, minimum, maximum) : fallback;
  }

  function buildCanvasFilter(filters) {
    const brightness = filterValue(filters, "brightness", 0, 200, 100);
    const contrast = filterValue(filters, "contrast", 0, 200, 100);
    const saturation = filterValue(filters, "saturation", 0, 200, 100);
    const grayscale = filterValue(filters, "grayscale", 0, 100, 0);
    const sepia = filterValue(filters, "sepia", 0, 100, 0);
    const blur = filterValue(filters, "blur", 0, 12, 0);
    return [
      `brightness(${brightness}%)`,
      `contrast(${contrast}%)`,
      `saturate(${saturation}%)`,
      `grayscale(${grayscale}%)`,
      `sepia(${sepia}%)`,
      `blur(${blur}px)`,
    ].join(" ");
  }

  function getOutputDimensions(sourceWidth, sourceHeight, crop, scale = 1) {
    const width = Number.isFinite(sourceWidth) ? Math.max(1, sourceWidth) : 1;
    const height = Number.isFinite(sourceHeight) ? Math.max(1, sourceHeight) : 1;
    const safeCrop = normalizeCrop(crop);
    const safeScale = Number.isFinite(scale) && scale > 0 ? clamp(scale, 0.05, 1) : 1;
    return {
      width: Math.max(1, Math.round(width * safeCrop.width * safeScale)),
      height: Math.max(1, Math.round(height * safeCrop.height * safeScale)),
    };
  }

  function exportExtension(mimeType) {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/webp") return "webp";
    return "png";
  }

  function buildExportName(originalName, mimeType, date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join("");
    const withoutExtension = String(originalName || "")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    const base = withoutExtension || "image";
    return `${base}-PRISM60-${stamp}.${exportExtension(mimeType)}`;
  }

  return {
    DEFAULT_FILTERS,
    FILTER_PRESETS,
    buildCanvasFilter,
    buildExportName,
    clamp,
    exportExtension,
    getOutputDimensions,
    makeAspectCrop,
    mapCrop,
    normalizeCrop,
  };
});
