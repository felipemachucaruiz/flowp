# Flowp PrintBridge

Silent ESC/POS thermal printer bridge for Flowp POS.

## Quick Start (Recommended)

1. **Download** `FlowpPrintBridge.exe` from Flowp Settings > Printers
2. **Run** the .exe - no installation needed, just double-click!
3. **Select** your thermal printer from the dropdown
4. **Save** your configuration
5. **Connect** in Flowp POS: Settings > Printers > enter `http://localhost:9638`

That's it! PrintBridge runs in your system tray.

## Languages

PrintBridge supports **English**, **Spanish**, and **Portuguese**. Click the language buttons (EN / ES / PT) in the top-right corner to switch.

## Features

- **Portable .exe**: No installation required - just download and run
- **Silent Printing**: Print receipts instantly without browser dialogs
- **USB & Network**: Supports USB and network thermal printers
- **58mm & 80mm Paper**: Configurable paper width
- **System Tray**: Runs quietly in the background
- **Multi-Language**: English, Spanish, Portuguese
- **Cash Drawer**: Open drawer command support

## Supported Printers

Any ESC/POS compatible thermal printer:
- Epson TM-T88
- Star TSP100/600
- Citizen CT-S310
- Bixolon SRP-350
- And many more...

## Building from Source

If you want to build the .exe yourself:

```bash
# Install dependencies
npm install

# Build portable .exe
npm run build

# Find FlowpPrintBridge.exe in the dist/ folder
```

### Run in Development

```bash
npm install
npm start
```

## API Reference

PrintBridge runs on `http://localhost:9638`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status |
| `/printers` | GET | List available printers |
| `/config` | POST | Update printer settings |
| `/print` | POST | Print receipt (JSON `receipt` object) |
| `/drawer` | POST | Open cash drawer |
| `/print-raw` | POST | Send raw ESC/POS data |

## Security

- CORS restricted to localhost and Flowp domains
- Optional security token for additional protection

## Troubleshooting

### Printer not detected?
- Make sure it's connected and has Windows drivers installed
- Try restarting PrintBridge

### Print quality issues?
- Verify paper width setting matches your printer (58mm or 80mm)
- Check paper roll alignment

### Network printer not connecting?
- Verify the IP address is correct
- Check that port 9100 is not blocked

### Flowp can't connect?
- Make sure PrintBridge is running (check system tray icon)
- Verify firewall isn't blocking port 9638
- Check that status shows "Running"

## License

MIT - Part of the Flowp POS system.
