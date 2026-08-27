/**
 * qa-static-checks.js — QA 页面可用性静态检查（作者：严过关 / software-qa-engineer）
 *
 * 不启动浏览器，通过静态解析验证：
 *  1. index.html 引用的 JS/CSS 文件真实存在且路径正确
 *  2. 难度按钮与 DIFFICULTIES 常量一一对应
 *  3. 事件绑定覆盖：左键/右键(contextmenu)/双击(dblclick)/双键(mousedown buttons==3)/R/Esc/触屏长按
 *  4. ui.js/app.js 动态拼写的 CSS 类在 minesweeper.css 中均有定义
 *  5. HTML 中被 JS 引用的所有 id 均存在
 *  6. 脚本加载顺序满足依赖（board → game → ui → app）
 *  7. JS 语法检查（node --check）
 *
 * 用法：node qa/qa-static-checks.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const results = [];
let failed = 0;

function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (err) {
    failed++;
    results.push({ name, ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function section(t) { results.push({ name: '── ' + t + ' ──', ok: null }); }

function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }

const html = read('index.html');
const appJs = read('js/app.js');
const uiJs = read('js/ui.js');
const boardJs = read('js/board.js');
const gameJs = read('js/game.js');
const css = read('css/minesweeper.css');

/* ================================================================
 * 1. 静态资源引用存在性
 * ================================================================ */
section('1. 静态资源引用');

check('1.1 index.html 引用的本地 JS/CSS 文件全部存在', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^(https?:|data:|#)/.test(u));
  const missing = refs.filter((u) => !fs.existsSync(path.join(ROOT, u)));
  assert(missing.length === 0, '缺失文件: ' + missing.join(', '));
  return '已验证 ' + refs.length + ' 个本地引用';
});

check('1.2 JS 依赖加载顺序 board → game → ui → app', () => {
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const idx = (name) => order.findIndex((s) => s === name);
  assert(idx('js/board.js') !== -1, '缺少 board.js');
  assert(idx('js/game.js') !== -1, '缺少 game.js');
  assert(idx('js/ui.js') !== -1, '缺少 ui.js');
  assert(idx('js/app.js') !== -1, '缺少 app.js');
  assert(idx('js/board.js') < idx('js/game.js'), 'game.js 必须在 board.js 之后');
  assert(idx('js/game.js') < idx('js/ui.js'), 'ui.js 必须在 game.js 之后');
  assert(idx('js/ui.js') < idx('js/app.js'), 'app.js 必须在 ui.js 之后');
  return '顺序: ' + order.join(' → ');
});

check('1.3 全部 JS 文件通过 node --check 语法检查', () => {
  const files = ['js/board.js', 'js/game.js', 'js/ui.js', 'js/app.js'];
  for (const f of files) {
    execFileSync('node', ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
  }
  return files.length + ' 个文件语法合法';
});

/* ================================================================
 * 2. 难度按钮 ↔ DIFFICULTIES 对应
 * ================================================================ */
section('2. 难度配置一致性');

check('2.1 HTML 难度按钮 data-difficulty 与 DIFFICULTIES 键一一对应', () => {
  const htmlBtns = [...html.matchAll(/data-difficulty="([a-z]+)"/g)].map((m) => m[1]);
  const constKeys = [...boardJs.matchAll(/^\s{4}(\w+):\s*Object\.freeze\(\{ id:/gm)].map((m) => m[1]);
  assert(constKeys.length === 3, 'DIFFICULTIES 应有 3 档，实际解析到 ' + constKeys.length);
  for (const k of constKeys) {
    assert(htmlBtns.includes(k), `HTML 缺少难度按钮: ${k}`);
  }
  for (const b of htmlBtns) {
    assert(constKeys.includes(b), `HTML 按钮 ${b} 在 DIFFICULTIES 中不存在`);
  }
  return '按钮: ' + htmlBtns.join(', ');
});

check('2.2 按钮文案与实际棋盘尺寸一致（初级 9×9 / 中级 16×16 / 高级 30×16）', () => {
  const specs = {
    beginner: { rows: 9, cols: 9 },
    intermediate: { rows: 16, cols: 16 },
    expert: { rows: 16, cols: 30 },
  };
  for (const [id, { rows, cols }] of Object.entries(specs)) {
    const btnRe = new RegExp(`data-difficulty="${id}"[^>]*>([^<]+)<`, 'm');
    const m = html.match(btnRe);
    assert(m, `找不到 ${id} 按钮文案`);
    const label = m[1];
    assert(label.includes(`${cols}×${rows}`), `${id} 按钮文案 "${label}" 未包含 ${cols}×${rows}`);
  }
  return '三档文案与常量一致';
});

/* ================================================================
 * 3. 事件绑定覆盖
 * ================================================================ */
section('3. 事件绑定');

check('3.1 左键（click）翻开与双击（dblclick）和弦均已绑定', () => {
  assert(/addEventListener\('click'/.test(appJs), '未绑定 click');
  assert(/addEventListener\('dblclick'/.test(appJs), '未绑定 dblclick');
  return 'click + dblclick 已绑定';
});

check('3.2 右键 contextmenu 已绑定且 preventDefault 阻止菜单', () => {
  assert(/addEventListener\('contextmenu'/.test(appJs), '未绑定 contextmenu');
  const ctx = appJs.slice(appJs.indexOf("addEventListener('contextmenu'"));
  assert(ctx.slice(0, 400).includes('preventDefault'), 'contextmenu 未阻止默认菜单');
  return 'contextmenu 已绑定并阻止默认行为';
});

check('3.3 双键和弦（mousedown buttons===3）已实现', () => {
  assert(/mousedown/.test(appJs), '未绑定 mousedown');
  assert(/buttons\s*===\s*3/.test(appJs), '未检测 e.buttons===3 双键和弦');
  return 'mousedown + buttons===3 已实现';
});

check('3.4 键盘快捷键：R 重开、Esc 关闭浮层', () => {
  const keydownBlock = appJs.slice(appJs.indexOf("addEventListener('keydown'"));
  const seg = keydownBlock.slice(0, 600);
  assert(seg.includes("'Escape'"), '未处理 Escape');
  assert(/'r'\s*\|\|\s*e\.key\s*===\s*'R'/.test(seg) || (seg.includes("'r'") && seg.includes("'R'")), '未处理 R/r 重开');
  return 'R + Esc 已处理';
});

check('3.5 触屏长按插旗（touchstart/touchmove/touchend）已实现', () => {
  assert(/addEventListener\('touchstart'/.test(appJs), '未绑定 touchstart');
  assert(/addEventListener\('touchmove'/.test(appJs), '未绑定 touchmove');
  assert(/addEventListener\('touchend'/.test(appJs), '未绑定 touchend');
  return '触屏三事件已绑定';
});

check('3.6 笑脸重开、难度切换、结果浮层按钮均已绑定', () => {
  assert(/faceBtn\.addEventListener\('click'/.test(appJs), '笑脸未绑定');
  assert(/diffBtns\.forEach/.test(appJs) && /switchDifficulty/.test(appJs), '难度切换未绑定');
  assert(/resultAgainBtn\.addEventListener\('click'/.test(appJs), '结果浮层按钮未绑定');
  return '笑脸/难度/再来一局均已绑定';
});

/* ================================================================
 * 4. HTML id ↔ JS 引用
 * ================================================================ */
section('4. DOM 引用一致性');

check('4.1 app.js getElementById 引用的 id 在 index.html 中全部存在', () => {
  const jsIds = [...appJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  assert(jsIds.length >= 9, 'DOM 引用数量异常: ' + jsIds.length);
  const missing = jsIds.filter((id) => !new RegExp(`id="${id}"`).test(html));
  assert(missing.length === 0, 'HTML 缺少 id: ' + missing.join(', '));
  return '已验证 ' + jsIds.length + ' 个 id: ' + jsIds.join(', ');
});

/* ================================================================
 * 5. CSS 类完整性
 * ================================================================ */
section('5. CSS 类完整性');

check('5.1 ui.js 动态拼写的状态类在 CSS 中均有定义', () => {
  const needed = ['hidden', 'flagged', 'question', 'revealed', 'number', 'mine', 'exploded',
    'wrong-flag', 'correct-flag', 'win-glow', 'popping'];
  const missing = needed.filter((cls) => !new RegExp('\\.' + cls.replace(/-/g, '\\-') + '[\\s\\.{,:]').test(css));
  assert(missing.length === 0, 'CSS 缺少类定义: ' + missing.join(', '));
  return needed.length + ' 个状态类全部有样式';
});

check('5.2 数字 1-8 配色类 one~eight 完整', () => {
  const missing = [];
  for (let n = 1; n <= 8; n++) {
    const names = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
    if (!new RegExp('\\.' + names[n] + '\\s*\\{').test(css)) missing.push(names[n]);
  }
  assert(missing.length === 0, '缺少配色类: ' + missing.join(', '));
  return 'one~eight 配色齐全';
});

check('5.3 难度自适应格子尺寸（data-difficulty 选择器）三档齐全', () => {
  for (const id of ['beginner', 'intermediate', 'expert']) {
    assert(css.includes(`[data-difficulty='${id}']`), `CSS 缺少 ${id} 的格子尺寸选择器`);
  }
  return '三档 --cell-size 均已定义';
});

check('5.4 结果浮层与动画类存在（show/won/lost/shake）', () => {
  for (const cls of ['result-overlay', 'show', 'shake', 'lcd', 'negative', 'time']) {
    assert(new RegExp('\\.' + cls + '[\\s\\.{,:]').test(css), 'CSS 缺少类: ' + cls);
  }
  return '浮层与动画类齐全';
});

/* ================================================================
 * 6. 全局命名空间与装配
 * ================================================================ */
section('6. 命名空间与装配');

check('6.1 board/game/ui 均挂载全局命名空间，app 暴露调试实例', () => {
  assert(/global\.MinesweeperBoard\s*=/.test(boardJs), 'board 未挂载 MinesweeperBoard');
  assert(/global\.MinesweeperGame\s*=/.test(gameJs), 'game 未挂载 MinesweeperGame');
  assert(/global\.MinesweeperUI\s*=/.test(uiJs), 'ui 未挂载 MinesweeperUI');
  assert(/global\.minesweeperApp\s*=/.test(appJs), 'app 未暴露 minesweeperApp');
  assert(/DOMContentLoaded/.test(appJs), 'app 未等待 DOM 就绪');
  return '四个全局命名空间与调试入口齐全';
});

check('6.2 test.html 引用与主页面一致的 js 文件', () => {
  const t = read('test.html');
  assert(t.includes('js/board.js') && t.includes('js/game.js'), 'test.html 未引用核心脚本');
  return 'test.html 引用正常';
});

/* ---------------- 输出 ---------------- */
for (const item of results) {
  if (item.ok === null) {
    console.log('\n' + item.name);
  } else {
    const extra = item.ok && item.detail ? '  → ' + item.detail : '';
    console.log('  [' + (item.ok ? 'PASS' : 'FAIL') + '] ' + item.name + (item.error ? '\n         ↳ ' + item.error : '') + extra);
  }
}
const total = results.filter((r) => r.ok !== null).length;
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') + ' — 静态检查共 ' + total + ' 项');
process.exit(failed === 0 ? 0 : 1);
