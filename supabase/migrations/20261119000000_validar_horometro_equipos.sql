-- ==============================================================================
-- MIGRACIÓN: VALIDAR EL HORÓMETRO AL EDITAR UN AUTOELEVADOR
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-11-19
--
-- Hasta ahora un supervisor podía dejar el horómetro de un equipo en cualquier valor
-- (negativo, o por debajo de lo ya registrado en inspecciones), lo que rompe el cálculo del
-- próximo service y el historial. Esta regla se aplica en la base, así ningún cliente puede saltearla:
--   - El horómetro no puede ser negativo.
--   - Con sesión de usuario, no puede quedar por debajo del mayor horómetro ya registrado en
--     inspecciones de ese equipo. Si hay un error de carga, se corrige primero la inspección
--     (Dashboard > Historial > Editar), que ajusta el equipo de forma coherente.
-- Los cambios sin sesión de usuario (service_role / SQL directo) no se restringen.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.validar_horometro_equipo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_insp numeric;
BEGIN
  IF NEW.horometro_actual IS NOT DISTINCT FROM OLD.horometro_actual THEN
    RETURN NEW;
  END IF;

  IF NEW.horometro_actual IS NULL OR NEW.horometro_actual < 0 THEN
    RAISE EXCEPTION 'HOROMETRO_INVALIDO: El horómetro no puede ser negativo ni vacío.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NOT NULL AND NEW.horometro_actual < coalesce(OLD.horometro_actual, 0) THEN
    SELECT max(horometro) INTO v_max_insp FROM public.inspecciones WHERE equipo_id = NEW.id;
    IF v_max_insp IS NOT NULL AND NEW.horometro_actual < v_max_insp THEN
      RAISE EXCEPTION 'HOROMETRO_INCOHERENTE: No puede ser menor que el último horómetro registrado en inspecciones (% hs). Si hubo un error de carga, corregí primero esa inspección.', v_max_insp
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_horometro_equipo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validar_horometro_equipo ON public.equipos;
CREATE TRIGGER trg_validar_horometro_equipo
  BEFORE UPDATE OF horometro_actual ON public.equipos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_horometro_equipo();
