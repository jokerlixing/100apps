(function initOcrCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OcrCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createOcrCore() {
  'use strict';

  const LIMITS = Object.freeze({
    maxFiles: 12,
    maxFileBytes: 15 * 1024 * 1024,
    maxPixels: 36_000_000,
    processingEdge: 2600,
    processingPixels: 12_000_000,
  });

  const SUPPORTED_TYPES = Object.freeze([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/bmp',
  ]);

  const LANGUAGES = Object.freeze({
    'zh-hans': Object.freeze({ id: 'zh-hans', code: 'chi_sim+eng', label: '简体中文 + 英文' }),
    'zh-hant': Object.freeze({ id: 'zh-hant', code: 'chi_tra+eng', label: '繁体中文 + 英文' }),
    eng: Object.freeze({ id: 'eng', code: 'eng', label: '仅英文' }),
  });

  const STATUSES = new Set(['queued', 'loading', 'running', 'done', 'failed']);

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
  }

  function cleanString(value, maxLength = 500) {
    return String(value == null ? '' : value).trim().slice(0, maxLength);
  }

  function validateImageFile(file, existingCount = 0) {
    if (!file || typeof file !== 'object' || !cleanString(file.name)) {
      return { ok: false, error: '无法读取这个文件，请重新选择图片。' };
    }
    if (finite(existingCount) >= LIMITS.maxFiles) {
      return { ok: false, error: `每批最多 ${LIMITS.maxFiles} 张图片，请先移除部分文件。` };
    }
    if (!SUPPORTED_TYPES.includes(cleanString(file.type).toLowerCase())) {
      return { ok: false, error: '仅支持 PNG、JPEG、WebP 或 BMP 图片。' };
    }
    if (finite(file.size) <= 0) {
      return { ok: false, error: '图片内容为空，请选择有效文件。' };
    }
    if (finite(file.size) > LIMITS.maxFileBytes) {
      return { ok: false, error: '单张图片不能超过 15 MB。' };
    }
    return { ok: true, error: '' };
  }

  function normalizeLanguage(value) {
    const id = cleanString(value, 20).toLowerCase();
    const language = LANGUAGES[id] || LANGUAGES['zh-hans'];
    return { ...language };
  }

  function createQueueItem(input = {}) {
    const width = Math.max(0, Math.round(finite(input.width)));
    const height = Math.max(0, Math.round(finite(input.height)));
    return {
      id: cleanString(input.id, 120),
      name: cleanString(input.name, 240) || '未命名图片',
      size: Math.max(0, Math.round(finite(input.size))),
      width,
      height,
      status: 'queued',
      progress: 0,
      phase: '等待识别',
      text: '',
      confidence: null,
      duration: 0,
      error: '',
    };
  }

  function normalizeItemPatch(current, patch = {}) {
    const result = { ...current };
    if (Object.hasOwn(patch, 'status') && STATUSES.has(patch.status)) result.status = patch.status;
    if (Object.hasOwn(patch, 'progress')) result.progress = clamp(patch.progress, 0, 1);
    if (Object.hasOwn(patch, 'phase')) result.phase = cleanString(patch.phase, 120);
    if (Object.hasOwn(patch, 'text')) result.text = String(patch.text == null ? '' : patch.text).slice(0, 1_000_000);
    if (Object.hasOwn(patch, 'confidence')) {
      result.confidence = patch.confidence == null ? null : clamp(patch.confidence, 0, 100);
    }
    if (Object.hasOwn(patch, 'duration')) result.duration = Math.max(0, Math.round(finite(patch.duration)));
    if (Object.hasOwn(patch, 'error')) result.error = cleanString(patch.error, 600);
    return result;
  }

  function updateQueueItem(items, id, patch) {
    if (!Array.isArray(items)) return [];
    const targetId = cleanString(id, 120);
    return items.map((item) => (item && item.id === targetId ? normalizeItemPatch(item, patch) : item));
  }

  function summarizeQueue(items) {
    const queue = Array.isArray(items) ? items.filter(Boolean) : [];
    const completedItems = queue.filter((item) => item.status === 'done');
    const confidenceValues = completedItems
      .map((item) => finite(item.confidence, -1))
      .filter((value) => value >= 0);
    const confidence = confidenceValues.length
      ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
      : 0;
    return {
      total: queue.length,
      completed: completedItems.length,
      failed: queue.filter((item) => item.status === 'failed').length,
      pending: queue.filter((item) => ['queued', 'loading', 'running'].includes(item.status)).length,
      characters: completedItems.reduce((sum, item) => sum + String(item.text || '').replace(/\s/g, '').length, 0),
      confidence,
    };
  }

  function calculateProcessingSize(
    width,
    height,
    maxEdge = LIMITS.processingEdge,
    maxPixels = LIMITS.processingPixels,
  ) {
    const sourceWidth = Math.max(1, Math.round(finite(width, 1)));
    const sourceHeight = Math.max(1, Math.round(finite(height, 1)));
    const edgeScale = Math.max(1, finite(maxEdge, LIMITS.processingEdge)) / Math.max(sourceWidth, sourceHeight);
    const pixelScale = Math.sqrt(Math.max(1, finite(maxPixels, LIMITS.processingPixels)) / (sourceWidth * sourceHeight));
    const scale = Math.min(1, edgeScale, pixelScale);
    return {
      width: Math.max(1, Math.floor(sourceWidth * scale)),
      height: Math.max(1, Math.floor(sourceHeight * scale)),
      scale: Number(scale.toFixed(6)),
    };
  }

  function formatBytes(value) {
    const bytes = Math.max(0, finite(value));
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
    return `${Math.round(bytes)} B`;
  }

  function formatDuration(value) {
    const milliseconds = Math.max(0, finite(value));
    if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)} 秒`;
    const totalSeconds = Math.round(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}分${seconds}秒`;
  }

  function formatConfidence(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return `${Math.round(clamp(value, 0, 100))}%`;
  }

  function phaseLabel(status, progress = 0) {
    const normalized = cleanString(status, 100).toLowerCase();
    const percentage = Math.round(clamp(progress, 0, 1) * 100);
    if (normalized.includes('loading tesseract core') || normalized.includes('initializing tesseract')) {
      return '加载识别引擎';
    }
    if (normalized.includes('language')) return `下载语言模型 · ${percentage}%`;
    if (normalized.includes('recognizing text')) return `识别文字 · ${percentage}%`;
    if (normalized.includes('loading') || normalized.includes('initializing')) return `准备模型 · ${percentage}%`;
    return '准备识别';
  }

  function normalizeRecognizedText(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[\t\f\v]+/g, ' ')
      .split('\n')
      .map((line) => line.trim().replace(/ {2,}/g, ' '))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function safeTextFilename(value) {
    const original = cleanString(value, 240).replace(/\.[a-z0-9]{1,8}$/i, '');
    const safe = original
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
      .replace(/\s*-+\s*/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-{2,}/g, '-')
      .replace(/^[.\s-]+|[.\s-]+$/g, '')
      .slice(0, 120);
    return `${safe || 'GLYPH64-识别结果'}.txt`;
  }

  function createBatchText(items) {
    const sections = (Array.isArray(items) ? items : [])
      .filter((item) => item && item.status === 'done' && normalizeRecognizedText(item.text))
      .map((item) => `===== ${cleanString(item.name, 240) || '未命名图片'} =====\n${normalizeRecognizedText(item.text)}`);
    if (!sections.length) return '';
    return `GLYPH/64 批量识别结果\n\n${sections.join('\n\n')}`;
  }

  return Object.freeze({
    LIMITS,
    SUPPORTED_TYPES,
    LANGUAGES,
    clamp,
    validateImageFile,
    normalizeLanguage,
    createQueueItem,
    updateQueueItem,
    summarizeQueue,
    calculateProcessingSize,
    formatBytes,
    formatDuration,
    formatConfidence,
    phaseLabel,
    normalizeRecognizedText,
    safeTextFilename,
    createBatchText,
  });
}));
