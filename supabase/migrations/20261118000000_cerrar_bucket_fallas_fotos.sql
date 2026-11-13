-- ==============================================================================
-- MIGRACIÓN: CERRAR EL BUCKET DE FOTOS DE FALLAS
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-11-18
--
-- Problemas que corrige:
--   - Una política antigua permitía subir archivos al bucket a cualquier persona SIN sesión.
--   - Cualquier usuario con sesión podía sobrescribir fotos de otros (UPDATE sin dueño).
--   - El bucket no tenía límite de tamaño ni restricción de tipo de archivo.
--
-- Queda así:
--   - Lectura pública (las fotos se muestran en la app por su URL pública).
--   - Subida: solo usuarios con sesión, y solo a la carpeta de un autoelevador existente
--     (la app sube a "<equipo_id>/<archivo>").
--   - Reemplazo (upsert al reintentar una sincronización): solo el dueño del archivo o supervisión.
--   - Borrado: solo supervisión y mantenimiento (política existente).
--   - Solo imágenes y hasta 10 MB (la app comprime a ~2 MB como máximo).
-- ==============================================================================

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
WHERE id = 'fallas-fotos';

DROP POLICY IF EXISTS "Permitir subida publica de fotos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir lectura publica de fotos" ON storage.objects; -- duplicada de fallas_fotos_select_public
DROP POLICY IF EXISTS "fallas_fotos_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "fallas_fotos_update_authenticated" ON storage.objects;

CREATE POLICY "fallas_fotos_insert_authenticated"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fallas-fotos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM public.equipos e
      WHERE e.id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "fallas_fotos_update_owner_or_supervisor"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fallas-fotos'
    AND (owner_id = auth.uid()::text OR public.is_supervisor_or_maint())
  )
  WITH CHECK (
    bucket_id = 'fallas-fotos'
    AND (owner_id = auth.uid()::text OR public.is_supervisor_or_maint())
  );
