/**
 * ui.js — 渲染层：负责棋盘 DOM 构建、增量更新与动画触发
 * 只做「读 game 状态 → 更新 DOM」，不含游戏规则判断。
 */
(function (global) {
  'use strict';

  const B = global.MinesweeperBoard;
  const CellState = B.CellState;

  /** 数字 1-8 的经典配色 class 后缀 */
  const NUMBER_COLORS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

  /**
   * @param {object} refs 各 DOM 引用集合
   * @param {HTMLElement} refs.boardEl
   * @param {HTMLElement} refs.mineCounterEl
   * @param {HTMLElement} refs.timerEl
   * @param {HTMLElement} refs.faceBtn
   * @param {HTMLElement} refs.resultOverlay
   * @param {HTMLElement} refs.resultTitle
   * @param {HTMLElement} refs.resultDesc
   * @param {HTMLElement} refs.resultMeta
   * @param {HTMLElement[]} refs.diffBtns
   * @param {HTMLElement[]} refs.cellEls
   */
  function MinesweeperUI(refs) {
    this.refs = refs;
    this._cellEls = [];
    this._buildBoard = this._buildBoard.bind(this);
  }

  /* ---------------- 顶部信息栏 ---------------- */

  /**
   * 更新剩余雷数计数器（负数显示为 -N，其余补零到 3 位）
   * @param {object} game
   */
  MinesweeperUI.prototype.updateMineCounter = function (game) {
    const remaining = B.countRemainingMines(game.board);
    const text = remaining < 0
      ? '-' + String(Math.min(99, -remaining)).padStart(2, '0')
      : String(remaining).padStart(3, '0');
    this.refs.mineCounterEl.textContent = text;
    this.refs.mineCounterEl.classList.toggle('negative', remaining < 0);
  };

  /** 更新计时器显示 @param {number} seconds */
  MinesweeperUI.prototype.updateTimer = function (seconds) {
    this.refs.timerEl.textContent = String(Math.min(999, Math.max(0, seconds))).padStart(3, '0');
  };

  /**
   * 更新笑脸按钮表情
   * @param {string} mode 'ready'|'playing'|'won'|'lost'|'scared'
   */
  MinesweeperUI.prototype.setFace = function (mode) {
    const btn = this.refs.faceBtn;
    if (mode !== 'scared') this._faceMode = mode; // 记住非临时表情，供恢复
    btn.dataset.mode = mode;
    btn.textContent = mode === 'won' ? '😎' : mode === 'lost' ? '😵' : mode === 'scared' ? '😮' : '🙂';
  };

  /** 高亮当前选中的难度按钮 */
  MinesweeperUI.prototype.setActiveDifficulty = function (difficultyId) {
    this.refs.diffBtns.forEach(function (btn) {
      const active = btn.dataset.difficulty === difficultyId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };

  /* ---------------- 棋盘构建与渲染 ---------------- */

  /** 重建棋盘 DOM（新开局/切难度时调用） @param {object} game */
  MinesweeperUI.prototype._buildBoard = function (game) {
    const boardEl = this.refs.boardEl;
    boardEl.innerHTML = '';
    boardEl.style.setProperty('--rows', String(game.rows));
    boardEl.style.setProperty('--cols', String(game.cols));
    boardEl.dataset.difficulty = game.difficultyId; // CSS 按难度自适应格子尺寸
    boardEl.classList.remove('shake');

    const cells = [];
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < game.rows * game.cols; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell hidden';
      cell.dataset.index = String(i);
      cell.dataset.row = String(B.toRow(game.board, i));
      cell.dataset.col = String(B.toCol(game.board, i));
      cell.textContent = '';
      cells.push(cell);
      fragment.appendChild(cell);
    }
    boardEl.appendChild(fragment);
    this._cellEls = cells;
  };

  /**
   * 全量刷新（新局渲染）
   * @param {object} game
   * @param {{revealOrder?:number[]}} [options] 开局即展开时的动画顺序
   */
  MinesweeperUI.prototype.renderAll = function (game, options) {
    const opts = options || {};
    this._buildBoard(game);
    this.updateMineCounter(game);
    this.updateTimer(global.MinesweeperGame.getElapsedSeconds(game));
    this.setActiveDifficulty(game.difficultyId);

    if (opts.revealOrder && opts.revealOrder.length > 0) {
      this.applyRevealAnimation(opts.revealOrder);
      for (let i = 0; i < opts.revealOrder.length; i++) {
        this._paintCell(game, opts.revealOrder[i], 0);
      }
    }
  };

  /**
   * 按状态机同步单个格子外观（不触发动画，用于旗标/问号切换、终局批量刷新）
   * @param {object} game
   * @param {number} index
   * @param {number} [delayMs] 翻开动画延迟（级联效果）
   */
  MinesweeperUI.prototype._paintCell = function (game, index, delayMs) {
    const cellEl = this._cellEls[index];
    if (!cellEl) return;
    const state = game.board.states[index];
    const isMine = B.isMineAt(game.board, index);
    const number = B.getNumberAt(game.board, index);
    const lost = game.status === B.GameStatus.LOST;
    const won = game.status === B.GameStatus.WON;

    let cls = 'cell';
    let text = '';

    if (state === CellState.FLAGGED) {
      cls += ' flagged';
      text = '🚩';
      if (lost && !isMine) {
        cls += ' wrong-flag';
        text = '❌';
      } else if (lost && isMine) {
        cls += ' correct-flag';
      }
    } else if (state === CellState.QUESTION) {
      cls += ' question';
      text = '?';
    } else if (state === CellState.REVEALED) {
      cls += ' revealed';
      if (isMine) {
        const exploded = game.board.explodedIndex === index;
        cls += exploded ? ' mine exploded' : ' mine';
        text = '💣';
      } else if (number > 0) {
        cls += ' number ' + NUMBER_COLORS[number];
        text = String(number);
      }
      if (won && !isMine) cls += ' win-glow';
    } else {
      cls += ' hidden';
    }

    cellEl.className = cls;
    cellEl.textContent = text;
    cellEl.dataset.state = state;
    // 始终重置级联动画延迟，避免上一次的残留值影响后续动画
    cellEl.style.setProperty('--reveal-delay', (delayMs || 0) + 'ms');
  };

  /**
   * 为一批按展开顺序的格子应用级联翻开动画并同步外观
   * @param {object} game
   * @param {number[]} revealOrder 展开顺序索引
   * @param {number} [stepMs] 相邻层级动画间隔，默认 18ms
   */
  MinesweeperUI.prototype.applyCascadeReveal = function (game, revealOrder, stepMs) {
    if (!revealOrder || revealOrder.length === 0) return;
    const step = stepMs || 18;
    const batch = Math.min(6, Math.ceil(Math.sqrt(revealOrder.length)));
    for (let i = 0; i < revealOrder.length; i++) {
      const delay = Math.floor(i / batch) * step;
      this._paintCell(game, revealOrder[i], delay);
      this._cellEls[revealOrder[i]].classList.add('popping');
    }
  };

  /** 仅加动画 class（不重绘），用于首点保护后的全量渲染 */
  MinesweeperUI.prototype.applyRevealAnimation = function (revealOrder) {
    if (!revealOrder) return;
    for (let i = 0; i < revealOrder.length; i++) {
      const el = this._cellEls[revealOrder[i]];
      if (el) el.classList.add('popping');
    }
  };

  /** 更新单个格子（事件驱动） @param {object} game @param {number} index */
  MinesweeperUI.prototype.updateCell = function (game, index) {
    this._paintCell(game, index, 0);
    const el = this._cellEls[index];
    if (el && el.classList.contains('revealed')) el.classList.add('popping');
  };

  /** 终局：全量重绘所有格子外观 */
  MinesweeperUI.prototype.refreshAllCells = function (game) {
    for (let i = 0; i < this._cellEls.length; i++) {
      this._paintCell(game, i, 0);
    }
  };

  /** 失败时抖动棋盘 */
  MinesweeperUI.prototype.shakeBoard = function () {
    const boardEl = this.refs.boardEl;
    boardEl.classList.remove('shake');
    void boardEl.offsetWidth; // 强制重排以重启动画
    boardEl.classList.add('shake');
  };

  /** 按下状态高亮（按下笑脸/左键按住时显示 😮） */
  MinesweeperUI.prototype.setScared = function (flag) {
    const btn = this.refs.faceBtn;
    const mode = btn.dataset.mode;
    if (flag && (mode === 'ready' || mode === 'playing')) {
      this.setFace('scared');
    } else if (!flag && mode === 'scared') {
      this.setFace(this._faceMode || 'playing'); // 恢复为按下前的状态
    }
  };

  /* ---------------- 结果浮层 ---------------- */

  /**
   * 显示终局结果浮层
   * @param {boolean} won
   * @param {object} game
   */
  MinesweeperUI.prototype.showResult = function (won, game) {
    const refs = this.refs;
    const seconds = global.MinesweeperGame.getElapsedSeconds(game);
    refs.resultTitle.textContent = won ? '🎉 扫雷成功！' : '💥 踩雷了！';
    refs.resultDesc.textContent = won
      ? '所有安全格已全部翻开'
      : '再试一次，下一局一定能赢';
    refs.resultMeta.textContent = game.difficultyName + ' · 用时 ' + seconds + ' 秒';
    refs.resultOverlay.classList.toggle('won', won);
    refs.resultOverlay.classList.toggle('lost', !won);
    refs.resultOverlay.classList.add('show');
  };

  /** 关闭结果浮层 */
  MinesweeperUI.prototype.hideResult = function () {
    this.refs.resultOverlay.classList.remove('show');
  };

  global.MinesweeperUI = MinesweeperUI;
})(window);
