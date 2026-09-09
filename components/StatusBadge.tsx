import React from 'react';
import { EstadoEquipo } from '../lib/types/tpm';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

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
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-2.5 py-1 gap-1.5',
    lg: 'text-base px-3.5 py-1.5 gap-2 font-bold',
  };

  const iconSizes = {
    sm: 12,
    md: 15,
    lg: 18,
  };

  switch (estado) {
    case 'operativo':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 ${sizeClasses[size]}`}
        >
          {showIcon && <CheckCircle2 size={iconSizes[size]} className="text-emerald-400 shrink-0" />}
          Operativo
        </span>
      );
    case 'observado':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 ${sizeClasses[size]}`}
        >
          {showIcon && <AlertTriangle size={iconSizes[size]} className="text-amber-400 shrink-0" />}
          Observado
        </span>
      );
    case 'fuera_de_servicio':
      return (
        <span
          className={`inline-flex items-center font-medium rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 ${sizeClasses[size]}`}
        >
          {showIcon && <XCircle size={iconSizes[size]} className="text-rose-400 shrink-0" />}
          Fuera de servicio
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center font-medium rounded-full bg-slate-800 text-slate-400 border border-slate-700 ${sizeClasses[size]}`}>
          {estado}
        </span>
      );
  }
};
