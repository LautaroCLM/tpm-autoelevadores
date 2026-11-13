/** Una inspección reciente conocida de un equipo (del servidor, de la cola offline o de la caché local). */
export interface InspeccionReciente {
  /** Momento de la inspección, en milisegundos. */
  fecha: number;
  operador_id: string;
  nombre?: string;
  legajo?: string;
}

/** Devuelve la inspección más reciente que cae dentro de la ventana de un turno, o null. */
export function buscarInspeccionReciente(
  candidatas: InspeccionReciente[],
  ahora: number,
  ventanaMs: number
): InspeccionReciente | null {
  let mejor: InspeccionReciente | null = null;
  for (const c of candidatas) {
    if (!c || !Number.isFinite(c.fecha) || c.fecha <= 0) continue;
    const dif = ahora - c.fecha;
    if (dif < 0 || dif >= ventanaMs) continue;
    if (!mejor || c.fecha > mejor.fecha) mejor = c;
  }
  return mejor;
}

/** "25 min" o "2 h 5 min". */
export function textoHace(ms: number): string {
  const minutos = Math.max(1, Math.round(ms / 60000));
  return minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}
