-- ==============================================================================
-- MIGRACIÓN: ARCHIVADO (SOFT DELETE), ELIMINACIÓN Y COLA DE PURGA DE FALLAS Y FOTOS
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-10-09
-- Archivo: 20261009200000_fallas_soft_delete_and_purga_queue.sql
-- ==============================================================================

-- 1. AGREGAR COLUMNA deleted_at A public.fallas
ALTER TABLE public.fallas
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. ÍNDICE PARCIAL PARA FALLAS ACTIVAS
CREATE INDEX IF NOT EXISTS idx_fallas_equipo_activo
  ON public.fallas (equipo_id, estado_reparacion)
  WHERE deleted_at IS NULL;

-- 3. TABLA DE COLA PERSISTENTE DE PURGAS DE STORAGE
CREATE TABLE IF NOT EXISTS public.storage_purgas_pendientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL DEFAULT 'fallas-fotos',
  file_path text NOT NULL,
  falla_id uuid,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'completado', 'fallido')),
  intentos int NOT NULL DEFAULT 0,
  ultimo_error text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  ultimo_intento_en timestamptz,
  completado_en timestamptz
);

-- Índice único parcial para evitar duplicar la misma purga pendiente
CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_purga_activa
  ON public.storage_purgas_pendientes (bucket_id, file_path)
  WHERE estado IN ('pendiente', 'procesando');

-- Habilitar RLS en tabla de purgas
ALTER TABLE public.storage_purgas_pendientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purgas_supervisor_all" ON public.storage_purgas_pendientes;
CREATE POLICY "purgas_supervisor_all"
  ON public.storage_purgas_pendientes
  FOR ALL
  TO authenticated
  USING (public.is_supervisor_or_maint())
  WITH CHECK (public.is_supervisor_or_maint());

-- 4. ACTUALIZAR POLÍTICA RLS DE LECTURA DE FALLAS
DROP POLICY IF EXISTS "fallas_select" ON public.fallas;
CREATE POLICY "fallas_select"
  ON public.fallas
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL OR public.is_supervisor_or_maint()
  );

-- 5. FUNCIÓN AUXILIAR DE EXTRACCIÓN SEGURA DE PATH DE STORAGE
CREATE OR REPLACE FUNCTION public.extract_fallas_fotos_path(p_url text)
RETURNS text AS $$
DECLARE
  v_prefix text := '/fallas-fotos/';
  v_pos int;
BEGIN
  IF p_url IS NULL OR trim(p_url) = '' THEN
    RETURN NULL;
  END IF;
  v_pos := position(v_prefix in p_url);
  IF v_pos > 0 THEN
    RETURN substring(p_url from v_pos + length(v_prefix));
  END IF;
  RETURN p_url;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp;

-- 6. RPC: ARCHIVAR FALLA (SOFT DELETE)
CREATE OR REPLACE FUNCTION public.archivar_falla_supervisor(
  p_falla_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_caller_id uuid;
  v_existing_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_supervisor_or_maint() THEN
    RAISE EXCEPTION 'ACCESO_DENEGADO: Solo supervisores o personal de mantenimiento pueden archivar fallas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.fallas
  WHERE id = p_falla_id;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'FALLA_NO_ENCONTRADA: La falla especificada no existe.'
      USING ERRCODE = 'data_exception';
  END IF;

  UPDATE public.fallas
  SET deleted_at = now()
  WHERE id = p_falla_id;

  RETURN jsonb_build_object(
    'success', true,
    'falla_id', p_falla_id,
    'message', 'Falla archivada exitosamente.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.archivar_falla_supervisor(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.archivar_falla_supervisor(uuid) TO authenticated;

-- 7. RPC: RESTAURAR FALLA ARCHIVADA
CREATE OR REPLACE FUNCTION public.restaurar_falla_supervisor(
  p_falla_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_caller_id uuid;
  v_existing_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_supervisor_or_maint() THEN
    RAISE EXCEPTION 'ACCESO_DENEGADO: Solo supervisores o personal de mantenimiento pueden restaurar fallas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.fallas
  WHERE id = p_falla_id;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'FALLA_NO_ENCONTRADA: La falla especificada no existe.'
      USING ERRCODE = 'data_exception';
  END IF;

  UPDATE public.fallas
  SET deleted_at = NULL
  WHERE id = p_falla_id;

  RETURN jsonb_build_object(
    'success', true,
    'falla_id', p_falla_id,
    'message', 'Falla restaurada exitosamente.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.restaurar_falla_supervisor(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restaurar_falla_supervisor(uuid) TO authenticated;

-- 8. RPC: ELIMINAR FALLA DEFINITIVAMENTE CON REGISTRO PREVIO EN COLA DE PURGA
CREATE OR REPLACE FUNCTION public.eliminar_falla_definitiva_supervisor(
  p_falla_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_caller_id uuid;
  v_foto_url text;
  v_foto_path text;
  v_purga_id uuid := NULL;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_supervisor_or_maint() THEN
    RAISE EXCEPTION 'ACCESO_DENEGADO: Solo supervisores o personal de mantenimiento pueden eliminar fallas definitivamente.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT foto_url INTO v_foto_url
  FROM public.fallas
  WHERE id = p_falla_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALLA_NO_ENCONTRADA: La falla especificada no existe.'
      USING ERRCODE = 'data_exception';
  END IF;

  v_foto_path := public.extract_fallas_fotos_path(v_foto_url);

  -- Si posee foto, registrar la tarea en la cola persistente antes de borrar la fila
  IF v_foto_path IS NOT NULL AND trim(v_foto_path) != '' THEN
    INSERT INTO public.storage_purgas_pendientes (
      bucket_id,
      file_path,
      falla_id,
      estado
    ) VALUES (
      'fallas-fotos',
      v_foto_path,
      p_falla_id,
      'pendiente'
    )
    ON CONFLICT (bucket_id, file_path) WHERE estado IN ('pendiente', 'procesando')
    DO UPDATE SET falla_id = p_falla_id
    RETURNING id INTO v_purga_id;
  END IF;

  -- Borrar la fila de fallas (NO toca respuestas_item.es_falla, ni inspecciones, ni equipos)
  DELETE FROM public.fallas
  WHERE id = p_falla_id;

  RETURN jsonb_build_object(
    'success', true,
    'falla_id', p_falla_id,
    'foto_path', v_foto_path,
    'purga_id', v_purga_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.eliminar_falla_definitiva_supervisor(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_falla_definitiva_supervisor(uuid) TO authenticated;

-- 9. RPC: ACTUALIZAR ESTADO DE LA TAREA DE PURGA
CREATE OR REPLACE FUNCTION public.actualizar_estado_purga_foto(
  p_purga_id uuid,
  p_estado text,
  p_error text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_supervisor_or_maint() THEN
    RAISE EXCEPTION 'ACCESO_DENEGADO: Permiso denegado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_estado NOT IN ('pendiente', 'procesando', 'completado', 'fallido') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO: El estado (%) no es válido.', p_estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.storage_purgas_pendientes
  SET
    intentos = intentos + 1,
    ultimo_intento_en = now(),
    ultimo_error = left(p_error, 500),
    estado = p_estado,
    completado_en = CASE WHEN p_estado = 'completado' THEN now() ELSE completado_en END
  WHERE id = p_purga_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.actualizar_estado_purga_foto(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_purga_foto(uuid, text, text) TO authenticated;

-- 10. RPC: OBTENER PURGAS PENDIENTES DE REINTENTO
CREATE OR REPLACE FUNCTION public.obtener_purgas_pendientes_supervisor()
RETURNS SETOF public.storage_purgas_pendientes AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_supervisor_or_maint() THEN
    RAISE EXCEPTION 'ACCESO_DENEGADO: Permiso denegado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT * FROM public.storage_purgas_pendientes
  WHERE estado IN ('pendiente', 'fallido')
    AND intentos < 5
  ORDER BY creado_en ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.obtener_purgas_pendientes_supervisor() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.obtener_purgas_pendientes_supervisor() TO authenticated;
