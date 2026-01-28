const http = require('http');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9638;
const VERSION = '1.0.0';

let Jimp = null;
try {
  Jimp = require('jimp');
} catch (e) {
  console.log('Jimp not installed. Run: npm install jimp');
  console.log('Image printing will be disabled until Jimp is installed.\n');
}

// CORS headers for browser access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Get list of available printers using lpstat (CUPS)
function getPrinters() {
  return new Promise((resolve) => {
    exec('lpstat -p 2>/dev/null || echo ""', (error, stdout) => {
      if (error || !stdout.trim()) {
        // Try alternative method
        exec('lpstat -a 2>/dev/null || echo ""', (err2, stdout2) => {
          if (err2 || !stdout2.trim()) {
            resolve([]);
            return;
          }
          const printers = stdout2.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
              const name = line.split(' ')[0];
              return { name, isDefault: false };
            });
          resolve(printers);
        });
        return;
      }
      
      const printers = stdout.trim().split('\n')
        .filter(line => line.includes('printer'))
        .map(line => {
          const match = line.match(/printer\s+(\S+)/);
          const name = match ? match[1] : line.split(' ')[1];
          return { name, isDefault: false };
        });
      
      // Get default printer
      exec('lpstat -d 2>/dev/null || echo ""', (err, defaultOut) => {
        if (!err && defaultOut) {
          const defaultMatch = defaultOut.match(/destination:\s*(\S+)/);
          if (defaultMatch) {
            printers.forEach(p => {
              if (p.name === defaultMatch[1]) p.isDefault = true;
            });
          }
        }
        resolve(printers);
      });
    });
  });
}

// Convert image to ESC/POS bitmap commands
async function imageToEscPos(imageData, maxWidth = 384) {
  if (!Jimp) {
    throw new Error('Jimp not installed - cannot process images');
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

  // Resize if needed
  if (image.getWidth() > maxWidth) {
    image.resize(maxWidth, Jimp.AUTO);
  }

  // Convert to grayscale and threshold for 1-bit
  image.grayscale();
  
  const width = image.getWidth();
  const height = image.getHeight();
  const bytesPerLine = Math.ceil(width / 8);
  
  // ESC/POS raster bit image command
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

// Print raw data to printer using lp command
function printRaw(printerName, data) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `printbridge-${Date.now()}.bin`);
    
    fs.writeFile(tempFile, data, (err) => {
      if (err) {
        reject(new Error(`Failed to write temp file: ${err.message}`));
        return;
      }
      
      // Use lp command with raw option
      const cmd = `lp -d "${printerName}" -o raw "${tempFile}"`;
      
      exec(cmd, (error, stdout, stderr) => {
        // Clean up temp file
        fs.unlink(tempFile, () => {});
        
        if (error) {
          reject(new Error(`Print failed: ${stderr || error.message}`));
          return;
        }
        resolve({ success: true, output: stdout });
      });
    });
  });
}

// Build ESC/POS receipt from data
async function buildReceipt(data) {
  const commands = [];
  
  // Initialize printer
  commands.push(0x1B, 0x40); // ESC @
  
  // Center alignment for header
  commands.push(0x1B, 0x61, 0x01); // ESC a 1
  
  // Print logo if provided
  if (data.logo && Jimp) {
    try {
      const logoBuffer = await imageToEscPos(data.logo, data.logoWidth || 200);
      commands.push(...logoBuffer);
      commands.push(0x0A); // Line feed
    } catch (e) {
      console.error('Logo print error:', e.message);
    }
  }
  
  // Company name - double height/width
  if (data.companyName) {
    commands.push(0x1B, 0x21, 0x30); // Double height + width
    commands.push(...Buffer.from(data.companyName + '\n'));
    commands.push(0x1B, 0x21, 0x00); // Normal
  }
  
  // Header lines
  if (data.headerLines) {
    for (const line of data.headerLines) {
      commands.push(...Buffer.from(line + '\n'));
    }
  }
  
  commands.push(0x0A); // Blank line
  
  // Left alignment for content
  commands.push(0x1B, 0x61, 0x00); // ESC a 0
  
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
  
  // Separator
  commands.push(...Buffer.from('--------------------------------\n'));
  
  // Totals - right align
  commands.push(0x1B, 0x61, 0x02); // Right align
  
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
  commands.push(0x1B, 0x21, 0x30); // Double height + width
  commands.push(...Buffer.from(`TOTAL: $${(data.total || 0).toFixed(2)}\n`));
  commands.push(0x1B, 0x21, 0x00); // Normal
  
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
  
  // Footer
  if (data.footerLines) {
    for (const line of data.footerLines) {
      commands.push(...Buffer.from(line + '\n'));
    }
  }
  
  // Thank you message
  if (data.thankYouMessage) {
    commands.push(0x0A);
    commands.push(...Buffer.from(data.thankYouMessage + '\n'));
  }
  
  // Feed and cut
  commands.push(0x0A, 0x0A, 0x0A);
  commands.push(0x1D, 0x56, 0x00); // GS V 0 - full cut
  
  return Buffer.from(commands);
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }
  
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  try {
    // GET /status - Health check
    if (req.method === 'GET' && url.pathname === '/status') {
      const printers = await getPrinters();
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        status: 'connected',
        version: VERSION,
        platform: 'mac',
        printerCount: printers.length,
        jimpInstalled: !!Jimp
      }));
      return;
    }
    
    // GET /printers - List printers
    if (req.method === 'GET' && url.pathname === '/printers') {
      const printers = await getPrinters();
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ printers }));
      return;
    }
    
    // POST /print - Print receipt
    if (req.method === 'POST' && url.pathname === '/print') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const printerName = data.printer;
          
          if (!printerName) {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ error: 'Printer name required' }));
            return;
          }
          
          let printData;
          if (data.raw) {
            // Raw ESC/POS commands (base64 encoded)
            printData = Buffer.from(data.raw, 'base64');
          } else if (data.receipt) {
            // Build receipt from structured data
            printData = await buildReceipt(data.receipt);
          } else if (data.text) {
            // Plain text
            printData = Buffer.from(data.text + '\n\n\n');
          } else {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ error: 'No print data provided' }));
            return;
          }
          
          await printRaw(printerName, printData);
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          console.error('Print error:', e);
          res.writeHead(500, corsHeaders);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    
    // POST /cash-drawer - Open cash drawer
    if (req.method === 'POST' && url.pathname === '/cash-drawer') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const printerName = data.printer;
          
          if (!printerName) {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ error: 'Printer name required' }));
            return;
          }
          
          // ESC/POS cash drawer command
          const drawerCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
          await printRaw(printerName, drawerCommand);
          
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          console.error('Cash drawer error:', e);
          res.writeHead(500, corsHeaders);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    
    // 404 for unknown routes
    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: 'Not found' }));
    
  } catch (e) {
    console.error('Server error:', e);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║         PrintBridge for Mac - v' + VERSION + '                      ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  Status: RUNNING                                          ║');
  console.log('║  Port: ' + PORT + '                                               ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  Keep this window open while using Flowp POS              ║');
  console.log('║  Press Ctrl+C to stop                                     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  
  // List available printers
  getPrinters().then(printers => {
    if (printers.length > 0) {
      console.log('Available printers:');
      printers.forEach(p => {
        console.log(`  - ${p.name}${p.isDefault ? ' (default)' : ''}`);
      });
    } else {
      console.log('No printers found. Make sure your printer is connected.');
    }
    console.log('');
  });
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down PrintBridge...');
  server.close(() => {
    console.log('Goodbye!');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
