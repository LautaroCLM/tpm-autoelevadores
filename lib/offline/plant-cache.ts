/**
 * lib/offline/plant-cache.ts
 * Gestor de almacenamiento local en IndexedDB para datos maestros de planta:
 * 1. Flota de autoelevadores/equipos (equipos_cache)
 * 2. Plantilla activa de inspección TPM y sus ítems (checklist_template_cache)
 *
 * Principios:
 * - ONLINE: Supabase es la fuente de verdad. Al consultar con éxito, se actualiza la copia local.
 * - OFFLINE: Se sirve desde IndexedDB. Si no existe copia, se emite un error explícito.
 * - NO modifica datos remotos ni altera la cola de inspecciones (inspecciones_queue).
 */

import { openDB, EQUIPOS_STORE, TEMPLATE_STORE } from './db';
import { Equipo, ChecklistTemplate, ChecklistItem } from '../types/tpm';

export interface CachedTemplateRecord {
  id: string; // 'active'
  template: ChecklistTemplate;
  items: ChecklistItem[];
  cached_at: string;
  timestamp: number;
}

/**
 * Guarda o actualiza la lista completa de autoelevadores en IndexedDB.
 * Ejecuta una transacción atómica: limpia la copia previa para evitar equipos
 * dados de baja y almacena la nueva lista.
 */
export async function saveEquiposCache(equipos: Equipo[]): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  if (!Array.isArray(equipos) || equipos.length === 0) return;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EQUIPOS_STORE, 'readwrite');
    const store = tx.objectStore(EQUIPOS_STORE);

    store.clear();

    for (const eq of equipos) {
      store.put(eq);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Obtiene todos los autoelevadores almacenados en la caché local de IndexedDB.
 */
export async function getCachedEquipos(): Promise<Equipo[]> {
  if (typeof window === 'undefined' || !window.indexedDB) return [];
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(EQUIPOS_STORE, 'readonly');
      const store = tx.objectStore(EQUIPOS_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const list = (req.result || []) as Equipo[];
        // Ordenar por interno asc de forma natural
        list.sort((a, b) =>
          (a.interno || '').localeCompare(b.interno || '', undefined, { numeric: true })
        );
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error al leer caché de equipos desde IndexedDB:', err);
    return [];
  }
}

/**
 * Busca un equipo en la memoria local por su código QR o número de interno.
 */
export async function getCachedEquipoByQR(code: string): Promise<Equipo | null> {
  if (!code) return null;
  const clean = code.trim().toUpperCase();
  const all = await getCachedEquipos();
  const found = all.find(
    (eq) =>
      (eq.qr_codigo && eq.qr_codigo.toUpperCase() === clean) ||
      (eq.interno && eq.interno.toUpperCase() === clean)
  );
  return found || null;
}

/**
 * Busca un equipo en la memoria local directamente por su clave primaria (UUID).
 */
export async function getCachedEquipoById(id: string): Promise<Equipo | null> {
  if (typeof window === 'undefined' || !window.indexedDB || !id) return null;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(EQUIPOS_STORE, 'readonly');
      const store = tx.objectStore(EQUIPOS_STORE);
      const req = store.get(id);

      req.onsuccess = () => resolve((req.result as Equipo) || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error al leer equipo por ID desde IndexedDB:', err);
    return null;
  }
}

/**
 * Guarda la plantilla activa y sus ítems en IndexedDB bajo la clave fija 'active'.
 * Reemplaza cualquier versión previa para mantener exactamente una copia activa.
 */
export async function saveActiveTemplateCache(
  template: ChecklistTemplate,
  items: ChecklistItem[]
): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  if (!template || !Array.isArray(items) || items.length === 0) return;

  const db = await openDB();
  const cacheData: CachedTemplateRecord = {
    id: 'active',
    template,
    items,
    cached_at: new Date().toISOString(),
    timestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, 'readwrite');
    const store = tx.objectStore(TEMPLATE_STORE);
    const req = store.put(cacheData);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Obtiene la plantilla activa y sus ítems desde IndexedDB.
 */
export async function getCachedActiveTemplate(): Promise<{
  template: ChecklistTemplate;
  items: ChecklistItem[];
} | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEMPLATE_STORE, 'readonly');
      const store = tx.objectStore(TEMPLATE_STORE);
      const req = store.get('active');

      req.onsuccess = () => {
        const record = req.result as CachedTemplateRecord | undefined;
        if (record && record.template && Array.isArray(record.items) && record.items.length > 0) {
          // Ordenar ítems por columna orden asc
          record.items.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
          resolve({
            template: record.template,
            items: record.items,
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Error al leer caché de plantilla desde IndexedDB:', err);
    return null;
  }
}

/**
 * Limpia exclusivamente la caché de datos de planta (equipos y template)
 * dejando la cola de inspecciones intacta.
 */
export async function clearPlantCache(): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    const db = await openDB();
    const tx = db.transaction([EQUIPOS_STORE, TEMPLATE_STORE], 'readwrite');
    tx.objectStore(EQUIPOS_STORE).clear();
    tx.objectStore(TEMPLATE_STORE).clear();
  } catch (err) {
    console.warn('Error limpiando caché de planta:', err);
  }
}
