'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', Object.freeze({
  platform: process.platform,
  getWindowState: () => ipcRenderer.invoke('tack83:get-window-state'),
  setAlwaysOnTop: (active) => ipcRenderer.invoke('tack83:set-always-on-top', active === true),
  setCompactMode: (active) => ipcRenderer.invoke('tack83:set-compact', active === true),
}));
