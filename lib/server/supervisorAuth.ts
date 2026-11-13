import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupervisorAuthResult =
  | {
      ok: true;
      user: { id: string; email?: string };
      perfil: { id: string; nombre: string; rol: string };
      supabaseAdmin: SupabaseClient;
    }
  | { ok: false; error: string; status: number };

/** Lee las variables de entorno del servidor necesarias para operaciones administrativas. */
export function getServerSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

export function createAdminClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Valida que la petición venga de un usuario autenticado con rol 'supervisor' o 'mantenimiento'.
 * El rol se lee de public.perfiles (nunca de user_metadata, que el usuario puede modificar).
 */
export async function verifySupervisorAuth(req: Request): Promise<SupervisorAuthResult> {
  const env = getServerSupabaseEnv();
  if (!env) return { ok: false, error: 'Configuración de servidor incompleta', status: 500 };

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return { ok: false, error: 'Cabecera Authorization requerida', status: 401 };

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, error: 'Token de sesión no proporcionado', status: 401 };

  const userClient = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();

  if (userErr || !user) return { ok: false, error: 'Sesión no válida o expirada', status: 401 };

  const supabaseAdmin = createAdminClient(env.url, env.serviceKey);
  const { data: perfil, error: perfilErr } = await supabaseAdmin
    .from('perfiles')
    .select('id, nombre, rol')
    .eq('id', user.id)
    .maybeSingle();

  if (perfilErr || !perfil) return { ok: false, error: 'Perfil de usuario no encontrado', status: 403 };

  if (perfil.rol !== 'supervisor' && perfil.rol !== 'mantenimiento') {
    return {
      ok: false,
      error: 'Acceso denegado: se requieren permisos de supervisor o mantenimiento',
      status: 403,
    };
  }

  return { ok: true, user, perfil, supabaseAdmin };
}
