# PrintBridge for Mac

Thermal receipt printer support for Flowp POS on macOS.

## Requirements

- macOS 10.14 or later
- Node.js 18 or later
- A thermal receipt printer connected to your Mac

## Installation

1. Download and extract PrintBridge-Mac.zip
2. Open Terminal
3. Navigate to the extracted folder:
   ```bash
   cd ~/Downloads/printbridge-mac
   ```
4. Make the start script executable:
   ```bash
   chmod +x start.sh
   ```
5. Run PrintBridge:
   ```bash
   ./start.sh
   ```

On first run, it will install required dependencies (takes 1-2 minutes).

## Quick Start with Double-Click

To make PrintBridge launchable by double-clicking:

1. Open **Automator** (search in Spotlight)
2. Create a new **Application**
3. Add "Run Shell Script" action
4. Paste:
   ```bash
   cd /path/to/printbridge-mac && ./start.sh
   ```
5. Save as "PrintBridge.app" to your Applications folder

## Printer Setup

1. Connect your thermal printer via USB
2. Open **System Preferences → Printers & Scanners**
3. Add your printer (use "Generic" driver if specific driver unavailable)
4. Note the printer name (you'll select it in Flowp settings)

## HTTPS Sites (Production)

When using Flowp on HTTPS (flowp.app), Chrome blocks connections to local HTTP services.

### Solution for Chrome:

1. Open: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Add: `http://127.0.0.1:9638`
3. Click "Relaunch"

### Solution for Safari:

Safari is more restrictive. Consider using Chrome for production POS.

## Troubleshooting

### "No printers found"
- Check printer is connected and powered on
- Open System Preferences → Printers & Scanners
- Verify printer appears in the list

### "Permission denied"
Run: `chmod +x start.sh`

### "Node.js not found"
Install Node.js:
- Download from: https://nodejs.org
- Or via Homebrew: `brew install node`

### Printer not printing correctly
- Some printers need specific drivers
- Try installing the manufacturer's Mac driver
- Use the printer's test print function to verify connection

## Features

- Receipt printing with logos
- ESC/POS command support
- Cash drawer control
- Works with most USB thermal printers

## API Endpoints

- `GET /status` - Check connection status
- `GET /printers` - List available printers
- `POST /print` - Print receipt or raw data
- `POST /cash-drawer` - Open cash drawer

## Support

For issues, contact support@flowp.app
