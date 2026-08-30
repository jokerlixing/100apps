(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PuzzleCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function validateDimension(dimension) {
    if (!Number.isInteger(dimension)) throw new TypeError("拼图阶数必须是整数");
    if (dimension < 3 || dimension > 5) throw new RangeError("拼图阶数必须在 3 到 5 之间");
  }

  function createSolved(dimension) {
    validateDimension(dimension);
    const tileCount = dimension * dimension;
    return Array.from({ length: tileCount }, (_, index) => (index + 1) % tileCount);
  }

  function validateIndex(index, dimension) {
    return Number.isInteger(index) && index >= 0 && index < dimension * dimension;
  }

  function isAdjacent(leftIndex, rightIndex, dimension) {
    validateDimension(dimension);
    if (!validateIndex(leftIndex, dimension) || !validateIndex(rightIndex, dimension)) return false;
    const leftRow = Math.floor(leftIndex / dimension);
    const leftColumn = leftIndex % dimension;
    const rightRow = Math.floor(rightIndex / dimension);
    const rightColumn = rightIndex % dimension;
    return Math.abs(leftRow - rightRow) + Math.abs(leftColumn - rightColumn) === 1;
  }

  function validateBoard(board, dimension) {
    validateDimension(dimension);
    if (!Array.isArray(board) || board.length !== dimension * dimension) {
      throw new TypeError("棋盘尺寸与拼图阶数不匹配");
    }
    const expected = createSolved(dimension).sort((a, b) => a - b);
    const actual = [...board].sort((a, b) => a - b);
    if (actual.some((value, index) => value !== expected[index])) {
      throw new TypeError("棋盘必须包含完整且不重复的方块");
    }
  }

  function getMovableIndexes(board, dimension) {
    validateBoard(board, dimension);
    const emptyIndex = board.indexOf(0);
    return board
      .map((_, index) => index)
      .filter(index => isAdjacent(index, emptyIndex, dimension));
  }

  function moveTile(board, tileIndex, dimension) {
    validateBoard(board, dimension);
    const nextBoard = [...board];
    const emptyIndex = board.indexOf(0);
    if (!isAdjacent(tileIndex, emptyIndex, dimension)) {
      return { board: nextBoard, moved: false, emptyIndex, tileIndex };
    }
    nextBoard[emptyIndex] = board[tileIndex];
    nextBoard[tileIndex] = 0;
    return { board: nextBoard, moved: true, emptyIndex: tileIndex, tileIndex };
  }

  function isSolved(board) {
    if (!Array.isArray(board) || board.length === 0) return false;
    return board.every((tile, index) => tile === (index + 1) % board.length);
  }

  function shuffleBoard(dimension, random = Math.random, steps = dimension * dimension * 24) {
    validateDimension(dimension);
    if (typeof random !== "function") throw new TypeError("随机源必须是函数");
    if (!Number.isInteger(steps) || steps < 1) throw new RangeError("打乱步数必须是正整数");

    let board = createSolved(dimension);
    let previousEmptyIndex = -1;

    for (let step = 0; step < steps; step += 1) {
      const candidates = getMovableIndexes(board, dimension);
      const choices = candidates.length > 1
        ? candidates.filter(index => index !== previousEmptyIndex)
        : candidates;
      const randomValue = random();
      if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
        throw new RangeError("随机源必须返回大于等于 0 且小于 1 的数");
      }
      const oldEmptyIndex = board.indexOf(0);
      const tileIndex = choices[Math.floor(randomValue * choices.length)];
      board = moveTile(board, tileIndex, dimension).board;
      previousEmptyIndex = oldEmptyIndex;
    }

    if (isSolved(board)) {
      const tileIndex = getMovableIndexes(board, dimension)[0];
      board = moveTile(board, tileIndex, dimension).board;
    }
    return board;
  }

  function validateRecord(record) {
    if (!record || !Number.isFinite(record.elapsedMs) || record.elapsedMs < 0 ||
      !Number.isInteger(record.moves) || record.moves < 0) {
      throw new TypeError("必须提供有效纪录");
    }
    return { elapsedMs: record.elapsedMs, moves: record.moves };
  }

  function pickBestRecord(current, candidate) {
    const next = validateRecord(candidate);
    if (current == null) return next;
    const saved = validateRecord(current);
    if (next.elapsedMs < saved.elapsedMs) return next;
    if (next.elapsedMs === saved.elapsedMs && next.moves < saved.moves) return next;
    return saved;
  }

  return {
    createSolved,
    getMovableIndexes,
    isAdjacent,
    isSolved,
    moveTile,
    pickBestRecord,
    shuffleBoard
  };
});
