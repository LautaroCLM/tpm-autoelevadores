'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchEquipos } from '../lib/api/tpm';
import { getCurrentSessionAndProfile, signInOperatorWithQR, signOutUser } from '../lib/api/auth';
import { Equipo, Perfil } from '../lib/types/tpm';
import { StatusBadge } from '../components/StatusBadge';
import { MantenimientoBadge } from '../components/MantenimientoBadge';
import { QRScannerModal } from '../components/QRScannerModal';
import { EquipoQRModal } from '../components/EquipoQRModal';
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
} from 'lucide-react';
import { toast } from 'sonner';

export default function HomePage() {
  const router = useRouter();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedQrEquipo, setSelectedQrEquipo] = useState<Equipo | null>(null);

  // Estado del usuario activo
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eqs, authInfo] = await Promise.all([
        fetchEquipos(),
        getCurrentSessionAndProfile(),
      ]);
      setEquipos(eqs);
      setPerfil(authInfo.perfil);
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

  const handleScanResult = (code: string) => {
    setScannerOpen(false);
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

      {/* Equipment Fleet List */}
      <div className="space-y-3">
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

      {/* QR Camera Modal */}
      <QRScannerModal
        isOpen={scannerOpen}
        mode="equipo"
        onClose={() => setScannerOpen(false)}
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

