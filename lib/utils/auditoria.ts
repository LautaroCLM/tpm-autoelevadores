import type { AccionAuditoriaEquipo } from '../types/tpm';

export const ETIQUETA_CAMPO_EQUIPO: Record<string, string> = {
  interno: 'N° Interno',
  qr_codigo: 'Código QR',
  marca: 'Marca',
  modelo: 'Modelo',
  combustible: 'Combustible',
  estado: 'Estado',
  horometro_actual: 'Horómetro actual',
  horometro_proximo_mantenimiento: 'Próximo service (h)',
  intervalo_mantenimiento_horas: 'Intervalo de service (h)',
  deleted_at: 'Baja administrativa',
};

export const ETIQUETA_ACCION_EQUIPO: Record<
  AccionAuditoriaEquipo,
  { texto: string; clase: string }
> = {
  alta: { texto: 'Alta', clase: 'bg-emerald-950 text-emerald-300 border-emerald-500/50' },
  edicion: { texto: 'Edición', clase: 'bg-sky-950 text-sky-300 border-sky-500/50' },
  baja: { texto: 'Baja', clase: 'bg-rose-950 text-rose-300 border-rose-500/50' },
  reactivacion: { texto: 'Reactivación', clase: 'bg-emerald-950 text-emerald-300 border-emerald-500/50' },
  estado_inspeccion: { texto: 'Estado por inspección', clase: 'bg-amber-950 text-amber-300 border-amber-500/50' },
  sistema: { texto: 'Sistema', clase: 'bg-slate-900 text-slate-300 border-slate-600' },
};

const ETIQUETA_ESTADO: Record<string, string> = {
  operativo: 'Operativo',
  observado: 'Observado',
  fuera_de_servicio: 'Fuera de servicio',
};

/** Texto legible para el valor de un campo en el historial. */
export function formatearValorAuditoria(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') {
    return campo === 'deleted_at' ? 'Activo' : '—';
  }
  if (campo === 'estado' && typeof valor === 'string') {
    return ETIQUETA_ESTADO[valor] ?? valor;
  }
  if (campo === 'deleted_at' && typeof valor === 'string') {
    try {
      return `Baja el ${new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(valor))}`;
    } catch {
      return 'Dado de baja';
    }
  }
  return String(valor);
}
