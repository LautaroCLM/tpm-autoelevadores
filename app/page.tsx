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

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 w-full space-y-6">
      {/* Welcome & Security Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-750 rounded-3xl p-5 sm:p-7 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider mb-3 border border-amber-500/30">
            <Shield size={12} />
            Mantenimiento Nivel 1 — TPM Operativo
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Inspección Diaria de Autoelevadores
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
            Escaneá el código QR pegado en la máquina para consultar su estado e iniciar el checklist preventivo de tu turno.
          </p>
        </div>
      </div>

      {/* Estado de Sesión del Usuario */}
      {perfil ? (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
              <UserCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Sesión Activa ({perfil.rol})
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-base font-black text-white">
                {perfil.nombre} {perfil.legajo ? `— Legajo #${perfil.legajo}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900/80 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/50 transition flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut size={13} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      ) : (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <UserCheck size={20} />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Sin sesión activa
              </span>
              <p className="text-xs sm:text-sm text-slate-300">
                Podés iniciar sesión ahora o escanear el código QR del autoelevador para ingresar.
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="self-start sm:self-auto px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 shadow-md shadow-amber-500/10 cursor-pointer"
          >
            <UserCheck size={14} />
            <span>Iniciar Sesión</span>
          </Link>
        </div>
      )}

      {/* Main Scanner Box */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-md">
              <QrCode size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Escanear Autoelevador
              </h2>
              <p className="text-xs text-slate-400">
                Alineá el código QR del equipo o ingresá su número de interno
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="py-3 px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 cursor-pointer"
          >
            <Camera size={16} />
            <span>Abrir Cámara Escáner</span>
          </button>
        </div>

        {/* Manual Input Form */}
        <form onSubmit={handleFormSubmit} className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Ingresar código QR, interno o URL (ej: AE-01, 01)..."
              className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            />
          </div>
          <button
            type="submit"
            className="py-3 px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            <span>Abrir Ficha</span>
            <ArrowRight size={14} />
          </button>
        </form>
      </div>

      {/* Lista de Equipos en Planta */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400">
            Equipos Registrados ({equipos.length})
          </h2>
          <span className="text-xs text-slate-500">Seleccioná un autoelevador para ver su ficha</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-slate-900/60 rounded-2xl animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : equipos.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
            No se encontraron equipos registrados en el sistema.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {equipos.map((equipo) => (
              <div
                key={equipo.id}
                onClick={() => handleSelectEquipo(equipo.qr_codigo)}
                className="bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 sm:p-5 transition flex flex-col justify-between group shadow-sm hover:shadow-md cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-black text-lg group-hover:bg-amber-500 group-hover:text-slate-950 group-hover:border-amber-500 transition-colors">
                        {equipo.interno}
                      </div>
                      <div>
                        <div className="font-bold text-base text-white group-hover:text-amber-300 transition-colors">
                          Interno #{equipo.interno}
                        </div>
                        <div className="text-xs text-slate-400">
                          {equipo.marca} {equipo.modelo}
                        </div>
                      </div>
                    </div>
                    <StatusBadge estado={equipo.estado} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Gauge size={14} className="text-slate-500" />
                      <span>{equipo.horometro_actual.toFixed(1)} hs</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Fuel size={14} className="text-slate-500" />
                      <span>{equipo.combustible || 'No esp.'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2.5 border-t border-slate-800/60 text-slate-400 group-hover:text-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-amber-500/90 font-medium">
                      QR: {equipo.qr_codigo}
                    </span>
                    <MantenimientoBadge
                      horometroActual={equipo.horometro_actual}
                      proximoMantenimiento={equipo.horometro_proximo_mantenimiento}
                      size="xs"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedQrEquipo(equipo);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold text-xs rounded-lg transition flex items-center gap-1 border border-slate-700 hover:border-amber-400 shadow-sm active:scale-95 cursor-pointer"
                      title={`Ver código QR de Interno #${equipo.interno}`}
                    >
                      <QrCode size={13} />
                      <span>Ver QR</span>
                    </button>

                    <span className="flex items-center gap-1 font-bold text-amber-400 group-hover:translate-x-0.5 transition-transform">
                      {perfil ? 'Iniciar TPM' : 'Ficha'} <ArrowRight size={13} />
                    </span>
                  </div>
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
