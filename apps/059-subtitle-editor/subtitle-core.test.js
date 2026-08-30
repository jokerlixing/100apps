const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./subtitle-core.js');

test('parses and formats SRT and VTT timecodes', () => {
  assert.equal(Core.parseTimecode('01:02:03,456'), 3723456);
  assert.equal(Core.parseTimecode('02:03.045'), 123045);
  assert.equal(Core.parseTimecode('00:00:01.5'), 1500);
  assert.ok(Number.isNaN(Core.parseTimecode('not-a-time')));
  assert.equal(Core.formatTimecode(3723456, 'srt'), '01:02:03,456');
  assert.equal(Core.formatTimecode(123045, 'vtt'), '00:02:03.045');
});

test('parses numbered SRT while preserving multiline and HTML-like text', () => {
  const source = '\uFEFF1\r\n00:00:01,200 --> 00:00:03,450\r\n你好 <b>世界</b>\r\n第二行\r\n\r\n2\r\n00:00:04.000 --> 00:00:05.500\r\nNext';
  const result = Core.parseSubtitles(source, 'demo.srt');
  assert.equal(result.format, 'srt');
  assert.equal(result.cues.length, 2);
  assert.equal(result.cues[0].startMs, 1200);
  assert.equal(result.cues[0].endMs, 3450);
  assert.equal(result.cues[0].text, '你好 <b>世界</b>\n第二行');
  assert.equal(result.cues[1].text, 'Next');
});

test('parses WEBVTT identifiers and cue settings but ignores notes', () => {
  const source = `WEBVTT Demo\n\nNOTE generated locally\nignore me\n\nintro\n00:00:00.500 --> 00:00:02.000 align:start position:10%\nOpening\n\n00:02.000 --> 00:04.250\nSecond line`;
  const result = Core.parseSubtitles(source, 'demo.vtt');
  assert.equal(result.format, 'vtt');
  assert.equal(result.cues.length, 2);
  assert.equal(result.cues[0].sourceId, 'intro');
  assert.equal(result.cues[0].settings, 'align:start position:10%');
  assert.equal(result.cues[1].startMs, 2000);
});

test('reports malformed blocks without discarding valid cues', () => {
  const source = `1\n00:00:AA,000 --> 00:00:03,000\nBad\n\n2\n00:00:04,000 --> 00:00:05,000\nGood`;
  const result = Core.parseSubtitles(source, 'srt');
  assert.equal(result.cues.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /无法识别时间码/);
});

test('normalizes sort order, ids and text limits', () => {
  const long = 'x'.repeat(Core.MAX_TEXT_LENGTH + 20);
  const cues = Core.normalizeCues([
    { id: 'same', startMs: 3000, endMs: 4000, text: long },
    { id: 'same', startMs: 1000.4, endMs: 2000.6, text: ' first ' }
  ]);
  assert.deepEqual(cues.map(cue => cue.startMs), [1000, 3000]);
  assert.equal(cues[0].text, 'first');
  assert.equal(cues[1].text.length, Core.MAX_TEXT_LENGTH);
  assert.notEqual(cues[0].id, cues[1].id);
});

test('diagnoses invalid duration, empty text and overlaps', () => {
  const cues = [
    { id: 'a', startMs: 1000, endMs: 3000, text: 'A' },
    { id: 'b', startMs: 2500, endMs: 2500, text: '' }
  ];
  const diagnostics = Core.diagnoseCues(cues);
  assert.ok(diagnostics.byId.a.warnings.includes('overlap'));
  assert.ok(diagnostics.byId.b.errors.includes('duration'));
  assert.ok(diagnostics.byId.b.warnings.includes('empty'));
  assert.equal(diagnostics.errorCount, 1);
});

test('returns every active cue at the playhead', () => {
  const cues = [
    { id: 'a', startMs: 0, endMs: 2000, text: 'A' },
    { id: 'b', startMs: 1500, endMs: 2500, text: 'B' }
  ];
  assert.deepEqual(Core.activeCuesAt(cues, 1750).map(cue => cue.id), ['a', 'b']);
  assert.equal(Core.findCueIndexAt(cues, 2400), 1);
  assert.equal(Core.findCueIndexAt(cues, 3000), -1);
});

test('splits cue timing and text around the requested point', () => {
  const [left, right] = Core.splitCue({ id: 'cue', startMs: 1000, endMs: 5000, text: 'one two three four' }, 2800);
  assert.equal(left.endMs, 2800);
  assert.equal(right.startMs, 2800);
  assert.equal(`${left.text} ${right.text}`, 'one two three four');
  assert.throws(() => Core.splitCue({ startMs: 0, endMs: 1000, text: 'x' }, 50), /切分点/);
});

test('exports valid cues to clean SRT and VTT documents', () => {
  const cues = [
    { id: 'b', startMs: 2050, endMs: 4000, text: 'Second' },
    { id: 'a', startMs: 0, endMs: 1500, text: 'First\nline' },
    { id: 'bad', startMs: 5000, endMs: 4000, text: 'Skip' }
  ];
  const srt = Core.exportSubtitles(cues, 'srt');
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\nFirst\nline/);
  assert.match(srt, /2\n00:00:02,050 --> 00:00:04,000\nSecond/);
  assert.doesNotMatch(srt, /Skip/);
  const vtt = Core.exportSubtitles(cues, 'vtt');
  assert.match(vtt, /^WEBVTT\n\n00:00:00.000 --> 00:00:01.500/);
});

test('shifts a cue without allowing a negative start', () => {
  assert.deepEqual(
    Core.shiftCue({ id: 'a', startMs: 100, endMs: 900, text: 'A' }, -500),
    { id: 'a', startMs: 0, endMs: 800, text: 'A' }
  );
});
