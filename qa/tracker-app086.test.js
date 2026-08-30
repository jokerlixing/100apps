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
  const doneIds = new Set([...match[1].matchAll(/(\d+):"done"/g)].map((entry) => Number(entry[1])));
  for (const entry of html.matchAll(/INIT_DONE\[(\d+)\]="done"/g)) doneIds.add(Number(entry[1]));
  return doneIds;
}

test('app 086 is published as the first L5 project and officially complete', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app86 = ideas[85];

  assert.equal(app86[0], 'CLI 天气工具');
  assert.match(app86[1], /^SKY\/86/);
  assert.equal(app86[2], '5');
  assert.equal(app86[3], 'https://github.com/jokerlixing/100apps/tree/main/apps/086-cli-weather');
  assert.equal(doneIds.has(86), true, 'INIT_DONE must mark app 086 as done');
});

test('official completion state migrates a stale app 086 cache entry', () => {
  const ideas = extractIdeas();
  const initStart = html.indexOf('const INIT_DONE=');
  const initEnd = html.indexOf('\nlet apps=', initStart);
  const start = html.indexOf('function syncOfficial(){');
  const end = html.indexOf('\nfunction save()', start);
  const context = {};
  assert.ok(initStart >= 0 && initEnd > initStart, 'official completion source should be extractable');
  const initSource = html.slice(initStart, initEnd);

  vm.runInNewContext(`
    let apps=[{id:86,name:"CLI天气工具",desc:"命令行查天气+ASCII艺术输出",lv:4,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    ${initSource}
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(start, end)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].name, 'CLI 天气工具');
  assert.equal(context.result.apps[0].lv, 5);
  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^SKY\/86/);
  assert.equal(context.result.apps[0].link, 'https://github.com/jokerlixing/100apps/tree/main/apps/086-cli-weather');
  assert.equal(context.result.didSave, true);
});
