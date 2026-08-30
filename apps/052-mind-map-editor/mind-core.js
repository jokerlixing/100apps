(function initMindMapCore(globalScope, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope) globalScope.MindMapCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function createMindMapCore() {
  'use strict';

  const MAX_TEXT_LENGTH = 48;
  const MAX_NODES = 1000;
  const MAX_DEPTH = 20;

  function normalizeText(value) {
    const normalized = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT_LENGTH);
    return normalized || '未命名节点';
  }

  function cloneNode(node) {
    return {
      id: node.id,
      text: node.text,
      collapsed: Boolean(node.collapsed),
      children: node.children.map(cloneNode),
    };
  }

  function findNode(root, nodeId) {
    if (!root || typeof nodeId !== 'string') return null;
    if (root.id === nodeId) return root;
    for (const child of root.children) {
      const match = findNode(child, nodeId);
      if (match) return match;
    }
    return null;
  }

  function findParentId(root, nodeId, parentId = null) {
    if (!root || typeof nodeId !== 'string') return null;
    if (root.id === nodeId) return parentId;
    for (const child of root.children) {
      const match = findParentId(child, nodeId, root.id);
      if (match !== null) return match;
    }
    return null;
  }

  function countNodes(root) {
    if (!root) return 0;
    return 1 + root.children.reduce((total, child) => total + countNodes(child), 0);
  }

  function replaceNode(root, nodeId, transform) {
    if (root.id === nodeId) {
      return { root: transform(root), changed: true };
    }

    for (let index = 0; index < root.children.length; index += 1) {
      const result = replaceNode(root.children[index], nodeId, transform);
      if (result.changed) {
        const children = root.children.slice();
        children[index] = result.root;
        return { root: { ...root, children }, changed: true };
      }
    }

    return { root, changed: false, reason: 'not-found' };
  }

  function updateNodeText(root, nodeId, text) {
    const normalized = normalizeText(text);
    const current = findNode(root, nodeId);
    if (!current) return { root, changed: false, reason: 'not-found' };
    if (current.text === normalized) return { root, changed: false, reason: 'unchanged' };
    return replaceNode(root, nodeId, (node) => ({ ...node, text: normalized }));
  }

  function addChild(root, parentId, node) {
    if (!node || typeof node.id !== 'string' || !node.id.trim()) {
      return { root, changed: false, reason: 'invalid-node' };
    }
    if (findNode(root, node.id)) return { root, changed: false, reason: 'duplicate-id' };
    if (countNodes(root) >= MAX_NODES) return { root, changed: false, reason: 'node-limit' };

    const parent = findNode(root, parentId);
    if (!parent) return { root, changed: false, reason: 'not-found' };

    const newNode = {
      id: node.id.trim(),
      text: normalizeText(node.text),
      collapsed: false,
      children: [],
    };

    return replaceNode(root, parentId, (target) => ({
      ...target,
      collapsed: false,
      children: [...target.children, newNode],
    }));
  }

  function removeNode(root, nodeId) {
    if (root.id === nodeId) return { root, changed: false, reason: 'root-protected' };

    for (let index = 0; index < root.children.length; index += 1) {
      const child = root.children[index];
      if (child.id === nodeId) {
        const children = root.children.slice();
        children.splice(index, 1);
        return { root: { ...root, children }, changed: true };
      }

      const result = removeNode(child, nodeId);
      if (result.changed) {
        const children = root.children.slice();
        children[index] = result.root;
        return { root: { ...root, children }, changed: true };
      }
    }

    return { root, changed: false, reason: 'not-found' };
  }

  function toggleCollapsed(root, nodeId) {
    const target = findNode(root, nodeId);
    if (!target) return { root, changed: false, reason: 'not-found' };
    if (target.children.length === 0) return { root, changed: false, reason: 'leaf-node' };
    return replaceNode(root, nodeId, (node) => ({ ...node, collapsed: !node.collapsed }));
  }

  function isValidDocument(document) {
    if (!document || document.version !== 1 || typeof document.title !== 'string') return false;
    if (!document.title.trim() || document.title.length > 80 || !document.root) return false;

    const ids = new Set();
    const objects = new WeakSet();
    let visited = 0;

    function validateNode(node, depth) {
      if (!node || typeof node !== 'object' || depth > MAX_DEPTH || objects.has(node)) return false;
      objects.add(node);
      visited += 1;
      if (visited > MAX_NODES) return false;
      if (typeof node.id !== 'string' || !node.id.trim() || ids.has(node.id)) return false;
      if (typeof node.text !== 'string' || !node.text.trim() || node.text.length > MAX_TEXT_LENGTH) return false;
      if (typeof node.collapsed !== 'boolean' || !Array.isArray(node.children)) return false;
      ids.add(node.id);
      return node.children.every((child) => validateNode(child, depth + 1));
    }

    return validateNode(document.root, 0);
  }

  function calculateLayout(root, options = {}) {
    const config = {
      columnGap: Number(options.columnGap) || 265,
      nodeWidth: Number(options.nodeWidth) || 186,
      rootWidth: Number(options.rootWidth) || 218,
      nodeHeight: Number(options.nodeHeight) || 52,
      rowGap: Number(options.rowGap) || 28,
      padding: Number(options.padding) || 48,
    };
    const nodes = [];
    const edges = [];
    let cursorY = 0;

    function visit(node, depth, parentId, branchIndex) {
      const ownBranch = depth === 1 ? branchIndex : branchIndex;
      const record = {
        id: node.id,
        text: node.text,
        depth,
        parentId,
        branchIndex: ownBranch,
        collapsed: node.collapsed,
        hiddenCount: node.collapsed ? countNodes(node) - 1 : 0,
        x: depth * config.columnGap,
        y: 0,
        width: depth === 0 ? config.rootWidth : config.nodeWidth,
        height: config.nodeHeight,
      };
      nodes.push(record);

      const visibleChildren = node.collapsed ? [] : node.children;
      if (visibleChildren.length === 0) {
        record.y = cursorY + config.nodeHeight / 2;
        cursorY += config.nodeHeight + config.rowGap;
        return record;
      }

      const childRecords = visibleChildren.map((child, childIndex) => {
        const childBranch = depth === 0 ? childIndex : branchIndex;
        const childRecord = visit(child, depth + 1, node.id, childBranch);
        edges.push({ from: node.id, to: child.id, branchIndex: childBranch });
        return childRecord;
      });
      record.y = (childRecords[0].y + childRecords[childRecords.length - 1].y) / 2;
      return record;
    }

    visit(root, 0, null, -1);
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
    const maxX = Math.max(...nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...nodes.map((node) => node.y + node.height / 2));

    return {
      nodes,
      edges,
      bounds: {
        x: minX - config.padding,
        y: minY - config.padding,
        width: maxX - minX + config.padding * 2,
        height: maxY - minY + config.padding * 2,
      },
    };
  }

  function createStarterDocument() {
    return {
      version: 1,
      title: '产品发布计划',
      updatedAt: new Date().toISOString(),
      root: {
        id: 'demo-root',
        text: '产品发布计划',
        collapsed: false,
        children: [
          {
            id: 'demo-problem',
            text: '用户问题',
            collapsed: false,
            children: [
              { id: 'demo-scenario', text: '核心场景', collapsed: false, children: [] },
              { id: 'demo-metric', text: '成功指标', collapsed: false, children: [] },
            ],
          },
          {
            id: 'demo-scope',
            text: '最小版本',
            collapsed: false,
            children: [
              { id: 'demo-must', text: '必须完成', collapsed: false, children: [] },
              { id: 'demo-later', text: '可以延后', collapsed: false, children: [] },
            ],
          },
          {
            id: 'demo-launch',
            text: '上线检查',
            collapsed: false,
            children: [
              { id: 'demo-qa', text: '体验验收', collapsed: false, children: [] },
              { id: 'demo-notes', text: '发布说明', collapsed: false, children: [] },
            ],
          },
        ],
      },
    };
  }

  return {
    MAX_TEXT_LENGTH,
    MAX_NODES,
    normalizeText,
    cloneNode,
    findNode,
    findParentId,
    countNodes,
    updateNodeText,
    addChild,
    removeNode,
    toggleCollapsed,
    isValidDocument,
    calculateLayout,
    createStarterDocument,
  };
});
