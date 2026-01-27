const express = require('express');
const cors = require('cors');
const { printReceipt } = require('./printer');

let server = null;
let currentConfig = {};
let store = null;

function startServer(port, config, storeInstance) {
  return new Promise((resolve) => {
    if (server) {
      server.close();
    }

    currentConfig = config;
    store = storeInstance;
    const app = express();

    // CORS for Flowp web app
    app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Auth-Token']
    }));

    app.use(express.json({ limit: '10mb' }));

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        version: '1.0.0',
        requiresAuth: false,
        printer: {
          type: currentConfig.type || 'windows',
          printerName: currentConfig.printerName || 'Not configured',
          paperWidth: currentConfig.paperWidth || 80
        }
      });
    });

    // Get available printers
    app.get('/printers', async (req, res) => {
      try {
        const { getPrinters } = require('./printer');
        const printers = await getPrinters();
        res.json({ printers });
      } catch (error) {
        res.json({ printers: [], error: error.message });
      }
    });

    // Update printer configuration
    app.post('/config', (req, res) => {
      currentConfig = { ...currentConfig, ...req.body };
      if (store) {
        store.set('printerConfig', currentConfig);
      }
      res.json({ success: true, config: currentConfig });
    });

    // Print receipt
    app.post('/print', async (req, res) => {
      try {
        const { receipt } = req.body;
        if (!receipt) {
          return res.json({ success: false, error: 'No receipt data provided' });
        }

        const result = await printReceipt(currentConfig, receipt);
        res.json(result);
      } catch (error) {
        console.error('Print error:', error);
        res.json({ success: false, error: error.message });
      }
    });

    // Open cash drawer
    app.post('/drawer', async (req, res) => {
      try {
        const { openDrawer } = require('./printer');
        const result = await openDrawer(currentConfig);
        res.json(result);
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Print raw ESC/POS data
    app.post('/print-raw', async (req, res) => {
      try {
        const { data } = req.body;
        const { printRaw } = require('./printer');
        const result = await printRaw(currentConfig, data);
        res.json(result);
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    server = app.listen(port, '127.0.0.1', () => {
      console.log(`PrintBridge server running on http://127.0.0.1:${port}`);
      resolve();
    });

    server.on('error', (error) => {
      console.error('Server error:', error);
    });
  });
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

function getServerStatus() {
  return {
    running: server !== null,
    config: currentConfig
  };
}

module.exports = { startServer, stopServer, getServerStatus };
