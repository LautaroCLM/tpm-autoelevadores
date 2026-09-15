'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchEquipos } from '../lib/api/tpm';
import {
  getCurrentSessionAndProfile,
  signInOperatorWithQR,
  fetchOperadores,
  signOutUser,
} from '../lib/api/auth';
import { Equipo, Perfil } from '../lib/types/tpm';
import { StatusBadge } from '../components/StatusBadge';
import { MantenimientoBadge } from '../components/MantenimientoBadge';
import { QRScannerModal } from '../components/QRScannerModal';
import { EquipoQRModal } from '../components/EquipoQRModal';
import { ComoUsarSection } from '../components/ComoUsarSection';
import { extractEquipoCode } from '../lib/utils/auth-helpers';
import {
  QrCode,
  Search,
  ArrowRight,
  Gauge,
  Fuel,
  Shield,
  UserCheck,
  Camera,
  RefreshCw,
  LogOut,
  Sparkles,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

export default function HomePage() {
  const router = useRouter();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [operadores, setOperadores] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [operatorScannerOpen, setOperatorScannerOpen] = useState(false);
  const [selectedQrEquipo, setSelectedQrEquipo] = useState<Equipo | null>(null);
  const [loggingInLegajo, setLoggingInLegajo] = useState<string | null>(null);

  // Estado del usuario activo
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eqs, authInfo, ops] = await Promise.all([
        fetchEquipos(),
        getCurrentSessionAndProfile(),
        fetchOperadores(),
      ]);
      setEquipos(eqs);
      setPerfil(authInfo.perfil);
      setOperadores(ops);
    } catch (err) {
      console.error('Error loading initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleAuthChange = () => loadData();
    window.addEventListener('tpm_auth_changed', handleAuthChange);
    return () => window.removeEventListener('tpm_auth_changed', handleAuthChange);
  }, []);

  // Manejar selección de autoelevador
  const handleSelectEquipo = (rawInput: string) => {
    const cleanCode = extractEquipoCode(rawInput);
    if (!cleanCode) {
      toast.warning('Ingrese o escanee un código de autoelevador válido');
      return;
    }

    const match = equipos.find(
      (eq) => eq.qr_codigo.toUpperCase() === cleanCode || eq.interno.toUpperCase() === cleanCode
    );

    const targetCode = match ? match.qr_codigo : cleanCode;
    router.push(`/equipo/${encodeURIComponent(targetCode)}`);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleSelectEquipo(manualInput);
  };

  const handleSignOut = async () => {
    await signOutUser();
    setPerfil(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tpm_auth_changed'));
    }
    toast.info('Sesión cerrada correctamente');
  };

  // Login rápido de operador por selección directa
  const handleOperatorQuickLogin = async (op: Perfil) => {
    if (!op.legajo) {
      toast.warning(`El operador ${op.nombre} no tiene número de legajo configurado`);
      return;
    }

    setLoggingInLegajo(op.legajo);
    try {
      const res = await signInOperatorWithQR(`TPM:OP:${op.legajo}`);
      if (res.success && res.perfil) {
        setPerfil(res.perfil);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tpm_auth_changed'));
        }
        toast.success(`Operador Activo: ${res.perfil.nombre}`);

        // Transición automática suave al paso de escanear o seleccionar autoelevador
        setTimeout(() => {
          const fleetSection = document.getElementById('seccion-autoelevadores');
          if (fleetSection) {
            fleetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      } else {
        toast.error(res.error || 'No se pudo autenticar al operador');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al iniciar sesión de operador');
    } finally {
      setLoggingInLegajo(null);
    }
  };

  const handleScanResult = async (code: string) => {
    setScannerOpen(false);
    setOperatorScannerOpen(false);

    const clean = code.trim();
    // Si el QR escaneado es una credencial de operador física (ej: "TPM:OP:4029" o similar)
    if (
      clean.toUpperCase().startsWith('TPM:OP:') ||
      clean.toUpperCase().startsWith('TPM-OP:') ||
      clean.startsWith('{')
    ) {
      toast.loading('Autenticando credencial de operador...');
      try {
        const res = await signInOperatorWithQR(clean);
        toast.dismiss();
        if (res.success && res.perfil) {
          setPerfil(res.perfil);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tpm_auth_changed'));
          }
          toast.success(`Operador Activo: ${res.perfil.nombre}`);

          setTimeout(() => {
            const fleetSection = document.getElementById('seccion-autoelevadores');
            if (fleetSection) {
              fleetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 150);
        } else {
          toast.error(res.error || 'Credencial de operador no válida');
        }
      } catch (err: any) {
        toast.dismiss();
        toast.error(err?.message || 'Error al procesar credencial de operador');
      }
      return;
    }

    // De lo contrario, se trata de un código de máquina / autoelevador
    handleSelectEquipo(code);
  };

  // Stats calculation
  const totalEquipos = equipos.length;
  const operativos = equipos.filter((e) => e.estado === 'operativo').length;
  const observados = equipos.filter((e) => e.estado === 'observado').length;
  const fueraServicio = equipos.filter((e) => e.estado === 'fuera_de_servicio').length;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 w-full space-y-5 sm:space-y-6">
      {/* Industrial Plant Banner */}
      <div className="bg-[#111724] border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-bold uppercase tracking-wider border border-amber-500/30">
              <Shield size={12} />
              <span>TPM Nivel 1 • Operación y Mantenimiento</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white">
              Inspección Diaria de Autoelevadores
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Escaneá el código QR pegado en el chasis del equipo para consultar su ficha técnica e iniciar el checklist de tu turno.
            </p>
          </div>

          {/* Plant Telemetry Counters */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/80">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 sm:p-3 text-center min-w-[80px]">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Flota</span>
              <span className="text-lg sm:text-xl font-black text-white font-mono font-tabular">{totalEquipos}</span>
            </div>
            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2.5 sm:p-3 text-center min-w-[80px]">
              <span className="text-[10px] font-bold uppercase text-emerald-400 block">Operat.</span>
              <span className="text-lg sm:text-xl font-black text-emerald-300 font-mono font-tabular">{operativos}</span>
            </div>
            <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-2.5 sm:p-3 text-center min-w-[80px]">
              <span className="text-[10px] font-bold uppercase text-rose-400 block">Parados</span>
              <span className="text-lg sm:text-xl font-black text-rose-300 font-mono font-tabular">{fueraServicio}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Session Card */}
      {perfil ? (
        <div className="bg-emerald-950/25 border border-emerald-500/35 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shrink-0 shadow-xs">
              <UserCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Operador en Turno Activo
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-sm sm:text-base font-black text-white">
                {perfil.nombre} {perfil.legajo ? <span className="font-mono text-xs text-slate-300 font-bold ml-1">(Legajo #{perfil.legajo})</span> : ''}
              </p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900/80 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/50 transition flex items-center gap-1.5 cursor-pointer btn-tactile shrink-0"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      ) : (
        <div className="bg-[#111724] border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold shrink-0">
              <UserCheck size={19} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Identificación de Operador
              </span>
              <p className="text-xs sm:text-sm text-slate-200">
                Iniciá sesión con tu legajo o escaneá directamente el autoelevador asignado.
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 shadow-xs cursor-pointer btn-tactile shrink-0"
          >
            <UserCheck size={14} />
            <span>Ingresar</span>
          </Link>
        </div>
      )}

      {/* Main Scanner & Search Box */}
      <div className="bg-[#111724] border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
              <QrCode size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Escanear Código QR
              </h2>
              <p className="text-xs text-slate-400">
                Alineá el código con la cámara o ingresá el número de interno
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="min-h-[48px] py-3 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98 cursor-pointer btn-tactile"
          >
            <Camera size={18} />
            <span>Abrir Cámara Escáner</span>
          </button>
        </div>

        {/* Manual Input Form */}
        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row gap-2 pt-1">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Ingresar número de interno (ej: 01, 02) o código QR (ej: AE-01)..."
              className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700/80 focus:border-amber-500 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
            />
          </div>
          <button
            type="submit"
            className="py-3 px-5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer btn-tactile"
          >
            <span>Buscar Ficha</span>
            <ArrowRight size={14} />
          </button>
        </form>
      </div>

      {/* Botones de Acceso Rápido por Operador Real */}
      <div className="bg-[#111724] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-amber-400" />
              <h2 className="text-sm sm:text-base font-black text-white">
                Operadores de Planta — Acceso Rápido
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Tocá tu nombre para identificarte en el turno sin credencial física:
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOperatorScannerOpen(true)}
            className="self-start sm:self-auto text-xs font-bold text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/60 bg-amber-500/10 px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer btn-tactile"
          >
            <Camera size={13} />
            <span>Escanear Credencial Física</span>
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-slate-950/60 rounded-xl animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : operadores.length === 0 ? (
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-center">
            <p className="text-xs text-slate-400">No se encontraron operadores registrados en la base de datos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            {operadores.map((op) => {
              const isActive = perfil?.id === op.id;
              const isLoggingIn = loggingInLegajo === op.legajo;

              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => handleOperatorQuickLogin(op)}
                  disabled={isLoggingIn}
                  title={`Identificarse como ${op.nombre} (Legajo #${op.legajo})`}
                  className={`p-3 rounded-xl border text-left transition flex items-center justify-between gap-2.5 cursor-pointer btn-tactile ${
                    isActive
                      ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/40 shadow-xs'
                      : 'bg-slate-950/80 hover:bg-slate-900 border-slate-800 hover:border-amber-500/50'
                  } ${isLoggingIn ? 'opacity-80' : ''}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950 shadow-xs'
                          : 'bg-slate-850 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {isLoggingIn ? (
                        <RefreshCw size={14} className="animate-spin text-amber-400" />
                      ) : (
                        op.nombre
                          .split(' ')
                          .filter(Boolean)
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()
                      )}
                    </div>
                    <div className="truncate">
                      <p className="text-xs sm:text-sm font-bold text-white truncate">
                        {op.nombre}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400">
                        Legajo {op.legajo ? `#${op.legajo}` : 'S/N'}
                      </p>
                    </div>
                  </div>

                  {isActive ? (
                    <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                      <CheckCircle2 size={10} />
                      <span>Activo</span>
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-bold text-slate-500 group-hover:text-amber-400">
                      Entrar →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Equipment Fleet List */}
      <div id="seccion-autoelevadores" className="space-y-3 scroll-mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span>Autoelevadores en Planta</span>
            <span className="text-slate-500 font-mono">({equipos.length})</span>
          </h2>
          <span className="text-xs text-slate-500 hidden sm:inline">Seleccioná un equipo para acceder al checklist</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 bg-[#111724]/60 rounded-2xl animate-pulse border border-slate-800/80" />
            ))}
          </div>
        ) : equipos.length === 0 ? (
          <div className="bg-[#111724] border border-slate-800 rounded-2xl p-10 text-center text-slate-400 space-y-2">
            <p className="font-bold text-white text-base">No se encontraron equipos registrados</p>
            <p className="text-xs text-slate-500">Comuníquese con el supervisor de mantenimiento para registrar autoelevadores.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {equipos.map((equipo) => (
              <div
                key={equipo.id}
                className="bg-[#111724] border border-slate-800/90 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition shadow-xs flex flex-col justify-between space-y-3"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-amber-400 font-black text-xl font-mono shadow-inner">
                      {equipo.interno}
                    </div>
                    <div>
                      <div className="font-mono text-xs font-bold text-amber-400">
                        QR: {equipo.qr_codigo}
                      </div>
                      <h3 className="font-bold text-base text-white">
                        Interno #{equipo.interno} — {equipo.marca}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium">{equipo.modelo}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <StatusBadge estado={equipo.estado} size="sm" />
                    <MantenimientoBadge
                      horometroActual={equipo.horometro_actual}
                      proximoMantenimiento={equipo.horometro_proximo_mantenimiento}
                      size="xs"
                    />
                  </div>
                </div>

                {/* Telemetry Strip */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/70">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Gauge size={13} className="text-amber-400" />
                    <span className="text-slate-400 font-medium">Horómetro:</span>
                    <strong className="font-mono font-tabular text-white ml-auto">{equipo.horometro_actual.toFixed(1)} hs</strong>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Fuel size={13} className="text-slate-400" />
                    <span className="text-slate-400 font-medium">Combustible:</span>
                    <strong className="text-white ml-auto">{equipo.combustible || 'N/A'}</strong>
                  </div>
                </div>

                {/* Action Buttons (Separated, non-conflicting touch targets) */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/70">
                  <button
                    type="button"
                    onClick={() => setSelectedQrEquipo(equipo)}
                    className="min-h-[40px] px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-slate-800 hover:border-slate-700 cursor-pointer btn-tactile"
                    title={`Ver código QR de Interno #${equipo.interno}`}
                  >
                    <QrCode size={14} className="text-amber-400" />
                    <span>Ver QR</span>
                  </button>

                  <Link
                    href={`/equipo/${encodeURIComponent(equipo.qr_codigo)}`}
                    className="min-h-[40px] flex-1 py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer btn-tactile"
                  >
                    <span>{perfil ? 'Iniciar Checklist TPM' : 'Ver Ficha de Equipo'}</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sección Informativa y Tutorial Paso a Paso */}
      <ComoUsarSection />

      {/* QR Camera Modal Principal (Autoelevadores o Credenciales) */}
      <QRScannerModal
        isOpen={scannerOpen}
        mode="equipo"
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleScanResult}
      />

      {/* QR Camera Modal Dedicado a Credenciales de Operador */}
      <QRScannerModal
        isOpen={operatorScannerOpen}
        mode="operador"
        onClose={() => setOperatorScannerOpen(false)}
        onScanSuccess={handleScanResult}
      />

      {/* Modal para Visualizar y Descargar QR Grande */}
      <EquipoQRModal
        isOpen={Boolean(selectedQrEquipo)}
        onClose={() => setSelectedQrEquipo(null)}
        equipo={selectedQrEquipo}
      />
    </div>
  );
}

