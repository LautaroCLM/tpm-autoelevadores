'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, Package } from 'lucide-react';
import { getQueuedInspecciones, processOfflineQueue } from '../lib/offline/queue';
import { submitInspeccion, isNetworkError } from '../lib/api/tpm';
import { toast } from 'sonner';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [justSynced, setJustSynced] = useState<boolean>(false);

  useEffect(() => {
    // 1. Service worker registration (solo en producción para no interferir con Webpack HMR)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker
          .register('/sw.js')
          .then(() => console.log('PWA Service Worker registered'))
          .catch((err) => console.warn('Service Worker registration failed:', err));
      } else {
        // En entorno de desarrollo, desregistrar para evitar cache corrupto de Webpack
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
        if ('caches' in window) {
          caches.keys().then((names) => {
            for (const name of names) {
              caches.delete(name);
            }
          });
        }
      }
    }

    // 2. Initial state
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
    }

    // 3. Update queue counter
    const refreshQueueCount = async () => {
      try {
        const items = await getQueuedInspecciones();
        setQueueCount(items.length);
      } catch {
        setQueueCount(0);
      }
    };

    refreshQueueCount();

    const handleOnline = async () => {
      setIsOnline(true);
      toast.success('Conexión reestablecida. Sincronizando datos...');
      await handleSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Modo sin conexión activado. Las inspecciones se guardarán localmente.');
    };

    const handleQueueUpdate = () => {
      refreshQueueCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('tpm_queue_updated', handleQueueUpdate);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('tpm_queue_updated', handleQueueUpdate);
    };
  }, []);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await processOfflineQueue(async (payload) => {
        const res = await submitInspeccion(payload);
        return {
          success: res.success,
          error: res.error,
          isFatal: !res.success && !res.queuedOffline && !isNetworkError(res.error),
        };
      });

      if (result.synced > 0) {
        toast.success(`Se sincronizaron ${result.synced} inspección(es) pendiente(s)`);
        setJustSynced(true);
        setTimeout(() => {
          setJustSynced(false);
        }, 3000);
      }
      if (result.fatal > 0) {
        toast.error(`Hubo ${result.fatal} inspección(es) con errores de validación que se removieron de la cola local.`);
      }
      const items = await getQueuedInspecciones();
      setQueueCount(items.length);
    } catch (err) {
      console.error('Error during offline queue sync:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="w-full bg-[#0b0f17]/95 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-4 py-1.5 sticky top-0 z-50 transition-all duration-300 animate-fade-in">
      <div className="max-w-6xl mx-auto flex items-center justify-between text-xs gap-2">
        {/* Lado Izquierdo: Telemetría de Estado de Conexión */}
        <div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
          {!isOnline ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-500/40 text-[11px] font-mono tracking-wider shadow-xs">
              <WifiOff size={13} className="animate-pulse text-amber-400 shrink-0" aria-hidden="true" />
              <span className="truncate">SIN CONEXIÓN · MODO PLANTA LOCAL</span>
            </span>
          ) : justSynced ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-300 bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-500/40 text-[11px] font-mono tracking-wider shadow-xs animate-fade-in">
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Sincronización Completada</span>
            </span>
          ) : isSyncing ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-500/30 text-[11px] font-mono tracking-wider shadow-xs">
              <RefreshCw size={13} className="animate-spin text-amber-400 shrink-0" aria-hidden="true" />
              <span>Sincronizando con Servidor...</span>
            </span>
          ) : queueCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-500/40 text-[11px] font-mono tracking-wider shadow-xs">
              <Wifi size={13} className="text-amber-400 shrink-0" aria-hidden="true" />
              <span>En Línea (Pendientes)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0" />
              <span>Conectado a Planta</span>
            </span>
          )}

          {/* Badge de Inspecciones Pendientes en Cola Local */}
          {queueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-slate-200 text-[11px] font-mono">
              <Package size={13} className="text-amber-400 shrink-0" aria-hidden="true" />
              <span>
                <strong className="text-amber-300 font-bold font-tabular">{queueCount}</strong> {queueCount === 1 ? 'pendiente' : 'pendientes'}
              </span>
            </span>
          )}
        </div>

        {/* Lado Derecho: Botón de Sincronización Manual */}
        {queueCount > 0 && isOnline && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="min-h-[32px] px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs transition active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer btn-tactile shadow-xs shrink-0 flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} aria-hidden="true" />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
