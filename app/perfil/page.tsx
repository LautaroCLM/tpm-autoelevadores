'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentSessionAndProfile, updateUserProfile, signOutUser } from '../../lib/api/auth';
import { Perfil } from '../../lib/types/tpm';
import {
  User,
  ArrowLeft,
  Mail,
  Lock,
  BadgeCheck,
  Edit3,
  Check,
  X,
  ShieldCheck,
  QrCode,
  LogOut,
  Hash,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';

export default function MiPerfilPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Modo edición
  const [isEditing, setIsEditing] = useState(false);
  const [formNombre, setFormNombre] = useState('');
  const [formLegajo, setFormLegajo] = useState('');
  const [saving, setSaving] = useState(false);

  // QR Credencial
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const { user, perfil: curPerfil } = await getCurrentSessionAndProfile();
        if (!user || !curPerfil) {
          router.replace('/login?redirect=/perfil');
          return;
        }

        setPerfil(curPerfil);
        setUserEmail(user.email || '');
        setFormNombre(curPerfil.nombre || '');
        setFormLegajo(curPerfil.legajo || '');

        // Generar QR para credencial del operario si tiene legajo
        if (curPerfil.legajo) {
          const qrPayload = `TPM:OP:${curPerfil.legajo}`;
          const url = await QRCode.toDataURL(qrPayload, {
            width: 200,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
          });
          setQrDataUrl(url);
        }
      } catch (err) {
        console.error('Error cargando perfil:', err);
        toast.error('Error al cargar datos de perfil');
      } finally {
        setLoading(false);
      }
    }

    loadData();

    const handleAuthChange = () => loadData();
    window.addEventListener('tpm_auth_changed', handleAuthChange);
    return () => window.removeEventListener('tpm_auth_changed', handleAuthChange);
  }, [router]);

  const handleStartEdit = () => {
    if (!perfil) return;
    setFormNombre(perfil.nombre || '');
    setFormLegajo(perfil.legajo || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (!perfil) return;
    setFormNombre(perfil.nombre || '');
    setFormLegajo(perfil.legajo || '');
    setIsEditing(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanNombre = formNombre.trim();
    const cleanLegajo = formLegajo.trim();

    // 1. Validaciones requeridas
    if (!cleanNombre) {
      toast.error('El nombre y apellido son obligatorios');
      return;
    }

    if (!cleanLegajo) {
      toast.error('El número de legajo es obligatorio');
      return;
    }

    // Verificar si hubo cambios
    if (cleanNombre === perfil?.nombre && cleanLegajo === perfil?.legajo) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await updateUserProfile({
        nombre: cleanNombre,
        legajo: cleanLegajo,
      });

      if (res.success && res.perfil) {
        setPerfil(res.perfil);
        setFormNombre(res.perfil.nombre);
        setFormLegajo(res.perfil.legajo || '');
        setIsEditing(false);

        // Regenerar QR con nuevo legajo
        if (res.perfil.legajo) {
          const qrPayload = `TPM:OP:${res.perfil.legajo}`;
          const url = await QRCode.toDataURL(qrPayload, {
            width: 200,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
          });
          setQrDataUrl(url);
        }

        toast.success('¡Perfil actualizado con éxito!');
      } else {
        toast.error(res.error || 'Error al actualizar el perfil');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error de conexión al guardar cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyId = () => {
    if (!perfil?.id) return;
    navigator.clipboard.writeText(perfil.id);
    setCopiedId(true);
    toast.success('ID de usuario copiado al portapapeles');
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSignOut = async () => {
    await signOutUser();
    toast.info('Sesión finalizada');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tpm_auth_changed'));
      window.location.href = '/';
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-3">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-mono text-slate-400 uppercase tracking-wider">
          Cargando ficha de perfil de operario...
        </p>
      </div>
    );
  }

  if (!perfil) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 w-full space-y-6">
      {/* Botón Volver */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-400 hover:text-white transition"
      >
        <ArrowLeft size={14} className="text-amber-500" />
        <span>Volver a la consola principal</span>
      </Link>

      {/* Tarjeta Principal de Perfil */}
      <div className="bg-[#111724] border border-slate-800/90 rounded-2xl shadow-xl shadow-black/40 overflow-hidden">
        {/* Cabecera Técnica */}
        <div className="p-5 sm:p-6 border-b border-slate-800/90 bg-[#0E1420] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-xl bg-[#0B0F17] border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
              <User size={28} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 mb-1">
                <BadgeCheck size={12} />
                <span>Identificación de Planta</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Mi Perfil
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Credencial técnica y datos de operador
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span
              className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase tracking-wider border ${
                perfil.rol === 'supervisor' || perfil.rol === 'mantenimiento'
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
              }`}
            >
              Rol: {perfil.rol}
            </span>

            <button
              onClick={handleSignOut}
              title="Cerrar sesión"
              className="p-2 text-slate-400 hover:text-rose-400 bg-[#0B0F17] hover:bg-rose-950/40 rounded-xl transition border border-slate-800 hover:border-rose-500/40 cursor-pointer btn-tactile"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Formulario / Datos */}
        <form onSubmit={handleSaveProfile} className="p-5 sm:p-6 space-y-5">
          {/* Alerta Informativa */}
          <div className="p-3 rounded-xl bg-[#0B0F17] border border-slate-800/90 flex items-start gap-2.5 text-xs text-slate-400">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed font-medium">
              Puedes actualizar tu <strong>Nombre</strong> y <strong>Legajo</strong>. Tu correo electrónico y rol de permisos son administrados por la supervisión de planta.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Campo 1: Nombre y Apellido (EDITABLE) */}
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Nombre y Apellido *
              </label>
              {isEditing ? (
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    className="w-full px-3.5 py-3 bg-[#0B0F17] border border-amber-500/60 rounded-xl text-sm text-white focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition font-medium"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="px-3.5 py-3 bg-[#0B0F17] border border-slate-800/90 rounded-xl text-sm text-white font-bold flex items-center justify-between">
                  <span>{perfil.nombre}</span>
                  <span className="text-[10px] font-mono text-emerald-400 uppercase">Verificado</span>
                </div>
              )}
            </div>

            {/* Campo 2: Legajo (EDITABLE) */}
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <span>N° de Legajo *</span>
                <span className="text-[10px] text-slate-500">Único de planta</span>
              </label>
              {isEditing ? (
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formLegajo}
                    onChange={(e) => setFormLegajo(e.target.value)}
                    placeholder="Ej: 4029"
                    className="w-full px-3.5 py-3 bg-[#0B0F17] border border-amber-500/60 rounded-xl text-sm text-amber-400 font-mono font-tabular font-bold focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
                  />
                </div>
              ) : (
                <div className="px-3.5 py-3 bg-[#0B0F17] border border-slate-800/90 rounded-xl text-sm font-mono font-tabular font-bold text-amber-400 flex items-center gap-2">
                  <Hash size={14} className="text-slate-500" />
                  <span>{perfil.legajo || 'Sin asignar'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            {/* Campo 3: Correo Electrónico (SOLO LECTURA) */}
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
                <span>Correo / Identificador</span>
                <span className="text-[10px] text-slate-600 flex items-center gap-1 font-mono">
                  <Lock size={10} /> Solo lectura
                </span>
              </label>
              <div className="px-3.5 py-3 bg-[#0B0F17]/60 border border-slate-800/60 rounded-xl text-xs sm:text-sm text-slate-400 font-mono flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <Mail size={14} className="text-slate-600 shrink-0" />
                  <span className="truncate">{userEmail || 'No disponible'}</span>
                </div>
                <Lock size={13} className="text-slate-600 shrink-0 ml-1.5" />
              </div>
            </div>

            {/* Campo 4: Rol / Permisos (SOLO LECTURA) */}
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
                <span>Nivel de Acceso / Permisos</span>
                <span className="text-[10px] text-slate-600 flex items-center gap-1 font-mono">
                  <Lock size={10} /> Solo lectura
                </span>
              </label>
              <div className="px-3.5 py-3 bg-[#0B0F17]/60 border border-slate-800/60 rounded-xl text-xs sm:text-sm text-slate-400 flex items-center justify-between">
                <div className="flex items-center gap-2 capitalize font-medium">
                  <ShieldCheck size={14} className="text-slate-600 shrink-0" />
                  <span>{perfil.rol === 'operador' ? 'Operador de Autoelevadores' : perfil.rol}</span>
                </div>
                <Lock size={13} className="text-slate-600 shrink-0 ml-1.5" />
              </div>
            </div>
          </div>

          {/* ID Interno de Sesión (SOLO LECTURA) */}
          <div className="pt-2">
            <div className="p-3 rounded-xl bg-[#0B0F17]/40 border border-slate-800/60 flex items-center justify-between gap-3 text-xs">
              <div className="truncate">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                  Identificador Único (UID)
                </span>
                <span className="font-mono text-slate-400 truncate text-[11px] block mt-0.5">
                  {perfil.id}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyId}
                className="btn-tactile px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 font-mono text-[11px] rounded-lg border border-slate-800 flex items-center gap-1 shrink-0 cursor-pointer"
                title="Copiar UID"
              >
                <Copy size={12} className={copiedId ? 'text-emerald-400' : 'text-slate-400'} />
                <span>{copiedId ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* Botonera de Acciones */}
          <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center gap-2.5">
            {isEditing ? (
              <>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-tactile w-full sm:flex-1 py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                >
                  <Check size={16} />
                  <span>{saving ? 'Guardando cambios...' : 'Guardar cambios'}</span>
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={handleCancelEdit}
                  className="btn-tactile w-full sm:w-auto py-3.5 px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 border border-slate-700 cursor-pointer"
                >
                  <X size={15} />
                  <span>Cancelar</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleStartEdit}
                className="btn-tactile w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer"
              >
                <Edit3 size={16} />
                <span>Editar perfil</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Tarjeta de Credencial QR de Operador */}
      {perfil.legajo && (
        <div className="bg-[#111724] border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <QrCode size={16} className="text-amber-400" />
              Credencial QR de Acceso Diario
            </h3>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              Legajo #{perfil.legajo}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 bg-[#0B0F17] p-4 rounded-xl border border-slate-800/80">
            {qrDataUrl && (
              <div className="w-24 h-24 bg-white p-1.5 rounded-xl flex items-center justify-center shrink-0 shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR Operador" className="w-full h-full" />
              </div>
            )}
            <div className="space-y-1 text-center sm:text-left">
              <p className="font-bold text-white text-sm">
                {perfil.nombre}
              </p>
              <p className="text-xs text-amber-400 font-mono">
                Código: TPM:OP:{perfil.legajo}
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Este código permite al escáner de la consola principal identificarte instantáneamente antes de iniciar una inspección.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
