import { InspeccionPayload, OfflineQueuedInspeccion } from '../types/tpm';

const DB_NAME = 'tpm_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'inspecciones_queue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported or running on server'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Encola una inspección terminada en IndexedDB si no hay conexión o falla el envío.
 */
export async function enqueueInspeccion(payload: InspeccionPayload): Promise<OfflineQueuedInspeccion> {
  // Asegurar que la inspección mantenga su client_generated_id único
  payload.client_generated_id = payload.client_generated_id || crypto.randomUUID();
  const db = await openDB();
  const queueItem: OfflineQueuedInspeccion = {
    id: 'local_' + payload.client_generated_id,
    timestamp: Date.now(),
    payload,
    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(queueItem);

    req.onsuccess = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tpm_queue_updated'));
      }
      resolve(queueItem);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Obtiene todas las inspecciones pendientes en la cola local.
 */
export async function getQueuedInspecciones(): Promise<OfflineQueuedInspeccion[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * Elimina una inspección de la cola tras sincronizarse con éxito.
 */
export async function removeQueuedInspeccion(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tpm_queue_updated'));
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Error removing from queue:', err);
  }
}

/**
 * Sincroniza todas las inspecciones pendientes ejecutando una función de sincronización.
 * Evita bucles infinitos descartando errores fatales de validación de negocio.
 */
export async function processOfflineQueue(
  syncFn: (item: InspeccionPayload) => Promise<boolean | { success: boolean; isFatal?: boolean; error?: string }>
): Promise<{ total: number; synced: number; failed: number; fatal: number }> {
  const items = await getQueuedInspecciones();
  let synced = 0;
  let failed = 0;
  let fatal = 0;

  for (const item of items) {
    try {
      const res = await syncFn(item.payload);
      const isSuccess = typeof res === 'boolean' ? res : res.success;
      const isFatal = typeof res === 'object' && Boolean(res.isFatal);

      if (isSuccess) {
        await removeQueuedInspeccion(item.id);
        synced++;
      } else if (isFatal) {
        console.error(`Error fatal de validación en inspección ${item.id}:`, typeof res === 'object' ? res.error : '');
        await removeQueuedInspeccion(item.id);
        fatal++;
      } else {
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastError = typeof res === 'object' ? res.error : undefined;
        if (item.retryCount >= 5) {
          console.warn(`Inspección ${item.id} descartada de la cola local tras 5 reintentos fallidos`);
          await removeQueuedInspeccion(item.id);
          fatal++;
        }
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { total: items.length, synced, failed, fatal };
}
