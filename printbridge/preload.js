const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printBridge', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  testPrint: () => ipcRenderer.invoke('test-print'),
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
  regenerateToken: () => ipcRenderer.invoke('regenerate-token'),
  onServerStatus: (callback) => {
    ipcRenderer.on('server-status', (event, status) => callback(status));
  }
});
