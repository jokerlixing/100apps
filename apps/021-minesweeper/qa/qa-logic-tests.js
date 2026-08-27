/**
 * qa-logic-tests.js — QA 独立复核测试（作者：严过关 / software-qa-engineer）
 *
 * 独立于工程师的 run-logic-tests.js，全部断言由 QA 自行设计：
 *  - 使用可控随机种子（mulberry32）保证抽样测试可复现
 *  - 使用 Date.now 打桩验证计时凝固逻辑
 *  - 手工构造棋盘（白盒）验证和弦踩雷等确定性场景
 *  - 用独立编写的邻域重算公式交叉核对邻雷数
 *
 * 用法：node qa/qa-logic-tests.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* ---------------- 加载被测源码（模拟浏览器全局 window） ---------------- */
global.window = {};
(function loadScript(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  // 间接 eval：在全局作用域执行，等价于浏览器 <script> 标签
  (0, eval)(code);
})('js/board.js');
(function loadScript(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  (0, eval)(code);
})('js/game.js');
// ui.js 顶层仅定义构造器与原型方法（无 DOM 访问），可安全加载用于纯函数测试
(function loadScript(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  (0, eval)(code);
})('js/ui.js');

const B = window.MinesweeperBoard;
const G = window.MinesweeperGame;

/* ---------------- 断言与测试运行器 ---------------- */
const results = [];
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || '') + `（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`);
  }
}

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (err) {
    failed++;
    results.push({ name, ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function section(title) {
  results.push({ name: '── ' + title + ' ──', ok: null });
}

/* ---------------- 可控随机数（mulberry32，测试可复现） ---------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 在固定种子下执行 fn，执行期间 Math.random 被替换，结束后恢复 */
function withSeededRandom(seed, fn) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

function randInt(n) {
  return Math.floor(Math.random() * n);
}

/** QA 独立编写的邻雷数重算（直接索引运算，不依赖 getNeighbors 的实现方式） */
function recountMinesAround(board, index) {
  const cols = board.cols;
  const rows = board.rows;
  const r = Math.floor(index / cols);
  const c = index % cols;
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      if (board.mines[rr * cols + cc] === 1) count++;
    }
  }
  return count;
}

/** 状态快照（用于“无任何变化”断言） */
function snapshot(board) {
  return JSON.stringify(Array.from(board.states));
}

/* ================================================================
 * A. 难度参数与棋盘构建
 * ================================================================ */
section('A. 难度参数与棋盘构建');

check('A1 三档难度参数：初级 9×9/10、中级 16×16/40、高级 16×30/99', () => {
  assertEq(B.DIFFICULTIES.beginner.rows, 9, '初级行数');
  assertEq(B.DIFFICULTIES.beginner.cols, 9, '初级列数');
  assertEq(B.DIFFICULTIES.beginner.mines, 10, '初级雷数');
  assertEq(B.DIFFICULTIES.intermediate.rows, 16, '中级行数');
  assertEq(B.DIFFICULTIES.intermediate.cols, 16, '中级列数');
  assertEq(B.DIFFICULTIES.intermediate.mines, 40, '中级雷数');
  assertEq(B.DIFFICULTIES.expert.rows, 16, '高级行数');
  assertEq(B.DIFFICULTIES.expert.cols, 30, '高级列数');
  assertEq(B.DIFFICULTIES.expert.mines, 99, '高级雷数');
});

check('A2 createBoard 初始化：状态全 hidden、雷全 0、未布雷、未爆炸', () => {
  const board = B.createBoard(9, 9, 10);
  assertEq(board.rows, 9, 'rows');
  assertEq(board.cols, 9, 'cols');
  assertEq(board.mineCount, 10, 'mineCount');
  assertEq(board.states.length, 81, '格子总数');
  assert(board.states.every((s) => s === 'hidden'), '初始状态应全为 hidden');
  assert(Array.from(board.mines).every((m) => m === 0), '初始应无雷');
  assertEq(board.minesPlaced, false, 'minesPlaced');
  assertEq(board.explodedIndex, -1, 'explodedIndex');
});

check('A3 createBoard 非法参数抛 RangeError', () => {
  let threw = 0;
  try { B.createBoard(1, 9, 1); } catch (e) { threw++; assert(e instanceof RangeError, '应为 RangeError'); }
  try { B.createBoard(9, 1, 1); } catch (e) { threw++; }
  try { B.createBoard(9, 9, 0); } catch (e) { threw++; }
  try { B.createBoard(9, 9, 80); } catch (e) { threw++; } // 81-80=1 < 2
  try { B.createBoard(9, 9, 79); } catch (e) { threw--; assert(false, '79 颗雷应合法（81-79=2）'); }
  assertEq(threw, 4, '非法用例应全部抛错');
});

/* ================================================================
 * B. 坐标边界与邻域
 * ================================================================ */
section('B. 坐标边界与邻域');

check('B1 四角格邻居数=3 且索引均在棋盘内', () => {
  const board = B.createBoard(9, 9, 10);
  const corners = [[0, 0], [0, 8], [8, 0], [8, 8]];
  for (const [r, c] of corners) {
    const ns = B.getNeighbors(board, r, c);
    assertEq(ns.length, 3, `角格 (${r},${c}) 邻居数`);
    for (const n of ns) {
      assert(n.index >= 0 && n.index < 81, `角格邻居索引越界: ${n.index}`);
      assert(n.row >= 0 && n.row < 9 && n.col >= 0 && n.col < 9, '角格邻居坐标越界');
    }
  }
});

check('B2 边缘格邻居数=5', () => {
  const board = B.createBoard(9, 9, 10);
  assertEq(B.getNeighbors(board, 0, 4).length, 5, '上边');
  assertEq(B.getNeighbors(board, 8, 4).length, 5, '下边');
  assertEq(B.getNeighbors(board, 4, 0).length, 5, '左边');
  assertEq(B.getNeighbors(board, 4, 8).length, 5, '右边');
});

check('B3 内部格邻居数=8', () => {
  const board = B.createBoard(9, 9, 10);
  assertEq(B.getNeighbors(board, 4, 4).length, 8, '中心格');
});

check('B4 inBounds 越界判定', () => {
  const board = B.createBoard(9, 9, 10);
  assertEq(B.inBounds(board, -1, 0), false, '行-1');
  assertEq(B.inBounds(board, 0, -1), false, '列-1');
  assertEq(B.inBounds(board, 9, 0), false, '行越界');
  assertEq(B.inBounds(board, 0, 9), false, '列越界');
  assertEq(B.inBounds(board, 0, 0), true, '(0,0) 在界内');
  assertEq(B.inBounds(board, 8, 8), true, '(8,8) 在界内');
});

check('B5 toIndex/toRow/toCol 往返一致（含四角）', () => {
  const board = B.createBoard(16, 30, 99);
  const samples = [0, 29, 450, 479, 240, 16 * 30 - 1];
  for (const i of samples) {
    assertEq(B.toIndex(board, B.toRow(board, i), B.toCol(board, i)), i, `索引 ${i} 往返不一致`);
  }
});

/* ================================================================
 * C. 布雷与首点保护
 * ================================================================ */
section('C. 布雷与首点保护');

check('C1 布雷数量精确、placeMines 幂等（二次调用返回 false）', () => {
  withSeededRandom(20260826, () => {
    const board = B.createBoard(9, 9, 10);
    const first = B.placeMines(board, 4, 4);
    assertEq(first, true, '首次布雷应返回 true');
    const mineCount = Array.from(board.mines).filter((m) => m === 1).length;
    assertEq(mineCount, 10, '雷数不等于设定值');
    assertEq(B.getMineIndices(board).length, 10, 'getMineIndices 长度');
    assertEq(board.minesPlaced, true, 'minesPlaced');
    // 再布一次：不得改变雷布局
    const minesBefore = Array.from(board.mines).join('');
    const second = B.placeMines(board, 0, 0);
    assertEq(second, false, '二次布雷应返回 false');
    assertEq(Array.from(board.mines).join(''), minesBefore, '二次布雷不得改动雷布局');
  });
});

check('C2 首点保护（中心点抽样 300 局）：首点及周围 8 格无雷', () => {
  withSeededRandom(1001, () => {
    for (let t = 0; t < 300; t++) {
      const game = G.createGame('beginner');
      const res = G.handleCellReveal(game, 4, 4);
      assert(res.ok && !res.hitMine, '受保护首翻不应踩雷');
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          assertEq(B.isMine(game.board, 4 + dr, 4 + dc), false, `第 ${t} 局保护格 (${4 + dr},${4 + dc}) 出现雷`);
        }
      }
    }
  });
});

check('C3 首点保护（四角抽样各 80 局）：首点及其邻居无雷', () => {
  withSeededRandom(1002, () => {
    const corners = [[0, 0], [0, 8], [8, 0], [8, 8]];
    for (const [r, c] of corners) {
      for (let t = 0; t < 80; t++) {
        const game = G.createGame('beginner');
        const res = G.handleCellReveal(game, r, c);
        assert(res.ok && !res.hitMine, `角 (${r},${c}) 首翻不应踩雷`);
        assertEq(B.isMine(game.board, r, c), false, `角 (${r},${c}) 首点不应是雷`);
        for (const n of B.getNeighbors(game.board, r, c)) {
          assertEq(B.isMine(game.board, n.row, n.col), false, `角 (${r},${c}) 邻居 (${n.row},${n.col}) 不应是雷`);
        }
      }
    }
  });
});

check('C4 首点保护（专家难度抽样 60 局）', () => {
  withSeededRandom(1003, () => {
    for (let t = 0; t < 60; t++) {
      const game = G.createGame('expert');
      const r = randInt(16);
      const c = randInt(30);
      const res = G.handleCellReveal(game, r, c);
      assert(res.ok && !res.hitMine, '受保护首翻不应踩雷');
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= 16 || cc < 0 || cc >= 30) continue;
          assertEq(B.isMine(game.board, rr, cc), false, `专家难度保护格 (${rr},${cc}) 出现雷`);
        }
      }
    }
  });
});

check('C5 布雷分布均匀性（800 局统计：每格布雷频率在期望值 ±50% 内）', () => {
  withSeededRandom(1004, () => {
    const TRIALS = 800;
    const counts = new Array(81).fill(0);
    for (let t = 0; t < TRIALS; t++) {
      const board = B.createBoard(9, 9, 10);
      B.placeMines(board, 4, 4);
      for (const idx of B.getMineIndices(board)) counts[idx]++;
    }
    // 保护格（中心 3×3 共 9 格）期望为 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const idx = (4 + dr) * 9 + (4 + dc);
        assertEq(counts[idx], 0, '保护格不应出现雷');
      }
    }
    // 其余 72 格期望 ≈ 800×10/72 ≈ 111
    const expected = (TRIALS * 10) / 72;
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      if (Math.abs(r - 4) <= 1 && Math.abs(c - 4) <= 1) continue;
      assert(
        counts[i] > expected * 0.5 && counts[i] < expected * 1.5,
        `格 ${i} 布雷频率 ${counts[i]} 偏离期望 ${expected.toFixed(1)} 超过 ±50%`
      );
    }
  });
});

check('C6 雷格的 numbers 保持 0（雷格不显示数字）', () => {
  withSeededRandom(1005, () => {
    for (let t = 0; t < 20; t++) {
      const board = B.createBoard(16, 16, 40);
      B.placeMines(board, 8, 8);
      for (const idx of B.getMineIndices(board)) {
        assertEq(board.numbers[idx], 0, `雷格 ${idx} 的数字应为 0`);
      }
    }
  });
});

/* ================================================================
 * D. 邻雷数计算（独立公式交叉核对）
 * ================================================================ */
section('D. 邻雷数计算');

check('D1 手工构造 5×5 棋盘：数字与人工推算一致', () => {
  // 雷位于 (0,0) (1,3) (3,1) (4,4)
  const board = B.createBoard(5, 5, 4);
  const mineSpots = [[0, 0], [1, 3], [3, 1], [4, 4]];
  for (const [r, c] of mineSpots) board.mines[r * 5 + c] = 1;
  board.minesPlaced = true; // 白盒：手工布雷后标记已布雷
  B.computeNumbers(board);
  for (let i = 0; i < 25; i++) {
    const expected = board.mines[i] === 1 ? 0 : recountMinesAround(board, i);
    assertEq(board.numbers[i], expected, `格 ${i}（${Math.floor(i / 5)},${i % 5}）数字错误`);
  }
  // 抽查具体值：(0,1) 邻 (0,0) → 1；(2,2) 邻 (1,3),(3,1) → 2；(4,3) 邻 (4,4),(3,3)? (3,3) 非雷 → 1
  assertEq(board.numbers[1], 1, '(0,1)');
  assertEq(board.numbers[12], 2, '(2,2)');
  assertEq(board.numbers[23], 1, '(4,3)');
});

check('D2 随机 20 局专家难度：全盘独立重算核对', () => {
  withSeededRandom(1006, () => {
    for (let t = 0; t < 20; t++) {
      const board = B.createBoard(16, 30, 99);
      B.placeMines(board, 8, 15);
      assertEq(B.getMineIndices(board).length, 99, '雷数');
      for (let i = 0; i < 480; i++) {
        const expected = board.mines[i] === 1 ? 0 : recountMinesAround(board, i);
        assertEq(board.numbers[i], expected, `第 ${t} 局格 ${i} 数字错误`);
        assert(board.numbers[i] >= 0 && board.numbers[i] <= 8, `数字越界: ${board.numbers[i]}`);
      }
    }
  });
});

/* ================================================================
 * E. 翻格与连锁展开
 * ================================================================ */
section('E. 翻格与连锁展开');

check('E1 首翻：ok、进入 playing、计时启动、首格被翻开', () => {
  withSeededRandom(2001, () => {
    const game = G.createGame('beginner');
    assertEq(game.status, 'ready', '初始状态应为 ready');
    const res = G.handleCellReveal(game, 4, 4);
    assert(res.ok, '首翻应成功');
    assert(!res.hitMine, '首翻不应踩雷');
    assertEq(game.status, 'playing', '首翻后应为 playing');
    assertEq(game.timerRunning, true, '计时应启动');
    assertEq(B.getState(game.board, 4, 4), 'revealed', '首格应已翻开');
  });
});

check('E2 连锁展开：展开区无雷、revealedOrder 无重复且只含本次新翻格', () => {
  withSeededRandom(2002, () => {
    let bigFloodSeen = false;
    for (let t = 0; t < 60; t++) {
      const game = G.createGame('expert');
      const before = snapshot(game.board);
      G.handleCellReveal(game, 8, 15);
      // handleCellReveal 的 outcome 只含 {ok,hitMine,prevStatus,status}；
      // 展开顺序在其 lastResult.revealedOrder 上
      const order = game.lastResult ? game.lastResult.revealedOrder : null;
      assert(order && Array.isArray(order), 'lastResult.revealedOrder 应为数组');
      if (order.length >= 20) bigFloodSeen = true;
      // 无重复
      assertEq(new Set(order).size, order.length, 'revealedOrder 存在重复');
      // 只含本次新翻格
      for (const idx of order) {
        assertEq(game.board.states[idx], 'revealed', `展开索引 ${idx} 未处于翻开态`);
        assertEq(JSON.parse(before)[idx], 'hidden', `索引 ${idx} 在本次操作前并非隐藏态`);
      }
      // 展开区无雷
      for (const idx of order) {
        assertEq(B.isMineAt(game.board, idx), false, `展开区格 ${idx} 是雷`);
      }
    }
    assert(bigFloodSeen, '60 局抽样中未出现 ≥20 格的连锁展开，抽样不足以验证 flood fill');
  });
});

check('E3 连锁展开边界：与未翻开格相邻的已翻开格数字全部 ≥1', () => {
  withSeededRandom(2003, () => {
    for (let t = 0; t < 60; t++) {
      const game = G.createGame('expert');
      G.handleCellReveal(game, 8, 15);
      for (let i = 0; i < 480; i++) {
        if (game.board.states[i] !== 'revealed') continue;
        const ns = B.getNeighbors(game.board, B.toRow(game.board, i), B.toCol(game.board, i));
        const hasHiddenNeighbor = ns.some((n) => game.board.states[n.index] !== 'revealed');
        if (hasHiddenNeighbor) {
          assert(
            B.getNumberAt(game.board, i) >= 1,
            `展开区边界格 ${i} 数字为 ${B.getNumberAt(game.board, i)}，应为 ≥1`
          );
        }
      }
    }
  });
});

check('E4 空白格（数字 0）的邻居全部为已翻开或插旗', () => {
  withSeededRandom(2004, () => {
    for (let t = 0; t < 60; t++) {
      const game = G.createGame('intermediate');
      G.handleCellReveal(game, 8, 8);
      for (let i = 0; i < 256; i++) {
        if (game.board.states[i] !== 'revealed') continue;
        if (B.getNumberAt(game.board, i) !== 0) continue;
        const ns = B.getNeighbors(game.board, B.toRow(game.board, i), B.toCol(game.board, i));
        for (const n of ns) {
          const st = game.board.states[n.index];
          assert(
            st === 'revealed' || st === 'flagged',
            `空白格 ${i} 的邻居 ${n.index} 状态为 ${st}，应为 revealed/flagged`
          );
        }
      }
    }
  });
});

check('E5 已翻开格再翻：ok=false 且状态不变', () => {
  withSeededRandom(2005, () => {
    const game = G.createGame('beginner');
    G.handleCellReveal(game, 4, 4);
    const res = G.handleCellReveal(game, 4, 4);
    assertEq(res.ok, false, '重复翻开应 ok=false');
    assertEq(B.getState(game.board, 4, 4), 'revealed', '状态应保持 revealed');
  });
});

check('E6 插旗格不可左键翻开；问号格可以左键翻开', () => {
  withSeededRandom(2006, () => {
    const game = G.createGame('beginner');
    // 旗格
    B.toggleFlag(game.board, 0, 0);
    const r1 = G.handleCellReveal(game, 0, 0);
    assertEq(r1.ok, false, '旗格左键应被拒绝');
    assertEq(B.getState(game.board, 0, 0), 'flagged', '旗格状态不应变化');
    // 问号格
    B.toggleFlag(game.board, 0, 1); // → flagged
    B.toggleFlag(game.board, 0, 1); // → question
    assertEq(B.getState(game.board, 0, 1), 'question', '应为问号态');
    const r2 = G.handleCellReveal(game, 0, 1);
    assert(r2.ok, '问号格左键应可翻开');
    assertEq(B.getState(game.board, 0, 1), 'revealed', '问号格翻开后应为 revealed');
  });
});

check('E7 越界翻格：ok=false 不抛异常', () => {
  const game = G.createGame('beginner');
  assertEq(G.handleCellReveal(game, -1, 0).ok, false, '(-1,0)');
  assertEq(G.handleCellReveal(game, 0, -1).ok, false, '(0,-1)');
  assertEq(G.handleCellReveal(game, 9, 0).ok, false, '(9,0)');
  assertEq(G.handleCellReveal(game, 0, 9).ok, false, '(0,9)');
  assertEq(B.revealCell(game.board, -5, 99).ok, false, '(-5,99)');
});

check('E8 踩雷：hitMine、lost、explodedIndex 指向被踩雷、全部未插旗雷被翻开', () => {
  withSeededRandom(2007, () => {
    const game = G.createGame('beginner');
    G.handleCellReveal(game, 4, 4); // 布雷
    const mineIdx = B.getMineIndices(game.board)[0];
    const res = G.handleCellReveal(game, B.toRow(game.board, mineIdx), B.toCol(game.board, mineIdx));
    assertEq(res.hitMine, true, '应触发 hitMine');
    assertEq(game.status, 'lost', '状态应为 lost');
    assertEq(game.board.explodedIndex, mineIdx, 'explodedIndex 应指向被踩雷');
    assertEq(game.timerRunning, false, '终局应停止计时');
    for (const m of B.getMineIndices(game.board)) {
      assertEq(game.board.states[m], 'revealed', `雷格 ${m} 应被翻开`);
    }
  });
});

check('E9 踩雷时已正确插旗的雷保持旗子', () => {
  withSeededRandom(2008, () => {
    const game = G.createGame('beginner');
    G.handleCellReveal(game, 4, 4);
    const mines = B.getMineIndices(game.board);
    // 给除最后一颗外的所有雷插旗
    for (let k = 0; k < mines.length - 1; k++) {
      B.toggleFlag(game.board, B.toRow(game.board, mines[k]), B.toCol(game.board, mines[k]));
    }
    const target = mines[mines.length - 1];
    G.handleCellReveal(game, B.toRow(game.board, target), B.toCol(game.board, target));
    assertEq(game.status, 'lost', '应失败');
    for (let k = 0; k < mines.length - 1; k++) {
      assertEq(game.board.states[mines[k]], 'flagged', `已插旗雷 ${mines[k]} 应保持旗子`);
    }
  });
});

/* ================================================================
 * F. 插旗循环
 * ================================================================ */
section('F. 插旗循环');

check('F1 插旗循环 hidden→flagged→question→hidden（重复两轮）', () => {
  const game = G.createGame('beginner');
  for (let round = 0; round < 2; round++) {
    assertEq(B.toggleFlag(game.board, 0, 0), 'flagged', 'hidden→flagged');
    assertEq(B.toggleFlag(game.board, 0, 0), 'question', 'flagged→question');
    assertEq(B.toggleFlag(game.board, 0, 0), 'hidden', 'question→hidden');
  }
});

check('F2 已翻开格 toggleFlag 返回 null 且状态不变', () => {
  withSeededRandom(2101, () => {
    const game = G.createGame('beginner');
    G.handleCellReveal(game, 4, 4);
    const idx = game.board.states.findIndex((s) => s === 'revealed');
    const r = B.toRow(game.board, idx);
    const c = B.toCol(game.board, idx);
    assertEq(B.toggleFlag(game.board, r, c), null, '已翻开格应返回 null');
    assertEq(B.getState(game.board, r, c), 'revealed', '状态不应变化');
  });
});

check('F3 越界 toggleFlag 返回 null', () => {
  const game = G.createGame('beginner');
  assertEq(B.toggleFlag(game.board, -1, 0), null, '(-1,0)');
  assertEq(B.toggleFlag(game.board, 0, 9), null, '(0,9)');
});

check('F4 旗数统计与剩余雷数（可为负）', () => {
  const game = G.createGame('beginner');
  // 插 12 面旗（雷只有 10）→ 剩余 -2
  let flagged = 0;
  outer:
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (B.toggleFlag(game.board, r, c) === 'flagged') {
        flagged++;
        if (flagged === 12) break outer;
      }
    }
  }
  assertEq(flagged, 12, '应成功插 12 面旗');
  assertEq(B.countFlags(game.board), 12, 'countFlags');
  assertEq(B.countRemainingMines(game.board), -2, '旗多于雷时剩余雷数应为 -2');
});

check('F5 终局后 handleFlagToggle 被拒绝', () => {
  withSeededRandom(2102, () => {
    const game = G.createGame('beginner');
    G.handleCellReveal(game, 4, 4);
    const m = B.getMineIndices(game.board)[0];
    G.handleCellReveal(game, B.toRow(game.board, m), B.toCol(game.board, m));
    assertEq(game.status, 'lost', '应已失败');
    assertEq(G.handleFlagToggle(game, 0, 8).ok, false, '终局后插旗应被拒绝');
  });
});

/* ================================================================
 * G. 和弦 chordReveal
 * ================================================================ */
section('G. 和弦 chordReveal');

check('G1 未翻开格和弦：ok=false', () => {
  const game = G.createGame('beginner');
  assertEq(B.chordReveal(game.board, 0, 0).ok, false, '隐藏格');
  B.toggleFlag(game.board, 0, 1);
  assertEq(B.chordReveal(game.board, 0, 1).ok, false, '旗格');
});

check('G2 数字 0 的已翻开格和弦：ok=false（无意义操作）', () => {
  withSeededRandom(2201, () => {
    // 构造一个保证首格数字为 0 的局：中心受保护且概率为 0 的邻域展开
    for (let t = 0; t < 50; t++) {
      const game = G.createGame('beginner');
      G.handleCellReveal(game, 4, 4);
      if (B.getNumber(game.board, 4, 4) === 0) {
        const res = B.chordReveal(game.board, 4, 4);
        assertEq(res.ok, false, '0 数字格和弦应 ok=false');
        return;
      }
    }
    throw new Error('50 局中未出现数字 0 的首格，抽样不足');
  });
});

check('G3 旗数不足：ok=false 且全盘状态零变化', () => {
  withSeededRandom(2202, () => {
    for (let t = 0; t < 30; t++) {
      const game = G.createGame('beginner');
      G.handleCellReveal(game, 4, 4);
      // 找一个已翻开且周围有隐藏格的数字格
      let target = -1;
      for (let i = 0; i < 81; i++) {
        if (game.board.states[i] !== 'revealed' || B.getNumberAt(game.board, i) === 0) continue;
        const ns = B.getNeighbors(game.board, B.toRow(game.board, i), B.toCol(game.board, i));
        if (ns.some((n) => game.board.states[n.index] === 'hidden')) { target = i; break; }
      }
      if (target === -1) continue;
      const before = snapshot(game.board);
      const res = G.handleChord(game, B.toRow(game.board, target), B.toCol(game.board, target));
      assertEq(res.ok, false, '旗数不足时和弦应 ok=false');
      assertEq(snapshot(game.board), before, '旗数不足时全盘状态不得有任何变化');
      return;
    }
    throw new Error('30 局中未找到可测的数字格');
  });
});

check('G4 正确插旗后和弦：展开周围未标记格且不踩雷', () => {
  withSeededRandom(2203, () => {
    let exercised = 0;
    for (let t = 0; t < 120; t++) {
      const game = G.createGame('beginner');
      G.handleCellReveal(game, 4, 4);
      let target = -1;
      for (let i = 0; i < 81; i++) {
        if (game.board.states[i] !== 'revealed' || B.getNumberAt(game.board, i) === 0) continue;
        const ns = B.getNeighbors(game.board, B.toRow(game.board, i), B.toCol(game.board, i));
        const hasHidden = ns.some((n) => game.board.states[n.index] === 'hidden');
        if (hasHidden) { target = i; break; }
      }
      if (target === -1) continue;
      const r0 = B.toRow(game.board, target);
      const c0 = B.toCol(game.board, target);
      const number = B.getNumberAt(game.board, target);
      // 给周围全部真实雷插旗
      for (const n of B.getNeighbors(game.board, r0, c0)) {
        if (game.board.states[n.index] === 'hidden' && B.isMineAt(game.board, n.index)) {
          B.toggleFlag(game.board, n.row, n.col);
        }
      }
      assert(B.countFlags(game.board) >= number, '插旗数应达到数字要求');
      // 若插旗后已无可展开的隐藏邻格（隐藏邻居全是雷），和弦合法地无事可做，跳过该局
      const revealable = B.getNeighbors(game.board, r0, c0)
        .filter((n) => game.board.states[n.index] === 'hidden').length;
      if (revealable === 0) continue;
      const before = B.countRevealed(game.board);
      const res = G.handleChord(game, r0, c0);
      assert(res.ok, '和弦应成功');
      assertEq(res.hitMine, false, '全部正确插旗时和弦绝不踩雷');
      assert(B.countRevealed(game.board) > before, '和弦应翻开更多格子');
      exercised++;
    }
    assert(exercised >= 50, `有效和弦场景仅 ${exercised} 次，抽样不足`);
  });
});

check('G5 手工构造：旗数足够但旗插错位置 → 和弦踩雷 → lost（确定性）', () => {
  // 4×4，雷在 (0,1) 与 (0,3)
  const board = B.createBoard(4, 4, 2);
  board.mines[0 * 4 + 1] = 1;
  board.mines[0 * 4 + 3] = 1;
  board.minesPlaced = true;
  B.computeNumbers(board);
  assertEq(board.numbers[1 * 4 + 0], 1, '(1,0) 数字应为 1（邻 (0,1) 雷）');
  // 翻开 (1,0)
  const out = [];
  B.floodFillReveal(board, 1, 0, out);
  assertEq(board.states[1 * 4 + 0], 'revealed', '(1,0) 应已翻开');
  // 在非雷格 (2,1) 插错旗，使旗数 = 数字 = 1
  B.toggleFlag(board, 2, 1);
  assertEq(board.states[2 * 4 + 1], 'flagged', '(2,1) 应为旗');
  // 和弦 (1,0)：未标记邻居 (0,0)(0,1)(1,1)(2,0) 中 (0,1) 是雷 → 踩雷
  const res = B.chordReveal(board, 1, 0);
  assertEq(res.ok, true, '和弦应执行');
  assertEq(res.hitMine, true, '旗插错位置时和弦应踩雷');
  assertEq(board.states[0 * 4 + 1], 'revealed', '被踩雷格应翻开');
  assertEq(board.explodedIndex, 1, 'explodedIndex 应指向 (0,1)');
  // 旗格 (2,1) 不被和弦翻开
  assertEq(board.states[2 * 4 + 1], 'flagged', '和弦不得翻开旗格');
});

check('G6 和弦不翻开旗格与已翻开格（只动未标记隐藏格）', () => {
  withSeededRandom(2204, () => {
    for (let t = 0; t < 60; t++) {
      const game = G.createGame('intermediate');
      G.handleCellReveal(game, 8, 8);
      let target = -1;
      for (let i = 0; i < 256; i++) {
        if (game.board.states[i] !== 'revealed' || B.getNumberAt(game.board, i) === 0) continue;
        const ns = B.getNeighbors(game.board, B.toRow(game.board, i), B.toCol(game.board, i));
        if (ns.some((n) => game.board.states[n.index] === 'hidden')) { target = i; break; }
      }
      if (target === -1) continue;
      const r0 = B.toRow(game.board, target);
      const c0 = B.toCol(game.board, target);
      // 给全部真实雷插旗 + 额外给一个非雷隐藏邻格插旗（旗数 > 数字，仍满足 ≥）
      for (const n of B.getNeighbors(game.board, r0, c0)) {
        if (game.board.states[n.index] === 'hidden' && B.isMineAt(game.board, n.index)) {
          B.toggleFlag(game.board, n.row, n.col);
        }
      }
      const flaggedBefore = [];
      for (const n of B.getNeighbors(game.board, r0, c0)) {
        if (game.board.states[n.index] === 'flagged') flaggedBefore.push(n.index);
      }
      if (flaggedBefore.length === 0) continue;
      const res = G.handleChord(game, r0, c0);
      if (!res.ok) continue;
      for (const idx of flaggedBefore) {
        assertEq(game.board.states[idx], 'flagged', `旗格 ${idx} 不得被和弦翻开`);
      }
      return;
    }
    throw new Error('60 局中未覆盖到旗格保持场景');
  });
});

/* ================================================================
 * H. 胜负判定
 * ================================================================ */
section('H. 胜负判定');

check('H1 isWin：未布雷时恒为 false', () => {
  const game = G.createGame('beginner');
  assertEq(B.isWin(game.board), false, '未布雷不应判胜');
});

check('H2 确定性胜利：翻开全部非雷格 → won、自动插满旗、计数器归零、计时凝固', () => {
  const game = G.createGame('beginner');
  // 白盒构造：10 颗雷固定放在索引 71..80（最后一行附近），与 mineCount=10 保持一致
  // （契约：board.mines 中雷数必须等于 mineCount，否则 isWin 无法成立）
  const board = game.board;
  for (let i = 71; i <= 80; i++) board.mines[i] = 1;
  board.minesPlaced = true;
  B.computeNumbers(board);
  // 打桩控制时间
  const realNow = Date.now;
  try {
    Date.now = () => 5000;
    // 首翻选邻雷数字格 (6,8)（邻索引 71 的雷，数字 1）：只翻 1 格，避免 flood fill
    // 一次清完整个安全区导致首翻即胜（雷区集中在一角时会出现该情况，属正确行为）
    const r1 = G.handleCellReveal(game, 6, 8);
    assert(r1.ok && game.status === 'playing', '首翻后应 playing');
    Date.now = () => 7000; // 用时 2 秒
    for (let i = 0; i < 71 && game.status === 'playing'; i++) {
      if (board.states[i] === 'revealed') continue;
      G.handleCellReveal(game, B.toRow(board, i), B.toCol(board, i));
    }
    assertEq(game.status, 'won', '全部非雷格翻开后应胜利');
    assertEq(board.states[71], 'flagged', '胜利后雷格应自动插旗');
    assertEq(B.countRemainingMines(board), 0, '胜利后剩余雷数应为 0');
    assertEq(game.timerRunning, false, '胜利后应停止计时');
    assertEq(G.getElapsedSeconds(game), 2, '凝固用时应为 2 秒');
    Date.now = () => 20000; // 时间继续走
    assertEq(G.getElapsedSeconds(game), 2, '终局后计时应凝固不变');
  } finally {
    Date.now = realNow;
  }
});

check('H3 胜利后所有操作被拒绝（reveal / flag / chord）', () => {
  const game = G.createGame('beginner');
  // 白盒构造：10 颗雷固定放在索引 71..80，与 mineCount=10 一致
  for (let i = 71; i <= 80; i++) game.board.mines[i] = 1;
  game.board.minesPlaced = true;
  B.computeNumbers(game.board);
  for (let i = 0; i < 71; i++) G.handleCellReveal(game, B.toRow(game.board, i), B.toCol(game.board, i));
  assertEq(game.status, 'won', '应已胜利');
  assertEq(G.handleCellReveal(game, 8, 8).ok, false, '胜利后翻格应被拒绝');
  assertEq(G.handleFlagToggle(game, 0, 0).ok, false, '胜利后插旗应被拒绝');
  assertEq(G.handleChord(game, 0, 0).ok, false, '胜利后和弦应被拒绝');
});

check('H4 随机 15 局自动通关（跳过雷格策略）：全部 won 且旗数=雷数', () => {
  withSeededRandom(2301, () => {
    for (let t = 0; t < 15; t++) {
      const game = G.createGame('intermediate');
      G.handleCellReveal(game, 8, 8);
      for (let i = 0; i < 256 && game.status === 'playing'; i++) {
        if (game.board.states[i] !== 'hidden') continue;
        if (B.isMineAt(game.board, i)) continue; // 已知雷格跳过（等价于插旗）
        const res = G.handleCellReveal(game, B.toRow(game.board, i), B.toCol(game.board, i));
        assert(!res.hitMine, '跳过雷格策略不应踩雷');
      }
      assertEq(game.status, 'won', `第 ${t} 局应胜利`);
      assertEq(B.countFlags(game.board), 40, '胜利后应自动插满 40 面旗');
      assertEq(B.countRevealed(game.board), 256 - 40, '翻开数应为非雷格总数');
    }
  });
});

check('H5 随机 15 局第二翻必踩雷：ready→playing→lost', () => {
  withSeededRandom(2302, () => {
    for (let t = 0; t < 15; t++) {
      const game = G.createGame('beginner');
      G.handleCellReveal(game, 4, 4);
      assertEq(game.status, 'playing', '首翻后应 playing');
      const m = B.getMineIndices(game.board)[0];
      const res = G.handleCellReveal(game, B.toRow(game.board, m), B.toCol(game.board, m));
      assertEq(res.hitMine, true, '翻雷格应踩雷');
      assertEq(game.status, 'lost', '应 lost');
      // 全部雷已可见（revealed 或 flagged）
      for (const idx of B.getMineIndices(game.board)) {
        const st = game.board.states[idx];
        assert(st === 'revealed' || st === 'flagged', `雷格 ${idx} 终局不可见`);
      }
    }
  });
});

check('H6 失败时错误旗被 getWronglyFlaggedIndices 识别', () => {
  withSeededRandom(2303, () => {
    const game = G.createGame('beginner');
    G.handleCellReveal(game, 4, 4);
    // 找一个非雷隐藏格插错旗
    let wrong = -1;
    for (let i = 0; i < 81; i++) {
      if (game.board.states[i] === 'hidden' && !B.isMineAt(game.board, i)) {
        B.toggleFlag(game.board, B.toRow(game.board, i), B.toCol(game.board, i));
        wrong = i;
        break;
      }
    }
    const m = B.getMineIndices(game.board)[0];
    G.handleCellReveal(game, B.toRow(game.board, m), B.toCol(game.board, m));
    assert(game.status === 'lost', '应失败');
    assert(B.getWronglyFlaggedIndices(game.board).includes(wrong), '错误旗未被识别');
  });
});

/* ================================================================
 * I. 计时、重开与难度回退
 * ================================================================ */
section('I. 计时、重开与难度回退');

check('I1 Date.now 打桩：ready→playing 启动计时、用时按实际流逝计算', () => {
  const realNow = Date.now;
  try {
    Date.now = () => 1000;
    const game = G.createGame('beginner');
    assertEq(G.getElapsedSeconds(game), 0, '开局计时应为 0');
    assertEq(game.timerRunning, false, '开局不应计时');
    G.handleCellReveal(game, 4, 4);
    assertEq(game.timerRunning, true, '首翻后应计时');
    Date.now = () => 6400; // 流逝 5.4 秒
    assertEq(G.getElapsedSeconds(game), 5, '实时用时应为 5 秒（5.4s 向下取整）');
  } finally {
    Date.now = realNow;
  }
});

check('I2 计时封顶 999 秒', () => {
  const game = G.createGame('beginner');
  game.startedAt = 0;
  game.timerRunning = true;
  const realNow = Date.now;
  try {
    Date.now = () => 1000 * 5000; // 5000 秒
    assertEq(G.getElapsedSeconds(game), 999, '应封顶 999');
  } finally {
    Date.now = realNow;
  }
});

check('I3 restart：同难度、状态归零、棋盘重置', () => {
  const game = G.createGame('expert');
  G.handleCellReveal(game, 0, 0);
  const g2 = G.restart(game);
  assert(g2 !== game, 'restart 应返回全新对象');
  assertEq(g2.difficultyId, 'expert', '应保持专家难度');
  assertEq(g2.status, 'ready', '状态应归零');
  assertEq(B.countRevealed(g2.board), 0, '翻开数应为 0');
  assertEq(g2.board.minesPlaced, false, '新局不应已布雷');
  assertEq(g2.timerRunning, false, '计时不应运行');
});

check('I4 非法难度回退到初级', () => {
  const g = G.createGame('hell');
  assertEq(g.difficultyId, 'beginner', '应回退初级');
  assertEq(g.rows, 9, '行数');
  assertEq(g.cols, 9, '列数');
  assertEq(g.mineCount, 10, '雷数');
});

check('I5 createGame 三档难度棋盘尺寸与总格数', () => {
  const cases = [
    ['beginner', 9, 9, 10, 81],
    ['intermediate', 16, 16, 40, 256],
    ['expert', 16, 30, 99, 480],
  ];
  for (const [id, r, c, m, total] of cases) {
    const g = G.createGame(id);
    assertEq(g.rows, r, id + ' rows');
    assertEq(g.cols, c, id + ' cols');
    assertEq(g.mineCount, m, id + ' mines');
    assertEq(g.board.states.length, total, id + ' 总格数');
    assertEq(g.status, 'ready', id + ' 初始状态');
  }
});

/* ================================================================
 * J. UI 纯函数（stub DOM，验证显示格式）
 * ================================================================ */
section('J. UI 显示格式');

/** 构造 stub DOM 元素 */
function stubEl() {
  const classes = new Set();
  return {
    textContent: '',
    dataset: {},
    style: { setProperty() {} },
    classList: {
      toggle(cls, on) { if (on) classes.add(cls); else classes.delete(cls); },
      contains(cls) { return classes.has(cls); },
      add(cls) { classes.add(cls); },
      remove(cls) { classes.delete(cls); },
    },
    _classes: classes,
  };
}

check('J1 剩余雷数计数器显示格式：正数补零 3 位 / 负数 -NN / negative 类切换', () => {
  const UI = window.MinesweeperUI;
  assert(typeof UI === 'function', 'MinesweeperUI 应可加载');
  const el = stubEl();
  const ui = new UI({ mineCounterEl: el, timerEl: stubEl(), faceBtn: stubEl(), diffBtns: [] });

  // 正常：10 - 0 = 10 → "010"
  ui.updateMineCounter({ board: B.createBoard(9, 9, 10) });
  if (el.textContent !== '010') throw new Error('10 应显示为 010，实际 ' + el.textContent);
  if (el._classes.has('negative')) throw new Error('正数不应有 negative 类');

  // 负数：旗 12 > 雷 10 → -2 → "-02"
  const board2 = B.createBoard(9, 9, 10);
  let flagged = 0;
  outer2:
  for (let i = 0; i < 81; i++) {
    board2.states[i] = 'flagged';
    if (++flagged === 12) break outer2;
  }
  ui.updateMineCounter({ board: board2 });
  if (el.textContent !== '-02') throw new Error('-2 应显示为 -02，实际 ' + el.textContent);
  if (!el._classes.has('negative')) throw new Error('负数应有 negative 类');
});

check('J2 计时器显示：补零 3 位并封顶 999', () => {
  const UI = window.MinesweeperUI;
  const el = stubEl();
  const ui = new UI({ mineCounterEl: stubEl(), timerEl: el, faceBtn: stubEl(), diffBtns: [] });
  ui.updateTimer(0); if (el.textContent !== '000') throw new Error('0 应显示 000');
  ui.updateTimer(42); if (el.textContent !== '042') throw new Error('42 应显示 042');
  ui.updateTimer(1000); if (el.textContent !== '999') throw new Error('1000 应封顶 999');
  ui.updateTimer(-3); if (el.textContent !== '000') throw new Error('负数应钳为 000');
});

check('J3 笑脸表情映射：ready/playing 🙂 won 😎 lost 😵 scared 😮（仅对局中）', () => {
  const UI = window.MinesweeperUI;
  const el = stubEl();
  const ui = new UI({ mineCounterEl: stubEl(), timerEl: stubEl(), faceBtn: el, diffBtns: [] });
  ui.setFace('ready'); if (el.textContent !== '🙂' || el.dataset.mode !== 'ready') throw new Error('ready 表情错误');
  ui.setFace('won'); if (el.textContent !== '😎') throw new Error('won 表情错误');
  ui.setFace('lost'); if (el.textContent !== '😵') throw new Error('lost 表情错误');
  // 😮 仅在 ready/playing 状态下出现（设计：终局后表情定格，不随按键切换）
  ui.setFace('playing');
  ui.setScared(true); if (el.textContent !== '😮') throw new Error('对局中按住应显示 😮');
  ui.setScared(false); if (el.textContent !== '🙂') throw new Error('松开应恢复 🙂');
  ui.setScared(true); if (el.textContent !== '😮') throw new Error('再次按住应显示 😮');
  // 终局后按住不切换（保持定格表情）
  ui.setFace('lost');
  ui.setScared(true); if (el.textContent !== '😵') throw new Error('终局后按住应保持 😵（设计行为）');
});

/* ---------------- 输出 ---------------- */
for (const item of results) {
  if (item.ok === null) {
    console.log('\n' + item.name);
  } else {
    console.log('  [' + (item.ok ? 'PASS' : 'FAIL') + '] ' + item.name + (item.error ? '\n         ↳ ' + item.error : ''));
  }
}
const total = results.filter((r) => r.ok !== null).length;
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') + ' — QA 独立复核共 ' + total + ' 项');
process.exit(failed === 0 ? 0 : 1);
