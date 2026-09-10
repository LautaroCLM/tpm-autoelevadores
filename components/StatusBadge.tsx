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
    sm: 'text-[10px] px-2 py-0.5 gap-1.5 font-bold tracking-wider uppercase',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-bold tracking-wider uppercase',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-black tracking-wider uppercase',
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  switch (estado) {
    case 'operativo':
      return (
        <span
          className={`inline-flex items-center rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 shadow-xs ${sizeClasses[size]}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          {showIcon && <CheckCircle2 size={iconSizes[size]} className="text-emerald-400 shrink-0" />}
          <span>Operativo</span>
        </span>
      );
    case 'observado':
      return (
        <span
          className={`inline-flex items-center rounded-lg bg-amber-950/60 text-amber-300 border border-amber-500/45 shadow-xs ${sizeClasses[size]}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          {showIcon && <AlertTriangle size={iconSizes[size]} className="text-amber-400 shrink-0" />}
          <span>Observado</span>
        </span>
      );
    case 'fuera_de_servicio':
      return (
        <span
          className={`inline-flex items-center rounded-lg bg-rose-950/80 text-rose-200 border border-rose-500/60 shadow-xs shadow-rose-950/50 ${sizeClasses[size]}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
          {showIcon && <AlertOctagon size={iconSizes[size]} className="text-rose-400 shrink-0" />}
          <span>Fuera de Servicio</span>
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center rounded-lg bg-slate-900 text-slate-400 border border-slate-700 ${sizeClasses[size]}`}>
          {estado}
        </span>
      );
  }
};

