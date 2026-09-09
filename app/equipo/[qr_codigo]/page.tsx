'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchEquipoByQR } from '../../../lib/api/tpm';
import { getCurrentSessionAndProfile } from '../../../lib/api/auth';
import { Equipo, Perfil } from '../../../lib/types/tpm';
import { StatusBadge } from '../../../components/StatusBadge';
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
} from 'lucide-react';
import { toast } from 'sonner';

export default function EquipoFichaPage() {
  const params = useParams();
  const router = useRouter();
  const qrCodigo = Array.isArray(params?.qr_codigo) ? params.qr_codigo[0] : (params?.qr_codigo as string);

  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [loading, setLoading] = useState(true);
  const [horometro, setHorometro] = useState<string>('');
  const [operador, setOperador] = useState<Perfil | null>(null);

  useEffect(() => {
    async function init() {
      if (!qrCodigo) return;
      setLoading(true);
      try {
        const [eqData, authInfo] = await Promise.all([
          fetchEquipoByQR(decodeURIComponent(qrCodigo)),
          getCurrentSessionAndProfile(),
        ]);

        if (eqData) {
          setEquipo(eqData);
          setHorometro(eqData.horometro_actual.toString());
        }

        if (authInfo.perfil) {
          setOperador(authInfo.perfil);
        } else {
          toast.warning('No hay operador identificado. Por favor escaneá tu credencial primero.');
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [qrCodigo]);

  const handleStartInspection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipo) return;

    if (!operador) {
      toast.error('Debes escanear tu credencial de operador antes de iniciar el checklist');
      router.push('/');
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

    const query = new URLSearchParams({
      equipoId: equipo.id,
      horometro: numHorometro.toString(),
      operadorId: operador.id,
      operadorNombre: operador.nombre,
      operadorLegajo: operador.legajo || '',
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
        <h2 className="text-xl font-bold text-white">Equipo no encontrado</h2>
        <p className="text-sm text-slate-400">
          No se encontró ningún autoelevador con el código QR o interno <span className="font-mono text-amber-400">{qrCodigo}</span>.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded-xl transition"
        >
          <ArrowLeft size={16} />
          <span>Volver al inicio</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 w-full space-y-6">
      {/* Back button */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition"
      >
        <ArrowLeft size={14} />
        <span>Volver al listado</span>
      </Link>

      {/* Equipment Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        {/* Card Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-gradient-to-b from-slate-850 to-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 font-black text-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                {equipo.interno}
              </div>
              <div>
                <span className="text-xs font-mono font-medium text-amber-400">
                  QR: {equipo.qr_codigo}
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-white">
                  Autoelevador Interno #{equipo.interno}
                </h1>
                <p className="text-sm text-slate-400">
                  {equipo.marca} — {equipo.modelo}
                </p>
              </div>
            </div>
            <StatusBadge estado={equipo.estado} size="md" />
          </div>
        </div>

        {/* Warning if out of service */}
        {equipo.estado === 'fuera_de_servicio' && (
          <div className="bg-rose-500/15 border-b border-rose-500/30 p-4 flex items-start gap-3 text-rose-300 text-xs sm:text-sm">
            <ShieldAlert size={20} className="text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold block">ATENCIÓN: Equipo Fuera de Servicio</strong>
              Este equipo posee fallas críticas reportadas pendientes de resolución técnica.
            </div>
          </div>
        )}

        {/* Technical details grid */}
        <div className="p-5 sm:p-6 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950/40">
          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
            <span className="text-[11px] uppercase font-bold text-slate-500 flex items-center gap-1">
              <Gauge size={12} /> Horómetro Actual
            </span>
            <p className="text-base font-black text-white mt-1">
              {equipo.horometro_actual.toFixed(1)}{' '}
              <span className="text-xs text-slate-400 font-normal">hs</span>
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
            <span className="text-[11px] uppercase font-bold text-slate-500 flex items-center gap-1">
              <Fuel size={12} /> Combustible
            </span>
            <p className="text-base font-black text-white mt-1">
              {equipo.combustible || 'No especificado'}
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl col-span-2 sm:col-span-1">
            <span className="text-[11px] uppercase font-bold text-slate-500 flex items-center gap-1">
              <Calendar size={12} /> Próximo Service
            </span>
            <p className="text-base font-black text-amber-400 mt-1">
              {equipo.horometro_proximo_mantenimiento
                ? `${equipo.horometro_proximo_mantenimiento} hs`
                : 'Programado'}
            </p>
          </div>
        </div>

        {/* Start inspection Form */}
        <form onSubmit={handleStartInspection} className="p-5 sm:p-6 space-y-4 border-t border-slate-800">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <FileCheck2 size={16} className="text-amber-400" />
            Datos para la Inspección Diaria
          </h2>

          <div className="space-y-3">
            {/* Operador activo info */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Operador Responsable (Autenticado)
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
                    <span className="text-xs text-slate-400">
                      {operador?.legajo ? `Legajo #${operador.legajo}` : 'Debe escanear credencial'}
                    </span>
                  </div>
                </div>

                <Link
                  href="/"
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 underline"
                >
                  {operador ? 'Cambiar' : 'Escanear'}
                </Link>
              </div>
            </div>

            {/* Horómetro input */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Lectura Actual del Horómetro (Tablero) <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <Gauge size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400" />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={horometro}
                  onChange={(e) => setHorometro(e.target.value)}
                  required
                  placeholder="Ej: 1245.5"
                  className="w-full pl-10 pr-16 py-3 bg-slate-950 border border-amber-500/50 rounded-xl text-base font-bold text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  HORAS
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Último registro en sistema: <strong className="text-slate-300">{equipo.horometro_actual.toFixed(1)} hs</strong>
              </p>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-4 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base rounded-xl transition flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/20 active:scale-98 cursor-pointer mt-4"
          >
            <Play size={18} fill="currentColor" />
            <span>Iniciar Checklist TPM</span>
          </button>
        </form>
      </div>
    </div>
  );
}
