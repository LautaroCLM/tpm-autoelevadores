/**
 * Utilidades de ayuda para autenticación, redirecciones seguras y parseo de códigos QR.
 */

/**
 * Sanitiza una URL de redirección para evitar ataques de Open Redirect.
 * Solo permite rutas internas que comiencen con '/' y descarta protocolos externos o dobles barras.
 */
export function sanitizeRedirectUrl(
  url: string | null | undefined,
  fallback: string = '/'
): string {
  if (!url) return fallback;

  try {
    const decoded = decodeURIComponent(url).trim();

    // Debe comenzar con exactamente un '/' y no '//' ni '/\' ni contener protocolo
    if (
      decoded.startsWith('/') &&
      !decoded.startsWith('//') &&
      !decoded.startsWith('/\\') &&
      !decoded.includes('://')
    ) {
      return decoded;
    }
  } catch {
    // Si falla el decodeURIComponent, retornar fallback
  }

  return fallback;
}

/**
 * Extrae el código identificador del autoelevador a partir de:
 * 1. Una URL completa (ej: "https://miapp.com/equipo/AE-01" -> "AE-01")
 * 2. Un path relativo (ej: "/equipo/AE-01" -> "AE-01")
 * 3. Un código directo (ej: "AE-01" o "01" -> "AE-01" / "01")
 */
export function extractEquipoCode(rawInput: string | null | undefined): string {
  if (!rawInput) return '';

  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  // Caso 1: URL completa http:// o https://
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        return decodeURIComponent(segments[segments.length - 1]).trim().toUpperCase();
      }
    } catch {
      // Continuar a otros métodos si no es URL válida
    }
  }

  // Caso 2: Ruta estilo /equipo/AE-01 o equipo/AE-01
  if (trimmed.includes('/')) {
    const segments = trimmed.split('/').filter(Boolean);
    if (segments.length > 0) {
      return decodeURIComponent(segments[segments.length - 1]).trim().toUpperCase();
    }
  }

  return trimmed.toUpperCase();
}

/**
 * Retorna la fecha local actual en formato YYYY-MM-DD para la política de sesión diaria.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Comprueba si una fecha guardada (YYYY-MM-DD) corresponde al día de hoy.
 */
export function isAuthDateToday(dateString: string | null | undefined): boolean {
  if (!dateString) return false;
  return dateString.trim() === getTodayDateString();
}
