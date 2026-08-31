import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('.', import.meta.url));
const html = readFileSync(new URL('index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('web.js', import.meta.url), 'utf8');

test('browser entry exposes a city form and terminal output', () => {
  assert.match(html, /<form[^>]+id="weather-form"/);
  assert.match(html, /id="city-input"/);
  assert.match(html, /id="terminal-output"/);
  assert.match(html, /type="module" src="web\.js"/);
});

test('browser entry reuses the tested CLI weather modules', () => {
  assert.match(script, /from '\.\/src\/api\.js'/);
  assert.match(script, /from '\.\/src\/format\.js'/);
  assert.match(script, /loadWeather/);
  assert.match(script, /formatTerminal/);
  assert.match(script, /if \(initialCity\) runWeather\(cityInput\.value\)/);
});

test('browser deployment files stay inside the app directory', () => {
  assert.match(appDir.replace(/\\/g, '/'), /apps\/086-cli-weather\/$/);
});
