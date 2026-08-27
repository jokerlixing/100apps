/**
 * board.js — 扫雷核心数据层（纯函数，无 DOM 依赖，可独立测试）
 *
 * 棋盘数据结构：
 * {
 *   rows: number,            // 行数
 *   cols: number,            // 列数
 *   mineCount: number,       // 总雷数
 *   mines: Uint8Array,       // mines[i] === 1 表示 i 号格是雷
 *   numbers: Uint8Array,     // numbers[i] 为非雷格周围 8 格雷数（0-8）
 *   states: string[],        // 每格状态：hidden / revealed / flagged / question
 *   minesPlaced: boolean,    // 是否已布雷（首次点击时才布雷）
 *   explodedIndex: number    // 被踩中的雷格索引（未爆为 -1）
 * }
 */
(function (global) {
  'use strict';

  /** 格子状态枚举 */
  const CellState = Object.freeze({
    HIDDEN: 'hidden',
    REVEALED: 'revealed',
    FLAGGED: 'flagged',
    QUESTION: 'question',
  });

  /** 对局状态枚举 */
  const GameStatus = Object.freeze({
    READY: 'ready',
    PLAYING: 'playing',
    WON: 'won',
    LOST: 'lost',
  });

  /** 难度配置（需求：初级 9×9/10雷、中级 16×16/40雷、高级 30×16/99雷） */
  const DIFFICULTIES = Object.freeze({
    beginner: Object.freeze({ id: 'beginner', name: '初级', rows: 9, cols: 9, mines: 10 }),
    intermediate: Object.freeze({ id: 'intermediate', name: '中级', rows: 16, cols: 16, mines: 40 }),
    expert: Object.freeze({ id: 'expert', name: '高级', rows: 16, cols: 30, mines: 99 }),
  });

  const DEFAULT_DIFFICULTY_ID = 'beginner';

  /* ---------------- 基础工具 ---------------- */

  /**
   * 行列坐标转一维索引
   * @param {{cols:number}} board
   * @param {number} row
   * @param {number} col
   * @returns {number}
   */
  function toIndex(board, row, col) {
    return row * board.cols + col;
  }

  /** 一维索引转行号 */
  function toRow(board, index) {
    return Math.floor(index / board.cols);
  }

  /** 一维索引转列号 */
  function toCol(board, index) {
    return index % board.cols;
  }

  /** 判断坐标是否在棋盘内 */
  function inBounds(board, row, col) {
    return row >= 0 && row < board.rows && col >= 0 && col < board.cols;
  }

  /**
   * 取周围 8 格（不足 8 格的边缘自动裁剪）
   * @returns {Array<{row:number,col:number,index:number}>}
   */
  function getNeighbors(board, row, col) {
    const result = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (inBounds(board, r, c)) {
          result.push({ row: r, col: c, index: toIndex(board, r, c) });
        }
      }
    }
    return result;
  }

  /* ---------------- 棋盘创建与布雷 ---------------- */

  /**
   * 创建空棋盘（未布雷）
   * @param {number} rows 行数
   * @param {number} cols 列数
   * @param {number} mineCount 总雷数
   */
  function createBoard(rows, cols, mineCount) {
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2) {
      throw new RangeError('rows/cols 必须为不小于 2 的整数');
    }
    const total = rows * cols;
    if (!Number.isInteger(mineCount) || mineCount < 1 || total - mineCount < 2) {
      throw new RangeError('mineCount 非法（需满足 1 <= mineCount <= rows*cols - 2）');
    }
    return {
      rows,
      cols,
      mineCount,
      mines: new Uint8Array(total),
      numbers: new Uint8Array(total),
      states: new Array(total).fill(CellState.HIDDEN),
      minesPlaced: false,
      explodedIndex: -1,
    };
  }

  /**
   * 布雷（首次点击保护：首点及其周围 8 格尽量不布雷）
   * 使用 Fisher-Yates 部分洗牌，等概率均匀布雷。
   * @param {object} board
   * @param {number} safeRow 保护点行
   * @param {number} safeCol 保护点列
   * @returns {boolean} 是否本次执行了布雷
   */
  function placeMines(board, safeRow, safeCol) {
    if (board.minesPlaced) return false;
    const total = board.rows * board.cols;
    const safeIndex = inBounds(board, safeRow, safeCol)
      ? toIndex(board, safeRow, safeCol)
      : -1;

    // 保护区域：首点 + 周围 8 格
    let forbidden = new Set();
    if (safeIndex >= 0) {
      forbidden.add(safeIndex);
      for (const n of getNeighbors(board, safeRow, safeCol)) forbidden.add(n.index);
    }
    // 空间不足时先收缩为仅保护首点，再不行则不保护任何格
    if (total - forbidden.size < board.mineCount) {
      forbidden = safeIndex >= 0 ? new Set([safeIndex]) : new Set();
    }

    const candidates = [];
    for (let i = 0; i < total; i++) {
      if (!forbidden.has(i)) candidates.push(i);
    }
    // 极端兜底：候选仍不足时，允许雷落在除首点外的任何格
    if (candidates.length < board.mineCount) {
      candidates.length = 0;
      for (let i = 0; i < total; i++) {
        if (i !== safeIndex) candidates.push(i);
      }
    }

    for (let i = 0; i < board.mineCount; i++) {
      const j = i + Math.floor(Math.random() * (candidates.length - i));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
      board.mines[candidates[i]] = 1;
    }
    board.minesPlaced = true;
    computeNumbers(board);
    return true;
  }

  /** 为所有非雷格计算周围雷数 */
  function computeNumbers(board) {
    board.numbers.fill(0);
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const idx = toIndex(board, r, c);
        if (board.mines[idx]) continue;
        let count = 0;
        for (const n of getNeighbors(board, r, c)) {
          if (board.mines[n.index]) count++;
        }
        board.numbers[idx] = count;
      }
    }
  }

  /* ---------------- 读取辅助 ---------------- */

  function isMine(board, row, col) {
    return inBounds(board, row, col) && board.mines[toIndex(board, row, col)] === 1;
  }

  function isMineAt(board, index) {
    return index >= 0 && index < board.mines.length && board.mines[index] === 1;
  }

  function getState(board, row, col) {
    return inBounds(board, row, col) ? board.states[toIndex(board, row, col)] : null;
  }

  function getStateAt(board, index) {
    return board.states[index] !== undefined ? board.states[index] : null;
  }

  function getNumber(board, row, col) {
    return inBounds(board, row, col) ? board.numbers[toIndex(board, row, col)] : 0;
  }

  function getNumberAt(board, index) {
    return board.numbers[index] || 0;
  }

  /* ---------------- 核心操作 ---------------- */

  /**
   * 连锁展开（BFS）：从 (row, col) 开始翻开，数字为 0 的格子向四周扩散。
   * 已插旗格不会被展开；问号格会被展开。
   * @param {object} board
   * @param {number} row
   * @param {number} col
   * @param {number[]} out 按展开顺序回填的索引数组（供 UI 做级联动画）
   */
  function floodFillReveal(board, row, col, out) {
    if (!inBounds(board, row, col)) return;
    const startIndex = toIndex(board, row, col);
    const startState = board.states[startIndex];
    if (startState === CellState.REVEALED || startState === CellState.FLAGGED) return;

    if (board.mines[startIndex]) {
      // 理论上调用方不会走到这里；防御式处理
      board.states[startIndex] = CellState.REVEALED;
      if (board.explodedIndex === -1) board.explodedIndex = startIndex;
      out.push(startIndex);
      return;
    }

    board.states[startIndex] = CellState.REVEALED;
    out.push(startIndex);
    const queue = [startIndex];
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      if (board.numbers[idx] !== 0) continue; // 非空白格不扩散
      const r = toRow(board, idx);
      const c = toCol(board, idx);
      for (const n of getNeighbors(board, r, c)) {
        const st = board.states[n.index];
        if (st === CellState.REVEALED || st === CellState.FLAGGED) continue;
        if (board.mines[n.index]) continue; // 空白格的邻居不可能是雷，防御式跳过
        board.states[n.index] = CellState.REVEALED;
        out.push(n.index);
        queue.push(n.index);
      }
    }
  }

  /**
   * 左键翻开一格（若尚未布雷则先以该格为安全点布雷）
   * @returns {{ok:boolean, hitMine:boolean, revealedOrder:number[]}}
   */
  function revealCell(board, row, col) {
    const result = { ok: false, hitMine: false, revealedOrder: [] };
    if (!inBounds(board, row, col)) return result;
    const idx = toIndex(board, row, col);
    const st = board.states[idx];
    if (st === CellState.REVEALED || st === CellState.FLAGGED) return result;

    if (!board.minesPlaced) placeMines(board, row, col);

    if (board.mines[idx]) {
      board.states[idx] = CellState.REVEALED;
      board.explodedIndex = idx;
      result.ok = true;
      result.hitMine = true;
      result.revealedOrder.push(idx);
      return result;
    }

    floodFillReveal(board, row, col, result.revealedOrder);
    result.ok = true;
    return result;
  }

  /**
   * 右键标记：hidden → flagged → question → hidden 循环
   * @returns {string|null} 切换后的状态；非法操作（已翻开/越界）返回 null
   */
  function toggleFlag(board, row, col) {
    if (!inBounds(board, row, col)) return null;
    const idx = toIndex(board, row, col);
    const st = board.states[idx];
    if (st === CellState.REVEALED) return null;
    let next;
    if (st === CellState.HIDDEN) next = CellState.FLAGGED;
    else if (st === CellState.FLAGGED) next = CellState.QUESTION;
    else next = CellState.HIDDEN;
    board.states[idx] = next;
    return next;
  }

  /**
   * 和弦操作（chord）：对已翻开的数字格，若周围旗数 >= 数字，
   * 则翻开周围所有未插旗的隐藏格（可能踩雷）。
   * @returns {{ok:boolean, hitMine:boolean, revealedOrder:number[]}}
   */
  function chordReveal(board, row, col) {
    const result = { ok: false, hitMine: false, revealedOrder: [] };
    if (!inBounds(board, row, col)) return result;
    const idx = toIndex(board, row, col);
    if (board.states[idx] !== CellState.REVEALED) return result;
    const number = board.numbers[idx];
    if (number === 0 || board.mines[idx]) return result;

    const neighbors = getNeighbors(board, row, col);
    let flagCount = 0;
    for (const n of neighbors) {
      if (board.states[n.index] === CellState.FLAGGED) flagCount++;
    }
    if (flagCount < number) return result;

    result.ok = true;
    for (const n of neighbors) {
      const st = board.states[n.index];
      if (st === CellState.REVEALED || st === CellState.FLAGGED) continue;
      if (board.mines[n.index]) {
        board.states[n.index] = CellState.REVEALED;
        if (board.explodedIndex === -1) board.explodedIndex = n.index;
        result.hitMine = true;
        result.revealedOrder.push(n.index);
      } else {
        floodFillReveal(board, n.row, n.col, result.revealedOrder);
      }
    }
    return result;
  }

  /* ---------------- 统计与判定 ---------------- */

  /** 统计已插旗数量 */
  function countFlags(board) {
    let count = 0;
    for (let i = 0; i < board.states.length; i++) {
      if (board.states[i] === CellState.FLAGGED) count++;
    }
    return count;
  }

  /** 统计已翻开数量 */
  function countRevealed(board) {
    let count = 0;
    for (let i = 0; i < board.states.length; i++) {
      if (board.states[i] === CellState.REVEALED) count++;
    }
    return count;
  }

  /** 剩余雷数 = 总雷数 - 已插旗数（可能为负） */
  function countRemainingMines(board) {
    return board.mineCount - countFlags(board);
  }

  /** 胜利判定：已布雷且所有非雷格均已翻开 */
  function isWin(board) {
    return board.minesPlaced && countRevealed(board) === board.rows * board.cols - board.mineCount;
  }

  /** 胜利展示：自动给所有雷插旗 */
  function flagAllMines(board) {
    for (let i = 0; i < board.mines.length; i++) {
      if (board.mines[i] && board.states[i] !== CellState.FLAGGED) {
        board.states[i] = CellState.FLAGGED;
      }
    }
  }

  /** 失败展示：翻开所有未插旗的雷（正确插旗的雷保持旗子） */
  function revealAllMines(board) {
    for (let i = 0; i < board.mines.length; i++) {
      if (board.mines[i] && board.states[i] !== CellState.FLAGGED) {
        board.states[i] = CellState.REVEALED;
      }
    }
  }

  /** 所有雷的索引列表 */
  function getMineIndices(board) {
    const list = [];
    for (let i = 0; i < board.mines.length; i++) {
      if (board.mines[i]) list.push(i);
    }
    return list;
  }

  /** 标错的旗（插了旗但不是雷）索引列表 */
  function getWronglyFlaggedIndices(board) {
    const list = [];
    for (let i = 0; i < board.mines.length; i++) {
      if (board.states[i] === CellState.FLAGGED && !board.mines[i]) list.push(i);
    }
    return list;
  }

  global.MinesweeperBoard = {
    CellState,
    GameStatus,
    DIFFICULTIES,
    DEFAULT_DIFFICULTY_ID,
    toIndex,
    toRow,
    toCol,
    inBounds,
    getNeighbors,
    createBoard,
    placeMines,
    computeNumbers,
    isMine,
    isMineAt,
    getState,
    getStateAt,
    getNumber,
    getNumberAt,
    revealCell,
    floodFillReveal,
    toggleFlag,
    chordReveal,
    countFlags,
    countRevealed,
    countRemainingMines,
    isWin,
    flagAllMines,
    revealAllMines,
    getMineIndices,
    getWronglyFlaggedIndices,
  };
})(window);
