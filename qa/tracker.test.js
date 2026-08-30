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

test('apps 068 through 072 are published in sequence and officially complete', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const expected = [
    [68, '智能客服机器人', /^RELAY\/68/, '068-customer-support'],
    [69, 'AI面试模拟器', /^PANEL\/69/, '069-ai-interview'],
    [70, 'AI口语陪练', /^TALKBACK\/70/, '070-ai-speaking-coach'],
    [71, '情绪日记', /^TIDE\/71/, '071-emotion-diary'],
    [72, '全栈电商 Demo', /^COUNTER\/72/, '072-fullstack-shop'],
  ];

  for (const [id, name, description, folder] of expected) {
    const app = ideas[id - 1];
    assert.equal(app[0], name);
    assert.match(app[1], description);
    assert.equal(app[3], `https://jokerlixing.github.io/100apps/apps/${folder}/`);
    assert.equal(doneIds.has(id), true, `INIT_DONE must mark app ${id} as done`);
  }
});

test('official completion state migrates a stale app 068 cache entry', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  const context = {};

  vm.runInNewContext(`
    let apps=[{id:68,name:"智能客服机器人",desc:"旧说明",lv:4,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^RELAY\/68/);
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/068-customer-support/');
  assert.equal(context.result.didSave, true);
});

test('app 073 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app73 = ideas[72];

  assert.equal(app73[0], '论坛社区');
  assert.match(app73[1], /^THREADLINE\/73/);
  assert.equal(app73[3], 'https://jokerlixing.github.io/100apps/apps/073-forum-community/');
  assert.equal(doneIds.has(73), true, 'INIT_DONE must mark app 073 as done');
});

test('official completion state migrates a stale app 073 cache entry', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  const context = {};

  vm.runInNewContext(`
    let apps=[{id:73,name:"论坛社区",desc:"旧说明",lv:4,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^THREADLINE\/73/);
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/073-forum-community/');
  assert.equal(context.result.didSave, true);
});

test('app 076 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app76 = ideas[75];

  assert.equal(app76[0], '订阅管理');
  assert.match(app76[1], /^DUE\/76/);
  assert.equal(app76[3], 'https://jokerlixing.github.io/100apps/apps/076-subscription-manager/');
  assert.equal(doneIds.has(76), true, 'INIT_DONE must mark app 076 as done');
});

test('official completion state migrates a stale app 076 cache entry', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  const context = {};

  vm.runInNewContext(`
    let apps=[{id:76,name:"订阅管理",desc:"旧说明",lv:4,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^DUE\/76/);
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/076-subscription-manager/');
  assert.equal(context.result.didSave, true);
});

test('app 078 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app78 = ideas[77];

  assert.equal(app78[0], '私人网盘');
  assert.match(app78[1], /^DEPOT\/78/);
  assert.equal(app78[3], 'https://jokerlixing.github.io/100apps/apps/078-private-cloud/');
  assert.equal(doneIds.has(78), true, 'INIT_DONE must mark app 078 as done');
});

test('official completion state migrates a stale app 078 cache entry', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  const context = {};

  vm.runInNewContext(`
    let apps=[{id:78,name:"私人网盘",desc:"旧说明",lv:4,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^DEPOT\/78/);
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/078-private-cloud/');
  assert.equal(context.result.didSave, true);
});

test('app 080 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app80 = ideas[79];

  assert.equal(app80[0], '视频网站 Demo');
  assert.match(app80[1], /^CHANNEL\/80/);
  assert.equal(app80[3], 'https://jokerlixing.github.io/100apps/apps/080-video-site/');
  assert.equal(doneIds.has(80), true, 'INIT_DONE must mark app 080 as done');
});

test('official completion state migrates a stale app 080 cache entry', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  const context = {};

  vm.runInNewContext(`
    let apps=[{id:80,name:"视频网站Demo",desc:"旧说明",lv:4,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].name, '视频网站 Demo');
  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^CHANNEL\/80/);
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/080-video-site/');
  assert.equal(context.result.didSave, true);
});

test('app 075 project board is published and officially complete', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app75 = ideas[74];

  assert.equal(app75[0], '项目管理看板');
  assert.match(app75[1], /^RAIL\/75/);
  assert.equal(app75[3], 'https://jokerlixing.github.io/100apps/apps/075-project-board/');
  assert.equal(doneIds.has(75), true, 'INIT_DONE must mark app 075 as done');
});

test('app 079 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app79 = ideas[78];

  assert.equal(app79[0], '音乐播放器');
  assert.equal(app79[1], 'REEL/79：本地音频导入+多歌单管理+同步LRC与离线样带');
  assert.equal(app79[3], 'https://jokerlixing.github.io/100apps/apps/079-music-player/');
  assert.equal(doneIds.has(79), true, 'INIT_DONE must mark app 079 as done');
});

test('official completion state migrates a stale app 079 cache entry', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  const context = {};

  vm.runInNewContext(`
    let apps=[{id:79,name:"音乐播放器",desc:"旧说明",lv:4,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^REEL\/79/);
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/079-music-player/');
  assert.equal(context.result.didSave, true);
});

test('app 077 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app77 = ideas[76];

  assert.equal(app77[0], '短链聚合平台');
  assert.match(app77[1], /^ROUTE\/77/);
  assert.equal(app77[3], 'https://jokerlixing.github.io/100apps/apps/077-short-link-hub/');
  assert.equal(doneIds.has(77), true, 'INIT_DONE must mark app 077 as done');
});

test('official completion state migrates a stale app 077 cache entry', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  const context = {};

  vm.runInNewContext(`
    let apps=[{id:77,name:"短链聚合平台",desc:"短链+二维码+访问统计后台",lv:4,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^ROUTE\/77/);
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/077-short-link-hub/');
  assert.equal(context.result.didSave, true);
});

test('app 082 is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app82 = ideas[81];

  assert.equal(app82[0], '微信小程序商城');
  assert.match(app82[1], /^YUNXIU\/82/);
  assert.equal(app82[3], 'https://jokerlixing.github.io/100apps/apps/082-mini-program-shop/');
  assert.equal(doneIds.has(82), true, 'INIT_DONE must mark app 082 as done');
  for (const pendingId of [74, 81]) {
    assert.equal(doneIds.has(pendingId), false, `INIT_DONE must preserve pending app ${pendingId}`);
  }
});

test('app 099 Mica UI is published and included in the official completion state', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app99 = ideas[98];

  assert.equal(app99[0], 'Mica UI 组件库');
  assert.match(app99[1], /^MICA\/99/);
  assert.match(app99[1], /12个原生 Web Components/);
  assert.equal(app99[3], 'https://jokerlixing.github.io/100apps/apps/099-mica-ui/');
  assert.equal(doneIds.has(99), true, 'INIT_DONE must mark app 099 as done');
});

test('official completion state migrates a stale app 099 cache entry', () => {
  const ideas = extractIdeas();
  const initMatch = html.match(/const INIT_DONE=(\{[^}]*\})/);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  const context = {};

  vm.runInNewContext(`
    let apps=[{id:99,name:"开源组件库",desc:"旧说明",lv:5,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    const INIT_DONE=${initMatch[1]};
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].name, 'Mica UI 组件库');
  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^MICA\/99/);
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/099-mica-ui/');
  assert.equal(context.result.didSave, true);
});
