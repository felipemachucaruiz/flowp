const http = require('http');
const net = require('net');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PRINT_BRIDGE_PORT || 9638;
const MAX_PAYLOAD_SIZE = 1024 * 1024;

const authToken = crypto.randomBytes(16).toString('hex');

let printerConfig = {
  type: 'windows',
  printerName: null,
  networkIp: null,
  networkPort: 9100,
  paperWidth: 80
};

let cachedPrinters = [];

function parseBody(req, maxSize = MAX_PAYLOAD_SIZE) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new Error('Payload too large'));
        return;
      }
      body += chunk;
    });
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

let allowedOrigin = null;

function getCorsHeaders(origin, req) {
  const localPatterns = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/
  ];
  
  const isLocal = origin && localPatterns.some(pattern => pattern.test(origin));
  
  if (isLocal) {
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
      'Access-Control-Allow-Credentials': 'true'
    };
  }
  
  if (allowedOrigin && origin === allowedOrigin) {
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
      'Access-Control-Allow-Credentials': 'true'
    };
  }
  
  const replitPattern = /^https:\/\/[a-zA-Z0-9-]+\.replit\.(dev|app)$/;
  const token = req?.headers?.['x-auth-token'];
  if (origin && replitPattern.test(origin) && token === authToken) {
    allowedOrigin = origin;
    console.log(`  Registered origin: ${origin}`);
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
      'Access-Control-Allow-Credentials': 'true'
    };
  }
  
  return null;
}

function sendJson(res, status, data, origin, req) {
  const headers = getCorsHeaders(origin, req);
  if (!headers) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden: Origin not allowed' }));
    return;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function getWindowsPrinters() {
  try {
    const psCommand = 'powershell.exe -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"';
    const result = execSync(psCommand, { encoding: 'utf8', timeout: 10000 });
    const lines = result.split('\n').filter(line => line.trim());
    cachedPrinters = lines.map(name => ({
      type: 'windows',
      name: name.trim()
    })).filter(p => p.name);
    return cachedPrinters;
  } catch (error) {
    console.error('Error detecting printers:', error.message);
    return cachedPrinters;
  }
}

function isValidPrinterName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 255) return false;
  const dangerousChars = /[<>|&;`$\\]/;
  if (dangerousChars.test(name)) return false;
  const printers = cachedPrinters.length > 0 ? cachedPrinters : getWindowsPrinters();
  return printers.some(p => p.name === name);
}

function isValidNetworkAddress(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Pattern.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  return parts.every(p => p >= 0 && p <= 255);
}

function sanitizeString(str, maxLength = 255) {
  if (!str || typeof str !== 'string') return '';
  return str.substring(0, maxLength).replace(/[\x00-\x1F\x7F]/g, '');
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
    commands.push(sanitizeString(receipt.businessName, 100) + '\n');
    commands.push(ESC + '!' + '\x00');
  }
  
  if (receipt.headerText) {
    commands.push(sanitizeString(receipt.headerText, 200) + '\n');
  }
  
  if (receipt.address && receipt.address.trim()) {
    commands.push(sanitizeString(receipt.address, 200) + '\n');
  }
  
  if (receipt.phone && receipt.phone.trim()) {
    commands.push('Tel: ' + sanitizeString(receipt.phone, 30) + '\n');
  }
  
  if (receipt.taxId && receipt.taxId.trim()) {
    commands.push('NIT/ID: ' + sanitizeString(receipt.taxId, 30) + '\n');
  }
  
  commands.push('\n');
  commands.push('-'.repeat(width) + '\n');
  
  commands.push(ESC + 'a' + '\x00');
  
  if (receipt.orderNumber) {
    commands.push('Order: #' + sanitizeString(String(receipt.orderNumber), 20) + '\n');
  }
  if (receipt.date) {
    commands.push('Date: ' + sanitizeString(receipt.date, 30) + '\n');
  }
  if (receipt.cashier) {
    commands.push('Cashier: ' + sanitizeString(receipt.cashier, 50) + '\n');
  }
  if (receipt.customer) {
    commands.push('Customer: ' + sanitizeString(receipt.customer, 50) + '\n');
  }
  
  commands.push('-'.repeat(width) + '\n');
  
  if (receipt.items && Array.isArray(receipt.items) && receipt.items.length <= 100) {
    for (const item of receipt.items.slice(0, 100)) {
      const qty = String(item.quantity || 1).substring(0, 5);
      const total = formatMoney(item.total, receipt.currency);
      const name = sanitizeString(String(item.name || ''), width - qty.length - total.length - 4);
      
      commands.push(qty + 'x ' + name);
      const spaces = width - qty.length - 2 - name.length - total.length;
      commands.push(' '.repeat(Math.max(1, spaces)) + total + '\n');
      
      if (item.modifiers) {
        commands.push('   ' + sanitizeString(String(item.modifiers), width - 3) + '\n');
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
  
  if (receipt.payments && Array.isArray(receipt.payments) && receipt.payments.length <= 10) {
    for (const payment of receipt.payments.slice(0, 10)) {
      const payType = sanitizeString(String(payment.type || 'payment'), 20);
      const payLabel = payType.charAt(0).toUpperCase() + payType.slice(1) + ':';
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
    commands.push(sanitizeString(receipt.footerText, 200) + '\n');
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
    const tempFile = path.join(os.tmpdir(), `flowp_receipt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.bin`);
    
    try {
      fs.writeFileSync(tempFile, data, 'binary');
      
      const tempFileBase64 = Buffer.from(tempFile, 'utf16le').toString('base64');
      const printerBase64 = Buffer.from(printerName, 'utf16le').toString('base64');
      
      const safeScript = `
        $tempFile = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${tempFileBase64}'))
        $printerName = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${printerBase64}'))
        $content = [System.IO.File]::ReadAllBytes($tempFile)
        $content | Out-Printer -Name $printerName
      `;
      
      const encodedCommand = Buffer.from(safeScript, 'utf16le').toString('base64');
      
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', encodedCommand
      ], { timeout: 15000 });
      
      let stderr = '';
      ps.stderr.on('data', (d) => stderr += d.toString());
      
      ps.on('close', (code) => {
        setTimeout(() => {
          try { fs.unlinkSync(tempFile); } catch (e) {}
        }, 1000);
        
        if (code !== 0) {
          reject(new Error(`Print failed (code ${code}): ${stderr || 'Unknown error'}`));
        } else {
          resolve();
        }
      });
      
      ps.on('error', (err) => {
        try { fs.unlinkSync(tempFile); } catch (e) {}
        reject(err);
      });
    } catch (error) {
      try { fs.unlinkSync(tempFile); } catch (e) {}
      reject(error);
    }
  });
}

function checkAuth(req) {
  const token = req.headers['x-auth-token'];
  return token === authToken;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || req.headers.referer || '';
  
  if (req.method === 'OPTIONS') {
    const localPatterns = [
      /^https?:\/\/localhost(:\d+)?$/,
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/
    ];
    const replitPattern = /^https:\/\/[a-zA-Z0-9-]+\.replit\.(dev|app)$/;
    
    const isLocal = origin && localPatterns.some(p => p.test(origin));
    const isReplit = origin && replitPattern.test(origin);
    const isAllowedOrigin = allowedOrigin && origin === allowedOrigin;
    
    if (isLocal || isReplit || isAllowedOrigin) {
      res.writeHead(204, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
        'Access-Control-Allow-Credentials': 'true'
      });
      res.end();
      return;
    }
    
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden: Origin not allowed' }));
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
        requiresAuth: true
      }, origin, req);
    }
    else if (req.method === 'GET' && url === '/printers') {
      if (!checkAuth(req)) {
        sendJson(res, 401, { error: 'Unauthorized' }, origin, req);
        return;
      }
      const printers = getWindowsPrinters();
      sendJson(res, 200, { printers }, origin, req);
    }
    else if (req.method === 'POST' && url === '/config') {
      if (!checkAuth(req)) {
        sendJson(res, 401, { error: 'Unauthorized' }, origin, req);
        return;
      }
      const body = await parseBody(req, 1024);
      
      if (body.type && (body.type === 'windows' || body.type === 'network')) {
        printerConfig.type = body.type;
      }
      
      if (body.printerName !== undefined) {
        if (body.printerName === null || body.printerName === '') {
          printerConfig.printerName = null;
        } else if (isValidPrinterName(body.printerName)) {
          printerConfig.printerName = body.printerName;
        } else {
          sendJson(res, 400, { success: false, error: 'Invalid printer name. Please select from detected printers.' }, origin, req);
          return;
        }
      }
      
      if (body.networkIp !== undefined) {
        if (body.networkIp === null || body.networkIp === '') {
          printerConfig.networkIp = null;
        } else if (isValidNetworkAddress(body.networkIp)) {
          printerConfig.networkIp = body.networkIp;
        } else {
          sendJson(res, 400, { success: false, error: 'Invalid network IP address' }, origin, req);
          return;
        }
      }
      
      if (body.networkPort) {
        const port = parseInt(body.networkPort);
        if (port > 0 && port < 65536) {
          printerConfig.networkPort = port;
        }
      }
      
      if (body.paperWidth && (body.paperWidth === 58 || body.paperWidth === 80)) {
        printerConfig.paperWidth = body.paperWidth;
      }
      
      sendJson(res, 200, { success: true, config: printerConfig }, origin, req);
    }
    else if (req.method === 'POST' && url === '/print') {
      if (!checkAuth(req)) {
        sendJson(res, 401, { error: 'Unauthorized' }, origin, req);
        return;
      }
      const body = await parseBody(req);
      
      if (!body.receipt || typeof body.receipt !== 'object') {
        sendJson(res, 400, { success: false, error: 'Receipt data required' }, origin, req);
        return;
      }

      const escposData = buildEscPosReceipt(body.receipt, printerConfig.paperWidth);
      
      if (printerConfig.type === 'network' && printerConfig.networkIp) {
        await printToNetwork(escposData, printerConfig.networkIp, printerConfig.networkPort || 9100);
      } else if (printerConfig.printerName) {
        await printToWindowsPrinter(escposData, printerConfig.printerName);
      } else {
        sendJson(res, 400, { success: false, error: 'No printer configured. Go to Settings in Flowp to select a printer.' }, origin, req);
        return;
      }
      
      sendJson(res, 200, { success: true, message: 'Print job sent successfully' }, origin, req);
    }
    else if (req.method === 'POST' && url === '/print-raw') {
      if (!checkAuth(req)) {
        sendJson(res, 401, { error: 'Unauthorized' }, origin, req);
        return;
      }
      const body = await parseBody(req, 512 * 1024);
      
      if (!body.data || typeof body.data !== 'string') {
        sendJson(res, 400, { success: false, error: 'Raw data required (base64)' }, origin, req);
        return;
      }
      
      if (body.data.length > 100000) {
        sendJson(res, 400, { success: false, error: 'Payload too large' }, origin, req);
        return;
      }

      let rawData;
      try {
        rawData = Buffer.from(body.data, 'base64').toString('binary');
      } catch (e) {
        sendJson(res, 400, { success: false, error: 'Invalid base64 data' }, origin, req);
        return;
      }
      
      if (printerConfig.type === 'network' && printerConfig.networkIp) {
        await printToNetwork(rawData, printerConfig.networkIp, printerConfig.networkPort || 9100);
      } else if (printerConfig.printerName) {
        await printToWindowsPrinter(rawData, printerConfig.printerName);
      } else {
        sendJson(res, 400, { success: false, error: 'No printer configured' }, origin, req);
        return;
      }
      
      sendJson(res, 200, { success: true, message: 'Raw print job sent' }, origin, req);
    }
    else if (req.method === 'POST' && url === '/drawer') {
      if (!checkAuth(req)) {
        sendJson(res, 401, { error: 'Unauthorized' }, origin, req);
        return;
      }
      const ESC = '\x1B';
      const drawerCommand = ESC + 'p' + '\x00' + '\x19' + '\xFA';
      
      if (printerConfig.type === 'network' && printerConfig.networkIp) {
        await printToNetwork(drawerCommand, printerConfig.networkIp, printerConfig.networkPort || 9100);
      } else if (printerConfig.printerName) {
        await printToWindowsPrinter(drawerCommand, printerConfig.printerName);
      } else {
        sendJson(res, 400, { success: false, error: 'No printer configured' }, origin, req);
        return;
      }
      
      sendJson(res, 200, { success: true, message: 'Cash drawer opened' }, origin, req);
    }
    else {
      sendJson(res, 404, { error: 'Not found' }, origin, req);
    }
  } catch (error) {
    console.error('Error:', error);
    sendJson(res, 500, { success: false, error: error.message }, origin, req);
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
  console.log('  AUTH TOKEN (copy to Flowp Settings):');
  console.log(`  ${authToken}`);
  console.log('');
  console.log('  Available printers:');
  const printers = getWindowsPrinters();
  if (printers.length > 0) {
    printers.forEach(p => console.log(`    - ${p.name}`));
  } else {
    console.log('    (No printers detected yet)');
  }
  console.log('');
  console.log('  To use: Open Flowp > Settings > Printing');
  console.log('  Enter the token above, then select your printer.');
  console.log('');
  console.log('  Keep this window open while using Flowp.');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
