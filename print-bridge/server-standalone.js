const http = require('http');
const net = require('net');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PRINT_BRIDGE_PORT || 9638;

let printerConfig = {
  type: 'windows',
  printerName: null,
  networkIp: null,
  networkPort: 9100,
  paperWidth: 80
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function getWindowsPrinters() {
  try {
    const result = execSync('wmic printer get name', { encoding: 'utf8' });
    const lines = result.split('\n').filter(line => line.trim() && line.trim() !== 'Name');
    return lines.map(name => ({
      type: 'windows',
      name: name.trim()
    })).filter(p => p.name);
  } catch (error) {
    return [];
  }
}

function formatMoney(amount, currency = 'USD') {
  const num = Number(amount) || 0;
  const symbols = { USD: '$', EUR: '€', COP: '$', MXN: '$', BRL: 'R$', ARS: '$', PEN: 'S/', CLP: '$' };
  const symbol = symbols[currency] || '$';
  return symbol + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildEscPosReceipt(receipt, paperWidth = 80) {
  const commands = [];
  const width = paperWidth === 58 ? 32 : 48;
  
  const ESC = '\x1B';
  const GS = '\x1D';
  
  commands.push(ESC + '@');
  commands.push(ESC + 'a' + '\x01');
  
  if (receipt.businessName) {
    commands.push(ESC + '!' + '\x38');
    commands.push(receipt.businessName + '\n');
    commands.push(ESC + '!' + '\x00');
  }
  
  if (receipt.headerText) {
    commands.push(receipt.headerText + '\n');
  }
  
  if (receipt.address && receipt.address.trim()) {
    commands.push(receipt.address + '\n');
  }
  
  if (receipt.phone && receipt.phone.trim()) {
    commands.push('Tel: ' + receipt.phone + '\n');
  }
  
  if (receipt.taxId && receipt.taxId.trim()) {
    commands.push('NIT/ID: ' + receipt.taxId + '\n');
  }
  
  commands.push('\n');
  commands.push('-'.repeat(width) + '\n');
  
  commands.push(ESC + 'a' + '\x00');
  
  if (receipt.orderNumber) {
    commands.push('Order: #' + receipt.orderNumber + '\n');
  }
  if (receipt.date) {
    commands.push('Date: ' + receipt.date + '\n');
  }
  if (receipt.cashier) {
    commands.push('Cashier: ' + receipt.cashier + '\n');
  }
  if (receipt.customer) {
    commands.push('Customer: ' + receipt.customer + '\n');
  }
  
  commands.push('-'.repeat(width) + '\n');
  
  if (receipt.items && receipt.items.length > 0) {
    for (const item of receipt.items) {
      const qty = item.quantity.toString();
      const total = formatMoney(item.total, receipt.currency);
      const name = item.name.substring(0, width - qty.length - total.length - 4);
      
      commands.push(qty + 'x ' + name);
      const spaces = width - qty.length - 2 - name.length - total.length;
      commands.push(' '.repeat(Math.max(1, spaces)) + total + '\n');
      
      if (item.modifiers) {
        commands.push('   ' + item.modifiers + '\n');
      }
    }
  }
  
  commands.push('-'.repeat(width) + '\n');
  
  const subtotalLabel = 'Subtotal:';
  const subtotalValue = formatMoney(receipt.subtotal, receipt.currency);
  commands.push(subtotalLabel + ' '.repeat(width - subtotalLabel.length - subtotalValue.length) + subtotalValue + '\n');
  
  if (receipt.discount && receipt.discount > 0) {
    const discLabel = receipt.discountPercent ? `Discount (${receipt.discountPercent}%):` : 'Discount:';
    const discValue = '-' + formatMoney(receipt.discount, receipt.currency);
    commands.push(discLabel + ' '.repeat(width - discLabel.length - discValue.length) + discValue + '\n');
  }
  
  if (receipt.tax && receipt.tax > 0) {
    const taxLabel = receipt.taxRate ? `Tax (${receipt.taxRate}%):` : 'Tax:';
    const taxValue = formatMoney(receipt.tax, receipt.currency);
    commands.push(taxLabel + ' '.repeat(width - taxLabel.length - taxValue.length) + taxValue + '\n');
  }
  
  commands.push(ESC + '!' + '\x18');
  const totalLabel = 'TOTAL:';
  const totalValue = formatMoney(receipt.total, receipt.currency);
  commands.push(totalLabel + ' '.repeat(width - totalLabel.length - totalValue.length) + totalValue + '\n');
  commands.push(ESC + '!' + '\x00');
  
  commands.push('-'.repeat(width) + '\n');
  
  if (receipt.payments && receipt.payments.length > 0) {
    for (const payment of receipt.payments) {
      const payLabel = payment.type.charAt(0).toUpperCase() + payment.type.slice(1) + ':';
      const payValue = formatMoney(payment.amount, receipt.currency);
      commands.push(payLabel + ' '.repeat(width - payLabel.length - payValue.length) + payValue + '\n');
    }
  }
  
  if (receipt.change && receipt.change > 0) {
    const changeLabel = 'Change:';
    const changeValue = formatMoney(receipt.change, receipt.currency);
    commands.push(changeLabel + ' '.repeat(width - changeLabel.length - changeValue.length) + changeValue + '\n');
  }
  
  commands.push('\n');
  commands.push(ESC + 'a' + '\x01');
  
  if (receipt.footerText) {
    commands.push(receipt.footerText + '\n');
  }
  
  commands.push('\n\n\n');
  
  if (receipt.cutPaper !== false) {
    commands.push(GS + 'V' + '\x00');
  }
  
  if (receipt.openCashDrawer) {
    commands.push(ESC + 'p' + '\x00' + '\x19' + '\xFA');
  }
  
  return commands.join('');
}

async function printToNetwork(data, ip, port) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);
    
    client.connect(port, ip, () => {
      client.write(Buffer.from(data, 'binary'), (err) => {
        if (err) {
          client.destroy();
          reject(err);
        } else {
          client.end();
          resolve();
        }
      });
    });
    
    client.on('error', reject);
    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

async function printToWindowsPrinter(data, printerName) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `flowp_receipt_${Date.now()}.bin`);
    
    try {
      fs.writeFileSync(tempFile, data, 'binary');
      
      const safePrinterName = printerName.replace(/"/g, '');
      const cmd = `copy /b "${tempFile}" "\\\\%COMPUTERNAME%\\${safePrinterName}" >nul 2>&1`;
      
      exec(cmd, { shell: 'cmd.exe', timeout: 10000 }, (error) => {
        setTimeout(() => {
          try { fs.unlinkSync(tempFile); } catch (e) {}
        }, 1000);
        
        if (error) {
          reject(new Error('Print failed. Make sure the printer is shared and accessible.'));
        } else {
          resolve();
        }
      });
    } catch (error) {
      try { fs.unlinkSync(tempFile); } catch (e) {}
      reject(error);
    }
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  try {
    if (req.method === 'GET' && url === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        version: '1.0.0',
        service: 'Flowp Print Bridge',
        platform: 'windows',
        printer: printerConfig
      });
    }
    else if (req.method === 'GET' && url === '/printers') {
      const printers = getWindowsPrinters();
      sendJson(res, 200, { printers });
    }
    else if (req.method === 'POST' && url === '/config') {
      const body = await parseBody(req);
      if (body.type) printerConfig.type = body.type;
      if (body.printerName) printerConfig.printerName = body.printerName;
      if (body.networkIp) printerConfig.networkIp = body.networkIp;
      if (body.networkPort) printerConfig.networkPort = body.networkPort;
      if (body.paperWidth) printerConfig.paperWidth = body.paperWidth;
      sendJson(res, 200, { success: true, config: printerConfig });
    }
    else if (req.method === 'POST' && url === '/print') {
      const body = await parseBody(req);
      
      if (!body.receipt) {
        sendJson(res, 400, { success: false, error: 'Receipt data required' });
        return;
      }

      const escposData = buildEscPosReceipt(body.receipt, printerConfig.paperWidth);
      
      if (printerConfig.type === 'network' && printerConfig.networkIp) {
        await printToNetwork(escposData, printerConfig.networkIp, printerConfig.networkPort || 9100);
      } else if (printerConfig.printerName) {
        await printToWindowsPrinter(escposData, printerConfig.printerName);
      } else {
        sendJson(res, 400, { success: false, error: 'No printer configured. Go to Settings in Flowp to select a printer.' });
        return;
      }
      
      sendJson(res, 200, { success: true, message: 'Print job sent successfully' });
    }
    else if (req.method === 'POST' && url === '/print-raw') {
      const body = await parseBody(req);
      
      if (!body.data) {
        sendJson(res, 400, { success: false, error: 'Raw data required' });
        return;
      }

      const rawData = Buffer.from(body.data, 'base64').toString('binary');
      
      if (printerConfig.type === 'network' && printerConfig.networkIp) {
        await printToNetwork(rawData, printerConfig.networkIp, printerConfig.networkPort || 9100);
      } else if (printerConfig.printerName) {
        await printToWindowsPrinter(rawData, printerConfig.printerName);
      } else {
        sendJson(res, 400, { success: false, error: 'No printer configured' });
        return;
      }
      
      sendJson(res, 200, { success: true, message: 'Raw print job sent' });
    }
    else if (req.method === 'POST' && url === '/drawer') {
      const ESC = '\x1B';
      const drawerCommand = ESC + 'p' + '\x00' + '\x19' + '\xFA';
      
      if (printerConfig.type === 'network' && printerConfig.networkIp) {
        await printToNetwork(drawerCommand, printerConfig.networkIp, printerConfig.networkPort || 9100);
      } else if (printerConfig.printerName) {
        await printToWindowsPrinter(drawerCommand, printerConfig.printerName);
      } else {
        sendJson(res, 400, { success: false, error: 'No printer configured' });
        return;
      }
      
      sendJson(res, 200, { success: true, message: 'Cash drawer opened' });
    }
    else {
      sendJson(res, 404, { error: 'Not found' });
    }
  } catch (error) {
    console.error('Error:', error);
    sendJson(res, 500, { success: false, error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('========================================================');
  console.log('              FLOWP PRINT BRIDGE v1.0.0                 ');
  console.log('========================================================');
  console.log('');
  console.log(`  Status: RUNNING on http://127.0.0.1:${PORT}`);
  console.log('  Ready to receive print jobs from Flowp POS');
  console.log('');
  console.log('  Available printers:');
  const printers = getWindowsPrinters();
  if (printers.length > 0) {
    printers.forEach(p => console.log(`    - ${p.name}`));
  } else {
    console.log('    (No printers detected - make sure printers are shared)');
  }
  console.log('');
  console.log('  To use: Open Flowp > Settings > Printing > Select printer');
  console.log('');
  console.log('  Keep this window open while using Flowp.');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
