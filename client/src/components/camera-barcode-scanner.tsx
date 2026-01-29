import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { X, SwitchCamera, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface CameraBarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

// Types for @capacitor-mlkit/barcode-scanning
interface MLKitBarcode {
  displayValue: string;
  rawValue: string;
  format: string;
}

interface MLKitScanResult {
  barcodes: MLKitBarcode[];
}

interface MLKitBarcodeScanner {
  scan: () => Promise<MLKitScanResult>;
  requestPermissions: () => Promise<{ camera: string }>;
  checkPermissions: () => Promise<{ camera: string }>;
  isSupported: () => Promise<{ supported: boolean }>;
  isGoogleBarcodeScannerModuleAvailable: () => Promise<{ available: boolean }>;
  installGoogleBarcodeScannerModule: () => Promise<void>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  addListener: (eventName: string, callback: (result: { barcode: MLKitBarcode }) => void) => Promise<{ remove: () => void }>;
  removeAllListeners: () => Promise<void>;
}

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      Plugins?: {
        BarcodeScanner?: MLKitBarcodeScanner;
        CapacitorMLKitBarcodeScanning?: MLKitBarcodeScanner;
      };
      registerPlugin?: (name: string) => MLKitBarcodeScanner;
    };
  }
}

export function CameraBarcodeScanner({ onScan, onClose, isOpen }: CameraBarcodeScannerProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [isNativeScanning, setIsNativeScanning] = useState(false);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  const isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

  const stopScanning = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
    setIsNativeScanning(false);
  }, []);

  const getMLKitScanner = useCallback((): MLKitBarcodeScanner | null => {
    // Try different ways to access the MLKit Barcode Scanner
    // The plugin registers under 'BarcodeScanner' in Capacitor
    const plugins = window.Capacitor?.Plugins;
    if (plugins?.BarcodeScanner) {
      return plugins.BarcodeScanner;
    }
    if (plugins?.CapacitorMLKitBarcodeScanning) {
      return plugins.CapacitorMLKitBarcodeScanning;
    }
    // Try to register the plugin manually
    if (window.Capacitor?.registerPlugin) {
      try {
        return window.Capacitor.registerPlugin('BarcodeScanner');
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const tryNativeScan = useCallback(async (): Promise<boolean> => {
    // Always use web-based scanner with our custom rectangle viewfinder
    // The native plugin's scan() method shows its own UI which we don't want
    // By returning false, we fall back to the web scanner which gives us the rectangle viewfinder
    return false;
  }, []);

  const startScanning = useCallback(async () => {
    if (!videoRef.current || !isOpen) return;

    try {
      setError(null);
      setIsScanning(true);

      // Try native scanner first for Capacitor apps
      if (isCapacitor) {
        const usedNative = await tryNativeScan();
        if (usedNative) {
          return;
        }
      }

      // Check if camera API is available (web fallback)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (isCapacitor) {
          setError(t("pos.install_barcode_plugin"));
        } else {
          setError(t("pos.camera_not_supported"));
        }
        setHasPermission(false);
        setIsScanning(false);
        return;
      }

      // First request camera permission via getUserMedia
      try {
        const initialStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        initialStream.getTracks().forEach(track => track.stop());
        setHasPermission(true);
      } catch (permErr) {
        if (permErr instanceof Error) {
          if (permErr.name === "NotAllowedError") {
            setError(t("pos.camera_permission_denied"));
            setHasPermission(false);
            setIsScanning(false);
            return;
          }
          if (permErr.name === "NotFoundError" || permErr.name === "DevicesNotFoundError") {
            setError(t("pos.no_camera_found"));
            setHasPermission(false);
            setIsScanning(false);
            return;
          }
        }
        throw permErr;
      }

      if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
      }

      const videoInputDevices = await navigator.mediaDevices.enumerateDevices();
      const cameras = videoInputDevices.filter(device => device.kind === "videoinput");
      
      if (cameras.length === 0) {
        setError(t("pos.no_camera_found"));
        setHasPermission(false);
        setIsScanning(false);
        return;
      }

      // Prefer back camera
      const backCameras = cameras.filter(
        (device) => device.label.toLowerCase().includes("back") || 
                    device.label.toLowerCase().includes("rear") ||
                    device.label.toLowerCase().includes("environment")
      );
      
      const orderedDevices = [...backCameras, ...cameras.filter(d => !backCameras.includes(d))];
      setDevices(orderedDevices);
      
      const deviceId = orderedDevices[selectedDeviceIndex]?.deviceId || orderedDevices[0]?.deviceId;

      await readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            const scannedText = result.getText();
            const now = Date.now();
            
            if (scannedText !== lastScannedRef.current || now - lastScanTimeRef.current > 2000) {
              lastScannedRef.current = scannedText;
              lastScanTimeRef.current = now;
              onScan(scannedText);
              stopScanning();
              onClose();
            }
          }
          if (err && !(err instanceof NotFoundException)) {
            console.error("Scan error:", err);
          }
        }
      );

      if (videoRef.current.srcObject) {
        streamRef.current = videoRef.current.srcObject as MediaStream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError(`Camera error: ${err instanceof Error ? err.message : String(err)}`);
      setIsScanning(false);
    }
  }, [isOpen, isCapacitor, tryNativeScan, selectedDeviceIndex, onScan, onClose, stopScanning, t]);

  const switchCamera = useCallback(() => {
    if (devices.length <= 1) return;
    
    stopScanning();
    const nextIndex = (selectedDeviceIndex + 1) % devices.length;
    setSelectedDeviceIndex(nextIndex);
  }, [devices.length, selectedDeviceIndex, stopScanning]);

  useEffect(() => {
    if (isOpen) {
      startScanning();
    } else {
      stopScanning();
    }
    
    return () => {
      stopScanning();
    };
  }, [isOpen, startScanning, stopScanning]);

  useEffect(() => {
    if (isOpen && selectedDeviceIndex > 0) {
      startScanning();
    }
  }, [selectedDeviceIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col safe-area-pt safe-area-pb">
      <div className="flex items-center justify-between p-4 bg-black/80">
        <h2 className="text-white text-lg font-semibold">{t("pos.scan_barcode")}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            stopScanning();
            onClose();
          }}
          className="text-white hover:bg-white/20"
          data-testid="button-close-scanner"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        {error ? (
          <div className="text-center text-white px-4">
            <p className="text-red-400 mb-4">{error}</p>
            <Button
              variant="outline"
              onClick={() => {
                setError(null);
                startScanning();
              }}
              data-testid="button-retry-camera"
            >
              {t("common.try_again")}
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
              {...{ "webkit-playsinline": "true" } as any}
              {...{ "x5-playsinline": "true" } as any}
            />
            {!isScanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
                <span className="text-white ml-3">{t("pos.starting_camera")}</span>
              </div>
            )}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-32 border-2 border-white/50 rounded-lg" />
            </div>
          </>
        )}
      </div>

      <div className="p-4 bg-black/80 flex justify-center gap-4">
        {devices.length > 1 && !error && (
          <Button
            variant="outline"
            size="icon"
            onClick={switchCamera}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20"
            data-testid="button-switch-camera"
          >
            <SwitchCamera className="w-5 h-5" />
          </Button>
        )}
        <p className="text-white/70 text-sm self-center">
          {t("pos.point_camera_at_barcode")}
        </p>
      </div>
    </div>
  );
}
