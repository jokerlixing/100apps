(function attachDepotStorage(root) {
  'use strict';

  const query = typeof location === 'object' ? new URLSearchParams(location.search) : new URLSearchParams();
  const DB_NAME = query.get('db') || 'depot78-archive-v1';
  const DB_VERSION = 1;
  let databasePromise;

  function storageError(error, fallback) {
    const wrapped = new Error(fallback || '本地资料库暂时不可用');
    wrapped.code = error && error.name || 'STORAGE_ERROR';
    wrapped.cause = error;
    return wrapped;
  }

  function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(storageError(request.error));
    });
  }

  function open() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('files')) {
          const files = db.createObjectStore('files', { keyPath: 'id' });
          files.createIndex('folderId', 'folderId', { unique: false });
          files.createIndex('deletedAt', 'deletedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(storageError(request.error));
      };
      request.onblocked = () => reject(storageError(null, '请关闭其他 DEPOT/78 页面后重试'));
    });
    return databasePromise;
  }

  async function useStore(storeNames, mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let result;
      const transaction = db.transaction(storeNames, mode);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(storageError(transaction.error));
      transaction.onabort = () => reject(storageError(transaction.error, '资料写入被浏览器中止'));
      try {
        result = operation(transaction);
      } catch (error) {
        transaction.abort();
        reject(storageError(error));
      }
    });
  }

  async function listFiles() {
    const db = await open();
    return requestAsPromise(db.transaction('files', 'readonly').objectStore('files').getAll());
  }

  async function getFile(id) {
    const db = await open();
    return requestAsPromise(db.transaction('files', 'readonly').objectStore('files').get(id));
  }

  function putFile(file) {
    return useStore(['files'], 'readwrite', (transaction) => transaction.objectStore('files').put(file));
  }

  function putFiles(files) {
    return useStore(['files'], 'readwrite', (transaction) => {
      const store = transaction.objectStore('files');
      files.forEach((file) => store.put(file));
      return files.length;
    });
  }

  function deleteFile(id) {
    return useStore(['files'], 'readwrite', (transaction) => transaction.objectStore('files').delete(id));
  }

  async function listFolders() {
    const db = await open();
    return requestAsPromise(db.transaction('folders', 'readonly').objectStore('folders').getAll());
  }

  function putFolder(folder) {
    return useStore(['folders'], 'readwrite', (transaction) => transaction.objectStore('folders').put(folder));
  }

  async function getSetting(key) {
    const db = await open();
    const record = await requestAsPromise(db.transaction('settings', 'readonly').objectStore('settings').get(key));
    return record ? record.value : undefined;
  }

  function setSetting(key, value) {
    return useStore(['settings'], 'readwrite', (transaction) => transaction.objectStore('settings').put({ key, value }));
  }

  async function seed() {
    if (await getSetting('seeded')) return false;
    const now = Date.now();
    const folders = [
      { id: 'folder-family', name: '家庭凭证', createdAt: new Date(now - 86_400_000).toISOString() },
      { id: 'folder-studio', name: '工作手册', createdAt: new Date(now - 43_200_000).toISOString() },
    ];
    const samples = [
      {
        id: 'seed-readme',
        name: '入库须知.txt',
        content: 'DEPOT/78 是当前浏览器里的私人资料库。\n\n文件不会上传到第三方；分享链接只在保存了同一份资料的浏览器中有效。\n删除文件后请清空回收站，才能真正释放逻辑配额。',
        folderId: 'root',
        createdAt: new Date(now - 7_200_000).toISOString(),
      },
      {
        id: 'seed-checklist',
        name: '证件更新清单.md',
        content: '# 证件更新清单\n\n- 核对有效期\n- 扫描正反面\n- 将旧版本移入回收站\n- 更新分享口令',
        folderId: 'folder-family',
        createdAt: new Date(now - 3_600_000).toISOString(),
      },
      {
        id: 'seed-notes',
        name: '项目交接说明.txt',
        content: '交接资料应包含：范围、当前状态、待确认事项与下一步负责人。\n\n对外分享前检查是否包含个人信息。',
        folderId: 'folder-studio',
        createdAt: new Date(now - 1_800_000).toISOString(),
      },
    ].map((sample) => {
      const blob = new Blob([sample.content], { type: 'text/plain;charset=utf-8' });
      return {
        id: sample.id,
        name: sample.name,
        originalName: sample.name,
        size: blob.size,
        type: blob.type,
        kind: 'document',
        folderId: sample.folderId,
        createdAt: sample.createdAt,
        updatedAt: sample.createdAt,
        deletedAt: null,
        share: null,
        blob,
      };
    });

    await useStore(['files', 'folders', 'settings'], 'readwrite', (transaction) => {
      const fileStore = transaction.objectStore('files');
      const folderStore = transaction.objectStore('folders');
      samples.forEach((file) => fileStore.put(file));
      folders.forEach((folder) => folderStore.put(folder));
      transaction.objectStore('settings').put({ key: 'seeded', value: true });
    });
    return true;
  }

  async function clearAll() {
    await useStore(['files', 'folders', 'settings'], 'readwrite', (transaction) => {
      transaction.objectStore('files').clear();
      transaction.objectStore('folders').clear();
      transaction.objectStore('settings').clear();
    });
  }

  root.DepotStorage = Object.freeze({
    DB_NAME,
    open,
    listFiles,
    getFile,
    putFile,
    putFiles,
    deleteFile,
    listFolders,
    putFolder,
    getSetting,
    setSetting,
    seed,
    clearAll,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
