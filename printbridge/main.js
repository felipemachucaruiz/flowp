const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { startServer, stopServer, getServerStatus } = require('./server');
const { getPrinters, testPrint } = require('./printer');

const store = new Store();
let mainWindow = null;
let tray = null;
let serverRunning = false;

const PORT = 9638;

const trayTranslations = {
  en: {
    open: 'Open PrintBridge',
    start: 'Start Server',
    stop: 'Stop Server',
    quit: 'Quit'
  },
  es: {
    open: 'Abrir PrintBridge',
    start: 'Iniciar Servidor',
    stop: 'Detener Servidor',
    quit: 'Salir'
  },
  pt: {
    open: 'Abrir PrintBridge',
    start: 'Iniciar Servidor',
    stop: 'Parar Servidor',
    quit: 'Sair'
  }
};

function getTrayLabels() {
  const lang = store.get('language', 'en');
  return trayTranslations[lang] || trayTranslations.en;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 620,
    resizable: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const labels = getTrayLabels();
  const contextMenu = Menu.buildFromTemplate([
    { label: labels.open, click: () => mainWindow.show() },
    { type: 'separator' },
    { label: labels.start, click: () => startPrintServer() },
    { label: labels.stop, click: () => stopPrintServer() },
    { type: 'separator' },
    { label: labels.quit, click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  tray.setToolTip('Flowp PrintBridge');
  updateTrayMenu();
  tray.on('double-click', () => mainWindow.show());
}

async function startPrintServer() {
  const config = store.get('printerConfig', {});
  await startServer(PORT, config, store);
  serverRunning = true;
  if (mainWindow) {
    mainWindow.webContents.send('server-status', { running: true, port: PORT });
  }
}

function stopPrintServer() {
  stopServer();
  serverRunning = false;
  if (mainWindow) {
    mainWindow.webContents.send('server-status', { running: false });
  }
}

app.whenReady().then(async () => {
  createWindow();
  createTray();
  
  // Auto-start server
  await startPrintServer();
});

app.on('window-all-closed', () => {
  // Don't quit, keep running in tray
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopServer();
});

// IPC handlers
ipcMain.handle('get-printers', async () => {
  return await getPrinters();
});

ipcMain.handle('get-config', () => {
  return store.get('printerConfig', {
    type: 'windows',
    printerName: '',
    paperWidth: 80
  });
});

ipcMain.handle('save-config', (event, config) => {
  store.set('printerConfig', config);
  // Restart server with new config
  stopPrintServer();
  startPrintServer();
  return true;
});

ipcMain.handle('get-server-status', () => {
  return { running: serverRunning, port: PORT };
});

ipcMain.handle('test-print', async () => {
  const config = store.get('printerConfig', {});
  return await testPrint(config);
});

ipcMain.handle('test-kitchen-print', async () => {
  const config = store.get('printerConfig', {});
  if (!config.kitchenEnabled) {
    return { success: false, error: 'Kitchen printer not enabled' };
  }
  const kitchenConfig = {
    type: config.kitchenType || 'windows',
    printerName: config.kitchenPrinterName,
    networkIp: config.kitchenNetworkIp,
    networkPort: config.kitchenNetworkPort,
    paperWidth: config.kitchenPaperWidth || 80
  };
  return await testPrint(kitchenConfig);
});

ipcMain.handle('get-auth-token', () => {
  let token = store.get('authToken');
  if (!token) {
    token = require('crypto').randomBytes(32).toString('hex');
    store.set('authToken', token);
  }
  return token;
});

ipcMain.handle('regenerate-token', () => {
  const token = require('crypto').randomBytes(32).toString('hex');
  store.set('authToken', token);
  return token;
});

ipcMain.handle('set-language', (event, lang) => {
  store.set('language', lang);
  updateTrayMenu();
  return true;
});

ipcMain.handle('get-language', () => {
  return store.get('language', 'en');
});
