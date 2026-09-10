'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchEquipoByQR, fetchInspeccionesByEquipo } from '../../../lib/api/tpm';
import { getCurrentSessionAndProfile } from '../../../lib/api/auth';
import { Equipo, Perfil, InspeccionConDetalle } from '../../../lib/types/tpm';
import { StatusBadge } from '../../../components/StatusBadge';
import { MantenimientoBadge } from '../../../components/MantenimientoBadge';
import { EquipoQRModal } from '../../../components/EquipoQRModal';
import { formatDate } from '../../../lib/utils';
import { extractEquipoCode } from '../../../lib/utils/auth-helpers';
import {
  ArrowLeft,
  Truck,
  Gauge,
  Fuel,
  Calendar,
  AlertTriangle,
  Play,
  User,
  ShieldAlert,
  CheckCircle,
  FileCheck2,
  UserCheck,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  X,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  History,
  Wrench,
  QrCode,
} from 'lucide-react';
import { toast } from 'sonner';
import { calcularEstadoMantenimiento } from '../../../lib/utils/mantenimiento';

export default function EquipoFichaPage() {
  const params = useParams();
  const router = useRouter();
  const rawParam = Array.isArray(params?.qr_codigo) ? params.qr_codigo[0] : (params?.qr_codigo as string);
  const qrCodigo = extractEquipoCode(rawParam);

  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [loading, setLoading] = useState(true);
  const [horometro, setHorometro] = useState<string>('');
  const [operador, setOperador] = useState<Perfil | null>(null);
  const [inspecciones, setInspecciones] = useState<InspeccionConDetalle[]>([]);
  const [loadingInspecciones, setLoadingInspecciones] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [previewFotoUrl, setPreviewFotoUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    async function init() {
      if (!qrCodigo) return;
      setLoading(true);
      try {
        // Verificar sesión activa
        const authInfo = await getCurrentSessionAndProfile();
        if (!authInfo.user) {
          // No autenticado: preservar destino y redirigir a /login
          const targetPath = `/equipo/${encodeURIComponent(qrCodigo)}`;
          router.replace(`/login?redirect=${encodeURIComponent(targetPath)}`);
          return;
        }

        setOperador(authInfo.perfil);

        const eqData = await fetchEquipoByQR(qrCodigo);

        if (eqData) {
          setEquipo(eqData);
          setHorometro(eqData.horometro_actual.toString());

          // Cargar historial de inspecciones de este equipo
          try {
            setLoadingInspecciones(true);
            const history = await fetchInspeccionesByEquipo(eqData.id);
            setInspecciones(history);
          } catch (histErr) {
            console.error('Error fetching historial de inspecciones:', histErr);
          } finally {
            setLoadingInspecciones(false);
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [qrCodigo, router]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleStartInspection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipo) return;

    if (!operador) {
      toast.error('Debe iniciar sesión para realizar la inspección');
      router.push(`/login?redirect=${encodeURIComponent(`/equipo/${qrCodigo}`)}`);
      return;
    }

    const numHorometro = parseFloat(horometro);
    if (isNaN(numHorometro) || numHorometro < 0) {
      toast.error('Ingrese un valor numérico válido para el horómetro.');
      return;
    }

    if (numHorometro < equipo.horometro_actual) {
      toast.warning(
        `El horómetro ingresado (${numHorometro}) es menor al registrado anteriormente (${equipo.horometro_actual}). Verifique el tablero.`
      );
    }

    // No transmitimos operadorId por URL: la página de inspección obtiene la identidad real desde la sesión Supabase
    const query = new URLSearchParams({
      horometro: numHorometro.toString(),
    });

    router.push(`/inspeccion/${equipo.id}?${query.toString()}`);
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 w-full">
        <div className="h-64 bg-slate-900/60 rounded-2xl animate-pulse border border-slate-800" />
      </div>
    );
  }

  if (!equipo) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-xl font-bold text-white">Autoelevador no encontrado</h2>
        <p className="text-sm text-slate-400">
          No se encontró ningún autoelevador con el código QR o interno <span className="font-mono text-amber-400">{qrCodigo || rawParam}</span>.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition shadow-lg shadow-amber-500/20"
          >
            <ArrowLeft size={16} />
            <span>Volver a escanear</span>
          </Link>
        </div>
      </div>
    );
  }

  const mantenimientoInfo = calcularEstadoMantenimiento(
    equipo.horometro_actual,
    equipo.horometro_proximo_mantenimiento
  );

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-5 sm:py-8 w-full space-y-5 sm:space-y-6">
      {/* Back button */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition btn-tactile"
      >
        <ArrowLeft size={14} />
        <span>Volver al listado de equipos</span>
      </Link>

      {/* Equipment Instrumental Dashboard Card */}
      <div className="bg-[#111724] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Card Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 bg-[#0e1420]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-900 border-2 border-amber-500/40 text-amber-400 font-black text-2xl sm:text-3xl font-mono flex items-center justify-center shadow-lg shadow-amber-500/10 shrink-0">
                {equipo.interno}
              </div>
              <div>
                <span className="text-xs font-mono font-bold text-amber-400">
                  QR: {equipo.qr_codigo}
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Interno #{equipo.interno} — {equipo.marca}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 font-medium">
                  {equipo.modelo} • Combustible: {equipo.combustible || 'GLP'}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-slate-700 hover:border-amber-400 shadow-xs cursor-pointer btn-tactile"
                  title="Ver y descargar código QR"
                >
                  <QrCode size={13} className="text-amber-400" />
                  <span>Ver QR</span>
                </button>
                <StatusBadge estado={equipo.estado} size="sm" />
              </div>
              <MantenimientoBadge
                horometroActual={equipo.horometro_actual}
                proximoMantenimiento={equipo.horometro_proximo_mantenimiento}
                size="sm"
              />
            </div>
          </div>
        </div>

        {/* Warning if out of service */}
        {equipo.estado === 'fuera_de_servicio' && (
          <div className="bg-rose-950/40 border-b border-rose-500/40 p-4 flex items-start gap-3 text-rose-200 text-xs sm:text-sm">
            <ShieldAlert size={20} className="text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block text-rose-300 uppercase tracking-wider">
                PARADA DE SEGURIDAD: Equipo Fuera de Servicio
              </strong>
              Este equipo posee fallas críticas activas pendientes de reparación técnica. No debe ser operado hasta su habilitación.
            </div>
          </div>
        )}

        {/* Maintenance Overdue Alert Banner */}
        {mantenimientoInfo?.nivel === 'vencido' && (
          <div className="bg-rose-950/30 border-b border-rose-500/40 p-4 flex items-start gap-3 text-rose-200 text-xs sm:text-sm">
            <Wrench size={20} className="text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block text-rose-300 uppercase tracking-wider">
                Mantenimiento Preventivo Vencido
              </strong>
              {mantenimientoInfo.labelDetallado}. Coordine el service preventivo con el área de mantenimiento.
            </div>
          </div>
        )}

        {/* Maintenance Upcoming Notice Banner */}
        {mantenimientoInfo?.nivel === 'proximo' && equipo.estado !== 'fuera_de_servicio' && (
          <div className="bg-amber-950/30 border-b border-amber-500/30 px-4 py-3 flex items-start gap-3 text-amber-200 text-xs sm:text-sm">
            <Wrench size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block text-amber-300">Aviso de Service Preventivo Próximo</strong>
              {mantenimientoInfo.labelDetallado}.
            </div>
          </div>
        )}

        {/* Technical gauges grid */}
        <div className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950/60">
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
              <Gauge size={12} className="text-amber-400" /> Horómetro Actual
            </span>
            <p className="text-lg sm:text-xl font-black text-white font-mono font-tabular mt-1">
              {equipo.horometro_actual.toFixed(1)}{' '}
              <span className="text-xs text-slate-400 font-sans font-normal">hs</span>
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
              <Fuel size={12} className="text-amber-400" /> Combustible
            </span>
            <p className="text-lg sm:text-xl font-black text-white mt-1">
              {equipo.combustible || 'GLP'}
            </p>
          </div>

          <div
            className={`p-3.5 rounded-xl col-span-2 sm:col-span-1 border transition ${
              mantenimientoInfo?.nivel === 'vencido'
                ? 'bg-rose-950/40 border-rose-500/50 shadow-xs'
                : mantenimientoInfo?.nivel === 'proximo'
                ? 'bg-amber-950/40 border-amber-500/50'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
                <Wrench size={12} className={mantenimientoInfo?.colorClass.icon || 'text-slate-400'} /> Próximo Service
              </span>
              {mantenimientoInfo && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${mantenimientoInfo.colorClass.badge}`}
                >
                  {mantenimientoInfo.labelCorto}
                </span>
              )}
            </div>
            <p
              className={`text-lg sm:text-xl font-black font-mono font-tabular mt-1 ${
                mantenimientoInfo?.colorClass.text || 'text-amber-400'
              }`}
            >
              {equipo.horometro_proximo_mantenimiento
                ? `${equipo.horometro_proximo_mantenimiento.toLocaleString('es-AR')} hs`
                : 'Programado'}
            </p>
            {mantenimientoInfo?.diferenciaHoras !== null && (
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium font-mono font-tabular">
                {mantenimientoInfo.nivel === 'vencido' ? (
                  <span className="text-rose-400 font-semibold">
                    Excedido por {mantenimientoInfo.horasExceso?.toFixed(1)} hs
                  </span>
                ) : (
                  <span>Faltan {mantenimientoInfo.horasRestantes?.toFixed(1)} hs</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Start inspection Form */}
        <form onSubmit={handleStartInspection} className="p-4 sm:p-6 space-y-4 border-t border-slate-800 bg-[#111724]">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <FileCheck2 size={16} className="text-amber-400" />
            <span>Datos para la Inspección de Turno</span>
          </h2>

          <div className="space-y-3.5">
            {/* Operador activo info */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Operador Responsable
              </label>
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-700/80 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <UserCheck size={16} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white block">
                      {operador ? operador.nombre : 'Sin operador autenticado'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {operador?.legajo ? `Legajo #${operador.legajo}` : 'Debe autenticarse'}
                    </span>
                  </div>
                </div>

                <Link
                  href="/login"
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 underline btn-tactile"
                >
                  {operador ? 'Cambiar' : 'Ingresar'}
                </Link>
              </div>
            </div>

            {/* Horómetro input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Lectura del Horómetro en Tablero <span className="text-amber-400">*</span>
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  Anterior: <strong className="text-white font-tabular">{equipo.horometro_actual.toFixed(1)} hs</strong>
                </span>
              </div>
              <div className="relative">
                <Gauge size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400" />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={horometro}
                  onChange={(e) => setHorometro(e.target.value)}
                  required
                  placeholder="Ej: 1245.5"
                  className="w-full pl-11 pr-20 py-3.5 bg-slate-950 border-2 border-slate-700 focus:border-amber-500 rounded-xl text-lg font-black text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono font-tabular"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-amber-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  HORAS
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[52px] py-3.5 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base rounded-xl transition flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/20 active:scale-98 cursor-pointer btn-tactile mt-4"
          >
            <Play size={18} fill="currentColor" />
            <span>Iniciar Checklist TPM</span>
          </button>
        </form>
      </div>


      {/* SECCIÓN: HISTORIAL DE INSPECCIONES DEL EQUIPO */}
      <div className="bg-[#111724] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Encabezado del Historial */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-[#0e1420]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold shrink-0">
              <History size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-white">
                  Bitácora de Inspecciones
                </h2>
                {!loadingInspecciones && (
                  <span className="text-xs bg-slate-900 text-amber-400 font-mono font-bold px-2 py-0.5 rounded-full border border-slate-700">
                    {inspecciones.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Registros históricos de este autoelevador en planta
              </p>
            </div>
          </div>
        </div>

        {/* Lista de Inspecciones */}
        <div className="p-4 sm:p-5 space-y-3">
          {loadingInspecciones ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Cargando bitácora de inspecciones...</p>
            </div>
          ) : inspecciones.length === 0 ? (
            <div className="bg-slate-950/50 border border-dashed border-slate-800 rounded-xl p-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-slate-500 mx-auto flex items-center justify-center border border-slate-800">
                <ClipboardList size={22} />
              </div>
              <h3 className="font-bold text-white text-sm sm:text-base">
                No hay inspecciones registradas para este equipo
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Cuando un operador realice y finalice el checklist diario para este autoelevador, quedará archivado aquí con el detalle técnico de cada ítem verificado.
              </p>
            </div>
          ) : (
            inspecciones.map((insp) => {
              const isExpanded = expandedIds.has(insp.id);
              const fallas = (insp.respuestas_item || []).flatMap((r) => r.fallas || []);
              const criticas = fallas.filter((f) => f.gravedad === 'critica').length;
              const medias = fallas.filter((f) => f.gravedad === 'media').length;
              const leves = fallas.filter((f) => f.gravedad === 'leve').length;

              const operadorDisplay =
                insp.operador_nombre
                  ? `${insp.operador_nombre}${insp.operador_legajo ? ` (#${insp.operador_legajo})` : ''}`
                  : operador && operador.id === insp.operador_id
                  ? `${operador.nombre} (Tú)`
                  : `Operador #${insp.operador_id.slice(0, 8)}`;

              // Obtener lista única de secciones respetando el orden
              const seccionesUnicas = Array.from(
                new Set(
                  (insp.respuestas_item || []).map(
                    (r) => r.checklist_items?.seccion || 'General'
                  )
                )
              );

              return (
                <div
                  key={insp.id}
                  className="border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden transition hover:border-slate-700 shadow-xs"
                >
                  {/* Fila Resumen / Toggle de Acordeón */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(insp.id)}
                    className="w-full text-left p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-900/40 transition btn-tactile"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {formatDate(insp.iniciado_en || insp.finalizado_en)}
                        </span>
                        {insp.estado_resultante && (
                          <StatusBadge estado={insp.estado_resultante} size="sm" />
                        )}

                        {/* Resumen de Fallas */}
                        {fallas.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                            <CheckCircle2 size={12} /> Sin fallas (19/19 OK)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-rose-300 bg-rose-950/50 border border-rose-500/40 px-2 py-0.5 rounded-md">
                            <AlertTriangle size={12} className="text-rose-400" />
                            <span>
                              {fallas.length} {fallas.length === 1 ? 'falla' : 'fallas'}
                              {criticas > 0
                                ? ` (${criticas} Crítica${criticas > 1 ? 's' : ''})`
                                : medias > 0
                                ? ` (${medias} Media${medias > 1 ? 's' : ''})`
                                : ` (${leves} Leve${leves > 1 ? 's' : ''})`}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <User size={12} className="text-slate-500 shrink-0" />
                          <span className="truncate">{operadorDisplay}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Gauge size={12} className="text-slate-500 shrink-0" />
                          <span className="font-mono font-tabular text-slate-300 font-bold">
                            {insp.horometro.toFixed(1)} hs
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80 text-xs font-bold text-amber-400">
                      <span className="text-[11px] text-slate-400 sm:hidden">
                        {isExpanded ? 'Ocultar detalle' : 'Ver detalle (19 ítems)'}
                      </span>
                      <div className="flex items-center gap-1 bg-slate-900 sm:bg-transparent px-2 py-1 rounded-lg">
                        <span className="hidden sm:inline text-xs font-bold">
                          {isExpanded ? 'Contraer' : 'Ver detalle'}
                        </span>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </button>

                  {/* Panel Detallado Expandible */}
                  {isExpanded && (
                    <div className="p-4 border-t border-slate-800/80 bg-slate-900/30 space-y-4">
                      {/* 1. SECCIÓN DE FALLAS DETECTADAS (SI EXISTEN) */}
                      {fallas.length > 0 && (
                        <div className="space-y-2.5">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                            <AlertTriangle size={13} />
                            <span>Fallas Reportadas en esta Inspección ({fallas.length})</span>
                          </h4>

                          <div className="grid grid-cols-1 gap-2.5">
                            {fallas.map((f, idx) => {
                              const itemRelacionado = insp.respuestas_item?.find(
                                (r) => r.fallas && r.fallas.some((rf) => rf.id === f.id)
                              )?.checklist_items;

                              return (
                                <div
                                  key={f.id || idx}
                                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-start gap-3 shadow-xs"
                                >
                                  {f.foto_url && (
                                    <div
                                      onClick={() => setPreviewFotoUrl(f.foto_url)}
                                      className="relative w-full sm:w-24 h-24 shrink-0 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 cursor-pointer group"
                                      title="Clic para ampliar foto"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={f.foto_url}
                                        alt="Evidencia de falla"
                                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                                      />
                                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-bold gap-1 transition">
                                        <ImageIcon size={13} /> Ver
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                          f.gravedad === 'critica'
                                            ? 'bg-rose-950/80 text-rose-300 border-rose-500/60'
                                            : f.gravedad === 'media'
                                            ? 'bg-orange-950/80 text-orange-300 border-orange-500/50'
                                            : 'bg-yellow-950/80 text-yellow-300 border-yellow-500/40'
                                        }`}
                                      >
                                        {f.gravedad}
                                      </span>
                                      {itemRelacionado && (
                                        <span className="text-xs font-bold text-white">
                                          {itemRelacionado.etiqueta}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-300 leading-relaxed">
                                      {f.descripcion || 'Sin descripción ingresada'}
                                    </p>
                                    {f.foto_url && (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewFotoUrl(f.foto_url)}
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 pt-0.5 cursor-pointer"
                                      >
                                        <ImageIcon size={12} /> Ver fotografía ampliada
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 2. DETALLE COMPLETO DE LOS 19 ÍTEMS */}
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <ClipboardList size={13} className="text-amber-400" />
                          <span>Detalle Completo del Checklist ({insp.respuestas_item?.length || 0} ítems)</span>
                        </h4>

                        <div className="space-y-2.5">
                          {seccionesUnicas.map((sec) => {
                            const itemsEnSeccion = (insp.respuestas_item || []).filter(
                              (r) => (r.checklist_items?.seccion || 'General') === sec
                            );

                            return (
                              <div
                                key={sec}
                                className="bg-slate-950/90 border border-slate-800/80 rounded-xl overflow-hidden"
                              >
                                <div className="bg-slate-900/90 px-3.5 py-1.5 border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                  {sec}
                                </div>
                                <div className="divide-y divide-slate-800/50">
                                  {itemsEnSeccion.map((r) => {
                                    const item = r.checklist_items;
                                    return (
                                      <div
                                        key={r.id}
                                        className="p-2.5 sm:p-3 flex items-center justify-between gap-3 text-xs"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                            #{item?.orden || '—'}
                                          </span>
                                          <span className="text-slate-200 truncate">
                                            {item?.etiqueta || 'Ítem de inspección'}
                                          </span>
                                        </div>

                                        {/* Valor respondido */}
                                        <div className="shrink-0">
                                          {r.es_falla ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-500/50">
                                              <XCircle size={11} /> Falla
                                            </span>
                                          ) : r.valor_bool === true ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
                                              <CheckCircle2 size={11} /> Conforme
                                            </span>
                                          ) : r.valor_bool === false ? (
                                            <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                              No
                                            </span>
                                          ) : r.valor_numero !== null ? (
                                            <span className="font-mono font-bold text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                              {r.valor_numero}
                                            </span>
                                          ) : (
                                            <span className="text-slate-300 max-w-[160px] truncate text-[11px] italic">
                                              {r.valor_texto || '—'}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>


      {/* MODAL LIGHTBOX PARA FOTO DE FALLA */}
      {previewFotoUrl && (
        <div
          onClick={() => setPreviewFotoUrl(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl space-y-3 p-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ImageIcon size={16} className="text-amber-400" />
                Evidencia Fotográfica de Falla
              </h3>
              <button
                type="button"
                onClick={() => setPreviewFotoUrl(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-hidden rounded-xl bg-slate-950 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewFotoUrl}
                alt="Evidencia ampliada"
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setPreviewFotoUrl(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Visualizar y Descargar QR Grande */}
      <EquipoQRModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        equipo={equipo}
      />
    </div>
  );
}

