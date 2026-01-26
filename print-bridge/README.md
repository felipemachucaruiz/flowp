# Flowp Print Bridge

Local print bridge service for direct ESC/POS thermal printer communication.

## Features

- Direct USB thermal printer support
- Network printer support (TCP/IP)
- ESC/POS receipt formatting
- Cash drawer control
- Automatic paper cutting
- Silent printing (no browser dialogs)

## Requirements

- Node.js 18 or higher
- Windows 10/11 (recommended)
- Compatible ESC/POS thermal printer

## Supported Printers

Most common thermal receipt printers are supported, including:
- Epson TM series
- Star TSP series
- Bixolon SRP series
- POS-X thermal printers
- Generic ESC/POS printers (58mm and 80mm)

## Installation

1. Download or copy the `print-bridge` folder to your Windows computer
2. Open Command Prompt or PowerShell in the folder
3. Run: `npm install`
4. Start the bridge: `npm start`

## Usage

Once running, the print bridge listens on `http://127.0.0.1:9638`

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check if bridge is running |
| `/printers` | GET | List detected USB printers |
| `/config` | POST | Configure printer settings |
| `/print` | POST | Print a receipt |
| `/print-raw` | POST | Send raw ESC/POS data |

### Configure Printer

```json
POST /config
{
  "type": "usb",
  "vendorId": 1234,
  "productId": 5678,
  "paperWidth": 80
}
```

For network printers:
```json
POST /config
{
  "type": "network",
  "networkIp": "192.168.1.100",
  "networkPort": 9100,
  "paperWidth": 80
}
```

### Print Receipt

```json
POST /print
{
  "receipt": {
    "businessName": "My Store",
    "address": "123 Main St",
    "phone": "555-1234",
    "taxId": "12-3456789",
    "orderNumber": "1001",
    "date": "2024-01-26 10:30 AM",
    "cashier": "John",
    "customer": "Jane Doe",
    "items": [
      {
        "name": "Product 1",
        "quantity": 2,
        "unitPrice": 9.99,
        "total": 19.98
      }
    ],
    "subtotal": 19.98,
    "discount": 2.00,
    "discountPercent": 10,
    "tax": 1.44,
    "taxRate": 8,
    "total": 19.42,
    "payments": [
      { "type": "cash", "amount": 20.00 }
    ],
    "change": 0.58,
    "currency": "USD",
    "footerText": "Thanks for shopping!",
    "openCashDrawer": true,
    "cutPaper": true
  }
}
```

## Running as Windows Service

To run the print bridge automatically on Windows startup:

1. Install node-windows: `npm install -g node-windows`
2. Run: `npm run install-service`

Or create a Windows shortcut in the Startup folder.

## Troubleshooting

### USB Printer Not Detected
- Make sure the printer is connected and powered on
- Try a different USB port
- Install printer drivers from manufacturer
- Run the bridge as Administrator

### Network Printer Connection Failed
- Verify the printer IP address is correct
- Check if the printer is on the same network
- Default port is 9100 (most thermal printers use this)
- Disable firewall temporarily to test

### Permission Issues
- On Windows, run Command Prompt as Administrator
- Ensure no other application is using the printer

## Security Note

The print bridge only listens on localhost (127.0.0.1) and cannot be accessed from other computers on the network. This ensures security while allowing your browser-based POS to communicate with local printers.
