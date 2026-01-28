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

// Get list of available printers (Windows)
function getPrinters() {
  return new Promise(function(resolve) {
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
  });
}

// Print raw data to printer using Windows RAW printing
function printRaw(printerName, data) {
  return new Promise(function(resolve, reject) {
    var tempFile = path.join(os.tmpdir(), 'flowp-print-' + Date.now() + '.bin');
    var safePrinter = printerName.replace(/"/g, '');
    
    fs.writeFile(tempFile, data, function(err) {
      if (err) {
        reject(new Error('Failed to write temp file: ' + err.message));
        return;
      }
      
      // Use simple copy command to network printer share
      var copyCmd = 'copy /b "' + tempFile + '" "\\\\localhost\\' + safePrinter + '"';
      
      exec(copyCmd, { shell: 'cmd.exe' }, function(error, stdout, stderr) {
        fs.unlink(tempFile, function() {});
        
        if (error) {
          // Fallback: try PowerShell Out-Printer
          var psCmd = 'powershell -Command "Get-Content -Path \'' + tempFile.replace(/\\/g, '\\\\') + '\' -Encoding Byte -Raw | Out-Printer -Name \'' + safePrinter + '\'"';
          exec(psCmd, function(psError) {
            fs.unlink(tempFile, function() {});
            if (psError) {
              reject(new Error('Print failed: ' + (stderr || error.message)));
            } else {
              resolve({ success: true });
            }
          });
        } else {
          resolve({ success: true });
        }
      });
    });
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

// Build ESC/POS receipt from structured data
async function buildReceipt(data) {
  var commands = [];
  
  // Initialize printer
  commands.push(0x1B, 0x40); // ESC @
  
  // Center alignment
  commands.push(0x1B, 0x61, 0x01);
  
  // Print logo if provided
  if (data.logo && Jimp) {
    try {
      var logoBuffer = await imageToEscPos(data.logo, data.logoWidth || 200);
      commands.push.apply(commands, logoBuffer);
      commands.push(0x0A);
    } catch (e) {
      console.error('Logo error:', e.message);
    }
  }
  
  // Company name - double height/width
  if (data.companyName) {
    commands.push(0x1B, 0x21, 0x30);
    commands.push.apply(commands, Buffer.from(data.companyName + '\n'));
    commands.push(0x1B, 0x21, 0x00);
  }
  
  // Header lines
  if (data.headerLines) {
    for (var i = 0; i < data.headerLines.length; i++) {
      commands.push.apply(commands, Buffer.from(data.headerLines[i] + '\n'));
    }
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
  
  // Separator
  commands.push.apply(commands, Buffer.from('--------------------------------\n'));
  
  // Items
  if (data.items) {
    for (var j = 0; j < data.items.length; j++) {
      var item = data.items[j];
      var qty = item.quantity || 1;
      var name = (item.name || '').substring(0, 20);
      var total = (item.total || 0).toFixed(2);
      commands.push.apply(commands, Buffer.from(qty + 'x ' + name + '\n'));
      commands.push.apply(commands, Buffer.from('   $' + total + '\n'));
    }
  }
  
  commands.push.apply(commands, Buffer.from('--------------------------------\n'));
  
  // Right align for totals
  commands.push(0x1B, 0x61, 0x02);
  
  if (data.subtotal !== undefined) {
    commands.push.apply(commands, Buffer.from('Subtotal: $' + data.subtotal.toFixed(2) + '\n'));
  }
  if (data.taxAmount !== undefined) {
    commands.push.apply(commands, Buffer.from('Tax: $' + data.taxAmount.toFixed(2) + '\n'));
  }
  if (data.discount) {
    commands.push.apply(commands, Buffer.from('Discount: -$' + data.discount.toFixed(2) + '\n'));
  }
  
  // Total - emphasized
  commands.push(0x1B, 0x21, 0x30);
  commands.push.apply(commands, Buffer.from('TOTAL: $' + (data.total || 0).toFixed(2) + '\n'));
  commands.push(0x1B, 0x21, 0x00);
  
  // Payment info
  if (data.paymentMethod) {
    commands.push.apply(commands, Buffer.from('Paid: ' + data.paymentMethod + '\n'));
  }
  if (data.cashReceived) {
    commands.push.apply(commands, Buffer.from('Cash: $' + data.cashReceived.toFixed(2) + '\n'));
  }
  if (data.change) {
    commands.push.apply(commands, Buffer.from('Change: $' + data.change.toFixed(2) + '\n'));
  }
  
  // Center for footer
  commands.push(0x1B, 0x61, 0x01);
  commands.push(0x0A);
  
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
  commands.push(0x1D, 0x56, 0x00); // Full cut
  
  return Buffer.from(commands);
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

module.exports = {
  getPrinters: getPrinters,
  printRaw: printRaw,
  printReceipt: printReceipt,
  openCashDrawer: openCashDrawer,
  imageToEscPos: imageToEscPos
};
