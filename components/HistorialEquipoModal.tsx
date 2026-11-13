'use client';

import React, { useEffect, useState } from 'react';
import { History, Loader2, X, ArrowRight } from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import { fetchHistorialEquipo } from '../lib/api/tpm';
import { formatDate } from '../lib/utils';
import {
  ETIQUETA_ACCION_EQUIPO,
  ETIQUETA_CAMPO_EQUIPO,
  formatearValorAuditoria,
} from '../lib/utils/auditoria';
import type { Equipo, EquipoAuditoria } from '../lib/types/tpm';

interface HistorialEquipoModalProps {
  equipo: Equipo;
  onClose: () => void;
}

export function HistorialEquipoModal({ equipo, onClose }: HistorialEquipoModalProps) {
  const [registros, setRegistros] = useState<EquipoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    fetchHistorialEquipo(equipo.id)
      .then((data) => {
        if (!cancelado) setRegistros(data);
      })
      .catch((err: any) => {
        if (!cancelado) setError(err?.message || 'No se pudo cargar el historial');
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [equipo.id]);

  return (
    <ModalPortal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto w-screen h-dvh min-h-dvh"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-[#111724] border border-slate-800/90 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[90dvh] flex flex-col"
        >
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 shrink-0">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <History size={18} className="text-amber-400" />
              Historial · Interno #{equipo.interno}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto space-y-2.5 pr-1">
            {loading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin text-amber-400" />
                Cargando historial...
              </div>
            ) : error ? (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs">{error}</div>
            ) : registros.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400 space-y-1">
                <p className="font-bold text-slate-300">Sin cambios registrados</p>
                <p className="text-xs text-slate-500">
                  El historial empieza a registrarse desde que se activó la auditoría.
                </p>
              </div>
            ) : (
              registros.map((r) => {
                const accion = ETIQUETA_ACCION_EQUIPO[r.accion] ?? ETIQUETA_ACCION_EQUIPO.sistema;
                const campos = Object.entries(r.cambios || {});
                return (
                  <div key={r.id} className="bg-[#0B0F17] border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${accion.clase}`}>
                          {accion.texto}
                        </span>
                        <span className="text-xs text-slate-300 font-medium">
                          {r.usuario_nombre || (r.accion === 'sistema' ? 'Sistema' : 'Usuario desconocido')}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">{formatDate(r.creado_en)}</span>
                    </div>

                    <ul className="space-y-1">
                      {campos.map(([campo, cambio]) => (
                        <li key={campo} className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono font-bold text-slate-300">
                            {ETIQUETA_CAMPO_EQUIPO[campo] ?? campo}:
                          </span>
                          {r.accion === 'alta' ? (
                            <span className="text-emerald-300">{formatearValorAuditoria(campo, cambio.despues)}</span>
                          ) : (
                            <>
                              <span className="text-slate-500 line-through">{formatearValorAuditoria(campo, cambio.antes)}</span>
                              <ArrowRight size={11} className="text-slate-600 shrink-0" />
                              <span className="text-amber-300">{formatearValorAuditoria(campo, cambio.despues)}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
