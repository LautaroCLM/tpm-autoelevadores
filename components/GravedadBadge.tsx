import React from 'react';
import { GravedadFalla } from '../lib/types/tpm';
import { AlertCircle, AlertOctagon, Info } from 'lucide-react';

interface GravedadBadgeProps {
  gravedad: GravedadFalla;
  size?: 'sm' | 'md';
}

export const GravedadBadge: React.FC<GravedadBadgeProps> = ({ gravedad, size = 'md' }) => {
  const sizeClasses =
    size === 'sm'
      ? 'text-[10px] px-2 py-0.5 gap-1.5 font-mono font-bold uppercase tracking-wider'
      : 'text-xs px-2.5 py-1 gap-1.5 font-mono font-bold uppercase tracking-wider';
  const iconSize = size === 'sm' ? 11 : 13;

  switch (gravedad) {
    case 'leve':
      return (
        <span
          className={`inline-flex items-center rounded bg-yellow-950/80 text-yellow-300 border border-yellow-500/50 ${sizeClasses}`}
        >
          <Info size={iconSize} className="text-yellow-400 shrink-0" />
          <span>Falla Leve</span>
        </span>
      );
    case 'media':
      return (
        <span
          className={`inline-flex items-center rounded bg-orange-950/80 text-orange-300 border border-orange-500/50 ${sizeClasses}`}
        >
          <AlertCircle size={iconSize} className="text-orange-400 shrink-0" />
          <span>Falla Media</span>
        </span>
      );
    case 'critica':
      return (
        <span
          className={`inline-flex items-center rounded bg-rose-950/90 text-rose-200 border border-rose-500/70 ${sizeClasses}`}
        >
          <AlertOctagon size={iconSize} className="text-rose-400 shrink-0" />
          <span>Falla Crítica</span>
        </span>
      );
    default:
      return null;
  }
};
