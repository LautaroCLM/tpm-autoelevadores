'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Loader2, X, ArrowRight, CheckCircle2, AlertTriangle, History, Save } from 'lucide-react';
import { toast } from 'sonner';
import { ModalPortal } from './ModalPortal';
import { StatusBadge } from './StatusBadge';
import {
  editarInspeccion,
  fetchEdicionesInspeccion,
  fetchInspeccionDetalle,
  fetchNombresPerfiles,
} from '../lib/api/tpm';
import { formatDate } from '../lib/utils';
import {
  ETIQUETA_CAMPO_CAMBIO_INSPECCION,
  formatearValorCambioInspeccion,
} from '../lib/utils/auditoria';
import type {
  CambiosInspeccion,
  EdicionInspeccion,
  Equipo,
  EstadoEquipo,
  GravedadFalla,
  Inspeccion,
  InspeccionConDetalle,
} from '../lib/types/tpm';

interface Props {
  inspeccion: Inspeccion;
  equipo?: Equipo;
  /** Se llama después de guardar una edición para que el listado se actualice. */
  onSaved: () => void;
  onClose: () => void;
}

interface EdicionFila {
  valor_bool: boolean | null;
  valor_numero: string;
  valor_texto: string;
  es_falla: boolean;
  gravedad: GravedadFalla | '';
  descripcion: string;
}

type RespuestaDetalle = InspeccionConDetalle['respuestas_item'][number];

const GRAVEDADES: { valor: GravedadFalla; texto: string }[] = [
  { valor: 'leve', texto: 'Leve' },
  { valor: 'media', texto: 'Media' },
  { valor: 'critica', texto: 'Crítica' },
];

const ESTADOS: { valor: EstadoEquipo; texto: string }[] = [
  { valor: 'operativo', texto: 'Operativo' },
  { valor: 'observado', texto: 'Observado' },
  { valor: 'fuera_de_servicio', texto: 'Fuera de servicio' },
];

function fallaActiva(r: RespuestaDetalle) {
  return (r.fallas || []).find((f) => !f.deleted_at) ?? null;
}

function filaDesdeRespuesta(r: RespuestaDetalle): EdicionFila {
  const f = fallaActiva(r);
  return {
    valor_bool: r.valor_bool,
    valor_numero: r.valor_numero === null || r.valor_numero === undefined ? '' : String(r.valor_numero),
    valor_texto: r.valor_texto ?? '',
    es_falla: Boolean(r.es_falla) && Boolean(f),
    gravedad: (f?.gravedad as GravedadFalla) ?? '',
    descripcion: f?.descripcion ?? '',
  };
}

const inputCls =
  'w-full bg-[#0B0F17] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-amber-500 focus:outline-none';

export function InspeccionDetalleModal({ inspeccion, equipo, onSaved, onClose }: Props) {
  const [detalle, setDetalle] = useState<InspeccionConDetalle | null>(null);
  const [ediciones, setEdiciones] = useState<EdicionInspeccion[]>([]);
  const [nombres, setNombres] = useState<Record<string, { nombre: string; legajo: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'respuestas' | 'ediciones'>('respuestas');

  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [horometro, setHorometro] = useState('');
  const [estado, setEstado] = useState<EstadoEquipo>('operativo');
  const [filas, setFilas] = useState<Record<string, EdicionFila>>({});
  const [motivo, setMotivo] = useState('');
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, e, n] = await Promise.all([
        fetchInspeccionDetalle(inspeccion.id),
        fetchEdicionesInspeccion(inspeccion.id),
        fetchNombresPerfiles(),
      ]);
      setDetalle(d);
      setEdiciones(e);
      setNombres(n);
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar la inspección');
    } finally {
      setLoading(false);
    }
  }, [inspeccion.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const iniciarEdicion = () => {
    if (!detalle) return;
    setHorometro(String(detalle.horometro));
    setEstado((detalle.estado_resultante as EstadoEquipo) ?? 'operativo');
    const mapa: Record<string, EdicionFila> = {};
    for (const r of detalle.respuestas_item) mapa[r.item_id] = filaDesdeRespuesta(r);
    setFilas(mapa);
    setMotivo('');
    setErrorForm(null);
    setEditando(true);
  };

  const cambiarFila = (itemId: string, parcial: Partial<EdicionFila>) =>
    setFilas((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...parcial } }));

  // Calcula solo lo que realmente cambió respecto de lo guardado
  const cambios = useMemo<CambiosInspeccion>(() => {
    if (!detalle || !editando) return {};
    const out: CambiosInspeccion = {};
    const h = Number(horometro);
    if (horometro.trim() !== '' && Number.isFinite(h) && h !== Number(detalle.horometro)) out.horometro = h;
    if (estado !== detalle.estado_resultante) out.estado_resultante = estado;

    const respuestas: NonNullable<CambiosInspeccion['respuestas']> = [];
    for (const r of detalle.respuestas_item) {
      const orig = filaDesdeRespuesta(r);
      const nueva = filas[r.item_id];
      if (!nueva) continue;
      const item: NonNullable<CambiosInspeccion['respuestas']>[number] = { item_id: r.item_id };
      let hayCambio = false;
      const tipo = r.checklist_items?.tipo_dato;

      if (tipo === 'booleano' && nueva.valor_bool !== orig.valor_bool) {
        item.valor_bool = nueva.valor_bool;
        hayCambio = true;
      }
      if (tipo === 'numero' && nueva.valor_numero !== orig.valor_numero) {
        item.valor_numero = nueva.valor_numero.trim() === '' ? null : Number(nueva.valor_numero);
        hayCambio = true;
      }
      if (tipo === 'texto' && nueva.valor_texto !== orig.valor_texto) {
        item.valor_texto = nueva.valor_texto;
        hayCambio = true;
      }
      if (nueva.es_falla !== orig.es_falla) {
        item.es_falla = nueva.es_falla;
        hayCambio = true;
      }
      if (nueva.es_falla && (nueva.es_falla !== orig.es_falla || nueva.gravedad !== orig.gravedad || nueva.descripcion !== orig.descripcion)) {
        item.falla = { gravedad: nueva.gravedad || undefined, descripcion: nueva.descripcion };
        hayCambio = true;
      }
      if (hayCambio) respuestas.push(item);
    }
    if (respuestas.length > 0) out.respuestas = respuestas;
    return out;
  }, [detalle, editando, horometro, estado, filas]);

  const hayCambios = Object.keys(cambios).length > 0;

  const guardar = async () => {
    setErrorForm(null);
    if (!hayCambios) {
      setErrorForm('No modificaste ningún dato.');
      return;
    }
    if (motivo.trim().length < 3) {
      setErrorForm('Indicá el motivo de la edición.');
      return;
    }
    for (const r of cambios.respuestas ?? []) {
      const fila = filas[r.item_id];
      if (fila?.es_falla && !fila.gravedad) {
        const etiqueta = detalle?.respuestas_item.find((x) => x.item_id === r.item_id)?.checklist_items?.etiqueta;
        setErrorForm(`Elegí la gravedad de la falla en "${etiqueta ?? 'un ítem'}".`);
        return;
      }
    }
    setGuardando(true);
    const res = await editarInspeccion(inspeccion.id, cambios, motivo.trim());
    setGuardando(false);
    if (!res.success) {
      setErrorForm(res.error || 'No se pudo guardar');
      return;
    }
    toast.success('Inspección editada. Quedó registrada en el historial de reediciones.');
    setEditando(false);
    await cargar();
    setTab('ediciones');
    onSaved();
  };

  const secciones = useMemo(() => {
    const grupos: { seccion: string; filas: RespuestaDetalle[] }[] = [];
    for (const r of detalle?.respuestas_item ?? []) {
      const sec = r.checklist_items?.seccion ?? 'Otros';
      let g = grupos.find((x) => x.seccion === sec);
      if (!g) {
        g = { seccion: sec, filas: [] };
        grupos.push(g);
      }
      g.filas.push(r);
    }
    return grupos;
  }, [detalle]);

  const operador = nombres[inspeccion.operador_id];
  const editorId = detalle?.editada_por ?? inspeccion.editada_por;
  const editor = editorId ? nombres[editorId] : undefined;
  const editadaEn = detalle?.editada_en ?? inspeccion.editada_en;

  return (
    <ModalPortal>
      <div
        onClick={() => !guardando && onClose()}
        className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto w-screen h-dvh min-h-dvh"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-[#111724] border border-slate-800/90 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[92dvh] flex flex-col"
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3 shrink-0">
            <div className="min-w-0">
              <h3 className="text-base font-black text-white">
                Inspección · Interno #{equipo?.interno ?? '—'}
                {equipo?.marca ? ` — ${equipo.marca}` : ''}
              </h3>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                {operador ? `${operador.nombre}${operador.legajo ? ` (#${operador.legajo})` : ''}` : 'Operador'} ·{' '}
                {formatDate(inspeccion.finalizado_en || inspeccion.iniciado_en)}
              </p>
              {editadaEn && (
                <p className="text-[11px] text-amber-300 mt-1 flex items-center gap-1">
                  <Pencil size={11} />
                  Editada el {formatDate(editadaEn)}
                  {editor ? ` por ${editor.nombre}` : ''}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTab('respuestas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                tab === 'respuestas'
                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
              }`}
            >
              Checklist
            </button>
            <button
              type="button"
              onClick={() => setTab('ediciones')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                tab === 'ediciones'
                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
              }`}
            >
              <History size={12} />
              Reediciones ({ediciones.length})
            </button>
            {!editando && detalle && tab === 'respuestas' && (
              <button
                type="button"
                onClick={iniciarEdicion}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white transition cursor-pointer flex items-center gap-1.5"
              >
                <Pencil size={12} />
                Editar
              </button>
            )}
          </div>

          <div className="overflow-y-auto space-y-3 pr-1 min-h-0">
            {loading ? (
              <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin text-amber-400" />
                Cargando inspección...
              </div>
            ) : error ? (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs">{error}</div>
            ) : !detalle ? (
              <div className="py-8 text-center text-sm text-slate-400">No se encontró la inspección.</div>
            ) : tab === 'ediciones' ? (
              ediciones.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  <p className="font-bold text-slate-300">Esta inspección nunca fue editada</p>
                </div>
              ) : (
                ediciones.map((ed) => (
                  <div key={ed.id} className="bg-[#0B0F17] border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{ed.editor_nombre || 'Usuario desconocido'}</span>
                      <span className="text-[11px] font-mono text-slate-500">{formatDate(ed.creado_en)}</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      <span className="font-mono font-bold text-slate-400">Motivo: </span>
                      {ed.motivo}
                    </p>
                    <ul className="space-y-1">
                      {ed.cambios.map((c, i) => (
                        <li key={i} className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono font-bold text-slate-300">
                            {c.tipo === 'cabecera'
                              ? ETIQUETA_CAMPO_CAMBIO_INSPECCION[c.campo] ?? c.campo
                              : `${c.etiqueta} · ${ETIQUETA_CAMPO_CAMBIO_INSPECCION[c.campo] ?? c.campo}`}
                            :
                          </span>
                          <span className="text-slate-500 line-through">
                            {formatearValorCambioInspeccion(c.campo, c.antes)}
                          </span>
                          <ArrowRight size={11} className="text-slate-600 shrink-0" />
                          <span className="text-amber-300">{formatearValorCambioInspeccion(c.campo, c.despues)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Horómetro
                    </label>
                    {editando ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={horometro}
                        onChange={(e) => setHorometro(e.target.value)}
                        className={inputCls}
                      />
                    ) : (
                      <p className="text-sm font-mono font-bold text-white">{detalle.horometro} hs</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Estado resultante
                    </label>
                    {editando ? (
                      <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoEquipo)} className={inputCls}>
                        {ESTADOS.map((s) => (
                          <option key={s.valor} value={s.valor}>
                            {s.texto}
                          </option>
                        ))}
                      </select>
                    ) : detalle.estado_resultante ? (
                      <StatusBadge estado={detalle.estado_resultante} size="sm" />
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </div>
                </div>

                {secciones.map((g) => (
                  <div key={g.seccion} className="space-y-1.5">
                    <p className="text-[11px] font-mono font-bold text-amber-400 uppercase tracking-wider">{g.seccion}</p>
                    {g.filas.map((r) => {
                      const tipo = r.checklist_items?.tipo_dato;
                      const f = filas[r.item_id];
                      const falla = fallaActiva(r);
                      return (
                        <div key={r.id} className="bg-[#0B0F17] border border-slate-800 rounded-lg p-2.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-200 font-medium">{r.checklist_items?.etiqueta}</span>

                            {!editando && (
                              <span className="shrink-0 text-xs font-bold">
                                {tipo === 'booleano' ? (
                                  r.es_falla ? (
                                    <span className="text-rose-300 flex items-center gap-1">
                                      <AlertTriangle size={12} /> Falla{falla ? ` ${falla.gravedad}` : ''}
                                    </span>
                                  ) : r.valor_bool ? (
                                    <span className="text-emerald-300 flex items-center gap-1">
                                      <CheckCircle2 size={12} /> OK
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">No OK</span>
                                  )
                                ) : tipo === 'numero' ? (
                                  <span className="font-mono text-white">{r.valor_numero ?? '—'}</span>
                                ) : (
                                  <span className="text-slate-300 font-normal">{r.valor_texto || '—'}</span>
                                )}
                              </span>
                            )}

                            {editando && f && tipo === 'booleano' && (
                              <div className="shrink-0 flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => cambiarFila(r.item_id, { valor_bool: true, es_falla: false })}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                                    f.valor_bool === true && !f.es_falla
                                      ? 'bg-emerald-600 text-white border-emerald-500'
                                      : 'bg-slate-900 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cambiarFila(r.item_id, { valor_bool: false, es_falla: true })}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                                    f.es_falla
                                      ? 'bg-rose-600 text-white border-rose-500'
                                      : 'bg-slate-900 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  Falla
                                </button>
                              </div>
                            )}

                            {editando && f && tipo === 'numero' && (
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                value={f.valor_numero}
                                onChange={(e) => cambiarFila(r.item_id, { valor_numero: e.target.value })}
                                className={`${inputCls} !w-28 font-mono`}
                              />
                            )}
                          </div>

                          {!editando && r.es_falla && falla?.descripcion && (
                            <p className="text-[11px] text-slate-400">{falla.descripcion}</p>
                          )}

                          {editando && f && tipo === 'texto' && (
                            <input
                              type="text"
                              value={f.valor_texto}
                              onChange={(e) => cambiarFila(r.item_id, { valor_texto: e.target.value })}
                              className={inputCls}
                            />
                          )}

                          {editando && f && f.es_falla && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <select
                                value={f.gravedad}
                                onChange={(e) => cambiarFila(r.item_id, { gravedad: e.target.value as GravedadFalla })}
                                className={inputCls}
                              >
                                <option value="">Gravedad…</option>
                                {GRAVEDADES.map((g2) => (
                                  <option key={g2.valor} value={g2.valor}>
                                    {g2.texto}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={f.descripcion}
                                onChange={(e) => cambiarFila(r.item_id, { descripcion: e.target.value })}
                                placeholder="Descripción de la falla"
                                className={`${inputCls} sm:col-span-2`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
          </div>

          {editando && (
            <div className="shrink-0 space-y-2 border-t border-slate-800/80 pt-3">
              <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                Motivo de la edición *
              </label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: el operador marcó mal el nivel de aceite"
                className={inputCls}
              />
              {errorForm && (
                <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs">
                  {errorForm}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => setEditando(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={guardando || !hayCambios}
                  onClick={guardar}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  <span>Guardar edición</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
