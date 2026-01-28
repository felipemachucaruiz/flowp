const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const printer = require('./printer');

const store = new Store();

// Production URL - change to your Flowp deployment
const FLOWP_URL = process.env.FLOWP_URL || 'https://flowp.app';

// Disable hardware acceleration for better compatibility
app.disableHardwareAcceleration();

let mainWindow = null;

function createWindow() {
  // Get saved window bounds or use defaults
  const bounds = store.get('windowBounds', {
    width: 1280,
    height: 800,
    x: undefined,
    y: undefined
  });

  // Find icon - check build folder first, then root
  let iconPath = path.join(__dirname, 'build', 'icon.ico');
  const fs = require('fs');
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'build', 'icon.png');
  }
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'icon.png');
  }

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 600,
    title: 'Flowp POS',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#1a1a2e'
  });

  // Save window position on close
  mainWindow.on('close', () => {
    store.set('windowBounds', mainWindow.getBounds());
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (store.get('maximized', false)) {
      mainWindow.maximize();
    }
  });

  // Save maximized state
  mainWindow.on('maximize', () => store.set('maximized', true));
  mainWindow.on('unmaximize', () => store.set('maximized', false));

  // Load Flowp
  mainWindow.loadURL(FLOWP_URL);

  // Handle page errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorDescription);
    // Retry after 5 seconds
    setTimeout(() => {
      mainWindow.loadURL(FLOWP_URL);
    }, 5000);
  });

  // Security: Restrict navigation to allowed origins only
  const allowedOrigins = [
    'https://flowp.app',
    'https://www.flowp.app',
    FLOWP_URL
  ];

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const urlOrigin = new URL(url).origin;
    if (!allowedOrigins.some(origin => url.startsWith(origin))) {
      console.log('Blocked navigation to:', url);
      event.preventDefault();
    }
  });

  // Restrict new window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const urlOrigin = new URL(url).origin;
    if (allowedOrigins.some(origin => url.startsWith(origin))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Block permission requests from untrusted origins
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    if (allowedOrigins.some(origin => url.startsWith(origin))) {
      callback(true);
    } else {
      console.log('Blocked permission request from:', url);
      callback(false);
    }
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ===== IPC Handlers for Printing =====

// Get list of printers
ipcMain.handle('get-printers', async () => {
  try {
    return await printer.getPrinters();
  } catch (e) {
    console.error('Get printers error:', e);
    return [];
  }
});

// Print receipt
ipcMain.handle('print-receipt', async (event, data) => {
  try {
    const { printerName, receipt } = data;
    await printer.printReceipt(printerName, receipt);
    return { success: true };
  } catch (e) {
    console.error('Print error:', e);
    return { success: false, error: e.message };
  }
});

// Print raw ESC/POS data
ipcMain.handle('print-raw', async (event, data) => {
  try {
    const { printerName, raw } = data;
    await printer.printRaw(printerName, Buffer.from(raw, 'base64'));
    return { success: true };
  } catch (e) {
    console.error('Print raw error:', e);
    return { success: false, error: e.message };
  }
});

// Open cash drawer
ipcMain.handle('open-cash-drawer', async (event, printerName) => {
  try {
    await printer.openCashDrawer(printerName);
    return { success: true };
  } catch (e) {
    console.error('Cash drawer error:', e);
    return { success: false, error: e.message };
  }
});

// Check if running in Electron
ipcMain.handle('is-electron', () => true);

// Get app version
ipcMain.handle('get-version', () => app.getVersion());
