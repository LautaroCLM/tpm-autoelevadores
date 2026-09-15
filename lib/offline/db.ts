/**
 * lib/offline/db.ts
 * Gestor unificado de conexión y esquema para la base IndexedDB 'tpm_offline_db'.
 *
 * Stores:
 * - inspecciones_queue: Cola local de inspecciones pendientes de sincronizar (Paso 1)
 * - equipos_cache: Almacenamiento local de la flota de autoelevadores (Paso 2)
 * - checklist_template_cache: Almacenamiento local de la plantilla activa y sus ítems (Paso 2)
 */

export const DB_NAME = 'tpm_offline_db';
export const DB_VERSION = 2;

export const QUEUE_STORE = 'inspecciones_queue';
export const EQUIPOS_STORE = 'equipos_cache';
export const TEMPLATE_STORE = 'checklist_template_cache';

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB no está disponible en este entorno o se está ejecutando en el servidor'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Cola de inspecciones offline (preservada de v1)
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }

      // 2. Caché local de equipos/autoelevadores (v2)
      if (!db.objectStoreNames.contains(EQUIPOS_STORE)) {
        const eqStore = db.createObjectStore(EQUIPOS_STORE, { keyPath: 'id' });
        eqStore.createIndex('qr_codigo', 'qr_codigo', { unique: false });
        eqStore.createIndex('interno', 'interno', { unique: false });
      }

      // 3. Caché local de plantilla activa y checklist_items (v2)
      if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
        db.createObjectStore(TEMPLATE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
