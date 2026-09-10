'use client';

import React, { useState } from 'react';
import { Wrench } from 'lucide-react';
import { calcularEstadoMantenimiento } from '../lib/utils/mantenimiento';

interface MantenimientoBadgeProps {
  horometroActual: number;
  proximoMantenimiento: number | null | undefined;
  size?: 'xs' | 'sm' | 'md';
  showHours?: boolean;
  className?: string;
}

export const MantenimientoBadge: React.FC<MantenimientoBadgeProps> = ({
  horometroActual,
  proximoMantenimiento,
  size = 'sm',
  showHours = true,
  className = '',
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const info = calcularEstadoMantenimiento(horometroActual, proximoMantenimiento);

  const sizeClasses = {
    xs: 'text-[10px] px-2 py-0.5 gap-1 font-semibold',
    sm: 'text-[11px] px-2.5 py-0.5 gap-1.5 font-bold',
    md: 'text-xs px-3 py-1 gap-2 font-bold',
  };

  const iconSizes = {
    xs: 10,
    sm: 12,
    md: 13,
  };

  // Formato compacto de horas para el badge con fuente mono tabular
  let hoursElement = null;
  if (showHours && info.diferenciaHoras !== null) {
    if (info.nivel === 'vencido') {
      hoursElement = (
        <span className="font-mono font-tabular tracking-tight ml-0.5">
          (+{info.horasExceso?.toFixed(0)} hs)
        </span>
      );
    } else {
      hoursElement = (
        <span className="font-mono font-tabular tracking-tight ml-0.5 opacity-90">
          ({info.horasRestantes?.toFixed(0)} hs)
        </span>
      );
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowTooltip(!showTooltip);
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        title={info.tooltip}
        className={`inline-flex items-center rounded-lg border transition cursor-pointer select-none shadow-xs ${info.colorClass.badge} ${sizeClasses[size]} ${className}`}
      >
        <Wrench size={iconSizes[size]} className={info.colorClass.icon} />
        <span>{info.labelCorto}</span>
        {hoursElement}
      </button>

      {/* Popover interactivo al hacer tap en celular o hover */}
      {showTooltip && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[240px] sm:max-w-xs bg-slate-950 border border-slate-700 text-slate-100 text-[11px] rounded-xl py-2 px-3 shadow-2xl pointer-events-none text-center leading-snug animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="font-bold flex items-center justify-center gap-1.5 mb-1 text-slate-200">
            <Wrench size={12} className={info.colorClass.icon} />
            <span className="uppercase tracking-wider text-[10px]">Service Preventivo</span>
          </div>
          <p className="text-slate-300">{info.tooltip}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-slate-700" />
        </div>
      )}
    </div>
  );
};

