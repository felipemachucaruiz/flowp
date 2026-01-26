const express = require('express');
const cors = require('cors');
const { buildEscPosReceipt } = require('./escpos-builder');

const app = express();
const PORT = process.env.PRINT_BRIDGE_PORT || 9638;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));

let printerConfig = {
  type: 'usb',
  vendorId: null,
  productId: null,
  networkIp: null,
  networkPort: 9100,
  paperWidth: 80
};

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '1.0.0',
    service: 'Flowp Print Bridge',
    printer: printerConfig
  });
});

app.get('/printers', async (req, res) => {
  try {
    const printers = await detectPrinters();
    res.json({ printers });
  } catch (error) {
    res.json({ printers: [], error: error.message });
  }
});

app.post('/config', (req, res) => {
  const { type, vendorId, productId, networkIp, networkPort, paperWidth } = req.body;
  
  if (type) printerConfig.type = type;
  if (vendorId) printerConfig.vendorId = vendorId;
  if (productId) printerConfig.productId = productId;
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
    await printToDevice(escposData);
    
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

    const buffer = Buffer.from(data, 'base64');
    await printToDevice(buffer);
    
    res.json({ success: true, message: 'Raw print job sent successfully' });
  } catch (error) {
    console.error('Raw print error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function detectPrinters() {
  const printers = [];
  
  try {
    const escposUsb = require('escpos-usb');
    const usbDevices = escposUsb.findPrinter();
    
    if (usbDevices && usbDevices.length > 0) {
      usbDevices.forEach((device, index) => {
        printers.push({
          type: 'usb',
          name: `USB Printer ${index + 1}`,
          vendorId: device.deviceDescriptor?.idVendor,
          productId: device.deviceDescriptor?.idProduct
        });
      });
    }
  } catch (e) {
    console.log('USB detection not available:', e.message);
  }
  
  return printers;
}

async function printToDevice(data) {
  const escpos = require('escpos');
  
  if (printerConfig.type === 'usb') {
    const USB = require('escpos-usb');
    
    let device;
    if (printerConfig.vendorId && printerConfig.productId) {
      device = new USB(printerConfig.vendorId, printerConfig.productId);
    } else {
      device = new USB();
    }
    
    return new Promise((resolve, reject) => {
      device.open((err) => {
        if (err) {
          reject(new Error(`Failed to open USB printer: ${err.message}`));
          return;
        }
        
        device.write(data, (writeErr) => {
          device.close();
          if (writeErr) {
            reject(new Error(`Failed to write to printer: ${writeErr.message}`));
          } else {
            resolve();
          }
        });
      });
    });
  } else if (printerConfig.type === 'network') {
    const Network = require('escpos-network');
    
    if (!printerConfig.networkIp) {
      throw new Error('Network printer IP not configured');
    }
    
    const device = new Network(printerConfig.networkIp, printerConfig.networkPort || 9100);
    
    return new Promise((resolve, reject) => {
      device.open((err) => {
        if (err) {
          reject(new Error(`Failed to open network printer: ${err.message}`));
          return;
        }
        
        device.write(data, (writeErr) => {
          device.close();
          if (writeErr) {
            reject(new Error(`Failed to write to printer: ${writeErr.message}`));
          } else {
            resolve();
          }
        });
      });
    });
  } else {
    throw new Error(`Unknown printer type: ${printerConfig.type}`);
  }
}

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
  console.log('');
});
