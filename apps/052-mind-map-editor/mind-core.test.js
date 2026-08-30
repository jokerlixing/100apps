const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./mind-core.js');

function fixture() {
  return {
    id: 'root',
    text: '中心主题',
    collapsed: false,
    children: [
      {
        id: 'alpha',
        text: '方向 A',
        collapsed: false,
        children: [
          { id: 'alpha-1', text: '任务 A1', collapsed: false, children: [] },
          { id: 'alpha-2', text: '任务 A2', collapsed: false, children: [] },
        ],
      },
      { id: 'beta', text: '方向 B', collapsed: false, children: [] },
    ],
  };
}

test('normalizes node text and enforces the length boundary', () => {
  assert.equal(Core.normalizeText('  发布\n   准备  '), '发布 准备');
  assert.equal(Core.normalizeText('x'.repeat(80)).length, Core.MAX_TEXT_LENGTH);
  assert.equal(Core.normalizeText('   '), '未命名节点');
});

test('adds a child immutably and rejects duplicate ids', () => {
  const original = fixture();
  const result = Core.addChild(original, 'alpha', { id: 'alpha-3', text: ' 任务 A3 ' });

  assert.equal(result.changed, true);
  assert.equal(original.children[0].children.length, 2);
  assert.equal(Core.findNode(result.root, 'alpha').children.length, 3);
  assert.equal(Core.findNode(result.root, 'alpha-3').text, '任务 A3');

  const duplicate = Core.addChild(result.root, 'beta', { id: 'alpha-3', text: '重复' });
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.reason, 'duplicate-id');
});

test('renames nodes without mutating the previous tree', () => {
  const original = fixture();
  const result = Core.updateNodeText(original, 'beta', ' 新方向 ');

  assert.equal(result.changed, true);
  assert.equal(Core.findNode(original, 'beta').text, '方向 B');
  assert.equal(Core.findNode(result.root, 'beta').text, '新方向');
  assert.equal(Core.updateNodeText(result.root, 'missing', '无效').reason, 'not-found');
});

test('protects the root and removes a child subtree', () => {
  const original = fixture();
  const protectedResult = Core.removeNode(original, 'root');
  assert.equal(protectedResult.changed, false);
  assert.equal(protectedResult.reason, 'root-protected');

  const result = Core.removeNode(original, 'alpha');
  assert.equal(result.changed, true);
  assert.equal(Core.findNode(result.root, 'alpha'), null);
  assert.equal(Core.countNodes(result.root), 2);
  assert.equal(Core.countNodes(original), 5);
});

test('finds parents and toggles a branch without losing children', () => {
  const original = fixture();
  assert.equal(Core.findParentId(original, 'alpha-2'), 'alpha');
  assert.equal(Core.findParentId(original, 'root'), null);

  const result = Core.toggleCollapsed(original, 'alpha');
  assert.equal(result.changed, true);
  assert.equal(Core.findNode(result.root, 'alpha').collapsed, true);
  assert.equal(Core.findNode(result.root, 'alpha').children.length, 2);
});

test('lays out visible nodes and centers parents between their children', () => {
  const layout = Core.calculateLayout(fixture(), {
    columnGap: 200,
    nodeWidth: 160,
    rootWidth: 200,
    nodeHeight: 40,
    rowGap: 20,
  });
  const byId = Object.fromEntries(layout.nodes.map((node) => [node.id, node]));

  assert.equal(layout.nodes.length, 5);
  assert.equal(layout.edges.length, 4);
  assert.equal(byId.alpha.x, 200);
  assert.equal(byId['alpha-1'].x, 400);
  assert.equal(byId.alpha.y, (byId['alpha-1'].y + byId['alpha-2'].y) / 2);
  assert.equal(byId.root.y, (byId.alpha.y + byId.beta.y) / 2);
  assert.ok(layout.bounds.width > 500);
  assert.ok(layout.bounds.height >= 160);
});

test('folding removes descendants from layout and reports the hidden count', () => {
  const folded = Core.toggleCollapsed(fixture(), 'alpha').root;
  const layout = Core.calculateLayout(folded);
  const alpha = layout.nodes.find((node) => node.id === 'alpha');

  assert.deepEqual(layout.nodes.map((node) => node.id), ['root', 'alpha', 'beta']);
  assert.equal(alpha.hiddenCount, 2);
  assert.equal(layout.edges.length, 2);
});

test('validates stored documents and rejects duplicate ids', () => {
  const document = { version: 1, title: '计划', updatedAt: '2026-08-30T00:00:00.000Z', root: fixture() };
  assert.equal(Core.isValidDocument(document), true);

  const duplicate = structuredClone(document);
  duplicate.root.children[1].id = 'alpha';
  assert.equal(Core.isValidDocument(duplicate), false);

  const malformed = structuredClone(document);
  malformed.root.children = 'not-an-array';
  assert.equal(Core.isValidDocument(malformed), false);
});

test('creates a valid starter document with meaningful branches', () => {
  const document = Core.createStarterDocument();
  assert.equal(Core.isValidDocument(document), true);
  assert.ok(Core.countNodes(document.root) >= 7);
  assert.match(document.title, /发布计划/);
});
