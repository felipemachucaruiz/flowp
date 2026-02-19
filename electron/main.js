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
        qrDataUrl = await QRCode.toDataURL(qrContent, { width: 600, margin: 2, errorCorrectionLevel: 'H', color: { dark: '#000000', light: '#ffffff' } });
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
      ? `<div style="border-top:1px dashed #000;padding-top:6px;margin-top:6px;text-align:center;">
          ${receipt.electronicBilling.documentNumber ? `<div style="font-size:${receipt.fontSize || 12}px;font-weight:bold;">${receipt.electronicBilling.prefix || ''}${receipt.electronicBilling.documentNumber}</div>` : ''}
          ${receipt.electronicBilling.resolutionNumber ? `<div style="margin-top:4px;font-size:${Math.max((receipt.fontSize || 12) - 1, 10)}px;">Resolucion DIAN No.<br/>${receipt.electronicBilling.resolutionNumber}</div>` : ''}
          ${receipt.electronicBilling.resolutionStartDate && receipt.electronicBilling.resolutionEndDate ? `<div style="font-size:${Math.max((receipt.fontSize || 12) - 1, 10)}px;">Vigencia: ${receipt.electronicBilling.resolutionStartDate} - ${receipt.electronicBilling.resolutionEndDate}</div>` : ''}
          ${receipt.electronicBilling.authRangeFrom && receipt.electronicBilling.authRangeTo ? `<div style="font-size:${Math.max((receipt.fontSize || 12) - 1, 10)}px;">Rango: ${receipt.electronicBilling.prefix || ''}${receipt.electronicBilling.authRangeFrom} - ${receipt.electronicBilling.prefix || ''}${receipt.electronicBilling.authRangeTo}</div>` : ''}
          ${qrDataUrl ? `<div style="margin:8px auto;text-align:center;"><img src="${qrDataUrl}" style="width:38mm;height:38mm;image-rendering:pixelated;image-rendering:-moz-crisp-edges;image-rendering:crisp-edges;-ms-interpolation-mode:nearest-neighbor;" /></div>` : ''}
          ${receipt.electronicBilling.cufe ? `<div style="margin-top:4px;font-size:${Math.max((receipt.fontSize || 12) - 2, 9)}px;word-break:break-all;text-align:left;line-height:1.3;">CUFE:<br/>${receipt.electronicBilling.cufe}</div>` : ''}
        </div>`
      : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
      @page{margin:0mm 1mm;size:auto;}
      *{box-sizing:border-box;}
      body{font-family:monospace;font-size:${receipt.fontSize || 12}px;margin:0;padding:1mm 2mm;width:100%;max-width:76mm;}
      table{width:100%;border-collapse:collapse;table-layout:fixed;}
      td{padding:1px 0;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;}
      td:last-child{width:30%;text-align:right;white-space:nowrap;}
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
        { silent: true, printBackground: true, deviceName: printerName, margins: { marginType: 'printableArea' } },
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

// Send raw ESC/POS bytes to printer using Windows Spooler API via PowerShell
// The HTML print method does NOT work for raw commands - Windows print drivers
// convert everything to graphics, so ESC/POS commands never reach the printer.
// This uses the Win32 winspool.Drv API to send raw bytes directly.
function triggerCashDrawer(printerName) {
  return new Promise((resolve) => {
    try {
      const { exec } = require('child_process');
      const fs = require('fs');
      const os = require('os');

      // ESC p 0 60 120 = kick drawer pin 2 with proper pulse duration
      // ESC p 1 60 120 = kick drawer pin 5 with proper pulse duration
      // 0x30=48 (60ms on-time), 0x3C=60 (120ms off-time) ensures reliable solenoid activation
      const drawerCmd = Buffer.from([
        0x1B, 0x70, 0x00, 0x30, 0x3C,  // Drawer 1 (Pin 2)
        0x1B, 0x70, 0x01, 0x30, 0x3C,  // Drawer 2 (Pin 5)
      ]);
      const ts = Date.now();
      const tempBin = path.join(os.tmpdir(), `flowp-drawer-${ts}.bin`);
      fs.writeFileSync(tempBin, drawerCmd);

      if (process.platform === 'win32') {
        const tempPs1 = path.join(os.tmpdir(), `flowp-drawer-${ts}.ps1`);
        const safePrinter = printerName.replace(/'/g, "''");
        const safeBin = tempBin.replace(/\\/g, '\\\\');

        const psScript = [
          "Add-Type -TypeDefinition @'",
          "using System;",
          "using System.Runtime.InteropServices;",
          "public class RawPrint {",
          "  [StructLayout(LayoutKind.Sequential)] public struct DOCINFOA {",
          "    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;",
          "    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;",
          "    [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;",
          "  }",
          "  [DllImport(\"winspool.Drv\", EntryPoint=\"OpenPrinterA\", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]",
          "  public static extern bool OpenPrinter(string p, out IntPtr hP, IntPtr d);",
          "  [DllImport(\"winspool.Drv\", EntryPoint=\"ClosePrinter\", SetLastError=true)]",
          "  public static extern bool ClosePrinter(IntPtr hP);",
          "  [DllImport(\"winspool.Drv\", EntryPoint=\"StartDocPrinterA\", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]",
          "  public static extern bool StartDocPrinter(IntPtr hP, int l, ref DOCINFOA di);",
          "  [DllImport(\"winspool.Drv\", EntryPoint=\"EndDocPrinter\", SetLastError=true)]",
          "  public static extern bool EndDocPrinter(IntPtr hP);",
          "  [DllImport(\"winspool.Drv\", EntryPoint=\"StartPagePrinter\", SetLastError=true)]",
          "  public static extern bool StartPagePrinter(IntPtr hP);",
          "  [DllImport(\"winspool.Drv\", EntryPoint=\"EndPagePrinter\", SetLastError=true)]",
          "  public static extern bool EndPagePrinter(IntPtr hP);",
          "  [DllImport(\"winspool.Drv\", EntryPoint=\"WritePrinter\", SetLastError=true)]",
          "  public static extern bool WritePrinter(IntPtr hP, IntPtr b, int c, out int w);",
          "  public static bool Send(string printer, byte[] data) {",
          "    IntPtr hP;",
          "    if (!OpenPrinter(printer, out hP, IntPtr.Zero)) return false;",
          "    DOCINFOA di = new DOCINFOA() { pDocName = \"FlowpDrawer\", pOutputFile = null, pDatatype = \"RAW\" };",
          "    if (!StartDocPrinter(hP, 1, ref di)) { ClosePrinter(hP); return false; }",
          "    StartPagePrinter(hP);",
          "    IntPtr pb = Marshal.AllocCoTaskMem(data.Length);",
          "    Marshal.Copy(data, 0, pb, data.Length);",
          "    int written; WritePrinter(hP, pb, data.Length, out written);",
          "    Marshal.FreeCoTaskMem(pb);",
          "    EndPagePrinter(hP); EndDocPrinter(hP); ClosePrinter(hP);",
          "    return written > 0;",
          "  }",
          "}",
          "'@",
          `$bytes = [System.IO.File]::ReadAllBytes('${safeBin}')`,
          `$ok = [RawPrint]::Send('${safePrinter}', $bytes)`,
          `Remove-Item '${safeBin}' -ErrorAction SilentlyContinue`,
          "if ($ok) { exit 0 } else { exit 1 }",
        ].join("\r\n");

        fs.writeFileSync(tempPs1, psScript, 'utf8');

        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1}"`,
          { timeout: 8000 },
          (error, stdout, stderr) => {
            try { fs.unlinkSync(tempBin); } catch(e) {}
            try { fs.unlinkSync(tempPs1); } catch(e) {}
            if (error) {
              console.error('Cash drawer error:', stderr || error.message);
              resolve({ success: false, error: stderr || error.message });
            } else {
              resolve({ success: true });
            }
          }
        );
      } else {
        // macOS/Linux: use lp with raw option
        const safePrinter = printerName.replace(/'/g, "'\\''");
        exec(`lp -d '${safePrinter}' -o raw '${tempBin}'`,
          { timeout: 5000 },
          (error) => {
            try { fs.unlinkSync(tempBin); } catch(e) {}
            if (error) {
              resolve({ success: false, error: error.message });
            } else {
              resolve({ success: true });
            }
          }
        );
      }
    } catch (e) {
      console.error('Cash drawer trigger error:', e);
      resolve({ success: false, error: e.message || 'Cash drawer failed' });
    }
  });
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
  if (!printerName) {
    return { success: false, error: 'No printer specified' };
  }
  return triggerCashDrawer(printerName);
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
