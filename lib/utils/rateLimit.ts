/**
 * lib/utils/rateLimit.ts
 * Limitador de tasa (Rate Limiter) en memoria para endpoints sensibles de autenticación.
 * Aplica ventana deslizante basada en IP de cliente o identificador de dispositivo.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Limpieza periódica de registros vencidos cada 5 minutos
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function purgeExpiredRecords() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, record] of rateLimitStore.entries()) {
    if (record.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Evalúa si una clave/IP ha excedido el límite de solicitudes permitidas.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  purgeExpiredRecords();

  const maxRequests = options.maxRequests ?? 5;
  const windowMs = options.windowMs ?? 60 * 1000; // 1 minuto por defecto
  const now = Date.now();

  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      resetSeconds: Math.ceil(windowMs / 1000),
    };
  }

  if (existing.count >= maxRequests) {
    const remainingMs = Math.max(0, existing.resetAt - now);
    return {
      success: false,
      limit: maxRequests,
      remaining: 0,
      resetSeconds: Math.ceil(remainingMs / 1000),
    };
  }

  existing.count += 1;
  const remainingMs = Math.max(0, existing.resetAt - now);
  return {
    success: true,
    limit: maxRequests,
    remaining: maxRequests - existing.count,
    resetSeconds: Math.ceil(remainingMs / 1000),
  };
}

/**
 * Consulta sin registrar un nuevo evento: ¿ya se alcanzó el máximo en la ventana vigente?
 * Devuelve success=false cuando el conteo actual es >= maxRequests.
 */
export function peekRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests,
      resetSeconds: Math.ceil(windowMs / 1000),
    };
  }

  return {
    success: existing.count < maxRequests,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - existing.count),
    resetSeconds: Math.ceil(Math.max(0, existing.resetAt - now) / 1000),
  };
}

/**
 * Extrae la IP de origen confiable de la solicitud HTTP.
 */
export function getClientIp(req: Request): string {
  // 1. Cabeceras verificadas por el proxy Edge (Vercel / Cloudflare) resistentes a spoofing
  const vercelIp = req.headers.get('x-vercel-ip') || req.headers.get('x-real-ip');
  if (vercelIp) return vercelIp.trim();

  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();

  // 2. Fallback x-forwarded-for
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  return '127.0.0.1';
}

/**
 * Registro de seguridad sanitizado (Auditoría).
 * NUNCA registra contraseñas, tokens ni datos sensibles.
 */
export function logSecurityEvent(event: {
  action: string;
  ip: string;
  identifier?: string;
  outcome: 'ALLOWED' | 'RATE_LIMITED' | 'REJECTED' | 'UNAUTHORIZED';
  reason?: string;
}) {
  const timestamp = new Date().toISOString();
  // Máscara simple de IP para privacidad
  const maskedIp = event.ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.***.***');
  const safeIdentifier = event.identifier ? event.identifier.slice(0, 10) : 'none';

  console.warn(
    `[SECURITY_AUDIT] ${timestamp} | Action: ${event.action} | IP: ${maskedIp} | Target: ${safeIdentifier} | Outcome: ${event.outcome}${
      event.reason ? ` | Reason: ${event.reason}` : ''
    }`
  );
}
