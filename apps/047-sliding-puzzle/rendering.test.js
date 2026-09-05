const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("首屏拼图图片保持在 160 KB 以内，并由页面提前加载同一资源", () => {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const imagePath = source.match(/const DEFAULT_IMAGE = "([^"]+)"/)[1];
  const image = fs.readFileSync(path.join(__dirname, imagePath));
  const preload = html.match(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/)[0];

  assert.ok(image.byteLength < 160 * 1024, "默认图片过大会拖慢移动网络首屏加载");
  assert.equal(image.toString("ascii", 0, 4), "RIFF");
  assert.equal(image.toString("ascii", 8, 12), "WEBP");
  assert.ok(preload.includes(`href="${imagePath}"`), "预加载必须复用实际渲染的图片，避免重复下载");
});
