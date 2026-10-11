const { contextBridge } = require('electron');
const demoMode = require('../demo-data/demoMode');

contextBridge.exposeInMainWorld('api', {
  getState: () => Promise.resolve(demoMode.getState()),
  pickFolders: () => Promise.resolve(demoMode.getFolders()),
  buildIndex: () => Promise.resolve(demoMode.getBuildResult()),
  search: (keyword) => Promise.resolve({ ready: true, results: demoMode.search(keyword) }),
  copyText: () => Promise.resolve(true),
  revealFile: () => Promise.resolve(true),
  openFile: () => Promise.resolve(true),
  getHotkey: () => Promise.resolve('CommandOrControl+Shift+Space'),
  setHotkey: (accel) => Promise.resolve({ ok: true, accel }),
  onProgress: () => {}
});
