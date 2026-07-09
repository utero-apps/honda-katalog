import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const qrCodeInstanceRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "reader-element-id";

  useEffect(() => {
    if (!isOpen) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage("Browser kamu tidak mendukung akses kamera. Pastikan menggunakan HTTPS.");
      setCameraPermission(false);
      return;
    }

    const startScanner = async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const html5Qrcode = new Html5Qrcode(scannerId);
        qrCodeInstanceRef.current = html5Qrcode;

        const config = {
          fps: 15,
          qrbox: (width: number, height: number) => {
            // Ensure width and height are positive, and enforce a minimum of 60px to prevent library crash
            const boxWidth = Math.max(120, Math.min(width * 0.8, 280));
            const boxHeight = Math.max(60, Math.min(height * 0.4, 100));
            return { width: boxWidth, height: boxHeight };
          },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        };

        await html5Qrcode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            onScanSuccess(decodedText);
            cleanupScanner();
            onClose();
          },
          () => {
            // Scanner scanning loops
          }
        );
        setCameraPermission(true);
      } catch (err: any) {
        console.error("Camera Start Error:", err);
        setErrorMessage("Gagal menyalakan kamera. Berikan izin kamera atau gunakan protokol HTTPS.");
        setCameraPermission(false);
      }
    };

    startScanner();

    return () => {
      cleanupScanner();
    };
  }, [isOpen]);

  const cleanupScanner = () => {
    if (qrCodeInstanceRef.current && qrCodeInstanceRef.current.isScanning) {
      qrCodeInstanceRef.current.stop()
        .then(() => {
          qrCodeInstanceRef.current = null;
        })
        .catch(err => console.error("Error stopping scanner:", err));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden flex flex-col h-[500px]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></div>
            <h3 className="font-extrabold text-slate-800 text-base">Scan Barcode / QR</h3>
          </div>
          <button
            onClick={() => {
              cleanupScanner();
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Camera Container */}
        <div className="flex-1 bg-slate-900 flex flex-col items-center justify-center relative p-4 overflow-hidden">
          {cameraPermission === null && (
            <div className="text-center text-slate-400">
              <div className="w-10 h-10 border-4 border-slate-600 border-t-red-500 rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-sm font-semibold">Meminta izin kamera...</p>
            </div>
          )}

          {cameraPermission === false && (
            <div className="text-center px-6">
              <svg className="w-12 h-12 text-red-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h4 className="font-bold text-white text-sm mb-1">Akses Kamera Gagal</h4>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">{errorMessage}</p>
              <button
                onClick={() => {
                  cleanupScanner();
                  onClose();
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Viewport for html5-qrcode */}
          <div 
            id={scannerId} 
            className={"w-full h-full rounded-2xl overflow-hidden [&>div]:border-none [&>video]:object-cover [&>video]:w-full [&>video]:h-full " + 
              (cameraPermission === true ? "block" : "hidden")}
          />

          {cameraPermission === true && (
            <div className="absolute inset-x-0 bottom-6 text-center z-10 pointer-events-none">
              <span className="px-3 py-1.5 bg-black/60 backdrop-blur-sm text-[11px] font-bold text-white rounded-full uppercase tracking-wider">
                Arahkan ke Barcode / QR Code
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
