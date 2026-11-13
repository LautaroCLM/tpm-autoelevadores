'use client';

import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  Users,
  UserPlus,
  KeyRound,
  QrCode,
  Ban,
  RefreshCw,
  Loader2,
  X,
  Printer,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { createClient } from '../lib/supabase/client';
import { getApiUrl } from '../lib/api/auth';
import { validarLegajo, validarPin, PIN_MAX, PIN_MIN } from '../lib/utils/pin';
import { formatDate } from '../lib/utils';
import { ModalPortal } from './ModalPortal';

interface OperadorAdmin {
  id: string;
  nombre: string;
  legajo: string | null;
  qr_activo: boolean;
  qr_emitido_en: string | null;
  qr_ultimo_uso: string | null;
}

interface TarjetaEmitida {
  nombre: string;
  legajo: string;
  qrPayload: string;
  dataUrl: string;
}

async function authFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sesión expirada. Volvé a iniciar sesión.');

  const res = await fetch(getApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body as T;
}

const inputCls =
  'w-full bg-[#0B0F17] border border-slate-700/80 rounded-xl px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none';
const labelCls = 'block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1';

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <ModalPortal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto w-screen h-dvh min-h-dvh"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-[#111724] border border-slate-800/90 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[90dvh] overflow-y-auto"
        >
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-base font-black text-white">{title}</h3>
            <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition cursor-pointer">
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}

export function OperadoresAdminPanel() {
  const [operadores, setOperadores] = useState<OperadorAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Alta de operador
  const [crearOpen, setCrearOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoLegajo, setNuevoLegajo] = useState('');
  const [nuevoPin, setNuevoPin] = useState('');
  const [creando, setCreando] = useState(false);

  // Asignar PIN
  const [pinTarget, setPinTarget] = useState<OperadorAdmin | null>(null);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [guardandoPin, setGuardandoPin] = useState(false);

  // Tarjeta QR recién emitida (el token solo se ve una vez)
  const [tarjeta, setTarjeta] = useState<TarjetaEmitida | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch<{ operadores: OperadorAdmin[] }>('/api/supervisor/operadores');
      setOperadores(res.operadores || []);
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo cargar el listado de operadores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = (!nuevoNombre.trim() && 'Ingresá nombre y apellido') || validarLegajo(nuevoLegajo) || validarPin(nuevoPin);
    if (err) {
      toast.error(err);
      return;
    }
    setCreando(true);
    try {
      await authFetch('/api/supervisor/operadores', {
        method: 'POST',
        body: JSON.stringify({ action: 'crear', nombre: nuevoNombre.trim(), legajo: nuevoLegajo.trim(), pin: nuevoPin.trim() }),
      });
      toast.success(`Operador ${nuevoNombre.trim()} creado. Ya puede ingresar con su legajo y PIN.`);
      setCrearOpen(false);
      setNuevoNombre('');
      setNuevoLegajo('');
      setNuevoPin('');
      await cargar();
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo crear el operador');
    } finally {
      setCreando(false);
    }
  };

  const handleGuardarPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTarget) return;
    const err = validarPin(pin1);
    if (err) {
      toast.error(err);
      return;
    }
    if (pin1.trim() !== pin2.trim()) {
      toast.error('Los PIN no coinciden');
      return;
    }
    setGuardandoPin(true);
    try {
      const res = await authFetch<{ sesionesCerradas?: boolean }>('/api/supervisor/operadores', {
        method: 'POST',
        body: JSON.stringify({ action: 'set_pin', operador_id: pinTarget.id, pin: pin1.trim() }),
      });
      toast.success(
        res.sesionesCerradas
          ? `PIN actualizado para ${pinTarget.nombre}. Sus sesiones abiertas se cerraron.`
          : `PIN actualizado para ${pinTarget.nombre}`
      );
      setPinTarget(null);
      setPin1('');
      setPin2('');
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo actualizar el PIN');
    } finally {
      setGuardandoPin(false);
    }
  };

  const handleEmitirQR = async (op: OperadorAdmin) => {
    if (op.qr_activo && !window.confirm(`${op.nombre} ya tiene una tarjeta QR activa. Si emitís una nueva, la anterior deja de funcionar. ¿Continuar?`)) {
      return;
    }
    setBusyId(op.id);
    try {
      const res = await authFetch<{ qrPayload: string; nombre: string; legajo: string }>('/api/supervisor/credenciales-qr', {
        method: 'POST',
        body: JSON.stringify({ action: 'generate', operador_id: op.id }),
      });
      const dataUrl = await QRCode.toDataURL(res.qrPayload, { width: 480, margin: 2, errorCorrectionLevel: 'M' });
      setTarjeta({ nombre: res.nombre, legajo: res.legajo, qrPayload: res.qrPayload, dataUrl });
      await cargar();
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo emitir la tarjeta QR');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevocarQR = async (op: OperadorAdmin) => {
    if (!window.confirm(`¿Revocar la tarjeta QR de ${op.nombre}? Dejará de servir para ingresar (el PIN sigue funcionando).`)) {
      return;
    }
    setBusyId(op.id);
    try {
      const res = await authFetch<{ sesionesCerradas?: boolean }>('/api/supervisor/credenciales-qr', {
        method: 'POST',
        body: JSON.stringify({ action: 'revoke', operador_id: op.id }),
      });
      toast.success(
        res.sesionesCerradas
          ? `Tarjeta QR de ${op.nombre} revocada y sus sesiones abiertas cerradas`
          : `Tarjeta QR de ${op.nombre} revocada. No se pudieron cerrar sus sesiones abiertas: durarán hasta fin de jornada.`
      );
      await cargar();
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo revocar la tarjeta');
    } finally {
      setBusyId(null);
    }
  };

  const imprimirTarjeta = () => {
    if (!tarjeta) return;
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) {
      toast.error('El navegador bloqueó la ventana de impresión. Usá "Descargar PNG".');
      return;
    }
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tarjeta ${esc(tarjeta.legajo)}</title>
      <style>body{font-family:system-ui,sans-serif;margin:0;display:flex;justify-content:center;padding:24px}
      .card{border:2px solid #111;border-radius:12px;padding:16px;width:300px;text-align:center}
      img{width:240px;height:240px}h1{font-size:18px;margin:8px 0 2px}p{margin:2px 0;font-size:13px;color:#333}</style></head>
      <body><div class="card"><p><strong>TPM Autoelevadores</strong></p><img src="${tarjeta.dataUrl}" alt="QR">
      <h1>${esc(tarjeta.nombre)}</h1><p>Legajo #${esc(tarjeta.legajo)}</p><p style="font-size:11px">Credencial personal e intransferible</p></div>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#111724] border border-slate-800/90 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Users size={18} className="text-amber-400" />
              Operadores y Credenciales
            </h2>
            <p className="text-xs text-slate-400">
              PIN de {PIN_MIN} a {PIN_MAX} dígitos para el acceso rápido. La tarjeta QR permite entrar sin PIN: si se pierde, revocala.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={cargar}
              disabled={loading}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={() => setCrearOpen(true)}
              className="px-3 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Nuevo operador</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-950/60 rounded-xl animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : operadores.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400 bg-slate-950/50 rounded-xl border border-slate-800">
            No hay operadores registrados. Creá el primero con &quot;Nuevo operador&quot;.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
            {operadores.map((op) => {
              const busy = busyId === op.id;
              return (
                <div key={op.id} className="p-3 sm:p-4 bg-[#0B0F17] flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{op.nombre}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-mono text-amber-400">Legajo #{op.legajo || 'S/N'}</span>
                      {op.qr_activo ? (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border bg-emerald-950/70 text-emerald-300 border-emerald-500/50">
                          TARJETA QR ACTIVA
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border bg-slate-900 text-slate-400 border-slate-700">
                          SIN TARJETA QR
                        </span>
                      )}
                      {op.qr_ultimo_uso && (
                        <span className="text-[10px] font-mono text-slate-500">Último uso QR: {formatDate(op.qr_ultimo_uso)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPinTarget(op);
                        setPin1('');
                        setPin2('');
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <KeyRound size={13} className="text-amber-400" />
                      <span>Asignar PIN</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || !op.legajo}
                      onClick={() => handleEmitirQR(op)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} className="text-amber-400" />}
                      <span>{op.qr_activo ? 'Reemitir tarjeta' : 'Emitir tarjeta QR'}</span>
                    </button>
                    {op.qr_activo && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRevocarQR(op)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-950/40 hover:bg-rose-950/70 text-rose-300 border border-rose-500/40 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Ban size={13} />
                        <span>Revocar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {crearOpen && (
        <ModalShell title="Nuevo operador" onClose={() => !creando && setCrearOpen(false)}>
          <form onSubmit={handleCrear} className="space-y-3.5">
            <div>
              <label className={labelCls}>Nombre y apellido *</label>
              <input className={inputCls} value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} maxLength={80} required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Legajo *</label>
                <input className={`${inputCls} font-mono`} value={nuevoLegajo} onChange={(e) => setNuevoLegajo(e.target.value)} maxLength={20} required placeholder="Ej: 4030" />
              </div>
              <div>
                <label className={labelCls}>PIN inicial *</label>
                <input
                  className={`${inputCls} font-mono tracking-widest`}
                  value={nuevoPin}
                  onChange={(e) => setNuevoPin(e.target.value.replace(/\D/g, '').slice(0, PIN_MAX))}
                  inputMode="numeric"
                  autoComplete="new-password"
                  required
                  placeholder={`${PIN_MIN}-${PIN_MAX} dígitos`}
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Comunicale el PIN al operador en persona. El legajo no se puede cambiar después.</p>
            <button
              type="submit"
              disabled={creando}
              className="w-full py-3 rounded-xl text-sm font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {creando ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              <span>{creando ? 'Creando...' : 'Crear operador'}</span>
            </button>
          </form>
        </ModalShell>
      )}

      {pinTarget && (
        <ModalShell title={`Asignar PIN · ${pinTarget.nombre}`} onClose={() => !guardandoPin && setPinTarget(null)}>
          <form onSubmit={handleGuardarPin} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nuevo PIN</label>
                <input
                  className={`${inputCls} font-mono tracking-widest`}
                  value={pin1}
                  onChange={(e) => setPin1(e.target.value.replace(/\D/g, '').slice(0, PIN_MAX))}
                  inputMode="numeric"
                  type="password"
                  autoComplete="new-password"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>Repetir PIN</label>
                <input
                  className={`${inputCls} font-mono tracking-widest`}
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, PIN_MAX))}
                  inputMode="numeric"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              El PIN anterior deja de funcionar al guardar y se cierran las sesiones abiertas del operador.
            </p>
            <button
              type="submit"
              disabled={guardandoPin}
              className="w-full py-3 rounded-xl text-sm font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {guardandoPin ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
              <span>{guardandoPin ? 'Guardando...' : 'Guardar PIN'}</span>
            </button>
          </form>
        </ModalShell>
      )}

      {tarjeta && (
        <ModalShell title="Tarjeta QR emitida" onClose={() => setTarjeta(null)}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>Este código se muestra una sola vez. Imprimilo o descargalo ahora; si lo perdés, emití una tarjeta nueva.</span>
            </div>
            <div className="bg-white rounded-xl p-4 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tarjeta.dataUrl} alt={`QR de ${tarjeta.nombre}`} className="w-56 h-56" />
              <p className="text-slate-900 font-black text-base">{tarjeta.nombre}</p>
              <p className="text-slate-600 font-mono text-xs">Legajo #{tarjeta.legajo}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={imprimirTarjeta}
                className="py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer size={14} />
                <span>Imprimir</span>
              </button>
              <a
                href={tarjeta.dataUrl}
                download={`tarjeta-operador-${tarjeta.legajo}.png`}
                className="py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center justify-center gap-1.5"
              >
                <Download size={14} />
                <span>Descargar PNG</span>
              </a>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
