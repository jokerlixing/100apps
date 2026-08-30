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
    return Array.from({ length: tileCount }, (_, index) => index + 1);
  }

  function validateIndex(index, dimension) {
    return Number.isInteger(index) && index >= 0 && index < dimension * dimension;
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

  function swapTiles(board, sourceIndex, targetIndex, dimension) {
    validateBoard(board, dimension);
    const nextBoard = [...board];
    if (!validateIndex(sourceIndex, dimension) || !validateIndex(targetIndex, dimension)) {
      throw new RangeError("方块索引无效");
    }
    if (sourceIndex === targetIndex) {
      return { board: nextBoard, swapped: false, sourceIndex, targetIndex };
    }
    [nextBoard[sourceIndex], nextBoard[targetIndex]] = [nextBoard[targetIndex], nextBoard[sourceIndex]];
    return { board: nextBoard, swapped: true, sourceIndex, targetIndex };
  }

  function isSolved(board) {
    if (!Array.isArray(board) || board.length === 0) return false;
    return board.every((tile, index) => tile === index + 1);
  }

  function shuffleBoard(dimension, random = Math.random) {
    validateDimension(dimension);
    if (typeof random !== "function") throw new TypeError("随机源必须是函数");

    const board = createSolved(dimension);
    for (let index = board.length - 1; index > 0; index -= 1) {
      const randomValue = random();
      if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
        throw new RangeError("随机源必须返回大于等于 0 且小于 1 的数");
      }
      const targetIndex = Math.floor(randomValue * (index + 1));
      [board[index], board[targetIndex]] = [board[targetIndex], board[index]];
    }

    if (isSolved(board)) {
      [board[0], board[1]] = [board[1], board[0]];
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
    isSolved,
    pickBestRecord,
    shuffleBoard,
    swapTiles
  };
});
