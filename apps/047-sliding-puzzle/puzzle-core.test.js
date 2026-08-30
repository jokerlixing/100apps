const test = require("node:test");
const assert = require("node:assert/strict");

const Core = require("./puzzle-core.js");

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test("创建铺满图片的完成棋盘并限制为 3 至 5 阶", () => {
  assert.deepEqual(Core.createSolved(3), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(Core.createSolved(4), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.equal(Core.isSolved(Core.createSolved(5)), true);
  assert.equal(Core.createSolved(5).includes(0), false);
  assert.throws(() => Core.createSolved(2), /3 到 5/);
  assert.throws(() => Core.createSolved(6), /3 到 5/);
  assert.throws(() => Core.createSolved(3.5), /整数/);
});

test("任意两块可以交换且不修改源棋盘", () => {
  const solved = Core.createSolved(3);
  const result = Core.swapTiles(solved, 0, 8, 3);

  assert.equal(result.swapped, true);
  assert.deepEqual(result.board, [9, 2, 3, 4, 5, 6, 7, 8, 1]);
  assert.deepEqual(solved, [1, 2, 3, 4, 5, 6, 7, 8, 9], "源棋盘不能被修改");
  assert.equal(Core.isSolved(result.board), false);

  const restored = Core.swapTiles(result.board, 0, 8, 3);
  assert.equal(Core.isSolved(restored.board), true);
});

test("交换同一位置是安全的无操作，无效索引会被拒绝", () => {
  const board = Core.createSolved(3);
  const noOp = Core.swapTiles(board, 4, 4, 3);

  assert.equal(noOp.swapped, false);
  assert.notEqual(noOp.board, board);
  assert.deepEqual(noOp.board, board);
  assert.throws(() => Core.swapTiles(board, -1, 2, 3), /索引/);
  assert.throws(() => Core.swapTiles(board, 2, 9, 3), /索引/);
  assert.throws(() => Core.swapTiles([...board.slice(0, 8), 8], 0, 1, 3), /完整且不重复/);
});

test("Fisher-Yates 打乱可复现、铺满且不是完成态", () => {
  for (const dimension of [3, 4, 5]) {
    const first = Core.shuffleBoard(dimension, seededRandom(47));
    const second = Core.shuffleBoard(dimension, seededRandom(47));

    assert.deepEqual(first, second);
    assert.equal(Core.isSolved(first), false);
    assert.equal(first.length, dimension * dimension);
    assert.equal(first.includes(0), false);
    assert.equal(new Set(first).size, dimension * dimension);
    assert.deepEqual([...first].sort((a, b) => a - b), Core.createSolved(dimension));
  }
});

test("打乱会校验随机源", () => {
  assert.throws(() => Core.shuffleBoard(3, null), /随机源/);
  assert.throws(() => Core.shuffleBoard(3, () => 1), /大于等于 0/);
  assert.throws(() => Core.shuffleBoard(3, () => -0.1), /大于等于 0/);
});

test("最佳纪录先比较用时，同用时再比较步数", () => {
  assert.deepEqual(Core.pickBestRecord(null, { elapsedMs: 45000, moves: 18 }), { elapsedMs: 45000, moves: 18 });
  assert.deepEqual(
    Core.pickBestRecord({ elapsedMs: 45000, moves: 18 }, { elapsedMs: 42000, moves: 22 }),
    { elapsedMs: 42000, moves: 22 }
  );
  assert.deepEqual(
    Core.pickBestRecord({ elapsedMs: 42000, moves: 22 }, { elapsedMs: 42000, moves: 16 }),
    { elapsedMs: 42000, moves: 16 }
  );
  assert.deepEqual(
    Core.pickBestRecord({ elapsedMs: 42000, moves: 16 }, { elapsedMs: 43000, moves: 12 }),
    { elapsedMs: 42000, moves: 16 }
  );
  assert.throws(() => Core.pickBestRecord(null, { elapsedMs: -1, moves: 2 }), /有效纪录/);
});
