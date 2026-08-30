'use strict';

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

test('app 096 voice bookkeeping is published and officially complete', () => {
  const ideas = extractIdeas();
  const doneIds = extractOfficialDoneIds();
  const app96 = ideas[95];

  assert.equal(app96[0], '语音记账');
  assert.match(app96[1], /^TALLY\/96/);
  assert.equal(app96[2], '5');
  assert.equal(app96[3], 'https://jokerlixing.github.io/100apps/apps/096-voice-bookkeeping/');
  assert.equal(doneIds.has(96), true, 'INIT_DONE must mark app 096 as done');
});

test('official completion state migrates a stale app 096 cache entry', () => {
  const ideas = extractIdeas();
  const initStart = html.indexOf('const INIT_DONE=');
  const initEnd = html.indexOf('\nlet apps=', initStart);
  const syncStart = html.indexOf('function syncOfficial(){');
  const syncEnd = html.indexOf('\nfunction save()', syncStart);
  assert.ok(initStart >= 0 && initEnd > initStart, 'official completion source should be extractable');
  assert.ok(syncStart >= 0 && syncEnd > syncStart, 'tracker migration source should be extractable');
  const context = {};

  vm.runInNewContext(`
    let apps=[{id:96,name:"语音记账",desc:"说一句话AI解析自动记账",lv:5,st:"todo",custom:false,link:""}];
    const IDEAS=${JSON.stringify(ideas)};
    ${html.slice(initStart, initEnd)}
    let didSave=false;
    function save(){didSave=true}
    ${html.slice(syncStart, syncEnd)}
    syncOfficial();
    result={apps,didSave};
  `, context);

  assert.equal(context.result.apps[0].st, 'done');
  assert.match(context.result.apps[0].desc, /^TALLY\/96/);
  assert.equal(context.result.apps[0].link, 'https://jokerlixing.github.io/100apps/apps/096-voice-bookkeeping/');
  assert.equal(context.result.didSave, true);
});
