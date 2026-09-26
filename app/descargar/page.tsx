import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Download, Smartphone, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Descargar App | TPM Autoelevadores',
  description: 'Descargá la aplicación TPM Autoelevadores para gestionar inspecciones y mantenimiento de equipos.',
};

export default function DescargarAppPage() {
  const driveDownloadUrl =
    'https://drive.google.com/file/d/1ATTkMMQ21_yS_J5uoTm6-vo7YuU3Dl_j/view?usp=sharing';

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-10 w-full space-y-5 animate-fade-in">
      {/* Navegación posterior estilo técnico */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-400 hover:text-amber-400 transition"
        >
          <ArrowLeft size={14} />
          <span>Volver al inicio</span>
        </Link>
        <span className="text-[11px] font-mono text-slate-500 uppercase tracking-widest hidden sm:inline">
          DESCARGA OFICIAL • ANDROID
        </span>
      </div>

      {/* PLACA TÉCNICA PRINCIPAL DE DESCARGA */}
      <div className="bg-[#0e1420] border border-slate-800 rounded-lg overflow-hidden shadow-xl">
        {/* Cabecera Principal de Identificación */}
        <div className="p-6 sm:p-8 bg-[#0b0f17] border-b border-slate-800 flex flex-col items-center text-center space-y-4">
          {/* Logos Institucionales Centrados */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/img/logo.png"
              alt="Logo TPM Autoelevadores"
              className="h-8 sm:h-10 w-auto object-contain"
            />
            <div className="h-5 w-px bg-slate-800" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/img/cgr_logo.png"
              alt="Logo CGR"
              className="h-8 sm:h-10 w-auto object-contain"
            />
          </div>

          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 inline-flex items-center gap-1.5">
            <Smartphone size={12} />
            ANDROID • APK
          </span>

          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider block">
              TPM AUTOELEVADORES
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
              Aplicación TPM Autoelevadores
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto pt-1 font-medium">
              Descargá la aplicación oficial para dispositivos Android y realizá inspecciones diarias, control de horómetro y registro de mantenimiento directamente en planta.
            </p>
          </div>

          {/* Botón Principal de Descarga */}
          <div className="pt-2 w-full flex flex-col items-center space-y-2.5">
            <a
              href={driveDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-tactile min-h-[52px] w-full max-w-xs py-3.5 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-black text-xs sm:text-sm uppercase tracking-wider rounded transition flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98] cursor-pointer"
            >
              <Download size={18} className="shrink-0" />
              <span>DESCARGAR APP</span>
            </a>

            <p className="text-[11px] font-mono text-slate-400">
              La descarga se realizará desde Google Drive.
            </p>
          </div>
        </div>

        {/* Franja de Especificaciones Técnicas */}
        <div className="grid grid-cols-2 divide-x divide-slate-800 bg-slate-950/90 text-center text-xs">
          <div className="p-3.5 sm:p-4">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
              COMPATIBILIDAD
            </span>
            <p className="font-mono font-bold text-slate-200 text-xs sm:text-sm mt-0.5">
              Android 8.0 o superior
            </p>
          </div>
          <div className="p-3.5 sm:p-4">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
              SEGURIDAD
            </span>
            <p className="font-mono font-bold text-emerald-400 text-xs sm:text-sm mt-0.5 flex items-center justify-center gap-1">
              <ShieldCheck size={13} />
              <span>Verificado</span>
            </p>
          </div>
        </div>

        {/* Guía Rápida de Instalación */}
        <div className="p-4 sm:p-6 border-t border-slate-800 bg-[#0e1420] space-y-3 text-xs text-slate-400">
          <div className="flex items-center gap-2 font-mono font-bold text-slate-300 uppercase tracking-wider text-[11px]">
            <Smartphone size={14} className="text-amber-400" />
            <span>Pasos para instalar en tu teléfono</span>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-slate-300 font-mono text-[11px] leading-relaxed">
            <li>
              Tocá el botón <strong className="text-white">DESCARGAR APP</strong> para abrir el enlace en Google Drive.
            </li>
            <li>
              Descargá el archivo <code className="text-amber-400 font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">APK</code> en tu dispositivo.
            </li>
            <li>
              Abrí el archivo e instalalo. Si tu sistema lo solicita, autorizá la instalación de aplicaciones desde tu navegador.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
