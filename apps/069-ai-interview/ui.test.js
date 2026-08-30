const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('uses one page heading and exposes the full interview workflow', () => {
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const id of [
    'setup-form', 'role', 'level', 'question-count', 'job-description', 'ai-enabled',
    'interview-screen', 'question-title', 'answer-input', 'feedback-sheet', 'tape-list',
    'review-screen', 'summary-dimensions', 'transcript-list', 'history-dialog', 'live-region',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test('keeps controls labelled and JavaScript unobtrusive', () => {
  assert.match(html, /<label[^>]*>[\s\S]*?id="role"/);
  assert.match(html, /<label[^>]*>[\s\S]*?id="answer-input"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /\son(?:click|change|submit|input)=/i);
});

test('loads the core before the browser controller', () => {
  const coreIndex = html.indexOf('<script src="interview-core.js"></script>');
  const appIndex = html.indexOf('<script src="app.js"></script>');
  assert.ok(coreIndex >= 0 && appIndex > coreIndex);
});
