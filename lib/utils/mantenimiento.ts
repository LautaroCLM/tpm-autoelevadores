export type NivelMantenimiento = 'al_dia' | 'proximo' | 'vencido' | 'sin_programar';

export interface InfoMantenimiento {
  nivel: NivelMantenimiento;
  diferenciaHoras: number | null;
  horasRestantes: number | null;
  horasExceso: number | null;
  proximoMantenimiento: number | null;
  labelCorto: string;
  labelDetallado: string;
  tooltip: string;
  colorClass: {
    badge: string;
    text: string;
    border: string;
    bg: string;
    icon: string;
  };
}

/**
 * Calcula el estado de mantenimiento preventivo de un autoelevador según su horómetro.
 *
 * Lógica:
 * - diferencia = horometro_proximo_mantenimiento - horometro_actual
 * - Al día: diferencia > 200 horas (verde / esmeralda)
 * - Mantenimiento próximo: diferencia entre 0 y 200 horas (amarillo / ámbar)
 * - Mantenimiento vencido: diferencia <= 0 horas (rojo)
 */
export function calcularEstadoMantenimiento(
  horometroActual: number,
  proximoMantenimiento: number | null | undefined
): InfoMantenimiento {
  if (proximoMantenimiento === null || proximoMantenimiento === undefined) {
    return {
      nivel: 'sin_programar',
      diferenciaHoras: null,
      horasRestantes: null,
      horasExceso: null,
      proximoMantenimiento: null,
      labelCorto: 'Sin programar',
      labelDetallado: 'Mantenimiento: No programado',
      tooltip: 'Próximo service no programado en sistema',
      colorClass: {
        badge: 'bg-slate-800/80 text-slate-400 border-slate-700',
        text: 'text-slate-400',
        border: 'border-slate-800',
        bg: 'bg-slate-900/90',
        icon: 'text-slate-500',
      },
    };
  }

  const diff = Number((proximoMantenimiento - horometroActual).toFixed(1));

  if (diff <= 0) {
    const exceso = Math.abs(diff);
    return {
      nivel: 'vencido',
      diferenciaHoras: diff,
      horasRestantes: 0,
      horasExceso: exceso,
      proximoMantenimiento,
      labelCorto: 'Vencido',
      labelDetallado: `Mantenimiento vencido: ${proximoMantenimiento.toLocaleString('es-AR')} hs (excedido por ${exceso.toFixed(1)} hs)`,
      tooltip: `Mantenimiento vencido: excedido por ${exceso.toFixed(1)} hs`,
      colorClass: {
        badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40 hover:bg-rose-500/25',
        text: 'text-rose-400',
        border: 'border-rose-500/40',
        bg: 'bg-rose-500/10',
        icon: 'text-rose-400',
      },
    };
  }

  if (diff <= 200) {
    return {
      nivel: 'proximo',
      diferenciaHoras: diff,
      horasRestantes: diff,
      horasExceso: 0,
      proximoMantenimiento,
      labelCorto: 'Próximo',
      labelDetallado: `Próximo mantenimiento: ${proximoMantenimiento.toLocaleString('es-AR')} hs (faltan ${diff.toFixed(1)} hs)`,
      tooltip: `Próximo service: faltan ${diff.toFixed(1)} hs`,
      colorClass: {
        badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25',
        text: 'text-amber-400',
        border: 'border-amber-500/40',
        bg: 'bg-amber-500/10',
        icon: 'text-amber-400',
      },
    };
  }

  return {
    nivel: 'al_dia',
    diferenciaHoras: diff,
    horasRestantes: diff,
    horasExceso: 0,
    proximoMantenimiento,
    labelCorto: 'Al día',
    labelDetallado: `Mantenimiento al día: ${proximoMantenimiento.toLocaleString('es-AR')} hs (faltan ${diff.toFixed(1)} hs)`,
    tooltip: `Service al día: faltan ${diff.toFixed(1)} hs`,
    colorClass: {
      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      icon: 'text-emerald-400',
    },
  };
}
