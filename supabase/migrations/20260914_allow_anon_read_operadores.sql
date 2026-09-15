-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD: LECTURA PÚBLICA DE OPERADORES PARA ACCESO RÁPIDO
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-09-14
-- Archivo: 20260914_allow_anon_read_operadores.sql
--
-- OBJETIVO:
-- 1. Permitir que la pantalla de inicio (sin sesión iniciada) liste los operadores
--    activos para los botones de acceso rápido táctiles.
-- 2. Restringir la visibilidad pública EXCLUSIVAMENTE a filas con rol = 'operador'.
--    Los perfiles de supervisor y mantenimiento permanecen protegidos.
-- 3. Otorgar permisos de ejecución de la función helper 'is_supervisor_or_maint'
--    para evitar que Postgres lance error 42501 al evaluar políticas RLS combinadas.
-- ==============================================================================

-- 1. Eliminar política previa si existiera con el mismo nombre para garantizar idempotencia
DROP POLICY IF EXISTS "perfiles_public_select_operadores" ON public.perfiles;

-- 2. Crear la nueva política pública para perfiles con rol 'operador'
CREATE POLICY "perfiles_public_select_operadores" ON public.perfiles
  FOR SELECT
  USING (rol = 'operador');

-- 3. Otorgar permisos de ejecución de la función helper a 'anon' y 'authenticated'
--    para evitar error 42501 (permission denied for function is_supervisor_or_maint)
GRANT EXECUTE ON FUNCTION public.is_supervisor_or_maint() TO anon, authenticated;
