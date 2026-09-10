-- ==============================================================================
-- BLINDAJE RLS: public.inspecciones
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-09-10
-- ==============================================================================

-- 1. Asegurar que RLS esté activo
ALTER TABLE public.inspecciones ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar policies abiertas o previas de inspecciones de forma segura
DROP POLICY IF EXISTS "Inspecciones lectura" ON public.inspecciones;
DROP POLICY IF EXISTS "Inspecciones insercion" ON public.inspecciones;
DROP POLICY IF EXISTS "Inspecciones actualizacion" ON public.inspecciones;
DROP POLICY IF EXISTS "inspecciones_select" ON public.inspecciones;
DROP POLICY IF EXISTS "inspecciones_insert_own" ON public.inspecciones;
DROP POLICY IF EXISTS "inspecciones_update_supervisor" ON public.inspecciones;

-- 3. Policy SELECT: Solo usuarios autenticados de la planta pueden leer inspecciones
CREATE POLICY "inspecciones_select"
  ON public.inspecciones
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'authenticated');

-- 4. Policy INSERT (REGLA CRÍTICA): Solo usuarios autenticados y con su propio UID
CREATE POLICY "inspecciones_insert_own"
  ON public.inspecciones
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = operador_id);

-- 5. Policy UPDATE: Solo supervisores o personal de mantenimiento pueden editar inspecciones
CREATE POLICY "inspecciones_update_supervisor"
  ON public.inspecciones
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles
      WHERE id = auth.uid() AND rol IN ('supervisor', 'mantenimiento')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles
      WHERE id = auth.uid() AND rol IN ('supervisor', 'mantenimiento')
    )
  );
