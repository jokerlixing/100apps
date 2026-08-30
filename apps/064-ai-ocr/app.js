(function initGlyph64(root) {
  'use strict';

  const Core = root.OcrCore;
  if (!Core) throw new Error('OcrCore failed to load.');

  const TESSERACT_SOURCE = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  const STATUS_LABELS = Object.freeze({
    queued: '等待',
    loading: '模型',
    running: '识别',
    done: '完成',
    failed: '失败',
  });

  const dom = {
    body: document.body,
    language: document.querySelector('#language-select'),
    enhance: document.querySelector('#enhance-toggle'),
    run: document.querySelector('#run-button'),
    runLabel: document.querySelector('#run-label'),
    stop: document.querySelector('#stop-button'),
    fileInput: document.querySelector('#file-input'),
    dropZone: document.querySelector('#drop-zone'),
    sample: document.querySelector('#sample-button'),
    clear: document.querySelector('#clear-button'),
    queueCount: document.querySelector('#queue-count'),
    queueSize: document.querySelector('#queue-size'),
    queueEmpty: document.querySelector('#queue-empty'),
    queueList: document.querySelector('#queue-list'),
    queueTemplate: document.querySelector('#queue-item-template'),
    proofStage: document.querySelector('#proof-stage'),
    stageEmpty: document.querySelector('#stage-empty'),
    previewImage: document.querySelector('#preview-image'),
    modeFlag: document.querySelector('#mode-flag'),
    fileName: document.querySelector('#file-name'),
    fileDimensions: document.querySelector('#file-dimensions'),
    fileSize: document.querySelector('#file-size'),
    fileProgress: document.querySelector('#file-progress'),
    statusCode: document.querySelector('#status-code'),
    statusTitle: document.querySelector('#status-title'),
    statusDetail: document.querySelector('#status-detail'),
    proofState: document.querySelector('#proof-state'),
    proofEditor: document.querySelector('#proof-editor'),
    confidence: document.querySelector('#confidence-value'),
    characters: document.querySelector('#character-value'),
    duration: document.querySelector('#duration-value'),
    copy: document.querySelector('#copy-button'),
    download: document.querySelector('#download-button'),
    batchSummary: document.querySelector('#batch-summary'),
    export: document.querySelector('#export-button'),
    toast: document.querySelector('#toast'),
  };

  const state = {
    queue: [],
    records: new Map(),
    selectedId: null,
    activeId: null,
    running: false,
    stopRequested: false,
    worker: null,
    workerLanguage: '',
    enginePromise: null,
    nextId: 0,
    toastTimer: 0,
  };

  function selectedItem() {
    return state.queue.find((item) => item.id === state.selectedId) || null;
  }

  function updateItem(id, patch) {
    state.queue = Core.updateQueueItem(state.queue, id, patch);
    return state.queue.find((item) => item.id === id) || null;
  }

  function showToast(message) {
    const text = String(message || '').trim();
    if (!text) return;
    clearTimeout(state.toastTimer);
    dom.toast.textContent = text;
    dom.toast.classList.add('is-visible');
    state.toastTimer = root.setTimeout(() => dom.toast.classList.remove('is-visible'), 3200);
  }

  function statusCopy(item) {
    if (!item) {
      return {
        code: 'STANDBY',
        title: '加入图片开始识别',
        detail: '图像不会上传，文本只保留在当前页面。',
      };
    }
    if (item.status === 'loading') {
      return { code: 'ENGINE', title: item.phase || '加载识别模型', detail: '首次加载耗时取决于网络和所选语言。' };
    }
    if (item.status === 'running') {
      return { code: 'OCR ACTIVE', title: item.phase || '正在识别', detail: `${item.name} · 请保持页面打开` };
    }
    if (item.status === 'done') {
      return { code: 'PROOF READY', title: '识别完成，可以校对文字', detail: '修订会立即进入单张和批次导出。' };
    }
    if (item.status === 'failed') {
      return { code: 'CHECK FILE', title: '这张图片识别失败', detail: item.error || '检查图片后重新开始未完成项。' };
    }
    return { code: 'IN QUEUE', title: '已加入识别队列', detail: '确认语言和增强选项后开始批次。' };
  }

  function renderQueue() {
    dom.queueList.replaceChildren();
    state.queue.forEach((item, index) => {
      const fragment = dom.queueTemplate.content.cloneNode(true);
      const listItem = fragment.querySelector('.queue-item');
      const select = fragment.querySelector('.queue-select');
      const remove = fragment.querySelector('.queue-remove');
      const record = state.records.get(item.id);
      listItem.dataset.id = item.id;
      listItem.dataset.status = item.status;
      listItem.classList.toggle('is-selected', item.id === state.selectedId);
      listItem.style.setProperty('--item-progress', `${Math.round(item.progress * 100)}%`);
      select.dataset.id = item.id;
      select.setAttribute('aria-current', item.id === state.selectedId ? 'true' : 'false');
      select.querySelector('.queue-index').textContent = String(index + 1).padStart(2, '0');
      const thumbnail = select.querySelector('.queue-thumb');
      thumbnail.src = record ? record.url : '';
      thumbnail.alt = `${item.name} 缩略图`;
      select.querySelector('.queue-name').textContent = item.name;
      select.querySelector('.queue-meta').textContent = `${item.width}×${item.height} · ${Core.formatBytes(item.size)}`;
      select.querySelector('.queue-status').textContent = STATUS_LABELS[item.status] || '等待';
      remove.dataset.id = item.id;
      remove.setAttribute('aria-label', `移除 ${item.name}`);
      remove.disabled = state.running;
      dom.queueList.append(fragment);
    });
  }

  function renderSelected() {
    const item = selectedItem();
    const record = item ? state.records.get(item.id) : null;
    const copy = statusCopy(item);

    dom.stageEmpty.hidden = Boolean(item);
    dom.previewImage.hidden = !item;
    if (item && record) {
      if (dom.previewImage.src !== record.url) dom.previewImage.src = record.url;
      dom.previewImage.alt = `${item.name} 原稿预览`;
    } else {
      dom.previewImage.removeAttribute('src');
      dom.previewImage.alt = '';
    }

    const progress = item ? Math.round(item.progress * 100) : 0;
    dom.proofStage.style.setProperty('--scan-progress', `${Math.max(2, Math.min(98, progress))}%`);
    dom.fileName.textContent = item ? item.name : '尚未选择';
    dom.fileDimensions.textContent = item ? `${item.width} × ${item.height}` : '— × —';
    dom.fileSize.textContent = item ? Core.formatBytes(item.size) : '—';
    dom.fileProgress.textContent = `${progress}%`;
    dom.statusCode.textContent = copy.code;
    dom.statusTitle.textContent = copy.title;
    dom.statusDetail.textContent = copy.detail;
    dom.modeFlag.textContent = state.running ? 'LOCAL / PROCESSING' : item ? 'LOCAL / READY' : 'LOCAL / IDLE';

    const editable = Boolean(item && item.status === 'done');
    dom.proofEditor.disabled = !editable;
    if (document.activeElement !== dom.proofEditor) dom.proofEditor.value = item ? item.text : '';
    dom.proofState.textContent = !item ? 'NO PROOF' : item.status === 'done' ? 'EDITABLE' : (STATUS_LABELS[item.status] || 'WAITING').toUpperCase();
    dom.confidence.textContent = item ? Core.formatConfidence(item.confidence) : '—';
    dom.characters.textContent = item ? String(item.text.replace(/\s/g, '').length) : '0';
    dom.duration.textContent = item && item.duration ? Core.formatDuration(item.duration) : '—';
    const hasText = Boolean(editable && item.text.trim());
    dom.copy.disabled = !hasText;
    dom.download.disabled = !hasText;
  }

  function renderSummary() {
    const summary = Core.summarizeQueue(state.queue);
    const batchText = Core.createBatchText(state.queue);
    const totalBytes = state.queue.reduce((sum, item) => sum + item.size, 0);
    const runnable = state.queue.some((item) => item.status !== 'done');
    dom.body.dataset.state = state.running ? 'running' : state.queue.length ? 'ready' : 'empty';
    dom.queueCount.textContent = `${String(summary.total).padStart(2, '0')} / ${Core.LIMITS.maxFiles}`;
    dom.queueSize.textContent = Core.formatBytes(totalBytes);
    dom.queueEmpty.hidden = state.queue.length > 0;
    dom.run.disabled = state.running || !runnable;
    dom.runLabel.textContent = summary.completed || summary.failed ? '继续批次' : '开始批次';
    dom.stop.hidden = !state.running;
    dom.clear.disabled = state.running || !state.queue.length;
    dom.language.disabled = state.running;
    dom.enhance.disabled = state.running;
    dom.fileInput.disabled = state.running;
    dom.sample.disabled = state.running || state.queue.length >= Core.LIMITS.maxFiles;
    dom.dropZone.setAttribute('aria-disabled', String(state.running));
    dom.export.disabled = !batchText;
    dom.batchSummary.textContent = summary.completed
      ? `${summary.completed} 张完成 · ${summary.characters} 字符 · 平均 ${summary.confidence}%`
      : summary.failed
        ? `${summary.failed} 张需要重试`
        : '尚无可导出的校样';
  }

  function render() {
    renderQueue();
    renderSelected();
    renderSummary();
  }

  function readImageDimensions(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('浏览器无法解码这张图片。'));
      image.src = url;
    });
  }

  async function addFiles(fileList) {
    if (state.running) {
      showToast('请先中止当前批次，再加入图片。');
      return;
    }
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const errors = [];
    let accepted = 0;

    for (const file of files) {
      const validation = Core.validateImageFile(file, state.queue.length);
      if (!validation.ok) {
        errors.push(`${file && file.name ? file.name : '未知文件'}：${validation.error}`);
        continue;
      }

      const url = URL.createObjectURL(file);
      try {
        const dimensions = await readImageDimensions(url);
        if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > Core.LIMITS.maxPixels) {
          throw new Error('图片像素不能超过 3600 万。');
        }
        const id = `glyph-${Date.now().toString(36)}-${++state.nextId}`;
        const item = Core.createQueueItem({
          id,
          name: file.name,
          size: file.size,
          width: dimensions.width,
          height: dimensions.height,
        });
        state.records.set(id, { file, url });
        state.queue = [...state.queue, item];
        if (!state.selectedId) state.selectedId = id;
        accepted += 1;
      } catch (error) {
        URL.revokeObjectURL(url);
        errors.push(`${file.name}：${error.message || '图片解码失败。'}`);
      }
    }

    dom.fileInput.value = '';
    render();
    if (accepted) showToast(`已加入 ${accepted} 张图片。`);
    if (errors.length) showToast(errors.length === 1 ? errors[0] : `${errors.length} 个文件未加入，请检查格式、大小或像素。`);
  }

  function createSampleFile() {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1400;
      canvas.height = 900;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('当前浏览器无法生成样张。'));
        return;
      }
      context.fillStyle = '#f8fbfc';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#1f55d5';
      context.fillRect(70, 72, 22, 710);
      context.fillStyle = '#18232c';
      context.font = '700 88px "Microsoft YaHei", sans-serif';
      context.fillText('识别校样 064', 145, 185);
      context.fillStyle = '#d84e78';
      context.font = '700 34px Consolas, monospace';
      context.fillText('LOCAL OCR / PROOF SHEET', 150, 245);
      context.strokeStyle = '#18232c';
      context.lineWidth = 3;
      context.strokeRect(145, 310, 1080, 330);
      context.fillStyle = '#18232c';
      context.font = '500 48px "Microsoft YaHei", sans-serif';
      context.fillText('图片留在本机，文字由你校对。', 200, 405);
      context.fillText('批量识别 · 编辑 · 复制 · 导出', 200, 485);
      context.font = '600 42px Arial, sans-serif';
      context.fillText('Read images. Keep words.', 200, 570);
      context.fillStyle = '#f2c94c';
      context.fillRect(145, 704, 1080, 78);
      context.fillStyle = '#18232c';
      context.font = '700 28px Consolas, monospace';
      context.fillText('GLYPH/64 · 2026 · SAMPLE 01', 180, 754);
      canvas.toBlob((blob) => {
        if (!blob) reject(new Error('样张生成失败。'));
        else resolve(new File([blob], 'GLYPH64-中英样张.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  async function addSample() {
    try {
      const file = await createSampleFile();
      await addFiles([file]);
    } catch (error) {
      showToast(error.message || '样张生成失败。');
    }
  }

  function selectQueueItem(id) {
    if (!state.queue.some((item) => item.id === id)) return;
    state.selectedId = id;
    renderSelected();
  }

  function removeQueueItem(id) {
    if (state.running) return;
    const index = state.queue.findIndex((item) => item.id === id);
    if (index < 0) return;
    const record = state.records.get(id);
    if (record) URL.revokeObjectURL(record.url);
    state.records.delete(id);
    state.queue = state.queue.filter((item) => item.id !== id);
    if (state.selectedId === id) {
      const replacement = state.queue[Math.min(index, state.queue.length - 1)];
      state.selectedId = replacement ? replacement.id : null;
    }
    render();
  }

  function clearQueue() {
    if (state.running) return;
    state.records.forEach((record) => URL.revokeObjectURL(record.url));
    state.records.clear();
    state.queue = [];
    state.selectedId = null;
    render();
    showToast('批次已清空。');
  }

  function loadTesseract() {
    if (root.Tesseract && typeof root.Tesseract.createWorker === 'function') return Promise.resolve(root.Tesseract);
    if (state.enginePromise) return state.enginePromise;
    state.enginePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = root.setTimeout(() => {
        script.remove();
        state.enginePromise = null;
        reject(new Error('识别引擎下载超时，请检查网络后重试。'));
      }, 30_000);
      script.src = TESSERACT_SOURCE;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        clearTimeout(timeout);
        if (root.Tesseract && typeof root.Tesseract.createWorker === 'function') resolve(root.Tesseract);
        else {
          state.enginePromise = null;
          reject(new Error('识别引擎加载不完整，请刷新后重试。'));
        }
      };
      script.onerror = () => {
        clearTimeout(timeout);
        state.enginePromise = null;
        script.remove();
        reject(new Error('无法下载识别引擎，请检查网络或内容拦截设置。'));
      };
      document.head.append(script);
    });
    return state.enginePromise;
  }

  function handleWorkerProgress(message) {
    const id = state.activeId;
    if (!id || !message) return;
    const progress = Core.clamp(message.progress, 0, 1);
    const recognizing = String(message.status || '').toLowerCase().includes('recognizing text');
    updateItem(id, {
      status: recognizing ? 'running' : 'loading',
      progress,
      phase: Core.phaseLabel(message.status, progress),
    });
    renderQueue();
    renderSelected();
  }

  async function terminateWorker() {
    const worker = state.worker;
    state.worker = null;
    state.workerLanguage = '';
    if (worker && typeof worker.terminate === 'function') {
      try {
        await worker.terminate();
      } catch {}
    }
  }

  async function ensureWorker(language) {
    if (state.worker && state.workerLanguage === language.code) return state.worker;
    await terminateWorker();
    const Tesseract = await loadTesseract();
    const languageArgument = language.code.includes('+') ? language.code.split('+') : language.code;
    const worker = await Tesseract.createWorker(languageArgument, 1, {
      logger: handleWorkerProgress,
      errorHandler(error) {
        if (!state.stopRequested) console.error('GLYPH/64 OCR worker:', error);
      },
    });
    if (state.stopRequested) {
      await worker.terminate();
      throw new Error('批次已中止。');
    }
    state.worker = worker;
    state.workerLanguage = language.code;
    return worker;
  }

  async function imageSource(file) {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('图片解码失败。'));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  }

  async function prepareCanvas(record) {
    const decoded = await imageSource(record.file);
    try {
      const size = Core.calculateProcessingSize(decoded.width, decoded.height);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('浏览器无法创建图像处理画布。');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      if (dom.enhance.checked) context.filter = 'grayscale(1) contrast(1.34)';
      context.drawImage(decoded.source, 0, 0, size.width, size.height);
      context.filter = 'none';
      return canvas;
    } finally {
      decoded.close();
    }
  }

  function errorMessage(error) {
    const message = String(error && error.message ? error.message : error || '').trim();
    if (!message) return '识别失败，请重试。';
    if (/network|fetch|load|importscripts|download/i.test(message)) return '模型或引擎下载失败，请检查网络后重试。';
    if (/memory|allocation/i.test(message)) return '设备内存不足，请移除大图或关闭校样增强后重试。';
    return message.slice(0, 300);
  }

  async function runBatch() {
    if (state.running) return;
    const targets = state.queue.filter((item) => item.status !== 'done').map((item) => item.id);
    if (!targets.length) {
      showToast('当前批次已经全部完成。');
      return;
    }

    state.running = true;
    state.stopRequested = false;
    const language = Core.normalizeLanguage(dom.language.value);
    render();

    try {
      for (const id of targets) {
        if (state.stopRequested) break;
        const record = state.records.get(id);
        if (!record) continue;
        state.activeId = id;
        state.selectedId = id;
        updateItem(id, { status: 'loading', progress: 0, phase: '准备识别引擎', error: '' });
        render();
        const started = performance.now();

        try {
          const worker = await ensureWorker(language);
          if (state.stopRequested) break;
          updateItem(id, { status: 'running', progress: 0, phase: '整理图像 · 0%' });
          render();
          const canvas = await prepareCanvas(record);
          if (state.stopRequested) break;
          const result = await worker.recognize(canvas);
          if (state.stopRequested) break;
          const text = Core.normalizeRecognizedText(result && result.data ? result.data.text : '');
          const confidence = result && result.data ? result.data.confidence : null;
          updateItem(id, {
            status: 'done',
            progress: 1,
            phase: '识别完成',
            text,
            confidence,
            duration: performance.now() - started,
            error: '',
          });
        } catch (error) {
          if (state.stopRequested) {
            updateItem(id, { status: 'queued', progress: 0, phase: '已中止，可重新开始', error: '' });
            break;
          }
          updateItem(id, {
            status: 'failed',
            progress: 0,
            phase: '识别失败',
            duration: performance.now() - started,
            error: errorMessage(error),
          });
          if (!state.worker) {
            showToast(errorMessage(error));
            break;
          }
        }
        render();
      }
    } finally {
      if (state.stopRequested && state.activeId) {
        const active = state.queue.find((item) => item.id === state.activeId);
        if (active && ['loading', 'running'].includes(active.status)) {
          updateItem(active.id, { status: 'queued', progress: 0, phase: '已中止，可重新开始', error: '' });
        }
      }
      state.running = false;
      state.activeId = null;
      render();
      if (state.stopRequested) showToast('批次已中止，完成的校样已经保留。');
      else {
        const summary = Core.summarizeQueue(state.queue);
        showToast(summary.failed ? `批次结束：${summary.completed} 张完成，${summary.failed} 张需要重试。` : `批次完成：${summary.completed} 张图片已生成校样。`);
      }
    }
  }

  async function stopBatch() {
    if (!state.running || state.stopRequested) return;
    state.stopRequested = true;
    dom.stop.disabled = true;
    dom.statusTitle.textContent = '正在安全中止当前识别';
    await terminateWorker();
  }

  async function copySelectedText() {
    const item = selectedItem();
    if (!item || !item.text.trim()) return;
    try {
      if (navigator.clipboard && root.isSecureContext) await navigator.clipboard.writeText(item.text);
      else {
        dom.proofEditor.focus();
        dom.proofEditor.select();
        if (!document.execCommand('copy')) throw new Error('copy failed');
        dom.proofEditor.setSelectionRange(0, 0);
      }
      showToast('已复制当前校样。');
    } catch {
      dom.proofEditor.focus();
      dom.proofEditor.select();
      showToast('浏览器未允许自动复制，文字已全选，请手动复制。');
    }
  }

  function downloadText(text, filename) {
    const blob = new Blob([`\ufeff${text}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadSelected() {
    const item = selectedItem();
    if (!item || !item.text.trim()) return;
    downloadText(item.text, Core.safeTextFilename(item.name));
    showToast('当前校样已下载。');
  }

  function downloadBatch() {
    const text = Core.createBatchText(state.queue);
    if (!text) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadText(text, `GLYPH64-${date}-batch.txt`);
    showToast('合并校样已下载。');
  }

  dom.fileInput.addEventListener('change', (event) => addFiles(event.target.files));
  dom.sample.addEventListener('click', addSample);
  dom.run.addEventListener('click', runBatch);
  dom.stop.addEventListener('click', stopBatch);
  dom.clear.addEventListener('click', clearQueue);
  dom.copy.addEventListener('click', copySelectedText);
  dom.download.addEventListener('click', downloadSelected);
  dom.export.addEventListener('click', downloadBatch);

  dom.queueList.addEventListener('click', (event) => {
    const remove = event.target.closest('.queue-remove');
    if (remove) removeQueueItem(remove.dataset.id);
    else {
      const select = event.target.closest('.queue-select');
      if (select) selectQueueItem(select.dataset.id);
    }
  });

  dom.proofEditor.addEventListener('input', () => {
    const item = selectedItem();
    if (!item || item.status !== 'done') return;
    updateItem(item.id, { text: dom.proofEditor.value });
    dom.characters.textContent = String(dom.proofEditor.value.replace(/\s/g, '').length);
    renderSummary();
  });

  dom.language.addEventListener('change', () => {
    const language = Core.normalizeLanguage(dom.language.value);
    showToast(`下一次识别使用：${language.label}`);
    if (state.workerLanguage && state.workerLanguage !== language.code) terminateWorker();
  });

  ['dragenter', 'dragover'].forEach((type) => {
    dom.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      if (!state.running) dom.dropZone.classList.add('is-over');
    });
  });
  ['dragleave', 'drop'].forEach((type) => {
    dom.dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dom.dropZone.classList.remove('is-over');
    });
  });
  dom.dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

  document.addEventListener('paste', (event) => {
    if (state.running || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    const images = Array.from(event.clipboardData ? event.clipboardData.files : []).filter((file) => file.type.startsWith('image/'));
    if (images.length) {
      event.preventDefault();
      addFiles(images);
    }
  });

  root.addEventListener('beforeunload', () => {
    state.records.forEach((record) => URL.revokeObjectURL(record.url));
    if (state.worker) state.worker.terminate();
  });

  root.Glyph64 = Object.freeze({
    addSample,
    runBatch,
    stopBatch,
    snapshot() {
      return {
        queue: state.queue.map((item) => ({ ...item })),
        selectedId: state.selectedId,
        running: state.running,
      };
    },
  });

  render();
  dom.body.classList.add('ready');
}(window));
