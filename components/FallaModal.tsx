'use client';

import React, { useState, useRef } from 'react';
import { GravedadFalla } from '../lib/types/tpm';
import { X, Camera, AlertTriangle, AlertOctagon, Info, Trash2, Image as ImageIcon } from 'lucide-react';

interface FallaModalProps {
  isOpen: boolean;
  itemEtiqueta: string;
  initialGravedad?: GravedadFalla;
  initialDescripcion?: string;
  initialFoto?: string;
  onSave: (data: { gravedad: GravedadFalla; descripcion: string; foto_base64?: string }) => void;
  onCancel: () => void;
}

export const FallaModal: React.FC<FallaModalProps> = ({
  isOpen,
  itemEtiqueta,
  initialGravedad = 'media',
  initialDescripcion = '',
  initialFoto = '',
  onSave,
  onCancel,
}) => {
  const [gravedad, setGravedad] = useState<GravedadFalla>(initialGravedad);
  const [descripcion, setDescripcion] = useState<string>(initialDescripcion);
  const [fotoBase64, setFotoBase64] = useState<string>(initialFoto);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setFotoBase64(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!descripcion.trim()) {
      alert('Por favor ingrese una breve descripción de la falla observada.');
      return;
    }
    onSave({
      gravedad,
      descripcion: descripcion.trim(),
      foto_base64: fotoBase64 || undefined,
    });
  };

  const quickTags = [
    'Pérdida / Fuga',
    'Roto / Dañado',
    'Sin presión / Sin nivel',
    'No funciona',
    'Ruidos anormales',
    'Falta componente',
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Reportar Falla</h3>
              <p className="text-xs text-slate-400 truncate max-w-[240px] sm:max-w-xs">{itemEtiqueta}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Gravedad Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Nivel de Gravedad <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* Leve */}
              <button
                type="button"
                onClick={() => setGravedad('leve')}
                className={`p-3 rounded-xl border flex flex-col items-center text-center gap-1.5 transition cursor-pointer ${
                  gravedad === 'leve'
                    ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300 ring-2 ring-yellow-500/40'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Info size={18} className={gravedad === 'leve' ? 'text-yellow-400' : ''} />
                <span className="font-bold text-xs">Leve</span>
                <span className="text-[10px] text-slate-400 leading-tight">Observación menor</span>
              </button>

              {/* Media */}
              <button
                type="button"
                onClick={() => setGravedad('media')}
                className={`p-3 rounded-xl border flex flex-col items-center text-center gap-1.5 transition cursor-pointer ${
                  gravedad === 'media'
                    ? 'bg-orange-500/20 border-orange-500 text-orange-300 ring-2 ring-orange-500/40'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <AlertTriangle size={18} className={gravedad === 'media' ? 'text-orange-400' : ''} />
                <span className="font-bold text-xs">Media</span>
                <span className="text-[10px] text-slate-400 leading-tight">Equipo Observado</span>
              </button>

              {/* Crítica */}
              <button
                type="button"
                onClick={() => setGravedad('critica')}
                className={`p-3 rounded-xl border flex flex-col items-center text-center gap-1.5 transition cursor-pointer ${
                  gravedad === 'critica'
                    ? 'bg-rose-500/20 border-rose-500 text-rose-300 ring-2 ring-rose-500/40'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <AlertOctagon size={18} className={gravedad === 'critica' ? 'text-rose-400' : ''} />
                <span className="font-bold text-xs">Crítica</span>
                <span className="text-[10px] text-rose-300 leading-tight">Fuera de Servicio</span>
              </button>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Descripción del defecto <span className="text-rose-400">*</span>
              </label>
            </div>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              placeholder="Describa el problema observado con claridad para el equipo de mantenimiento..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500"
            />
            {/* Quick tag suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setDescripcion((prev) => (prev ? `${prev} - ${tag}` : tag))
                  }
                  className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-md transition cursor-pointer border border-slate-700/60"
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Foto de Evidencia */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Foto de Evidencia
            </label>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {!fotoBase64 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 bg-slate-950/60 rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 group"
              >
                <div className="w-12 h-12 rounded-full bg-slate-800 group-hover:bg-amber-500/20 text-slate-400 group-hover:text-amber-400 flex items-center justify-center transition">
                  <Camera size={24} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">Tomar foto o cargar imagen</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Capturar defecto con la cámara del dispositivo</p>
                </div>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotoBase64}
                  alt="Evidencia de falla"
                  className="w-full h-44 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex items-end justify-between p-3">
                  <span className="text-xs font-medium text-white flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-md backdrop-blur">
                    <ImageIcon size={12} /> Foto adjunta
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFotoBase64('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition shadow-lg cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/90 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-700 text-slate-300 font-semibold text-sm hover:bg-slate-800 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-900/30 transition cursor-pointer"
          >
            Confirmar Falla
          </button>
        </div>
      </div>
    </div>
  );
};
