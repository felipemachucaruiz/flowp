const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const net = require('net');

const PORT = 9638;
const CONFIG_FILE = path.join(__dirname, 'config.json');

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

// Enable CORS for all origins (needed for browser access from HTTPS sites)
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Auth-Token'],
  credentials: true
}));

// Handle preflight requests explicitly
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));

// Get available printers using PowerShell (works on all Windows versions)
function getPrinters() {
  return new Promise((resolve) => {
    const psCommand = 'powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"';
    exec(psCommand, (error, stdout) => {
      if (error) {
        console.log('PowerShell error, trying alternative method...');
        // Fallback: try to get printers from registry or use net use
        exec('powershell -Command "(Get-WmiObject -Query \\"SELECT Name FROM Win32_Printer\\").Name"', (error2, stdout2) => {
          if (error2) {
            console.log('Could not get printer list. Please enter printer name manually.');
            resolve([]);
            return;
          }
          const printers = stdout2.split('\n')
            .map(line => line.trim())
            .filter(name => name.length > 0)
            .map(name => ({ type: 'windows', name }));
          resolve(printers);
        });
        return;
      }
      const printers = stdout.split('\n')
        .map(line => line.trim())
        .filter(name => name.length > 0)
        .map(name => ({ type: 'windows', name }));
      resolve(printers);
    });
  });
}

// Generate ESC/POS commands as Buffer for proper binary handling
function generateReceiptCommands(receipt) {
  const ESC = 0x1B;
  const GS = 0x1D;
  const LF = 0x0A;
  const buffers = [];
  
  // Helper to add text (converts to printer encoding)
  const addText = (text) => {
    if (text) buffers.push(Buffer.from(String(text), 'utf8'));
  };
  
  // Helper to add raw bytes
  const addBytes = (...bytes) => {
    buffers.push(Buffer.from(bytes));
  };
  
  // Helper for line feed
  const newLine = () => addBytes(LF);
  
  // Helper for line with text
  const addLine = (text) => {
    addText(text);
    newLine();
  };
  
  // ===== INITIALIZE PRINTER =====
  addBytes(ESC, 0x40); // Initialize printer
  addBytes(ESC, 0x74, 0x00); // Character code table (PC437 - supports special chars)
  
  // ===== CENTER ALIGNMENT =====
  addBytes(ESC, 0x61, 0x01); // Center
  
  // ===== BUSINESS NAME (Large, Bold) =====
  addBytes(ESC, 0x45, 0x01); // Bold ON
  addBytes(GS, 0x21, 0x11); // Double width + height
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
  if (receipt.headerText) addLine(receipt.headerText);
  
  // ===== SEPARATOR =====
  addLine('--------------------------------');
  
  // ===== LEFT ALIGNMENT =====
  addBytes(ESC, 0x61, 0x00); // Left align
  
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
  
  addLine('--------------------------------');
  
  // ===== ITEMS =====
  if (receipt.items && receipt.items.length > 0) {
    for (const item of receipt.items) {
      addLine(item.quantity + 'x ' + item.name);
      if (item.unitPrice) {
        addLine('   @ ' + formatCurrency(item.unitPrice, receipt.currency) + ' = ' + formatCurrency(item.total, receipt.currency));
      } else {
        addLine('   ' + formatCurrency(item.total, receipt.currency));
      }
      if (item.modifiers) addLine('   ' + item.modifiers);
    }
  }
  
  addLine('--------------------------------');
  
  // ===== TOTALS =====
  addLine(padLine('Subtotal', formatCurrency(receipt.subtotal, receipt.currency)));
  if (receipt.discount && receipt.discount > 0) {
    addLine(padLine('Discount', '-' + formatCurrency(receipt.discount, receipt.currency)));
  }
  if (receipt.tax !== undefined && receipt.tax !== null) {
    addLine(padLine('Tax', formatCurrency(receipt.tax, receipt.currency)));
  }
  
  // ===== TOTAL (Bold, Large) =====
  addBytes(ESC, 0x45, 0x01); // Bold ON
  addBytes(GS, 0x21, 0x10); // Double height
  addLine(padLine('TOTAL', formatCurrency(receipt.total, receipt.currency)));
  addBytes(GS, 0x21, 0x00); // Normal size
  addBytes(ESC, 0x45, 0x00); // Bold OFF
  
  addLine('--------------------------------');
  
  // ===== PAYMENTS =====
  if (receipt.payments && receipt.payments.length > 0) {
    for (const payment of receipt.payments) {
      const payType = payment.type.toUpperCase();
      addLine(padLine(payType, formatCurrency(payment.amount, receipt.currency)));
    }
    if (receipt.change && receipt.change > 0) {
      const label = receipt.language === 'es' ? 'Cambio' : receipt.language === 'pt' ? 'Troco' : 'Change';
      addLine(padLine(label, formatCurrency(receipt.change, receipt.currency)));
    }
  }
  
  // ===== FOOTER =====
  if (receipt.footerText) {
    addLine('--------------------------------');
    addBytes(ESC, 0x61, 0x01); // Center
    addLine(receipt.footerText);
  }
  
  // ===== THANK YOU =====
  addBytes(ESC, 0x61, 0x01); // Center
  const thankYou = receipt.language === 'es' ? 'Gracias por su compra!' : receipt.language === 'pt' ? 'Obrigado pela compra!' : 'Thank you!';
  newLine();
  addLine(thankYou);
  
  // ===== FEED AND CUT =====
  newLine();
  newLine();
  newLine();
  if (receipt.cutPaper !== false) {
    addBytes(GS, 0x56, 0x00); // Full cut
  }
  
  // Combine all buffers
  return Buffer.concat(buffers);
}

function formatCurrency(amount, currency = '$') {
  return currency + parseFloat(amount || 0).toFixed(2);
}

function padLine(left, right, width = 32) {
  const padding = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, padding)) + right;
}

// Print to Windows printer - RAW printing for thermal printers
async function printToWindows(printerName, data) {
  return new Promise((resolve) => {
    const tempFile = path.join(os.tmpdir(), 'flowp_' + Date.now() + '.prn');
    // Write as Buffer directly - no encoding needed for binary data
    fs.writeFileSync(tempFile, Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary'));
    
    console.log('Printing to:', printerName);
    console.log('Data length:', data.length, 'bytes');
    
    // For thermal printers, we need to send RAW data
    // Method 1: Use Windows print spooler with RAW datatype via PowerShell
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
    
    const printCmd = `powershell -ExecutionPolicy Bypass -File "${psFile}"`;
    
    exec(printCmd, { timeout: 30000 }, (error, stdout, stderr) => {
      // Clean up temp files
      try { fs.unlinkSync(tempFile); } catch (e) {}
      try { fs.unlinkSync(psFile); } catch (e) {}
      
      if (!error) {
        console.log('Print: SUCCESS (RAW)');
        resolve({ success: true });
        return;
      }
      
      console.log('RAW print failed:', error.message);
      console.log('Trying copy method...');
      
      // Method 2: Try copy to shared printer
      // Re-create temp file for second attempt
      fs.writeFileSync(tempFile, Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary'));
      const copyCmd = `copy /b "${tempFile}" "\\\\%COMPUTERNAME%\\${printerName}"`;
      exec(copyCmd, { shell: 'cmd.exe', timeout: 30000 }, (error2) => {
        try { fs.unlinkSync(tempFile); } catch (e) {}
        if (!error2) {
          console.log('Print: SUCCESS (copy)');
          resolve({ success: true });
        } else {
          console.log('Print: FAILED -', error2.message);
          resolve({ success: false, error: 'Could not send to printer. Make sure printer is shared or check printer settings.' });
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
    version: '1.0.3',
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
  console.log('=== PRINT REQUEST RECEIVED ===');
  try {
    const { receipt } = req.body;
    console.log('Receipt data:', receipt ? 'Present' : 'Missing');
    if (!receipt) {
      console.log('ERROR: No receipt data in request');
      return res.json({ success: false, error: 'No receipt data' });
    }
    
    const commands = generateReceiptCommands(receipt);
    console.log('Commands generated:', commands.length, 'bytes');
    
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
    res.json({ success: false, error: error.message });
  }
});

app.post('/drawer', async (req, res) => {
  try {
    const ESC = '\x1B';
    const command = ESC + 'p\x00\x19\xFA';
    
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

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.log('\nShutting down PrintBridge...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down PrintBridge...');
  process.exit(0);
});

// Handle Windows console close
if (process.platform === 'win32') {
  process.on('SIGHUP', () => {
    console.log('\nWindow closed, shutting down...');
    process.exit(0);
  });
}

// Start server
app.listen(PORT, '127.0.0.1', async () => {
  console.log('');
  console.log('========================================');
  console.log('  Flowp PrintBridge - Simple Edition');
  console.log('  Version: 1.0.3');
  console.log('========================================');
  console.log('');
  console.log(`Server running on http://127.0.0.1:${PORT}`);
  console.log('');
  
  const printers = await getPrinters();
  if (printers.length > 0) {
    console.log('Available printers:');
    printers.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
  } else {
    console.log('No printers found. Make sure your printer is connected.');
  }
  
  console.log('');
  if (printerConfig.printerName) {
    console.log('Configured printer: ' + printerConfig.printerName);
  } else {
    console.log('No printer configured yet. Select one in Flowp Settings.');
  }
  console.log('');
  console.log('Keep this window open while using Flowp POS.');
  console.log('Press Ctrl+C to stop.');
  console.log('');
});
