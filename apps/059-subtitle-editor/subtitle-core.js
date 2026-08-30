(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SubtitleCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_CUES = 2000;
  const MAX_TEXT_LENGTH = 1000;
  const MIN_CUE_DURATION = 100;

  function normalizeNewlines(value) {
    return String(value == null ? '' : value).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  }

  function parseTimecode(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : NaN;
    const input = String(value == null ? '' : value).trim();
    const match = input.match(/^(?:(\d{1,3}):)?(\d{1,4}):(\d{2})(?:[,.](\d{1,3}))?$/);
    if (!match) return NaN;
    const hasHours = match[1] != null;
    const hours = hasHours ? Number(match[1]) : 0;
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if ((hasHours && minutes > 59) || seconds > 59) return NaN;
    const milliseconds = Number((match[4] || '').padEnd(3, '0')) || 0;
    return ((hours * 60 * 60 + minutes * 60 + seconds) * 1000) + milliseconds;
  }

  function formatTimecode(value, format) {
    const safe = Math.max(0, Math.round(Number(value) || 0));
    const hours = Math.floor(safe / 3600000);
    const minutes = Math.floor((safe % 3600000) / 60000);
    const seconds = Math.floor((safe % 60000) / 1000);
    const milliseconds = safe % 1000;
    const separator = String(format).toLowerCase() === 'srt' ? ',' : '.';
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(milliseconds).padStart(3, '0')}`;
  }

  function compactTimecode(value) {
    const safe = Math.max(0, Math.round(Number(value) || 0));
    const hours = Math.floor(safe / 3600000);
    const minutes = Math.floor((safe % 3600000) / 60000);
    const seconds = Math.floor((safe % 60000) / 1000);
    const milliseconds = safe % 1000;
    const prefix = hours ? `${String(hours).padStart(2, '0')}:` : '';
    return `${prefix}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  }

  function cleanText(value) {
    return normalizeNewlines(value).trim().slice(0, MAX_TEXT_LENGTH);
  }

  function normalizeCue(cue, index) {
    const source = cue && typeof cue === 'object' ? cue : {};
    const startMs = Math.max(0, Math.round(Number(source.startMs) || 0));
    const endMs = Math.max(0, Math.round(Number(source.endMs) || 0));
    const fallbackId = `cue-${startMs}-${endMs}-${index + 1}`;
    return {
      ...source,
      id: String(source.id || fallbackId),
      startMs,
      endMs,
      text: cleanText(source.text),
      settings: String(source.settings || '').trim(),
      sourceId: String(source.sourceId || '').trim()
    };
  }

  function normalizeCues(input) {
    const seen = new Set();
    return (Array.isArray(input) ? input : [])
      .slice(0, MAX_CUES)
      .map((cue, index) => {
        const next = normalizeCue(cue, index);
        let id = next.id;
        let suffix = 2;
        while (seen.has(id)) id = `${next.id}-${suffix++}`;
        seen.add(id);
        return { ...next, id };
      })
      .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));
  }

  function detectFormat(content, hint) {
    const source = normalizeNewlines(content).trimStart();
    const label = String(hint || '').toLowerCase();
    return source.startsWith('WEBVTT') || label.endsWith('.vtt') || label === 'vtt' ? 'vtt' : 'srt';
  }

  function parseSubtitles(content, hint) {
    const format = detectFormat(content, hint);
    let source = normalizeNewlines(content);
    if (format === 'vtt') source = source.replace(/^WEBVTT[^\n]*\n?/, '');
    const blocks = source.split(/\n{2,}/);
    const cues = [];
    const warnings = [];

    blocks.forEach((rawBlock, blockIndex) => {
      const block = rawBlock.trim();
      if (!block) return;
      const lines = block.split('\n');
      const first = lines[0].trim().toUpperCase();
      if (format === 'vtt' && (first === 'STYLE' || first === 'REGION' || first.startsWith('NOTE'))) return;
      const timingIndex = lines.findIndex(line => line.includes('-->'));
      if (timingIndex < 0) {
        if (!(format === 'vtt' && blockIndex === 0 && !/\d/.test(block))) warnings.push(`第 ${blockIndex + 1} 段缺少时间范围`);
        return;
      }
      const timing = lines[timingIndex].trim().match(/^(\S+)\s+-->\s+(\S+)(?:\s+(.*))?$/);
      if (!timing) {
        warnings.push(`第 ${blockIndex + 1} 段时间范围格式无效`);
        return;
      }
      const startMs = parseTimecode(timing[1]);
      const endMs = parseTimecode(timing[2]);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        warnings.push(`第 ${blockIndex + 1} 段无法识别时间码`);
        return;
      }
      const text = cleanText(lines.slice(timingIndex + 1).join('\n'));
      const sourceId = timingIndex ? lines.slice(0, timingIndex).join(' ').trim() : '';
      cues.push({
        id: sourceId || `cue-${cues.length + 1}`,
        sourceId,
        startMs,
        endMs,
        text,
        settings: format === 'vtt' ? String(timing[3] || '').trim() : ''
      });
    });

    if (cues.length >= MAX_CUES) warnings.push(`仅载入前 ${MAX_CUES} 条字幕`);
    return { format, cues: normalizeCues(cues), warnings };
  }

  function diagnoseCues(input) {
    const cues = Array.isArray(input) ? [...input] : [];
    const byId = Object.create(null);
    let errorCount = 0;
    let warningCount = 0;
    cues.forEach((cue, index) => {
      const item = { id: cue.id, index, errors: [], warnings: [] };
      if (!Number.isFinite(Number(cue.startMs)) || !Number.isFinite(Number(cue.endMs)) || Number(cue.endMs) <= Number(cue.startMs)) item.errors.push('duration');
      if (!cleanText(cue.text)) item.warnings.push('empty');
      if (Number(cue.endMs) - Number(cue.startMs) > 7000) item.warnings.push('long');
      byId[cue.id] = item;
    });
    const sorted = cues
      .filter(cue => byId[cue.id] && Number.isFinite(Number(cue.startMs)) && Number.isFinite(Number(cue.endMs)))
      .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index];
      const next = sorted[index + 1];
      if (current.endMs > next.startMs) {
        if (!byId[current.id].warnings.includes('overlap')) byId[current.id].warnings.push('overlap');
        if (!byId[next.id].warnings.includes('overlap')) byId[next.id].warnings.push('overlap');
      }
    }
    Object.values(byId).forEach(item => {
      errorCount += item.errors.length;
      warningCount += item.warnings.length;
    });
    return { byId, errorCount, warningCount };
  }

  function activeCuesAt(input, timeMs) {
    const now = Number(timeMs);
    return (Array.isArray(input) ? input : []).filter(cue => Number(cue.startMs) <= now && now < Number(cue.endMs));
  }

  function findCueIndexAt(input, timeMs) {
    const cues = Array.isArray(input) ? input : [];
    const active = activeCuesAt(cues, timeMs);
    if (!active.length) return -1;
    const latest = [...active].sort((a, b) => b.startMs - a.startMs)[0];
    return cues.indexOf(latest);
  }

  function splitText(text, ratio) {
    const words = cleanText(text).split(/\s+/).filter(Boolean);
    if (words.length < 2) return [cleanText(text), ''];
    const cut = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)));
    return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
  }

  function splitCue(cue, atMs) {
    const source = normalizeCue(cue, 0);
    const point = Math.round(Number(atMs));
    if (!Number.isFinite(point) || point - source.startMs < MIN_CUE_DURATION || source.endMs - point < MIN_CUE_DURATION) {
      throw new RangeError('切分点需位于字幕内部，并距离两端至少 100ms');
    }
    const ratio = (point - source.startMs) / (source.endMs - source.startMs);
    const [leftText, rightText] = splitText(source.text, ratio);
    return [
      { ...source, id: `${source.id}-a`, endMs: point, text: leftText },
      { ...source, id: `${source.id}-b`, startMs: point, text: rightText }
    ];
  }

  function shiftCue(cue, deltaMs) {
    const source = { ...(cue || {}) };
    const startMs = Math.round(Number(source.startMs) || 0);
    const endMs = Math.round(Number(source.endMs) || 0);
    const duration = Math.max(0, endMs - startMs);
    const nextStart = Math.max(0, startMs + Math.round(Number(deltaMs) || 0));
    return { ...source, startMs: nextStart, endMs: nextStart + duration };
  }

  function createCue(timeMs, durationMs, text, id) {
    const startMs = Math.max(0, Math.round(Number(timeMs) || 0));
    const duration = Math.max(MIN_CUE_DURATION, Math.round(Number(durationMs) || 2000));
    return normalizeCue({ id: id || `cue-${Date.now().toString(36)}`, startMs, endMs: startMs + duration, text: text || '' }, 0);
  }

  function exportSubtitles(input, format) {
    const type = String(format).toLowerCase() === 'vtt' ? 'vtt' : 'srt';
    const cues = normalizeCues(input).filter(cue => cue.endMs > cue.startMs && cue.text);
    const blocks = cues.map((cue, index) => {
      const range = `${formatTimecode(cue.startMs, type)} --> ${formatTimecode(cue.endMs, type)}${type === 'vtt' && cue.settings ? ` ${cue.settings}` : ''}`;
      return type === 'srt' ? `${index + 1}\n${range}\n${cue.text}` : `${range}\n${cue.text}`;
    });
    return `${type === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n\n')}${blocks.length ? '\n' : ''}`;
  }

  function cueMetrics(cue) {
    const durationMs = Math.max(0, Number(cue && cue.endMs) - Number(cue && cue.startMs));
    const characters = cleanText(cue && cue.text).replace(/\s/g, '').length;
    return {
      durationMs,
      characters,
      charactersPerSecond: durationMs ? characters / (durationMs / 1000) : 0
    };
  }

  return {
    MAX_CUES,
    MAX_TEXT_LENGTH,
    MIN_CUE_DURATION,
    normalizeNewlines,
    parseTimecode,
    formatTimecode,
    compactTimecode,
    normalizeCue,
    normalizeCues,
    detectFormat,
    parseSubtitles,
    diagnoseCues,
    activeCuesAt,
    findCueIndexAt,
    splitCue,
    shiftCue,
    createCue,
    exportSubtitles,
    cueMetrics
  };
});
