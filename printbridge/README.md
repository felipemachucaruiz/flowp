# Flowp PrintBridge

Silent thermal printing companion for Flowp POS. This Windows application allows Flowp to print receipts directly to thermal printers without browser dialogs.

## Features

- **Silent Printing**: Print receipts directly without browser dialogs
- **ESC/POS Support**: Full thermal printer command support
- **USB & Network Printers**: Connect via USB or network IP
- **Cash Drawer Control**: Automatically open cash drawer
- **System Tray**: Runs quietly in the background
- **Auto-start**: Automatically starts the print server

## Building from Source

### Prerequisites

- Node.js 18 or later
- Windows 10/11 (for building Windows executable)

### Install Dependencies

```bash
cd printbridge
npm install
```

### Run in Development

```bash
npm start
```

### Build Windows Executable

```bash
npm run build:win
```

The installer will be created in the `dist` folder.

## Usage

1. Install PrintBridge on your Windows computer
2. Launch PrintBridge - it will appear in the system tray
3. Configure your printer:
   - Select USB printer from the list, OR
   - Enter network printer IP address
4. Click "Test Print" to verify
5. Open Flowp POS - it will automatically detect PrintBridge

## API Endpoints

PrintBridge runs a local HTTP server on `http://127.0.0.1:9638`:

- `GET /health` - Check status
- `GET /printers` - List available printers
- `POST /config` - Update printer configuration
- `POST /print` - Print receipt
- `POST /drawer` - Open cash drawer
- `POST /print-raw` - Print raw ESC/POS commands

## Troubleshooting

### Printer not found
- Make sure your printer driver is installed
- Check USB connection
- For network printers, verify IP address and port 9100

### Print not working
- Ensure the printer supports ESC/POS commands
- Check paper width setting matches your printer
- Try the test print button

### Flowp can't connect
- Make sure PrintBridge is running (check system tray)
- Verify firewall isn't blocking port 9638
- Check that the server status shows "Running"

## Supported Printers

Any ESC/POS compatible thermal printer:
- Epson TM-T88
- Star TSP100/600
- Citizen CT-S310
- Bixolon SRP-350
- And many more...

## License

MIT - Part of the Flowp POS system.
