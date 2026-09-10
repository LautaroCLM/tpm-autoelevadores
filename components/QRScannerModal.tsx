'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, Sparkles, UserCheck, Truck, AlertCircle } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (code: string) => void;
  mode: 'operador' | 'equipo';
  title?: string;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  mode,
  title,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let scanInterval: any = null;

    async function startCamera() {
      if (!isOpen) return;
      setCameraError(null);
      setCameraActive(false);

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('La cámara no está soportada en este navegador');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setCameraActive(true);

          // Si el navegador soporta BarcodeDetector nativo (Chrome Android / Safari moderno)
          if ('BarcodeDetector' in window) {
            const barcodeDetector = new (window as any).BarcodeDetector({
              formats: ['qr_code'],
            });

            scanInterval = setInterval(async () => {
              if (videoRef.current && videoRef.current.readyState >= 2) {
                try {
                  const barcodes = await barcodeDetector.detect(videoRef.current);
                  if (barcodes.length > 0) {
                    const detectedValue = barcodes[0].rawValue;
                    if (detectedValue) {
                      clearInterval(scanInterval);
                      onScanSuccess(detectedValue);
                    }
                  }
                } catch {
                  // Fallo puntual de frame, ignorar
                }
              }
            }, 300);
          }
        }
      } catch (err: any) {
        console.warn('No se pudo acceder a la cámara:', err);
        setCameraError(
          err?.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Podés ingresar el código abajo.'
            : 'Cámara no disponible en este dispositivo. Podés ingresar el código abajo.'
        );
      }
    }

    if (isOpen) {
      startCamera();
    }

    return () => {
      if (scanInterval) clearInterval(scanInterval);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isOpen, onScanSuccess]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onScanSuccess(manualInput.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl space-y-0 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                mode === 'operador' ? 'bg-amber-500 text-slate-950' : 'bg-blue-500 text-white'
              }`}
            >
              {mode === 'operador' ? <UserCheck size={18} /> : <Truck size={18} />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                {title || (mode === 'operador' ? 'Escanear Credencial Operador' : 'Escanear Autoelevador')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {mode === 'operador'
                  ? 'Alineá el código QR de tu tarjeta o carnet'
                  : 'Alineá el código QR fijado en la máquina'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Camera Viewfinder Area */}
        <div className="relative bg-black h-64 sm:h-72 flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Scanner Optical Viewfinder Frame */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
            <div className="w-48 h-48 sm:w-56 sm:h-56 border-2 border-dashed border-amber-400/80 rounded-2xl relative">
              {/* Corner accents */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-amber-500 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-amber-500 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-amber-500 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-amber-500 rounded-br-lg" />

              {/* Scanning animated beam */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse shadow-lg shadow-amber-500" />
            </div>
          </div>

          {/* Warning if no camera active */}
          {!cameraActive && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center">
              <Camera size={32} className="text-slate-500 mb-2" />
              <p className="text-xs text-slate-300 font-medium max-w-xs">
                {cameraError || 'Iniciando sensor de cámara...'}
              </p>
            </div>
          )}
        </div>

        {/* Manual Input Bar - Production Ready (Sin accesos rápidos de prueba) */}
        <div className="p-4 bg-[#0e1420] border-t border-slate-800/80 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <span>Ingreso Manual de Código</span>
            <span className="text-[10px] text-slate-500 font-mono">Teclado o Pistola</span>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder={
                mode === 'operador'
                  ? 'Legajo o credencial (ej: 4029)'
                  : 'Código o Interno (ej: AE-01 o 01)'
              }
              className="flex-1 bg-slate-950 border border-slate-700/80 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer btn-tactile shadow-xs"
            >
              Confirmar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

