-- ==============================================================================
-- MIGRACIÓN: ACTUALIZACIÓN SEGURA DE PERFIL DE EMPLEADO (RPC + RLS)
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-09-10
-- ==============================================================================

-- 1. POLÍTICA RLS PARA PERMITIR A CADA EMPLEADO EDITAR ÚNICAMENTE SU PROPIO REGISTRO
-- Bloquea explícitamente cualquier intento de alterar el 'rol' (escalada de privilegios)
DROP POLICY IF EXISTS "perfiles_update_own" ON public.perfiles;

CREATE POLICY "perfiles_update_own" ON public.perfiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND rol = (SELECT p.rol FROM public.perfiles p WHERE p.id = auth.uid())
  );

-- 2. FUNCIÓN RPC SEGURA PARA ACTUALIZAR NOMBRE Y LEGAJO
-- Se ejecuta con SECURITY DEFINER para actualizar auth.users metadata y perfiles de forma atómica
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
  v_res record;
BEGIN
  -- 1. Identificar usuario desde la sesión activa de Supabase
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sesión no válida o usuario no autenticado');
  END IF;

  -- 2. Sanitizar datos
  v_clean_nombre := trim(p_nombre);
  v_clean_legajo := trim(p_legajo);

  -- 3. Validar obligatoriedad
  IF v_clean_nombre IS NULL OR v_clean_nombre = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El nombre y apellido son obligatorios');
  END IF;

  IF v_clean_legajo IS NULL OR v_clean_legajo = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'El número de legajo es obligatorio');
  END IF;

  -- 4. Validar unicidad de legajo (evitar duplicados entre operarios)
  IF EXISTS (
    SELECT 1 FROM public.perfiles 
    WHERE legajo = v_clean_legajo AND id != v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El número de legajo ya se encuentra asignado a otro empleado');
  END IF;

  -- 5. Actualizar en public.perfiles (SÓLO nombre y legajo, NUNCA rol ni email)
  UPDATE public.perfiles
  SET nombre = v_clean_nombre,
      legajo = v_clean_legajo
  WHERE id = v_user_id
  RETURNING * INTO v_res;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró el perfil del usuario');
  END IF;

  -- 6. Sincronizar metadata en auth.users para mantener la sesión consistente
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

-- Permitir ejecución a cualquier usuario autenticado
GRANT EXECUTE ON FUNCTION public.actualizar_mi_perfil(text, text) TO authenticated;
