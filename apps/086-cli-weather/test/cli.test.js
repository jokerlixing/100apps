import test from 'node:test';
import assert from 'node:assert/strict';

import { run, VERSION } from '../src/cli.js';
import { createWeatherFetch } from './fixture.js';

function capture() {
  let value = '';
  return {
    stream: {
      isTTY: false,
      write(chunk) {
        value += String(chunk);
      },
    },
    value() {
      return value;
    },
  };
}

test('help and version complete without network access', async () => {
  const stdout = capture();
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error('must not run');
  };

  assert.equal(await run(['--help'], { stdout: stdout.stream, fetchImpl }), 0);
  assert.match(stdout.value(), /终端天气查询/);
  assert.equal(called, false);

  const versionOut = capture();
  assert.equal(await run(['--version'], { stdout: versionOut.stream, fetchImpl }), 0);
  assert.equal(versionOut.value().trim(), VERSION);
});

test('runs an end-to-end JSON query with an injected network layer', async () => {
  const stdout = capture();
  const stderr = capture();
  const { fetchImpl, calls } = createWeatherFetch();

  const exitCode = await run(['上海', '--json', '--days', '3'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    fetchImpl,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.value(), '');
  assert.equal(calls.length, 2);
  const payload = JSON.parse(stdout.value());
  assert.equal(payload.app, 'SKY/86');
  assert.equal(payload.current.humidity, 66);
});

test('returns exit code 2 and usage guidance for bad arguments', async () => {
  const stderr = capture();
  const exitCode = await run(['Paris', '--days', '99'], { stderr: stderr.stream });
  assert.equal(exitCode, 2);
  assert.match(stderr.value(), /--days/);
  assert.match(stderr.value(), /--help/);
});

test('returns exit code 1 without a stack trace for service errors', async () => {
  const stderr = capture();
  const fetchImpl = async () => {
    throw new Error('offline');
  };
  const exitCode = await run(['Paris'], { stderr: stderr.stream, fetchImpl });
  assert.equal(exitCode, 1);
  assert.match(stderr.value(), /无法连接天气服务/);
  assert.doesNotMatch(stderr.value(), /\n\s+at /);
});
