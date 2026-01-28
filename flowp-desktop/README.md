# Flowp POS - Desktop Edition

Native Windows desktop application with built-in thermal printing support.

## Quick Start (GitHub Releases)

1. Create a new GitHub repository
2. Push this folder to the repository
3. GitHub Actions will automatically build the Windows installer
4. Download the `.exe` from the "Actions" tab → Latest workflow → "flowp-pos-windows" artifact

Or create a release tag (`git tag v1.0.0 && git push --tags`) to auto-publish to Releases.

## Features

- **No PrintBridge required** - Printing is built directly into the app
- **ESC/POS thermal printing** - Full receipt printing with logos
- **Cash drawer control** - Open cash drawer on sales
- **Offline capable** - Works without internet connection
- **Auto-updates** - Stay current with latest features
- **Windows installer** - Easy one-click installation

## Requirements

- Windows 10 or later (64-bit)
- Node.js 18+ (for development only)
- Thermal receipt printer with Windows driver

## Installation (End Users)

1. Download `Flowp-POS-Setup.exe` from the releases
2. Run the installer
3. Launch Flowp POS from your desktop or Start menu
4. Configure your printer in Settings → Printing

## Development

### Prerequisites

- Node.js 18 or later
- npm 8 or later

### Setup

```bash
cd flowp-desktop
npm install
```

### Run in Development

```bash
npm start
```

This opens Flowp POS connected to the production server (flowp.app).

### Build Windows Installer

```bash
npm run build
```

This creates:
- `dist/Flowp POS Setup.exe` - Windows installer
- `dist/Flowp POS.exe` - Portable version

## How It Works

The desktop app is an Electron wrapper around the Flowp web application. When the web app detects it's running inside Electron, it automatically uses native Windows printing instead of requiring PrintBridge.

### Architecture

```
┌─────────────────────────────────────────┐
│         Electron Main Process           │
│  ┌────────────┐    ┌─────────────────┐  │
│  │  main.js   │───▶│   printer.js    │  │
│  │  (Window)  │    │  (ESC/POS API)  │  │
│  └────────────┘    └─────────────────┘  │
│        │                    │           │
│        ▼                    ▼           │
│  ┌────────────┐    ┌─────────────────┐  │
│  │ preload.js │    │ Windows Print   │  │
│  │  (Bridge)  │    │    Spooler      │  │
│  └────────────┘    └─────────────────┘  │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│        Flowp Web Application            │
│         (flowp.app / render)            │
│                                         │
│  Detects window.flowpDesktop API        │
│  Uses native printing when available    │
└─────────────────────────────────────────┘
```

### API Exposed to Web App

The preload script exposes these methods to the web application:

```javascript
window.flowpDesktop = {
  isElectron: true,
  getVersion: () => Promise<string>,
  getPrinters: () => Promise<Printer[]>,
  printReceipt: (printerName, receipt) => Promise<Result>,
  printRaw: (printerName, base64Data) => Promise<Result>,
  openCashDrawer: (printerName) => Promise<Result>
}
```

## Printer Setup

1. Install your thermal printer's Windows driver
2. Open Windows Settings → Printers & Scanners
3. Add your printer if not auto-detected
4. In Flowp, go to Settings → Printing
5. Select your printer from the dropdown

## Troubleshooting

### Printer not showing
- Make sure printer is connected and powered on
- Install the manufacturer's Windows driver
- Check Windows recognizes the printer

### Print quality issues
- Adjust paper width in Settings → Printing
- Check printer paper is loaded correctly
- Clean the print head if streaky

### App won't start
- Make sure Windows 10 64-bit or later
- Try running as Administrator
- Check antivirus isn't blocking

## Building from Source

1. Clone the repository
2. Run `npm install` in the `flowp-desktop` folder
3. Run `npm run build`

The installer will be in the `dist` folder.

## Support

For issues, contact support@flowp.app
