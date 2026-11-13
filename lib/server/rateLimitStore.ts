import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit, peekRateLimit } from '../utils/rateLimit';

export interface PersistentRateLimitOptions {
  /** Máximo de eventos permitidos en la ventana. */
  max: number;
  /** Duración de la ventana en segundos. */
  windowSeconds: number;
  /**
   * true  (por defecto): registra un evento y permite mientras conteo <= max.
   * false: solo consulta; permite mientras conteo < max (no suma nada).
   */
  increment?: boolean;
}

export interface PersistentRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  /** 'db' si se usó el contador compartido; 'memory' si se cayó al respaldo local. */
  source: 'db' | 'memory';
}

const RPC_TIMEOUT_MS = 1500;
let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/**
 * Límite de intentos compartido entre todas las instancias del backend (tabla `rate_limits`).
 *
 * Si la base no responde, la migración todavía no está aplicada o falta la clave de servicio,
 * cae a un contador en memoria: el límite sigue existiendo (por instancia) y el login no se
 * cae por un problema del limitador.
 */
export async function persistentRateLimit(
  key: string,
  { max, windowSeconds, increment = true }: PersistentRateLimitOptions
): Promise<PersistentRateLimitResult> {
  const safeKey = key.slice(0, 200);
  const client = getAdminClient();

  if (client) {
    try {
      const { data, error } = await client
        .rpc('check_rate_limit', {
          p_key: safeKey,
          p_max: max,
          p_window_seconds: windowSeconds,
          p_increment: increment,
        })
        .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));

      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row && typeof row.allowed === 'boolean') {
        return {
          allowed: row.allowed,
          remaining: Number(row.remaining ?? 0),
          resetSeconds: Number(row.reset_seconds ?? windowSeconds),
          source: 'db',
        };
      }
    } catch {
      // Sin red o timeout: usar el respaldo en memoria
    }
  }

  const windowMs = windowSeconds * 1000;
  const res = increment
    ? checkRateLimit(`mem:${safeKey}`, { maxRequests: max, windowMs })
    : peekRateLimit(`mem:${safeKey}`, max, windowMs);

  return {
    allowed: res.success,
    remaining: res.remaining,
    resetSeconds: res.resetSeconds,
    source: 'memory',
  };
}
