import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../src/args.js';
import { UsageError } from '../src/errors.js';

test('parses a multi-word location and every value option', () => {
  const options = parseArgs(['New', 'York', '--days=5', '--unit', 'F', '-l', 'en', '--no-color']);

  assert.deepEqual(options, {
    location: 'New York',
    days: 5,
    unit: 'f',
    lang: 'en',
    json: false,
    color: false,
    help: false,
    version: false,
  });
});

test('uses stable defaults for a city-only query', () => {
  const options = parseArgs(['上海']);
  assert.equal(options.location, '上海');
  assert.equal(options.days, 3);
  assert.equal(options.unit, 'c');
  assert.equal(options.lang, 'zh');
});

test('help and version do not require a location', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['--version']).version, true);
});

test('supports literal location parts after the option separator', () => {
  assert.equal(parseArgs(['--lang', 'en', '--', '-West', 'Town']).location, '-West Town');
});

test('rejects missing locations, invalid ranges and unknown options', () => {
  assert.throws(() => parseArgs([]), UsageError);
  assert.throws(() => parseArgs(['Paris', '--days', '0']), /1 到 7/);
  assert.throws(() => parseArgs(['Paris', '--days', '2.5']), /整数/);
  assert.throws(() => parseArgs(['Paris', '--unit', 'kelvin']), /c 或 f/);
  assert.throws(() => parseArgs(['Paris', '--lang', 'fr']), /zh 或 en/);
  assert.throws(() => parseArgs(['Paris', '--wat']), /未知选项/);
});
