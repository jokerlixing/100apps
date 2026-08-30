"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeFlags,
  compilePattern,
  analyzePattern,
  createHighlightSegments,
  replacePattern,
} = require("./regex-core.js");

test("normalizes supported flags in a stable order", () => {
  assert.equal(normalizeFlags("miggi"), "gim");
  assert.throws(() => normalizeFlags("gz"), /Unsupported regular expression flag: z/);
});

test("returns a readable compile error without throwing", () => {
  const result = compilePattern("[a-", "gi");
  assert.equal(result.ok, false);
  assert.match(result.error, /regular expression|character class|unterminated/i);
});

test("validates flags even when the source is empty", () => {
  const result = analyzePattern({ source: "", flags: "z", text: "sample" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported regular expression flag: z/);
});

test("respects global and first-match modes", () => {
  const first = analyzePattern({ source: "cat", flags: "i", text: "Cat cat" });
  const every = analyzePattern({ source: "cat", flags: "gi", text: "Cat cat" });
  assert.deepEqual(first.matches.map((match) => match.index), [0]);
  assert.deepEqual(every.matches.map((match) => match.index), [0, 4]);
});

test("captures numbered and named groups with ranges", () => {
  const result = analyzePattern({
    source: "(?<key>[a-z]+)=(\\d+)",
    flags: "g",
    text: "size=42; count=7",
  });
  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches[0].captures.map((capture) => capture.value),
    ["size", "42"],
  );
  assert.deepEqual(result.matches[0].named, [
    { name: "key", value: "size", start: 0, end: 4 },
  ]);
});

test("advances safely after zero-length global matches", () => {
  const result = analyzePattern({ source: "(?=a)", flags: "g", text: "aaa" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches.map((match) => match.index), [0, 1, 2]);
  assert.ok(result.matches.every((match) => match.index === match.end));
});

test("caps the inspection result and reports truncation", () => {
  const result = analyzePattern({ source: ".", flags: "g", text: "abcdef", limit: 3 });
  assert.equal(result.matches.length, 3);
  assert.equal(result.truncated, true);
});

test("builds lossless text and match highlight segments", () => {
  const text = "one 22 three";
  const result = analyzePattern({ source: "\\d+", flags: "g", text });
  const segments = createHighlightSegments(text, result.matches);
  assert.equal(segments.map((segment) => segment.value).join(""), text);
  assert.deepEqual(
    segments.map((segment) => segment.type),
    ["text", "match", "text"],
  );
  assert.equal(segments[1].order, 1);
});

test("keeps zero-length positions in highlight segments", () => {
  const text = "ab";
  const result = analyzePattern({ source: "^|$", flags: "g", text });
  const segments = createHighlightSegments(text, result.matches);
  assert.equal(segments.map((segment) => segment.value).join(""), text);
  assert.equal(segments.filter((segment) => segment.type === "zero").length, 2);
});

test("previews native replacement tokens", () => {
  const result = replacePattern({
    source: "(?<last>\\w+),\\s*(?<first>\\w+)",
    flags: "g",
    text: "Lovelace, Ada; Hopper, Grace",
    replacement: "$<first> $<last>",
  });
  assert.deepEqual(result, {
    ok: true,
    value: "Ada Lovelace; Grace Hopper",
    error: null,
  });
});
