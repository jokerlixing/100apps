const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('./transcript-core.js');

const segment = (overrides = {}) => ({
  id: 'seg-a',
  startMs: 1200,
  endMs: 4300,
  text: ' 今天  我们开始记录。 ',
  source: 'speech',
  ...overrides,
});

test('cleanText removes control characters, collapses whitespace, and caps length', () => {
  assert.equal(Core.cleanText('  你好\u0000\n 世界  '), '你好 世界');
  assert.equal(Core.cleanText('x'.repeat(6000)).length, 5000);
  assert.equal(Core.cleanText(null), '');
});

test('normalizeSegment returns a safe timestamped record', () => {
  assert.deepEqual(Core.normalizeSegment(segment()), {
    id: 'seg-a',
    startMs: 1200,
    endMs: 4300,
    text: '今天 我们开始记录。',
    source: 'speech',
  });
});

test('normalizeSegment repairs duration but rejects invalid or empty records', () => {
  assert.equal(Core.normalizeSegment(segment({ text: '   ' })), null);
  assert.equal(Core.normalizeSegment(segment({ startMs: -1 })), null);
  assert.equal(Core.normalizeSegment(segment({ startMs: Number.NaN })), null);
  assert.deepEqual(Core.normalizeSegment(segment({ startMs: 8000, endMs: 1000 })).endMs, 8000);
  assert.equal(Core.normalizeSegment(segment({ source: 'remote' })).source, 'speech');
});

test('normalizeSegments sorts by time and removes duplicate IDs', () => {
  const result = Core.normalizeSegments([
    segment({ id: 'later', startMs: 5000, endMs: 6000, text: '第二段' }),
    segment({ id: 'first', startMs: 0, endMs: 800, text: '第一段' }),
    segment({ id: 'later', startMs: 7000, endMs: 8000, text: '重复段' }),
    null,
  ]);

  assert.deepEqual(result.map((item) => item.id), ['first', 'later']);
  assert.equal(result[1].text, '第二段');
});

test('editSegment and deleteSegment are immutable and reject empty edits', () => {
  const original = Core.normalizeSegments([segment()]);
  const edited = Core.editSegment(original, 'seg-a', '  修订后的内容。 ');
  const unchanged = Core.editSegment(original, 'seg-a', '   ');
  const removed = Core.deleteSegment(edited, 'seg-a');

  assert.equal(original[0].text, '今天 我们开始记录。');
  assert.equal(edited[0].text, '修订后的内容。');
  assert.notEqual(edited, original);
  assert.deepEqual(unchanged, original);
  assert.deepEqual(removed, []);
});

test('calculateMetrics reports visible characters, latin words, segments, and pace', () => {
  const records = Core.normalizeSegments([
    segment({ id: 'one', startMs: 0, endMs: 5000, text: '你好 world' }),
    segment({ id: 'two', startMs: 6000, endMs: 12000, text: '再次 test run' }),
  ]);
  const metrics = Core.calculateMetrics(records, 12000);

  assert.deepEqual(metrics, {
    characters: 16,
    words: 3,
    segments: 2,
    durationMs: 12000,
    charactersPerMinute: 80,
  });
});

test('sanitizeSession keeps only supported language and valid final segments', () => {
  const result = Core.sanitizeSession({
    version: 9,
    title: '  周会 / 记录  ',
    language: 'xx<script>',
    segments: [segment(), segment({ id: 'empty', text: '' })],
    updatedAt: 'bad-date',
  });

  assert.equal(result.version, 1);
  assert.equal(result.title, '周会 / 记录');
  assert.equal(result.language, 'zh-CN');
  assert.equal(result.segments.length, 1);
  assert.equal(result.updatedAt, '');
});

test('formatClock and formatSrtTime produce deterministic timecodes', () => {
  assert.equal(Core.formatClock(0), '00:00');
  assert.equal(Core.formatClock(3661000), '1:01:01');
  assert.equal(Core.formatSrtTime(3723456), '01:02:03,456');
  assert.equal(Core.formatSrtTime(-1), '00:00:00,000');
});

test('toPlainText creates a readable transcript with metadata', () => {
  const output = Core.toPlainText({
    title: '产品访谈',
    language: 'zh-CN',
    segments: [segment({ startMs: 0, endMs: 1500, text: '欢迎来到访谈。' })],
  });

  assert.match(output, /^产品访谈\n语言：zh-CN\n/);
  assert.match(output, /\[00:00\] 欢迎来到访谈。/);
});

test('toSrt sorts records and emits valid numbered cues', () => {
  const output = Core.toSrt([
    segment({ id: 'two', startMs: 5100, endMs: 7200, text: '第二句' }),
    segment({ id: 'one', startMs: 0, endMs: 2300, text: '第一句' }),
  ]);

  assert.equal(output, [
    '1',
    '00:00:00,000 --> 00:00:02,300',
    '第一句',
    '',
    '2',
    '00:00:05,100 --> 00:00:07,200',
    '第二句',
    '',
  ].join('\n'));
});

test('createFilename strips reserved characters and uses the requested extension', () => {
  assert.equal(Core.createFilename('周会 / 第一次?', 'srt'), 'SCRIBE-周会-第一次.srt');
  assert.equal(Core.createFilename('', 'exe'), 'SCRIBE-transcript.txt');
});
