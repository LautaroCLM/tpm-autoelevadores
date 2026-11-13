import type { InspeccionReciente } from '../utils/duplicados';

// Recuerda en este dispositivo la última inspección conocida de cada equipo, para poder avisar
// de un checklist repetido aunque no haya conexión (el historial del servidor no está disponible).

const clave = (equipoId: string) => `tpm_ultima_insp_${equipoId}`;

export function leerUltimaInspeccionLocal(equipoId: string): InspeccionReciente | null {
  try {
    if (typeof window === 'undefined' || !equipoId) return null;
    const raw = window.localStorage.getItem(clave(equipoId));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Number.isFinite(d.fecha) || typeof d.operador_id !== 'string') return null;
    return d as InspeccionReciente;
  } catch {
    return null;
  }
}

export function guardarUltimaInspeccionLocal(equipoId: string, data: InspeccionReciente): void {
  try {
    if (typeof window === 'undefined' || !equipoId || !Number.isFinite(data.fecha)) return;
    const actual = leerUltimaInspeccionLocal(equipoId);
    if (actual && actual.fecha >= data.fecha) return; // solo conservamos la más reciente
    window.localStorage.setItem(clave(equipoId), JSON.stringify(data));
  } catch {
    // sin almacenamiento disponible: el aviso sin conexión simplemente no tendrá este dato
  }
}
