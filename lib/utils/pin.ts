/**
 * Reglas del PIN de operador.
 *
 * El PIN se guarda como contraseña de Supabase Auth, cuyo mínimo por defecto
 * es de 6 caracteres. Por eso exigimos 6 a 8 dígitos numéricos.
 */
export const PIN_MIN = 6;
export const PIN_MAX = 8;

/** Devuelve un mensaje de error si el PIN no es válido, o null si está bien. */
export function validarPin(pin: unknown): string | null {
  const value = typeof pin === 'string' ? pin.trim() : '';
  if (!value) return 'Ingresá un PIN';
  if (!/^\d+$/.test(value)) return 'El PIN solo puede tener números';
  if (value.length < PIN_MIN || value.length > PIN_MAX) {
    return `El PIN debe tener entre ${PIN_MIN} y ${PIN_MAX} dígitos`;
  }
  return null;
}

/** Legajo: letras, números o guiones, hasta 20 caracteres. */
export function validarLegajo(legajo: unknown): string | null {
  const value = typeof legajo === 'string' ? legajo.trim() : '';
  if (!value) return 'El legajo es obligatorio';
  if (!/^[A-Za-z0-9-]{1,20}$/.test(value)) {
    return 'El legajo solo puede tener letras, números o guiones (máx. 20)';
  }
  return null;
}

/** Email interno de Supabase Auth para un operador. */
export function emailOperador(legajo: string): string {
  return `op_${legajo.trim().replace(/^LEG-?/i, '')}@tpmplanta.com`;
}
