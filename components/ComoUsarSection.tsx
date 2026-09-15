import React from 'react';
import {
  QrCode,
  Camera,
  UserCheck,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';

interface StepItem {
  number: string;
  stepLabel: string;
  title: string;
  description: string;
  detail: string;
  icon: React.ElementType;
}

const PASOS: StepItem[] = [
  {
    number: '01',
    stepLabel: 'PASO 1',
    title: 'Identificá el autoelevador',
    description: 'Buscá el código QR identificado en el autoelevador que vas a utilizar.',
    detail: 'El código se encuentra en una chapa o etiqueta adhesiva visible en el chasis del equipo.',
    icon: QrCode,
  },
  {
    number: '02',
    stepLabel: 'PASO 2',
    title: 'Escaneá el código QR',
    description: "Presioná 'Abrir Cámara Escáner' y apuntá la cámara al código QR del equipo.",
    detail: 'También podés ingresar manualmente el número de interno o seleccionarlo del listado.',
    icon: Camera,
  },
  {
    number: '03',
    stepLabel: 'PASO 3',
    title: 'Iniciá sesión',
    description: 'Ingresá con tu legajo para identificarte como operador.',
    detail: 'También podés seleccionar tu nombre en la sección de acceso rápido de operadores.',
    icon: UserCheck,
  },
  {
    number: '04',
    stepLabel: 'PASO 4',
    title: 'Completá la inspección',
    description: 'Revisá cada punto del checklist antes de comenzar a operar el equipo.',
    detail: 'Respondé todos los puntos de la inspección: fluidos, frenos, luces y seguridad.',
    icon: ClipboardList,
  },
  {
    number: '05',
    stepLabel: 'PASO 5',
    title: 'Informá cualquier falla',
    description: 'Si encontrás una anomalía o falla, indicála durante la inspección y agregá una fotografía cuando corresponda.',
    detail: 'Especificá la gravedad del problema para que mantenimiento pueda priorizar la reparación.',
    icon: AlertTriangle,
  },
  {
    number: '06',
    stepLabel: 'PASO 6',
    title: 'Finalizá la inspección',
    description: 'Cuando hayas completado todos los puntos, enviá la inspección para registrar el estado del autoelevador.',
    detail: 'El estado del autoelevador y el horómetro del turno quedarán asentados en el sistema.',
    icon: CheckCircle2,
  },
];

export const ComoUsarSection: React.FC = () => {
  return (
    <section
      id="como-usar-tpm"
      aria-labelledby="como-usar-title"
      className="bg-[#111724] border border-slate-800 rounded-2xl p-5 sm:p-7 shadow-xl space-y-6"
    >
      {/* Header de la sección */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-bold uppercase tracking-wider border border-amber-500/30">
          <HelpCircle size={12} aria-hidden="true" />
          <span>Guía de Inicio Rápido</span>
        </div>
        <h2
          id="como-usar-title"
          className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white"
        >
          ¿Cómo usar TPM Autoelevadores?
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
          Seguí estos pasos para realizar correctamente la inspección diaria de tu equipo.
        </p>
      </div>

      {/* Grid de Pasos: 3 por fila en escritorio, 1 por fila en celular */}
      <ol
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 list-none p-0 m-0"
        aria-label="Pasos para realizar la inspección diaria"
      >
        {PASOS.map((paso) => {
          const Icon = paso.icon;
          return (
            <li
              key={paso.number}
              className="bg-slate-950/80 hover:bg-slate-900/90 border border-slate-800/90 hover:border-amber-500/40 rounded-xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 group shadow-xs motion-reduce:transition-none"
            >
              <div className="space-y-3">
                {/* Cabecera de la tarjeta: Icono + Número de paso */}
                <div className="flex items-center justify-between gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors shadow-inner shrink-0">
                    <Icon size={20} aria-hidden="true" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                      {paso.stepLabel}
                    </span>
                    <span className="font-mono text-base sm:text-lg font-black text-amber-400 px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800">
                      {paso.number}
                    </span>
                  </div>
                </div>

                {/* Título y descripción principal */}
                <div className="space-y-1.5">
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-tight group-hover:text-amber-300 transition-colors">
                    {paso.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                    {paso.description}
                  </p>
                </div>
              </div>

              {/* Detalle contextual */}
              <div className="pt-3 mt-3 border-t border-slate-800/80">
                <p className="text-[11px] sm:text-xs text-slate-400 leading-normal">
                  {paso.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Nota industrial de seguridad */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 sm:p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
          <ShieldCheck size={18} aria-hidden="true" />
        </div>
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-bold text-white">Seguridad Operativa:</span> La inspección diaria TPM Nivel 1 es obligatoria al inicio de cada turno. Nunca operes un equipo con fallas críticas sin autorización de mantenimiento.
        </div>
      </div>
    </section>
  );
};
