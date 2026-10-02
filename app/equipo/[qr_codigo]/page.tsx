'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchEquipoByQR, fetchInspeccionesByEquipo } from '../../../lib/api/tpm';
import { useAuth } from '../../../components/AuthProvider';
import { Equipo, Perfil, InspeccionConDetalle } from '../../../lib/types/tpm';
import { StatusBadge } from '../../../components/StatusBadge';
import { MantenimientoBadge } from '../../../components/MantenimientoBadge';
import dynamic from 'next/dynamic';

const EquipoQRModal = dynamic(
  () => import('../../../components/EquipoQRModal').then((mod) => mod.EquipoQRModal),
  { ssr: false }
);
import { formatDate, formatQrCodigoDisplay } from '../../../lib/utils';
import { ModalPortal } from '../../../components/ModalPortal';
import { extractEquipoCode } from '../../../lib/utils/auth-helpers';
import {
  ArrowLeft,
  AlertTriangle,
  Play,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  X,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  Wrench,
  QrCode,
} from 'lucide-react';
import { toast } from 'sonner';
import { calcularEstadoMantenimiento } from '../../../lib/utils/mantenimiento';
import { ScrollReveal } from '../../../components/ScrollReveal';

export default function EquipoFichaPage() {
  const params = useParams();
  const router = useRouter();
  const { user, perfil, loading: authLoading } = useAuth();
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
      if (!qrCodigo || authLoading) return;
      setLoading(true);
      try {
        if (!user && !perfil) {
          // No autenticado ni operador activo: preservar destino y redirigir a /login
          const targetPath = `/equipo/${encodeURIComponent(qrCodigo)}`;
          router.replace(`/login?redirect=${encodeURIComponent(targetPath)}`);
          return;
        }

        setOperador(perfil);

        try {
          const eqData = await fetchEquipoByQR(qrCodigo);
          if (eqData) {
            setEquipo(eqData);
            setHorometro(eqData.horometro_actual.toString());

            const isOffline = typeof window !== 'undefined' && !navigator.onLine;
            // Cargar historial de inspecciones solo si hay conexión
            if (!isOffline) {
              try {
                setLoadingInspecciones(true);
                const history = await fetchInspeccionesByEquipo(eqData.id);
                setInspecciones(history);
              } catch (histErr) {
                console.error('Error fetching historial de inspecciones:', histErr);
              } finally {
                setLoadingInspecciones(false);
              }
            } else {
              setLoadingInspecciones(false);
            }
          }
        } catch (eqErr: any) {
          console.error('Error fetching equipo by QR:', eqErr);
          toast.error(eqErr?.message || 'No se pudo cargar la información del autoelevador');
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [qrCodigo, user, perfil, authLoading, router]);

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

  const [horometroConfirmacionModal, setHorometroConfirmacionModal] = useState<{
    numHorometro: number;
    diferencia: number;
  } | null>(null);

  const handleStartInspection = (e?: React.FormEvent, isConfirmed = false) => {
    if (e) e.preventDefault();
    if (!equipo) return;

    if (!operador) {
      toast.error('Debe iniciar sesión para realizar la inspección');
      router.push(`/login?redirect=${encodeURIComponent(`/equipo/${qrCodigo}`)}`);
      return;
    }

    const numHorometro = parseFloat(horometro);
    if (isNaN(numHorometro) || !isFinite(numHorometro) || numHorometro < 0) {
      toast.error('Ingrese un valor numérico válido para el horómetro (ej: 890.2).');
      return;
    }

    if (numHorometro < equipo.horometro_actual) {
      toast.warning(
        `El horómetro ingresado (${numHorometro} hs) es menor al registrado anteriormente (${equipo.horometro_actual} hs). Verifique el tablero.`
      );
    }

    // Modal de confirmación si el incremento es desproporcionadamente mayor (+100 hs)
    if (numHorometro > equipo.horometro_actual + 100 && !isConfirmed) {
      setHorometroConfirmacionModal({
        numHorometro,
        diferencia: numHorometro - equipo.horometro_actual,
      });
      return;
    }

    // No transmitimos operadorId por URL: la página de inspección obtiene la identidad real desde la sesión Supabase
    const query = new URLSearchParams({
      horometro: numHorometro.toString(),
    });

    router.push(`/inspeccion/${equipo.id}?${query.toString()}`);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 w-full">
        <div className="h-64 bg-slate-900/60 rounded-lg animate-pulse border border-slate-800" />
      </div>
    );
  }

  if (!equipo) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 w-full text-center space-y-4">
        <div className="w-14 h-14 rounded-lg bg-rose-950/80 border border-rose-500/50 text-rose-400 mx-auto flex items-center justify-center">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-xl font-bold text-white uppercase tracking-tight">Autoelevador no encontrado</h2>
        <p className="text-xs text-slate-400 font-mono">
          No se encontró ningún autoelevador con el código QR o interno <span className="font-mono font-bold text-amber-400">{qrCodigo || rawParam}</span>.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-md transition"
          >
            <ArrowLeft size={15} />
            <span>Volver al scanner</span>
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
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-5 w-full space-y-5">
      {/* Navegación posterior estilo técnico */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-400 hover:text-amber-400 transition"
        >
          <ArrowLeft size={14} />
          <span>Volver al inventario de flota</span>
        </Link>
        <span className="text-[11px] font-mono text-slate-500 uppercase tracking-widest hidden sm:inline">
          FICHA TÉCNICA • PLANTA INDUSTRIAL
        </span>
      </div>

      {/* PLACA TÉCNICA DIGITAL DEL AUTOELEVADOR (Estructura Sobria de Maquinaria) */}
      <ScrollReveal direction="up" distance={16}>
        <div className="bg-[#0e1420] border border-slate-800 rounded-lg overflow-hidden space-y-0">

          {/* Cabecera Principal de Identificación */}
          <div className="p-4 sm:p-5 bg-[#0b0f17] border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">

            {/* Identificador Físico & Especificación */}
            <div className="flex items-start gap-3.5">
              <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded text-center shrink-0">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 block">
                  INTERNO
                </span>
                <span className="text-2xl sm:text-3xl font-mono font-black text-amber-400 leading-none">
                  {equipo.interno.padStart(2, '0')}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    QR: {formatQrCodigoDisplay(equipo.qr_codigo)}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Combustible: <strong className="text-slate-200">{equipo.combustible || 'GLP'}</strong>
                  </span>
                </div>

                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug">
                  {equipo.marca} {equipo.modelo}
                </h1>
              </div>
            </div>

            {/* Estado Operativo & Acción QR */}
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-slate-300 font-mono font-bold text-xs rounded border border-slate-800 hover:border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                title="Ver y descargar placa QR oficial"
              >
                <QrCode size={14} className="text-amber-400" />
                <span>Ver QR</span>
              </button>
              <StatusBadge estado={equipo.estado} size="sm" />
              {equipo.deleted_at && (
                <span className="px-2 py-0.5 bg-rose-950 text-rose-300 border border-rose-600 rounded text-[10px] font-mono font-bold uppercase tracking-wider">
                  Dado de Baja
                </span>
              )}
            </div>
          </div>

          {/* BANNERS DE ALERTAS CRÍTICAS Y PARADA DE SEGURIDAD (Sin Glows ni Blur) */}
          {equipo.deleted_at && (
            <div className="bg-rose-950/90 border-l-4 border-rose-500 border-b border-rose-900/80 p-4 flex items-start gap-3 text-rose-100 text-xs sm:text-sm">
              <ShieldAlert size={22} className="text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="font-bold text-rose-200 uppercase tracking-wider block font-mono text-sm">
                  AUTOELEVADOR DADO DE BAJA ADMINISTRATIVA
                </strong>
                <p className="text-rose-200/90 leading-relaxed text-xs">
                  Este autoelevador ha sido dado de baja por la supervisión de planta. No está habilitado para ser operado ni realizar nuevas inspecciones. Su historial técnico permanece disponible exclusivamente a modo de consulta.
                </p>
              </div>
            </div>
          )}

          {equipo.estado === 'fuera_de_servicio' && !equipo.deleted_at && (
            <div className="bg-rose-950/80 border-l-4 border-rose-500 border-b border-rose-900/60 p-3.5 sm:p-4 flex items-start gap-3 text-rose-100 text-xs sm:text-sm">
              <ShieldAlert size={20} className="text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="font-bold text-rose-200 uppercase tracking-wider block font-mono">
                  PARADA DE SEGURIDAD: EQUIPO FUERA DE SERVICIO
                </strong>
                <p className="text-rose-200/90 leading-relaxed text-xs">
                  Este autoelevador registra defectos críticos de seguridad activos. Prohibida su operación hasta habilitación técnica de mantenimiento.
                </p>
              </div>
            </div>
          )}

          {mantenimientoInfo?.nivel === 'vencido' && !equipo.deleted_at && (
            <div className="bg-rose-950/60 border-l-4 border-rose-500 border-b border-rose-900/60 p-3.5 sm:p-4 flex items-start gap-3 text-rose-100 text-xs sm:text-sm">
              <Wrench size={18} className="text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="font-bold text-rose-200 uppercase tracking-wider block font-mono">
                  SERVICE PREVENTIVO VENCIDO
                </strong>
                <p className="text-rose-200/90 leading-relaxed text-xs">
                  {mantenimientoInfo.labelDetallado}. Coordine la entrada a taller con el supervisor.
                </p>
              </div>
            </div>
          )}

          {mantenimientoInfo?.nivel === 'proximo' && equipo.estado !== 'fuera_de_servicio' && !equipo.deleted_at && (
            <div className="bg-amber-950/60 border-l-4 border-amber-500 border-b border-amber-900/60 p-3.5 flex items-start gap-3 text-amber-100 text-xs sm:text-sm">
              <Wrench size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="font-bold text-amber-200 uppercase tracking-wider block font-mono text-xs">
                  AVISO DE SERVICE PREVENTIVO PRÓXIMO
                </strong>
                <p className="text-amber-200/90 text-xs">
                  {mantenimientoInfo.labelDetallado}.
                </p>
              </div>
            </div>
          )}

          {/* FRANJA DE TELEMETRÍA Y MEDIDORES TÉCNICOS (Líneas de división nítidas sin cards anidadas) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y sm:divide-y-0 divide-slate-800 bg-slate-950/90">

            {/* Horómetro Actual */}
            <div className="p-3.5 sm:p-4">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                Horómetro Actual
              </span>
              <p className="text-xl sm:text-2xl font-mono font-black font-tabular text-white mt-1">
                {equipo.horometro_actual.toFixed(1)}{' '}
                <span className="text-xs font-mono font-normal text-slate-400">h</span>
              </p>
            </div>

            {/* Combustible / Fuente de Energía */}
            <div className="p-3.5 sm:p-4">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                Combustible
              </span>
              <p className="text-base sm:text-lg font-bold text-white mt-1">
                {equipo.combustible || 'GLP'}
              </p>
            </div>

            {/* Próximo Service */}
            <div className="p-3.5 sm:p-4 col-span-2 sm:col-span-1 border-t sm:border-t-0 border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                  Próximo Service
                </span>
                {mantenimientoInfo && (
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${mantenimientoInfo.colorClass.badge}`}>
                    {mantenimientoInfo.labelCorto}
                  </span>
                )}
              </div>
              <p className={`text-base sm:text-lg font-mono font-black font-tabular mt-1 ${mantenimientoInfo?.colorClass.text || 'text-amber-400'}`}>
                {equipo.horometro_proximo_mantenimiento
                  ? `${equipo.horometro_proximo_mantenimiento.toLocaleString('es-AR')} h`
                  : 'No programado'}
              </p>
              {mantenimientoInfo?.diferenciaHoras !== null && (
                <p className="text-[11px] font-mono font-tabular mt-0.5 text-slate-400">
                  {mantenimientoInfo.nivel === 'vencido' ? (
                    <span className="text-rose-400 font-bold">
                      Excedido +{mantenimientoInfo.horasExceso?.toFixed(1)} h
                    </span>
                  ) : (
                    <span>Restan {mantenimientoInfo.horasRestantes?.toFixed(1)} h</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* FORMULARIO DE INICIO DE CHECKLIST TPM DE TURNO */}
          {equipo.deleted_at ? (
            <div className="p-6 bg-[#0e1420] border-t border-slate-800 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-rose-950/80 border border-rose-500/50 text-rose-400 mx-auto flex items-center justify-center">
                <ShieldAlert size={20} />
              </div>
              <h3 className="font-mono font-bold text-sm text-rose-300 uppercase tracking-wider">
                CHECKLIST DESHABILITADO POR BAJA ADMINISTRATIVA
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Este autoelevador fue dado de baja y no permite iniciar nuevas inspecciones de turno. Si requiere reactivarlo, contacte al supervisor de planta.
              </p>
            </div>
          ) : (
            <form onSubmit={handleStartInspection} className="p-4 sm:p-6 space-y-4 border-t border-slate-800 bg-[#0e1420]">

              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                  REGISTRO DE INGRESO DE TURNO
                </h2>
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">
                  CHECKLIST NIVEL 1
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Identidad del Operador Activo */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    Operador Responsable
                  </label>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-md flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-white block">
                        {operador ? operador.nombre : 'Sin operador autenticado'}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {operador?.legajo ? `Legajo #${operador.legajo}` : 'Debe autenticarse'}
                      </span>
                    </div>
                    <Link
                      href="/login"
                      className="text-xs font-bold text-amber-400 hover:text-amber-300 underline font-mono cursor-pointer"
                    >
                      {operador ? 'Cambiar' : 'Ingresar'}
                    </Link>
                  </div>
                </div>

                {/* Input de Horómetro en Tablero */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                      Lectura de Horómetro <span className="text-amber-400">*</span>
                    </label>
                    <span className="text-[11px] font-mono text-slate-500">
                      Anterior: <strong className="text-slate-300 font-tabular">{equipo.horometro_actual.toFixed(1)} h</strong>
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      inputMode="decimal"
                      value={horometro}
                      onChange={(e) => {
                        setHorometro(e.target.value);
                        if (horometroConfirmacionModal) setHorometroConfirmacionModal(null);
                      }}
                      required
                      placeholder="Ej: 1245.5"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-md px-3.5 py-3 text-base font-bold text-white placeholder-slate-600 focus:outline-none font-mono font-tabular"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      HORAS
                    </span>
                  </div>
                </div>
              </div>

              {/* Botón de Acción Principal de la Pantalla */}
              <button
                type="submit"
                className="w-full min-h-[48px] py-3.5 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm uppercase tracking-wider rounded-md transition flex items-center justify-center gap-2 border border-amber-400 cursor-pointer btn-tactile mt-2"
              >
                <Play size={16} fill="currentColor" />
                <span>INICIAR CHECKLIST TPM</span>
              </button>
            </form>
          )}
        </div>
      </ScrollReveal>

      {/* SECCIÓN: BITÁCORA TÉCNICA DE INSPECCIONES HISTÓRICAS */}
      <ScrollReveal delay={150}>
        <div className="bg-[#0e1420] border border-slate-800 rounded-lg overflow-hidden">

          {/* Encabezado del Registro Técnico */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0b0f17]">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                BITÁCORA TÉCNICA DE INSPECCIONES
              </h2>
              {!loadingInspecciones && (
                <span className="text-xs bg-slate-950 text-amber-400 font-mono font-bold px-2 py-0.5 rounded border border-slate-800">
                  {inspecciones.length} REGISTROS
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
              HISTORIAL OFICIAL DE PLANTA
            </span>
          </div>

          {/* Lista de Registros de Bitácora */}
          <div className="divide-y divide-slate-800 bg-slate-950/40">
          {loadingInspecciones ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-slate-400">Cargando bitácora de inspecciones...</p>
            </div>
          ) : inspecciones.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="font-bold text-slate-300 text-sm">Sin inspecciones registradas para este equipo</p>
              <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
                Los checklists completados en cada turno se archivarán automáticamente en esta bitácora.
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

              const seccionesUnicas = Array.from(
                new Set(
                  (insp.respuestas_item || []).map(
                    (r) => r.checklist_items?.seccion || 'General'
                  )
                )
              );

              return (
                <div key={insp.id} className="transition hover:bg-slate-900/40">
                  {/* Fila Principal de la Bitácora */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(insp.id)}
                    className="w-full text-left p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer btn-tactile"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {formatDate(insp.iniciado_en || insp.finalizado_en)}
                        </span>
                        {insp.estado_resultante && (
                          <StatusBadge estado={insp.estado_resultante} size="sm" />
                        )}

                        {/* Indicador Sobrio de Defectos */}
                        {fallas.length === 0 ? (
                          <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded">
                            SIN FALLAS (19/19 OK)
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-rose-300 bg-rose-950/80 border border-rose-500/60 px-2 py-0.5 rounded">
                            {fallas.length} {fallas.length === 1 ? 'DEFECTO' : 'DEFECTOS'}
                            {criticas > 0 ? ` (${criticas} CRÍTICO)` : medias > 0 ? ` (${medias} MEDIO)` : ` (${leves} LEVE)`}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                        <span>Operador: <strong className="text-slate-300 font-sans">{operadorDisplay}</strong></span>
                        <span>Horómetro: <strong className="text-slate-200 font-tabular">{insp.horometro.toFixed(1)} h</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 shrink-0 self-end sm:self-center">
                      <span>{isExpanded ? 'CONTRAER' : 'VER DETALLE'}</span>
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </button>

                  {/* Panel Detallado Expandible (Estructura Técnica Limpia) */}
                  {isExpanded && (
                    <div className="p-4 border-t border-slate-800 bg-slate-900/60 space-y-4 border-l-2 border-l-amber-500/60">

                      {/* Defectos Reportados */}
                      {fallas.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-rose-400">
                            DEFECTOS DETECTADOS EN ESTE TURNO ({fallas.length})
                          </h4>

                          <div className="grid grid-cols-1 gap-2">
                            {fallas.map((f, idx) => {
                              const itemRelacionado = insp.respuestas_item?.find(
                                (r) => r.fallas && r.fallas.some((rf) => rf.id === f.id)
                              )?.checklist_items;

                              return (
                                <div
                                  key={f.id || idx}
                                  className="bg-slate-950 border border-slate-800 rounded p-3 flex flex-col sm:flex-row items-start gap-3"
                                >
                                  {f.foto_url && (
                                    <div
                                      onClick={() => setPreviewFotoUrl(f.foto_url)}
                                      className="relative w-full sm:w-20 h-20 shrink-0 rounded overflow-hidden border border-slate-700 bg-slate-900 cursor-pointer group"
                                      title="Clic para ampliar foto"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={f.foto_url}
                                        alt="Evidencia de falla"
                                        className="w-full h-full object-cover"
                                      />
                                      <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-mono font-bold gap-1 transition">
                                        <ImageIcon size={12} /> AMPLIAR
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
                                          f.gravedad === 'critica'
                                            ? 'bg-rose-950 text-rose-300 border-rose-500'
                                            : f.gravedad === 'media'
                                            ? 'bg-orange-950 text-orange-300 border-orange-500'
                                            : 'bg-yellow-950 text-yellow-300 border-yellow-500'
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
                                        className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-amber-400 hover:text-amber-300 pt-0.5 cursor-pointer"
                                      >
                                        <ImageIcon size={12} /> Ampliar fotografía
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Lista de Ítems del Checklist */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                          DETALLE DE ÍTEMS VERIFICADOS ({insp.respuestas_item?.length || 0})
                        </h4>

                        <div className="space-y-2">
                          {seccionesUnicas.map((sec) => {
                            const itemsEnSeccion = (insp.respuestas_item || []).filter(
                              (r) => (r.checklist_items?.seccion || 'General') === sec
                            );

                            return (
                              <div
                                key={sec}
                                className="bg-slate-950 border border-slate-800 rounded overflow-hidden"
                              >
                                <div className="bg-slate-900 px-3 py-1 border-b border-slate-800 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                                  {sec}
                                </div>
                                <div className="divide-y divide-slate-800/60">
                                  {itemsEnSeccion.map((r) => {
                                    const item = r.checklist_items;
                                    return (
                                      <div
                                        key={r.id}
                                        className="p-2.5 flex items-center justify-between gap-3 text-xs"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                            #{item?.orden || '—'}
                                          </span>
                                          <span className="text-slate-200 truncate">
                                            {item?.etiqueta || 'Ítem de inspección'}
                                          </span>
                                        </div>

                                        <div className="shrink-0">
                                          {r.es_falla ? (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-500">
                                              <XCircle size={10} /> FALLA
                                            </span>
                                          ) : r.valor_bool === true ? (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                                              <CheckCircle2 size={10} /> OK
                                            </span>
                                          ) : r.valor_bool === false ? (
                                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                              NO
                                            </span>
                                          ) : r.valor_numero !== null ? (
                                            <span className="font-mono font-bold text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                              {r.valor_numero}
                                            </span>
                                          ) : (
                                            <span className="text-slate-400 max-w-[160px] truncate text-[11px] italic">
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
      </ScrollReveal>

      {/* MODAL LIGHTBOX PARA FOTO DE FALLA */}
      {previewFotoUrl && (
        <ModalPortal>
          <div
            onClick={() => setPreviewFotoUrl(null)}
            className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 cursor-pointer overflow-y-auto w-screen h-dvh min-h-dvh"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-3xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl space-y-3 p-4 my-auto max-h-[90dvh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-mono font-bold uppercase text-white flex items-center gap-2">
                  <ImageIcon size={15} className="text-amber-400" />
                  EVIDENCIA FOTOGRÁFICA DE DEFECTO
                </h3>
                <button
                  type="button"
                  onClick={() => setPreviewFotoUrl(null)}
                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[75dvh] overflow-hidden rounded bg-slate-950 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewFotoUrl}
                  alt="Evidencia ampliada"
                  className="max-h-[75dvh] w-auto object-contain rounded"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setPreviewFotoUrl(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono font-bold rounded transition cursor-pointer"
                >
                  CERRAR
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* MODAL PARA VISUALIZAR Y DESCARGAR QR */}
      {showQrModal && (
        <EquipoQRModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          equipo={equipo}
        />
      )}

      {/* MODAL DE CONFIRMACIÓN DE HORÓMETRO ALTO (+100 hs) */}
      {horometroConfirmacionModal && (
        <ModalPortal>
          <div
            onClick={() => setHorometroConfirmacionModal(null)}
            className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto w-screen h-dvh min-h-dvh"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-md w-full bg-[#0e1420] border border-amber-500/60 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[90dvh] overflow-y-auto"
            >
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="w-10 h-10 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/40">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white uppercase tracking-tight font-mono">
                    ¿Confirmar Lectura de Horómetro?
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    La lectura ingresada presenta un incremento alto respecto al último registro.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded p-4 space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between items-center text-slate-400 font-mono">
                  <span>Último registrado:</span>
                  <span className="font-bold text-white font-tabular">
                    {equipo.horometro_actual.toFixed(1)} h
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400 font-mono">
                  <span>Ingresado ahora:</span>
                  <span className="font-bold text-amber-400 font-tabular">
                    {horometroConfirmacionModal.numHorometro.toFixed(1)} h
                  </span>
                </div>
                <div className="flex justify-between items-center text-amber-300 font-bold font-mono border-t border-slate-800 pt-2">
                  <span>Diferencia:</span>
                  <span className="font-bold font-tabular text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-500/40">
                    +{horometroConfirmacionModal.diferencia.toFixed(1)} h
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setHorometroConfirmacionModal(null)}
                  className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-bold text-xs rounded transition cursor-pointer min-h-[44px] flex items-center justify-center uppercase"
                >
                  Corregir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHorometroConfirmacionModal(null);
                    handleStartInspection(undefined, true);
                  }}
                  className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-xs rounded transition shadow-md cursor-pointer min-h-[44px] flex items-center justify-center uppercase"
                >
                  Confirmar y Continuar
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
