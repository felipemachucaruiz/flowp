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
  return new Promise((resolve) => {
    const script = `
      $printers = Get-Printer | Select-Object Name, Default | ConvertTo-Json
      $printers
    `;
    
    exec(`powershell -Command "${script}"`, { encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        console.error('Get printers error:', error);
        resolve([]);
        return;
      }
      
      try {
        let printers = JSON.parse(stdout || '[]');
        if (!Array.isArray(printers)) printers = [printers];
        resolve(printers.map(p => ({
          name: p.Name,
          isDefault: p.Default || false
        })));
      } catch (e) {
        console.error('Parse printers error:', e);
        resolve([]);
      }
    });
  });
}

// Print raw data to printer using Windows RAW printing
function printRaw(printerName, data) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `flowp-print-${Date.now()}.bin`);
    
    fs.writeFile(tempFile, data, (err) => {
      if (err) {
        reject(new Error(`Failed to write temp file: ${err.message}`));
        return;
      }
      
      // Use PowerShell to send raw data to printer
      const script = `
        $printer = Get-Printer -Name "${printerName.replace(/"/g, '`"')}" -ErrorAction SilentlyContinue
        if (-not $printer) {
          Write-Error "Printer not found: ${printerName}"
          exit 1
        }
        
        $port = (Get-PrinterPort -Name $printer.PortName -ErrorAction SilentlyContinue).Name
        if (-not $port) { $port = $printer.PortName }
        
        # Try direct file copy for USB printers
        try {
          $content = [System.IO.File]::ReadAllBytes("${tempFile.replace(/\\/g, '\\\\')}")
          $fs = [System.IO.File]::OpenWrite("\\\\.\\$port")
          $fs.Write($content, 0, $content.Length)
          $fs.Close()
        } catch {
          # Fallback: Use print spooler
          Start-Process -FilePath "cmd.exe" -ArgumentList "/c copy /b `"${tempFile.replace(/\\/g, '\\\\')}`" `"\\\\localhost\\${printerName.replace(/"/g, '')}`"" -NoNewWindow -Wait
        }
      `;
      
      exec(`powershell -Command "${script.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
        // Clean up temp file
        fs.unlink(tempFile, () => {});
        
        if (error) {
          // Try alternative method using COPY command
          const altCmd = `copy /b "${tempFile}" "\\\\localhost\\${printerName}"`;
          exec(altCmd, (altError) => {
            fs.unlink(tempFile, () => {});
            if (altError) {
              reject(new Error(`Print failed: ${stderr || error.message}`));
            } else {
              resolve({ success: true });
            }
          });
          return;
        }
        resolve({ success: true });
      });
    });
  });
}

// Convert image to ESC/POS bitmap
async function imageToEscPos(imageData, maxWidth = 384) {
  if (!Jimp) {
    throw new Error('Jimp not installed');
  }

  let image;
  if (imageData.startsWith('data:')) {
    const base64Data = imageData.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    image = await Jimp.read(buffer);
  } else if (imageData.startsWith('http')) {
    image = await Jimp.read(imageData);
  } else {
    const buffer = Buffer.from(imageData, 'base64');
    image = await Jimp.read(buffer);
  }

  if (image.getWidth() > maxWidth) {
    image.resize(maxWidth, Jimp.AUTO);
  }

  image.grayscale();
  
  const width = image.getWidth();
  const height = image.getHeight();
  const bytesPerLine = Math.ceil(width / 8);
  
  const commands = [];
  
  // GS v 0 - raster bit image
  commands.push(0x1D, 0x76, 0x30, 0x00);
  commands.push(bytesPerLine & 0xFF, (bytesPerLine >> 8) & 0xFF);
  commands.push(height & 0xFF, (height >> 8) & 0xFF);
  
  for (let y = 0; y < height; y++) {
    for (let byteX = 0; byteX < bytesPerLine; byteX++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteX * 8 + bit;
        if (x < width) {
          const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
          const gray = (pixel.r + pixel.g + pixel.b) / 3;
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
  const commands = [];
  
  // Initialize printer
  commands.push(0x1B, 0x40); // ESC @
  
  // Center alignment
  commands.push(0x1B, 0x61, 0x01);
  
  // Print logo if provided
  if (data.logo && Jimp) {
    try {
      const logoBuffer = await imageToEscPos(data.logo, data.logoWidth || 200);
      commands.push(...logoBuffer);
      commands.push(0x0A);
    } catch (e) {
      console.error('Logo error:', e.message);
    }
  }
  
  // Company name - double height/width
  if (data.companyName) {
    commands.push(0x1B, 0x21, 0x30);
    commands.push(...Buffer.from(data.companyName + '\n'));
    commands.push(0x1B, 0x21, 0x00);
  }
  
  // Header lines
  if (data.headerLines) {
    for (const line of data.headerLines) {
      commands.push(...Buffer.from(line + '\n'));
    }
  }
  
  commands.push(0x0A);
  
  // Left alignment
  commands.push(0x1B, 0x61, 0x00);
  
  // Order info
  if (data.orderNumber) {
    commands.push(...Buffer.from(`Order: ${data.orderNumber}\n`));
  }
  if (data.date) {
    commands.push(...Buffer.from(`Date: ${data.date}\n`));
  }
  if (data.cashier) {
    commands.push(...Buffer.from(`Cashier: ${data.cashier}\n`));
  }
  
  // Separator
  commands.push(...Buffer.from('--------------------------------\n'));
  
  // Items
  if (data.items) {
    for (const item of data.items) {
      const qty = item.quantity || 1;
      const name = (item.name || '').substring(0, 20);
      const total = (item.total || 0).toFixed(2);
      commands.push(...Buffer.from(`${qty}x ${name}\n`));
      commands.push(...Buffer.from(`   $${total}\n`));
    }
  }
  
  commands.push(...Buffer.from('--------------------------------\n'));
  
  // Right align for totals
  commands.push(0x1B, 0x61, 0x02);
  
  if (data.subtotal !== undefined) {
    commands.push(...Buffer.from(`Subtotal: $${data.subtotal.toFixed(2)}\n`));
  }
  if (data.taxAmount !== undefined) {
    commands.push(...Buffer.from(`Tax: $${data.taxAmount.toFixed(2)}\n`));
  }
  if (data.discount) {
    commands.push(...Buffer.from(`Discount: -$${data.discount.toFixed(2)}\n`));
  }
  
  // Total - emphasized
  commands.push(0x1B, 0x21, 0x30);
  commands.push(...Buffer.from(`TOTAL: $${(data.total || 0).toFixed(2)}\n`));
  commands.push(0x1B, 0x21, 0x00);
  
  // Payment info
  if (data.paymentMethod) {
    commands.push(...Buffer.from(`Paid: ${data.paymentMethod}\n`));
  }
  if (data.cashReceived) {
    commands.push(...Buffer.from(`Cash: $${data.cashReceived.toFixed(2)}\n`));
  }
  if (data.change) {
    commands.push(...Buffer.from(`Change: $${data.change.toFixed(2)}\n`));
  }
  
  // Center for footer
  commands.push(0x1B, 0x61, 0x01);
  commands.push(0x0A);
  
  if (data.footerLines) {
    for (const line of data.footerLines) {
      commands.push(...Buffer.from(line + '\n'));
    }
  }
  
  if (data.thankYouMessage) {
    commands.push(0x0A);
    commands.push(...Buffer.from(data.thankYouMessage + '\n'));
  }
  
  // Feed and cut
  commands.push(0x0A, 0x0A, 0x0A);
  commands.push(0x1D, 0x56, 0x00); // Full cut
  
  return Buffer.from(commands);
}

// Print receipt
async function printReceipt(printerName, receiptData) {
  const data = await buildReceipt(receiptData);
  return printRaw(printerName, data);
}

// Open cash drawer
function openCashDrawer(printerName) {
  // ESC p 0 25 250 - standard cash drawer command
  const drawerCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
  return printRaw(printerName, drawerCommand);
}

module.exports = {
  getPrinters,
  printRaw,
  printReceipt,
  openCashDrawer,
  imageToEscPos
};
