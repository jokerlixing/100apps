const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('./portfolio-core.js');

const repoDir = path.resolve(__dirname, '..', '..');
const trackerSource = fs.readFileSync(path.join(repoDir, 'index.html'), 'utf8');
const catalogSource = fs.readFileSync(path.join(__dirname, 'project-catalog.js'), 'utf8');

function embeddedProjects() {
  const context = { window: {} };
  vm.runInNewContext(catalogSource, context);
  const rows = JSON.parse(JSON.stringify(context.window.PORTFOLIO_CATALOG));
  const doneIds = new Set(rows.flatMap((row, index) => row[4] === 'done' ? [index + 1] : []));
  return Core.normalizeProjects(rows.map((row) => row.slice(0, 4)), doneIds);
}

test('embedded App 100 catalog exactly matches the root tracker', () => {
  assert.deepEqual(embeddedProjects(), Core.parseTrackerSource(trackerSource));
});

test('embedded App 100 catalog contains 100 unique runnable GitHub Pages links', () => {
  const projects = embeddedProjects();
  const links = projects.map((project) => project.link);
  assert.equal(projects.length, 100);
  assert.equal(new Set(links).size, 100);
  assert.equal(links.every((link) => link.startsWith('https://jokerlixing.github.io/100apps/')), true);
});
