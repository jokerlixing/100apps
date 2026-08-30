(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TranscriptCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SESSION_VERSION = 1;
  const DEFAULT_LANGUAGE = 'zh-CN';
  const LANGUAGES = new Set(['zh-CN', 'zh-TW', 'en-US', 'en-GB', 'ja-JP', 'ko-KR']);
  const SOURCES = new Set(['speech', 'demo', 'manual']);

  function cleanText(value, maxLength = 5000) {
    if (typeof value !== 'string') return '';
    const safeLimit = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : 5000;
    return value
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, safeLimit);
  }

  function safeMilliseconds(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  }

  function normalizeSegment(record) {
    if (!record || typeof record !== 'object') return null;
    const id = cleanText(record.id, 120);
    const text = cleanText(record.text);
    const startMs = safeMilliseconds(record.startMs);
    const rawEnd = safeMilliseconds(record.endMs);
    if (!id || !text || startMs === null || rawEnd === null) return null;

    return {
      id,
      startMs,
      endMs: Math.max(startMs, rawEnd),
      text,
      source: SOURCES.has(record.source) ? record.source : 'speech',
    };
  }

  function normalizeSegments(records) {
    if (!Array.isArray(records)) return [];
    const seen = new Set();
    return records
      .map(normalizeSegment)
      .filter((record) => {
        if (!record || seen.has(record.id)) return false;
        seen.add(record.id);
        return true;
      })
      .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));
  }

  function editSegment(records, id, nextText) {
    const safeText = cleanText(nextText);
    const normalized = normalizeSegments(records);
    if (!safeText || typeof id !== 'string') return normalized;
    return normalized.map((record) => record.id === id ? { ...record, text: safeText } : record);
  }

  function deleteSegment(records, id) {
    return normalizeSegments(records).filter((record) => record.id !== id);
  }

  function calculateMetrics(records, durationMs = 0) {
    const normalized = normalizeSegments(records);
    const combined = normalized.map((record) => record.text).join(' ');
    const characters = combined.replace(/\s/g, '').length;
    const words = combined.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
    const requestedDuration = safeMilliseconds(durationMs) || 0;
    const segmentDuration = normalized.reduce((maximum, record) => Math.max(maximum, record.endMs), 0);
    const safeDuration = Math.max(requestedDuration, segmentDuration);
    const charactersPerMinute = safeDuration > 0
      ? Math.round(characters / (safeDuration / 60000))
      : 0;

    return {
      characters,
      words,
      segments: normalized.length,
      durationMs: safeDuration,
      charactersPerMinute,
    };
  }

  function validIsoDate(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const time = Date.parse(value);
    return Number.isNaN(time) ? '' : new Date(time).toISOString();
  }

  function sanitizeSession(value) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      version: SESSION_VERSION,
      title: cleanText(input.title, 80) || '未命名转写',
      language: LANGUAGES.has(input.language) ? input.language : DEFAULT_LANGUAGE,
      segments: normalizeSegments(input.segments),
      updatedAt: validIsoDate(input.updatedAt),
    };
  }

  function formatClock(value) {
    const milliseconds = safeMilliseconds(value) || 0;
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatSrtTime(value) {
    const milliseconds = safeMilliseconds(value) || 0;
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    const remainder = milliseconds % 1000;
    return [hours, minutes, seconds]
      .map((part) => String(part).padStart(2, '0'))
      .join(':') + `,${String(remainder).padStart(3, '0')}`;
  }

  function toPlainText(session) {
    const safeSession = sanitizeSession(session);
    const lines = [safeSession.title, `语言：${safeSession.language}`, ''];
    safeSession.segments.forEach((record) => {
      lines.push(`[${formatClock(record.startMs)}] ${record.text}`);
    });
    return `${lines.join('\n').trimEnd()}\n`;
  }

  function toSrt(records) {
    return normalizeSegments(records).map((record, index) => [
      String(index + 1),
      `${formatSrtTime(record.startMs)} --> ${formatSrtTime(record.endMs)}`,
      record.text,
      '',
    ].join('\n')).join('\n');
  }

  function createFilename(title, extension = 'txt') {
    const safeExtension = extension === 'srt' ? 'srt' : 'txt';
    const safeTitle = cleanText(title, 60)
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'transcript';
    return `SCRIBE-${safeTitle}.${safeExtension}`;
  }

  return Object.freeze({
    cleanText,
    normalizeSegment,
    normalizeSegments,
    editSegment,
    deleteSegment,
    calculateMetrics,
    sanitizeSession,
    formatClock,
    formatSrtTime,
    toPlainText,
    toSrt,
    createFilename,
  });
});
