'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Truck, QrCode, LayoutDashboard, LogOut, User, ShieldCheck } from 'lucide-react';
import { getCurrentSessionAndProfile, signOutUser } from '../lib/api/auth';
import { Perfil } from '../lib/types/tpm';
import { toast } from 'sonner';

export const Header: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
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

  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 text-slate-100 px-4 py-3 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        {/* Logo / App Name */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
            <Truck size={20} />
          </div>
          <div>
            <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              TPM <span className="text-amber-400">ELEVADORES</span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
              Mantenimiento Nivel 1
            </div>
          </div>
        </Link>

        {/* Navigation & User Profile */}
        <nav className="flex items-center gap-2">
          <Link
            href="/"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              pathname === '/'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <QrCode size={14} />
            <span className="hidden sm:inline">Escanear</span>
          </Link>

          <Link
            href="/dashboard"
            prefetch={false}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              pathname.startsWith('/dashboard')
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <LayoutDashboard size={14} />
            <span>Supervisor</span>
          </Link>

          {/* Active User Chip */}
          {perfil ? (
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-200 truncate max-w-[120px]">
                  {perfil.nombre}
                </span>
                <span className="text-[10px] text-amber-400 uppercase font-semibold">
                  {perfil.rol} {perfil.legajo ? `(#${perfil.legajo})` : ''}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                title="Cerrar sesión"
                className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-slate-750 rounded-lg transition cursor-pointer"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="p-1.5 text-slate-400 hover:text-amber-400 bg-slate-800 hover:bg-slate-750 rounded-lg transition"
              title="Ingreso Supervisor"
            >
              <User size={14} />
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};
