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

function inversionCount(board) {
  const tiles = board.filter(Boolean);
  let inversions = 0;
  for (let left = 0; left < tiles.length; left += 1) {
    for (let right = left + 1; right < tiles.length; right += 1) {
      if (tiles[left] > tiles[right]) inversions += 1;
    }
  }
  return inversions;
}

function isSolvable(board, dimension) {
  const inversions = inversionCount(board);
  if (dimension % 2 === 1) return inversions % 2 === 0;
  const blankRowFromBottom = dimension - Math.floor(board.indexOf(0) / dimension);
  return (inversions + blankRowFromBottom) % 2 === 1;
}

test("创建完成棋盘并限制为 3 至 5 阶", () => {
  assert.deepEqual(Core.createSolved(3), [1, 2, 3, 4, 5, 6, 7, 8, 0]);
  assert.equal(Core.isSolved(Core.createSolved(5)), true);
  assert.throws(() => Core.createSolved(2), /3 到 5/);
  assert.throws(() => Core.createSolved(6), /3 到 5/);
  assert.throws(() => Core.createSolved(3.5), /整数/);
});

test("只有同一行或同一列的正交邻居才能移动", () => {
  assert.equal(Core.isAdjacent(7, 8, 3), true);
  assert.equal(Core.isAdjacent(5, 8, 3), true);
  assert.equal(Core.isAdjacent(6, 8, 3), false);
  assert.equal(Core.isAdjacent(2, 3, 3), false, "跨行位置不能误判为相邻");
  assert.deepEqual(Core.getMovableIndexes(Core.createSolved(3), 3), [5, 7]);
});

test("合法移动返回新棋盘，非法移动保持原状态", () => {
  const solved = Core.createSolved(3);
  const moved = Core.moveTile(solved, 7, 3);

  assert.equal(moved.moved, true);
  assert.deepEqual(moved.board, [1, 2, 3, 4, 5, 6, 7, 0, 8]);
  assert.deepEqual(solved, [1, 2, 3, 4, 5, 6, 7, 8, 0], "源棋盘不能被修改");
  assert.equal(Core.isSolved(moved.board), false);

  const restored = Core.moveTile(moved.board, 8, 3);
  assert.equal(restored.moved, true);
  assert.equal(Core.isSolved(restored.board), true);

  const rejected = Core.moveTile(solved, 0, 3);
  assert.equal(rejected.moved, false);
  assert.notEqual(rejected.board, solved);
  assert.deepEqual(rejected.board, solved);
});

test("合法移动打乱可复现、非完成态且始终可解", () => {
  for (const dimension of [3, 4, 5]) {
    const first = Core.shuffleBoard(dimension, seededRandom(47), dimension * dimension * 24);
    const second = Core.shuffleBoard(dimension, seededRandom(47), dimension * dimension * 24);

    assert.deepEqual(first, second);
    assert.equal(Core.isSolved(first), false);
    assert.equal(new Set(first).size, dimension * dimension);
    assert.deepEqual([...first].sort((a, b) => a - b), Core.createSolved(dimension).sort((a, b) => a - b));
    assert.equal(isSolvable(first, dimension), true);
  }
});

test("最佳纪录先比较用时，同用时再比较步数", () => {
  assert.deepEqual(Core.pickBestRecord(null, { elapsedMs: 45000, moves: 88 }), { elapsedMs: 45000, moves: 88 });
  assert.deepEqual(
    Core.pickBestRecord({ elapsedMs: 45000, moves: 88 }, { elapsedMs: 42000, moves: 96 }),
    { elapsedMs: 42000, moves: 96 }
  );
  assert.deepEqual(
    Core.pickBestRecord({ elapsedMs: 42000, moves: 96 }, { elapsedMs: 42000, moves: 82 }),
    { elapsedMs: 42000, moves: 82 }
  );
  assert.deepEqual(
    Core.pickBestRecord({ elapsedMs: 42000, moves: 82 }, { elapsedMs: 43000, moves: 70 }),
    { elapsedMs: 42000, moves: 82 }
  );
  assert.throws(() => Core.pickBestRecord(null, { elapsedMs: -1, moves: 2 }), /有效纪录/);
});
