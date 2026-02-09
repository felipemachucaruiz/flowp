const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  printSilent: (html, printerName) => ipcRenderer.invoke('print-silent', html, printerName),
  isElectron: true,
});
