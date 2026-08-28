/**
 * app.js — 应用装配层：事件绑定、计时器循环、难度切换、对局调度
 */
(function (global) {
  'use strict';

  const B = global.MinesweeperBoard;
  const G = global.MinesweeperGame;
  const GameStatus = B.GameStatus;

  /** 和弦触发的双击判定间隔（ms） */
  const DBLCLICK_WINDOW = 260;

  function createApp() {
    const app = {
      game: null,
      ui: null,
      timerId: null,
      /** 双键（左+右同时按下）和弦状态 */
      bothDown: false,
      /** 双键和弦后抑制一次 contextmenu 插旗，避免误标旗 */
      suppressContext: false,
      lastClick: { time: 0, row: -1, col: -1 },

      /* ---------- 对局调度 ---------- */

      newGame(difficultyId) {
        this.game = G.createGame(difficultyId);
        this.stopTimerLoop();
        this.ui.hideResult();
        this.ui.renderAll(this.game);
        this.ui.setFace('ready');
      },

      restart() {
        this.newGame(this.game ? this.game.difficultyId : undefined);
      },

      switchDifficulty(difficultyId) {
        this.newGame(difficultyId);
      },

      /* ---------- 计时 ---------- */

      startTimerLoop() {
        this.stopTimerLoop();
        this.timerId = window.setInterval(() => {
          if (this.game && this.game.timerRunning) {
            this.ui.updateTimer(G.getElapsedSeconds(this.game));
          }
        }, 250);
      },

      stopTimerLoop() {
        if (this.timerId !== null) {
          window.clearInterval(this.timerId);
          this.timerId = null;
        }
      },

      /* ---------- 事件处理 ---------- */

      onLeftClick(row, col) {
        const game = this.game;
        if (game.status === GameStatus.WON || game.status === GameStatus.LOST) return;
        this.ui.hideResult();

        // 已翻开的数字格：左键视为和弦尝试（配合双击快速展开）
        const state = B.getState(game.board, row, col);
        if (state === B.CellState.REVEALED) {
          this.tryChord(row, col);
          return;
        }

        const started = game.status === GameStatus.READY;
        const outcome = G.handleCellReveal(game, row, col);
        if (!outcome.ok) return;

        if (game.lastResult) {
          // 统一走级联动画：首点与后续翻格体验一致
          this.ui.applyCascadeReveal(game, game.lastResult.revealedOrder);
        }
        this.afterAction(outcome);
        void started;
      },

      onRightClick(row, col) {
        const game = this.game;
        if (game.status === GameStatus.WON || game.status === GameStatus.LOST) return;
        const outcome = G.handleFlagToggle(game, row, col);
        if (!outcome.ok) return;
        const index = B.toIndex(game.board, row, col);
        this.ui.updateCell(game, index);
        this.ui.updateMineCounter(game);
      },

      /** 和弦：仅在旗数足够时生效 */
      tryChord(row, col) {
        const game = this.game;
        if (game.status === GameStatus.WON || game.status === GameStatus.LOST) return false;
        const state = B.getState(game.board, row, col);
        if (state !== B.CellState.REVEALED) return false;

        const number = B.getNumber(game.board, row, col);
        if (number === 0) return false;

        const neighbors = B.getNeighbors(game.board, row, col);
        let flags = 0;
        for (const n of neighbors) {
          if (B.getStateAt(game.board, n.index) === B.CellState.FLAGGED) flags++;
        }
        if (flags < number) return false;

        const outcome = G.handleChord(game, row, col);
        if (!outcome.ok) return false;
        if (game.lastResult) {
          this.ui.applyCascadeReveal(game, game.lastResult.revealedOrder);
        }
        this.afterAction(outcome);
        return true;
      },

      /** 操作后统一收尾：计时、计数器、终局处理 */
      afterAction(outcome) {
        const game = this.game;
        if (game.timerRunning) this.startTimerLoop();
        this.ui.updateTimer(G.getElapsedSeconds(game));
        this.ui.updateMineCounter(game);

        if (game.status === GameStatus.WON) {
          this.ui.setFace('won');
          this.stopTimerLoop();
          this.ui.refreshAllCells(game);
          this.ui.updateMineCounter(game);
          window.setTimeout(() => this.ui.showResult(true, game), 350);
        } else if (game.status === GameStatus.LOST) {
          this.ui.setFace('lost');
          this.stopTimerLoop();
          this.ui.refreshAllCells(game);
          this.ui.shakeBoard();
          window.setTimeout(() => this.ui.showResult(false, game), 650);
        } else {
          this.ui.setFace('playing');
        }
        void outcome; // outcome 已通过 game.status 间接消费
      },

      /* ---------- 初始化 ---------- */

      init() {
        const refs = {
          boardEl: document.getElementById('board'),
          mineCounterEl: document.getElementById('mine-counter'),
          timerEl: document.getElementById('timer'),
          faceBtn: document.getElementById('face-btn'),
          resultOverlay: document.getElementById('result-overlay'),
          resultTitle: document.getElementById('result-title'),
          resultDesc: document.getElementById('result-desc'),
          resultMeta: document.getElementById('result-meta'),
          resultAgainBtn: document.getElementById('result-again-btn'),
          diffBtns: Array.prototype.slice.call(document.querySelectorAll('.diff-btn')),
        };

        this.ui = new global.MinesweeperUI(refs);
        this.bindEvents(refs);
        this.newGame(B.DEFAULT_DIFFICULTY_ID);
      },

      bindEvents(refs) {
        const self = this;

        // 笑脸按钮：重开；按住显示 😮
        refs.faceBtn.addEventListener('click', () => self.restart());
        refs.faceBtn.addEventListener('mousedown', () => self.ui.setScared(true));
        refs.faceBtn.addEventListener('mouseup', () => self.ui.setScared(false));
        refs.faceBtn.addEventListener('mouseleave', () => self.ui.setScared(false));

        // 难度切换
        refs.diffBtns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            self.switchDifficulty(this.dataset.difficulty);
          });
        });

        // 结果浮层按钮
        refs.resultAgainBtn.addEventListener('click', () => self.restart());
        refs.resultOverlay.addEventListener('click', function (e) {
          if (e.target === this) self.ui.hideResult();
        });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') self.ui.hideResult();
          if (e.key === 'r' || e.key === 'R') self.restart();
        });

        // 棋盘：mousedown 判定双键和弦 + 😮 表情
        refs.boardEl.addEventListener('mousedown', function (e) {
          const cell = e.target.closest('.cell');
          if (!cell) return;
          const buttons = e.buttons;
          const row = Number(cell.dataset.row);
          const col = Number(cell.dataset.col);

          if (buttons === 3) {
            // 左右键同时按下 → 和弦
            self.bothDown = true;
            self.tryChord(row, col);
            return;
          }
          if (e.button === 0) self.ui.setScared(true);
        });

        refs.boardEl.addEventListener('mouseup', function () {
          self.ui.setScared(false);
          if (self.bothDown) {
            // 双键和弦刚结束：右键随后的 contextmenu 不应插旗
            self.suppressContext = true;
          }
          self.bothDown = false;
        });

        refs.boardEl.addEventListener('mouseleave', function () {
          self.ui.setScared(false);
          self.bothDown = false;
        });

        // 阻止右键菜单，并在右键释放时插旗（桌面主路径）
        refs.boardEl.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          if (self.suppressContext) {
            self.suppressContext = false; // 双键和弦的连带右键，跳过插旗
            return;
          }
          const cell = e.target.closest('.cell');
          if (!cell) return;
          self.onRightClick(Number(cell.dataset.row), Number(cell.dataset.col));
        });

        refs.boardEl.addEventListener('click', function (e) {
          const cell = e.target.closest('.cell');
          if (!cell) return;
          const row = Number(cell.dataset.row);
          const col = Number(cell.dataset.col);

          // 双击已翻开数字格 → 和弦
          const now = Date.now();
          const state = B.getState(self.game.board, row, col);
          if (
            state === B.CellState.REVEALED &&
            now - self.lastClick.time < DBLCLICK_WINDOW &&
            self.lastClick.row === row &&
            self.lastClick.col === col
          ) {
            self.lastClick = { time: 0, row: -1, col: -1 };
            self.tryChord(row, col);
            return;
          }
          self.lastClick = { time: now, row, col };
          self.onLeftClick(row, col);
        });

        refs.boardEl.addEventListener('dblclick', function (e) {
          e.preventDefault();
          const cell = e.target.closest('.cell');
          if (!cell) return;
          // dblclick 时 click 已触发两次；第二次 click 若在窗口期内已被拦截，
          // 这里兜底再试一次和弦（幂等：旗不足时无副作用）
          self.tryChord(Number(cell.dataset.row), Number(cell.dataset.col));
        });

        // 触屏 / 移动端长按插旗
        let longPressTimer = null;
        let longPressFired = false;
        const touchCell = (target) => target.closest ? target.closest('.cell') : null;

        refs.boardEl.addEventListener('touchstart', function (e) {
          const cell = touchCell(e.target);
          if (!cell) return;
          longPressFired = false;
          longPressTimer = window.setTimeout(function () {
            longPressFired = true;
            self.onRightClick(Number(cell.dataset.row), Number(cell.dataset.col));
          }, 420);
        }, { passive: true });

        refs.boardEl.addEventListener('touchmove', function () {
          if (longPressTimer) window.clearTimeout(longPressTimer);
        }, { passive: true });

        refs.boardEl.addEventListener('touchend', function (e) {
          if (longPressTimer) window.clearTimeout(longPressTimer);
          if (longPressFired) {
            e.preventDefault(); // 长按后屏蔽随后的 click（需 passive:false 才生效）
            longPressFired = false;
          }
        }, { passive: false });
      },
    };

    return app;
  }

  document.addEventListener('DOMContentLoaded', function () {
    const app = createApp();
    app.init();
    global.minesweeperApp = app; // 便于调试与自动化测试
  });
})(window);
