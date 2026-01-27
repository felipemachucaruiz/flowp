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
app.use(cors({ origin: true }));
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

// Generate ESC/POS commands
function generateReceiptCommands(receipt) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const commands = [];
  
  commands.push(ESC + '@'); // Initialize
  commands.push(ESC + 't\x10'); // Character set
  commands.push(ESC + 'a\x01'); // Center
  
  // Business name
  commands.push(ESC + 'E\x01');
  commands.push(GS + '!\x11');
  commands.push(receipt.businessName || 'Store');
  commands.push('\n');
  commands.push(GS + '!\x00');
  commands.push(ESC + 'E\x00');
  
  if (receipt.address) commands.push(receipt.address + '\n');
  if (receipt.phone) commands.push('Tel: ' + receipt.phone + '\n');
  if (receipt.taxId) {
    const taxLabel = receipt.language === 'es' ? 'NIT' : receipt.language === 'pt' ? 'CNPJ' : 'Tax ID';
    commands.push(taxLabel + ': ' + receipt.taxId + '\n');
  }
  if (receipt.headerText) commands.push(receipt.headerText + '\n');
  
  commands.push('--------------------------------\n');
  commands.push(ESC + 'a\x00'); // Left align
  
  const orderLabel = receipt.language === 'es' ? 'Pedido' : receipt.language === 'pt' ? 'Pedido' : 'Order';
  commands.push(orderLabel + ' #' + (receipt.orderNumber || '----') + '\n');
  if (receipt.date) commands.push(receipt.date + '\n');
  if (receipt.cashier) {
    const label = receipt.language === 'es' ? 'Cajero' : receipt.language === 'pt' ? 'Caixa' : 'Cashier';
    commands.push(label + ': ' + receipt.cashier + '\n');
  }
  if (receipt.customer) {
    const label = receipt.language === 'es' ? 'Cliente' : 'Customer';
    commands.push(label + ': ' + receipt.customer + '\n');
  }
  
  commands.push('--------------------------------\n');
  
  // Items
  if (receipt.items && receipt.items.length > 0) {
    for (const item of receipt.items) {
      commands.push(item.quantity + 'x ' + item.name + '\n');
      if (item.unitPrice) {
        commands.push('   @ ' + formatCurrency(item.unitPrice, receipt.currency) + ' = ' + formatCurrency(item.total, receipt.currency) + '\n');
      } else {
        commands.push('   ' + formatCurrency(item.total, receipt.currency) + '\n');
      }
      if (item.modifiers) commands.push('   ' + item.modifiers + '\n');
    }
  }
  
  commands.push('--------------------------------\n');
  
  // Totals
  commands.push(padLine('Subtotal', formatCurrency(receipt.subtotal, receipt.currency)) + '\n');
  if (receipt.discount && receipt.discount > 0) {
    commands.push(padLine('Discount', '-' + formatCurrency(receipt.discount, receipt.currency)) + '\n');
  }
  if (receipt.tax !== undefined) {
    commands.push(padLine('Tax', formatCurrency(receipt.tax, receipt.currency)) + '\n');
  }
  
  commands.push(ESC + 'E\x01');
  commands.push(GS + '!\x10');
  commands.push(padLine('TOTAL', formatCurrency(receipt.total, receipt.currency)) + '\n');
  commands.push(GS + '!\x00');
  commands.push(ESC + 'E\x00');
  
  commands.push('--------------------------------\n');
  
  if (receipt.payments && receipt.payments.length > 0) {
    for (const payment of receipt.payments) {
      commands.push(padLine(payment.type, formatCurrency(payment.amount, receipt.currency)) + '\n');
    }
    if (receipt.change > 0) {
      const label = receipt.language === 'es' ? 'Cambio' : 'Change';
      commands.push(padLine(label, formatCurrency(receipt.change, receipt.currency)) + '\n');
    }
  }
  
  if (receipt.footerText) {
    commands.push('--------------------------------\n');
    commands.push(ESC + 'a\x01');
    commands.push(receipt.footerText + '\n');
  }
  
  commands.push(ESC + 'a\x01');
  const thankYou = receipt.language === 'es' ? '¡Gracias!' : receipt.language === 'pt' ? 'Obrigado!' : 'Thank you!';
  commands.push('\n' + thankYou + '\n');
  
  commands.push('\n\n\n');
  if (receipt.cutPaper !== false) {
    commands.push(GS + 'V\x00');
  }
  
  return commands.join('');
}

function formatCurrency(amount, currency = '$') {
  return currency + parseFloat(amount || 0).toFixed(2);
}

function padLine(left, right, width = 32) {
  const padding = width - left.length - right.length;
  return left + ' '.repeat(Math.max(1, padding)) + right;
}

// Print to Windows printer
async function printToWindows(printerName, data) {
  return new Promise((resolve) => {
    const tempFile = path.join(os.tmpdir(), 'flowp_' + Date.now() + '.bin');
    fs.writeFileSync(tempFile, data, 'binary');
    
    const cmd = `copy /b "${tempFile}" "${printerName}"`;
    exec(cmd, { shell: 'cmd.exe' }, (error) => {
      try { fs.unlinkSync(tempFile); } catch (e) {}
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true });
      }
    });
  });
}

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
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
  try {
    const { receipt } = req.body;
    if (!receipt) {
      return res.json({ success: false, error: 'No receipt data' });
    }
    
    const commands = generateReceiptCommands(receipt);
    
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

// Start server
app.listen(PORT, '127.0.0.1', async () => {
  console.log('');
  console.log('========================================');
  console.log('  Flowp PrintBridge - Simple Edition');
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
