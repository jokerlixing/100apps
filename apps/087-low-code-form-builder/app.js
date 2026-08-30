(() => {
  'use strict';

  const Model = window.FormModel;
  const STORAGE_KEY = 'jig87_schema_v1';
  const HISTORY_LIMIT = 50;
  const MAX_IMPORT_BYTES = 1024 * 1024;

  const elements = {
    partsBin: document.getElementById('partsBin'),
    assemblyList: document.getElementById('assemblyList'),
    emptyAssembly: document.getElementById('emptyAssembly'),
    fieldCount: document.getElementById('fieldCount'),
    inspector: document.getElementById('inspector'),
    formTitle: document.getElementById('formTitle'),
    formDescription: document.getElementById('formDescription'),
    submitLabel: document.getElementById('submitLabel'),
    savedStatus: document.getElementById('savedStatus'),
    buildState: document.querySelector('.build-state'),
    undoButton: document.getElementById('undoButton'),
    redoButton: document.getElementById('redoButton'),
    newButton: document.getElementById('newButton'),
    starterButton: document.getElementById('starterButton'),
    exportJsonButton: document.getElementById('exportJsonButton'),
    exportHtmlButton: document.getElementById('exportHtmlButton'),
    importInput: document.getElementById('importInput'),
    openPreviewButton: document.getElementById('openPreviewButton'),
    closePreviewButton: document.getElementById('closePreviewButton'),
    previewDialog: document.getElementById('previewDialog'),
    previewForm: document.getElementById('previewForm'),
    toast: document.getElementById('toast'),
    liveRegion: document.getElementById('liveRegion'),
  };

  const history = [];
  const future = [];
  let toastTimer = 0;
  let loadWarning = '';
  let schema = loadSchema();
  let selectedId = schema.fields[0]?.id || '';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadSchema() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? Model.deserializeSchema(stored) : Model.createStarterSchema();
    } catch (error) {
      loadWarning = `草稿损坏，已载入安全样例：${error.message}`;
      return Model.createStarterSchema();
    }
  }

  function announce(message) {
    elements.liveRegion.textContent = '';
    window.requestAnimationFrame(() => {
      elements.liveRegion.textContent = message;
    });
  }

  function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('error', isError);
    elements.toast.classList.add('show');
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
  }

  function persist() {
    elements.buildState.classList.add('saving');
    elements.savedStatus.textContent = '正在保存本地草稿…';
    try {
      localStorage.setItem(STORAGE_KEY, Model.serializeSchema(schema));
      elements.savedStatus.textContent = '本地草稿已保存';
    } catch (error) {
      elements.savedStatus.textContent = '浏览器拒绝保存';
      showToast(`无法保存草稿：${error.message}`, true);
    } finally {
      window.setTimeout(() => elements.buildState.classList.remove('saving'), 180);
    }
  }

  function commit(nextSchema, message, nextSelectedId) {
    const cleanNext = Model.sanitizeSchema(nextSchema);
    const currentJson = Model.serializeSchema(schema);
    const nextJson = Model.serializeSchema(cleanNext);
    if (currentJson === nextJson) return false;

    history.push(currentJson);
    if (history.length > HISTORY_LIMIT) history.shift();
    future.length = 0;
    schema = cleanNext;
    if (nextSelectedId !== undefined) selectedId = nextSelectedId;
    if (selectedId && !schema.fields.some((field) => field.id === selectedId)) selectedId = schema.fields[0]?.id || '';
    persist();
    render();
    if (message) {
      announce(message);
      showToast(message);
    }
    return true;
  }

  function restoreSnapshot(stackFrom, stackTo, message) {
    if (!stackFrom.length) return;
    stackTo.push(Model.serializeSchema(schema));
    schema = Model.deserializeSchema(stackFrom.pop());
    if (!schema.fields.some((field) => field.id === selectedId)) selectedId = schema.fields[0]?.id || '';
    persist();
    render();
    announce(message);
  }

  function render() {
    renderMeta();
    renderAssembly();
    renderInspector();
    elements.fieldCount.textContent = String(schema.fields.length);
    elements.undoButton.disabled = history.length === 0;
    elements.redoButton.disabled = future.length === 0;
  }

  function renderMeta() {
    if (document.activeElement !== elements.formTitle) elements.formTitle.value = schema.title;
    if (document.activeElement !== elements.formDescription) elements.formDescription.value = schema.description;
    if (document.activeElement !== elements.submitLabel) elements.submitLabel.value = schema.submitLabel;
  }

  function fieldPreview(field) {
    if (field.type === 'heading') return field.help || '章节分隔线';
    if (field.options) return field.options.join(' · ');
    if (field.type === 'date') return '年 / 月 / 日';
    return field.placeholder || '等待填写';
  }

  function renderAssembly() {
    elements.emptyAssembly.classList.toggle('hidden', schema.fields.length > 0);
    const slots = [];
    schema.fields.forEach((field, index) => {
      slots.push(`<div class="drop-slot" data-drop-index="${index}" aria-hidden="true"></div>`);
      const metadata = Model.FIELD_TYPES[field.type];
      const isSelected = field.id === selectedId;
      slots.push(`
        <article class="field-card${isSelected ? ' selected' : ''}" data-field-id="${escapeHtml(field.id)}" data-field-type="${field.type}" draggable="true" tabindex="0" role="button" aria-pressed="${isSelected}" aria-label="选择字段：${escapeHtml(field.label)}">
          <div class="grab-handle" aria-hidden="true">⠿</div>
          <div class="field-body">
            <div class="field-topline">
              <span class="type-tag">${escapeHtml(metadata.icon)} · ${escapeHtml(metadata.label)}</span>
              <span class="field-label">${escapeHtml(field.label)}</span>
              ${field.required ? '<span class="required-mark" title="必填">*</span>' : ''}
              <span class="width-mark">${field.width === 'half' ? '1/2' : '1/1'}</span>
            </div>
            ${field.help ? `<p class="field-help">${escapeHtml(field.help)}</p>` : ''}
            <div class="field-ghost-control">${escapeHtml(fieldPreview(field))}</div>
          </div>
          <div class="field-actions" aria-label="字段快捷操作">
            <button class="field-action" type="button" data-action="move-up" aria-label="上移${escapeHtml(field.label)}" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="field-action" type="button" data-action="move-down" aria-label="下移${escapeHtml(field.label)}" ${index === schema.fields.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="field-action" type="button" data-action="duplicate" aria-label="复制${escapeHtml(field.label)}">⧉</button>
            <button class="field-action danger" type="button" data-action="delete" aria-label="删除${escapeHtml(field.label)}">×</button>
          </div>
        </article>`);
    });
    slots.push(`<div class="drop-slot" data-drop-index="${schema.fields.length}" aria-hidden="true"></div>`);
    elements.assemblyList.innerHTML = slots.join('');
  }

  function inspectorControl(label, property, value, options = {}) {
    const id = `inspector-${property}`;
    const hint = options.hint ? `<p class="control-hint">${escapeHtml(options.hint)}</p>` : '';
    if (options.kind === 'textarea') {
      return `<div class="control-group${options.className ? ` ${options.className}` : ''}"><label for="${id}">${escapeHtml(label)}</label><textarea id="${id}" data-property="${property}" rows="${options.rows || 3}" maxlength="${options.maxlength || 140}">${escapeHtml(value)}</textarea>${hint}</div>`;
    }
    if (options.kind === 'select') {
      return `<div class="control-group"><label for="${id}">${escapeHtml(label)}</label><select id="${id}" data-property="${property}">${options.choices.map(([choiceValue, choiceLabel]) => `<option value="${escapeHtml(choiceValue)}"${value === choiceValue ? ' selected' : ''}>${escapeHtml(choiceLabel)}</option>`).join('')}</select>${hint}</div>`;
    }
    if (options.kind === 'checkbox') {
      return `<label class="switch-control" for="${id}"><input id="${id}" data-property="${property}" type="checkbox"${value ? ' checked' : ''}><span>${escapeHtml(label)}</span></label>`;
    }
    const type = options.kind === 'number' ? 'number' : 'text';
    const attributes = options.kind === 'number' ? ' step="any"' : ` maxlength="${options.maxlength || 100}"`;
    return `<div class="control-group"><label for="${id}">${escapeHtml(label)}</label><input id="${id}" data-property="${property}" type="${type}" value="${escapeHtml(value ?? '')}"${attributes}>${hint}</div>`;
  }

  function renderInspector() {
    const field = schema.fields.find((candidate) => candidate.id === selectedId);
    if (!field) {
      elements.inspector.innerHTML = '<div class="inspector-empty"><span aria-hidden="true">⌖</span><p>选择装配轨上的字段，在这里调整标签、宽度和校验规则。</p></div>';
      return;
    }

    const metadata = Model.FIELD_TYPES[field.type];
    const controls = [
      `<div class="inspector-ident"><strong>${escapeHtml(metadata.icon)} · ${escapeHtml(metadata.label)}</strong><code>${escapeHtml(field.id)}</code></div>`,
      inspectorControl('字段标签', 'label', field.label, { maxlength: 80 }),
      inspectorControl('辅助说明', 'help', field.help, { kind: 'textarea', rows: 2, maxlength: 140, hint: '说明用途或填写要求，留空则不显示。' }),
    ];

    if (field.type !== 'heading') {
      if (!field.options) controls.push(inspectorControl('占位提示', 'placeholder', field.placeholder, { maxlength: 100 }));
      controls.push(`<div class="control-row">${inspectorControl('设为必填', 'required', field.required, { kind: 'checkbox' })}${inspectorControl('字段宽度', 'width', field.width, { kind: 'select', choices: [['full', '整行 1/1'], ['half', '半行 1/2']] })}</div>`);
    }

    if (field.options) {
      controls.push(inspectorControl('选项（每行一项）', 'options', field.options.join('\n'), { kind: 'textarea', rows: 6, maxlength: 720, className: 'options-control', hint: '自动去空、去重，最多保留 12 项。' }));
    }

    if (field.type === 'number') {
      controls.push(`<div class="control-row">${inspectorControl('最小值', 'min', field.min, { kind: 'number' })}${inspectorControl('最大值', 'max', field.max, { kind: 'number' })}</div>`);
    }

    controls.push('<div class="inspector-tools"><button class="inspector-action" type="button" data-inspector-action="duplicate">复制字段</button><button class="inspector-action danger" type="button" data-inspector-action="delete">删除字段</button></div>');
    elements.inspector.innerHTML = `<div class="inspector-form">${controls.join('')}</div>`;
  }

  function addField(type, index) {
    const beforeIds = new Set(schema.fields.map((field) => field.id));
    const next = Model.addField(schema, type, index);
    const added = next.fields.find((field) => !beforeIds.has(field.id));
    if (!added) {
      showToast('装配轨已达到 60 个字段上限', true);
      return;
    }
    commit(next, `已添加“${added.label}”`, added.id);
    window.requestAnimationFrame(() => document.querySelector(`[data-field-id="${added.id}"]`)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' }));
  }

  function performFieldAction(fieldId, action) {
    const index = schema.fields.findIndex((field) => field.id === fieldId);
    const field = schema.fields[index];
    if (!field) return;
    if (action === 'move-up' && index > 0) commit(Model.moveField(schema, fieldId, index - 1), `已上移“${field.label}”`, fieldId);
    if (action === 'move-down' && index < schema.fields.length - 1) commit(Model.moveField(schema, fieldId, index + 1), `已下移“${field.label}”`, fieldId);
    if (action === 'duplicate') {
      const next = Model.duplicateField(schema, fieldId);
      const duplicate = next.fields[index + 1];
      commit(next, `已复制“${field.label}”`, duplicate?.id || fieldId);
    }
    if (action === 'delete') commit(Model.removeField(schema, fieldId), `已删除“${field.label}”`, schema.fields[index + 1]?.id || schema.fields[index - 1]?.id || '');
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clearDropState() {
    document.querySelectorAll('.drop-slot.active').forEach((slot) => slot.classList.remove('active'));
    document.querySelectorAll('.dragging').forEach((node) => node.classList.remove('dragging'));
  }

  function handleDrop(event, explicitIndex) {
    event.preventDefault();
    const targetIndex = Number.isInteger(explicitIndex) ? explicitIndex : schema.fields.length;
    const partType = event.dataTransfer.getData('application/x-jig-part');
    const fieldId = event.dataTransfer.getData('application/x-jig-field');
    clearDropState();
    if (partType) {
      addField(partType, targetIndex);
      return;
    }
    if (fieldId) {
      const sourceIndex = schema.fields.findIndex((field) => field.id === fieldId);
      if (sourceIndex < 0) return;
      const adjustedIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      if (adjustedIndex === sourceIndex) return;
      const label = schema.fields[sourceIndex].label;
      commit(Model.moveField(schema, fieldId, adjustedIndex), `已重排“${label}”`, fieldId);
    }
  }

  elements.partsBin.addEventListener('click', (event) => {
    const button = event.target.closest('[data-field-type]');
    if (button) addField(button.dataset.fieldType);
  });

  elements.partsBin.addEventListener('dragstart', (event) => {
    const button = event.target.closest('[data-field-type]');
    if (!button) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-jig-part', button.dataset.fieldType);
    event.dataTransfer.setData('text/plain', button.dataset.fieldType);
    button.classList.add('dragging');
  });

  elements.partsBin.addEventListener('dragend', clearDropState);

  elements.assemblyList.addEventListener('click', (event) => {
    const card = event.target.closest('[data-field-id]');
    if (!card) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action) performFieldAction(card.dataset.fieldId, action);
    else {
      selectedId = card.dataset.fieldId;
      renderAssembly();
      renderInspector();
      announce(`已选择“${schema.fields.find((field) => field.id === selectedId)?.label || '字段'}”`);
    }
  });

  elements.assemblyList.addEventListener('keydown', (event) => {
    if (event.target.matches('[data-field-id]') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selectedId = event.target.dataset.fieldId;
      renderAssembly();
      renderInspector();
    }
  });

  elements.assemblyList.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-field-id]');
    if (!card) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-jig-field', card.dataset.fieldId);
    event.dataTransfer.setData('text/plain', card.dataset.fieldId);
    card.classList.add('dragging');
  });

  elements.assemblyList.addEventListener('dragend', clearDropState);

  elements.assemblyList.addEventListener('dragover', (event) => {
    const slot = event.target.closest('[data-drop-index]');
    if (!slot) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes('application/x-jig-part') ? 'copy' : 'move';
    document.querySelectorAll('.drop-slot.active').forEach((candidate) => candidate.classList.toggle('active', candidate === slot));
  });

  elements.assemblyList.addEventListener('drop', (event) => {
    const slot = event.target.closest('[data-drop-index]');
    if (slot) handleDrop(event, Number(slot.dataset.dropIndex));
  });

  elements.emptyAssembly.addEventListener('dragover', (event) => event.preventDefault());
  elements.emptyAssembly.addEventListener('drop', (event) => handleDrop(event, 0));

  elements.inspector.addEventListener('change', (event) => {
    const property = event.target.dataset.property;
    if (!property || !selectedId) return;
    let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    if (property === 'options') value = Model.parseOptions(value);
    if ((property === 'min' || property === 'max') && value === '') value = null;
    const current = schema.fields.find((field) => field.id === selectedId);
    commit(Model.updateField(schema, selectedId, { [property]: value }), `已校准“${current.label}”`, selectedId);
  });

  elements.inspector.addEventListener('click', (event) => {
    const action = event.target.closest('[data-inspector-action]')?.dataset.inspectorAction;
    if (action && selectedId) performFieldAction(selectedId, action);
  });

  function updateMeta(property, value, message) {
    commit({ ...schema, [property]: value }, message, selectedId);
  }

  elements.formTitle.addEventListener('change', () => updateMeta('title', elements.formTitle.value, '已更新表单标题'));
  elements.formDescription.addEventListener('change', () => updateMeta('description', elements.formDescription.value, '已更新表单说明'));
  elements.submitLabel.addEventListener('change', () => updateMeta('submitLabel', elements.submitLabel.value, '已更新提交按钮'));

  elements.undoButton.addEventListener('click', () => restoreSnapshot(history, future, '已撤销上一步'));
  elements.redoButton.addEventListener('click', () => restoreSnapshot(future, history, '已重做上一步'));

  elements.newButton.addEventListener('click', () => {
    if (!window.confirm('新建空白表单？当前草稿仍可通过一次“撤销”恢复。')) return;
    commit({ version: 1, title: '未命名表单', description: '', submitLabel: '提交表单', fields: [] }, '已新建空白表单', '');
  });

  elements.starterButton.addEventListener('click', () => {
    if (!window.confirm('载入开放日样例？当前草稿仍可通过一次“撤销”恢复。')) return;
    const starter = Model.createStarterSchema();
    commit(starter, '已载入开放日样例', starter.fields[0]?.id || '');
  });

  function downloadBlob(content, mimeType, fileName) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  elements.exportJsonButton.addEventListener('click', () => {
    downloadBlob(Model.serializeSchema(schema), 'application/json;charset=utf-8', `${Model.safeFileName(schema.title)}.json`);
    showToast('表单 JSON 已导出');
    announce('表单 JSON 已导出');
  });

  elements.exportHtmlButton.addEventListener('click', () => {
    downloadBlob(Model.generateStandaloneHtml(schema), 'text/html;charset=utf-8', `${Model.safeFileName(schema.title)}.html`);
    showToast('独立 HTML 已导出');
    announce('独立 HTML 已导出');
  });

  elements.importInput.addEventListener('change', async () => {
    const [file] = elements.importInput.files;
    elements.importInput.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showToast('JSON 文件超过 1 MB，未导入', true);
      return;
    }
    try {
      const imported = Model.deserializeSchema(await file.text());
      commit(imported, `已导入“${imported.title}”`, imported.fields[0]?.id || '');
    } catch (error) {
      showToast(error.message, true);
      announce('导入失败，请检查 JSON 文件');
    }
  });

  function previewInput(field) {
    const label = `<span class="preview-label">${escapeHtml(field.label)}${field.required ? ' <b aria-hidden="true">*</b>' : ''}</span>`;
    const help = field.help ? `<span class="preview-help">${escapeHtml(field.help)}</span>` : '';
    const error = `<p class="preview-error" id="preview-error-${field.id}" data-preview-error="${field.id}"></p>`;
    if (field.type === 'heading') return `<section class="preview-section"><h3>${escapeHtml(field.label)}</h3>${field.help ? `<p>${escapeHtml(field.help)}</p>` : ''}</section>`;

    const common = `id="preview-${field.id}" name="${field.id}"${field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : ''}`;
    let control = '';
    if (field.type === 'textarea') control = `<textarea ${common} rows="5" aria-describedby="preview-error-${field.id}"></textarea>`;
    else if (field.type === 'select') control = `<select ${common} aria-describedby="preview-error-${field.id}"><option value="">请选择</option>${field.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}</select>`;
    else if (field.type === 'radio' || field.type === 'checkbox') {
      control = `<span class="preview-choices">${field.options.map((option, index) => `<label class="preview-choice" for="preview-${field.id}-${index}"><input id="preview-${field.id}-${index}" type="${field.type}" name="${field.id}" value="${escapeHtml(option)}" aria-describedby="preview-error-${field.id}"><span>${escapeHtml(option)}</span></label>`).join('')}</span>`;
    } else {
      const bounds = field.type === 'number' ? `${field.min !== null ? ` min="${field.min}"` : ''}${field.max !== null ? ` max="${field.max}"` : ''}` : '';
      control = `<input type="${field.type}" ${common}${bounds} aria-describedby="preview-error-${field.id}">`;
    }
    return `<label class="preview-field${field.width === 'half' ? ' half' : ''}" for="preview-${field.id}">${label}${control}${help}${error}</label>`;
  }

  function openPreview() {
    const fields = schema.fields.length
      ? schema.fields.map(previewInput).join('')
      : '<div class="preview-summary">表单还没有字段。关闭预览并从零件仓添加一个字段。</div>';
    elements.previewForm.innerHTML = `
      <h1 class="preview-title">${escapeHtml(schema.title)}</h1>
      ${schema.description ? `<p class="preview-description">${escapeHtml(schema.description)}</p>` : ''}
      <div class="preview-fields">
        <div class="preview-summary" id="previewSummary" role="alert"></div>
        ${fields}
        ${schema.fields.length ? `<button class="preview-submit" type="submit">${escapeHtml(schema.submitLabel)}</button>` : ''}
        <section class="preview-receipt" id="previewReceipt" hidden aria-live="polite"></section>
      </div>`;
    elements.previewDialog.showModal();
  }

  function collectPreviewValues() {
    const formData = new FormData(elements.previewForm);
    const values = {};
    schema.fields.forEach((field) => {
      if (field.type === 'heading') return;
      values[field.id] = field.type === 'checkbox' ? formData.getAll(field.id) : formData.get(field.id);
    });
    return values;
  }

  elements.previewForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = Model.validateSubmission(schema, collectPreviewValues());
    elements.previewForm.querySelectorAll('[data-preview-error]').forEach((node) => { node.textContent = ''; });
    elements.previewForm.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
    const summary = document.getElementById('previewSummary');
    const receipt = document.getElementById('previewReceipt');
    receipt.hidden = true;

    if (!result.valid) {
      Object.entries(result.errors).forEach(([id, message]) => {
        const errorNode = document.getElementById(`preview-error-${id}`);
        if (errorNode) errorNode.textContent = message;
        const input = document.getElementById(`preview-${id}`) || document.getElementById(`preview-${id}-0`);
        input?.setAttribute('aria-invalid', 'true');
      });
      summary.textContent = `有 ${Object.keys(result.errors).length} 项需要检查，请按字段提示修正。`;
      const firstId = Object.keys(result.errors)[0];
      (document.getElementById(`preview-${firstId}`) || document.getElementById(`preview-${firstId}-0`))?.focus();
      announce('试填校验未通过');
      return;
    }

    summary.textContent = '';
    const rows = schema.fields
      .filter((field) => field.type !== 'heading')
      .map((field) => `<dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(Array.isArray(result.data[field.id]) ? result.data[field.id].join('、') || '—' : result.data[field.id] ?? '—')}</dd>`)
      .join('');
    receipt.innerHTML = `<h3>试填通过</h3><p>这是本地回执，不会把数据发送到服务器。</p><dl>${rows}</dl>`;
    receipt.hidden = false;
    receipt.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    announce('试填通过，已生成本地回执');
  });

  elements.openPreviewButton.addEventListener('click', openPreview);
  elements.closePreviewButton.addEventListener('click', () => elements.previewDialog.close());
  elements.previewDialog.addEventListener('click', (event) => {
    if (event.target === elements.previewDialog) elements.previewDialog.close();
  });

  document.addEventListener('keydown', (event) => {
    const command = event.ctrlKey || event.metaKey;
    if (!command) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      restoreSnapshot(history, future, '已撤销上一步');
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      restoreSnapshot(future, history, '已重做上一步');
    } else if (key === 'p') {
      event.preventDefault();
      if (!elements.previewDialog.open) openPreview();
    }
  });

  render();
  if (loadWarning) window.setTimeout(() => showToast(loadWarning, true), 100);
})();
