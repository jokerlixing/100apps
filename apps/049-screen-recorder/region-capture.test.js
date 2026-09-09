const test = require("node:test");
const assert = require("node:assert/strict");
const { sourcePoint, rectangleFromPoints, isValidRegion, outputDimensions } = require("./region-capture.js");

test("screen coordinates map into native screenshot pixels after responsive scaling", () => {
  assert.deepEqual(sourcePoint(340, 205, { left: 100, top: 70, width: 960, height: 540 }, 3840, 2160), { x: 960, y: 540 });
  assert.deepEqual(sourcePoint(25, 900, { left: 100, top: 70, width: 960, height: 540 }, 3840, 2160), { x: 0, y: 2160 });
});

test("coordinate conversion rejects a screenshot with no visible dimensions", () => {
  assert.throws(() => sourcePoint(1, 1, { left: 0, top: 0, width: 0, height: 100 }, 1920, 1080), RangeError);
});

test("forward and reverse drags produce the same native rectangle", () => {
  const start = { x: 170, y: 91 };
  const end = { x: 1520, y: 890 };
  assert.deepEqual(rectangleFromPoints(start, end, 1920, 1080), { x: 170, y: 91, width: 1350, height: 799 });
  assert.deepEqual(rectangleFromPoints(end, start, 1920, 1080), rectangleFromPoints(start, end, 1920, 1080));
});

test("dragging beyond every screenshot edge stays inside source bounds", () => {
  assert.deepEqual(rectangleFromPoints({ x: 4000, y: -50 }, { x: -13, y: 5000 }, 1920, 1080), { x: 0, y: 0, width: 1920, height: 1080 });
});

test("clicks, tiny drags and invalid coordinates cannot become recordings", () => {
  for (const region of [null, { x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0, width: 300, height: 1 }, { x: -1, y: 0, width: 20, height: 20 }, { x: 0, y: 0, width: NaN, height: 50 }]) {
    assert.equal(isValidRegion(region), false);
    assert.throws(() => outputDimensions(region), RangeError);
  }
  assert.equal(isValidRegion({ x: 0, y: 0, width: 2, height: 2 }), true);
});

test("quality caps preserve landscape and portrait aspect ratios", () => {
  assert.deepEqual(outputDimensions({ x: 0, y: 0, width: 3840, height: 2160 }, "720"), { width: 1280, height: 720 });
  assert.deepEqual(outputDimensions({ x: 0, y: 0, width: 3840, height: 2160 }, "1080"), { width: 1920, height: 1080 });
  assert.deepEqual(outputDimensions({ x: 0, y: 0, width: 1080, height: 1920 }, "720"), { width: 405, height: 720 });
  assert.deepEqual(outputDimensions({ x: 0, y: 0, width: 3000, height: 1000 }, "1080"), { width: 1920, height: 640 });
});

test("small regions never upscale and original preserves the selected dimensions", () => {
  const region = { x: 200, y: 170, width: 551, height: 301 };
  for (const profile of ["720", "1080", "original", "unknown"]) assert.deepEqual(outputDimensions(region, profile), { width: 551, height: 301 });
  assert.deepEqual(outputDimensions({ x: 0, y: 0, width: 3840, height: 2160 }, "original"), { width: 3840, height: 2160 });
});
