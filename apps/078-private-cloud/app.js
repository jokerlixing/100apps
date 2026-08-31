(function startDepotApp() {
  'use strict';

  const Core = globalThis.DepotCore;
  const Storage = globalThis.DepotStorage;
  const params = new URLSearchParams(location.search);
  const requestedLimit = Number(params.get('quota'));
  const limitBytes = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : Core.LIMIT_BYTES;
  const kindColors = { document: '#2d6860', image: '#c9503d', media: '#d3a62b', other: '#7d6f88' };
  const kindCodes = { document: 'DOC', image: 'IMG', media: 'AV', other: 'FILE' };
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

  const state = {
    files: [],
    folders: [],
    view: 'all',
    folderId: null,
    query: '',
    kind: '',
    sort: 'newest',
    selectedId: null,
    newId: null,
    previewUrl: null,
    previewRequest: 0,
    confirmAction: null,
    busy: false,
    limitBytes,
  };

  const refs = {};
  let toastTimer;

  function byId(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cacheRefs() {
    [
      'storage-status', 'upload-button', 'file-input', 'folder-list', 'new-folder-button',
      'capacity-fill', 'usage-percent', 'usage-total', 'usage-limit', 'usage-key',
      'drop-zone', 'search-input', 'kind-filter', 'sort-filter', 'record-count',
      'file-list', 'empty-state', 'detail-dialog', 'detail-close', 'no-selection',
      'file-detail', 'detail-number', 'detail-seal', 'detail-title', 'detail-meta',
      'preview-stage', 'detail-folder', 'detail-date', 'detail-share', 'folder-move',
      'move-folder', 'move-button', 'active-actions', 'trash-actions', 'download-button',
      'share-button', 'trash-button', 'restore-button', 'destroy-button',
      'mobile-detail-button', 'folder-dialog', 'folder-form', 'folder-name',
      'folder-close-button', 'folder-cancel-button',
      'share-dialog', 'share-days', 'share-result', 'share-link', 'share-token',
      'create-share-button', 'copy-share-button', 'revoke-share-button',
      'confirm-dialog', 'confirm-title', 'confirm-copy', 'confirm-button',
      'toast', 'live-region',
    ].forEach((id) => { refs[id] = byId(id); });
  }

  function makeId(prefix) {
    if (globalThis.crypto && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function folderName(folderId) {
    if (!folderId || folderId === 'root') return '总库 / 未分类';
    const folder = state.folders.find((item) => item.id === folderId);
    return folder ? folder.name : '已移除资料夹';
  }

  function shortCode(file) {
    let hash = 0;
    for (const character of String(file.id || file.name)) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return `DEP-${String(Math.abs(hash) % 10000).padStart(4, '0')}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '—' : dateFormatter.format(date).replace('/', '-');
  }

  function toast(message) {
    refs.toast.textContent = message;
    refs['live-region'].textContent = message;
    refs.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => refs.toast.classList.remove('is-visible'), 2600);
  }

  function setBusy(value) {
    state.busy = value;
    document.body.classList.toggle('is-busy', value);
    refs['upload-button'].disabled = value;
  }

  async function runBusy(operation) {
    if (state.busy) return;
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      console.error(error);
      toast(error && error.message || '操作未完成，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function refresh(options) {
    const requestedSelection = options && options.selectId;
    const [files, folders] = await Promise.all([Storage.listFiles(), Storage.listFolders()]);
    state.files = files;
    state.folders = folders.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
    if (requestedSelection) state.selectedId = requestedSelection;
    if (state.selectedId && !state.files.some((file) => file.id === state.selectedId)) state.selectedId = null;
    render();
  }

  function currentFiles() {
    return Core.filterAndSort(state.files, {
      view: state.view,
      folderId: state.folderId,
      query: state.query,
      kind: state.kind,
      sort: state.sort,
    });
  }

  function renderNavigation() {
    const counts = {
      all: Core.filterAndSort(state.files, { view: 'all' }).length,
      recent: Core.filterAndSort(state.files, { view: 'recent' }).length,
      shared: Core.filterAndSort(state.files, { view: 'shared' }).length,
      trash: Core.filterAndSort(state.files, { view: 'trash' }).length,
    };
    document.querySelectorAll('[data-count]').forEach((node) => { node.textContent = counts[node.dataset.count] || 0; });
    document.querySelectorAll('.nav-button').forEach((button) => {
      button.classList.toggle('is-active', state.view === button.dataset.view);
      button.setAttribute('aria-current', state.view === button.dataset.view ? 'page' : 'false');
    });
    refs['folder-list'].innerHTML = state.folders.map((folder) => {
      const count = state.files.filter((file) => !file.deletedAt && file.folderId === folder.id).length;
      const active = state.view === 'folder' && state.folderId === folder.id;
      return `<div class="folder-row">
        <button class="folder-button${active ? ' is-active' : ''}" data-folder-id="${escapeHtml(folder.id)}" type="button" aria-current="${active ? 'page' : 'false'}"><span>${escapeHtml(folder.name)}</span><b>${count}</b></button>
        <button class="folder-delete-button" data-delete-folder-id="${escapeHtml(folder.id)}" type="button" aria-label="删除资料夹 ${escapeHtml(folder.name)}" title="删除资料夹">×</button>
      </div>`;
    }).join('');
  }

  function renderUsage() {
    const usage = Core.buildUsage(state.files, state.limitBytes);
    refs['usage-percent'].textContent = `${usage.percent}%`;
    refs['usage-total'].textContent = Core.formatBytes(usage.total);
    refs['usage-limit'].textContent = Core.formatBytes(usage.limit);
    refs['capacity-fill'].style.height = `${usage.percent}%`;
    refs['capacity-fill'].setAttribute('title', `已使用 ${usage.percent}%`);
    for (const [kind, bytes] of Object.entries(usage.byKind)) {
      const segment = refs['capacity-fill'].querySelector(`[data-kind="${kind}"]`);
      segment.style.height = `${usage.total ? (bytes / usage.total) * 100 : 0}%`;
    }
    refs['usage-key'].innerHTML = Object.entries(usage.byKind).map(([kind, bytes]) =>
      `<li><span><i style="--swatch:${kindColors[kind]}"></i>${Core.KIND_LABELS[kind]}</span><b>${Core.formatBytes(bytes)}</b></li>`
    ).join('');
  }

  function renderRows() {
    const visible = currentFiles();
    refs['record-count'].textContent = `${visible.length} 份记录`;
    refs['empty-state'].hidden = visible.length > 0;
    refs['file-list'].innerHTML = visible.map((file) => {
      const selected = file.id === state.selectedId;
      const shared = Core.shareIsActive(file.share);
      const status = file.deletedAt ? ['回收中', 'trashed'] : shared ? ['已借出', 'shared'] : ['在库', ''];
      return `<tr class="file-row${selected ? ' is-selected' : ''}${file.id === state.newId ? ' is-new' : ''}" data-file-id="${escapeHtml(file.id)}">
        <td><button class="file-name-button" data-action="select" type="button" aria-label="查看 ${escapeHtml(file.name)}">
          <span class="file-code" style="--kind-color:${kindColors[file.kind] || kindColors.other}">${kindCodes[file.kind] || 'FILE'}</span>
          <span class="file-name"><strong>${escapeHtml(file.name)}</strong><small>${shortCode(file)}</small></span>
        </button></td>
        <td class="folder-cell">${escapeHtml(folderName(file.folderId))}</td>
        <td class="size-cell">${Core.formatBytes(file.size)}</td>
        <td class="date-cell">${formatDate(file.createdAt)}</td>
        <td><span class="status-stamp ${status[1]}">${status[0]}</span></td>
      </tr>`;
    }).join('');
    state.newId = null;
  }

  function cleanupPreview() {
    state.previewRequest += 1;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }

  async function renderPreview(file) {
    cleanupPreview();
    const request = state.previewRequest;
    refs['preview-stage'].replaceChildren();
    if (!file || !file.blob) return;
    const name = file.name.toLowerCase();
    if (file.kind === 'image') {
      state.previewUrl = URL.createObjectURL(file.blob);
      const image = new Image();
      image.alt = `${file.name} 预览`;
      image.src = state.previewUrl;
      refs['preview-stage'].append(image);
      return;
    }
    if (file.kind === 'media') {
      state.previewUrl = URL.createObjectURL(file.blob);
      const element = file.type.startsWith('video/') ? document.createElement('video') : document.createElement('audio');
      element.controls = true;
      element.preload = 'metadata';
      element.src = state.previewUrl;
      refs['preview-stage'].append(element);
      return;
    }
    if (file.type.startsWith('text/') || /\.(csv|json|md|txt|xml|ya?ml)$/.test(name)) {
      const text = (await file.blob.slice(0, 65_536).text()).slice(0, 12_000);
      if (request !== state.previewRequest || state.selectedId !== file.id) return;
      const pre = document.createElement('pre');
      pre.textContent = text || '空白文本';
      refs['preview-stage'].append(pre);
      return;
    }
    const fallback = document.createElement('div');
    fallback.className = 'preview-fallback';
    const title = document.createElement('strong');
    title.textContent = kindCodes[file.kind] || 'FILE';
    const copy = document.createElement('span');
    copy.textContent = '此格式不提供内嵌预览，可下载后用本机应用打开。';
    fallback.append(title, copy);
    refs['preview-stage'].append(fallback);
  }

  function renderDetail() {
    const file = state.files.find((item) => item.id === state.selectedId);
    refs['no-selection'].hidden = Boolean(file);
    refs['file-detail'].hidden = !file;
    refs['mobile-detail-button'].hidden = !file || innerWidth > 960;
    if (!file) {
      cleanupPreview();
      return;
    }
    refs['detail-number'].textContent = shortCode(file);
    refs['detail-seal'].textContent = kindCodes[file.kind] || 'FILE';
    refs['detail-seal'].style.setProperty('--kind-color', kindColors[file.kind] || kindColors.other);
    refs['detail-title'].textContent = file.name;
    refs['detail-meta'].textContent = `${Core.KIND_LABELS[file.kind] || '其他'} · ${Core.formatBytes(file.size)} · ${file.type || '未知格式'}`;
    refs['detail-folder'].textContent = folderName(file.folderId);
    refs['detail-date'].textContent = formatDate(file.createdAt);
    refs['detail-share'].textContent = Core.shareIsActive(file.share)
      ? `${file.share.token} · ${file.share.expiresAt ? `${formatDate(file.share.expiresAt)} 到期` : '长期有效'}`
      : '未分享';
    refs['move-folder'].innerHTML = `<option value="root">总库 / 未分类</option>${state.folders.map((folder) => `<option value="${escapeHtml(folder.id)}">${escapeHtml(folder.name)}</option>`).join('')}`;
    refs['move-folder'].value = file.folderId || 'root';
    refs['folder-move'].hidden = Boolean(file.deletedAt);
    refs['active-actions'].hidden = Boolean(file.deletedAt);
    refs['trash-actions'].hidden = !file.deletedAt;
    renderPreview(file).catch((error) => {
      console.error(error);
      refs['preview-stage'].innerHTML = '<div class="preview-fallback"><strong>NO PREVIEW</strong><span>预览读取失败，原文件仍可下载。</span></div>';
    });
  }

  function render() {
    renderNavigation();
    renderUsage();
    renderRows();
    renderDetail();
  }

  function selectFile(id, openOnMobile) {
    state.selectedId = id;
    renderRows();
    renderDetail();
    if (openOnMobile && innerWidth <= 960 && !refs['detail-dialog'].open) refs['detail-dialog'].showModal();
  }

  async function uploadFiles(fileList) {
    const inputs = Array.from(fileList || []);
    if (!inputs.length) return;
    const folderId = state.view === 'folder' && state.folderId ? state.folderId : 'root';
    const result = Core.validateBatch(inputs, state.files, { folderId, limitBytes: state.limitBytes });
    const now = new Date().toISOString();
    const records = result.accepted.map((accepted) => ({
      id: makeId('file'),
      name: accepted.name,
      originalName: accepted.originalName,
      size: accepted.size,
      type: accepted.type,
      kind: accepted.kind,
      folderId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      share: null,
      blob: accepted.file,
    }));
    if (records.length) await Storage.putFiles(records);
    const firstId = records[0] && records[0].id;
    state.newId = firstId;
    await refresh({ selectId: firstId || state.selectedId });
    const messages = [];
    if (records.length) messages.push(`${records.length} 份资料已入库`);
    if (result.rejected.length) messages.push(`${result.rejected.length} 份未入库：${result.rejected[0].message}`);
    toast(messages.join('；'));
  }

  function openUpload() { refs['file-input'].click(); }

  async function createFolder(name) {
    const cleanName = Core.safeName(name).slice(0, 40);
    if (state.folders.some((folder) => folder.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      throw new Error('已有同名资料夹');
    }
    const folder = { id: makeId('folder'), name: cleanName, createdAt: new Date().toISOString() };
    await Storage.putFolder(folder);
    await refresh();
    state.view = 'folder';
    state.folderId = folder.id;
    render();
    toast(`资料夹“${cleanName}”已建立`);
  }

  function requestFolderDeletion(folderId) {
    const folder = state.folders.find((item) => item.id === folderId);
    if (!folder) return;
    const affectedCount = state.files.filter((file) => file.folderId === folder.id).length;
    const copy = affectedCount
      ? `“${folder.name}”内的 ${affectedCount} 份资料将移回总库，文件内容和回收状态都会保留。`
      : `“${folder.name}”是空资料夹，删除后无法恢复。`;
    openConfirm(`删除资料夹“${folder.name}”？`, copy, async () => {
      await Storage.deleteFolder(folder.id);
      if (state.view === 'folder' && state.folderId === folder.id) {
        state.view = 'all';
        state.folderId = null;
      }
      await refresh({ selectId: state.selectedId });
      toast(affectedCount ? `资料夹已删除，${affectedCount} 份资料已移回总库` : '空资料夹已删除');
    }, '删除资料夹');
  }

  async function updateSelected(mutator, message) {
    const file = state.files.find((item) => item.id === state.selectedId);
    if (!file) return;
    const updated = { ...file, ...mutator(file), updatedAt: new Date().toISOString() };
    await Storage.putFile(updated);
    await refresh({ selectId: updated.id });
    if (message) toast(message);
  }

  function downloadSelected() {
    const file = state.files.find((item) => item.id === state.selectedId);
    if (!file || !file.blob) return;
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`已交给浏览器下载：${file.name}`);
  }

  function shareUrl(token) {
    return `${location.href.split('#')[0]}#share=${encodeURIComponent(token)}`;
  }

  function showShareResult(file) {
    const active = file && Core.shareIsActive(file.share);
    refs['share-result'].hidden = !active;
    refs['copy-share-button'].hidden = !active;
    refs['revoke-share-button'].hidden = !active;
    refs['create-share-button'].textContent = active ? '重新生成' : '生成口令';
    if (active) {
      refs['share-link'].value = shareUrl(file.share.token);
      refs['share-token'].textContent = file.share.token;
    }
  }

  function openShareDialog() {
    const file = state.files.find((item) => item.id === state.selectedId);
    if (!file) return;
    showShareResult(file);
    refs['share-dialog'].showModal();
  }

  async function createShare() {
    const days = Number(refs['share-days'].value);
    await updateSelected((file) => ({ share: Core.createShare(file, { days }) }));
    const updated = state.files.find((item) => item.id === state.selectedId);
    showShareResult(updated);
    toast('本地分享口令已生成');
  }

  async function revokeShare() {
    await updateSelected(() => ({ share: null }), '分享口令已撤销');
    showShareResult(state.files.find((item) => item.id === state.selectedId));
  }

  async function copyShare() {
    const value = refs['share-link'].value;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      refs['share-link'].select();
      document.execCommand('copy');
    }
    toast('分享链接已复制');
  }

  function openConfirm(title, copy, action, buttonLabel) {
    refs['confirm-title'].textContent = title;
    refs['confirm-copy'].textContent = copy;
    refs['confirm-button'].textContent = buttonLabel || '确认';
    state.confirmAction = action;
    refs['confirm-dialog'].showModal();
  }

  function bindEvents() {
    refs['upload-button'].addEventListener('click', openUpload);
    refs['file-input'].addEventListener('change', () => runBusy(async () => {
      await uploadFiles(refs['file-input'].files);
      refs['file-input'].value = '';
    }));
    refs['drop-zone'].addEventListener('click', openUpload);
    refs['drop-zone'].addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openUpload(); }
    });
    ['dragenter', 'dragover'].forEach((type) => refs['drop-zone'].addEventListener(type, (event) => {
      event.preventDefault();
      refs['drop-zone'].classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach((type) => refs['drop-zone'].addEventListener(type, (event) => {
      event.preventDefault();
      refs['drop-zone'].classList.remove('is-dragging');
    }));
    refs['drop-zone'].addEventListener('drop', (event) => runBusy(() => uploadFiles(event.dataTransfer.files)));

    document.querySelector('.archive-nav').addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      state.view = button.dataset.view;
      state.folderId = null;
      state.selectedId = null;
      render();
    });
    refs['folder-list'].addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-delete-folder-id]');
      if (deleteButton) {
        requestFolderDeletion(deleteButton.dataset.deleteFolderId);
        return;
      }
      const button = event.target.closest('[data-folder-id]');
      if (!button) return;
      state.view = 'folder';
      state.folderId = button.dataset.folderId;
      state.selectedId = null;
      render();
    });
    refs['search-input'].addEventListener('input', () => { state.query = refs['search-input'].value; renderRows(); });
    refs['kind-filter'].addEventListener('change', () => { state.kind = refs['kind-filter'].value; renderRows(); });
    refs['sort-filter'].addEventListener('change', () => { state.sort = refs['sort-filter'].value; renderRows(); });
    refs['file-list'].addEventListener('click', (event) => {
      const row = event.target.closest('[data-file-id]');
      if (row) selectFile(row.dataset.fileId, true);
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="open-upload"]')) openUpload();
    });

    refs['new-folder-button'].addEventListener('click', () => {
      refs['folder-name'].value = '';
      refs['folder-dialog'].showModal();
      setTimeout(() => refs['folder-name'].focus(), 0);
    });
    const closeFolderDialog = () => refs['folder-dialog'].close('cancel');
    refs['folder-close-button'].addEventListener('click', closeFolderDialog);
    refs['folder-cancel-button'].addEventListener('click', closeFolderDialog);
    refs['folder-form'].addEventListener('submit', (event) => {
      event.preventDefault();
      const name = refs['folder-name'].value.trim();
      if (!name) return;
      refs['folder-dialog'].close();
      runBusy(() => createFolder(name));
    });

    refs['download-button'].addEventListener('click', downloadSelected);
    refs['share-button'].addEventListener('click', openShareDialog);
    refs['create-share-button'].addEventListener('click', () => runBusy(createShare));
    refs['revoke-share-button'].addEventListener('click', () => runBusy(revokeShare));
    refs['copy-share-button'].addEventListener('click', copyShare);
    refs['move-button'].addEventListener('click', () => runBusy(async () => {
      const target = refs['move-folder'].value;
      await updateSelected(() => ({ folderId: target }), `已归档到“${folderName(target)}”`);
    }));
    refs['trash-button'].addEventListener('click', () => runBusy(() => updateSelected(() => ({ deletedAt: new Date().toISOString(), share: null }), '资料已移入回收站')));
    refs['restore-button'].addEventListener('click', () => runBusy(async () => {
      const selected = state.files.find((item) => item.id === state.selectedId);
      const activeNames = state.files.filter((item) => !item.deletedAt && item.folderId === selected.folderId).map((item) => item.name);
      const restoredName = Core.uniqueName(selected.name, activeNames);
      await updateSelected(() => ({ deletedAt: null, name: restoredName }), '资料已恢复');
    }));
    refs['destroy-button'].addEventListener('click', () => {
      const file = state.files.find((item) => item.id === state.selectedId);
      if (!file) return;
      openConfirm('永久删除这份资料？', `“${file.name}”及其本地内容将立即销毁，无法恢复。`, async () => {
        cleanupPreview();
        await Storage.deleteFile(file.id);
        state.selectedId = null;
        await refresh();
        toast('资料已永久删除，容量已释放');
      }, '永久删除');
    });
    refs['confirm-dialog'].addEventListener('close', () => {
      if (refs['confirm-dialog'].returnValue !== 'default' || !state.confirmAction) { state.confirmAction = null; return; }
      const action = state.confirmAction;
      state.confirmAction = null;
      runBusy(action);
    });

    refs['detail-close'].addEventListener('click', () => refs['detail-dialog'].close());
    refs['mobile-detail-button'].addEventListener('click', () => {
      if (!refs['detail-dialog'].open) refs['detail-dialog'].showModal();
    });
    addEventListener('resize', syncDetailMode);
    addEventListener('hashchange', openHashShare);
    addEventListener('beforeunload', cleanupPreview);
  }

  function syncDetailMode() {
    if (innerWidth > 960) {
      if (!refs['detail-dialog'].open) refs['detail-dialog'].setAttribute('open', '');
    } else if (refs['detail-dialog'].open && !refs['detail-dialog'].matches(':modal')) {
      refs['detail-dialog'].close();
    }
    refs['mobile-detail-button'].hidden = !state.selectedId || innerWidth > 960;
  }

  function openHashShare() {
    const match = location.hash.match(/^#share=([^&]+)/);
    if (!match) return;
    const token = decodeURIComponent(match[1]);
    const file = state.files.find((item) => item.share && item.share.token === token && Core.shareIsActive(item.share));
    if (!file) {
      toast('此浏览器中没有对应资料，或分享口令已过期');
      return;
    }
    state.view = 'shared';
    state.folderId = null;
    selectFile(file.id, true);
    toast(`已凭本地口令找到：${file.name}`);
  }

  async function init() {
    cacheRefs();
    bindEvents();
    syncDetailMode();
    refs['usage-limit'].textContent = Core.formatBytes(state.limitBytes);
    try {
      await Storage.open();
      await Storage.seed();
      await refresh();
      refs['storage-status'].textContent = '本机库房已就绪';
      openHashShare();
    } catch (error) {
      console.error(error);
      refs['storage-status'].textContent = '资料库不可用';
      toast(error && error.message || '浏览器未能开启本地资料库');
    } finally {
      document.body.classList.add('ready');
    }
  }

  globalThis.__DEPOT78__ = Object.freeze({
    getState: () => ({ ...state, files: state.files.slice(), folders: state.folders.slice() }),
    uploadFiles,
    refresh,
    clearAll: Storage.clearAll,
  });

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
