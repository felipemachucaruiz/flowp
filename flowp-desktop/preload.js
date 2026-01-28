const { contextBridge, ipcRenderer } = require('electron');

// Expose Electron printing API to the web app
contextBridge.exposeInMainWorld('flowpDesktop', {
  // Check if running in Electron desktop app
  isElectron: true,
  
  // Get app version
  getVersion: () => ipcRenderer.invoke('get-version'),
  
  // Get list of available printers
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  
  // Print a receipt (structured data)
  printReceipt: (printerName, receipt) => 
    ipcRenderer.invoke('print-receipt', { printerName, receipt }),
  
  // Print raw ESC/POS data (base64 encoded)
  printRaw: (printerName, rawBase64) => 
    ipcRenderer.invoke('print-raw', { printerName, raw: rawBase64 }),
  
  // Open cash drawer
  openCashDrawer: (printerName) => 
    ipcRenderer.invoke('open-cash-drawer', printerName)
});

// Signal that we're in Electron
window.addEventListener('DOMContentLoaded', () => {
  console.log('Flowp Desktop loaded - Electron printing available');
});
