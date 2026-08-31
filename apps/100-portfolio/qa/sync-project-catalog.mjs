import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(appDir, '..', '..');
const require = createRequire(import.meta.url);
const Core = require(path.join(appDir, 'portfolio-core.js'));

const trackerSource = readFileSync(path.join(repoDir, 'index.html'), 'utf8');
const projects = Core.parseTrackerSource(trackerSource);

if (projects.length !== 100) {
  throw new Error(`Expected 100 tracker projects, received ${projects.length}`);
}

const rows = projects.map((project) => [
  project.name,
  project.description,
  project.level,
  project.link,
  project.status,
]);
const output = `// Generated from the root tracker by qa/sync-project-catalog.mjs.\n`
  + `// Run the generator after changing IDEAS or INIT_DONE in /index.html.\n`
  + `window.PORTFOLIO_CATALOG = Object.freeze(${JSON.stringify(rows, null, 2)});\n`;

writeFileSync(path.join(appDir, 'project-catalog.js'), output, 'utf8');
console.log(`Wrote ${projects.length} projects to apps/100-portfolio/project-catalog.js`);
