'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchEquipos,
  fetchInspecciones,
  fetchFallas,
  updateFallaEstado,
  createEquipo,
  updateEquipo,
  deleteEquipo,
} from '../../lib/api/tpm';
import { getCurrentSessionAndProfile, signOutUser } from '../../lib/api/auth';
import { Equipo, Inspeccion, Falla, Perfil } from '../../lib/types/tpm';
import { StatusBadge } from '../../components/StatusBadge';
import { GravedadBadge } from '../../components/GravedadBadge';
import { MantenimientoBadge } from '../../components/MantenimientoBadge';
import { EquipoQRModal } from '../../components/EquipoQRModal';
import { formatDate } from '../../lib/utils';
import { calcularEstadoMantenimiento } from '../../lib/utils/mantenimiento';
import {
  LayoutDashboard,
  Truck,
  ClipboardList,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Gauge,
  User,
  ExternalLink,
  Filter,
  CheckCircle,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  QrCode,
  Printer,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  LogOut,
  X,
  Fuel,
  Calendar,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

export default function SupervisorDashboardPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [fallas, setFallas] = useState<Falla[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'flota' | 'historial' | 'fallas' | 'operadores'>('flota');
  const [fallaFilter, setFallaFilter] = useState<string>('todas');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Modales de Gestión de Equipos
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editEquipo, setEditEquipo] = useState<Equipo | null>(null);
  const [deleteConfirmEquipo, setDeleteConfirmEquipo] = useState<Equipo | null>(null);
  const [printQrEquipo, setPrintQrEquipo] = useState<Equipo | null>(null);

  // Formulario nuevo equipo
  const [formInterno, setFormInterno] = useState('');
  const [formMarca, setFormMarca] = useState('');
  const [formModelo, setFormModelo] = useState('');
  const [formCombustible, setFormCombustible] = useState('GLP');
  const [formQR, setFormQR] = useState('');
  const [formHorometro, setFormHorometro] = useState('0');
  const [formProximoService, setFormProximoService] = useState('250');
  const [formEstado, setFormEstado] = useState<'operativo' | 'observado' | 'fuera_de_servicio'>('operativo');
  const [submittingForm, setSubmittingForm] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const authInfo = await getCurrentSessionAndProfile();
      if (!authInfo.user) {
        router.replace('/login?redirect=/dashboard');
        return;
      }

      if (authInfo.perfil?.rol !== 'supervisor' && authInfo.perfil?.rol !== 'mantenimiento') {
        toast.error('Acceso denegado: esta sección es exclusiva para supervisores y mantenimiento');
        router.replace('/');
        return;
      }

      setPerfil(authInfo.perfil);

      const [eqs, insps, fls] = await Promise.all([
        fetchEquipos(),
        fetchInspecciones(),
        fetchFallas(),
      ]);

      setEquipos(eqs);
      setInspecciones(insps);
      setFallas(fls);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Stats calculation
  const totalEquipos = equipos.length;
  const operativos = equipos.filter((e) => e.estado === 'operativo').length;
  const observados = equipos.filter((e) => e.estado === 'observado').length;
  const fueraServicio = equipos.filter((e) => e.estado === 'fuera_de_servicio').length;
  const fallasPendientes = fallas.filter(
    (f) => f.estado_reparacion !== 'cerrado' && f.estado_reparacion !== 'reparado'
  ).length;

  // Estadísticas de mantenimiento preventivo por horómetro
  const mantenimientoStats = equipos.map((e) =>
    calcularEstadoMantenimiento(e.horometro_actual, e.horometro_proximo_mantenimiento)
  );
  const mantenimientoVencidos = mantenimientoStats.filter((m) => m.nivel === 'vencido').length;
  const mantenimientoProximos = mantenimientoStats.filter((m) => m.nivel === 'proximo').length;
  const mantenimientoAlDia = mantenimientoStats.filter((m) => m.nivel === 'al_dia').length;

  const handleUpdateFallaStatus = async (
    fallaId: string,
    nuevoEstado: Falla['estado_reparacion']
  ) => {
    try {
      const success = await updateFallaEstado(fallaId, nuevoEstado);
      if (success) {
        toast.success(`Estado de falla actualizado a "${nuevoEstado}"`);
        setFallas((prev) =>
          prev.map((f) =>
            f.id === fallaId ? { ...f, estado_reparacion: nuevoEstado } : f
          )
        );
      }
    } catch {
      toast.error('Error al actualizar estado');
    }
  };

  const handleCreateEquipoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formInterno.trim()) {
      toast.error('Ingrese el número de interno');
      return;
    }

    const cleanQR = formQR.trim() ? formQR.trim().toUpperCase() : `AE-${formInterno.trim().padStart(2, '0')}`;

    setSubmittingForm(true);
    try {
      const res = await createEquipo({
        interno: formInterno.trim(),
        marca: formMarca.trim() || 'Toyota',
        modelo: formModelo.trim() || '8FG25',
        combustible: formCombustible,
        qr_codigo: cleanQR,
        horometro_actual: parseFloat(formHorometro) || 0,
        horometro_proximo_mantenimiento: parseFloat(formProximoService) || null,
        estado: formEstado,
      });

      if (res.success && res.equipo) {
        toast.success(`¡Autoelevador Interno #${res.equipo.interno} registrado!`);
        setEquipos((prev) => [...prev, res.equipo!]);
        setCreateModalOpen(false);
        // Reset form
        setFormInterno('');
        setFormMarca('');
        setFormModelo('');
        setFormQR('');
        setFormHorometro('0');
      } else {
        toast.error(res.error || 'Error al registrar equipo');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleEditEquipoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEquipo) return;

    setSubmittingForm(true);
    try {
      const res = await updateEquipo(editEquipo.id, {
        interno: editEquipo.interno,
        marca: editEquipo.marca,
        modelo: editEquipo.modelo,
        combustible: editEquipo.combustible,
        qr_codigo: editEquipo.qr_codigo,
        horometro_actual: editEquipo.horometro_actual,
        horometro_proximo_mantenimiento: editEquipo.horometro_proximo_mantenimiento,
        estado: editEquipo.estado,
      });

      if (res.success) {
        toast.success(`Autoelevador #${editEquipo.interno} actualizado`);
        setEquipos((prev) =>
          prev.map((eq) => (eq.id === editEquipo.id ? { ...editEquipo } : eq))
        );
        setEditEquipo(null);
      } else {
        toast.error(res.error || 'Error al actualizar equipo');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar');
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleDeleteEquipo = async () => {
    if (!deleteConfirmEquipo) return;

    setSubmittingForm(true);
    try {
      const res = await deleteEquipo(deleteConfirmEquipo.id);
      if (res.success) {
        toast.success(`Autoelevador #${deleteConfirmEquipo.interno} eliminado del sistema`);
        setEquipos((prev) => prev.filter((eq) => eq.id !== deleteConfirmEquipo.id));
        setDeleteConfirmEquipo(null);
      } else {
        toast.error(res.error || 'Error al eliminar');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al eliminar');
    } finally {
      setSubmittingForm(false);
    }
  };

  const filteredFallas = fallas.filter((f) => {
    if (fallaFilter === 'todas') return true;
    if (fallaFilter === 'activas') return f.estado_reparacion !== 'cerrado' && f.estado_reparacion !== 'reparado';
    return f.estado_reparacion === fallaFilter;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 w-full space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold uppercase tracking-wider mb-2 border border-amber-500/30">
            <ShieldCheck size={13} />
            Panel Supervisor de Mantenimiento
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            Monitoreo y Gestión de Planta
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {perfil ? `Sesión activa: ${perfil.nombre} (${perfil.rol})` : 'Cargando sesión...'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateModalOpen(true)}
            className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            <span>Agregar Equipo</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Truck size={13} /> Total Flota
          </span>
          <div className="text-2xl font-black text-white mt-1.5">{totalEquipos}</div>
          <span className="text-[11px] text-slate-500">Unidades en planta</span>
        </div>

        <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 size={13} /> Operativos
          </span>
          <div className="text-2xl font-black text-emerald-400 mt-1.5">{operativos}</div>
          <span className="text-[11px] text-slate-500">Listos para operar</span>
        </div>

        <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <AlertTriangle size={13} /> Observados
          </span>
          <div className="text-2xl font-black text-amber-400 mt-1.5">{observados}</div>
          <span className="text-[11px] text-slate-500">Con fallas leves/medias</span>
        </div>

        <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
            <ShieldAlert size={13} /> Fuera Servicio
          </span>
          <div className="text-2xl font-black text-rose-400 mt-1.5">{fueraServicio}</div>
          <span className="text-[11px] text-slate-500">Falla crítica activa</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
            <AlertOctagon size={13} /> Fallas Activas
          </span>
          <div className="text-2xl font-black text-orange-400 mt-1.5">{fallasPendientes}</div>
          <span className="text-[11px] text-slate-500">En cola de reparación</span>
        </div>

        <div className={`bg-slate-900 border rounded-2xl p-4 shadow-sm ${
          mantenimientoVencidos > 0
            ? 'border-rose-500/40 bg-rose-500/5'
            : mantenimientoProximos > 0
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-slate-800'
        }`}>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Wrench size={13} /> Mantenimiento
          </span>
          <div className="flex items-baseline gap-1.5 mt-1.5">
            <span className={`text-2xl font-black ${mantenimientoVencidos > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {mantenimientoVencidos}
            </span>
            <span className="text-[11px] text-slate-400 font-semibold">venc.</span>
            <span className="text-slate-600">/</span>
            <span className={`text-xl font-bold ${mantenimientoProximos > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
              {mantenimientoProximos}
            </span>
            <span className="text-[11px] text-slate-400 font-semibold">próx.</span>
          </div>
          <span className="text-[11px] text-slate-500 block mt-0.5">
            {mantenimientoAlDia} al día de {totalEquipos}
          </span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 gap-2 sm:gap-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('flota')}
          className={`pb-3 px-2 font-bold text-xs sm:text-sm transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'flota'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Truck size={16} />
          <span>Flota y Equipos ({equipos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('fallas')}
          className={`pb-3 px-2 font-bold text-xs sm:text-sm transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'fallas'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertOctagon size={16} />
          <span>Gestión de Fallas ({fallas.length})</span>
          {fallasPendientes > 0 && (
            <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold">
              {fallasPendientes}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('historial')}
          className={`pb-3 px-2 font-bold text-xs sm:text-sm transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'historial'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardList size={16} />
          <span>Historial TPM ({inspecciones.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('operadores')}
          className={`pb-3 px-2 font-bold text-xs sm:text-sm transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'operadores'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <QrCode size={16} />
          <span>Credenciales Operadores</span>
        </button>
      </div>

      {/* TAB 1: FLOTA Y GESTIÓN DE EQUIPOS */}
      {activeTab === 'flota' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400">
              Listado de Autoelevadores en Planta
            </h2>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
            >
              <Plus size={14} /> Agregar Nuevo
            </button>
          </div>

          {equipos.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center space-y-3">
              <Truck size={40} className="text-slate-600 mx-auto" />
              <p className="font-bold text-white text-base">No hay autoelevadores registrados</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Registrá el primer equipo de la planta con su número de interno y código QR.
              </p>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer"
              >
                + Registrar Primer Autoelevador
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {equipos.map((eq) => (
                <div
                  key={eq.id}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-black text-xl shadow-inner">
                        {eq.interno}
                      </div>
                      <div>
                        <div className="text-xs font-mono text-amber-400 font-semibold">
                          QR: {eq.qr_codigo}
                        </div>
                        <h3 className="font-bold text-base text-white">
                          Interno #{eq.interno} — {eq.marca}
                        </h3>
                        <p className="text-xs text-slate-400">{eq.modelo}</p>
                      </div>
                    </div>
                    <StatusBadge estado={eq.estado} size="sm" />
                  </div>

                  <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/60 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 font-medium">Horómetro Actual</span>
                        <p className="font-bold text-white text-sm mt-0.5">{eq.horometro_actual.toFixed(1)} hs</p>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Combustible</span>
                        <p className="font-bold text-white text-sm mt-0.5">{eq.combustible || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                      <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                        <Wrench size={12} className="text-slate-500" />
                        <span>Service Preventivo:</span>
                      </span>
                      <MantenimientoBadge
                        horometroActual={eq.horometro_actual}
                        proximoMantenimiento={eq.horometro_proximo_mantenimiento}
                        size="xs"
                      />
                    </div>
                  </div>

                  {/* Actions bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrintQrEquipo(eq)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs rounded-lg transition flex items-center gap-1 border border-slate-700 cursor-pointer"
                        title="Ver y Descargar Código QR"
                      >
                        <QrCode size={12} className="text-amber-400" />
                        <span>Ver QR</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditEquipo(eq)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs rounded-lg transition flex items-center gap-1 border border-slate-700 cursor-pointer"
                        title="Editar datos"
                      >
                        <Edit2 size={12} />
                        <span>Editar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirmEquipo(eq)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                        title="Dar de baja equipo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <Link
                      href={`/equipo/${eq.qr_codigo}`}
                      className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                    >
                      <span>Ficha</span>
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: GESTIÓN DE FALLAS */}
      {activeTab === 'fallas' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1 mr-1">
              <Filter size={13} /> Filtrar:
            </span>
            {[
              { id: 'todas', label: 'Todas' },
              { id: 'activas', label: 'Activas' },
              { id: 'pendiente', label: 'Pendientes' },
              { id: 'en_revision', label: 'En Revisión' },
              { id: 'reparando', label: 'Reparando' },
              { id: 'reparado', label: 'Reparadas' },
              { id: 'cerrado', label: 'Cerradas' },
            ].map((fil) => (
              <button
                key={fil.id}
                onClick={() => setFallaFilter(fil.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  fallaFilter === fil.id
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {fil.label}
              </button>
            ))}
          </div>

          {filteredFallas.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-10 text-center text-slate-400">
              <CheckCircle size={36} className="text-emerald-400 mx-auto mb-2 opacity-80" />
              <p className="font-bold text-white text-base">No hay fallas con el filtro seleccionado</p>
              <p className="text-xs text-slate-500 mt-1">Todos los ítems verificados están conformes.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredFallas.map((falla) => {
                const eqMatch = equipos.find((e) => e.id === falla.equipo_id);
                return (
                  <div
                    key={falla.id}
                    className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-2.5">
                        <GravedadBadge gravedad={falla.gravedad} size="sm" />
                        <span className="font-bold text-sm text-white">
                          Autoelevador Interno #{eqMatch?.interno || 'N/A'} ({eqMatch?.marca})
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Clock size={12} />
                        <span>Detectado: {formatDate(falla.created_at)}</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      {falla.foto_url && (
                        <button
                          type="button"
                          onClick={() => setSelectedPhoto(falla.foto_url)}
                          className="w-24 h-20 rounded-2xl overflow-hidden border border-slate-700 relative shrink-0 group cursor-pointer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={falla.foto_url}
                            alt="Foto defecto"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <span className="absolute bottom-1 right-1 bg-slate-900/80 text-[10px] text-white px-1 rounded">
                            Ver
                          </span>
                        </button>
                      )}

                      <div className="flex-1 space-y-1">
                        <p className="text-sm text-slate-200 font-medium leading-relaxed">
                          {falla.descripcion || 'Sin descripción detallada.'}
                        </p>
                      </div>
                    </div>

                    {/* Status Changer */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/60 bg-slate-950/40 -mx-5 -mb-5 p-3 rounded-b-3xl">
                      <span className="text-xs text-slate-400 font-medium">
                        Estado de Reparación:
                      </span>

                      <div className="flex flex-wrap gap-1.5">
                        {(
                          ['pendiente', 'en_revision', 'reparando', 'reparado', 'cerrado'] as Falla['estado_reparacion'][]
                        ).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleUpdateFallaStatus(falla.id, st)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition capitalize cursor-pointer border ${
                              falla.estado_reparacion === st
                                ? st === 'cerrado' || st === 'reparado'
                                  ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                                  : st === 'reparando'
                                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                                  : 'bg-rose-600 text-white border-rose-500'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                            }`}
                          >
                            {st.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTORIAL DE INSPECCIONES */}
      {activeTab === 'historial' && (
        <div className="space-y-3">
          {inspecciones.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-10 text-center text-slate-400">
              <ClipboardList size={36} className="mx-auto mb-2 opacity-60" />
              <p className="font-bold text-white text-base">No hay inspecciones registradas</p>
              <p className="text-xs text-slate-500 mt-1">Las inspecciones completadas por los operadores aparecerán aquí.</p>
            </div>
          ) : (
            inspecciones.map((insp) => {
              const eq = equipos.find((e) => e.id === insp.equipo_id);
              return (
                <div
                  key={insp.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-black">
                      {eq?.interno || '—'}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-2">
                        Interno #{eq?.interno} — {eq?.marca}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <User size={12} className="text-slate-500" />
                        <span>Operador ID: {insp.operador_id.slice(0, 8)}...</span>
                        <span className="text-slate-600">•</span>
                        <Gauge size={12} className="text-slate-500" />
                        <span>{insp.horometro} hs</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                    <span className="text-xs text-slate-400">
                      {formatDate(insp.finalizado_en || insp.iniciado_en)}
                    </span>
                    {insp.estado_resultante && (
                      <StatusBadge estado={insp.estado_resultante} size="sm" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: CREDENCIALES DE OPERADORES (IMPRESIÓN BADGES) */}
      {activeTab === 'operadores' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <QrCode size={18} className="text-amber-400" />
              Credenciales QR de Operadores Registrados
            </h2>
            <p className="text-xs text-slate-400">
              Imprimí estas tarjetas o stickers para que los operadores escaneen su identificación en 2 segundos antes de iniciar el checklist diario.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {[
                {
                  nombre: 'Juan Pérez',
                  legajo: '4029',
                  codigoQR: 'TPM:OP:4029:[REDACTADO_TOKEN_OP_4029]',
                  rol: 'Operador Turno Mañana',
                },
                {
                  nombre: 'Carlos Gómez',
                  legajo: '5118',
                  codigoQR: 'TPM:OP:5118:[REDACTADO_TOKEN_OP_5118]',
                  rol: 'Operador Turno Tarde',
                },
              ].map((op) => (
                <div
                  key={op.legajo}
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      Legajo #{op.legajo}
                    </span>
                    <h3 className="font-bold text-base text-white">{op.nombre}</h3>
                    <p className="text-xs text-slate-400">{op.rol}</p>
                    <div className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800 mt-2">
                      QR: {op.codigoQR}
                    </div>
                  </div>

                  <div className="w-20 h-20 bg-white p-1 rounded-xl flex items-center justify-center shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://qr.local.placeholder/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                        op.codigoQR
                      )}`}
                      alt="QR Credencial"
                      className="w-full h-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTRAR NUEVO EQUIPO */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Truck size={20} className="text-amber-400" />
                Registrar Nuevo Autoelevador
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateEquipoSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    N° Interno *
                  </label>
                  <input
                    type="text"
                    required
                    value={formInterno}
                    onChange={(e) => {
                      setFormInterno(e.target.value);
                      if (!formQR) setFormQR(`AE-${e.target.value.padStart(2, '0')}`);
                    }}
                    placeholder="Ej: 05"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Código QR
                  </label>
                  <input
                    type="text"
                    value={formQR}
                    onChange={(e) => setFormQR(e.target.value)}
                    placeholder="Ej: AE-05"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-amber-400 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={formMarca}
                    onChange={(e) => setFormMarca(e.target.value)}
                    placeholder="Toyota, Hyster, Crown..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={formModelo}
                    onChange={(e) => setFormModelo(e.target.value)}
                    placeholder="8FG25 (2.5 ton)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Combustible
                  </label>
                  <select
                    value={formCombustible}
                    onChange={(e) => setFormCombustible(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="GLP">GLP / Gas</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Electrico">Eléctrico</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Estado Inicial
                  </label>
                  <select
                    value={formEstado}
                    onChange={(e) => setFormEstado(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="operativo">Operativo</option>
                    <option value="observado">Observado</option>
                    <option value="fuera_de_servicio">Fuera de Servicio</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Horómetro Actual
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formHorometro}
                    onChange={(e) => setFormHorometro(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Próximo Service (hs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formProximoService}
                    onChange={(e) => setFormProximoService(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-750 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingForm}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  {submittingForm ? 'Guardando...' : 'Guardar Autoelevador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDITAR EQUIPO */}
      {editEquipo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Edit2 size={18} className="text-amber-400" />
                Editar Autoelevador #{editEquipo.interno}
              </h3>
              <button
                onClick={() => setEditEquipo(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditEquipoSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={editEquipo.marca || ''}
                    onChange={(e) => setEditEquipo({ ...editEquipo, marca: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={editEquipo.modelo || ''}
                    onChange={(e) => setEditEquipo({ ...editEquipo, modelo: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Combustible
                  </label>
                  <select
                    value={editEquipo.combustible || 'GLP'}
                    onChange={(e) => setEditEquipo({ ...editEquipo, combustible: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="GLP">GLP / Gas</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Electrico">Eléctrico</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Estado Operativo
                  </label>
                  <select
                    value={editEquipo.estado}
                    onChange={(e) => setEditEquipo({ ...editEquipo, estado: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold"
                  >
                    <option value="operativo">Operativo</option>
                    <option value="observado">Observado</option>
                    <option value="fuera_de_servicio">Fuera de Servicio</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Horómetro Actual
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editEquipo.horometro_actual}
                    onChange={(e) =>
                      setEditEquipo({ ...editEquipo, horometro_actual: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                    Próximo Service (hs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editEquipo.horometro_proximo_mantenimiento || ''}
                    onChange={(e) =>
                      setEditEquipo({
                        ...editEquipo,
                        horometro_proximo_mantenimiento: parseFloat(e.target.value) || null,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditEquipo(null)}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-750 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingForm}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  {submittingForm ? 'Guardando...' : 'Actualizar Equipo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CONFIRMAR ELIMINACIÓN */}
      {deleteConfirmEquipo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-black text-white">
              ¿Dar de baja Interno #{deleteConfirmEquipo.interno}?
            </h3>
            <p className="text-xs text-slate-400">
              Esta acción eliminará el equipo y su historial asociado en la base de datos.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmEquipo(null)}
                className="flex-1 py-2.5 bg-slate-800 text-slate-300 font-bold text-xs rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteEquipo}
                disabled={submittingForm}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-600/30"
              >
                {submittingForm ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: VER / DESCARGAR / IMPRIMIR QR DE EQUIPO */}
      <EquipoQRModal
        isOpen={Boolean(printQrEquipo)}
        onClose={() => setPrintQrEquipo(null)}
        equipo={printQrEquipo}
      />

      {/* Photo Modal Preview */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto}
              alt="Detalle falla ampliada"
              className="max-h-[80vh] w-auto object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
