const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');

const PORT = 9638;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Try to load Jimp for image processing (optional)
let Jimp = null;
try {
  Jimp = require('jimp');
  console.log('Image processing enabled (Jimp loaded)');
} catch (e) {
  console.log('Image processing not available - run "npm install" to enable logo printing');
}

// Load saved config or use defaults
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.log('Could not load config, using defaults');
  }
  return {
    type: 'windows',
    printerName: '',
    paperWidth: 80
  };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.log('Could not save config:', e.message);
  }
}

let printerConfig = loadConfig();

const app = express();

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Auth-Token'],
  credentials: true
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

// Get available printers
function getPrinters() {
  return new Promise((resolve) => {
    const psCommand = 'powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"';
    exec(psCommand, (error, stdout) => {
      if (error) {
        exec('powershell -Command "(Get-WmiObject -Query \\"SELECT Name FROM Win32_Printer\\").Name"', (error2, stdout2) => {
          if (error2) {
            resolve([]);
            return;
          }
          const printers = stdout2.split('\n').map(l => l.trim()).filter(n => n.length > 0).map(name => ({ type: 'windows', name }));
          resolve(printers);
        });
        return;
      }
      const printers = stdout.split('\n').map(l => l.trim()).filter(n => n.length > 0).map(name => ({ type: 'windows', name }));
      resolve(printers);
    });
  });
}

// ESC/POS constants
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

// Convert image URL or base64 to ESC/POS raster bitmap
async function imageToEscPos(imageUrl, maxWidth = 384) {
  if (!Jimp || !imageUrl) return null;
  
  try {
    let image;
    if (imageUrl.startsWith('data:image')) {
      // Base64 image
      const base64Data = imageUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      image = await Jimp.read(buffer);
    } else {
      // URL - fetch the image
      image = await Jimp.read(imageUrl);
    }
    
    // Resize to fit printer width (maintain aspect ratio)
    if (image.getWidth() > maxWidth) {
      image.resize(maxWidth, Jimp.AUTO);
    }
    
    // Convert to grayscale and threshold for black/white
    image.grayscale().contrast(0.2);
    
    const width = image.getWidth();
    const height = image.getHeight();
    
    // Width must be multiple of 8 for ESC/POS
    const printWidth = Math.ceil(width / 8) * 8;
    const bytesPerLine = printWidth / 8;
    
    const buffers = [];
    
    // GS v 0 command for raster bit image
    // Format: GS v 0 m xL xH yL yH [data]
    buffers.push(Buffer.from([GS, 0x76, 0x30, 0x00])); // GS v 0, m=0 (normal)
    buffers.push(Buffer.from([bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF])); // xL, xH
    buffers.push(Buffer.from([height & 0xFF, (height >> 8) & 0xFF])); // yL, yH
    
    // Convert image data to bitmap (1 bit per pixel)
    for (let y = 0; y < height; y++) {
      const lineBuffer = Buffer.alloc(bytesPerLine);
      for (let x = 0; x < printWidth; x++) {
        const pixelX = Math.min(x, width - 1);
        const color = Jimp.intToRGBA(image.getPixelColor(pixelX, y));
        const brightness = (color.r + color.g + color.b) / 3;
        // Threshold: dark pixels become black (1), light pixels become white (0)
        if (brightness < 128) {
          const byteIndex = Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          lineBuffer[byteIndex] |= (1 << bitIndex);
        }
      }
      buffers.push(lineBuffer);
    }
    
    return Buffer.concat(buffers);
  } catch (error) {
    console.log('Image processing error:', error.message);
    return null;
  }
}

// Generate ESC/POS receipt commands
async function generateReceiptCommands(receipt) {
  const buffers = [];
  const paperWidth = printerConfig.paperWidth || 80;
  const charsPerLine = paperWidth === 58 ? 32 : 48;
  
  const addText = (text) => {
    if (text) buffers.push(Buffer.from(String(text), 'utf8'));
  };
  
  const addBytes = (...bytes) => {
    buffers.push(Buffer.from(bytes));
  };
  
  const newLine = () => addBytes(LF);
  
  const addLine = (text) => {
    addText(text);
    newLine();
  };
  
  const padLine = (left, right, width = charsPerLine) => {
    const leftStr = String(left);
    const rightStr = String(right);
    const padding = width - leftStr.length - rightStr.length;
    return leftStr + ' '.repeat(Math.max(1, padding)) + rightStr;
  };
  
  const addSeparator = () => {
    addLine('-'.repeat(charsPerLine));
  };
  
  const addDashedSeparator = () => {
    const pattern = '- '.repeat(Math.floor(charsPerLine / 2));
    addLine(pattern.substring(0, charsPerLine));
  };
  
  // ===== INITIALIZE PRINTER =====
  addBytes(ESC, 0x40); // Initialize
  addBytes(ESC, 0x74, 0x00); // Character code table
  
  // ===== CENTER ALIGNMENT =====
  addBytes(ESC, 0x61, 0x01);
  
  // ===== LOGO =====
  if (receipt.logoUrl && Jimp) {
    const logoWidth = Math.min(384, Math.round((receipt.logoSize || 200) / 100 * 200));
    const logoData = await imageToEscPos(receipt.logoUrl, logoWidth);
    if (logoData) {
      buffers.push(logoData);
      newLine();
    }
  }
  
  // ===== BUSINESS NAME =====
  // Font size mapping: larger fontSize = bigger text
  const fontSize = receipt.fontSize || 12;
  if (fontSize >= 14) {
    addBytes(ESC, 0x45, 0x01); // Bold ON
    addBytes(GS, 0x21, 0x11); // Double width + height
  } else if (fontSize >= 12) {
    addBytes(ESC, 0x45, 0x01); // Bold ON
    addBytes(GS, 0x21, 0x01); // Double height only
  } else {
    addBytes(ESC, 0x45, 0x01); // Bold ON
    addBytes(GS, 0x21, 0x00); // Normal size
  }
  addLine(receipt.businessName || 'Store');
  addBytes(GS, 0x21, 0x00); // Normal size
  addBytes(ESC, 0x45, 0x00); // Bold OFF
  
  // ===== HEADER INFO =====
  if (receipt.address) addLine(receipt.address);
  if (receipt.phone) addLine('Tel: ' + receipt.phone);
  if (receipt.taxId) {
    const taxLabel = receipt.language === 'es' ? 'NIT' : receipt.language === 'pt' ? 'CNPJ' : 'Tax ID';
    addLine(taxLabel + ': ' + receipt.taxId);
  }
  if (receipt.headerText) {
    newLine();
    addLine(receipt.headerText);
  }
  
  addSeparator();
  
  // ===== LEFT ALIGNMENT =====
  addBytes(ESC, 0x61, 0x00);
  
  // ===== ORDER INFO =====
  const orderLabel = receipt.language === 'es' ? 'Pedido' : receipt.language === 'pt' ? 'Pedido' : 'Order';
  addLine(orderLabel + ' #' + (receipt.orderNumber || '----'));
  if (receipt.date) addLine(receipt.date);
  if (receipt.cashier) {
    const label = receipt.language === 'es' ? 'Cajero' : receipt.language === 'pt' ? 'Caixa' : 'Cashier';
    addLine(label + ': ' + receipt.cashier);
  }
  if (receipt.customer) {
    const label = receipt.language === 'es' ? 'Cliente' : 'Customer';
    addLine(label + ': ' + receipt.customer);
  }
  
  addSeparator();
  
  // ===== ITEMS =====
  if (receipt.items && receipt.items.length > 0) {
    for (const item of receipt.items) {
      // Item name (may need to wrap if too long)
      const itemName = item.quantity + 'x ' + item.name;
      if (itemName.length > charsPerLine) {
        addLine(itemName.substring(0, charsPerLine));
        if (itemName.length > charsPerLine) {
          addLine('   ' + itemName.substring(charsPerLine));
        }
      } else {
        addLine(itemName);
      }
      
      // Price line
      const currency = receipt.currency || '$';
      if (item.unitPrice) {
        addLine('   @ ' + formatCurrency(item.unitPrice, currency) + ' = ' + formatCurrency(item.total, currency));
      } else {
        addLine('   ' + formatCurrency(item.total, currency));
      }
      if (item.modifiers) addLine('   ' + item.modifiers);
    }
  }
  
  addSeparator();
  
  // ===== TOTALS =====
  const currency = receipt.currency || '$';
  const subtotalLabel = receipt.language === 'es' ? 'Subtotal' : receipt.language === 'pt' ? 'Subtotal' : 'Subtotal';
  addLine(padLine(subtotalLabel, formatCurrency(receipt.subtotal, currency)));
  
  if (receipt.discount && receipt.discount > 0) {
    const discLabel = receipt.language === 'es' ? 'Descuento' : receipt.language === 'pt' ? 'Desconto' : 'Discount';
    addLine(padLine(discLabel, '-' + formatCurrency(receipt.discount, currency)));
  }
  
  if (receipt.tax !== undefined && receipt.tax !== null) {
    const taxLabel = receipt.language === 'es' ? 'Impuesto' : receipt.language === 'pt' ? 'Imposto' : 'Tax';
    if (receipt.taxRate) {
      addLine(padLine(taxLabel + ' (' + receipt.taxRate + '%)', formatCurrency(receipt.tax, currency)));
    } else {
      addLine(padLine(taxLabel, formatCurrency(receipt.tax, currency)));
    }
  }
  
  // ===== TOTAL (Bold, Large) =====
  addBytes(ESC, 0x45, 0x01); // Bold ON
  addBytes(GS, 0x21, 0x11); // Double width + height
  addLine(padLine('TOTAL', formatCurrency(receipt.total, currency), Math.floor(charsPerLine / 2)));
  addBytes(GS, 0x21, 0x00); // Normal size
  addBytes(ESC, 0x45, 0x00); // Bold OFF
  
  addSeparator();
  
  // ===== PAYMENTS =====
  if (receipt.payments && receipt.payments.length > 0) {
    for (const payment of receipt.payments) {
      let payType = payment.type.toUpperCase();
      if (receipt.language === 'es') {
        payType = payType === 'CASH' ? 'EFECTIVO' : payType === 'CARD' ? 'TARJETA' : payType;
      } else if (receipt.language === 'pt') {
        payType = payType === 'CASH' ? 'DINHEIRO' : payType === 'CARD' ? 'CARTAO' : payType;
      }
      addLine(padLine(payType, formatCurrency(payment.amount, currency)));
    }
    if (receipt.change && receipt.change > 0) {
      const label = receipt.language === 'es' ? 'Cambio' : receipt.language === 'pt' ? 'Troco' : 'Change';
      addLine(padLine(label, formatCurrency(receipt.change, currency)));
    }
    addSeparator();
  }
  
  // ===== FOOTER =====
  if (receipt.footerText) {
    addBytes(ESC, 0x61, 0x01); // Center
    addLine(receipt.footerText);
    newLine();
  }
  
  // ===== THANK YOU =====
  addBytes(ESC, 0x61, 0x01); // Center
  const thankYou = receipt.language === 'es' ? 'Gracias por su compra!' : receipt.language === 'pt' ? 'Obrigado pela compra!' : 'Thank you for your purchase!';
  addLine(thankYou);
  
  // ===== COUPON =====
  if (receipt.couponEnabled && receipt.couponText) {
    newLine();
    addDashedSeparator();
    newLine();
    
    // Coupon title
    const couponTitle = receipt.language === 'es' ? 'CUPON' : receipt.language === 'pt' ? 'CUPOM' : 'COUPON';
    addBytes(ESC, 0x45, 0x01); // Bold ON
    addLine(couponTitle);
    addBytes(ESC, 0x45, 0x00); // Bold OFF
    newLine();
    
    // Coupon text (may contain multiple lines)
    const couponLines = receipt.couponText.split('\n');
    for (const line of couponLines) {
      addLine(line);
    }
    
    newLine();
    addDashedSeparator();
  }
  
  // ===== FEED AND CUT =====
  newLine();
  newLine();
  newLine();
  newLine();
  if (receipt.cutPaper !== false) {
    addBytes(GS, 0x56, 0x00); // Full cut
  }
  
  // ===== OPEN CASH DRAWER =====
  if (receipt.openCashDrawer) {
    addBytes(ESC, 0x70, 0x00, 0x19, 0xFA); // Open drawer
  }
  
  return Buffer.concat(buffers);
}

function formatCurrency(amount, currency = '$') {
  const num = parseFloat(amount || 0).toFixed(2);
  return currency + num;
}

// Print to Windows printer
async function printToWindows(printerName, data) {
  return new Promise((resolve) => {
    const tempFile = path.join(os.tmpdir(), 'flowp_' + Date.now() + '.prn');
    fs.writeFileSync(tempFile, Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary'));
    
    console.log('Printing to:', printerName);
    console.log('Data length:', data.length, 'bytes');
    
    const rawPrintScript = `
      $printerName = '${printerName.replace(/'/g, "''")}'
      $filePath = '${tempFile.replace(/\\/g, '\\\\').replace(/'/g, "''")}'
      
      Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        public class RawPrinter {
          [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
          public class DOCINFOA {
            [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
          }
          [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
          public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
          [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
          public static extern bool ClosePrinter(IntPtr hPrinter);
          [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
          public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
          [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
          public static extern bool EndDocPrinter(IntPtr hPrinter);
          [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
          public static extern bool StartPagePrinter(IntPtr hPrinter);
          [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
          public static extern bool EndPagePrinter(IntPtr hPrinter);
          [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
          public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
          
          public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes) {
            IntPtr hPrinter = IntPtr.Zero;
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "Flowp Receipt";
            di.pDataType = "RAW";
            
            if (!OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) return false;
            if (!StartDocPrinter(hPrinter, 1, di)) { ClosePrinter(hPrinter); return false; }
            if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); ClosePrinter(hPrinter); return false; }
            
            IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(pBytes.Length);
            Marshal.Copy(pBytes, 0, pUnmanagedBytes, pBytes.Length);
            int dwWritten;
            bool success = WritePrinter(hPrinter, pUnmanagedBytes, pBytes.Length, out dwWritten);
            Marshal.FreeCoTaskMem(pUnmanagedBytes);
            
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
            ClosePrinter(hPrinter);
            return success;
          }
        }
"@
      
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $result = [RawPrinter]::SendBytesToPrinter($printerName, $bytes)
      if ($result) { exit 0 } else { exit 1 }
    `;
    
    const psFile = path.join(os.tmpdir(), 'flowp_print_' + Date.now() + '.ps1');
    fs.writeFileSync(psFile, rawPrintScript);
    
    exec(`powershell -ExecutionPolicy Bypass -File "${psFile}"`, { timeout: 30000 }, (error) => {
      try { fs.unlinkSync(tempFile); } catch (e) {}
      try { fs.unlinkSync(psFile); } catch (e) {}
      
      if (!error) {
        console.log('Print: SUCCESS');
        resolve({ success: true });
        return;
      }
      
      console.log('RAW print failed, trying copy method...');
      fs.writeFileSync(tempFile, Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary'));
      exec(`copy /b "${tempFile}" "\\\\%COMPUTERNAME%\\${printerName}"`, { shell: 'cmd.exe', timeout: 30000 }, (error2) => {
        try { fs.unlinkSync(tempFile); } catch (e) {}
        if (!error2) {
          console.log('Print: SUCCESS (copy)');
          resolve({ success: true });
        } else {
          console.log('Print: FAILED');
          resolve({ success: false, error: 'Could not send to printer' });
        }
      });
    });
  });
}

// Routes
app.get('/health', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.json({
    app: 'flowp-printbridge',
    status: 'ok',
    version: '1.0.4',
    imageSupport: !!Jimp,
    printer: printerConfig
  });
});

app.get('/printers', async (req, res) => {
  const printers = await getPrinters();
  res.json({ printers });
});

app.post('/config', (req, res) => {
  printerConfig = { ...printerConfig, ...req.body };
  saveConfig(printerConfig);
  console.log('Config saved:', printerConfig.printerName || 'No printer selected');
  res.json({ success: true, config: printerConfig });
});

app.post('/print', async (req, res) => {
  console.log('=== PRINT REQUEST ===');
  try {
    const { receipt } = req.body;
    if (!receipt) {
      return res.json({ success: false, error: 'No receipt data' });
    }
    
    console.log('Generating receipt...');
    console.log('- Business:', receipt.businessName);
    console.log('- Items:', receipt.items?.length || 0);
    console.log('- Logo:', receipt.logoUrl ? 'Yes' : 'No');
    console.log('- Coupon:', receipt.couponEnabled ? 'Yes' : 'No');
    
    const commands = await generateReceiptCommands(receipt);
    console.log('Commands:', commands.length, 'bytes');
    
    if (printerConfig.type === 'network') {
      const client = new net.Socket();
      client.connect(printerConfig.networkPort || 9100, printerConfig.networkIp, () => {
        client.write(commands);
        client.end();
        res.json({ success: true });
      });
      client.on('error', (err) => res.json({ success: false, error: err.message }));
    } else {
      if (!printerConfig.printerName) {
        return res.json({ success: false, error: 'No printer configured' });
      }
      const result = await printToWindows(printerConfig.printerName, commands);
      res.json(result);
    }
  } catch (error) {
    console.log('Print error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

app.post('/drawer', async (req, res) => {
  try {
    const command = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]);
    
    if (printerConfig.type === 'network') {
      const client = new net.Socket();
      client.connect(printerConfig.networkPort || 9100, printerConfig.networkIp, () => {
        client.write(command);
        client.end();
        res.json({ success: true });
      });
      client.on('error', (err) => res.json({ success: false, error: err.message }));
    } else {
      const result = await printToWindows(printerConfig.printerName, command);
      res.json(result);
    }
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Graceful shutdown
process.on('SIGINT', () => { console.log('\nShutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nShutting down...'); process.exit(0); });
if (process.platform === 'win32') {
  process.on('SIGHUP', () => { process.exit(0); });
}

// Start server
app.listen(PORT, '127.0.0.1', async () => {
  console.log('');
  console.log('========================================');
  console.log('  Flowp PrintBridge - Simple Edition');
  console.log('  Version: 1.0.4');
  console.log('========================================');
  console.log('');
  console.log(`Server: http://127.0.0.1:${PORT}`);
  console.log('Image support:', Jimp ? 'ENABLED' : 'DISABLED (run npm install)');
  console.log('');
  
  const printers = await getPrinters();
  if (printers.length > 0) {
    console.log('Printers:');
    printers.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
  } else {
    console.log('No printers found');
  }
  
  console.log('');
  if (printerConfig.printerName) {
    console.log('Selected: ' + printerConfig.printerName);
  } else {
    console.log('No printer selected - configure in Flowp Settings');
  }
  console.log('');
  console.log('Keep this window open. Press Ctrl+C to stop.');
  console.log('');
});
