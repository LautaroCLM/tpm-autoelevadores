'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';

const MIN_DISPLAY_TIME_MS = 800;
const FADE_OUT_DURATION_MS = 500;

export const SplashScreen: React.FC = () => {
  const { loading: authLoading } = useAuth();
  const [minTimePassed, setMinTimePassed] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [visible, setVisible] = useState(true);

  // 1. Cronómetro de tiempo mínimo de presentación (800ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, MIN_DISPLAY_TIME_MS);

    return () => clearTimeout(timer);
  }, []);

  // 2. Control del fade-out cuando se cumplen ambas condiciones:
  //    - Finalizó la carga inicial de AuthProvider (authLoading === false)
  //    - Transcurrió el tiempo mínimo de visualización (minTimePassed === true)
  useEffect(() => {
    if (!authLoading && minTimePassed && !fadingOut) {
      setFadingOut(true);

      const fadeTimer = setTimeout(() => {
        setVisible(false);
      }, FADE_OUT_DURATION_MS);

      return () => clearTimeout(fadeTimer);
    }
  }, [authLoading, minTimePassed, fadingOut]);

  // Si la pantalla ya terminó su desvanecimiento, se desmonta completamente para no interferir con la app
  if (!visible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0b0f17] select-none transition-opacity duration-500 ease-out ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
    >
      <div className="relative flex flex-col items-center justify-center p-6 text-center">
        {/* Anillo de carga naranja industrial con resplandor suave */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center">
          {/* Anillo exterior animado */}
          <div className="absolute inset-0 rounded-full border-2 border-slate-800/80 border-t-amber-500 border-r-amber-500/40 animate-spin shadow-[0_0_20px_rgba(245,158,11,0.2)]" />
          
          {/* Fondo interno sutil */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-center p-3 shadow-inner">
            <img
              src="/img/logocompacto.png"
              alt="TPM Autoelevadores Logo"
              className="w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
            />
          </div>
        </div>

        {/* Tipografía corporativa industrial */}
        <div className="mt-6 space-y-1">
          <div className="font-black text-sm sm:text-base tracking-tight text-white flex items-center justify-center gap-1.5">
            TPM <span className="text-amber-400">ELEVADORES</span>
          </div>
          <div className="text-[10px] sm:text-xs text-slate-400 font-mono tracking-widest uppercase">
            Checklist Planta • C.G.R S.A.
          </div>
        </div>
      </div>
    </div>
  );
};
