import { createClient } from '../supabase/client';
import { Perfil } from '../types/tpm';
import { getTodayDateString, isAuthDateToday } from '../utils/auth-helpers';

export interface OperatorQRPayload {
  legajo: string;
  token: string;
}

/**
 * Guarda la fecha del login actual en una cookie y en localStorage para la política de sesión diaria.
 */
function recordLoginSessionDay() {
  if (typeof window === 'undefined') return;
  const today = getTodayDateString();
  try {
    localStorage.setItem('tpm_session_day', today);
    // Establecer cookie para que el middleware de Next.js también pueda verificar la fecha
    const isHttps = window.location.protocol === 'https:';
    document.cookie = `tpm_session_day=${today}; path=/; max-age=86400; SameSite=Lax${isHttps ? '; Secure' : ''}`;
  } catch (e) {
    console.warn('No se pudo guardar la fecha de sesión diaria:', e);
  }
}

/**
 * Limpia la fecha de sesión guardada.
 */
function clearLoginSessionDay() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('tpm_session_day');
    const isHttps = window.location.protocol === 'https:';
    document.cookie = `tpm_session_day=; path=/; max-age=0; SameSite=Lax${isHttps ? '; Secure' : ''}`;
  } catch (e) {
    console.warn('No se pudo limpiar la fecha de sesión:', e);
  }
}

/**
 * Parsea el contenido de un código QR o texto de credencial de operador.
 * Formatos soportados:
 * 1. Formato estándar: "TPM:OP:4029:<token>" o "TPM-OP:4029:<token>"
 * 2. JSON: '{"type":"operador","legajo":"4029","key":"token"}'
 * 3. Legajo numérico directo: "4029" o "LEG-4029"
 */
export function parseOperatorQR(qrString: string): OperatorQRPayload {
  const clean = qrString.trim();

  // Caso 1: JSON {"legajo":"4029","token":"..."}
  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const parsed = JSON.parse(clean);
      if (parsed.legajo && (parsed.token || parsed.key)) {
        return {
          legajo: String(parsed.legajo).replace(/^LEG-?/i, ''),
          token: String(parsed.token || parsed.key),
        };
      }
    } catch {
      // Continuar a otros formatos
    }
  }

  // Caso 2: Formato estándar "TPM:OP:4029:<token-secreto>"
  if (clean.toUpperCase().startsWith('TPM:OP:') || clean.toUpperCase().startsWith('TPM-OP:')) {
    const parts = clean.split(':');
    const legajo = parts[2]?.replace(/^LEG-?/i, '') || '';
    const token = parts.slice(3).join(':') || '';
    return { legajo, token };
  }

  // Caso 3: Solo número de legajo (ej: "4029" o "LEG-4029")
  const matchLegajo = clean.match(/^(?:LEG-?)?(\d+)$/i);
  if (matchLegajo) {
    return {
      legajo: matchLegajo[1],
      token: '',
    };
  }

  return {
    legajo: '',
    token: '',
  };
}

/**
 * Inicia sesión unificado mediante credenciales (email o legajo + contraseña).
 * Si el identificador no tiene '@' y es numérico o legajo, se infiere el email "op_{legajo}@tpmplanta.com".
 */
export async function signInWithCredentials({
  identifier,
  password,
}: {
  identifier: string;
  password: string;
}): Promise<{
  success: boolean;
  user?: any;
  perfil?: Perfil;
  error?: string;
}> {
  const cleanId = identifier.trim();
  const cleanPass = password.trim();

  if (!cleanId || !cleanPass) {
    return { success: false, error: 'Ingrese usuario y contraseña' };
  }

  // Resolver email correspondiente
  let email = cleanId;
  if (!cleanId.includes('@')) {
    // Es un legajo numérico (ej: "4029" o "LEG-4029")
    const legajoOnly = cleanId.replace(/^LEG-?/i, '');
    email = `op_${legajoOnly}@tpmplanta.com`;
  } else {
    email = cleanId.toLowerCase();
  }

  const supabase = createClient();

  try {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: cleanPass,
    });

    if (authErr || !authData.user) {
      return {
        success: false,
        error: authErr?.message || 'Usuario o contraseña incorrectos',
      };
    }

    // Registrar la fecha de login del día de hoy
    recordLoginSessionDay();

    // Obtener perfil en base de datos
    const { data: perfilData } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    const perfil: Perfil = perfilData || {
      id: authData.user.id,
      nombre: authData.user.user_metadata?.nombre || cleanId,
      legajo: authData.user.user_metadata?.legajo || (cleanId.includes('@') ? null : cleanId),
      rol: authData.user.user_metadata?.rol || 'operador',
      created_at: new Date().toISOString(),
    };

    return {
      success: true,
      user: authData.user,
      perfil,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Error de conexión al autenticar',
    };
  }
}

/**
 * Inicia sesión como operador en Supabase Auth mediante el escaneo de su credencial QR.
 */
export async function signInOperatorWithQR(qrString: string): Promise<{
  success: boolean;
  user?: any;
  perfil?: Perfil;
  error?: string;
}> {
  const { legajo, token } = parseOperatorQR(qrString);
  if (!legajo) {
    return { success: false, error: 'Código QR de credencial no válido' };
  }

  if (!token) {
    return {
      success: false,
      error: `Se detectó el legajo #${legajo}. Ingrese su contraseña en la pantalla de inicio de sesión.`,
    };
  }

  return await signInWithCredentials({
    identifier: `op_${legajo}@tpmplanta.com`,
    password: token,
  });
}

/**
 * Inicia sesión para el supervisor mediante email y contraseña.
 */
export async function signInSupervisor(
  email: string,
  pass: string
): Promise<{
  success: boolean;
  user?: any;
  perfil?: Perfil;
  error?: string;
}> {
  return await signInWithCredentials({
    identifier: email,
    password: pass,
  });
}

/**
 * Obtiene el usuario y perfil actualmente autenticado en Supabase,
 * verificando además que la sesión corresponda a la fecha del día actual.
 */
export async function getCurrentSessionAndProfile(): Promise<{
  user: any | null;
  perfil: Perfil | null;
}> {
  const supabase = createClient();

  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      return { user: null, perfil: null };
    }

    // Verificar política diaria si estamos en navegador
    if (typeof window !== 'undefined') {
      const storedDay = localStorage.getItem('tpm_session_day');
      // Si hay un día registrado y es anterior a hoy, cerrar sesión automáticamente
      if (storedDay && !isAuthDateToday(storedDay)) {
        await signOutUser();
        return { user: null, perfil: null };
      }

      // Si no estaba guardado hoy pero el usuario está autenticado, registrar hoy
      if (!storedDay || !isAuthDateToday(storedDay)) {
        recordLoginSessionDay();
      }
    }

    const { data: perfilData } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    const perfil: Perfil = perfilData || {
      id: authData.user.id,
      nombre: authData.user.user_metadata?.nombre || authData.user.email || 'Usuario',
      legajo: authData.user.user_metadata?.legajo || null,
      rol: authData.user.user_metadata?.rol || 'operador',
      created_at: authData.user.created_at || new Date().toISOString(),
    };

    return { user: authData.user, perfil };
  } catch {
    return { user: null, perfil: null };
  }
}

/**
 * Cierra la sesión activa en Supabase Auth y limpia la fecha diaria.
 */
export async function signOutUser(): Promise<void> {
  const supabase = createClient();
  clearLoginSessionDay();
  await supabase.auth.signOut();
}

/**
 * Actualiza de forma segura el nombre y legajo del perfil del usuario autenticado.
 * Invoca el RPC 'actualizar_mi_perfil' con fallback protegido por RLS.
 * Garantiza que jamás se puedan modificar rol, email, contraseña ni permisos.
 */
export async function updateUserProfile({
  nombre,
  legajo,
}: {
  nombre: string;
  legajo: string;
}): Promise<{
  success: boolean;
  perfil?: Perfil;
  error?: string;
}> {
  const cleanNombre = nombre.trim();
  const cleanLegajo = legajo.trim();

  if (!cleanNombre) {
    return { success: false, error: 'El nombre y apellido son obligatorios' };
  }
  if (!cleanLegajo) {
    return { success: false, error: 'El número de legajo es obligatorio' };
  }

  const supabase = createClient();

  try {
    // 1. Intentar actualizar vía RPC seguro
    const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
      'actualizar_mi_perfil',
      {
        p_nombre: cleanNombre,
        p_legajo: cleanLegajo,
      }
    );

    if (!rpcErr && rpcData) {
      if (!rpcData.success) {
        return { success: false, error: rpcData.error || 'No se pudo actualizar el perfil' };
      }

      // Notificar a componentes en pantalla que el perfil cambió
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tpm_auth_changed'));
      }

      return {
        success: true,
        perfil: rpcData.perfil,
      };
    }

    // 2. Fallback de compatibilidad mediante RLS directo
    const { data: authUser } = await supabase.auth.getUser();
    if (!authUser?.user) {
      return { success: false, error: 'Sesión no válida o expirada' };
    }

    const { data: updatedProfile, error: updateErr } = await (supabase
      .from('perfiles') as any)
      .update({
        nombre: cleanNombre,
        legajo: cleanLegajo,
      })
      .eq('id', authUser.user.id)
      .select('*')
      .single();

    if (updateErr) {
      if (updateErr.code === '23505' || updateErr.message?.includes('unique') || updateErr.message?.includes('legajo')) {
        return { success: false, error: 'El número de legajo ya se encuentra asignado a otro empleado' };
      }
      return { success: false, error: updateErr.message || 'Error al guardar los cambios' };
    }

    // Actualizar metadata de auth para consistencia
    await supabase.auth.updateUser({
      data: {
        nombre: cleanNombre,
        legajo: cleanLegajo,
      },
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tpm_auth_changed'));
    }

    return {
      success: true,
      perfil: updatedProfile as Perfil,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Error de conexión al actualizar el perfil',
    };
  }
}

