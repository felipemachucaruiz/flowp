const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowpDesktop', {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (printerName, receipt) => ipcRenderer.invoke('print-receipt', printerName, receipt),
  printRaw: (printerName, rawBase64) => ipcRenderer.invoke('print-raw', printerName, rawBase64),
  openCashDrawer: (printerName) => ipcRenderer.invoke('open-cash-drawer', printerName),
});

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  printSilent: (html, printerName) => ipcRenderer.invoke('print-silent', html, printerName),
  isElectron: true,
});
