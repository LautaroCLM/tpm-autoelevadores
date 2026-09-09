import React from 'react';
import { GravedadFalla } from '../lib/types/tpm';
import { AlertCircle, AlertOctagon, Info } from 'lucide-react';

interface GravedadBadgeProps {
  gravedad: GravedadFalla;
  size?: 'sm' | 'md';
}

export const GravedadBadge: React.FC<GravedadBadgeProps> = ({ gravedad, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-sm px-2.5 py-1 gap-1.5';
  const iconSize = size === 'sm' ? 12 : 14;

  switch (gravedad) {
    case 'leve':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-md bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 ${sizeClasses}`}
        >
          <Info size={iconSize} className="text-yellow-400 shrink-0" />
          Falla Leve
        </span>
      );
    case 'media':
      return (
        <span
          className={`inline-flex items-center font-semibold rounded-md bg-orange-500/15 text-orange-300 border border-orange-500/30 ${sizeClasses}`}
        >
          <AlertCircle size={iconSize} className="text-orange-400 shrink-0" />
          Falla Media
        </span>
      );
    case 'critica':
      return (
        <span
          className={`inline-flex items-center font-bold rounded-md bg-red-600/20 text-red-300 border border-red-500/40 animate-pulse ${sizeClasses}`}
        >
          <AlertOctagon size={iconSize} className="text-red-400 shrink-0" />
          Falla Crítica
        </span>
      );
    default:
      return null;
  }
};
