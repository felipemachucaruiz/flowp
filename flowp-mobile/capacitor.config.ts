import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.flowp.pos',
  appName: 'Flowp POS',
  webDir: 'www',
  server: {
    // Use Replit dev URL for testing, change to pos.flowp.app for production
    url: 'https://5d847f56-2722-449f-901d-6953091911ce-00-r72jw1v54l2k.worf.replit.dev',
    cleartext: false,
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#f8fafc',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#f8fafc',
      overlaysWebView: true
    }
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  ios: {
    allowsLinkPreview: false,
    backgroundColor: '#f8fafc',
    preferredContentMode: 'mobile'
  }
};

export default config;
