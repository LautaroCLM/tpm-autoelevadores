import { createClient } from '../supabase/client';
import { Perfil } from '../types/tpm';

export interface OperatorQRPayload {
  legajo: string;
  token: string;
}

/**
 * Parsea el contenido de un código QR de credencial de operador.
 * Formatos soportados:
 * 1. "TPM:OP:4029:op4029pass" o "TPM:OP:LEG-4029:token"
 * 2. JSON: '{"type":"operador","legajo":"4029","key":"op4029pass"}'
 * 3. Legajo directo: "4029" o "LEG-4029" (usa clave predeterminada)
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

  return {
    legajo: '',
    token: '',
  };
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

  const email = `op_${legajo}@tpmplanta.com`;
  const supabase = createClient();

  try {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: token,
    });

    if (authErr || !authData.user) {
      return {
        success: false,
        error: `No se pudo autenticar al operador (Legajo: ${legajo}). Verifique la credencial.`,
      };
    }

    // Obtener perfil de usuario
    const { data: perfilData } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    const perfil: Perfil = perfilData || {
      id: authData.user.id,
      nombre: authData.user.user_metadata?.nombre || `Operador Legajo ${legajo}`,
      legajo,
      rol: 'operador',
      created_at: new Date().toISOString(),
    };

    return {
      success: true,
      user: authData.user,
      perfil,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de conexión al autenticar' };
  }
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
  const supabase = createClient();

  try {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });

    if (authErr || !authData.user) {
      return {
        success: false,
        error: authErr?.message || 'Credenciales de supervisor incorrectas',
      };
    }

    // Verificar rol en perfiles
    const { data: perfilData } = await (supabase
      .from('perfiles') as any)
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    const castedPerfil = perfilData as Perfil | null;

    if (castedPerfil && castedPerfil.rol !== 'supervisor' && castedPerfil.rol !== 'mantenimiento') {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Este usuario no posee permisos de supervisor o mantenimiento.',
      };
    }

    const perfil: Perfil = castedPerfil || {
      id: authData.user.id,
      nombre: authData.user.user_metadata?.nombre || 'Supervisor de Planta',
      legajo: 'SUP-01',
      rol: 'supervisor',
      created_at: new Date().toISOString(),
    };

    return {
      success: true,
      user: authData.user,
      perfil,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de conexión' };
  }
}

/**
 * Obtiene el usuario y perfil actualmente autenticado en Supabase.
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
 * Cierra la sesión activa en Supabase Auth.
 */
export async function signOutUser(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}
