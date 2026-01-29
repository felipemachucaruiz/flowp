interface NativeBiometric {
  isAvailable(): Promise<{ isAvailable: boolean; biometryType: number }>;
  verifyIdentity(options: { reason: string; title: string; subtitle?: string }): Promise<void>;
  setCredentials(options: { username: string; password: string; server: string }): Promise<void>;
  getCredentials(options: { server: string }): Promise<{ username: string; password: string }>;
  deleteCredentials(options: { server: string }): Promise<void>;
}

const SERVER_ID = "flowp-pos-app";

let NativeBiometricPlugin: NativeBiometric | null = null;

function isNativePlatform(): boolean {
  // Check if we're in a Capacitor native app by looking for Capacitor on window
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  return !!(win.Capacitor && win.Capacitor.isNativePlatform && win.Capacitor.isNativePlatform());
}

async function getNativeBiometric(): Promise<NativeBiometric | null> {
  if (!isNativePlatform()) {
    return null;
  }
  
  if (NativeBiometricPlugin) {
    return NativeBiometricPlugin;
  }
  
  try {
    // Use string concatenation to prevent Vite from pre-analyzing this import
    const moduleName = "capacitor-native" + "-biometric";
    const module = await import(/* @vite-ignore */ moduleName);
    NativeBiometricPlugin = module.NativeBiometric;
    return NativeBiometricPlugin;
  } catch (e) {
    console.log("Biometric plugin not available:", e);
    return null;
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  const plugin = await getNativeBiometric();
  if (!plugin) return false;
  
  try {
    const result = await plugin.isAvailable();
    return result.isAvailable;
  } catch (e) {
    console.log("Biometric check failed:", e);
    return false;
  }
}

export async function getBiometryType(): Promise<string> {
  const plugin = await getNativeBiometric();
  if (!plugin) return "none";
  
  try {
    const result = await plugin.isAvailable();
    if (!result.isAvailable) return "none";
    
    switch (result.biometryType) {
      case 1: return "touchId";
      case 2: return "faceId";
      case 3: return "fingerprint";
      case 4: return "faceAuthentication";
      case 5: return "irisAuthentication";
      default: return "biometric";
    }
  } catch (e) {
    return "none";
  }
}

export async function authenticateWithBiometric(reason: string): Promise<boolean> {
  const plugin = await getNativeBiometric();
  if (!plugin) return false;
  
  try {
    await plugin.verifyIdentity({
      reason,
      title: "Flowp POS",
      subtitle: reason
    });
    return true;
  } catch (e) {
    console.log("Biometric auth failed:", e);
    return false;
  }
}

export async function saveCredentials(username: string, password: string): Promise<boolean> {
  const plugin = await getNativeBiometric();
  if (!plugin) return false;
  
  try {
    await plugin.setCredentials({
      username,
      password,
      server: SERVER_ID
    });
    localStorage.setItem("biometric_enabled", "true");
    return true;
  } catch (e) {
    console.log("Failed to save credentials:", e);
    return false;
  }
}

export async function getStoredCredentials(): Promise<{ username: string; password: string } | null> {
  const plugin = await getNativeBiometric();
  if (!plugin) return null;
  
  const enabled = localStorage.getItem("biometric_enabled");
  if (enabled !== "true") return null;
  
  try {
    const creds = await plugin.getCredentials({ server: SERVER_ID });
    return creds;
  } catch (e) {
    console.log("Failed to get credentials:", e);
    return null;
  }
}

export async function clearStoredCredentials(): Promise<void> {
  const plugin = await getNativeBiometric();
  localStorage.removeItem("biometric_enabled");
  
  if (plugin) {
    try {
      await plugin.deleteCredentials({ server: SERVER_ID });
    } catch (e) {
      console.log("Failed to clear credentials:", e);
    }
  }
}

export function isBiometricEnabled(): boolean {
  return localStorage.getItem("biometric_enabled") === "true";
}
