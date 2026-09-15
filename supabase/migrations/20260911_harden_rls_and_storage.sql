-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD: ENDURECIMIENTO DEFINITIVO DE RLS Y STORAGE (OPCIÓN A)
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-09-11
-- Archivo: 20260911_harden_rls_and_storage.sql
-- 
-- OBJETIVO:
-- 1. Eliminar de forma definitiva todas las políticas permisivas residuales (using true / with check true).
-- 2. Bloquear totalmente el acceso anónimo (unauthenticated) a checklist, inspecciones y fallas.
-- 3. OPCIÓN A: Bloquear completamente el INSERT directo para operadores en inspecciones,
--    respuestas_item y fallas. Toda creación operativa se canaliza exclusivamente por la
--    función transaccional atómica 'registrar_inspeccion_completa' (SECURITY DEFINER).
-- 4. Inserción/administración directa en inspecciones, respuestas y fallas reservada
--    únicamente para roles 'supervisor' y 'mantenimiento'.
-- 5. Endurecer el bucket de storage 'fallas-fotos' (subida/modificación exclusiva para usuarios
--    autenticados, eliminación exclusiva para supervisores, manteniendo visualización pública).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNCIÓN HELPER PARA VERIFICAR ROLES (SECURITY DEFINER CON SEARCH_PATH FIJO)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_supervisor_or_maint()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE id = auth.uid() AND rol IN ('supervisor', 'mantenimiento')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ------------------------------------------------------------------------------
-- 2. ASEGURAR HABILITACIÓN DE ROW LEVEL SECURITY (RLS) EN TABLAS DE DOMINIO
-- ------------------------------------------------------------------------------
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspecciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respuestas_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fallas ENABLE ROW LEVEL SECURITY;
-- Nota: storage.objects ya tiene RLS habilitado por defecto en Supabase y pertenece
-- a supabase_storage_admin, por lo que no debe ejecutarse ALTER TABLE sobre ella.

-- ------------------------------------------------------------------------------
-- 3. TABLA: checklist_templates
-- ------------------------------------------------------------------------------
-- Eliminar políticas previas y permisivas
DROP POLICY IF EXISTS "Plantillas visibles para usuarios autenticados" ON public.checklist_templates;
DROP POLICY IF EXISTS "templates_select" ON public.checklist_templates;
DROP POLICY IF EXISTS "checklist_templates select" ON public.checklist_templates;
DROP POLICY IF EXISTS "checklist_templates_admin" ON public.checklist_templates;
DROP POLICY IF EXISTS "templates_admin" ON public.checklist_templates;

-- A. Lectura: Solo usuarios autenticados de la planta
CREATE POLICY "templates_select"
  ON public.checklist_templates
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

-- B. Gestión (Insert/Update/Delete): Exclusivo supervisores y mantenimiento
CREATE POLICY "templates_admin"
  ON public.checklist_templates
  FOR ALL
  TO authenticated
  USING (public.is_supervisor_or_maint())
  WITH CHECK (public.is_supervisor_or_maint());

-- ------------------------------------------------------------------------------
-- 4. TABLA: checklist_items
-- ------------------------------------------------------------------------------
-- Eliminar políticas previas y permisivas
DROP POLICY IF EXISTS "Items de plantilla visibles para usuarios autenticados" ON public.checklist_items;
DROP POLICY IF EXISTS "items_select" ON public.checklist_items;
DROP POLICY IF EXISTS "checklist_items select" ON public.checklist_items;
DROP POLICY IF EXISTS "checklist_items_admin" ON public.checklist_items;
DROP POLICY IF EXISTS "items_admin" ON public.checklist_items;

-- A. Lectura: Solo usuarios autenticados de la planta
CREATE POLICY "items_select"
  ON public.checklist_items
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

-- B. Gestión (Insert/Update/Delete): Exclusivo supervisores y mantenimiento
CREATE POLICY "items_admin"
  ON public.checklist_items
  FOR ALL
  TO authenticated
  USING (public.is_supervisor_or_maint())
  WITH CHECK (public.is_supervisor_or_maint());

-- ------------------------------------------------------------------------------
-- 5. TABLA: inspecciones (OPCIÓN A)
-- ------------------------------------------------------------------------------
-- Eliminar políticas previas y permisivas heredadas
DROP POLICY IF EXISTS "Inspecciones lectura" ON public.inspecciones;
DROP POLICY IF EXISTS "Inspecciones insercion" ON public.inspecciones;
DROP POLICY IF EXISTS "Inspecciones actualizacion" ON public.inspecciones;
DROP POLICY IF EXISTS "inspecciones_select" ON public.inspecciones;
DROP POLICY IF EXISTS "inspecciones_insert_own" ON public.inspecciones;
DROP POLICY IF EXISTS "inspecciones_insert_supervisor" ON public.inspecciones;
DROP POLICY IF EXISTS "inspecciones_update_supervisor" ON public.inspecciones;
DROP POLICY IF EXISTS "inspecciones_delete_supervisor" ON public.inspecciones;

-- A. Lectura: Solo usuarios autenticados (operadores y supervisores ven bitácora)
CREATE POLICY "inspecciones_select"
  ON public.inspecciones
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

-- B. Inserción directa (PostgREST): BLOQUEADA para operadores.
-- Toda creación operativa de inspecciones DEBE realizarse a través del RPC atómico
-- 'registrar_inspeccion_completa' (SECURITY DEFINER).
-- La inserción directa por REST queda restringida exclusivamente a supervisores y mantenimiento.
CREATE POLICY "inspecciones_insert_supervisor"
  ON public.inspecciones
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_supervisor_or_maint());

-- C. Modificación (Update): Exclusivo para supervisores y personal de mantenimiento
CREATE POLICY "inspecciones_update_supervisor"
  ON public.inspecciones
  FOR UPDATE
  TO authenticated
  USING (public.is_supervisor_or_maint())
  WITH CHECK (public.is_supervisor_or_maint());

-- D. Eliminación (Delete): Exclusivo para supervisores y personal de mantenimiento
CREATE POLICY "inspecciones_delete_supervisor"
  ON public.inspecciones
  FOR DELETE
  TO authenticated
  USING (public.is_supervisor_or_maint());

-- ------------------------------------------------------------------------------
-- 6. TABLA: respuestas_item (OPCIÓN A)
-- ------------------------------------------------------------------------------
-- Eliminar políticas previas y permisivas
DROP POLICY IF EXISTS "Respuestas lectura" ON public.respuestas_item;
DROP POLICY IF EXISTS "Respuestas insercion" ON public.respuestas_item;
DROP POLICY IF EXISTS "respuestas_select" ON public.respuestas_item;
DROP POLICY IF EXISTS "respuestas_insert" ON public.respuestas_item;
DROP POLICY IF EXISTS "respuestas_insert_own_inspection" ON public.respuestas_item;
DROP POLICY IF EXISTS "respuestas_insert_supervisor" ON public.respuestas_item;
DROP POLICY IF EXISTS "respuestas_update_supervisor" ON public.respuestas_item;
DROP POLICY IF EXISTS "respuestas_delete_supervisor" ON public.respuestas_item;

-- A. Lectura: Solo usuarios autenticados
CREATE POLICY "respuestas_select"
  ON public.respuestas_item
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

-- B. Inserción directa: BLOQUEADA para operadores.
-- El RPC 'registrar_inspeccion_completa' inserta las respuestas atómicamente con privilegios definer.
-- Inserción directa reservada a supervisores y mantenimiento.
CREATE POLICY "respuestas_insert_supervisor"
  ON public.respuestas_item
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_supervisor_or_maint());

-- C. Modificación (Update): Exclusivo supervisores y mantenimiento
CREATE POLICY "respuestas_update_supervisor"
  ON public.respuestas_item
  FOR UPDATE
  TO authenticated
  USING (public.is_supervisor_or_maint())
  WITH CHECK (public.is_supervisor_or_maint());

-- D. Eliminación (Delete): Exclusivo supervisores y mantenimiento
CREATE POLICY "respuestas_delete_supervisor"
  ON public.respuestas_item
  FOR DELETE
  TO authenticated
  USING (public.is_supervisor_or_maint());

-- ------------------------------------------------------------------------------
-- 7. TABLA: fallas (OPCIÓN A)
-- ------------------------------------------------------------------------------
-- Eliminar políticas previas y permisivas
DROP POLICY IF EXISTS "Fallas lectura" ON public.fallas;
DROP POLICY IF EXISTS "Fallas insercion" ON public.fallas;
DROP POLICY IF EXISTS "Fallas actualizacion" ON public.fallas;
DROP POLICY IF EXISTS "fallas_select" ON public.fallas;
DROP POLICY IF EXISTS "fallas_insert_own" ON public.fallas;
DROP POLICY IF EXISTS "fallas_insert_own_inspection" ON public.fallas;
DROP POLICY IF EXISTS "fallas_insert_supervisor" ON public.fallas;
DROP POLICY IF EXISTS "fallas_update_status" ON public.fallas;
DROP POLICY IF EXISTS "fallas_delete_supervisor" ON public.fallas;

-- A. Lectura: Solo usuarios autenticados
CREATE POLICY "fallas_select"
  ON public.fallas
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

-- B. Inserción directa: BLOQUEADA para operadores.
-- El RPC 'registrar_inspeccion_completa' crea las fallas atómicamente al procesar el checklist.
-- Inserción directa reservada a supervisores y mantenimiento.
CREATE POLICY "fallas_insert_supervisor"
  ON public.fallas
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_supervisor_or_maint());

-- C. Modificación de estado de reparación: Exclusivo supervisor y mantenimiento
CREATE POLICY "fallas_update_status"
  ON public.fallas
  FOR UPDATE
  TO authenticated
  USING (public.is_supervisor_or_maint())
  WITH CHECK (public.is_supervisor_or_maint());

-- D. Eliminación (Delete): Exclusivo supervisores y mantenimiento
CREATE POLICY "fallas_delete_supervisor"
  ON public.fallas
  FOR DELETE
  TO authenticated
  USING (public.is_supervisor_or_maint());

-- ------------------------------------------------------------------------------
-- 8. STORAGE: BUCKET 'fallas-fotos'
-- ------------------------------------------------------------------------------
-- Eliminar políticas abiertas o previas en storage.objects
DROP POLICY IF EXISTS "fallas_fotos_upload_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "fallas_fotos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "fallas_fotos_supervisor_delete" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Give public access to fallas-fotos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload fallas fotos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view fallas fotos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "fallas_fotos_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "fallas_fotos_select_public" ON storage.objects;
DROP POLICY IF EXISTS "fallas_fotos_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "fallas_fotos_delete_supervisor" ON storage.objects;

-- A. Subida (Insert): Bloquear anónimo. Solo usuarios autenticados pueden subir fotos.
CREATE POLICY "fallas_fotos_insert_authenticated"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fallas-fotos'
    AND auth.role() = 'authenticated'
  );

-- B. Actualización (Update / Upsert): Permitir a usuarios autenticados reintentar subida determinista
CREATE POLICY "fallas_fotos_update_authenticated"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fallas-fotos'
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'fallas-fotos'
    AND auth.role() = 'authenticated'
  );

-- C. Lectura pública (Select): Mantener visualización de imágenes vía URL pública
CREATE POLICY "fallas_fotos_select_public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'fallas-fotos');

-- D. Eliminación (Delete): Exclusivo supervisores y mantenimiento
CREATE POLICY "fallas_fotos_delete_supervisor"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fallas-fotos'
    AND public.is_supervisor_or_maint()
  );
