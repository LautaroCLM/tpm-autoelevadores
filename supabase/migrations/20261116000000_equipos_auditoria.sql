-- ==============================================================================
-- MIGRACIÓN: HISTORIAL DE CAMBIOS DE AUTOELEVADORES (AUDITORÍA)
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-11-16
--
-- Registra quién modificó qué y cuándo en public.equipos. Lo hace un trigger en la base,
-- así ningún cliente puede saltearlo ni alterar el historial:
--   - La tabla no tiene políticas de escritura: solo el trigger (SECURITY DEFINER) inserta.
--   - Solo supervisión y mantenimiento pueden leerla.
--
-- Qué se registra:
--   - Alta de equipos, ediciones, bajas y reactivaciones hechas por supervisión.
--   - Cambios de estado provocados por una inspección de un operador (p. ej. pasar a
--     "fuera de servicio"). Los cambios de horómetro de las inspecciones NO se registran:
--     ya constan en la tabla de inspecciones y llenarían el historial de ruido.
--   - Cambios hechos sin sesión de usuario (SQL directo / service_role): acción "sistema".
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.equipos_auditoria (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id      uuid NOT NULL,
  interno        text,
  accion         text NOT NULL
                 CHECK (accion IN ('alta', 'edicion', 'baja', 'reactivacion', 'estado_inspeccion', 'sistema')),
  usuario_id     uuid,
  usuario_nombre text,
  cambios        jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

-- Sin FK a equipos a propósito: el historial debe sobrevivir aunque se borre el equipo.
CREATE INDEX IF NOT EXISTS idx_equipos_auditoria_equipo
  ON public.equipos_auditoria (equipo_id, creado_en DESC);

ALTER TABLE public.equipos_auditoria ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.equipos_auditoria FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.equipos_auditoria TO authenticated;

DROP POLICY IF EXISTS "equipos_auditoria_supervision_select" ON public.equipos_auditoria;
CREATE POLICY "equipos_auditoria_supervision_select"
  ON public.equipos_auditoria
  FOR SELECT
  TO authenticated
  USING (public.is_supervisor_or_maint());

-- ------------------------------------------------------------------------------
-- Trigger de auditoría
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auditar_equipos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nombre text;
  v_es_supervision boolean;
  v_campos text[] := ARRAY[
    'interno', 'qr_codigo', 'marca', 'modelo', 'combustible', 'estado',
    'horometro_actual', 'horometro_proximo_mantenimiento',
    'intervalo_mantenimiento_horas', 'deleted_at'
  ];
  v_campo text;
  v_old jsonb;
  v_new jsonb;
  v_cambios jsonb := '{}'::jsonb;
  v_accion text;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT nombre INTO v_nombre FROM public.perfiles WHERE id = v_uid;
    v_es_supervision := public.is_supervisor_or_maint();
  ELSE
    -- Sin sesión de usuario (service_role o SQL directo): se registra todo
    v_es_supervision := true;
  END IF;

  IF TG_OP = 'INSERT' THEN
    FOREACH v_campo IN ARRAY v_campos LOOP
      v_new := to_jsonb(NEW) -> v_campo;
      IF v_new IS NOT NULL AND v_new <> 'null'::jsonb THEN
        v_cambios := v_cambios || jsonb_build_object(
          v_campo, jsonb_build_object('antes', NULL, 'despues', v_new)
        );
      END IF;
    END LOOP;

    INSERT INTO public.equipos_auditoria (equipo_id, interno, accion, usuario_id, usuario_nombre, cambios)
    VALUES (NEW.id, NEW.interno, CASE WHEN v_uid IS NULL THEN 'sistema' ELSE 'alta' END, v_uid, v_nombre, v_cambios);

    RETURN NEW;
  END IF;

  -- UPDATE
  FOREACH v_campo IN ARRAY v_campos LOOP
    v_old := to_jsonb(OLD) -> v_campo;
    v_new := to_jsonb(NEW) -> v_campo;

    IF v_old IS DISTINCT FROM v_new THEN
      -- Un operador solo toca el equipo a través de una inspección: de eso solo importa el estado
      IF v_es_supervision OR v_campo = 'estado' THEN
        v_cambios := v_cambios || jsonb_build_object(
          v_campo, jsonb_build_object('antes', v_old, 'despues', v_new)
        );
      END IF;
    END IF;
  END LOOP;

  IF v_cambios = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_accion := 'baja';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_accion := 'reactivacion';
  ELSIF NOT v_es_supervision THEN
    v_accion := 'estado_inspeccion';
  ELSIF v_uid IS NULL THEN
    v_accion := 'sistema';
  ELSE
    v_accion := 'edicion';
  END IF;

  INSERT INTO public.equipos_auditoria (equipo_id, interno, accion, usuario_id, usuario_nombre, cambios)
  VALUES (NEW.id, NEW.interno, v_accion, v_uid, v_nombre, v_cambios);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_equipos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auditar_equipos ON public.equipos;
CREATE TRIGGER trg_auditar_equipos
  AFTER INSERT OR UPDATE ON public.equipos
  FOR EACH ROW
  EXECUTE FUNCTION public.auditar_equipos();
