import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateString;
  }
}

/**
 * Convierte únicamente el texto de visualización del código QR para la UI
 * Ejemplo: AE-01 -> TPM-nivel-1, AE-02 -> TPM-nivel-2, etc.
 * No modifica el qr_codigo real almacenado en DB ni la URL de navegación.
 */
export function formatQrCodigoDisplay(qrCodigo: string | null | undefined): string {
  if (!qrCodigo) return '';
  const clean = qrCodigo.trim();
  const match = clean.match(/^(?:AE-0*|AE-|0*)?(\d+)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return `TPM-nivel-${num}`;
  }
  return clean;
}
