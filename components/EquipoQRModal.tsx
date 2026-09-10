'use client';

import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Equipo } from '../lib/types/tpm';
import { StatusBadge } from './StatusBadge';
import {
  X,
  QrCode,
  Download,
  Copy,
  Check,
  Camera,
  ExternalLink,
  Printer,
} from 'lucide-react';
import { toast } from 'sonner';

interface EquipoQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipo: Equipo | null;
}

export function EquipoQRModal({ isOpen, onClose, equipo }: EquipoQRModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [fullUrl, setFullUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !equipo) {
      setQrDataUrl('');
      setFullUrl('');
      return;
    }

    // Construcción dinámica de la URL usando el origen actual
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const targetUrl = `${origin}/equipo/${encodeURIComponent(equipo.qr_codigo)}`;
    setFullUrl(targetUrl);

    // Generar QR de alta calidad y contraste nítido
    setGenerating(true);
    QRCode.toDataURL(targetUrl, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Error generando QR:', err);
        toast.error('No se pudo generar el código QR');
      })
      .finally(() => {
        setGenerating(false);
      });
  }, [isOpen, equipo]);

  // Manejo de accesibilidad: tecla Escape para cerrar
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Bloqueo de scroll en el body cuando el modal está abierto
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

  if (!isOpen || !equipo) return null;

  // Descarga del QR en alta resolución (1024x1024)
  const handleDownload = async () => {
    try {
      const highResUrl = await QRCode.toDataURL(fullUrl, {
        width: 1024,
        margin: 3,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      const filename = `QR-${equipo.qr_codigo}.png`;
      const link = document.createElement('a');
      link.href = highResUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`QR de ${equipo.interno} descargado exitosamente`);
    } catch (err) {
      console.error('Error al descargar QR:', err);
      toast.error('Ocurrió un error al descargar la imagen');
    }
  };

  // Copiar URL al portapapeles
  const handleCopyUrl = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success('URL copiada al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar la URL');
    }
  };

  // Imprimir sticker adhesivo
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-qr-title"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm sm:max-w-md w-full p-5 sm:p-7 shadow-2xl space-y-5 text-center my-auto transition-all transform scale-100"
      >
        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4 text-left">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/20 shrink-0">
              <QrCode size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="modal-qr-title" className="font-black text-lg text-white">
                  Interno #{equipo.interno}
                </h3>
                <StatusBadge estado={equipo.estado} size="sm" />
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {equipo.marca} {equipo.modelo} • Código: {equipo.qr_codigo}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenedor del QR: Placa Técnica de Fábrica */}
        <div className="flex flex-col items-center">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-300 shadow-2xl inline-block max-w-[290px] sm:max-w-[320px] w-full text-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
              <span className="text-[10px] font-black tracking-widest uppercase text-slate-500 font-mono">
                TPM • PLANTA INDUSTRIAL
              </span>
              <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                {equipo.marca}
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950">
              INTERNO #{equipo.interno}
            </div>
            <div className="text-xs text-slate-600 font-medium">
              {equipo.modelo} • Combustible: {equipo.combustible || 'GLP'}
            </div>

            {/* Código QR */}
            <div className="w-52 h-52 sm:w-60 sm:h-60 mx-auto my-3 p-2 bg-white border border-slate-200 rounded-xl flex items-center justify-center">
              {generating ? (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-slate-600">Generando QR...</span>
                </div>
              ) : qrDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={qrDataUrl}
                  alt={`Código QR del autoelevador interno #${equipo.interno}`}
                  className="w-full h-full object-contain select-none"
                />
              ) : (
                <div className="text-xs text-rose-500">Error al cargar QR</div>
              )}
            </div>

            <div className="font-mono text-xs font-bold tracking-widest text-slate-800 bg-slate-100 py-1.5 px-3 rounded-lg border border-slate-300 inline-block">
              {equipo.qr_codigo}
            </div>
          </div>
        </div>

        {/* Indicación de escaneo */}
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 flex items-center gap-2.5 text-left text-xs text-amber-300">
          <Camera size={18} className="shrink-0 text-amber-400" />
          <span className="leading-snug">
            Escaneá este código con la cámara del celular para acceder a la ficha e iniciar el checklist.
          </span>
        </div>

        {/* URL secundaria asociada al QR */}
        <div className="space-y-1.5 text-left">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-1">
            <span>URL de destino:</span>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold cursor-pointer transition"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? 'Copiada' : 'Copiar URL'}</span>
            </button>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-300 break-all select-all flex items-center justify-between gap-2">
            <span className="truncate">{fullUrl}</span>
            <a
              href={fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 hover:text-amber-400 shrink-0 p-1"
              title="Abrir URL en pestaña nueva"
            >
              <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98 cursor-pointer btn-tactile"
            >
              <Download size={16} />
              <span>Descargar PNG</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="py-3 px-4 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 border border-slate-700 active:scale-98 cursor-pointer btn-tactile"
            >
              <Printer size={15} />
              <span>Imprimir Sticker</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer border border-slate-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

