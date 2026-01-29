/* eslint-disable @typescript-eslint/no-explicit-any */

function isNativePlatform(): boolean {
  const win = window as any;
  return !!(win.Capacitor && win.Capacitor.isNativePlatform && win.Capacitor.isNativePlatform());
}

export async function initializeStatusBar() {
  if (!isNativePlatform()) return;
  
  try {
    const win = window as any;
    if (win.Capacitor?.Plugins?.StatusBar) {
      await win.Capacitor.Plugins.StatusBar.setOverlaysWebView({ overlay: true });
      console.log('[StatusBar] Overlay enabled');
    }
  } catch (e) {
    console.log('[StatusBar] Init error:', e);
  }
}

export async function updateStatusBarStyle(isDarkMode: boolean) {
  if (!isNativePlatform()) return;
  
  try {
    const win = window as any;
    if (win.Capacitor?.Plugins?.StatusBar) {
      await win.Capacitor.Plugins.StatusBar.setStyle({ 
        style: isDarkMode ? 'DARK' : 'LIGHT'
      });
      console.log('[StatusBar] Style set to:', isDarkMode ? 'Dark' : 'Light');
    }
  } catch (e) {
    console.log('[StatusBar] Style error:', e);
  }
}

export async function setStatusBarBackgroundColor(color: string) {
  if (!isNativePlatform()) return;
  
  try {
    const win = window as any;
    if (win.Capacitor?.Plugins?.StatusBar) {
      await win.Capacitor.Plugins.StatusBar.setBackgroundColor({ color });
    }
  } catch (e) {
    console.log('[StatusBar] Background color error:', e);
  }
}
