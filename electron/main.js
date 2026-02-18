const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
let mainWindow;

const isDev = process.env.NODE_ENV === 'development';
const prodUrl = 'https://pos.flowp.app';

function createWindow() {
  const windowState = store.get('windowState', {
    width: 1280,
    height: 800,
    x: undefined,
    y: undefined,
  });

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(prodUrl);
  }

  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowState', {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === '' || url === 'about:blank') {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('get-printers', async () => {
  try {
    const printers = mainWindow.webContents.getPrintersAsync
      ? await mainWindow.webContents.getPrintersAsync()
      : mainWindow.webContents.getPrinters();
    return printers.map(p => ({ name: p.name, isDefault: p.isDefault }));
  } catch (e) {
    console.error('Error getting printers:', e);
    return [];
  }
});

// Fetch a remote/relative image URL and return as base64 data URL
async function fetchImageAsBase64(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    let fullUrl = url;
    if (url.startsWith('/')) {
      fullUrl = (isDev ? 'http://localhost:5000' : prodUrl) + url;
    }
    const protocol = fullUrl.startsWith('https') ? require('https') : require('http');
    return new Promise((resolve) => {
      protocol.get(fullUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            fetchImageAsBase64(redirectUrl).then(resolve);
            return;
          }
        }
        if (response.statusCode !== 200) {
          console.log('Failed to fetch logo image:', response.statusCode, fullUrl);
          resolve(null);
          return;
        }
        const contentType = response.headers['content-type'] || 'image/png';
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(`data:${contentType};base64,${buffer.toString('base64')}`);
        });
        response.on('error', () => resolve(null));
      }).on('error', (e) => {
        console.error('Logo fetch error:', e.message);
        resolve(null);
      });
    });
  } catch (e) {
    console.error('Logo fetch exception:', e.message);
    return null;
  }
}

ipcMain.handle('print-receipt', async (event, printerName, receipt) => {
  // Generate QR code data URL if electronic billing info exists
  let qrDataUrl = '';
  if (receipt.electronicBilling) {
    const qrContent = receipt.electronicBilling.qrCode || 
      (receipt.electronicBilling.cufe ? `https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=${receipt.electronicBilling.cufe}` : '');
    if (qrContent) {
      try {
        const QRCode = require('qrcode');
        qrDataUrl = await QRCode.toDataURL(qrContent, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
      } catch (e) {
        console.log('QR code generation not available:', e.message);
      }
    }
  }

  // Convert logo URL to base64 data URL so it works in data: HTML context
  let logoDataUrl = null;
  if (receipt.logoUrl) {
    logoDataUrl = await fetchImageAsBase64(receipt.logoUrl);
  }

  return new Promise((resolve) => {
    const items = receipt.items || [];
    const payments = receipt.payments || [];
    const taxes = receipt.taxes || [];
    const logoMaxWidth = receipt.logoSize ? `${receipt.logoSize}px` : '100%';
    const logoHtml = logoDataUrl
      ? `<div style="text-align:center;margin-bottom:4px;"><img src="${logoDataUrl}" style="max-width:${logoMaxWidth};height:auto;" /></div>`
      : '';
    const customerHtml = receipt.customerInfo
      ? `<div style="border-top:1px dashed #000;padding-top:4px;margin-top:4px;font-size:11px;">
          ${receipt.customerInfo.name ? `<div>${receipt.customerInfo.name}</div>` : ''}
          ${receipt.customerInfo.idNumber ? `<div>${receipt.customerInfo.idType || 'ID'}: ${receipt.customerInfo.idNumber}</div>` : ''}
          ${receipt.customerInfo.phone ? `<div>Tel: ${receipt.customerInfo.phone}</div>` : ''}
        </div>`
      : '';
    const eBillingHtml = receipt.electronicBilling
      ? `<div style="border-top:1px dashed #000;padding-top:4px;margin-top:4px;font-size:9px;word-break:break-all;text-align:center;">
          ${receipt.electronicBilling.documentNumber ? `<div style="font-size:12px;font-weight:bold;">${receipt.electronicBilling.prefix || ''}${receipt.electronicBilling.documentNumber}</div>` : ''}
          ${receipt.electronicBilling.resolutionNumber ? `<div style="margin-top:4px;">Resolucion DIAN No. ${receipt.electronicBilling.resolutionNumber}</div>` : ''}
          ${receipt.electronicBilling.resolutionStartDate && receipt.electronicBilling.resolutionEndDate ? `<div>Vigencia: ${receipt.electronicBilling.resolutionStartDate} - ${receipt.electronicBilling.resolutionEndDate}</div>` : ''}
          ${receipt.electronicBilling.authRangeFrom && receipt.electronicBilling.authRangeTo ? `<div>Rango: ${receipt.electronicBilling.prefix || ''}${receipt.electronicBilling.authRangeFrom} - ${receipt.electronicBilling.prefix || ''}${receipt.electronicBilling.authRangeTo}</div>` : ''}
          ${qrDataUrl ? `<div style="margin:6px auto;"><img src="${qrDataUrl}" style="width:35mm;height:35mm;image-rendering:pixelated;" /></div>` : ''}
          ${receipt.electronicBilling.cufe ? `<div style="text-align:left;">CUFE: ${receipt.electronicBilling.cufe}</div>` : ''}
        </div>`
      : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
      @page{margin:0;size:auto;}
      *{box-sizing:border-box;}
      body{font-family:monospace;font-size:${receipt.fontSize || 12}px;margin:0;padding:2mm;width:100%;max-width:72mm;}
      table{width:100%;border-collapse:collapse;table-layout:fixed;}
      td{padding:1px 0;vertical-align:top;overflow:hidden;text-overflow:ellipsis;}
      td.right{width:35%;white-space:nowrap;}
      .right{text-align:right;}.center{text-align:center;}.bold{font-weight:bold;}
      .line{border-top:1px dashed #000;margin:4px 0;}
      img{max-width:100%!important;}
      </style></head><body>
      ${logoHtml}
      <div class="center bold">${receipt.businessName || ''}</div>
      ${receipt.taxId ? `<div class="center">${receipt.taxIdLabel || 'NIT'}: ${receipt.taxId}</div>` : ''}
      ${receipt.address ? `<div class="center">${receipt.address}</div>` : ''}
      ${receipt.phone ? `<div class="center">${receipt.phone}</div>` : ''}
      ${receipt.headerText ? `<div class="center">${receipt.headerText}</div>` : ''}
      <div class="line"></div>
      ${receipt.orderNumber ? `<div><strong>#${receipt.orderNumber}</strong></div>` : ''}
      ${receipt.date ? `<div>${receipt.date}</div>` : ''}
      ${receipt.cashier ? `<div>${receipt.cashier}</div>` : ''}
      ${customerHtml}
      <div class="line"></div>
      <table>${items.map(item => `<tr><td>${item.quantity}x ${item.name}${item.modifiers ? `<br><small>${item.modifiers}</small>` : ''}</td><td class="right">$${item.total.toLocaleString()}</td></tr>`).join('')}</table>
      <div class="line"></div>
      <table>
        <tr><td>Subtotal</td><td class="right">$${(receipt.subtotal || 0).toLocaleString()}</td></tr>
        ${receipt.discount ? `<tr><td>Desc${receipt.discountPercent ? ` (${receipt.discountPercent}%)` : ''}</td><td class="right">-$${receipt.discount.toLocaleString()}</td></tr>` : ''}
        ${taxes.map(tax => `<tr><td>${tax.name} (${tax.rate}%)</td><td class="right">$${tax.amount.toLocaleString()}</td></tr>`).join('')}
        ${receipt.tax && taxes.length === 0 ? `<tr><td>IVA${receipt.taxRate ? ` (${receipt.taxRate}%)` : ''}</td><td class="right">$${receipt.tax.toLocaleString()}</td></tr>` : ''}
        <tr class="bold"><td><strong>TOTAL</strong></td><td class="right"><strong>$${(receipt.total || 0).toLocaleString()}</strong></td></tr>
      </table>
      ${payments.length > 0 ? `<div class="line"></div><table>${payments.map(p => `<tr><td>${p.type}</td><td class="right">$${p.amount.toLocaleString()}</td></tr>`).join('')}</table>` : ''}
      ${receipt.change ? `<div>Cambio: $${receipt.change.toLocaleString()}</div>` : ''}
      ${eBillingHtml}
      ${receipt.footerText ? `<div class="line"></div><div class="center">${receipt.footerText}</div>` : ''}
      </body></html>`;

    const printWin = new BrowserWindow({
      show: false,
      width: 350,
      height: 600,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    printWin.webContents.on('did-finish-load', () => {
      printWin.webContents.print(
        { silent: true, printBackground: true, deviceName: printerName, margins: { marginType: 'none' } },
        (success, failureReason) => {
          printWin.close();
          if (success && receipt.openCashDrawer) {
            triggerCashDrawer(printerName);
          }
          resolve({ success, error: failureReason || undefined });
        }
      );
    });

    printWin.webContents.on('did-fail-load', () => {
      printWin.close();
      resolve({ success: false, error: 'Failed to load receipt content' });
    });
  });
});

// Helper to trigger cash drawer via ESC/POS raw command
function triggerCashDrawer(printerName) {
  try {
    const { exec } = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const drawerCmd = Buffer.from([0x1B, 0x70, 0x00, 0x32, 0xFA, 0x1B, 0x70, 0x01, 0x32, 0xFA]);
    const tempFile = require('path').join(os.tmpdir(), 'flowp-drawer-' + Date.now() + '.bin');
    fs.writeFileSync(tempFile, drawerCmd);
    if (process.platform === 'win32') {
      const safePrinter = (printerName || '').replace(/"/g, '\\"');
      exec(`copy /b "${tempFile}" "\\\\localhost\\${safePrinter}"`, () => {
        try { fs.unlinkSync(tempFile); } catch(e) {}
      });
    } else {
      const safePrinter = (printerName || '').replace(/'/g, "'\\''");
      exec(`lp -d '${safePrinter}' -o raw '${tempFile}'`, () => {
        try { fs.unlinkSync(tempFile); } catch(e) {}
      });
    }
  } catch (e) {
    console.error('Cash drawer trigger error:', e);
  }
}

ipcMain.handle('print-raw', async (event, printerName, rawBase64) => {
  return new Promise((resolve) => {
    try {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>body{margin:0;padding:0;}</style></head><body>
        <img src="data:image/png;base64,${rawBase64}" style="max-width:100%;" />
        </body></html>`;

      const printWin = new BrowserWindow({
        show: false,
        width: 350,
        height: 600,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

      printWin.webContents.on('did-finish-load', () => {
        printWin.webContents.print(
          { silent: true, printBackground: true, deviceName: printerName },
          (success, failureReason) => {
            printWin.close();
            resolve({ success, error: failureReason || undefined });
          }
        );
      });

      printWin.webContents.on('did-fail-load', () => {
        printWin.close();
        resolve({ success: false, error: 'Failed to load content' });
      });
    } catch (e) {
      resolve({ success: false, error: e.message || 'Print failed' });
    }
  });
});

ipcMain.handle('open-cash-drawer', async (event, printerName) => {
  try {
    triggerCashDrawer(printerName);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || 'Cash drawer failed' };
  }
});

ipcMain.handle('print-silent', async (event, html, printerName) => {
  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      show: false,
      width: 350,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    printWin.webContents.on('did-finish-load', () => {
      const printOptions = { silent: true, printBackground: true };
      if (printerName) {
        printOptions.deviceName = printerName;
      }
      printWin.webContents.print(printOptions, (success, failureReason) => {
        printWin.close();
        resolve({ success, error: failureReason || undefined });
      });
    });

    printWin.webContents.on('did-fail-load', () => {
      printWin.close();
      resolve({ success: false, error: 'Failed to load receipt content' });
    });
  });
});
