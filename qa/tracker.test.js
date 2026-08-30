const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractIdeas() {
  const match = html.match(/const IDEAS=(\[[\s\S]*?\]);\s*const KEY=/);
  assert.ok(match, 'IDEAS should be present in the tracker');
  return JSON.parse(match[1]);
}

function extractOfficialDoneIds() {
  const match = html.match(/const INIT_DONE=\{([^}]*)\}/);
  assert.ok(match, 'INIT_DONE should be present in the tracker');
  return new Set([...match[1].matchAll(/(\d+):"done"/g)].map((entry) => Number(entry[1])));
}

test('app 061 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app61 = ideas[60];

  assert.equal(app61[0], '每日壁纸应用');
  assert.equal(app61[3], 'https://jokerlixing.github.io/100apps/apps/061-daily-wallpaper/');
  assert.equal(doneIds.has(61), true, 'INIT_DONE must mark app 061 as done');
});

test('app 066 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app66 = ideas[65];

  assert.equal(app66[0], 'AI简历优化器');
  assert.match(app66[1], /^PROOF\/66/);
  assert.equal(app66[3], 'https://jokerlixing.github.io/100apps/apps/066-resume-optimizer/');
  assert.equal(doneIds.has(66), true, 'INIT_DONE must mark app 066 as done');
});

test('app 065 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app65 = ideas[64];

  assert.equal(app65[0], 'AI语音转文字');
  assert.match(app65[1], /^SCRIBE\/65/);
  assert.equal(app65[3], 'https://jokerlixing.github.io/100apps/apps/065-ai-transcriber/');
  assert.equal(doneIds.has(65), true, 'INIT_DONE must mark app 065 as done');
});

test('app 062 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app62 = ideas[61];

  assert.equal(app62[0], 'AI聊天助手');
  assert.equal(app62[1], 'WIRE/62：兼容接口+流式报文+本地多会话与临时密钥');
  assert.equal(app62[3], 'https://jokerlixing.github.io/100apps/apps/062-ai-chat/');
  assert.equal(doneIds.has(62), true, 'INIT_DONE must mark app 062 as done');
});

test('official completion state migrates stale browser cache entries', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  assert.ok(initMatch && start >= 0 && end > start, 'tracker migration source should be extractable');

  const context = {};
  vm.runInNewContext(`
    let apps=[{id:61,name:"旧标题",desc:"旧说明",lv:3,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].st, 'done');
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/061-daily-wallpaper/');
  assert.equal(context.result.didSave, true);
});

test('official completion state migrates a stale app 062 cache entry', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  assert.ok(initMatch && start >= 0 && end > start, 'tracker migration source should be extractable');

  const context = {};
  vm.runInNewContext(`
    let apps=[{id:62,name:"旧 AI 助手",desc:"旧说明",lv:4,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].name, 'AI聊天助手');
  assert.equal(context.result.apps[0].st, 'done');
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/062-ai-chat/');
  assert.equal(context.result.didSave, true);
});
