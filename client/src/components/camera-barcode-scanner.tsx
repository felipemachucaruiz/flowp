import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { X, SwitchCamera } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface CameraBarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  isOpen: boolean;
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
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);

  const stopScanning = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startScanning = useCallback(async () => {
    if (!videoRef.current || !isOpen) return;

    try {
      setError(null);
      setIsScanning(true);

      // First request camera permission via getUserMedia
      // This is required on mobile before enumerateDevices returns cameras
      try {
        const initialStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        // Stop the initial stream immediately, we'll start the real one below
        initialStream.getTracks().forEach(track => track.stop());
        setHasPermission(true);
      } catch (permErr) {
        if (permErr instanceof Error) {
          if (permErr.name === "NotAllowedError") {
            setError("Camera permission denied. Please allow camera access in your browser settings and try again.");
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

      // Now enumerate devices after permission is granted
      const videoInputDevices = await navigator.mediaDevices.enumerateDevices();
      const cameras = videoInputDevices.filter(device => device.kind === "videoinput");
      
      if (cameras.length === 0) {
        setError("No camera found on this device.");
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

      // Start decoding from video device
      await readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            const scannedText = result.getText();
            const now = Date.now();
            
            // Debounce: don't trigger same barcode within 2 seconds
            if (scannedText !== lastScannedRef.current || now - lastScanTimeRef.current > 2000) {
              lastScannedRef.current = scannedText;
              lastScanTimeRef.current = now;
              onScan(scannedText);
            }
          }
          if (err && !(err instanceof NotFoundException)) {
            console.error("Scan error:", err);
          }
        }
      );
    } catch (err) {
      console.error("Camera error:", err);
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setError("Camera permission denied. Please allow camera access in your browser settings.");
          setHasPermission(false);
        } else if (err.name === "NotFoundError") {
          setError("No camera found on this device.");
          setHasPermission(false);
        } else if (err.name === "NotReadableError") {
          setError("Camera is in use by another app. Please close other apps using the camera.");
          setHasPermission(false);
        } else {
          setError(`Camera error: ${err.message}`);
        }
      }
      setIsScanning(false);
    }
  }, [isOpen, selectedDeviceIndex, onScan]);

  const switchCamera = useCallback(() => {
    if (devices.length > 1) {
      stopScanning();
      setSelectedDeviceIndex((prev) => (prev + 1) % devices.length);
    }
  }, [devices.length, stopScanning]);

  // Start scanning when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        startScanning();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      stopScanning();
    }
  }, [isOpen, startScanning, stopScanning]);

  // Restart scanning when device changes
  useEffect(() => {
    if (isOpen && devices.length > 0 && selectedDeviceIndex > 0) {
      stopScanning();
      const timer = setTimeout(() => {
        startScanning();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedDeviceIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80 safe-area-pt">
        <h2 className="text-white font-semibold text-lg">{t("pos.scan_barcode")}</h2>
        <div className="flex items-center gap-2">
          {devices.length > 1 && (
            <Button
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={switchCamera}
              data-testid="button-switch-camera"
            >
              <SwitchCamera className="w-6 h-6" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/20"
            onClick={onClose}
            data-testid="button-close-scanner"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center p-6">
            <p className="text-white text-lg mb-4">{error}</p>
            <Button onClick={startScanning} variant="secondary" data-testid="button-try-again-camera">
              {t("common.try_again")}
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              autoPlay
              muted
              webkit-playsinline="true"
              x5-playsinline="true"
            />
            
            {/* Scan area overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-72 h-48 relative">
                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-primary rounded-br-lg" />
                
                {/* Scan line animation */}
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary/50 animate-pulse" />
              </div>
            </div>
            
            {/* Loading state */}
            {!isScanning && hasPermission === null && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-white text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2" />
                  <p>{t("pos.starting_camera")}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-black/80 text-center safe-area-pb">
        <p className="text-white/70 text-sm">
          {t("pos.point_camera_at_barcode")}
        </p>
      </div>
    </div>
  );
}
