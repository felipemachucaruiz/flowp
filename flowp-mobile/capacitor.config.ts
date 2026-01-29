import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.flowp.pos',
  appName: 'Flowp POS',
  webDir: 'www',
  server: {
    // Use Replit dev URL for testing, change to pos.flowp.app for production
    url: 'https://5d847f56-2722-449f-901d-6953091911ce-00-r72jw1v54l2k.worf.replit.dev',
    cleartext: false,
    // Disable caching for development
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#f8fafc',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#f8fafc',
      overlaysWebView: true
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
    contentInset: 'never',
    allowsLinkPreview: false,
    backgroundColor: '#f8fafc',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: 'mobile'
  }
};

export default config;
