/**
 * run-logic-tests.js — 在 Node 中模拟 window 环境加载 board.js / game.js，
 * 执行与 test.html 相同的断言集，输出 PASS/FAIL 汇总。
 * 用法：node run-logic-tests.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

global.window = {};
const load = (rel) => eval(fs.readFileSync(path.join(__dirname, rel), 'utf8'));
load('js/board.js');
load('js/game.js');

const B = window.MinesweeperBoard;
const G = window.MinesweeperGame;
let failed = 0;
const results = [];

function check(name, fn) {
  try {
    const ok = fn();
    results.push({ name, ok });
    if (!ok) failed++;
  } catch (err) {
    results.push({ name, ok: false, error: String(err && err.stack ? err.stack : err) });
    failed++;
  }
}

check('难度：初级 9×9/10', () => {
  const d = B.DIFFICULTIES.beginner;
  return d.rows === 9 && d.cols === 9 && d.mines === 10;
});
check('难度：中级 16×16/40', () => {
  const d = B.DIFFICULTIES.intermediate;
  return d.rows === 16 && d.cols === 16 && d.mines === 40;
});
check('难度：高级 16×30/99', () => {
  const d = B.DIFFICULTIES.expert;
  return d.rows === 16 && d.cols === 30 && d.mines === 99;
});

check('布雷数量等于设定值', () => {
  const g = G.createGame('beginner');
  G.handleCellReveal(g, 0, 0);
  return B.getMineIndices(g.board).length === 10;
});

check('首点保护：首点及周围 8 格无雷（抽样 200 局）', () => {
  for (let t = 0; t < 200; t++) {
    const g = G.createGame('beginner');
    G.handleCellReveal(g, 4, 4);
    if (B.isMine(g.board, 4, 4)) return false;
    for (const n of B.getNeighbors(g.board, 4, 4)) {
      if (B.isMine(g.board, n.row, n.col)) return false;
    }
  }
  return true;
});

check('数字格：已翻开格数字等于周围雷数（抽样 30 局）', () => {
  for (let t = 0; t < 30; t++) {
    const g = G.createGame('intermediate');
    G.handleCellReveal(g, 8, 8);
    for (let i = 0; i < g.board.states.length; i++) {
      if (g.board.states[i] !== B.CellState.REVEALED) continue;
      if (B.isMineAt(g.board, i)) return false;
      let expected = 0;
      for (const n of B.getNeighbors(g.board, B.toRow(g.board, i), B.toCol(g.board, i))) {
        if (B.isMineAt(g.board, n.index)) expected++;
      }
      if (B.getNumberAt(g.board, i) !== expected) return false;
    }
  }
  return true;
});

check('连锁展开：展开区不含雷，且 0 数字格的邻居全部翻开（抽样 50 局）', () => {
  for (let t = 0; t < 50; t++) {
    const g = G.createGame('expert');
    const r = G.handleCellReveal(g, 8, 15);
    if (!r.ok || r.hitMine) continue;
    for (let i = 0; i < g.board.states.length; i++) {
      if (g.board.states[i] !== B.CellState.REVEALED) continue;
      if (B.isMineAt(g.board, i)) return false;
      if (B.getNumberAt(g.board, i) === 0) {
        for (const n of B.getNeighbors(g.board, B.toRow(g.board, i), B.toCol(g.board, i))) {
          const st = B.getStateAt(g.board, n.index);
          // 空白格邻居只能是已翻开（非雷）或插旗
          if (st !== B.CellState.REVEALED && st !== B.CellState.FLAGGED) return false;
        }
      }
    }
  }
  return true;
});

check('插旗循环 hidden→flagged→question→hidden', () => {
  const g = G.createGame('beginner');
  return B.toggleFlag(g.board, 0, 0) === 'flagged'
    && B.toggleFlag(g.board, 0, 0) === 'question'
    && B.toggleFlag(g.board, 0, 0) === 'hidden';
});

check('已翻开格不可插旗', () => {
  const g = G.createGame('beginner');
  G.handleCellReveal(g, 0, 0);
  const idx = g.board.states.findIndex((s) => s === B.CellState.REVEALED);
  return B.toggleFlag(g.board, B.toRow(g.board, idx), B.toCol(g.board, idx)) === null;
});

check('剩余雷数 = 总雷数 - 旗数', () => {
  const g = G.createGame('beginner');
  B.toggleFlag(g.board, 0, 0);
  B.toggleFlag(g.board, 0, 1);
  return B.countRemainingMines(g.board) === 8;
});

check('旗/问号格不可被左键翻开', () => {
  const g = G.createGame('beginner');
  B.toggleFlag(g.board, 0, 0);
  const r = G.handleCellReveal(g, 0, 0);
  return r.ok === false && B.getState(g.board, 0, 0) === 'flagged';
});

check('胜利：所有非雷格翻开后自动插满旗（抽样 20 局）', () => {
  for (let t = 0; t < 20; t++) {
    const g = G.createGame('beginner');
    G.handleCellReveal(g, 0, 0);
    for (let r = 0; r < 9 && g.status === 'playing'; r++) {
      for (let c = 0; c < 9 && g.status === 'playing'; c++) {
        const st = B.getState(g.board, r, c);
        if (st === B.CellState.REVEALED || st === B.CellState.FLAGGED) continue;
        if (B.isMine(g.board, r, c)) {
          B.toggleFlag(g.board, r, c);
        } else {
          const res = G.handleCellReveal(g, r, c);
          if (res.hitMine) return false;
        }
      }
    }
    if (g.status !== 'won') return false;
    if (B.countFlags(g.board) !== 10) return false;
    if (B.countRemainingMines(g.board) !== 0) return false;
  }
  return true;
});

check('踩雷：游戏失败并翻开所有雷', () => {
  const g = G.createGame('beginner');
  G.handleCellReveal(g, 0, 0);
  const idx = B.getMineIndices(g.board)[0];
  const res = G.handleCellReveal(g, B.toRow(g.board, idx), B.toCol(g.board, idx));
  if (!res.hitMine || g.status !== 'lost') return false;
  for (const m of B.getMineIndices(g.board)) {
    const st = B.getStateAt(g.board, m);
    if (st !== B.CellState.REVEALED && st !== B.CellState.FLAGGED) return false;
  }
  return true;
});

check('失败时标错的旗被识别（wronglyFlagged）', () => {
  const g = G.createGame('beginner');
  G.handleCellReveal(g, 0, 0);
  // 找一个非雷隐藏格插错旗
  let wrongIdx = -1;
  for (let i = 0; i < g.board.states.length; i++) {
    if (g.board.states[i] === B.CellState.HIDDEN && !B.isMineAt(g.board, i)) {
      B.toggleFlag(g.board, B.toRow(g.board, i), B.toCol(g.board, i));
      wrongIdx = i;
      break;
    }
  }
  const idx = B.getMineIndices(g.board)[0];
  G.handleCellReveal(g, B.toRow(g.board, idx), B.toCol(g.board, idx));
  return g.status === 'lost' && B.getWronglyFlaggedIndices(g.board).includes(wrongIdx);
});

check('和弦：旗数足够时展开周围隐藏格', () => {
  for (let t = 0; t < 80; t++) {
    const g = G.createGame('beginner');
    G.handleCellReveal(g, 0, 0);
    // 找一个已翻开的数字>0 的格子
    let target = -1;
    for (let i = 0; i < g.board.states.length; i++) {
      if (g.board.states[i] === B.CellState.REVEALED && B.getNumberAt(g.board, i) > 0) {
        target = i;
        break;
      }
    }
    if (target === -1) continue;
    const r0 = B.toRow(g.board, target);
    const c0 = B.toCol(g.board, target);
    const number = B.getNumberAt(g.board, target);
    // 给其周围全部真实雷插旗（number 即周围雷数，定义上等于相邻雷数量）
    let flagged = 0;
    for (const n of B.getNeighbors(g.board, r0, c0)) {
      if (g.board.states[n.index] === B.CellState.HIDDEN && B.isMineAt(g.board, n.index)) {
        B.toggleFlag(g.board, n.row, n.col);
        flagged++;
      }
    }
    if (flagged < number) continue; // 理论不可达，防御式跳过
    // 统计和弦可展开的邻居（隐藏且未插旗）
    let revealable = 0;
    for (const n of B.getNeighbors(g.board, r0, c0)) {
      if (g.board.states[n.index] === B.CellState.HIDDEN) revealable++;
    }
    if (revealable === 0) continue; // 边界格：非雷邻居全已翻开，和弦合法地无事可做
    const before = B.countRevealed(g.board);
    const res = G.handleChord(g, r0, c0);
    if (!res.ok) return false;
    if (res.hitMine) return false; // 全部正确插旗时和弦绝不踩雷
    return B.countRevealed(g.board) > before;
  }
  return true;
});

check('和弦：旗数不足时不展开', () => {
  const g = G.createGame('beginner');
  G.handleCellReveal(g, 0, 0);
  let target = -1;
  for (let i = 0; i < g.board.states.length; i++) {
    if (g.board.states[i] === B.CellState.REVEALED && B.getNumberAt(g.board, i) > 0) {
      target = i;
      break;
    }
  }
  if (target === -1) return true;
  const before = B.countRevealed(g.board);
  const res = G.handleChord(g, B.toRow(g.board, target), B.toCol(g.board, target));
  return res.ok === false && B.countRevealed(g.board) === before;
});

check('计时：首翻启动、终局凝固', () => {
  const g = G.createGame('beginner');
  const t0 = G.getElapsedSeconds(g);
  if (t0 !== 0 || g.timerRunning) return false;
  G.handleCellReveal(g, 0, 0);
  if (!g.timerRunning) return false;
  const idx = B.getMineIndices(g.board)[0];
  G.handleCellReveal(g, B.toRow(g.board, idx), B.toCol(g.board, idx));
  return g.status === 'lost' && !g.timerRunning && g.elapsedMs >= 0;
});

check('重开：相同难度、状态归零', () => {
  const g = G.createGame('expert');
  G.handleCellReveal(g, 0, 0);
  const g2 = G.restart(g);
  return g2.difficultyId === 'expert' && g2.status === 'ready' && B.countRevealed(g2.board) === 0;
});

check('终局后不可继续操作', () => {
  const g = G.createGame('beginner');
  G.handleCellReveal(g, 0, 0);
  const idx = B.getMineIndices(g.board)[0];
  G.handleCellReveal(g, B.toRow(g.board, idx), B.toCol(g.board, idx));
  const st = g.status;
  const r1 = G.handleCellReveal(g, 0, 8);
  const r2 = G.handleFlagToggle(g, 0, 8);
  return st === 'lost' && r1.ok === false && r2.ok === false;
});

check('非法难度回退到默认（初级）', () => {
  const g = G.createGame('unknown-difficulty');
  return g.difficultyId === 'beginner' && g.rows === 9;
});

/* ---------- UI 层调用的核心函数存在性与签名抽查 ---------- */
check('接口完整性：UI/app 层调用的函数均存在', () => {
  const need = [
    'CellState', 'GameStatus', 'DIFFICULTIES', 'DEFAULT_DIFFICULTY_ID',
    'toIndex', 'toRow', 'toCol', 'inBounds', 'getNeighbors',
    'createBoard', 'placeMines', 'computeNumbers',
    'isMine', 'isMineAt', 'getState', 'getStateAt', 'getNumber', 'getNumberAt',
    'revealCell', 'floodFillReveal', 'toggleFlag', 'chordReveal',
    'countFlags', 'countRevealed', 'countRemainingMines',
    'isWin', 'flagAllMines', 'revealAllMines',
    'getMineIndices', 'getWronglyFlaggedIndices',
  ];
  for (const k of need) if (typeof B[k] === 'undefined') return false;
  const needG = ['createGame', 'handleCellReveal', 'handleFlagToggle', 'handleChord',
    'computeElapsedMs', 'getElapsedSeconds', 'restart'];
  for (const k of needG) if (typeof G[k] !== 'function') return false;
  return true;
});

for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  console.log('[' + mark + '] ' + r.name + (r.error ? '\n  ' + r.error : ''));
}
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') + ' — 共 ' + results.length + ' 项');
process.exit(failed === 0 ? 0 : 1);
