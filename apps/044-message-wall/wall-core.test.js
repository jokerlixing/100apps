"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanText,
  cleanAuthor,
  normalizeNote,
  mergeNotes,
  toggleLike,
  filterNotes,
  stats,
  MAX_NOTES,
} = require("./wall-core.js");

function note(overrides = {}) {
  return {
    id: "note_base",
    text: "今天也辛苦了。",
    author: "夜班投递员",
    color: "#194b68",
    createdAt: 100,
    updatedAt: 100,
    likes: 0,
    likedByMe: false,
    ownerId: "owner_base",
    seed: false,
    ...overrides,
  };
}

test("text remains plain while controls and extra whitespace are normalized", () => {
  assert.equal(cleanText("  <b>只是文字</b>\n\t继续  "), "<b>只是文字</b> 继续");
  assert.equal(cleanText("\u0000\u0007"), null);
  assert.equal(cleanText("x".repeat(121)), null);
});
test("author, color, counters and ownership are normalized", () => {
  const result = normalizeNote(note({
    author: "  <夜班>\n投递员  ",
    color: "#ffffff",
    likes: -9,
    ownerId: "bad id",
  }));
  assert.equal(result.author, "夜班投递员");
  assert.equal(result.color, "#f26b5b");
  assert.equal(result.likes, 0);
  assert.equal(result.ownerId, "");
  assert.equal(cleanAuthor(" "), "匿名投递员");
});

test("merge is idempotent and keeps the newest version", () => {
  const older = note({ likes: 1, updatedAt: 100 });
  const newer = note({ text: "更新后的留言", likes: 3, updatedAt: 200 });
  const result = mergeNotes([older, older], [newer]);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, "更新后的留言");
  assert.equal(result[0].likes, 3);
});

test("merge trims history to the newest 80 notes", () => {
  const input = Array.from({ length: MAX_NOTES + 7 }, (_, index) => note({
    id: `note_${String(index).padStart(3, "0")}`,
    createdAt: index + 1,
    updatedAt: index + 1,
  }));
  const result = mergeNotes([], input);
  assert.equal(result.length, MAX_NOTES);
  assert.equal(result[0].createdAt, MAX_NOTES + 7);
  assert.equal(result.at(-1).createdAt, 8);
});

test("like toggles are reversible and never produce negative counts", () => {
  const liked = toggleLike(note(), 200);
  assert.equal(liked.likes, 1);
  assert.equal(liked.likedByMe, true);
  const unliked = toggleLike(liked, 300);
  assert.equal(unliked.likes, 0);
  assert.equal(unliked.likedByMe, false);
  const repaired = toggleLike(note({ likes: -4, likedByMe: true }), 400);
  assert.equal(repaired.likes, 0);
});

test("popular and mine filters return the expected order", () => {
  const notes = [
    note({ id: "note_one", ownerId: "owner_me", likes: 3, createdAt: 10, updatedAt: 10 }),
    note({ id: "note_two", ownerId: "owner_other", likes: 7, createdAt: 20, updatedAt: 20 }),
    note({ id: "note_three", ownerId: "owner_me", likes: 1, createdAt: 30, updatedAt: 30 }),
  ];
  assert.deepEqual(filterNotes(notes, "popular").map((item) => item.id), ["note_two", "note_one"]);
  assert.deepEqual(filterNotes(notes, "mine", "owner_me").map((item) => item.id), ["note_three", "note_one"]);
  assert.deepEqual(stats(notes), { notes: 3, likes: 11, popular: 2 });
});
