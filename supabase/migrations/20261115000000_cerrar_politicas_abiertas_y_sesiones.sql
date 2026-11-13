-- ==============================================================================
-- MIGRACIÓN: CERRAR POLÍTICAS ABIERTAS DE EQUIPOS Y PERMITIR CERRAR SESIONES DE UN USUARIO
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-11-15
--
-- 1. La política inicial "Equipos visibles para usuarios autenticados" tiene
--    USING ((auth.role() = 'authenticated') OR true), es decir, abierta a todos,
--    y anulaba el filtro de baja lógica de "equipos_public_select": cualquiera con la
--    clave anónima veía también los equipos dados de baja. Se elimina.
--    Queda vigente equipos_public_select: activos para todos, todos para supervisión.
--
-- 2. cerrar_sesiones_usuario(uuid): borra las sesiones de Auth de un usuario. Lo usa el
--    backend al revocar una tarjeta QR o cambiar un PIN. La llamada anterior
--    (auth.admin.signOut(<id de usuario>)) no funcionaba: esa API espera un JWT.
--    Solo service_role puede ejecutarla.
-- ==============================================================================

DROP POLICY IF EXISTS "Equipos visibles para usuarios autenticados" ON public.equipos;
DROP POLICY IF EXISTS "Equipos select" ON public.equipos;
DROP POLICY IF EXISTS "Equipos update" ON public.equipos;

CREATE OR REPLACE FUNCTION public.cerrar_sesiones_usuario(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_borradas integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USUARIO_REQUERIDO' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Los refresh tokens se eliminan en cascada con la sesión
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  -- Por si quedaran tokens sueltos de versiones antiguas de GoTrue
  DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;

  RETURN v_borradas;
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_sesiones_usuario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_sesiones_usuario(uuid) TO service_role;
