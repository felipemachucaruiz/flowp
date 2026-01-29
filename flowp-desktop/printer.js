const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let Jimp = null;
try {
  Jimp = require('jimp');
} catch (e) {
  console.log('Jimp not available - image printing disabled');
}

const platform = os.platform();

// Get list of available printers (cross-platform)
function getPrinters() {
  return new Promise(function(resolve) {
    if (platform === 'win32') {
      // Windows: Use PowerShell Get-Printer
      const script = '$printers = Get-Printer | Select-Object Name, Default | ConvertTo-Json; $printers';
      
      exec('powershell -Command "' + script + '"', { encoding: 'utf8' }, function(error, stdout) {
        if (error) {
          console.error('Get printers error:', error);
          resolve([]);
          return;
        }
        
        try {
          var printers = JSON.parse(stdout || '[]');
          if (!Array.isArray(printers)) printers = [printers];
          resolve(printers.map(function(p) {
            return {
              name: p.Name,
              isDefault: p.Default || false
            };
          }));
        } catch (e) {
          console.error('Parse printers error:', e);
          resolve([]);
        }
      });
    } else if (platform === 'darwin') {
      // macOS: Use lpstat to list printers
      exec('lpstat -p -d', { encoding: 'utf8' }, function(error, stdout) {
        if (error) {
          console.error('Get printers error:', error);
          resolve([]);
          return;
        }
        
        try {
          var printers = [];
          var defaultPrinter = '';
          var lines = stdout.split('\n');
          
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            // Parse printer lines: "printer PrinterName is idle..."
            var printerMatch = line.match(/^printer\s+(\S+)\s+/);
            if (printerMatch) {
              printers.push({
                name: printerMatch[1],
                isDefault: false
              });
            }
            // Parse default: "system default destination: PrinterName"
            var defaultMatch = line.match(/system default destination:\s*(\S+)/);
            if (defaultMatch) {
              defaultPrinter = defaultMatch[1];
            }
          }
          
          // Mark default printer
          for (var j = 0; j < printers.length; j++) {
            if (printers[j].name === defaultPrinter) {
              printers[j].isDefault = true;
            }
          }
          
          resolve(printers);
        } catch (e) {
          console.error('Parse printers error:', e);
          resolve([]);
        }
      });
    } else {
      // Linux: Also uses CUPS/lpstat
      exec('lpstat -p -d 2>/dev/null', { encoding: 'utf8' }, function(error, stdout) {
        if (error) {
          resolve([]);
          return;
        }
        
        var printers = [];
        var defaultPrinter = '';
        var lines = (stdout || '').split('\n');
        
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          var printerMatch = line.match(/^printer\s+(\S+)\s+/);
          if (printerMatch) {
            printers.push({ name: printerMatch[1], isDefault: false });
          }
          var defaultMatch = line.match(/system default destination:\s*(\S+)/);
          if (defaultMatch) {
            defaultPrinter = defaultMatch[1];
          }
        }
        
        for (var j = 0; j < printers.length; j++) {
          if (printers[j].name === defaultPrinter) {
            printers[j].isDefault = true;
          }
        }
        
        resolve(printers);
      });
    }
  });
}

// Print raw data to printer (cross-platform)
function printRaw(printerName, data) {
  return new Promise(function(resolve, reject) {
    var tempFile = path.join(os.tmpdir(), 'flowp-print-' + Date.now() + '.bin');
    
    fs.writeFile(tempFile, data, function(err) {
      if (err) {
        reject(new Error('Failed to write temp file: ' + err.message));
        return;
      }
      
      if (platform === 'win32') {
        // Windows: Use PowerShell RawPrinterHelper
        printRawWindows(printerName, tempFile, resolve, reject);
      } else if (platform === 'darwin' || platform === 'linux') {
        // macOS/Linux: Use CUPS lp command
        printRawCups(printerName, tempFile, resolve, reject);
      } else {
        fs.unlink(tempFile, function() {});
        reject(new Error('Unsupported platform: ' + platform));
      }
    });
  });
}

// Windows RAW printing using Print Spooler API via .ps1 script file
function printRawWindows(printerName, tempFile, resolve, reject) {
  var safePrinter = printerName.replace(/'/g, "''");
  var safeFilePath = tempFile.replace(/\\/g, '\\\\');
  
  // Create a .ps1 script file to avoid PowerShell escaping issues
  var psScriptPath = path.join(os.tmpdir(), 'flowp-print-' + Date.now() + '.ps1');
  
  var psScript = `
param([string]$PrinterName, [string]$FilePath)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    
    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    
    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    
    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
    
    public static bool SendBytesToPrinter(string szPrinterName, IntPtr pBytes, Int32 dwCount)
    {
        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Flowp Receipt";
        di.pDataType = "RAW";
        
        if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero))
        {
            if (StartDocPrinter(hPrinter, 1, di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    int written = 0;
                    WritePrinter(hPrinter, pBytes, dwCount, out written);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
            return true;
        }
        return false;
    }
    
    public static bool SendFileToPrinter(string szPrinterName, string szFileName)
    {
        byte[] bytes = System.IO.File.ReadAllBytes(szFileName);
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
        bool result = SendBytesToPrinter(szPrinterName, pUnmanagedBytes, bytes.Length);
        Marshal.FreeCoTaskMem(pUnmanagedBytes);
        return result;
    }
}
"@

$result = [RawPrinterHelper]::SendFileToPrinter($PrinterName, $FilePath)
if (-not $result) { throw "Failed to send data to printer" }
Write-Output "OK"
`;
  
  // Write the script to a file
  fs.writeFile(psScriptPath, psScript, 'utf8', function(writeErr) {
    if (writeErr) {
      fs.unlink(tempFile, function() {});
      reject(new Error('Failed to create print script: ' + writeErr.message));
      return;
    }
    
    // Execute the script with parameters
    var cmd = 'powershell -ExecutionPolicy Bypass -File "' + psScriptPath + '" -PrinterName "' + safePrinter + '" -FilePath "' + tempFile + '"';
    
    exec(cmd, { maxBuffer: 1024 * 1024 }, function(error, stdout, stderr) {
      // Cleanup both files
      fs.unlink(tempFile, function() {});
      fs.unlink(psScriptPath, function() {});
      
      if (error) {
        reject(new Error('Print failed: ' + (stderr || error.message)));
      } else {
        resolve({ success: true });
      }
    });
  });
}

// macOS/Linux RAW printing using CUPS lp command
function printRawCups(printerName, tempFile, resolve, reject) {
  // Use lp with raw option for ESC/POS data
  var safePrinter = printerName.replace(/'/g, "'\\''");
  var cmd = "lp -d '" + safePrinter + "' -o raw '" + tempFile.replace(/'/g, "'\\''") + "'";
  
  exec(cmd, { encoding: 'utf8' }, function(error, stdout, stderr) {
    fs.unlink(tempFile, function() {});
    
    if (error) {
      reject(new Error('Print failed: ' + (stderr || error.message)));
    } else {
      resolve({ success: true });
    }
  });
}

// Convert image to ESC/POS bitmap
async function imageToEscPos(imageData, maxWidth) {
  if (!maxWidth) maxWidth = 384;
  if (!Jimp) {
    throw new Error('Jimp not installed');
  }

  var image;
  if (imageData.startsWith('data:')) {
    var base64Data = imageData.split(',')[1];
    var buffer = Buffer.from(base64Data, 'base64');
    image = await Jimp.read(buffer);
  } else if (imageData.startsWith('http')) {
    image = await Jimp.read(imageData);
  } else {
    var buf = Buffer.from(imageData, 'base64');
    image = await Jimp.read(buf);
  }

  if (image.getWidth() > maxWidth) {
    image.resize(maxWidth, Jimp.AUTO);
  }

  image.grayscale();
  
  var width = image.getWidth();
  var height = image.getHeight();
  var bytesPerLine = Math.ceil(width / 8);
  
  var commands = [];
  
  // GS v 0 - raster bit image
  commands.push(0x1D, 0x76, 0x30, 0x00);
  commands.push(bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF);
  commands.push(height & 0xFF, (height >> 8) & 0xFF);
  
  for (var y = 0; y < height; y++) {
    for (var byteX = 0; byteX < bytesPerLine; byteX++) {
      var byte = 0;
      for (var bit = 0; bit < 8; bit++) {
        var x = byteX * 8 + bit;
        if (x < width) {
          var pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          var gray = (pixel.r + pixel.g + pixel.b) / 3;
          if (gray < 128) {
            byte |= (0x80 >> bit);
          }
        }
      }
      commands.push(byte);
    }
  }
  
  return Buffer.from(commands);
}

// Fetch image from URL and convert to base64
async function fetchImageAsBase64(url) {
  if (!url) return null;
  
  try {
    // Handle relative URLs by prepending the production domain
    var fullUrl = url;
    if (url.startsWith('/')) {
      fullUrl = 'https://pos.flowp.app' + url;
    }
    
    const https = require('https');
    const http = require('http');
    const protocol = fullUrl.startsWith('https') ? https : http;
    
    return new Promise(function(resolve) {
      protocol.get(fullUrl, function(response) {
        if (response.statusCode !== 200) {
          console.log('Failed to fetch image:', response.statusCode);
          resolve(null);
          return;
        }
        
        var chunks = [];
        response.on('data', function(chunk) { chunks.push(chunk); });
        response.on('end', function() {
          var buffer = Buffer.concat(chunks);
          resolve('data:image/png;base64,' + buffer.toString('base64'));
        });
        response.on('error', function() { resolve(null); });
      }).on('error', function() { resolve(null); });
    });
  } catch (e) {
    console.error('Fetch image error:', e);
    return null;
  }
}

// Build ESC/POS receipt from structured data
async function buildReceipt(data) {
  var commands = [];
  
  // Initialize printer
  commands.push(0x1B, 0x40); // ESC @
  
  // Center alignment
  commands.push(0x1B, 0x61, 0x01);
  
  // Print logo if provided (support both 'logo' and 'logoUrl' field names)
  var logoSource = data.logo || data.logoUrl;
  if (logoSource && Jimp) {
    try {
      // If it's a URL, fetch it first
      var logoData = logoSource;
      if (logoSource.startsWith('http') || logoSource.startsWith('/')) {
        logoData = await fetchImageAsBase64(logoSource);
      }
      
      if (logoData) {
        var logoWidth = data.logoWidth || data.logoSize || 200;
        var logoBuffer = await imageToEscPos(logoData, logoWidth);
        commands.push.apply(commands, logoBuffer);
        commands.push(0x0A);
      }
    } catch (e) {
      console.error('Logo error:', e.message);
    }
  }
  
  // Company name - double height/width (support both field names)
  var companyName = data.companyName || data.businessName;
  if (companyName) {
    commands.push(0x1B, 0x21, 0x30);
    commands.push.apply(commands, Buffer.from(companyName + '\n'));
    commands.push(0x1B, 0x21, 0x00);
  }
  
  // Header text (support single headerText or headerLines array)
  if (data.headerText) {
    commands.push.apply(commands, Buffer.from(data.headerText + '\n'));
  }
  if (data.headerLines) {
    for (var i = 0; i < data.headerLines.length; i++) {
      commands.push.apply(commands, Buffer.from(data.headerLines[i] + '\n'));
    }
  }
  
  // Address and phone
  if (data.address) {
    commands.push.apply(commands, Buffer.from(data.address + '\n'));
  }
  if (data.phone) {
    commands.push.apply(commands, Buffer.from('Tel: ' + data.phone + '\n'));
  }
  if (data.taxId) {
    commands.push.apply(commands, Buffer.from('Tax ID: ' + data.taxId + '\n'));
  }
  
  commands.push(0x0A);
  
  // Left alignment
  commands.push(0x1B, 0x61, 0x00);
  
  // Order info
  if (data.orderNumber) {
    commands.push.apply(commands, Buffer.from('Order: ' + data.orderNumber + '\n'));
  }
  if (data.date) {
    commands.push.apply(commands, Buffer.from('Date: ' + data.date + '\n'));
  }
  if (data.cashier) {
    commands.push.apply(commands, Buffer.from('Cashier: ' + data.cashier + '\n'));
  }
  if (data.customer) {
    commands.push.apply(commands, Buffer.from('Customer: ' + data.customer + '\n'));
  }
  
  // Separator
  commands.push.apply(commands, Buffer.from('--------------------------------\n'));
  
  // Get currency symbol (moved up for items)
  var currencySymbol = '$';
  if (data.currency) {
    var currencyMap = { 'USD': '$', 'EUR': '\u20AC', 'GBP': '\u00A3', 'COP': '$', 'BRL': 'R$', 'MXN': '$' };
    currencySymbol = currencyMap[data.currency] || data.currency + ' ';
  }
  
  // Items
  if (data.items) {
    for (var j = 0; j < data.items.length; j++) {
      var item = data.items[j];
      var qty = item.quantity || 1;
      var name = (item.name || '').substring(0, 20);
      var itemTotal = item.total || 0;
      var unitPrice = item.unitPrice || item.price || 0;
      
      // Item line with quantity and name
      commands.push.apply(commands, Buffer.from(qty + 'x ' + name + '\n'));
      
      // Price line - show unit price if different from total (when qty > 1)
      if (qty > 1 && unitPrice > 0) {
        commands.push.apply(commands, Buffer.from('   @' + currencySymbol + formatNumber(unitPrice) + ' = ' + currencySymbol + formatNumber(itemTotal) + '\n'));
      } else {
        commands.push.apply(commands, Buffer.from('   ' + currencySymbol + formatNumber(itemTotal) + '\n'));
      }
      
      // Modifiers if any
      if (item.modifiers && item.modifiers.length > 0) {
        var mods = Array.isArray(item.modifiers) ? item.modifiers.join(', ') : item.modifiers;
        commands.push.apply(commands, Buffer.from('   + ' + mods + '\n'));
      }
    }
  }
  
  commands.push.apply(commands, Buffer.from('--------------------------------\n'));
  
  // Right align for totals
  commands.push(0x1B, 0x61, 0x02);
  
  if (data.subtotal !== undefined) {
    commands.push.apply(commands, Buffer.from('Subtotal: ' + currencySymbol + formatNumber(data.subtotal) + '\n'));
  }
  
  // Support both 'tax' and 'taxAmount' field names
  var taxAmount = data.tax !== undefined ? data.tax : data.taxAmount;
  if (taxAmount !== undefined && taxAmount > 0) {
    var taxLabel = 'Tax';
    if (data.taxRate) {
      taxLabel = 'Tax (' + data.taxRate + '%)';
    }
    commands.push.apply(commands, Buffer.from(taxLabel + ': ' + currencySymbol + formatNumber(taxAmount) + '\n'));
  }
  
  if (data.discount && data.discount > 0) {
    var discountLabel = 'Discount';
    if (data.discountPercent) {
      discountLabel = 'Discount (' + data.discountPercent + '%)';
    }
    commands.push.apply(commands, Buffer.from(discountLabel + ': -' + currencySymbol + formatNumber(data.discount) + '\n'));
  }
  
  // Total - emphasized
  commands.push(0x1B, 0x21, 0x30);
  commands.push.apply(commands, Buffer.from('TOTAL: ' + currencySymbol + formatNumber(data.total || 0) + '\n'));
  commands.push(0x1B, 0x21, 0x00);
  
  // Payment info - support payments array
  if (data.payments && data.payments.length > 0) {
    commands.push(0x0A);
    for (var p = 0; p < data.payments.length; p++) {
      var payment = data.payments[p];
      var payType = payment.type ? payment.type.toUpperCase() : 'PAYMENT';
      commands.push.apply(commands, Buffer.from(payType + ': ' + currencySymbol + formatNumber(payment.amount) + '\n'));
    }
  } else if (data.paymentMethod) {
    commands.push.apply(commands, Buffer.from('Paid: ' + data.paymentMethod + '\n'));
  }
  
  if (data.cashReceived) {
    commands.push.apply(commands, Buffer.from('Cash: ' + currencySymbol + formatNumber(data.cashReceived) + '\n'));
  }
  if (data.change && data.change > 0) {
    commands.push.apply(commands, Buffer.from('Change: ' + currencySymbol + formatNumber(data.change) + '\n'));
  }
  
  // Center for footer
  commands.push(0x1B, 0x61, 0x01);
  commands.push(0x0A);
  
  // Footer text (support both footerText and footerLines)
  if (data.footerText) {
    commands.push.apply(commands, Buffer.from(data.footerText + '\n'));
  }
  if (data.footerLines) {
    for (var k = 0; k < data.footerLines.length; k++) {
      commands.push.apply(commands, Buffer.from(data.footerLines[k] + '\n'));
    }
  }
  
  if (data.thankYouMessage) {
    commands.push(0x0A);
    commands.push.apply(commands, Buffer.from(data.thankYouMessage + '\n'));
  }
  
  // Feed and cut
  commands.push(0x0A, 0x0A, 0x0A);
  
  // Cut paper if requested (default true)
  if (data.cutPaper !== false) {
    commands.push(0x1D, 0x56, 0x00); // Full cut
  }
  
  return Buffer.from(commands);
}

// Format number with proper decimal places
function formatNumber(num) {
  if (typeof num !== 'number') num = parseFloat(num) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Print receipt
async function printReceipt(printerName, receiptData) {
  var data = await buildReceipt(receiptData);
  return printRaw(printerName, data);
}

// Open cash drawer
function openCashDrawer(printerName) {
  // ESC p 0 25 250 - standard cash drawer command
  var drawerCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
  return printRaw(printerName, drawerCommand);
}

// Get platform info
function getPlatform() {
  return {
    platform: platform,
    isWindows: platform === 'win32',
    isMac: platform === 'darwin',
    isLinux: platform === 'linux'
  };
}

module.exports = {
  getPrinters: getPrinters,
  printRaw: printRaw,
  printReceipt: printReceipt,
  openCashDrawer: openCashDrawer,
  imageToEscPos: imageToEscPos,
  getPlatform: getPlatform
};
