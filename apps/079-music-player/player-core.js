(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PlayerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
  const PLAY_MODES = new Set(['order', 'shuffle', 'repeat-one', 'repeat-all']);
  const LIMITS = Object.freeze({ tracks: 300, playlists: 40, tracksPerPlaylist: 300, lyrics: 1200 });

  function cleanText(value, maxLength, fallback = '') {
    const text = String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (text || fallback).slice(0, maxLength);
  }

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim();
    return ID_PATTERN.test(id) ? id : '';
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, finiteNumber(value, min)));
  }

  function formatTime(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return '--:--';
    const seconds = Math.max(0, Math.floor(raw));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  function parseLRC(source) {
    const text = String(source == null ? '' : source).slice(0, 500000);
    const metadata = { title: '', artist: '', album: '', by: '' };
    const metadataKeys = { ti: 'title', ar: 'artist', al: 'album', by: 'by' };
    let offset = 0;
    for (const rawLine of text.split(/\r?\n/)) {
      const tag = rawLine.match(/^\s*\[([a-z]+):([^\]]*)\]\s*$/i);
      if (!tag) continue;
      const key = tag[1].toLowerCase();
      if (key === 'offset') offset = clamp(parseInt(tag[2], 10) || 0, -30000, 30000) / 1000;
      else if (metadataKeys[key]) metadata[metadataKeys[key]] = cleanText(tag[2], 120);
    }

    const lines = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
      if (!stamps.length) continue;
      const lyricText = cleanText(rawLine.replace(/\[[^\]]*\]/g, ''), 500);
      if (!lyricText) continue;
      for (const stamp of stamps) {
        const minutes = Number(stamp[1]);
        const seconds = Number(stamp[2]);
        if (!Number.isFinite(minutes) || seconds >= 60) continue;
        let fraction = 0;
        if (stamp[3]) fraction = Number(`0.${stamp[3].padEnd(3, '0').slice(0, 3)}`);
        const time = minutes * 60 + seconds + fraction + offset;
        if (time < 0 || time > 86400) continue;
        lines.push({ time: Math.round(time * 1000) / 1000, text: lyricText });
        if (lines.length >= LIMITS.lyrics) break;
      }
      if (lines.length >= LIMITS.lyrics) break;
    }
    lines.sort((a, b) => a.time - b.time);
    return { ...metadata, offset, lines };
  }

  function findActiveLyric(lines, currentTime) {
    if (!Array.isArray(lines) || !lines.length) return -1;
    const time = finiteNumber(currentTime, -1);
    let low = 0;
    let high = lines.length - 1;
    let answer = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (finiteNumber(lines[middle] && lines[middle].time, Infinity) <= time) {
        answer = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    return answer;
  }

  function normalizeLyrics(value) {
    if (!Array.isArray(value)) return [];
    const result = [];
    for (const entry of value.slice(0, LIMITS.lyrics)) {
      const time = finiteNumber(entry && entry.time, -1);
      const text = cleanText(entry && entry.text, 500);
      if (time < 0 || time > 86400 || !text) continue;
      result.push({ time: Math.round(time * 1000) / 1000, text });
    }
    return result.sort((a, b) => a.time - b.time);
  }

  function normalizeTrack(input) {
    if (!input || typeof input !== 'object') return null;
    const id = cleanId(input.id);
    const title = cleanText(input.title, 120);
    if (!id || !title) return null;
    return {
      id,
      title,
      artist: cleanText(input.artist, 80, '未知艺术家'),
      album: cleanText(input.album, 100, input.kind === 'demo' ? 'REEL/79 样带' : '本地曲库'),
      duration: clamp(input.duration, 0, 86400),
      kind: input.kind === 'demo' ? 'demo' : 'local',
      size: clamp(input.size, 0, 80 * 1024 * 1024),
      mime: cleanText(input.mime, 100),
      addedAt: cleanText(input.addedAt, 40),
      lyrics: normalizeLyrics(input.lyrics),
    };
  }

  function normalizePlaylist(input, knownTrackIds) {
    if (!input || typeof input !== 'object') return null;
    const id = cleanId(input.id);
    if (!id) return null;
    const fixed = id === 'sample';
    const seen = new Set();
    const trackIds = [];
    for (const value of Array.isArray(input.trackIds) ? input.trackIds : []) {
      const trackId = cleanId(value);
      if (!trackId || seen.has(trackId) || (knownTrackIds && !knownTrackIds.has(trackId))) continue;
      seen.add(trackId);
      trackIds.push(trackId);
      if (trackIds.length >= LIMITS.tracksPerPlaylist) break;
    }
    return {
      id,
      name: fixed ? '样带 / SAMPLE REEL' : cleanText(input.name, 48, '未命名歌单'),
      trackIds,
      fixed,
    };
  }

  function normalizeState(input, demoTracks) {
    const raw = input && typeof input === 'object' ? input : {};
    const tracks = [];
    const known = new Set();
    const demos = Array.isArray(demoTracks) ? demoTracks : [];
    for (const candidate of [...demos, ...(Array.isArray(raw.tracks) ? raw.tracks : [])]) {
      const track = normalizeTrack(candidate);
      if (!track || known.has(track.id) || tracks.length >= LIMITS.tracks) continue;
      if (candidate && candidate.kind !== 'demo' && demos.some((demo) => demo.id === track.id)) continue;
      known.add(track.id);
      tracks.push(track);
    }
    const demoIds = tracks.filter((track) => track.kind === 'demo').map((track) => track.id);
    const playlists = [{ id: 'sample', name: '样带 / SAMPLE REEL', trackIds: demoIds, fixed: true }];
    const playlistIds = new Set(['sample']);
    for (const candidate of Array.isArray(raw.playlists) ? raw.playlists : []) {
      const playlist = normalizePlaylist(candidate, known);
      if (!playlist || playlist.fixed || playlistIds.has(playlist.id) || playlists.length >= LIMITS.playlists) continue;
      playlistIds.add(playlist.id);
      playlists.push(playlist);
    }
    const selectedPlaylistId = playlistIds.has(raw.selectedPlaylistId) ? raw.selectedPlaylistId : 'sample';
    const selected = playlists.find((playlist) => playlist.id === selectedPlaylistId) || playlists[0];
    const requestedTrack = cleanId(raw.currentTrackId);
    const currentTrackId = known.has(requestedTrack)
      ? requestedTrack
      : (selected.trackIds[0] || tracks[0] && tracks[0].id || '');
    const positions = {};
    if (raw.positions && typeof raw.positions === 'object') {
      for (const [id, value] of Object.entries(raw.positions)) {
        if (known.has(id)) positions[id] = clamp(value, 0, tracks.find((track) => track.id === id).duration || 86400);
      }
    }
    const favorites = [...new Set(Array.isArray(raw.favorites) ? raw.favorites.map(cleanId).filter((id) => known.has(id)) : [])];
    return {
      tracks,
      playlists,
      selectedPlaylistId,
      currentTrackId,
      volume: clamp(raw.volume == null ? 0.78 : raw.volume, 0, 1),
      muted: Boolean(raw.muted),
      playMode: PLAY_MODES.has(raw.playMode) ? raw.playMode : 'order',
      positions,
      favorites,
    };
  }

  function moveTrack(trackIds, trackId, delta) {
    const result = Array.isArray(trackIds) ? [...trackIds] : [];
    const index = result.indexOf(trackId);
    if (index < 0) return result;
    const target = Math.max(0, Math.min(result.length - 1, index + (delta < 0 ? -1 : 1)));
    if (target === index) return result;
    [result[index], result[target]] = [result[target], result[index]];
    return result;
  }

  function removeTrackEverywhere(state, trackId) {
    const tracks = (Array.isArray(state.tracks) ? state.tracks : []).filter((track) => track.id !== trackId);
    const playlists = (Array.isArray(state.playlists) ? state.playlists : []).map((playlist) => ({
      ...playlist,
      trackIds: (Array.isArray(playlist.trackIds) ? playlist.trackIds : []).filter((id) => id !== trackId),
    }));
    const positions = { ...(state.positions || {}) };
    delete positions[trackId];
    const favorites = (Array.isArray(state.favorites) ? state.favorites : []).filter((id) => id !== trackId);
    const firstAvailable = playlists.flatMap((playlist) => playlist.trackIds)[0] || tracks[0] && tracks[0].id || '';
    return {
      ...state,
      tracks,
      playlists,
      positions,
      favorites,
      currentTrackId: state.currentTrackId === trackId ? firstAvailable : state.currentTrackId,
    };
  }

  function buildPlayOrder(trackIds, currentTrackId, mode, random = Math.random) {
    const ids = [...new Set(Array.isArray(trackIds) ? trackIds.filter(Boolean) : [])];
    if (mode !== 'shuffle' || ids.length < 2) return ids;
    const current = ids.includes(currentTrackId) ? currentTrackId : ids[0];
    const rest = ids.filter((id) => id !== current);
    for (let index = rest.length - 1; index > 0; index -= 1) {
      const target = Math.floor(clamp(random(), 0, 0.999999) * (index + 1));
      [rest[index], rest[target]] = [rest[target], rest[index]];
    }
    return [current, ...rest];
  }

  function resolveNextTrack(trackIds, currentTrackId, direction = 1, mode = 'order', reason = 'manual') {
    const ids = Array.isArray(trackIds) ? trackIds.filter(Boolean) : [];
    if (!ids.length) return null;
    if (mode === 'repeat-one' && reason === 'ended') return ids.includes(currentTrackId) ? currentTrackId : ids[0];
    let index = ids.indexOf(currentTrackId);
    if (index < 0) index = direction < 0 ? 0 : -1;
    const next = index + (direction < 0 ? -1 : 1);
    if (next >= 0 && next < ids.length) return ids[next];
    if (mode === 'repeat-all') return direction < 0 ? ids[ids.length - 1] : ids[0];
    return null;
  }

  return Object.freeze({
    LIMITS,
    formatTime,
    parseLRC,
    findActiveLyric,
    normalizeTrack,
    normalizePlaylist,
    normalizeState,
    moveTrack,
    removeTrackEverywhere,
    buildPlayOrder,
    resolveNextTrack,
  });
});
