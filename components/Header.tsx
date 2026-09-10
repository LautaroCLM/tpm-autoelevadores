'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Truck, QrCode, LayoutDashboard, LogOut, User, ShieldCheck } from 'lucide-react';
import { getCurrentSessionAndProfile, signOutUser } from '../lib/api/auth';
import { Perfil } from '../lib/types/tpm';
import { toast } from 'sonner';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  useEffect(() => {
    async function loadAuth() {
      const { perfil: currentPerfil } = await getCurrentSessionAndProfile();
      setPerfil(currentPerfil);
    }
    loadAuth();

    const handleAuthChange = () => loadAuth();
    window.addEventListener('tpm_auth_changed', handleAuthChange);
    return () => window.removeEventListener('tpm_auth_changed', handleAuthChange);
  }, [pathname]);

  const handleSignOut = async () => {
    await signOutUser();
    setPerfil(null);
    toast.info('Sesión cerrada');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tpm_auth_changed'));
      window.location.href = '/';
    }
  };

  const isSupervisorOrMaint = perfil?.rol === 'supervisor' || perfil?.rol === 'mantenimiento';

  return (
    <header className="bg-[#0e1420]/95 backdrop-blur-md border-b border-slate-800/80 text-slate-100 px-3 sm:px-4 py-2.5 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand / Logo */}
        <Link href="/" className="flex items-center gap-2.5 group shrink-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-xs">
            <Truck size={19} />
          </div>
          <div className="leading-tight">
            <div className="font-black text-sm sm:text-base tracking-tight text-white flex items-center gap-1">
              TPM <span className="text-amber-400">ELEVADORES</span>
            </div>
            <div className="text-[9px] sm:text-[10px] text-slate-400 font-mono tracking-wider uppercase">
              Checklist Planta • Nivel 1
            </div>
          </div>
        </Link>

        {/* Navigation & Session Controls */}
        <nav className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/"
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 btn-tactile border ${
              pathname === '/'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
          >
            <QrCode size={14} className={pathname === '/' ? 'text-slate-950' : 'text-amber-400'} />
            <span className="hidden xs:inline">Escanear</span>
          </Link>

          {(!perfil || isSupervisorOrMaint) && (
            <Link
              href="/dashboard"
              prefetch={false}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 btn-tactile border ${
                pathname.startsWith('/dashboard')
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <LayoutDashboard size={14} className={pathname.startsWith('/dashboard') ? 'text-slate-950' : 'text-slate-400'} />
              <span>Supervisor</span>
            </Link>
          )}

          {/* Navigation link: Mi Perfil (para cualquier usuario autenticado) */}
          {perfil && (
            <Link
              href="/perfil"
              className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 btn-tactile border ${
                pathname === '/perfil'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800 hover:text-white'
              }`}
              title="Mi Perfil de Planta"
            >
              <User size={14} className={pathname === '/perfil' ? 'text-slate-950' : 'text-amber-400'} />
              <span className="hidden sm:inline">Mi perfil</span>
            </Link>
          )}

          {/* Active Session Status */}
          {perfil ? (
            <div className="flex items-center gap-1.5 pl-1.5 sm:pl-2 border-l border-slate-800">
              <Link
                href="/perfil"
                className="hidden md:flex flex-col text-right leading-tight hover:opacity-80 transition cursor-pointer"
                title="Ir a Mi Perfil"
              >
                <span className="text-xs font-bold text-slate-200 truncate max-w-[130px]">
                  {perfil.nombre}
                </span>
                <span className="text-[10px] text-amber-400 font-mono uppercase font-bold">
                  {perfil.rol} {perfil.legajo ? `#${perfil.legajo}` : ''}
                </span>
              </Link>

              <button
                onClick={handleSignOut}
                title="Cerrar sesión"
                className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-rose-300 bg-slate-900 hover:bg-rose-950/50 rounded-xl transition border border-slate-800 hover:border-rose-500/40 cursor-pointer btn-tactile"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-amber-400 bg-slate-900 hover:bg-slate-800 rounded-xl transition border border-slate-800 flex items-center gap-1.5 btn-tactile"
              title="Acceso Usuarios"
            >
              <User size={14} />
              <span className="hidden sm:inline">Ingresar</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

