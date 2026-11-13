-- ==============================================================================
-- MIGRACIÓN: EL LEGAJO SOLO LO MODIFICA LA SUPERVISIÓN
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-11-13
--
-- PROBLEMA:
--   Cualquier operador podía cambiar su propio legajo desde /perfil. El ingreso por
--   legajo + PIN y por tarjeta QR busca al operador por legajo, así que cambiarlo
--   dejaba al operador sin poder entrar (y desalineaba tarjetas impresas).
--
-- SOLUCIÓN:
--   1. RLS: un usuario sin rol supervisor/mantenimiento no puede alterar su legajo.
--   2. RPC actualizar_mi_perfil: rechaza el cambio de legajo para operadores.
--   Supervisores y mantenimiento conservan la política "perfiles_admin".
-- ==============================================================================

-- 1. Política de actualización propia: rol y legajo inmutables para operadores
DROP POLICY IF EXISTS "perfiles_update_own" ON public.perfiles;

CREATE POLICY "perfiles_update_own" ON public.perfiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND rol = (SELECT p.rol FROM public.perfiles p WHERE p.id = auth.uid())
    AND (
      public.is_supervisor_or_maint()
      OR legajo IS NOT DISTINCT FROM (SELECT p.legajo FROM public.perfiles p WHERE p.id = auth.uid())
    )
  );

-- 2. RPC: mismo contrato que antes, pero el operador solo puede cambiar su nombre
CREATE OR REPLACE FUNCTION public.actualizar_mi_perfil(
  p_nombre text,
  p_legajo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_clean_nombre text;
  v_clean_legajo text;
  v_rol_actual text;
  v_legajo_actual text;
  v_res record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sesión no válida o usuario no autenticado');
  END IF;

  v_clean_nombre := trim(p_nombre);
  v_clean_legajo := trim(p_legajo);

  IF v_clean_nombre IS NULL OR v_clean_nombre = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El nombre y apellido son obligatorios');
  END IF;

  IF v_clean_legajo IS NULL OR v_clean_legajo = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El número de legajo es obligatorio');
  END IF;

  SELECT rol, legajo INTO v_rol_actual, v_legajo_actual
  FROM public.perfiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró el perfil del usuario');
  END IF;

  -- Operadores: el legajo es su identificador de acceso y no se puede cambiar
  IF v_rol_actual NOT IN ('supervisor', 'mantenimiento')
     AND v_clean_legajo IS DISTINCT FROM v_legajo_actual THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El legajo solo lo puede modificar la supervisión de planta'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE legajo = v_clean_legajo AND id != v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El número de legajo ya se encuentra asignado a otro empleado');
  END IF;

  UPDATE public.perfiles
  SET nombre = v_clean_nombre,
      legajo = v_clean_legajo
  WHERE id = v_user_id
  RETURNING * INTO v_res;

  UPDATE auth.users
  SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
      jsonb_build_object('nombre', v_clean_nombre, 'legajo', v_clean_legajo)
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'perfil', jsonb_build_object(
      'id', v_res.id,
      'nombre', v_res.nombre,
      'legajo', v_res.legajo,
      'rol', v_res.rol,
      'created_at', v_res.created_at
    )
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'El número de legajo ya está registrado en el sistema');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_mi_perfil(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.actualizar_mi_perfil(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_perfil(text, text) TO authenticated;
