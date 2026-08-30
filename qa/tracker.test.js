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

test('published apps 061 and 063 are included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app61 = ideas[60];
  const app63 = ideas[62];

  assert.equal(app61[0], '每日壁纸应用');
  assert.equal(app61[3], 'https://jokerlixing.github.io/100apps/apps/061-daily-wallpaper/');
  assert.equal(doneIds.has(61), true, 'INIT_DONE must mark app 061 as done');
  assert.equal(app63[0], 'AI写作助手');
  assert.match(app63[1], /MARGIN\/63/);
  assert.equal(app63[3], 'https://jokerlixing.github.io/100apps/apps/063-ai-writer/');
  assert.equal(doneIds.has(63), true, 'INIT_DONE must mark app 063 as done');
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

test('app 064 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app64 = ideas[63];

  assert.equal(app64[0], 'AI识图取字');
  assert.equal(app64[1], 'GLYPH/64：本地批量OCR+中英模型+校样导出');
  assert.equal(app64[3], 'https://jokerlixing.github.io/100apps/apps/064-ai-ocr/');
  assert.equal(doneIds.has(64), true, 'INIT_DONE must mark app 064 as done');
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
    let apps=[
      {id:61,name:"旧标题",desc:"旧说明",lv:3,st:"todo",custom:false,link:""},
      {id:63,name:"AI写作助手",desc:"旧说明",lv:4,st:"todo",custom:false,link:""}
    ];
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
  assert.equal(context.result.apps[1].st, 'done');
  assert.equal(context.result.apps[1].link, 'https://jokerlixing.github.io/100apps/apps/063-ai-writer/');
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

test('app 067 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app67 = ideas[66];

  assert.equal(app67[0], 'AI菜谱推荐');
  assert.match(app67[1], /PANTRY\/67/);
  assert.equal(app67[3], 'https://jokerlixing.github.io/100apps/apps/067-ai-recipe/');
  assert.equal(doneIds.has(67), true, 'INIT_DONE must mark app 067 as done');
});

test('app 069 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app69 = ideas[68];

  assert.equal(app69[0], 'AI面试模拟器');
  assert.match(app69[1], /^PANEL\/69/);
  assert.equal(app69[3], 'https://jokerlixing.github.io/100apps/apps/069-ai-interview/');
  assert.equal(doneIds.has(69), true, 'INIT_DONE must mark app 069 as done');
});
