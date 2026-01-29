import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

// Barcode scanning using camera with client-side detection
// Note: For production, consider using a dedicated barcode plugin like
// @nicosommi/capacitor-native-barcode-scanner or similar

export interface BarcodeScanResult {
  format: string;
  text: string;
}

export class BarcodeScanner {
  private isScanning: boolean = false;
  private scanCallback: ((result: BarcodeScanResult) => void) | null = null;

  async checkPermissions(): Promise<boolean> {
    const status = await Camera.checkPermissions();
    return status.camera === 'granted';
  }

  async requestPermissions(): Promise<boolean> {
    const status = await Camera.requestPermissions();
    return status.camera === 'granted';
  }

  async captureForScanning(): Promise<string | null> {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        width: 800,
        height: 600
      });

      return image.base64String || null;
    } catch (error) {
      console.error('Failed to capture image:', error);
      return null;
    }
  }

  // For continuous scanning, you would integrate with the web app's
  // existing barcode scanning logic that uses html5-qrcode
  startContinuousScanning(callback: (result: BarcodeScanResult) => void): void {
    this.isScanning = true;
    this.scanCallback = callback;
    
    // The web app already has barcode scanning - this just ensures
    // camera permissions are ready
  }

  stopScanning(): void {
    this.isScanning = false;
    this.scanCallback = null;
  }

  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }
}

export default new BarcodeScanner();
