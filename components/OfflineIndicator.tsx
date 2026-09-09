'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getQueuedInspecciones, processOfflineQueue } from '../lib/offline/queue';
import { submitInspeccion } from '../lib/api/tpm';
import { toast } from 'sonner';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    // 1. Service worker registration
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('PWA Service Worker registered'))
        .catch((err) => console.warn('Service Worker registration failed:', err));
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
        return res.success;
      });

      if (result.synced > 0) {
        toast.success(`Se sincronizaron ${result.synced} inspección(es) pendiente(s)`);
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
    <div className="w-full bg-slate-900 border-b border-slate-800 px-4 py-2 sticky top-0 z-50 transition-all">
      <div className="max-w-5xl mx-auto flex items-center justify-between text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <span className="flex items-center gap-1.5 font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
              <WifiOff size={14} className="animate-pulse text-amber-400" />
              Sin conexión (Modo Planta)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <Wifi size={14} /> En línea
            </span>
          )}

          {queueCount > 0 && (
            <span className="text-slate-300">
              <strong className="text-amber-300 font-bold">{queueCount}</strong> inspección(es) pendiente(s) de sincronizar
            </span>
          )}
        </div>

        {queueCount > 0 && isOnline && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
          </button>
        )}
      </div>
    </div>
  );
};
