'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchEquipoById,
  fetchActiveChecklistTemplate,
  submitInspeccion,
} from '../../../lib/api/tpm';
import { getCurrentSessionAndProfile } from '../../../lib/api/auth';
import {
  Equipo,
  ChecklistTemplate,
  ChecklistItem,
  ChecklistItemResponse,
  EstadoEquipo,
  GravedadFalla,
} from '../../../lib/types/tpm';
import { enqueueInspeccion } from '../../../lib/offline/queue';
import { StatusBadge } from '../../../components/StatusBadge';
import { GravedadBadge } from '../../../components/GravedadBadge';
import { FallaModal } from '../../../components/FallaModal';
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  Camera,
  ChevronRight,
  ChevronLeft,
  Send,
  CheckCircle2,
  ShieldAlert,
  Gauge,
  User,
  Edit2,
  Sparkles,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

export default function InspeccionChecklistPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const equipoId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);
  const horometroParam = searchParams.get('horometro');
  const [operadorNombre, setOperadorNombre] = useState<string>('Operador Planta');

  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Respuestas del checklist: map itemId -> ChecklistItemResponse
  const [responses, setResponses] = useState<Record<string, ChecklistItemResponse>>({});

  // Active section index
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  // Modal para reporte de falla
  const [modalItem, setModalItem] = useState<ChecklistItem | null>(null);

  // Estado de finalización
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedResult, setCompletedResult] = useState<{
    inspeccionId: string;
    estadoResultante: EstadoEquipo;
    fallasCount: number;
  } | null>(null);

  const startTime = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    async function initData() {
      if (!equipoId) return;
      setLoading(true);
      try {
        // 1. Validar sesión activa del operario
        const authInfo = await getCurrentSessionAndProfile();
        if (!authInfo.user) {
          toast.error('Debe iniciar sesión para realizar la inspección');
          const currentUrl = window.location.pathname + window.location.search;
          router.replace(`/login?redirect=${encodeURIComponent(currentUrl)}`);
          return;
        }

        if (authInfo.perfil) {
          setOperadorNombre(
            authInfo.perfil.nombre + (authInfo.perfil.legajo ? ` (#${authInfo.perfil.legajo})` : '')
          );
        }

        const [eqData, tmplData] = await Promise.all([
          fetchEquipoById(equipoId),
          fetchActiveChecklistTemplate(),
        ]);

        if (eqData) setEquipo(eqData);
        if (tmplData) {
          setTemplate(tmplData.template);
          setItems(tmplData.items);

          // Inicializar respuestas por defecto
          const initialMap: Record<string, ChecklistItemResponse> = {};
          tmplData.items.forEach((item) => {
            initialMap[item.id] = {
              item_id: item.id,
              valor_bool: null,
              valor_numero: null,
              valor_texto: null,
              es_falla: false,
            };
          });
          setResponses(initialMap);
        }
      } catch (err) {
        console.error('Error loading checklist data:', err);
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, [equipoId, router]);

  // Agrupamiento de ítems por sección
  const sections = useMemo(() => {
    const list: { name: string; items: ChecklistItem[] }[] = [];
    items.forEach((item) => {
      let sec = list.find((s) => s.name === item.seccion);
      if (!sec) {
        sec = { name: item.seccion, items: [] };
        list.push(sec);
      }
      sec.items.push(item);
    });
    return list;
  }, [items]);

  const currentSection = sections[activeSectionIndex] || { name: '', items: [] };

  // Cálculo del estado resultante en tiempo real
  const { estadoCalculado, fallasDetectadas } = useMemo(() => {
    const fallas: { item: ChecklistItem; response: ChecklistItemResponse }[] = [];

    Object.values(responses).forEach((resp) => {
      if (resp.es_falla && resp.falla) {
        const itemObj = items.find((i) => i.id === resp.item_id);
        if (itemObj) {
          fallas.push({ item: itemObj, response: resp });
        }
      }
    });

    const hasCritica = fallas.some((f) => f.response.falla?.gravedad === 'critica');
    const hasMediaOLeve = fallas.some(
      (f) => f.response.falla?.gravedad === 'media' || f.response.falla?.gravedad === 'leve'
    );

    let estado: EstadoEquipo = 'operativo';
    if (hasCritica) {
      estado = 'fuera_de_servicio';
    } else if (hasMediaOLeve) {
      estado = 'observado';
    }

    return {
      estadoCalculado: estado,
      fallasDetectadas: fallas,
    };
  }, [responses, items]);

  // Contadores de progreso
  const totalItems = items.length;
  const answeredCount = Object.values(responses).filter(
    (r) => r.valor_bool !== null || r.valor_numero !== null || (r.valor_texto && r.valor_texto.length > 0)
  ).length;
  const progressPercent = totalItems > 0 ? Math.round((answeredCount / totalItems) * 100) : 0;

  // Handlers para marcar items
  const handleMarkOk = (itemId: string) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: {
        item_id: itemId,
        valor_bool: true,
        valor_numero: null,
        valor_texto: null,
        es_falla: false,
        falla: undefined,
      },
    }));
  };

  const handleOpenFallaModal = (item: ChecklistItem) => {
    setModalItem(item);
  };

  const handleSaveFalla = (data: {
    gravedad: GravedadFalla;
    descripcion: string;
    foto_base64?: string;
  }) => {
    if (!modalItem) return;

    setResponses((prev) => ({
      ...prev,
      [modalItem.id]: {
        item_id: modalItem.id,
        valor_bool: false,
        valor_numero: null,
        valor_texto: null,
        es_falla: true,
        falla: {
          gravedad: data.gravedad,
          descripcion: data.descripcion,
          foto_base64: data.foto_base64,
        },
      },
    }));

    setModalItem(null);
    toast.error(`Falla ${data.gravedad.toUpperCase()} registrada en "${modalItem.etiqueta}"`);
  };

  const handleNumberChange = (itemId: string, value: number) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: {
        item_id: itemId,
        valor_bool: null,
        valor_numero: value,
        valor_texto: null,
        es_falla: false,
      },
    }));
  };

  const handleTextChange = (itemId: string, value: string) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: {
        item_id: itemId,
        valor_bool: null,
        valor_numero: null,
        valor_texto: value,
        es_falla: false,
      },
    }));
  };

  // Finalizar inspección
  const handleSubmitInspection = async () => {
    if (!equipo || !template) return;

    // Verificar si faltan ítems por responder
    const pendingBooleanItems = items.filter(
      (item) => item.tipo_dato === 'booleano' && responses[item.id]?.valor_bool === null
    );

    if (pendingBooleanItems.length > 0) {
      toast.warning(
        `Faltan responder ${pendingBooleanItems.length} ítem(s) del checklist antes de finalizar.`
      );
      // Ir a la sección que contiene el primer ítem pendiente
      const firstPending = pendingBooleanItems[0];
      const secIdx = sections.findIndex((s) => s.name === firstPending.seccion);
      if (secIdx !== -1) {
        setActiveSectionIndex(secIdx);
      }
      return;
    }

    // Obtener identidad real del operador desde la sesión activa de Supabase
    const authInfo = await getCurrentSessionAndProfile();
    if (!authInfo.user) {
      toast.error('Sesión no válida o caducada. Por favor inicie sesión nuevamente.');
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      return;
    }

    const finalOperadorId = authInfo.user.id;

    const payload = {
      equipo_id: equipo.id,
      operador_id: finalOperadorId,
      template_id: template.id,
      horometro: parseFloat(horometroParam || equipo.horometro_actual.toString()),
      iniciado_en: startTime,
      finalizado_en: new Date().toISOString(),
      estado_resultante: estadoCalculado,
      respuestas: Object.values(responses),
    };

    setIsSubmitting(true);

    try {
      // Si el navegador reporta explícitamente estar offline
      if (typeof window !== 'undefined' && !navigator.onLine) {
        await enqueueInspeccion(payload);
        toast.info('Sin conexión: la inspección se guardó en este dispositivo y se sincronizará automáticamente al reconectar.');
        setCompletedResult({
          inspeccionId: 'offline-queued',
          estadoResultante: estadoCalculado,
          fallasCount: fallasDetectadas.length,
        });
        return;
      }

      // Enviar a Supabase
      const res = await submitInspeccion(payload);
      if (res.success) {
        toast.success('¡Inspección TPM guardada exitosamente!');
        setCompletedResult({
          inspeccionId: res.inspeccionId || 'done',
          estadoResultante: estadoCalculado,
          fallasCount: fallasDetectadas.length,
        });
      } else if (res.queuedOffline) {
        // Encolado localmente únicamente por corte comprobado de red
        toast.info('Sin conexión: la inspección se guardó en este dispositivo y se sincronizará automáticamente al reconectar.');
        setCompletedResult({
          inspeccionId: 'offline-queued',
          estadoResultante: estadoCalculado,
          fallasCount: fallasDetectadas.length,
        });
      } else {
        // Error de backend / RLS / permisos: mostrar error real y no fingir éxito
        toast.error(res.error || 'Error al procesar la inspección en el servidor');
      }
    } catch (err: any) {
      console.error('Submit inspection failed:', err);
      const isOffline =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('network');

      if (isOffline) {
        await enqueueInspeccion(payload);
        toast.info('Sin conexión: la inspección se guardó en este dispositivo y se sincronizará automáticamente al reconectar.');
        setCompletedResult({
          inspeccionId: 'offline-queued',
          estadoResultante: estadoCalculado,
          fallasCount: fallasDetectadas.length,
        });
      } else {
        toast.error(err?.message || 'Error al guardar la inspección');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 w-full">
        <div className="h-64 bg-slate-900/60 rounded-2xl animate-pulse border border-slate-800" />
      </div>
    );
  }

  if (!equipo || !template) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-xl font-bold text-white">No se pudo cargar el checklist</h2>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-slate-200 font-semibold text-sm rounded-xl"
        >
          <ArrowLeft size={16} /> Volver
        </Link>
      </div>
    );
  }

  // PANTALLA DE ÉXITO AL FINALIZAR
  if (completedResult) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 sm:py-12 w-full text-center space-y-6">
        <div
          className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-2xl ${
            completedResult.estadoResultante === 'operativo'
              ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/40'
              : completedResult.estadoResultante === 'observado'
              ? 'bg-amber-500/20 text-amber-400 border-2 border-amber-500/40'
              : 'bg-rose-500/20 text-rose-400 border-2 border-rose-500/40 animate-pulse'
          }`}
        >
          {completedResult.estadoResultante === 'operativo' ? (
            <CheckCircle2 size={40} />
          ) : completedResult.estadoResultante === 'observado' ? (
            <AlertTriangle size={40} />
          ) : (
            <ShieldAlert size={40} />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            Inspección TPM Finalizada
          </h1>
          <p className="text-sm text-slate-300">
            Autoelevador Interno #{equipo.interno} ({equipo.marca} {equipo.modelo})
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-left space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Estado Resultante del Equipo
            </span>
            <StatusBadge estado={completedResult.estadoResultante} size="md" />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <span className="text-slate-500 font-medium">Horómetro Registrado</span>
              <p className="font-bold text-white text-sm mt-0.5">{horometroParam || equipo.horometro_actual} hs</p>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <span className="text-slate-500 font-medium">Fallas Reportadas</span>
              <p className={`font-bold text-sm mt-0.5 ${completedResult.fallasCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {completedResult.fallasCount} defecto(s)
              </p>
            </div>
          </div>

          {completedResult.estadoResultante === 'fuera_de_servicio' && (
            <div className="bg-rose-500/15 border border-rose-500/30 rounded-xl p-3 text-rose-300 text-xs flex items-start gap-2">
              <ShieldAlert size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <span>
                <strong>Aviso de Seguridad:</strong> Se detectaron fallas críticas. No opere el equipo y notifique de inmediato al supervisor de turno.
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href="/"
            className="flex-1 py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <span>Escanear Otro Equipo</span>
          </Link>
          <Link
            href="/dashboard"
            className="flex-1 py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 border border-slate-700"
          >
            <span>Ver en Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 sm:py-6 w-full space-y-4 pb-28">
      {/* Top Header info */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => router.push(`/equipo/${equipo.qr_codigo}`)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft size={14} /> Ficha Interno #{equipo.interno}
        </button>

        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-slate-400">
            <Gauge size={13} className="text-amber-400" />
            <strong className="text-slate-200">{horometroParam || equipo.horometro_actual} hs</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1 text-slate-400 truncate max-w-[120px] sm:max-w-none">
            <User size={13} className="text-slate-500" />
            {operadorNombre}
          </span>
        </div>
      </div>

      {/* Progress & Live State Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Progreso del Checklist
            </span>
            <div className="text-base font-extrabold text-white">
              {answeredCount} de {totalItems} ítems respondidos
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Estado Resultante
            </span>
            <StatusBadge estado={estadoCalculado} size="sm" />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-300 ${
              estadoCalculado === 'fuera_de_servicio'
                ? 'bg-rose-500'
                : estadoCalculado === 'observado'
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Section navigation tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {sections.map((sec, idx) => {
          const secItems = sec.items;
          const secAnswered = secItems.filter(
            (i) =>
              responses[i.id]?.valor_bool !== null ||
              responses[i.id]?.valor_numero !== null ||
              (responses[i.id]?.valor_texto && responses[i.id]?.valor_texto!.length > 0)
          ).length;
          const hasFailure = secItems.some((i) => responses[i.id]?.es_falla);
          const isCurrent = idx === activeSectionIndex;

          return (
            <button
              key={sec.name}
              type="button"
              onClick={() => setActiveSectionIndex(idx)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 cursor-pointer border shrink-0 ${
                isCurrent
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : hasFailure
                  ? 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                  : secAnswered === secItems.length
                  ? 'bg-slate-900 text-emerald-400 border-emerald-900/60'
                  : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>{sec.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isCurrent
                    ? 'bg-slate-950 text-amber-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {secAnswered}/{secItems.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Current Section Items List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            {currentSection.name}
          </h2>
          <span className="text-xs text-slate-500">
            Sección {activeSectionIndex + 1} de {sections.length}
          </span>
        </div>

        {currentSection.items.map((item) => {
          const resp = responses[item.id];
          const isOk = resp?.valor_bool === true;
          const isFalla = resp?.es_falla === true;

          return (
            <div
              key={item.id}
              className={`bg-slate-900 border rounded-2xl p-4 sm:p-5 transition shadow-sm ${
                isFalla
                  ? 'border-rose-500/60 bg-rose-950/10'
                  : isOk
                  ? 'border-emerald-500/40 bg-slate-900'
                  : 'border-slate-800'
              }`}
            >
              {/* Item Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <span className="text-[11px] font-mono text-slate-500 font-semibold block mb-0.5">
                    Ítem #{item.orden}
                  </span>
                  <h3 className="font-bold text-sm sm:text-base text-white leading-snug">
                    {item.etiqueta}
                  </h3>
                </div>

                {isFalla && resp.falla && (
                  <GravedadBadge gravedad={resp.falla.gravedad} size="sm" />
                )}
              </div>

              {/* Input for Boolean Items */}
              {item.tipo_dato === 'booleano' && (
                <div>
                  {!isFalla ? (
                    <div className="grid grid-cols-2 gap-3">
                      {/* OK Button */}
                      <button
                        type="button"
                        onClick={() => handleMarkOk(item.id)}
                        className={`py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer border ${
                          isOk
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-950'
                            : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
                        }`}
                      >
                        <Check size={18} className={isOk ? 'stroke-[3]' : ''} />
                        <span>OK / CONFORME</span>
                      </button>

                      {/* FALLA Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenFallaModal(item)}
                        className="py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer border bg-slate-800/80 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-700/60 text-slate-300 border-slate-700/80"
                      >
                        <AlertTriangle size={18} />
                        <span>FALLA</span>
                      </button>
                    </div>
                  ) : (
                    /* Falla Details Card */
                    <div className="bg-rose-950/30 border border-rose-800/50 rounded-xl p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-rose-200 font-medium">
                          <strong>Descripción:</strong> {resp.falla?.descripcion}
                        </p>
                      </div>

                      {resp.falla?.foto_base64 && (
                        <div className="relative rounded-lg overflow-hidden border border-rose-800/40 w-24 h-16 bg-black">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resp.falla.foto_base64}
                            alt="Foto defecto"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <div className="flex gap-2 pt-1 border-t border-rose-900/40">
                        <button
                          type="button"
                          onClick={() => handleOpenFallaModal(item)}
                          className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg bg-slate-900 border border-slate-800"
                        >
                          <Edit2 size={12} /> Modificar Falla
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMarkOk(item.id)}
                          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg bg-slate-900 border border-slate-800 ml-auto"
                        >
                          <Check size={12} /> Marcar como OK
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Input for Number Items */}
              {item.tipo_dato === 'numero' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Ingrese valor numérico (%)"
                      value={resp?.valor_numero !== null ? resp?.valor_numero : ''}
                      onChange={(e) =>
                        handleNumberChange(item.id, parseFloat(e.target.value) || 0)
                      }
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-400">%</span>
                  </div>
                  {/* Quick percentage buttons */}
                  <div className="flex gap-2">
                    {[25, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleNumberChange(item.id, pct)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          resp?.valor_numero === pct
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input for Text Items */}
              {item.tipo_dato === 'texto' && (
                <div>
                  <textarea
                    rows={2}
                    placeholder="Observaciones o notas adicionales del turno..."
                    value={resp?.valor_texto || ''}
                    onChange={(e) => handleTextChange(item.id, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation and Submission bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 sm:p-4 z-40">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          {/* Previous Section */}
          <button
            type="button"
            disabled={activeSectionIndex === 0}
            onClick={() => setActiveSectionIndex((prev) => Math.max(0, prev - 1))}
            className="py-3 px-4 rounded-xl border border-slate-700 text-slate-300 font-bold text-xs sm:text-sm flex items-center gap-1 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-800 transition cursor-pointer"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          {/* Next Section or Submit */}
          {activeSectionIndex < sections.length - 1 ? (
            <button
              type="button"
              onClick={() =>
                setActiveSectionIndex((prev) => Math.min(sections.length - 1, prev + 1))
              }
              className="py-3 px-6 bg-slate-800 hover:bg-slate-750 text-amber-400 font-black text-xs sm:text-sm rounded-xl transition flex items-center gap-1.5 border border-amber-500/30 cursor-pointer"
            >
              <span>Siguiente Sección</span>
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmitInspection}
              className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl transition flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Send size={16} />
              <span>{isSubmitting ? 'Guardando...' : 'Finalizar Inspección'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal de Falla */}
      {modalItem && (
        <FallaModal
          isOpen={Boolean(modalItem)}
          itemEtiqueta={modalItem.etiqueta}
          initialGravedad={responses[modalItem.id]?.falla?.gravedad || 'media'}
          initialDescripcion={responses[modalItem.id]?.falla?.descripcion || ''}
          initialFoto={responses[modalItem.id]?.falla?.foto_base64 || ''}
          onSave={handleSaveFalla}
          onCancel={() => setModalItem(null)}
        />
      )}
    </div>
  );
}
