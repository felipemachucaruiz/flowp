const express = require('express');
const cors = require('cors');
const net = require('net');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PRINT_BRIDGE_PORT || 9638;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));

let printerConfig = {
  type: 'windows',
  printerName: null,
  networkIp: null,
  networkPort: 9100,
  paperWidth: 80
};

function getWindowsPrinters() {
  try {
    const result = execSync('wmic printer get name', { encoding: 'utf8' });
    const lines = result.split('\n').filter(line => line.trim() && line.trim() !== 'Name');
    return lines.map(name => ({
      type: 'windows',
      name: name.trim()
    })).filter(p => p.name);
  } catch (error) {
    console.error('Failed to list printers:', error.message);
    return [];
  }
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
    commands.push('Tax ID: ' + receipt.taxId + '\n');
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

function formatMoney(amount, currency = 'USD') {
  const num = Number(amount) || 0;
  const symbols = { USD: '$', EUR: '€', COP: '$', MXN: '$', BRL: 'R$', ARS: '$', PEN: 'S/', CLP: '$' };
  const symbol = symbols[currency] || '$';
  return symbol + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      
      const cmd = `copy /b "${tempFile}" "\\\\%COMPUTERNAME%\\${printerName}"`;
      
      exec(cmd, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
        try { fs.unlinkSync(tempFile); } catch (e) {}
        
        if (error) {
          const printCmd = `print /d:"${printerName}" "${tempFile}"`;
          exec(printCmd, { shell: 'cmd.exe' }, (err2) => {
            if (err2) {
              reject(new Error(`Print failed: ${error.message}`));
            } else {
              resolve();
            }
          });
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

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '1.0.0',
    service: 'Flowp Print Bridge',
    platform: 'windows',
    printer: printerConfig
  });
});

app.get('/printers', async (req, res) => {
  try {
    const printers = getWindowsPrinters();
    res.json({ printers });
  } catch (error) {
    res.json({ printers: [], error: error.message });
  }
});

app.post('/config', (req, res) => {
  const { type, printerName, networkIp, networkPort, paperWidth } = req.body;
  
  if (type) printerConfig.type = type;
  if (printerName) printerConfig.printerName = printerName;
  if (networkIp) printerConfig.networkIp = networkIp;
  if (networkPort) printerConfig.networkPort = networkPort;
  if (paperWidth) printerConfig.paperWidth = paperWidth;
  
  res.json({ success: true, config: printerConfig });
});

app.post('/print', async (req, res) => {
  try {
    const { receipt } = req.body;
    
    if (!receipt) {
      return res.status(400).json({ success: false, error: 'Receipt data required' });
    }

    const escposData = buildEscPosReceipt(receipt, printerConfig.paperWidth);
    
    if (printerConfig.type === 'network' && printerConfig.networkIp) {
      await printToNetwork(escposData, printerConfig.networkIp, printerConfig.networkPort || 9100);
    } else if (printerConfig.printerName) {
      await printToWindowsPrinter(escposData, printerConfig.printerName);
    } else {
      return res.status(400).json({ success: false, error: 'No printer configured' });
    }
    
    res.json({ success: true, message: 'Print job sent successfully' });
  } catch (error) {
    console.error('Print error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/print-raw', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({ success: false, error: 'Raw data required' });
    }

    const rawData = Buffer.from(data, 'base64').toString('binary');
    
    if (printerConfig.type === 'network' && printerConfig.networkIp) {
      await printToNetwork(rawData, printerConfig.networkIp, printerConfig.networkPort || 9100);
    } else if (printerConfig.printerName) {
      await printToWindowsPrinter(rawData, printerConfig.printerName);
    } else {
      return res.status(400).json({ success: false, error: 'No printer configured' });
    }
    
    res.json({ success: true, message: 'Raw print job sent successfully' });
  } catch (error) {
    console.error('Raw print error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/drawer', async (req, res) => {
  try {
    const ESC = '\x1B';
    const drawerCommand = ESC + 'p' + '\x00' + '\x19' + '\xFA';
    
    if (printerConfig.type === 'network' && printerConfig.networkIp) {
      await printToNetwork(drawerCommand, printerConfig.networkIp, printerConfig.networkPort || 9100);
    } else if (printerConfig.printerName) {
      await printToWindowsPrinter(drawerCommand, printerConfig.printerName);
    } else {
      return res.status(400).json({ success: false, error: 'No printer configured' });
    }
    
    res.json({ success: true, message: 'Cash drawer opened' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                  FLOWP PRINT BRIDGE                        ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Status: Running on http://127.0.0.1:${PORT}                 ║`);
  console.log('║  Ready to receive print jobs from Flowp POS                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Endpoints:');
  console.log('  GET  /health   - Check bridge status');
  console.log('  GET  /printers - List available printers');
  console.log('  POST /config   - Configure printer');
  console.log('  POST /print    - Print receipt');
  console.log('  POST /drawer   - Open cash drawer');
  console.log('');
  console.log('Press Ctrl+C to stop the bridge.');
  console.log('');
});
