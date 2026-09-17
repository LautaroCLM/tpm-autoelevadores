-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD: LECTURA PÚBLICA DE EQUIPOS PARA NAVEGACIÓN Y ACCESO RÁPIDO
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-09-17
-- Archivo: 20260917_allow_anon_read_equipos.sql
--
-- OBJETIVO:
-- 1. Permitir que la pantalla principal y fichas técnicas de autoelevadores
--    puedan ser consultadas por usuarios anónimos (unauthenticated) para visualización de flota
--    y selección rápida de equipos para inicio de checklist.
-- 2. Mantener restringida la modificación, inserción y eliminación de equipos EXCLUSIVAMENTE
--    a roles 'supervisor' y 'mantenimiento'.
-- ==============================================================================

-- 1. Eliminar política de lectura previa si existiera
DROP POLICY IF EXISTS "equipos_select" ON public.equipos;
DROP POLICY IF EXISTS "equipos_public_select" ON public.equipos;

-- 2. Crear la nueva política de lectura pública (tanto anon como authenticated)
CREATE POLICY "equipos_public_select" ON public.equipos
  FOR SELECT
  USING (true);
