import { Capacitor } from '@capacitor/core';

let StatusBarPlugin: typeof import('@capacitor/status-bar').StatusBar | null = null;
let StyleEnum: typeof import('@capacitor/status-bar').Style | null = null;

async function getStatusBar() {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }
  
  if (!StatusBarPlugin) {
    try {
      const module = await import('@capacitor/status-bar');
      StatusBarPlugin = module.StatusBar;
      StyleEnum = module.Style;
    } catch (e) {
      console.log('[StatusBar] Plugin not available:', e);
      return null;
    }
  }
  
  return { StatusBar: StatusBarPlugin, Style: StyleEnum };
}

export async function initializeStatusBar() {
  const plugins = await getStatusBar();
  if (!plugins) return;
  
  const { StatusBar } = plugins;
  
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    console.log('[StatusBar] Overlay enabled');
  } catch (e) {
    console.log('[StatusBar] Init error:', e);
  }
}

export async function updateStatusBarStyle(isDarkMode: boolean) {
  const plugins = await getStatusBar();
  if (!plugins || !plugins.Style) return;
  
  const { StatusBar, Style } = plugins;
  
  try {
    await StatusBar.setStyle({ 
      style: isDarkMode ? Style.Dark : Style.Light 
    });
    console.log('[StatusBar] Style set to:', isDarkMode ? 'Dark' : 'Light');
  } catch (e) {
    console.log('[StatusBar] Style error:', e);
  }
}

export async function setStatusBarBackgroundColor(color: string) {
  const plugins = await getStatusBar();
  if (!plugins) return;
  
  const { StatusBar } = plugins;
  
  try {
    await StatusBar.setBackgroundColor({ color });
  } catch (e) {
    console.log('[StatusBar] Background color error:', e);
  }
}
