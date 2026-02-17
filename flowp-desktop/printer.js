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

// Encode text to the printer's code page (Latin-1/CP858 for Spanish/Portuguese)
function encodeText(text) {
  try {
    var buf = Buffer.alloc(text.length);
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code <= 0xFF) {
        buf[i] = code;
      } else {
        buf[i] = 0x3F; // '?' for unmappable chars
      }
    }
    return buf;
  } catch (e) {
    return Buffer.from(text, 'latin1');
  }
}

// Determine max print width in dots based on paper size
function getPaperWidthDots(data) {
  var paperWidth = data.paperWidth || '80mm';
  if (paperWidth === '58mm' || paperWidth === 58) return 384;
  return 576; // 80mm default
}

// Determine max characters per line based on paper size
function getCharsPerLine(data) {
  var paperWidth = data.paperWidth || '80mm';
  if (paperWidth === '58mm' || paperWidth === 58) return 32;
  return 42; // 80mm default (Font A)
}

// Build ESC/POS receipt from structured data
async function buildReceipt(data) {
  var commands = [];
  var maxDots = getPaperWidthDots(data);
  var charsPerLine = getCharsPerLine(data);
  var separator = '-'.repeat(charsPerLine) + '\n';
  
  // Initialize printer
  commands.push(0x1B, 0x40); // ESC @
  
  // Set character code table to CP858 (Western European with €)
  // ESC t n: n=19 for CP858, n=16 for WPC1252
  commands.push(0x1B, 0x74, 0x13);
  
  // Open cash drawer FIRST if requested (before receipt prints)
  if (data.openCashDrawer) {
    // ESC p 0 t1 t2 - kick cash drawer pin 2
    commands.push(0x1B, 0x70, 0x00, 0x32, 0xFA);
    // Also try pin 5 for compatibility with different drawer models
    commands.push(0x1B, 0x70, 0x01, 0x32, 0xFA);
  }
  
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
        var logoWidth = data.logoWidth || data.logoSize || maxDots;
        if (logoWidth > maxDots) logoWidth = maxDots;
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
    commands.push.apply(commands, encodeText(companyName + '\n'));
    commands.push(0x1B, 0x21, 0x00);
  }
  
  // Header text (support single headerText or headerLines array)
  if (data.headerText) {
    commands.push.apply(commands, encodeText(data.headerText + '\n'));
  }
  if (data.headerLines) {
    for (var i = 0; i < data.headerLines.length; i++) {
      commands.push.apply(commands, encodeText(data.headerLines[i] + '\n'));
    }
  }
  
  // Translations based on language
  var lang = data.language || 'en';
  var t = {
    en: {
      tel: 'Tel',
      taxId: 'Tax ID',
      order: 'Order',
      date: 'Date',
      cashier: 'Cashier',
      customer: 'Customer',
      subtotal: 'Subtotal',
      tax: 'Tax',
      discount: 'Discount',
      total: 'TOTAL',
      paid: 'Paid',
      cash: 'Cash',
      change: 'Change',
      points: 'Points'
    },
    es: {
      tel: 'Tel',
      taxId: 'NIT',
      order: 'Orden',
      date: 'Fecha',
      cashier: 'Cajero',
      customer: 'Cliente',
      subtotal: 'Subtotal',
      tax: 'IVA',
      discount: 'Descuento',
      total: 'TOTAL',
      paid: 'Pagado',
      cash: 'Efectivo',
      change: 'Cambio',
      points: 'Puntos'
    },
    pt: {
      tel: 'Tel',
      taxId: 'CNPJ',
      order: 'Pedido',
      date: 'Data',
      cashier: 'Caixa',
      customer: 'Cliente',
      subtotal: 'Subtotal',
      tax: 'Imposto',
      discount: 'Desconto',
      total: 'TOTAL',
      paid: 'Pago',
      cash: 'Dinheiro',
      change: 'Troco',
      points: 'Pontos'
    }
  };
  var tr = t[lang] || t.en;
  
  // Address and phone
  if (data.address) {
    commands.push.apply(commands, encodeText(data.address + '\n'));
  }
  if (data.phone) {
    commands.push.apply(commands, encodeText(tr.tel + ': ' + data.phone + '\n'));
  }
  if (data.taxId) {
    var taxIdLabel = data.taxIdLabel || tr.taxId;
    commands.push.apply(commands, encodeText(taxIdLabel + ': ' + data.taxId + '\n'));
  }
  
  commands.push(0x0A);
  
  // Left alignment
  commands.push(0x1B, 0x61, 0x00);
  
  // Order info
  if (data.orderNumber) {
    commands.push.apply(commands, encodeText(tr.order + ': ' + data.orderNumber + '\n'));
  }
  if (data.date) {
    commands.push.apply(commands, encodeText(tr.date + ': ' + data.date + '\n'));
  }
  if (data.cashier) {
    commands.push.apply(commands, encodeText(tr.cashier + ': ' + data.cashier + '\n'));
  }
  
  // Customer info section (detailed for e-billing)
  if (data.customerInfo) {
    commands.push.apply(commands, encodeText(separator));
    commands.push.apply(commands, encodeText(tr.customer.toUpperCase() + ':\n'));
    
    if (data.customerInfo.name) {
      commands.push.apply(commands, encodeText(data.customerInfo.name + '\n'));
    }
    if (data.customerInfo.idNumber) {
      var idLabel = 'ID';
      if (data.customerInfo.idType === 'nit') idLabel = 'NIT';
      else if (data.customerInfo.idType === 'cedula_ciudadania') idLabel = 'CC';
      else if (data.customerInfo.idType === 'cedula_extranjeria') idLabel = 'CE';
      else if (data.customerInfo.idType === 'pasaporte') idLabel = 'PAS';
      commands.push.apply(commands, encodeText(idLabel + ': ' + data.customerInfo.idNumber + '\n'));
    }
    if (data.customerInfo.phone) {
      commands.push.apply(commands, encodeText('Tel: ' + data.customerInfo.phone + '\n'));
    }
    if (data.customerInfo.email) {
      commands.push.apply(commands, encodeText(data.customerInfo.email + '\n'));
    }
    if (data.customerInfo.address) {
      commands.push.apply(commands, encodeText(data.customerInfo.address + '\n'));
    }
    if (data.customerInfo.loyaltyPoints != null && data.customerInfo.loyaltyPoints > 0) {
      commands.push.apply(commands, encodeText(tr.points + ': ' + data.customerInfo.loyaltyPoints.toLocaleString() + '\n'));
    }
  } else if (data.customer) {
    // Fallback to simple customer name
    commands.push.apply(commands, encodeText(tr.customer + ': ' + data.customer + '\n'));
  }
  
  // Separator
  commands.push.apply(commands, encodeText(separator));
  
  // Get currency symbol (moved up for items)
  var currencySymbol = '$';
  if (data.currency) {
    var currencyMap = { 'USD': '$', 'EUR': '\u20AC', 'GBP': '\u00A3', 'COP': '$', 'BRL': 'R$', 'MXN': '$' };
    currencySymbol = currencyMap[data.currency] || data.currency + ' ';
  }
  
  // Max chars for item name: leave room for "99x " prefix
  var maxNameChars = charsPerLine - 4;
  
  // Items
  if (data.items) {
    for (var j = 0; j < data.items.length; j++) {
      var item = data.items[j];
      var qty = item.quantity || 1;
      var rawName = item.name || '';
      var itemTotal = item.total || 0;
      var unitPrice = item.unitPrice || item.price || 0;
      
      // Word-wrap long item names across multiple lines
      var qtyPrefix = qty + 'x ';
      if (rawName.length <= maxNameChars) {
        commands.push.apply(commands, encodeText(qtyPrefix + rawName + '\n'));
      } else {
        // First line with qty prefix
        commands.push.apply(commands, encodeText(qtyPrefix + rawName.substring(0, maxNameChars) + '\n'));
        // Continuation lines indented to align with name
        var indent = '   ';
        var remaining = rawName.substring(maxNameChars);
        var wrapWidth = charsPerLine - indent.length;
        while (remaining.length > 0) {
          commands.push.apply(commands, encodeText(indent + remaining.substring(0, wrapWidth) + '\n'));
          remaining = remaining.substring(wrapWidth);
        }
      }
      
      // Line 2: right-aligned total (with unit price if qty > 1)
      commands.push(0x1B, 0x61, 0x02); // Right align
      if (qty > 1 && unitPrice > 0) {
        commands.push.apply(commands, encodeText('@' + currencySymbol + formatNumber(unitPrice) + ' = ' + currencySymbol + formatNumber(itemTotal) + '\n'));
      } else {
        commands.push.apply(commands, encodeText(currencySymbol + formatNumber(itemTotal) + '\n'));
      }
      commands.push(0x1B, 0x61, 0x00); // Back to left align
      
      // Modifiers if any
      if (item.modifiers && item.modifiers.length > 0) {
        var mods = Array.isArray(item.modifiers) ? item.modifiers.join(', ') : item.modifiers;
        commands.push.apply(commands, encodeText('  + ' + mods + '\n'));
      }
    }
  }
  
  commands.push.apply(commands, encodeText(separator));
  
  // Right align for totals
  commands.push(0x1B, 0x61, 0x02);
  
  if (data.subtotal !== undefined) {
    commands.push.apply(commands, encodeText(tr.subtotal + ': ' + currencySymbol + formatNumber(data.subtotal) + '\n'));
  }
  
  // Support taxes array (individual tax lines) or single tax amount
  if (data.taxes && data.taxes.length > 0) {
    for (var ti = 0; ti < data.taxes.length; ti++) {
      var taxEntry = data.taxes[ti];
      // Abbreviate long tax names to fit thermal paper
      var taxName = taxEntry.name || tr.tax;
      if (taxName.length > 18) {
        var dashIndex = taxName.indexOf(' - ');
        if (dashIndex > 0) {
          taxName = taxName.substring(0, dashIndex);
        } else {
          taxName = taxName.substring(0, 18);
        }
      }
      var taxLineLabel = taxName + ' (' + (taxEntry.rate || 0) + '%)';
      commands.push.apply(commands, encodeText(taxLineLabel + ': ' + currencySymbol + formatNumber(taxEntry.amount || 0) + '\n'));
    }
  } else {
    // Support both 'tax' and 'taxAmount' field names (single tax)
    var taxAmount = data.tax !== undefined ? data.tax : data.taxAmount;
    if (taxAmount !== undefined && taxAmount > 0) {
      var taxLabel = tr.tax;
      if (data.taxRate) {
        taxLabel = tr.tax + ' (' + data.taxRate + '%)';
      }
      commands.push.apply(commands, encodeText(taxLabel + ': ' + currencySymbol + formatNumber(taxAmount) + '\n'));
    }
  }
  
  if (data.discount && data.discount > 0) {
    var discountLabel = tr.discount;
    if (data.discountPercent) {
      discountLabel = tr.discount + ' (' + data.discountPercent + '%)';
    }
    commands.push.apply(commands, encodeText(discountLabel + ': -' + currencySymbol + formatNumber(data.discount) + '\n'));
  }
  
  // Total - emphasized
  commands.push(0x1B, 0x21, 0x30);
  commands.push.apply(commands, encodeText(tr.total + ': ' + currencySymbol + formatNumber(data.total || 0) + '\n'));
  commands.push(0x1B, 0x21, 0x00);
  
  // Payment info - support payments array
  if (data.payments && data.payments.length > 0) {
    commands.push(0x0A);
    var paymentLabels = { 'cash': tr.cash, 'card': (lang === 'es' ? 'Tarjeta' : lang === 'pt' ? 'Cart\u00E3o' : 'Card') };
    for (var p = 0; p < data.payments.length; p++) {
      var payment = data.payments[p];
      var payType = paymentLabels[payment.type] || (payment.type ? payment.type.toUpperCase() : 'PAYMENT');
      commands.push.apply(commands, encodeText(payType + ': ' + currencySymbol + formatNumber(payment.amount) + '\n'));
    }
  } else if (data.paymentMethod) {
    commands.push.apply(commands, encodeText(tr.paid + ': ' + data.paymentMethod + '\n'));
  }
  
  if (data.cashReceived) {
    commands.push.apply(commands, encodeText(tr.cash + ': ' + currencySymbol + formatNumber(data.cashReceived) + '\n'));
  }
  if (data.change && data.change > 0) {
    commands.push.apply(commands, encodeText(tr.change + ': ' + currencySymbol + formatNumber(data.change) + '\n'));
  }
  
  // Center for footer
  commands.push(0x1B, 0x61, 0x01);
  commands.push(0x0A);
  
  // Footer text (support both footerText and footerLines)
  if (data.footerText) {
    commands.push.apply(commands, encodeText(data.footerText + '\n'));
  }
  if (data.footerLines) {
    for (var k = 0; k < data.footerLines.length; k++) {
      commands.push.apply(commands, encodeText(data.footerLines[k] + '\n'));
    }
  }
  
  if (data.thankYouMessage) {
    commands.push(0x0A);
    commands.push.apply(commands, encodeText(data.thankYouMessage + '\n'));
  }
  
  // Electronic Billing section (DIAN - Colombia)
  if (data.electronicBilling && data.electronicBilling.cufe) {
    commands.push(0x0A);
    
    // Separator
    commands.push(0x1B, 0x61, 0x01); // Center
    commands.push.apply(commands, encodeText(separator));
    
    // Electronic Invoice header - emphasized
    commands.push(0x1B, 0x21, 0x30); // Double height/width
    var invoiceLabel = data.language === 'es' ? 'FACTURA ELECTRONICA' : 
                       data.language === 'pt' ? 'FATURA ELETRONICA' : 'ELECTRONIC INVOICE';
    if (data.electronicBilling.prefix && data.electronicBilling.documentNumber) {
      invoiceLabel += ' #:';
    }
    commands.push.apply(commands, encodeText(invoiceLabel + '\n'));
    commands.push(0x1B, 0x21, 0x00); // Normal
    
    // Invoice number (prefix + number)
    if (data.electronicBilling.prefix && data.electronicBilling.documentNumber) {
      commands.push(0x1B, 0x21, 0x10); // Double width
      commands.push.apply(commands, encodeText(data.electronicBilling.prefix + data.electronicBilling.documentNumber + '\n'));
      commands.push(0x1B, 0x21, 0x00); // Normal
    }
    
    commands.push(0x0A);
    
    // QR Code - print as bitmap if available
    var qrContent = data.electronicBilling.qrCode;
    if (!qrContent && data.electronicBilling.cufe) {
      qrContent = 'https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=' + data.electronicBilling.cufe;
    }
    
    if (qrContent && Jimp) {
      try {
        var QRCode = null;
        try {
          QRCode = require('qrcode');
        } catch (e) {
          console.log('QRCode library not available');
        }
        
        if (QRCode) {
          var qrDataUrl = await QRCode.toDataURL(qrContent, {
            width: 200,
            margin: 1,
            errorCorrectionLevel: 'M'
          });
          
          var qrBuffer = await imageToEscPos(qrDataUrl, 200);
          commands.push.apply(commands, qrBuffer);
          commands.push(0x0A);
        }
      } catch (e) {
        console.error('QR code generation error:', e.message);
      }
    }
    
    // CUFE - small font, word-wrapped based on paper size
    commands.push(0x1B, 0x4D, 0x01); // Select font B (smaller)
    commands.push.apply(commands, encodeText('CUFE:\n'));
    
    // Font B chars per line: ~42 for 58mm, ~56 for 80mm
    var cufe = data.electronicBilling.cufe;
    var cufeChunkSize = charsPerLine === 32 ? 42 : 56;
    for (var i = 0; i < cufe.length; i += cufeChunkSize) {
      commands.push.apply(commands, encodeText(cufe.substring(i, i + cufeChunkSize) + '\n'));
    }
    
    commands.push(0x1B, 0x4D, 0x00); // Back to font A (normal)
    commands.push(0x0A);
  }
  
  // Coupon section
  if (data.couponEnabled && data.couponLines && data.couponLines.length > 0) {
    commands.push(0x0A);
    
    // Dashed separator for coupon
    var dashedSep = ('- ').repeat(Math.floor(charsPerLine / 2)) + '\n';
    commands.push(0x1B, 0x61, 0x01); // Center
    commands.push.apply(commands, encodeText(dashedSep));
    
    // "COUPON" header - emphasized
    commands.push(0x1B, 0x21, 0x30); // Double height/width
    var couponLabel = data.language === 'es' ? 'CUP\u00D3N' : data.language === 'pt' ? 'CUPOM' : 'COUPON';
    commands.push.apply(commands, encodeText(couponLabel + '\n'));
    commands.push(0x1B, 0x21, 0x00); // Normal
    commands.push(0x0A);
    
    // Coupon content lines
    for (var cl = 0; cl < data.couponLines.length; cl++) {
      var couponLine = data.couponLines[cl];
      var lineText = couponLine.text || '';
      
      // Set alignment
      var alignCode = 0x01; // Center default
      if (couponLine.align === 'left') alignCode = 0x00;
      else if (couponLine.align === 'right') alignCode = 0x02;
      commands.push(0x1B, 0x61, alignCode);
      
      // Set emphasis based on size/bold
      if (couponLine.size === 'xlarge' || couponLine.size === 'large') {
        commands.push(0x1B, 0x21, 0x30); // Double height/width
      } else if (couponLine.bold) {
        commands.push(0x1B, 0x45, 0x01); // Bold on
      }
      
      commands.push.apply(commands, encodeText(lineText + '\n'));
      
      // Reset formatting
      if (couponLine.size === 'xlarge' || couponLine.size === 'large') {
        commands.push(0x1B, 0x21, 0x00);
      } else if (couponLine.bold) {
        commands.push(0x1B, 0x45, 0x00); // Bold off
      }
    }
    
    // Dashed separator
    commands.push(0x1B, 0x61, 0x01); // Center
    commands.push.apply(commands, encodeText(dashedSep));
  }
  
  // FLOWP Promotional Footer - always print at the end
  commands.push(0x0A);
  commands.push(0x1B, 0x61, 0x01); // Center
  commands.push.apply(commands, encodeText(separator));
  commands.push(0x1B, 0x4D, 0x01); // Smaller font
  commands.push.apply(commands, encodeText('Controla todo tu flujo con FLOWP.app\n'));
  commands.push.apply(commands, encodeText('Activa tu prueba gratis por 30 d\u00EDas.\n'));
  commands.push(0x1B, 0x45, 0x01); // Bold on
  commands.push.apply(commands, encodeText('Software Cloud para tiendas, FLOWP\n'));
  commands.push(0x1B, 0x45, 0x00); // Bold off
  commands.push(0x1B, 0x4D, 0x00); // Back to normal font
  
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
  // Send cash drawer kick on both pins for maximum compatibility
  // ESC p m t1 t2 - m=pin (0=pin2, 1=pin5), t1=on-time, t2=off-time
  var drawerCommand = Buffer.from([
    0x1B, 0x70, 0x00, 0x32, 0xFA,  // Pin 2: on=100ms, off=500ms
    0x1B, 0x70, 0x01, 0x32, 0xFA   // Pin 5: on=100ms, off=500ms
  ]);
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
