const { exec } = require('child_process');
const os = require('os');

// Get list of available printers
async function getPrinters() {
  return new Promise((resolve) => {
    if (os.platform() === 'win32') {
      exec('wmic printer get name', (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        const lines = stdout.split('\n').slice(1);
        const printers = lines
          .map(line => line.trim())
          .filter(name => name.length > 0)
          .map(name => ({ type: 'windows', name }));
        resolve(printers);
      });
    } else {
      // Linux/Mac - use lpstat
      exec('lpstat -p', (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        const printers = stdout
          .split('\n')
          .filter(line => line.startsWith('printer'))
          .map(line => {
            const match = line.match(/printer\s+(\S+)/);
            return match ? { type: 'cups', name: match[1] } : null;
          })
          .filter(p => p !== null);
        resolve(printers);
      });
    }
  });
}

// Generate ESC/POS commands for receipt
function generateReceiptCommands(receipt) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const commands = [];
  
  // Initialize printer
  commands.push(ESC + '@');
  
  // Set character code table
  commands.push(ESC + 't\x10'); // PC437 for accents
  
  // Center alignment
  commands.push(ESC + 'a\x01');
  
  // Bold on, larger font for business name
  commands.push(ESC + 'E\x01');
  commands.push(GS + '!\x11'); // Double height and width
  commands.push(receipt.businessName || 'Store');
  commands.push('\n');
  commands.push(GS + '!\x00'); // Normal size
  commands.push(ESC + 'E\x00'); // Bold off
  
  // Address and phone
  if (receipt.address) {
    commands.push(receipt.address + '\n');
  }
  if (receipt.phone) {
    commands.push('Tel: ' + receipt.phone + '\n');
  }
  if (receipt.taxId) {
    const taxLabel = receipt.language === 'es' ? 'NIT' : 
                     receipt.language === 'pt' ? 'CNPJ' : 'Tax ID';
    commands.push(taxLabel + ': ' + receipt.taxId + '\n');
  }
  
  // Header text
  if (receipt.headerText) {
    commands.push(receipt.headerText + '\n');
  }
  
  // Divider
  commands.push('--------------------------------\n');
  
  // Left alignment for items
  commands.push(ESC + 'a\x00');
  
  // Order info
  const orderLabel = receipt.language === 'es' ? 'Pedido' : 
                     receipt.language === 'pt' ? 'Pedido' : 'Order';
  commands.push(orderLabel + ' #' + (receipt.orderNumber || '----') + '\n');
  if (receipt.date) {
    commands.push(receipt.date + '\n');
  }
  if (receipt.cashier) {
    const cashierLabel = receipt.language === 'es' ? 'Cajero' : 
                         receipt.language === 'pt' ? 'Caixa' : 'Cashier';
    commands.push(cashierLabel + ': ' + receipt.cashier + '\n');
  }
  if (receipt.customer) {
    const customerLabel = receipt.language === 'es' ? 'Cliente' : 
                          receipt.language === 'pt' ? 'Cliente' : 'Customer';
    commands.push(customerLabel + ': ' + receipt.customer + '\n');
  }
  
  commands.push('--------------------------------\n');
  
  // Items
  if (receipt.items && receipt.items.length > 0) {
    for (const item of receipt.items) {
      const qty = item.quantity || 1;
      const name = item.name || 'Item';
      const total = formatCurrency(item.total, receipt.currency);
      
      // Item name
      commands.push(qty + 'x ' + name + '\n');
      
      // Price aligned right
      if (item.unitPrice) {
        const unitPrice = formatCurrency(item.unitPrice, receipt.currency);
        commands.push('   @ ' + unitPrice + ' = ' + total + '\n');
      } else {
        commands.push('   ' + total + '\n');
      }
      
      // Modifiers
      if (item.modifiers) {
        commands.push('   ' + item.modifiers + '\n');
      }
    }
  }
  
  commands.push('--------------------------------\n');
  
  // Totals
  const subtotalLabel = receipt.language === 'es' ? 'Subtotal' : 
                        receipt.language === 'pt' ? 'Subtotal' : 'Subtotal';
  const taxLabel = receipt.language === 'es' ? 'Impuesto' : 
                   receipt.language === 'pt' ? 'Imposto' : 'Tax';
  const discountLabel = receipt.language === 'es' ? 'Descuento' : 
                        receipt.language === 'pt' ? 'Desconto' : 'Discount';
  const totalLabel = receipt.language === 'es' ? 'TOTAL' : 
                     receipt.language === 'pt' ? 'TOTAL' : 'TOTAL';
  
  commands.push(padLine(subtotalLabel, formatCurrency(receipt.subtotal, receipt.currency)) + '\n');
  
  if (receipt.discount && receipt.discount > 0) {
    const discountText = receipt.discountPercent 
      ? `${discountLabel} (${receipt.discountPercent}%)`
      : discountLabel;
    commands.push(padLine(discountText, '-' + formatCurrency(receipt.discount, receipt.currency)) + '\n');
  }
  
  if (receipt.tax !== undefined) {
    const taxText = receipt.taxRate ? `${taxLabel} (${receipt.taxRate}%)` : taxLabel;
    commands.push(padLine(taxText, formatCurrency(receipt.tax, receipt.currency)) + '\n');
  }
  
  // Total - bold and larger
  commands.push(ESC + 'E\x01');
  commands.push(GS + '!\x10'); // Double height
  commands.push(padLine(totalLabel, formatCurrency(receipt.total, receipt.currency)) + '\n');
  commands.push(GS + '!\x00'); // Normal size
  commands.push(ESC + 'E\x00'); // Bold off
  
  commands.push('--------------------------------\n');
  
  // Payment info
  if (receipt.payments && receipt.payments.length > 0) {
    for (const payment of receipt.payments) {
      commands.push(padLine(payment.type, formatCurrency(payment.amount, receipt.currency)) + '\n');
    }
    if (receipt.change !== undefined && receipt.change > 0) {
      const changeLabel = receipt.language === 'es' ? 'Cambio' : 
                          receipt.language === 'pt' ? 'Troco' : 'Change';
      commands.push(padLine(changeLabel, formatCurrency(receipt.change, receipt.currency)) + '\n');
    }
  }
  
  // Footer text
  if (receipt.footerText) {
    commands.push('--------------------------------\n');
    commands.push(ESC + 'a\x01'); // Center
    commands.push(receipt.footerText + '\n');
  }
  
  // Thank you message
  commands.push(ESC + 'a\x01'); // Center
  const thankYou = receipt.language === 'es' ? '¡Gracias por su compra!' : 
                   receipt.language === 'pt' ? 'Obrigado pela compra!' : 'Thank you for your purchase!';
  commands.push('\n' + thankYou + '\n');
  
  // Coupon section
  if (receipt.couponEnabled && receipt.couponText) {
    commands.push('\n');
    commands.push('================================\n');
    commands.push(ESC + 'E\x01'); // Bold
    const couponLabel = receipt.language === 'es' ? 'CUPON' : 
                        receipt.language === 'pt' ? 'CUPOM' : 'COUPON';
    commands.push(couponLabel + '\n');
    commands.push(ESC + 'E\x00'); // Bold off
    commands.push(receipt.couponText + '\n');
    commands.push('================================\n');
  }
  
  // Feed and cut
  commands.push('\n\n\n');
  if (receipt.cutPaper !== false) {
    commands.push(GS + 'V\x00'); // Full cut
  }
  
  return commands.join('');
}

function formatCurrency(amount, currency = '$') {
  const num = parseFloat(amount) || 0;
  return currency + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function padLine(left, right, width = 32) {
  const leftStr = String(left);
  const rightStr = String(right);
  const padding = width - leftStr.length - rightStr.length;
  return leftStr + ' '.repeat(Math.max(1, padding)) + rightStr;
}

// Print receipt using Windows printer
async function printReceipt(config, receipt) {
  return new Promise((resolve) => {
    try {
      const commands = generateReceiptCommands(receipt);
      
      if (config.type === 'network') {
        // Network printer
        const net = require('net');
        const client = new net.Socket();
        
        client.connect(config.networkPort || 9100, config.networkIp, () => {
          client.write(commands);
          client.end();
          resolve({ success: true });
        });
        
        client.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      } else {
        // Windows printer - use temp file and print command
        const fs = require('fs');
        const path = require('path');
        const tempFile = path.join(os.tmpdir(), 'flowp_receipt_' + Date.now() + '.bin');
        
        fs.writeFileSync(tempFile, commands, 'binary');
        
        const printerName = config.printerName || '';
        if (!printerName) {
          resolve({ success: false, error: 'No printer configured' });
          return;
        }
        
        // Use Windows print command
        const cmd = `copy /b "${tempFile}" "${printerName}"`;
        exec(cmd, { shell: 'cmd.exe' }, (error) => {
          // Clean up temp file
          try { fs.unlinkSync(tempFile); } catch (e) {}
          
          if (error) {
            // Try alternative: use powershell raw print
            const psCmd = `powershell -Command "Get-Content -Path '${tempFile}' -Raw -Encoding Byte | Out-Printer -Name '${printerName}'"`;
            exec(psCmd, (psError) => {
              if (psError) {
                resolve({ success: false, error: 'Failed to print: ' + psError.message });
              } else {
                resolve({ success: true });
              }
            });
          } else {
            resolve({ success: true });
          }
        });
      }
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

// Open cash drawer
async function openDrawer(config) {
  return new Promise((resolve) => {
    try {
      // Standard cash drawer command: ESC p 0 25 250
      const ESC = '\x1B';
      const command = ESC + 'p' + '\x00' + '\x19' + '\xFA';
      
      if (config.type === 'network') {
        const net = require('net');
        const client = new net.Socket();
        
        client.connect(config.networkPort || 9100, config.networkIp, () => {
          client.write(command);
          client.end();
          resolve({ success: true });
        });
        
        client.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      } else {
        const fs = require('fs');
        const path = require('path');
        const tempFile = path.join(os.tmpdir(), 'flowp_drawer_' + Date.now() + '.bin');
        
        fs.writeFileSync(tempFile, command, 'binary');
        
        const printerName = config.printerName || '';
        const cmd = `copy /b "${tempFile}" "${printerName}"`;
        exec(cmd, { shell: 'cmd.exe' }, (error) => {
          try { fs.unlinkSync(tempFile); } catch (e) {}
          
          if (error) {
            resolve({ success: false, error: error.message });
          } else {
            resolve({ success: true });
          }
        });
      }
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

// Print raw ESC/POS data
async function printRaw(config, base64Data) {
  return new Promise((resolve) => {
    try {
      const data = Buffer.from(base64Data, 'base64');
      
      if (config.type === 'network') {
        const net = require('net');
        const client = new net.Socket();
        
        client.connect(config.networkPort || 9100, config.networkIp, () => {
          client.write(data);
          client.end();
          resolve({ success: true });
        });
        
        client.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });
      } else {
        const fs = require('fs');
        const path = require('path');
        const tempFile = path.join(os.tmpdir(), 'flowp_raw_' + Date.now() + '.bin');
        
        fs.writeFileSync(tempFile, data);
        
        const printerName = config.printerName || '';
        const cmd = `copy /b "${tempFile}" "${printerName}"`;
        exec(cmd, { shell: 'cmd.exe' }, (error) => {
          try { fs.unlinkSync(tempFile); } catch (e) {}
          
          if (error) {
            resolve({ success: false, error: error.message });
          } else {
            resolve({ success: true });
          }
        });
      }
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

// Test print
async function testPrint(config) {
  const testReceipt = {
    language: 'en',
    businessName: 'Flowp PrintBridge',
    headerText: 'Test Receipt',
    items: [
      { name: 'Test Item 1', quantity: 2, unitPrice: 5.00, total: 10.00 },
      { name: 'Test Item 2', quantity: 1, unitPrice: 15.00, total: 15.00 }
    ],
    subtotal: 25.00,
    tax: 2.50,
    taxRate: 10,
    total: 27.50,
    payments: [{ type: 'CASH', amount: 30.00 }],
    change: 2.50,
    currency: '$',
    footerText: 'PrintBridge is working!',
    cutPaper: true
  };
  
  return await printReceipt(config, testReceipt);
}

module.exports = { getPrinters, printReceipt, openDrawer, printRaw, testPrint };
