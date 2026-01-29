# Flowp POS - Desktop Edition

Native desktop application for Windows and macOS with built-in thermal printing support.

## Quick Start (GitHub Releases)

1. Create a new GitHub repository
2. Push this folder to the repository
3. GitHub Actions will automatically build installers for Windows and macOS
4. Download from the "Actions" tab → Latest workflow → "flowp-pos-windows" or "flowp-pos-macos" artifact

Or create a release tag (`git tag v1.0.0 && git push --tags`) to auto-publish to Releases.

## Features

- **No PrintBridge required** - Printing is built directly into the app
- **Cross-platform** - Works on Windows and macOS
- **ESC/POS thermal printing** - Full receipt printing with logos
- **Cash drawer control** - Open cash drawer on sales
- **Offline capable** - Works without internet connection
- **Auto-updates** - Stay current with latest features

## Platform Support

### Windows
- Windows 10 or later (64-bit)
- Uses Windows Print Spooler API for direct RAW printing
- Full installer with multi-language wizard (EN/ES/PT)
- Portable version available

### macOS
- macOS 10.15 (Catalina) or later
- Supports Intel and Apple Silicon (Universal Binary)
- Uses CUPS for printing (`lp -o raw`)
- DMG installer with drag-to-Applications

## Installation (End Users)

### Windows

1. Download `Flowp POS Setup.exe` from the releases
2. Run the installer
3. Launch Flowp POS from your desktop or Start menu
4. Configure your printer in Settings → Printing

### macOS

1. Download `Flowp POS.dmg` from the releases
2. Open the DMG and drag Flowp POS to Applications
3. Launch from Applications or Spotlight
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

This opens Flowp POS connected to the production server (pos.flowp.app).

### Build Installers

```bash
# Build for current platform
npm run build

# Windows only
npm run build:win

# macOS only
npm run build:mac
```

This creates:

**Windows:**
- `dist/Flowp POS Setup 1.0.0.exe` - Windows installer
- `dist/Flowp POS 1.0.0.exe` - Portable version

**macOS:**
- `dist/Flowp POS-1.0.0.dmg` - Disk image installer
- `dist/Flowp POS-1.0.0-mac.zip` - Zipped app bundle

## How It Works

The desktop app is an Electron wrapper around the Flowp web application. When the web app detects it's running inside Electron, it automatically uses native printing instead of requiring PrintBridge.

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
│  │ preload.js │    │  Windows Print  │  │
│  │  (Bridge)  │    │  Spooler / CUPS │  │
│  └────────────┘    └─────────────────┘  │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│        Flowp Web Application            │
│         (pos.flowp.app / render)        │
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

### Windows

1. Install your thermal printer's Windows driver
2. Open Windows Settings → Printers & Scanners
3. Add your printer if not auto-detected
4. In Flowp, go to Settings → Printing
5. Select your printer from the dropdown

### macOS

1. Open System Preferences → Printers & Scanners
2. Add your thermal printer (may need generic "Raw" driver)
3. In Flowp, go to Settings → Printing
4. Select your printer from the dropdown

**Note:** Some thermal printers work best with a generic text/raw driver on macOS.

## Troubleshooting

### Windows

**Printer not showing:**
- Make sure printer is connected and powered on
- Install the manufacturer's Windows driver
- Check Windows recognizes the printer

**Print quality issues:**
- Adjust paper width in Settings → Printing
- Check printer paper is loaded correctly
- Clean the print head if streaky

### macOS

**Printer not showing:**
- Check System Preferences → Printers & Scanners
- Try adding printer with Generic driver
- Run `lpstat -p` in Terminal to verify CUPS sees it

**Printing not working:**
- Ensure printer driver supports raw/passthrough mode
- Check Console.app for print errors
- Try printing a test page from System Preferences first

### General

**App won't start:**
- Windows: Try running as Administrator
- macOS: Check Security & Privacy settings
- Check antivirus isn't blocking

## Customizing Icons and Graphics

To add your own branding to the installer:

### Required Files (place in `build/` folder):

| File | Size | Description |
|------|------|-------------|
| `icon.ico` | 256x256px | Windows app icon (ICO format) |
| `icon.png` | 512x512px | macOS/general icon (PNG format) |

### Optional Installer Graphics (Windows):

| File | Size | Description |
|------|------|-------------|
| `installerSidebar.bmp` | 164x314px | Left sidebar image in Windows installer |
| `installerHeader.bmp` | 150x57px | Header banner in Windows installer |

### Creating Icons:

1. Create a 512x512px PNG logo
2. For Windows: Convert to ICO using an online tool (e.g., icoconvert.com)
3. Place files in the `build/` folder
4. Run `npm run build`

### Folder Structure:
```
flowp-desktop/
├── build/
│   ├── icon.ico              (Windows icon)
│   ├── icon.png              (macOS icon, 512x512px)
│   ├── installerSidebar.bmp  (Windows optional)
│   └── installerHeader.bmp   (Windows optional)
├── main.js
├── package.json
└── ...
```

## GitHub Actions

The included workflow (`.github/workflows/build.yml`) automatically builds for both Windows and macOS when changes are pushed.

### Jobs:
- `build-windows` - Runs on Windows, produces .exe installers
- `build-macos` - Runs on macOS, produces .dmg and .zip
- `release` - Combines artifacts and publishes to "latest" release

### Artifacts:
- `flowp-pos-windows` - Windows installers
- `flowp-pos-macos` - macOS installers

## Support

For issues, contact support@flowp.app
