-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD: BLINDAJE DE RLS EN PERFILES Y TABLA DE TOKENS QR
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-10-26 (Fase 4 - Revisión Final)
-- Archivo: 20261026_harden_perfiles_rls.sql
--
-- OBJETIVO:
-- 1. Eliminar la política permisiva 'perfiles_public_select_operadores' que
--    exponía UUIDs de auth.users y metadatos de operarios a clientes anónimos.
-- 2. Restringir la lectura directa de la tabla 'public.perfiles' EXCLUSIVAMENTE
--    a usuarios autenticados ('authenticated').
-- 3. Restringir la función RPC 'get_operadores_selector' a 'authenticated',
--    impidiendo la enumeración anónima de operarios en internet.
-- 4. Crear la tabla 'public.operador_qr_tokens' para credenciales QR criptográficas
--    independientes de la contraseña, almacenando únicamente el HASH SHA-256.
-- 5. Crear la función 'validar_operador_qr_token' accesible solo para service_role.
-- ==============================================================================

-- 1. Eliminar política pública anónima permisiva en perfiles
DROP POLICY IF EXISTS "perfiles_public_select_operadores" ON public.perfiles;

-- 2. Asegurar que SELECT directo en public.perfiles requiera autenticación
DROP POLICY IF EXISTS "perfiles_select" ON public.perfiles;
DROP POLICY IF EXISTS "perfiles_authenticated_select" ON public.perfiles;

CREATE POLICY "perfiles_authenticated_select" ON public.perfiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Función RPC para selector de operarios (restringida a usuarios autenticados)
CREATE OR REPLACE FUNCTION public.get_operadores_selector()
RETURNS TABLE (
  nombre text,
  legajo text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT nombre, legajo
  FROM public.perfiles
  WHERE rol = 'operador'
  ORDER BY nombre ASC;
$$;

-- Restricción estricta: Jamás permitir que 'anon' enumere operarios
REVOKE ALL ON FUNCTION public.get_operadores_selector() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_operadores_selector() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_operadores_selector() TO authenticated;

-- 4. Tabla de Tokens QR de Operador (independiente de contraseñas de Auth)
CREATE TABLE IF NOT EXISTS public.operador_qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_operador_qr_tokens_lookup 
  ON public.operador_qr_tokens(operador_id, token_hash, revoked);

-- Garantizar como máximo un único token QR activo por operario
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_operador_qr_token 
  ON public.operador_qr_tokens(operador_id) WHERE (revoked = false);

ALTER TABLE public.operador_qr_tokens ENABLE ROW LEVEL SECURITY;

-- Solo supervisores o administradores autenticados pueden ver o gestionar tokens
DROP POLICY IF EXISTS "operador_qr_tokens_admin" ON public.operador_qr_tokens;
CREATE POLICY "operador_qr_tokens_admin" ON public.operador_qr_tokens
  FOR ALL
  TO authenticated
  USING (public.is_supervisor_or_maint());

-- 5. Función de validación interna de tokens QR (solo para backend vía service_role)
CREATE OR REPLACE FUNCTION public.validar_operador_qr_token(
  p_legajo text,
  p_token_hash text
)
RETURNS TABLE (
  valido boolean,
  operador_id uuid,
  nombre text,
  rol text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perfil RECORD;
  v_token RECORD;
BEGIN
  -- 1. Buscar operador por legajo
  SELECT p.id, p.nombre, p.rol
  INTO v_perfil
  FROM public.perfiles p
  WHERE p.legajo = p_legajo AND p.rol = 'operador';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- 2. Buscar token activo no revocado que coincida con el hash
  SELECT t.id
  INTO v_token
  FROM public.operador_qr_tokens t
  WHERE t.operador_id = v_perfil.id
    AND t.token_hash = p_token_hash
    AND t.revoked = false;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- 3. Registrar último uso
  UPDATE public.operador_qr_tokens
  SET last_used_at = now()
  WHERE id = v_token.id;

  RETURN QUERY SELECT true, v_perfil.id, v_perfil.nombre, v_perfil.rol;
END;
$$;

-- Permisos mínimos: solo service_role del backend puede invocar la validación
REVOKE ALL ON FUNCTION public.validar_operador_qr_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validar_operador_qr_token(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.validar_operador_qr_token(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validar_operador_qr_token(text, text) TO service_role;
