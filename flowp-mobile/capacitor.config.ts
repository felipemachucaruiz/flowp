import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.flowp.pos',
  appName: 'Flowp POS',
  webDir: 'www',
  server: {
    // Load from production URL - this wraps the existing web app
    url: 'https://pos.flowp.app',
    cleartext: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e'
    },
    Camera: {
      // Camera permissions for barcode scanning
    },
    BluetoothLe: {
      // Bluetooth permissions for thermal printing
    }
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false
  }
};

export default config;
