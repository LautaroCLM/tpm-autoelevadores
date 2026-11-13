import { getClientIp } from '../../../lib/utils/rateLimit';
import { persistentRateLimit } from '../../../lib/server/rateLimitStore';
import { jsonWithCors, preflight } from '../../../lib/server/http';
import { createAdminClient, getServerSupabaseEnv } from '../../../lib/server/supervisorAuth';

export const dynamic = 'force-dynamic';

const METHODS = 'GET, OPTIONS';

export async function OPTIONS(req: Request) {
  return preflight(req, METHODS);
}

/**
 * GET /api/operadores
 *
 * Lista pública y mínima de operadores para los botones de "Accesos Rápidos" del
 * terminal de planta (antes de iniciar sesión). Solo devuelve nombre y legajo:
 * nunca UUIDs, roles ni datos de supervisores. Con el acceso directo, elegir
 * un nombre de esta lista alcanza para entrar como operador (decisión del negocio).
 */
export async function GET(req: Request) {
  const clientIp = getClientIp(req);
  // Límite compartido entre instancias (tabla rate_limits); cae a memoria si la base no responde
  const rl = await persistentRateLimit(`operadores_list:${clientIp}`, { max: 60, windowSeconds: 60 });
  if (!rl.allowed) {
    return jsonWithCors({ error: 'Demasiadas solicitudes. Reintente en unos segundos.' }, req, METHODS, 429, {
      'Retry-After': String(rl.resetSeconds),
    });
  }

  const env = getServerSupabaseEnv();
  if (!env) {
    return jsonWithCors({ error: 'Configuración de servidor incompleta' }, req, METHODS, 500);
  }

  try {
    const supabaseAdmin = createAdminClient(env.url, env.serviceKey);
    const { data, error } = await supabaseAdmin
      .from('perfiles')
      .select('nombre, legajo')
      .eq('rol', 'operador')
      .not('legajo', 'is', null)
      .order('nombre', { ascending: true });

    if (error) {
      return jsonWithCors({ error: 'No se pudo consultar el listado de operadores' }, req, METHODS, 500);
    }

    const operadores = (data || []).map((op: { nombre: string; legajo: string | null }) => ({
      nombre: op.nombre,
      legajo: op.legajo,
    }));

    return jsonWithCors(operadores, req, METHODS, 200, {
      'Cache-Control': 'no-store',
    });
  } catch {
    return jsonWithCors({ error: 'Error interno' }, req, METHODS, 500);
  }
}
