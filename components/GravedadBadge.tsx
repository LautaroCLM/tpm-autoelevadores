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
      ? 'text-[10px] px-2 py-0.5 gap-1.5 font-bold uppercase tracking-wider'
      : 'text-xs px-2.5 py-1 gap-1.5 font-bold uppercase tracking-wider';
  const iconSize = size === 'sm' ? 12 : 13;

  switch (gravedad) {
    case 'leve':
      return (
        <span
          className={`inline-flex items-center rounded-lg bg-yellow-950/60 text-yellow-300 border border-yellow-500/40 shadow-xs ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
          <Info size={iconSize} className="text-yellow-400 shrink-0" />
          <span>Falla Leve</span>
        </span>
      );
    case 'media':
      return (
        <span
          className={`inline-flex items-center rounded-lg bg-orange-950/60 text-orange-300 border border-orange-500/50 shadow-xs ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
          <AlertCircle size={iconSize} className="text-orange-400 shrink-0" />
          <span>Falla Media</span>
        </span>
      );
    case 'critica':
      return (
        <span
          className={`inline-flex items-center rounded-lg bg-rose-950/80 text-rose-200 border border-rose-500/70 shadow-xs shadow-rose-950/50 animate-pulse ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
          <AlertOctagon size={iconSize} className="text-rose-400 shrink-0" />
          <span>Falla Crítica</span>
        </span>
      );
    default:
      return null;
  }
};

