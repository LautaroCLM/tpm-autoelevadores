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
      // Evitar que el destino sea la propia página de login para evitar bucles de redirección
      if (decoded === '/login' || decoded.startsWith('/login?') || decoded.startsWith('/login/')) {
        return fallback === '/login' ? '/' : fallback;
      }
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
 * Zona horaria oficial de la planta TPM Autoelevadores (Argentina, UTC-3)
 */
export const PLANT_TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Retorna la fecha actual de la planta en formato YYYY-MM-DD para la política de sesión diaria.
 * Utiliza consistentemente la zona horaria de la planta ('America/Argentina/Buenos_Aires', UTC-3)
 * tanto en cliente como en servidores en la nube (ej: Vercel en UTC) para evitar discrepancias.
 */
export function getTodayDateString(timeZone: string = PLANT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Comprueba si una fecha guardada (YYYY-MM-DD) corresponde a una sesión válida de la jornada.
 * Retorna true si:
 * 1. Coincide con la fecha de hoy en la planta.
 * 2. O si es de la fecha de ayer pero aún estamos dentro de la franja horaria del Turno Noche (antes de las 08:00 AM).
 */
export function isAuthDateToday(dateString: string | null | undefined): boolean {
  if (!dateString) return false;
  const cleanDate = dateString.trim();
  const today = getTodayDateString();

  if (cleanDate === today) {
    return true;
  }

  // Soporte de jornada de Turno Noche (22:00 a 06:00 / 08:00):
  // Si la sesión fue iniciada ayer, pero todavía no son las 08:00 AM en la planta,
  // la jornada nocturna sigue activa.
  try {
    const now = new Date();
    const formatterHour = new Intl.DateTimeFormat('en-CA', {
      timeZone: PLANT_TIMEZONE,
      hour: 'numeric',
      hour12: false,
    });
    const currentHour = parseInt(formatterHour.format(now), 10);

    if (currentHour < 8) {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: PLANT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(yesterday);

      if (cleanDate === yesterdayStr) {
        return true;
      }
    }
  } catch {
    // Si falla el formateador, mantener comportamiento estricto
  }

  return false;
}
