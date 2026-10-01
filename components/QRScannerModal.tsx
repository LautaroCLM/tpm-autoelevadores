'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, Sparkles, UserCheck, Truck, AlertCircle, Check } from 'lucide-react';
import { ModalPortal } from './ModalPortal';

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
  const [scanSuccess, setScanSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let scanInterval: any = null;

    async function startCamera() {
      if (!isOpen) return;
      setCameraError(null);
      setCameraActive(false);
      setScanSuccess(false);

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
                      setScanSuccess(true);
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
      document.body.style.overflow = 'hidden';
      startCamera();
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
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
      setScanSuccess(true);
      onScanSuccess(manualInput.trim());
    }
  };

  return (
    <ModalPortal>
      {/* Estilo local para animación fluida de escaneo de arriba hacia abajo */}
      <style>{`
        @keyframes scanBeam {
          0%, 100% { top: 6%; opacity: 0.3; }
          50% { top: 90%; opacity: 1; }
        }
        .animate-scan-beam {
          animation: scanBeam 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      <div
        className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto w-screen h-dvh min-h-dvh animate-fade-in"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0b0f17] border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl space-y-0 relative my-auto max-h-[90dvh] flex flex-col animate-fade-in"
        >
          {/* Header del Escáner */}
          <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-800 bg-[#0e1420]">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                  mode === 'operador' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'bg-blue-600 text-white shadow-xs'
                }`}
              >
                {mode === 'operador' ? <UserCheck size={19} /> : <Truck size={19} />}
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
              aria-label="Cerrar escáner"
              className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer btn-tactile"
            >
              <X size={20} />
            </button>
          </div>

          {/* Área del Visor Óptico de la Cámara */}
          <div className="relative bg-slate-950 h-72 sm:h-80 flex flex-col items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />

            {/* Visor Industrial con Corchetes Ángulo y Animación de Barrido */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              <div
                className={`w-52 h-52 sm:w-60 sm:h-60 rounded-2xl relative transition-all duration-300 ${
                  scanSuccess
                    ? 'border-2 border-emerald-500 bg-emerald-950/30 shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                    : 'border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                }`}
              >
                {/* Corchetes esquineros sólidos industriales */}
                <div className={`absolute -top-1.5 -left-1.5 w-7 h-7 border-t-4 border-l-4 rounded-tl-xl transition-colors duration-300 ${scanSuccess ? 'border-emerald-400' : 'border-amber-500'}`} />
                <div className={`absolute -top-1.5 -right-1.5 w-7 h-7 border-t-4 border-r-4 rounded-tr-xl transition-colors duration-300 ${scanSuccess ? 'border-emerald-400' : 'border-amber-500'}`} />
                <div className={`absolute -bottom-1.5 -left-1.5 w-7 h-7 border-b-4 border-l-4 rounded-bl-xl transition-colors duration-300 ${scanSuccess ? 'border-emerald-400' : 'border-amber-500'}`} />
                <div className={`absolute -bottom-1.5 -right-1.5 w-7 h-7 border-b-4 border-r-4 rounded-br-xl transition-colors duration-300 ${scanSuccess ? 'border-emerald-400' : 'border-amber-500'}`} />

                {/* Línea animada de escaneo vertical (Barredora de arriba a abajo) */}
                {!scanSuccess && cameraActive && (
                  <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_rgba(245,158,11,0.9)] animate-scan-beam motion-reduce:animate-none motion-reduce:top-1/2" />
                )}

                {/* Micro-feedback visual al detectar un QR exitosamente */}
                {scanSuccess && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/60 backdrop-blur-xs rounded-2xl animate-fade-in">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                      <Check size={28} className="stroke-[3]" />
                    </div>
                    <span className="text-xs font-black text-emerald-300 uppercase tracking-wider mt-2 font-mono">
                      QR Detectado
                    </span>
                  </div>
                )}
              </div>

              {/* Texto explicativo inferior sobre el video */}
              {cameraActive && !scanSuccess && (
                <div className="mt-3 px-3 py-1 rounded-full bg-slate-950/80 border border-slate-800 backdrop-blur-xs shadow-md">
                  <p className="text-[10px] sm:text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider text-center">
                    Alineá el código dentro del recuadro • El escaneo es automático
                  </p>
                </div>
              )}
            </div>

            {/* Alerta si la cámara no está activa o se denegó el permiso */}
            {!cameraActive && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-5 text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                  <Camera size={26} />
                </div>
                <p className="text-xs text-slate-300 font-medium max-w-xs leading-relaxed">
                  {cameraError || 'Iniciando sensor de cámara...'}
                </p>
              </div>
            )}
          </div>

          {/* Barra de Ingreso Manual de Respaldo */}
          <div className="p-4 bg-[#0e1420] border-t border-slate-800 space-y-2.5">
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
                className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="submit"
                className="min-h-[42px] px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer btn-tactile shadow-xs"
              >
                Confirmar
              </button>
            </form>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
