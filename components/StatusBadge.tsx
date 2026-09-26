import React from 'react';
import { EstadoEquipo } from '../lib/types/tpm';
import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';

interface StatusBadgeProps {
  estado: EstadoEquipo;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  estado,
  size = 'md',
  showIcon = true,
}) => {
  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1.5 font-mono font-bold tracking-wider uppercase',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-mono font-bold tracking-wider uppercase',
    lg: 'text-sm px-3 py-1.5 gap-2 font-mono font-black tracking-wider uppercase',
  };

  const iconSizes = {
    sm: 11,
    md: 13,
    lg: 15,
  };

  switch (estado) {
    case 'operativo':
      return (
        <span
          className={`inline-flex items-center rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 ${sizeClasses[size]}`}
        >
          {showIcon && <CheckCircle2 size={iconSizes[size]} className="text-emerald-400 shrink-0" />}
          <span>Operativo</span>
        </span>
      );
    case 'observado':
      return (
        <span
          className={`inline-flex items-center rounded bg-amber-950/80 text-amber-300 border border-amber-500/50 ${sizeClasses[size]}`}
        >
          {showIcon && <AlertTriangle size={iconSizes[size]} className="text-amber-400 shrink-0" />}
          <span>Observado</span>
        </span>
      );
    case 'fuera_de_servicio':
      return (
        <span
          className={`inline-flex items-center rounded bg-rose-950/90 text-rose-200 border border-rose-500/70 ${sizeClasses[size]}`}
        >
          {showIcon && <AlertOctagon size={iconSizes[size]} className="text-rose-400 shrink-0" />}
          <span>Fuera de Servicio</span>
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center rounded bg-slate-950 text-slate-400 border border-slate-800 ${sizeClasses[size]}`}>
          {estado}
        </span>
      );
  }
};
