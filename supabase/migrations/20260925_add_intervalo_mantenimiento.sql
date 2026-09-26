-- ==============================================================================
-- MIGRACIÓN: AGREGAR INTERVALO ESTÁNDAR DE MANTENIMIENTO PREVENTIVO POR HORÓMETRO
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-09-25
-- Archivo: 20260925_add_intervalo_mantenimiento.sql
-- ==============================================================================

-- 1. Agregar columna para almacenar el intervalo estándar de service por horas (por defecto 250 hs)
ALTER TABLE public.equipos
  ADD COLUMN IF NOT EXISTS intervalo_mantenimiento_horas numeric DEFAULT 250;

-- 2. Asegurar que los equipos existentes tengan asignado el valor por defecto si estaba en NULL
UPDATE public.equipos
SET intervalo_mantenimiento_horas = 250
WHERE intervalo_mantenimiento_horas IS NULL;
