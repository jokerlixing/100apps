'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeWindowState } = require('./window-state.js');

let mainWindow = null;
let state = null;
let stateFile = null;
let saveTimer = null;
const smokeTest = process.argv.includes('--smoke-test');

function readState() {
  stateFile = path.join(app.getPath('userData'), 'window-state.json');
  try {
    return normalizeWindowState(JSON.parse(fs.readFileSync(stateFile, 'utf8')));
  } catch (error) {
    return normalizeWindowState(null);
  }
}

function saveState() {
  if (!state || !stateFile) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('Unable to save TACK/83 window state:', error.message);
    }
  }, 120);
}

function rememberNormalBounds() {
  if (!mainWindow || state.compact || mainWindow.isMinimized() || mainWindow.isMaximized()) return;
  const bounds = mainWindow.getBounds();
  state = normalizeWindowState({ ...state, ...bounds });
  saveState();
}

function applyCompactMode(compact) {
  if (!mainWindow) return;
  if (compact) {
    rememberNormalBounds();
    state.compact = true;
    mainWindow.setMinimumSize(360, 480);
    mainWindow.setResizable(true);
    mainWindow.setSize(420, 620, true);
  } else {
    state.compact = false;
    mainWindow.setMinimumSize(860, 620);
    mainWindow.setBounds({
      width: state.width,
      height: state.height,
      ...(state.x == null || state.y == null ? {} : { x: state.x, y: state.y }),
    }, true);
  }
  saveState();
}

function publicState() {
  return { compact: state.compact, alwaysOnTop: mainWindow?.isAlwaysOnTop() === true };
}

function registerIpc() {
  ipcMain.handle('tack83:get-window-state', () => publicState());
  ipcMain.handle('tack83:set-always-on-top', (_event, active) => {
    const enabled = active === true;
    mainWindow.setAlwaysOnTop(enabled, 'floating');
    state.alwaysOnTop = enabled;
    saveState();
    return publicState();
  });
  ipcMain.handle('tack83:set-compact', (_event, active) => {
    applyCompactMode(active === true);
    return publicState();
  });
}

function createWindow() {
  state = readState();
  mainWindow = new BrowserWindow({
    width: state.compact ? 420 : state.width,
    height: state.compact ? 620 : state.height,
    ...(state.compact || state.x == null || state.y == null ? {} : { x: state.x, y: state.y }),
    minWidth: state.compact ? 360 : 860,
    minHeight: state.compact ? 480 : 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#e8ece9',
    title: 'TACK/83 · 桌面便签',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setAlwaysOnTop(state.alwaysOnTop, 'floating');
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => {
    if (smokeTest) {
      console.log('TACK83_SMOKE_READY');
      app.quit();
      return;
    }
    mainWindow.show();
  });
  mainWindow.on('resize', rememberNormalBounds);
  mainWindow.on('move', rememberNormalBounds);
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('before-quit', () => {
    rememberNormalBounds();
    if (saveTimer) {
      clearTimeout(saveTimer);
      try {
        fs.mkdirSync(path.dirname(stateFile), { recursive: true });
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
      } catch (error) { /* best-effort close persistence */ }
    }
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
