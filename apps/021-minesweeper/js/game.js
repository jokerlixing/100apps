/**
 * game.js — 对局状态层：在核心棋盘逻辑之上封装状态机与计时
 *
 * game 对象结构：
 * {
 *   difficultyId, difficultyName, rows, cols, mineCount,
 *   board:        由 board.js 创建的棋盘
 *   status:       'ready' | 'playing' | 'won' | 'lost'
 *   startedAt:    开始时间戳（ms）
 *   elapsedMs:    结束时凝固的用时（ms）
 *   timerRunning: 计时是否进行中
 *   lastResult:   最近一次操作结果（含 revealedOrder 供动画使用）
 * }
 */
(function (global) {
  'use strict';

  const B = global.MinesweeperBoard;

  /**
   * 创建一局新游戏
   * @param {string} [difficultyId] 难度 id，缺省用默认难度
   */
  function createGame(difficultyId) {
    const diff = B.DIFFICULTIES[difficultyId] || B.DIFFICULTIES[B.DEFAULT_DIFFICULTY_ID];
    return {
      difficultyId: diff.id,
      difficultyName: diff.name,
      rows: diff.rows,
      cols: diff.cols,
      mineCount: diff.mines,
      board: B.createBoard(diff.rows, diff.cols, diff.mines),
      status: B.GameStatus.READY,
      startedAt: 0,
      elapsedMs: 0,
      timerRunning: false,
      lastResult: null,
    };
  }

  /** 首次有效翻格后启动计时 */
  function startTimerIfNeeded(game) {
    if (game.status === B.GameStatus.READY) {
      game.status = B.GameStatus.PLAYING;
      game.startedAt = Date.now();
      game.timerRunning = true;
    }
  }

  /** 停止计时并凝固用时 */
  function stopTimer(game) {
    if (game.timerRunning) {
      game.elapsedMs = Date.now() - game.startedAt;
      game.timerRunning = false;
    }
  }

  /** 结束对局：胜利自动插满旗；失败翻开所有雷 */
  function finishGame(game, status) {
    game.status = status;
    stopTimer(game);
    if (status === B.GameStatus.WON) {
      B.flagAllMines(game.board);
    } else {
      B.revealAllMines(game.board);
    }
  }

  /** 胜利检查 */
  function evaluateEnd(game) {
    if (game.status !== B.GameStatus.PLAYING) return;
    if (B.isWin(game.board)) {
      finishGame(game, B.GameStatus.WON);
    }
  }

  /**
   * 左键翻开
   * @returns {{ok:boolean, hitMine:boolean, prevStatus:string, status:string}}
   */
  function handleCellReveal(game, row, col) {
    const outcome = { ok: false, hitMine: false, prevStatus: game.status, status: game.status };
    if (game.status === B.GameStatus.WON || game.status === B.GameStatus.LOST) return outcome;

    const result = B.revealCell(game.board, row, col);
    game.lastResult = result;
    if (!result.ok) return outcome;

    if (result.hitMine) {
      finishGame(game, B.GameStatus.LOST);
      outcome.hitMine = true;
    } else {
      startTimerIfNeeded(game);
      evaluateEnd(game);
    }
    outcome.ok = true;
    outcome.status = game.status;
    return outcome;
  }

  /**
   * 右键插旗/问号循环
   * @returns {{ok:boolean, state:string|null, prevStatus:string, status:string}}
   */
  function handleFlagToggle(game, row, col) {
    const outcome = { ok: false, state: null, prevStatus: game.status, status: game.status };
    if (game.status === B.GameStatus.WON || game.status === B.GameStatus.LOST) return outcome;

    const next = B.toggleFlag(game.board, row, col);
    if (next === null) return outcome;

    game.lastResult = { ok: true, hitMine: false, revealedOrder: [] };
    outcome.ok = true;
    outcome.state = next;
    outcome.status = game.status;
    return outcome;
  }

  /**
   * 和弦快速展开（双击/双键已翻开的数字格）
   * @returns {{ok:boolean, hitMine:boolean, prevStatus:string, status:string}}
   */
  function handleChord(game, row, col) {
    const outcome = { ok: false, hitMine: false, prevStatus: game.status, status: game.status };
    if (game.status === B.GameStatus.WON || game.status === B.GameStatus.LOST) return outcome;

    const result = B.chordReveal(game.board, row, col);
    game.lastResult = result;
    if (!result.ok) return outcome;

    if (result.hitMine) {
      finishGame(game, B.GameStatus.LOST);
      outcome.hitMine = true;
    } else {
      evaluateEnd(game);
    }
    outcome.ok = true;
    outcome.status = game.status;
    return outcome;
  }

  /** 当前用时（ms）：进行中实时计算，已结束返回凝固值 */
  function computeElapsedMs(game) {
    if (game.timerRunning) return Date.now() - game.startedAt;
    return game.elapsedMs;
  }

  /** 当前用时（秒），封顶 999 */
  function getElapsedSeconds(game) {
    return Math.min(999, Math.floor(computeElapsedMs(game) / 1000));
  }

  /** 以相同难度重开一局（返回全新 game 对象） */
  function restart(game) {
    return createGame(game ? game.difficultyId : undefined);
  }

  global.MinesweeperGame = {
    createGame,
    handleCellReveal,
    handleFlagToggle,
    handleChord,
    computeElapsedMs,
    getElapsedSeconds,
    restart,
  };
})(window);
