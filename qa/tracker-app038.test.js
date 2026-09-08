'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const publishedUrl = 'https://jokerlixing.github.io/100apps/apps/038-online-survey/';

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

test('app 038 questionnaire generation is published and officially complete', () => {
  const ideas = extractIdeas();
  const app38 = ideas[37];

  assert.equal(app38[0], '在线问卷系统');
  assert.match(app38[1], /^PULSE\/38：/);
  assert.match(app38[1], /文本与提示词生成问卷/);
  assert.match(app38[1], /4–30题/);
  assert.match(app38[1], /可选AI/);
  assert.match(app38[1], /移动端/);
  assert.match(app38[1], /分享与本地统计/);
  assert.equal(app38[2], '3');
  assert.equal(app38[3], publishedUrl);
  assert.equal(extractOfficialDoneIds().has(38), true, 'INIT_DONE must mark app 038 as done');
});

test('official completion migrates an old app 038 entry while preserving custom entries', () => {
  const ideas = extractIdeas();
  const initStart = html.indexOf('const INIT_DONE=');
  const initEnd = html.indexOf('\nlet apps=', initStart);
  const syncStart = html.indexOf('function syncOfficial(){');
  const syncEnd = html.indexOf('\nfunction save()', syncStart);
  assert.ok(initStart >= 0 && initEnd > initStart, 'official completion source should be extractable');
  assert.ok(syncStart >= 0 && syncEnd > syncStart, 'tracker migration source should be extractable');

  const custom = { id: 101, name: '用户自定义问卷', desc: '保留我的内容', lv: 2, st: 'doing', custom: true, link: 'https://example.com/custom' };
  const context = {};
  vm.runInNewContext(`
    let apps=[{id:38,name:"旧问卷",desc:"生成4–20题问卷",lv:2,st:"todo",custom:false,link:""},${JSON.stringify(custom)}];
    const IDEAS=${JSON.stringify(ideas)};
    ${html.slice(initStart, initEnd)}
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(syncStart, syncEnd)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  const app38 = context.result.apps[0];
  assert.equal(app38.name, ideas[37][0]);
  assert.equal(app38.desc, ideas[37][1]);
  assert.match(app38.desc, /4–30题/);
  assert.equal(app38.lv, 3);
  assert.equal(app38.st, 'done');
  assert.equal(app38.link, publishedUrl);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result.apps[1])), custom);
  assert.equal(context.result.didSave, true);
});
