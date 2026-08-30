const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./player-core.js');

test('formatTime handles clocks and unknown durations', () => {
  assert.equal(Core.formatTime(0), '00:00');
  assert.equal(Core.formatTime(65.9), '01:05');
  assert.equal(Core.formatTime(3661), '1:01:01');
  assert.equal(Core.formatTime(Number.NaN), '--:--');
  assert.equal(Core.formatTime(-5), '00:00');
});

test('parseLRC reads metadata, offsets, multiple stamps and stable order', () => {
  const parsed = Core.parseLRC(`
[ti:夜航]
[ar:REEL/79]
[offset:500]
[00:02.00][00:04.250]同一句
[00:01.50] 第一行
broken
[99:99.00]无效
  `);
  assert.equal(parsed.title, '夜航');
  assert.equal(parsed.artist, 'REEL/79');
  assert.deepEqual(parsed.lines, [
    { time: 2, text: '第一行' },
    { time: 2.5, text: '同一句' },
    { time: 4.75, text: '同一句' },
  ]);
});

test('findActiveLyric returns the last line at or before time', () => {
  const lines = [{ time: 1, text: 'a' }, { time: 3, text: 'b' }, { time: 8, text: 'c' }];
  assert.equal(Core.findActiveLyric(lines, 0.9), -1);
  assert.equal(Core.findActiveLyric(lines, 1), 0);
  assert.equal(Core.findActiveLyric(lines, 7.9), 1);
  assert.equal(Core.findActiveLyric(lines, 100), 2);
});

test('normalizeTrack bounds untrusted metadata and lyric content', () => {
  const track = Core.normalizeTrack({
    id: ' local:track_1 ', title: '  Demo\u0000 Song  ', artist: ' A '.repeat(100),
    album: '<b>Album</b>', duration: 999999, kind: 'other', size: -4,
    lyrics: [{ time: 3, text: '<img onerror=x>' }, { time: -1, text: 'bad' }],
  });
  assert.equal(track.id, 'local:track_1');
  assert.equal(track.title, 'Demo Song');
  assert.equal(track.artist.length, 80);
  assert.equal(track.album, '<b>Album</b>');
  assert.equal(track.duration, 86400);
  assert.equal(track.kind, 'local');
  assert.equal(track.size, 0);
  assert.deepEqual(track.lyrics, [{ time: 3, text: '<img onerror=x>' }]);
  assert.equal(Core.normalizeTrack({ id: 'bad id', title: 'x' }), null);
});

test('normalizePlaylist de-duplicates known tracks and protects sample reel', () => {
  const known = new Set(['demo:a', 'local:b']);
  assert.deepEqual(Core.normalizePlaylist({
    id: 'playlist:focus', name: '  Focus  ', trackIds: ['demo:a', 'bad', 'demo:a', 'local:b'],
  }, known), { id: 'playlist:focus', name: 'Focus', trackIds: ['demo:a', 'local:b'], fixed: false });
  assert.equal(Core.normalizePlaylist({ id: 'bad id', name: 'x' }, known), null);
  assert.equal(Core.normalizePlaylist({ id: 'sample', name: 'Renamed', trackIds: ['demo:a'] }, known).name, '样带 / SAMPLE REEL');
});

test('normalizeState repairs references and restores bounded preferences', () => {
  const demos = [
    { id: 'demo:a', title: 'A', artist: 'Studio', duration: 20, kind: 'demo' },
    { id: 'demo:b', title: 'B', artist: 'Studio', duration: 30, kind: 'demo' },
  ];
  const state = Core.normalizeState({
    tracks: [{ id: 'local:c', title: 'C', duration: 12, kind: 'local' }, { id: 'bad id', title: 'bad' }],
    playlists: [{ id: 'playlist:x', name: 'X', trackIds: ['local:c', 'missing'] }],
    selectedPlaylistId: 'missing', currentTrackId: 'missing', volume: 4, muted: 1,
    playMode: 'nonsense', positions: { 'local:c': 8, missing: 4 }, favorites: ['local:c', 'missing'],
  }, demos);
  assert.deepEqual(state.tracks.map((track) => track.id), ['demo:a', 'demo:b', 'local:c']);
  assert.deepEqual(state.playlists[0], { id: 'sample', name: '样带 / SAMPLE REEL', trackIds: ['demo:a', 'demo:b'], fixed: true });
  assert.equal(state.selectedPlaylistId, 'sample');
  assert.equal(state.currentTrackId, 'demo:a');
  assert.equal(state.volume, 1);
  assert.equal(state.muted, true);
  assert.equal(state.playMode, 'order');
  assert.deepEqual(state.positions, { 'local:c': 8 });
  assert.deepEqual(state.favorites, ['local:c']);
});

test('moveTrack is immutable and clamps movement', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(Core.moveTrack(ids, 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(Core.moveTrack(ids, 'a', -1), ids);
  assert.deepEqual(ids, ['a', 'b', 'c']);
});

test('removeTrackEverywhere clears playlists, positions and favorites', () => {
  const state = {
    tracks: [{ id: 'a' }, { id: 'b' }],
    playlists: [{ id: 'p', name: 'P', trackIds: ['a', 'b'] }],
    positions: { a: 4, b: 9 }, favorites: ['a'], currentTrackId: 'a',
  };
  const next = Core.removeTrackEverywhere(state, 'a');
  assert.deepEqual(next.tracks, [{ id: 'b' }]);
  assert.deepEqual(next.playlists[0].trackIds, ['b']);
  assert.deepEqual(next.positions, { b: 9 });
  assert.deepEqual(next.favorites, []);
  assert.equal(next.currentTrackId, 'b');
});

test('buildPlayOrder uses deterministic Fisher-Yates and keeps current first', () => {
  const values = [0, 0.9, 0.4];
  const order = Core.buildPlayOrder(['a', 'b', 'c', 'd'], 'c', 'shuffle', () => values.shift() ?? 0);
  assert.equal(order[0], 'c');
  assert.deepEqual(new Set(order), new Set(['a', 'b', 'c', 'd']));
  assert.deepEqual(Core.buildPlayOrder(['a', 'b'], 'b', 'order'), ['a', 'b']);
});

test('resolveNextTrack respects ends and repeat modes', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(Core.resolveNextTrack(ids, 'b', 1, 'order', 'manual'), 'c');
  assert.equal(Core.resolveNextTrack(ids, 'c', 1, 'order', 'ended'), null);
  assert.equal(Core.resolveNextTrack(ids, 'c', 1, 'repeat-all', 'ended'), 'a');
  assert.equal(Core.resolveNextTrack(ids, 'b', 1, 'repeat-one', 'ended'), 'b');
  assert.equal(Core.resolveNextTrack(ids, 'b', 1, 'repeat-one', 'manual'), 'c');
  assert.equal(Core.resolveNextTrack(ids, 'a', -1, 'repeat-all', 'manual'), 'c');
  assert.equal(Core.resolveNextTrack([], 'a', 1, 'order', 'ended'), null);
});
