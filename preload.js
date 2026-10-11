// 安全桥：只把需要的能力暴露给界面，界面无法直接碰系统。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  pickFolders: () => ipcRenderer.invoke('pick-folders'),
  buildIndex: (folders, options) => ipcRenderer.invoke('build-index', folders, options),
  clearIndex: () => ipcRenderer.invoke('clear-index'),
  search: (keyword) => ipcRenderer.invoke('search', keyword),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  revealFile: (p) => ipcRenderer.invoke('reveal-file', p),
  openFile: (p) => ipcRenderer.invoke('open-file', p),
  getHotkey: () => ipcRenderer.invoke('get-hotkey'),
  setHotkey: (accel) => ipcRenderer.invoke('set-hotkey', accel),
  getUILang: () => ipcRenderer.invoke('get-ui-lang'),
  setUILang: (l) => ipcRenderer.invoke('set-ui-lang', l),
  onProgress: (cb) => ipcRenderer.on('index-progress', (_e, p) => cb(p))
});
