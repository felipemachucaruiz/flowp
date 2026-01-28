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

  // Show loading page first
  const loadingHtml = `
    <html>
      <head>
        <style>
          body { 
            margin: 0; 
            background: #1a1a2e; 
            color: white; 
            font-family: system-ui, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
          }
          .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255,255,255,0.2);
            border-top-color: #8b5cf6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          h1 { margin-top: 20px; font-size: 24px; }
          p { color: #888; margin-top: 10px; }
          .error { color: #f87171; margin-top: 20px; display: none; }
          .retry { 
            margin-top: 15px; 
            padding: 10px 20px; 
            background: #8b5cf6; 
            color: white; 
            border: none; 
            border-radius: 6px;
            cursor: pointer;
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h1>Flowp POS</h1>
        <p id="status">Connecting to flowp.app...</p>
        <p class="error" id="error"></p>
        <button class="retry" id="retry" onclick="location.reload()">Retry</button>
      </body>
    </html>
  `;
  
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHtml));
  
  // Try to load the actual site after a brief moment
  setTimeout(() => {
    console.log('Loading:', FLOWP_URL);
    mainWindow.loadURL(FLOWP_URL);
  }, 500);

  // Handle page errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorDescription, 'URL:', validatedURL, 'Code:', errorCode);
    
    const errorHtml = loadingHtml
      .replace('Connecting to flowp.app...', 'Connection failed')
      .replace('display: none; }', 'display: block; }')
      .replace('<p class="error" id="error"></p>', '<p class="error" id="error">Error: ' + errorDescription + '</p>');
    
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml));
    
    // Retry after 10 seconds
    setTimeout(() => {
      mainWindow.loadURL(FLOWP_URL);
    }, 10000);
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
