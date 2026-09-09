'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInSupervisor } from '../../lib/api/auth';
import { Truck, ShieldCheck, Lock, Mail, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function SupervisorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Complete todos los campos');
      return;
    }

    setLoading(true);
    try {
      const res = await signInSupervisor(email, password);
      if (res.success) {
        toast.success(`Bienvenido, ${res.perfil?.nombre || 'Supervisor'}`);
        router.push('/dashboard');
      } else {
        toast.error(res.error || 'Credenciales incorrectas');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setEmail('supervisor@tpm.com');
    setPassword('[REDACTADO_PASS_SUPERVISOR]');
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10 sm:py-16 w-full space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition"
      >
        <ArrowLeft size={14} />
        <span>Volver al inicio</span>
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Logo / Header */}
        <div className="space-y-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Acceso Supervisor
          </h1>
          <p className="text-xs text-slate-400">
            Ingreso al Panel de Control de Mantenimiento y Gestión de Flota
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="supervisor@empresa.com"
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
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
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-98 disabled:opacity-50 cursor-pointer mt-2"
          >
            <span>{loading ? 'Verificando...' : 'Iniciar Sesión'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Demo Credentials Helper */}
        <div className="pt-4 border-t border-slate-800 text-center space-y-2">
          <p className="text-[11px] text-slate-400">
            ¿Probando el sistema? Autocompletar con credenciales de prueba:
          </p>
          <button
            type="button"
            onClick={handleFillDemo}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer"
          >
            supervisor@tpm.com / [REDACTADO_PASS_SUPERVISOR]
          </button>
        </div>
      </div>
    </div>
  );
}
