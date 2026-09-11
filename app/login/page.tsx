'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signInWithCredentials, getCurrentSessionAndProfile } from '../../lib/api/auth';
import { sanitizeRedirectUrl } from '../../lib/utils/auth-helpers';
import { ShieldCheck, Lock, User, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

function LoginForm() {
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberUser, setRememberUser] = useState(false);
  const [loading, setLoading] = useState(false);

  // Cargar usuario recordado si existe
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('tpm_remembered_user');
      if (savedUser) {
        setIdentifier(savedUser);
        setRememberUser(true);
      }
    }
  }, []);

  // Si el usuario ya tiene sesión activa válida para hoy, redirigir automáticamente
  useEffect(() => {
    getCurrentSessionAndProfile().then(({ user, perfil }) => {
      if (user) {
        const rawRedirect = searchParams?.get('redirect') || searchParams?.get('redirectTo');
        const fallbackTarget =
          perfil?.rol === 'supervisor' || perfil?.rol === 'mantenimiento' ? '/dashboard' : '/';
        const target = sanitizeRedirectUrl(rawRedirect, fallbackTarget);
        if (target && target !== '/login') {
          window.location.href = target;
        }
      }
    });
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error('Complete todos los campos');
      return;
    }

    setLoading(true);
    try {
      const res = await signInWithCredentials({
        identifier: identifier.trim(),
        password,
      });

      if (res.success) {
        // Manejar opción "Recordar usuario" (NUNCA se guarda la contraseña)
        if (typeof window !== 'undefined') {
          if (rememberUser) {
            localStorage.setItem('tpm_remembered_user', identifier.trim());
          } else {
            localStorage.removeItem('tpm_remembered_user');
          }
        }

        toast.success(`Bienvenido, ${res.perfil?.nombre || 'Operador'}`);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tpm_auth_changed'));
        }

        // Obtener destino sanitizado
        const rawRedirect = searchParams?.get('redirect') || searchParams?.get('redirectTo');
        const defaultTarget =
          res.perfil?.rol === 'supervisor' || res.perfil?.rol === 'mantenimiento' ? '/dashboard' : '/';
        const targetUrl = sanitizeRedirectUrl(rawRedirect, defaultTarget);
        const finalTarget = targetUrl === '/login' ? defaultTarget : targetUrl;

        // window.location.href asegura invalidación del router cache y envío de cookies SSR
        window.location.href = finalTarget;
      } else {
        toast.error(res.error || 'Credenciales incorrectas');
        setLoading(false);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 sm:py-16 w-full space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-400 hover:text-white transition"
      >
        <ArrowLeft size={14} className="text-amber-500" />
        <span>Volver a la consola principal</span>
      </Link>

      <div className="bg-[#111724] border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/60 space-y-6 relative overflow-hidden">
        {/* Plant Header Badge */}
        <div className="space-y-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
            <ShieldCheck size={26} />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Terminal de Acceso Seguro
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            TPM Autoelevadores
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Identificación de Operadores y Supervisores para mantenimiento y checklist diario
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Usuario, Legajo o Correo
            </label>
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                placeholder="Ej: 4029 o supervisor@tpm.com"
                className="w-full pl-10 pr-4 py-3 bg-[#0B0F17] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-[#0B0F17] border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition font-medium"
              />
            </div>
          </div>

          {/* Opción Recordar Usuario */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberUser}
                onChange={(e) => setRememberUser(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-[#0B0F17] text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
              />
              <span className="text-xs text-slate-300 font-medium">Recordar usuario</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-tactile w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer mt-2"
          >
            <span>{loading ? 'Verificando credenciales...' : 'Iniciar Sesión'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800/80 text-center">
          <p className="text-[11px] font-mono text-slate-500">
            La sesión permanecerá activa durante la jornada de trabajo.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto px-4 py-16 text-center text-slate-400 text-sm">
          Cargando formulario de acceso...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
