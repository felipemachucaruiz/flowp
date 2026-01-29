# Flowp POS Mobile App

Native mobile application for Flowp POS, supporting iOS and Android with Bluetooth thermal printing and barcode scanning.

## Features

- **Full POS Functionality** - All features from the web app
- **Bluetooth Printing** - Connect to thermal receipt printers via Bluetooth LE
- **Camera Barcode Scanning** - Use device camera for barcode scanning
- **Cash Drawer Control** - Open cash drawer via Bluetooth printer
- **Haptic Feedback** - Native vibration for button presses
- **Offline Support** - Works without internet (PWA cached)

## Requirements

### For Development
- Node.js 18+
- Android Studio (for Android)
- Xcode 15+ (for iOS, macOS only)
- CocoaPods (for iOS)

### For Distribution
- Google Play Developer Account ($25 one-time)
- Apple Developer Program ($99/year)

## Project Structure

```
flowp-mobile/
├── capacitor.config.ts    # Capacitor configuration
├── package.json           # Dependencies
├── www/                   # Fallback web content
├── src/
│   ├── index.ts          # Native bridge initialization
│   └── plugins/
│       ├── ThermalPrinter.ts  # Bluetooth printing
│       └── BarcodeScanner.ts  # Camera scanning
├── android/              # Android project (generated)
├── ios/                  # iOS project (generated)
└── resources/
    └── icons/            # App icons
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Add platforms:**
   ```bash
   npx cap add android
   npx cap add ios  # macOS only
   ```

3. **Sync changes:**
   ```bash
   npx cap sync
   ```

## Building

### Android

```bash
# Debug APK
npm run build:android:debug

# Release APK
npm run build:android

# Or open in Android Studio
npm run open:android
```

The APK will be in: `android/app/build/outputs/apk/release/`

### iOS

```bash
# Open in Xcode
npm run open:ios
```

In Xcode:
1. Select your team for signing
2. Product → Archive
3. Distribute App → App Store Connect

## Using Native Features

The web app can access native features via `window.FlowpMobile`:

### Bluetooth Printing

```javascript
// Check if running in native app
if (window.FlowpMobile?.platform.isNative) {
  // Scan for printers
  const printers = await window.FlowpMobile.printer.scan();
  
  // Connect to printer
  await window.FlowpMobile.printer.connect(printers[0].deviceId);
  
  // Print receipt
  await window.FlowpMobile.printer.printReceipt({
    storeName: 'My Store',
    orderNumber: '1234',
    items: [...],
    total: 25.99
  });
  
  // Open cash drawer
  await window.FlowpMobile.printer.openDrawer();
}
```

### Haptic Feedback

```javascript
if (window.FlowpMobile?.haptics) {
  // Button press feedback
  await window.FlowpMobile.haptics.impact('light');
  
  // Success notification
  await window.FlowpMobile.haptics.notification('success');
}
```

### Platform Detection

```javascript
if (window.FlowpMobile?.platform.isNative) {
  console.log('Running in native app');
  
  if (window.FlowpMobile.platform.isAndroid) {
    console.log('Android device');
  }
  
  if (window.FlowpMobile.platform.isIOS) {
    console.log('iOS device');
  }
}
```

## Compatible Printers

Tested Bluetooth thermal printers:
- Star SM-L200 / SM-L300
- Epson TM-P20 / TM-P80
- HPRT MT800
- Generic 58mm/80mm BLE printers

## App Store Submission

### Google Play Store
1. Create signed APK or AAB
2. Create app listing in Google Play Console
3. Upload APK and fill in details
4. Submit for review (usually 1-3 days)

### Apple App Store
1. Create app in App Store Connect
2. Archive and upload from Xcode
3. Fill in app details and screenshots
4. Submit for review (usually 1-7 days)

## Troubleshooting

### Bluetooth not finding printers
- Ensure Bluetooth is enabled
- Check printer is in pairing mode
- Grant Bluetooth permissions when prompted

### Camera not working
- Grant camera permissions when prompted
- Some devices need app restart after permission grant

### App not loading
- Check internet connection (initial load needs network)
- Clear app data and restart

## License

Proprietary - Flowp
