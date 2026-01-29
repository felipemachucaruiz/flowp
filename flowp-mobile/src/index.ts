// Flowp Mobile - Capacitor Bridge
// This provides native capabilities to the web app

import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import ThermalPrinter from './plugins/ThermalPrinter';
import BarcodeScanner from './plugins/BarcodeScanner';

// Initialize native plugins
async function initializeApp() {
  // Hide splash screen after app is ready
  await SplashScreen.hide();

  // Set status bar style
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#1a1a2e' });
  } catch (e) {
    // Status bar not available on all platforms
  }

  // Initialize Bluetooth for printing
  try {
    await ThermalPrinter.initialize();
    console.log('Bluetooth initialized');
  } catch (e) {
    console.warn('Bluetooth not available:', e);
  }

  // Check camera permissions for barcode scanning
  const hasCamera = await BarcodeScanner.checkPermissions();
  if (!hasCamera) {
    await BarcodeScanner.requestPermissions();
  }

  // Handle app state changes
  App.addListener('appStateChange', ({ isActive }) => {
    console.log('App state changed. Is active:', isActive);
  });

  // Handle back button (Android)
  App.addListener('backButton', ({ canGoBack }) => {
    if (!canGoBack) {
      App.exitApp();
    } else {
      window.history.back();
    }
  });

  // Expose native functions to web app via window
  (window as any).FlowpMobile = {
    // Printing
    printer: {
      scan: () => ThermalPrinter.scanForPrinters(),
      connect: (deviceId: string) => ThermalPrinter.connect(deviceId),
      disconnect: () => ThermalPrinter.disconnect(),
      print: (text: string) => ThermalPrinter.printText(text),
      printReceipt: (data: any) => ThermalPrinter.printReceipt(data),
      openDrawer: () => ThermalPrinter.openCashDrawer(),
      isConnected: () => ThermalPrinter.isConnected()
    },
    
    // Scanning
    scanner: {
      checkPermissions: () => BarcodeScanner.checkPermissions(),
      requestPermissions: () => BarcodeScanner.requestPermissions()
    },
    
    // Haptics
    haptics: {
      impact: (style: 'light' | 'medium' | 'heavy' = 'medium') => {
        const styleMap = {
          light: ImpactStyle.Light,
          medium: ImpactStyle.Medium,
          heavy: ImpactStyle.Heavy
        };
        return Haptics.impact({ style: styleMap[style] });
      },
      vibrate: () => Haptics.vibrate(),
      notification: (type: 'success' | 'warning' | 'error' = 'success') => {
        const typeMap = {
          success: 'SUCCESS' as const,
          warning: 'WARNING' as const,
          error: 'ERROR' as const
        };
        return Haptics.notification({ type: typeMap[type] });
      }
    },
    
    // Platform info
    platform: {
      isNative: true,
      isAndroid: /android/i.test(navigator.userAgent),
      isIOS: /iphone|ipad|ipod/i.test(navigator.userAgent)
    }
  };

  console.log('Flowp Mobile initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'complete') {
  initializeApp();
} else {
  document.addEventListener('DOMContentLoaded', initializeApp);
}

export { ThermalPrinter, BarcodeScanner };
