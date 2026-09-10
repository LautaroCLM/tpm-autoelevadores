'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getQueuedInspecciones, processOfflineQueue } from '../lib/offline/queue';
import { submitInspeccion, isNetworkError } from '../lib/api/tpm';
import { toast } from 'sonner';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

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

  if (isOnline && queueCount === 0) {
    return null; // Don't take up space if everything is synced and online
  }

  return (
    <div className="w-full bg-[#0b0f17] border-b border-slate-800/80 px-3 sm:px-4 py-2 sticky top-0 z-50 transition-all">
      <div className="max-w-6xl mx-auto flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <span className="flex items-center gap-1.5 font-bold text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/30">
              <WifiOff size={13} className="animate-pulse text-amber-400" />
              <span>Modo Planta (Sin Conexión)</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-bold text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-lg border border-emerald-500/30">
              <Wifi size={13} /> En Línea
            </span>
          )}

          {queueCount > 0 && (
            <span className="text-slate-300 text-xs">
              <strong className="text-amber-300 font-mono font-tabular font-bold">{queueCount}</strong> checklist(s) en cola local
            </span>
          )}
        </div>

        {queueCount > 0 && isOnline && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs transition active:scale-95 disabled:opacity-50 cursor-pointer btn-tactile shadow-xs"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}</span>
          </button>
        )}
      </div>
    </div>
  );
};

