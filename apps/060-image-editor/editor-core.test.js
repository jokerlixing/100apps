const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FILTER_PRESETS,
  buildCanvasFilter,
  buildExportName,
  clamp,
  getOutputDimensions,
  makeAspectCrop,
  mapCrop,
  normalizeCrop,
} = require("./editor-core.js");

test("clamp keeps finite values inside the requested range", () => {
  assert.equal(clamp(8, 0, 10), 8);
  assert.equal(clamp(-4, 0, 10), 0);
  assert.equal(clamp(18, 0, 10), 10);
  assert.equal(clamp(Number.NaN, 2, 8), 2);
});

test("makeAspectCrop centers a square inside landscape and portrait sources", () => {
  assert.deepEqual(makeAspectCrop(1600, 900, 1), {
    x: 0.21875,
    y: 0,
    width: 0.5625,
    height: 1,
  });
  assert.deepEqual(makeAspectCrop(900, 1600, 1), {
    x: 0,
    y: 0.21875,
    width: 1,
    height: 0.5625,
  });
});

test("makeAspectCrop returns the full frame for free or invalid ratios", () => {
  assert.deepEqual(makeAspectCrop(1600, 900, 0), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  assert.deepEqual(makeAspectCrop(0, 0, 1), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
});

test("normalizeCrop clamps a crop to the image and preserves a minimum size", () => {
  assert.deepEqual(normalizeCrop({ x: -0.2, y: 0.9, width: 1.4, height: 0.01 }), {
    x: 0,
    y: 0.9,
    width: 1,
    height: 0.05,
  });
});

test("mapCrop maps a child selection into an existing crop", () => {
  assert.deepEqual(
    mapCrop(
      { x: 0.1, y: 0.2, width: 0.8, height: 0.5 },
      { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
    ),
    { x: 0.3, y: 0.25, width: 0.4, height: 0.4 },
  );
});

test("buildCanvasFilter serializes safe Canvas filter units", () => {
  assert.equal(
    buildCanvasFilter({
      brightness: 112,
      contrast: 90,
      saturation: 140,
      grayscale: 25,
      sepia: 10,
      blur: 1.25,
    }),
    "brightness(112%) contrast(90%) saturate(140%) grayscale(25%) sepia(10%) blur(1.25px)",
  );
  assert.equal(buildCanvasFilter({ brightness: 999, blur: -5 }),
    "brightness(200%) contrast(100%) saturate(100%) grayscale(0%) sepia(0%) blur(0px)");
});

test("filter presets expose independent editable objects", () => {
  assert.deepEqual(FILTER_PRESETS.original, {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    grayscale: 0,
    sepia: 0,
    blur: 0,
  });
  assert.equal(FILTER_PRESETS.warm.brightness, 106);
  assert.equal(FILTER_PRESETS.mono.grayscale, 100);
  assert.equal(FILTER_PRESETS.vivid.saturation, 138);
});

test("getOutputDimensions scales the normalized crop to positive pixels", () => {
  assert.deepEqual(
    getOutputDimensions(4000, 3000, { x: 0.25, y: 0, width: 0.5, height: 1 }, 0.75),
    { width: 1500, height: 2250 },
  );
  assert.deepEqual(getOutputDimensions(0, 0, null, -1), { width: 1, height: 1 });
});

test("buildExportName creates a safe PRISM timestamped filename", () => {
  const date = new Date(2026, 7, 30, 23, 4, 9);
  assert.equal(
    buildExportName("海边 poster.final.jpg", "image/webp", date),
    "poster-final-PRISM60-20260830-230409.webp",
  );
  assert.equal(buildExportName("", "image/unknown", date),
    "image-PRISM60-20260830-230409.png");
});
