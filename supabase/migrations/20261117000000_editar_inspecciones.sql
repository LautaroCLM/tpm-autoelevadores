-- ==============================================================================
-- MIGRACIÓN: EDICIÓN DE INSPECCIONES POR EL ADMINISTRADOR + HISTORIAL DE REEDICIONES
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-11-17
--
-- Hasta ahora una inspección guardada no se podía corregir. Esta migración permite que
-- supervisión y mantenimiento la editen y deja constancia de quién, cuándo, por qué y qué
-- cambió:
--   - inspecciones_ediciones: historial de reediciones. Solo lo escribe la función de
--     edición (SECURITY DEFINER); nadie puede alterarlo desde el cliente. Solo supervisión
--     y mantenimiento lo leen.
--   - editar_inspeccion_supervisor(): única vía de edición. Valida todo, aplica los cambios
--     de forma atómica y registra el detalle antes/después.
--   - handle_inspeccion_finalizada(): ahora solo actualiza el equipo si la inspección es la
--     más reciente de ese equipo; corregir una inspección vieja ya no pisa su estado actual.
-- ==============================================================================

ALTER TABLE public.inspecciones
  ADD COLUMN IF NOT EXISTS editada_en  timestamptz,
  ADD COLUMN IF NOT EXISTS editada_por uuid;

CREATE TABLE IF NOT EXISTS public.inspecciones_ediciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspeccion_id uuid NOT NULL,
  equipo_id     uuid NOT NULL,
  editor_id     uuid,
  editor_nombre text,
  motivo        text NOT NULL,
  cambios       jsonb NOT NULL DEFAULT '[]'::jsonb,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

-- Sin FK a propósito: el historial debe sobrevivir aunque se borre la inspección o el equipo.
CREATE INDEX IF NOT EXISTS idx_inspecciones_ediciones_insp
  ON public.inspecciones_ediciones (inspeccion_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_inspecciones_ediciones_equipo
  ON public.inspecciones_ediciones (equipo_id, creado_en DESC);

ALTER TABLE public.inspecciones_ediciones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.inspecciones_ediciones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inspecciones_ediciones TO authenticated;

DROP POLICY IF EXISTS "inspecciones_ediciones_supervision_select" ON public.inspecciones_ediciones;
CREATE POLICY "inspecciones_ediciones_supervision_select"
  ON public.inspecciones_ediciones
  FOR SELECT
  TO authenticated
  USING (public.is_supervisor_or_maint());

-- ------------------------------------------------------------------------------
-- El trigger de cierre de inspección solo debe tocar el equipo si es la última inspección
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_inspeccion_finalizada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Solo al cerrar la inspección o al cambiar su estado: corregir otro dato (p. ej. el horómetro)
  -- no debe pisar un estado que el equipo ya tenga por otra vía (p. ej. reactivado por supervisión).
  IF new.finalizado_en IS NOT NULL AND new.estado_resultante IS NOT NULL
     AND (old.finalizado_en IS NULL OR old.estado_resultante IS DISTINCT FROM new.estado_resultante)
     AND NOT EXISTS (
       SELECT 1 FROM public.inspecciones o
       WHERE o.equipo_id = new.equipo_id
         AND o.id <> new.id
         AND coalesce(o.finalizado_en, o.iniciado_en) > coalesce(new.finalizado_en, new.iniciado_en)
     )
  THEN
    UPDATE public.equipos
    SET
      horometro_actual = greatest(coalesce(horometro_actual, 0), new.horometro),
      estado = new.estado_resultante
    WHERE id = new.equipo_id;
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_inspeccion_finalizada() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- Edición de una inspección
--
-- p_cambios (todas las claves son opcionales):
--   {
--     "horometro": 1250,
--     "estado_resultante": "observado",
--     "respuestas": [
--       { "item_id": "<uuid>", "valor_bool": false, "valor_numero": 3, "valor_texto": "..",
--         "es_falla": true, "falla": { "gravedad": "media", "descripcion": ".." } }
--     ]
--   }
-- Solo se tocan las respuestas incluidas; de cada una, solo las claves presentes.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.editar_inspeccion_supervisor(
  p_inspeccion_id uuid,
  p_cambios jsonb,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nombre text;
  v_insp public.inspecciones%ROWTYPE;
  v_cambios jsonb := '[]'::jsonb;
  v_motivo text := btrim(coalesce(p_motivo, ''));

  v_horo_nuevo numeric;
  v_estado_nuevo text;
  v_prev_horo numeric;
  v_next_horo numeric;
  v_momento timestamptz;
  v_es_ultima boolean;

  v_resp jsonb;
  v_item_id uuid;
  v_row public.respuestas_item%ROWTYPE;
  v_item public.checklist_items%ROWTYPE;
  v_bool_nuevo boolean;
  v_num_nuevo numeric;
  v_txt_nuevo text;
  v_falla_nueva boolean;
  v_falla jsonb;
  v_falla_row public.fallas%ROWTYPE;
  v_gravedad text;
  v_desc text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_supervisor_or_maint() THEN
    RAISE EXCEPTION 'ACCESO_DENEGADO: Solo supervisores o mantenimiento pueden editar inspecciones.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF length(v_motivo) < 3 THEN
    RAISE EXCEPTION 'MOTIVO_REQUERIDO: Indicá el motivo de la edición.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' THEN
    RAISE EXCEPTION 'PAYLOAD_INVALIDO: Los cambios deben ser un objeto JSON.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_insp FROM public.inspecciones WHERE id = p_inspeccion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSPECCION_NO_ENCONTRADA: La inspección no existe.'
      USING ERRCODE = 'data_exception';
  END IF;

  SELECT nombre INTO v_nombre FROM public.perfiles WHERE id = v_uid;

  v_horo_nuevo := v_insp.horometro;
  v_estado_nuevo := v_insp.estado_resultante;
  v_momento := coalesce(v_insp.finalizado_en, v_insp.iniciado_en);

  -- ---- Horómetro ---------------------------------------------------------------
  IF p_cambios ? 'horometro' AND (p_cambios->>'horometro') IS NOT NULL THEN
    BEGIN
      v_horo_nuevo := (p_cambios->>'horometro')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'HOROMETRO_INVALIDO: El horómetro debe ser un número.'
        USING ERRCODE = 'check_violation';
    END;
    IF v_horo_nuevo < 0 THEN
      RAISE EXCEPTION 'HOROMETRO_INVALIDO: El horómetro no puede ser negativo.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_horo_nuevo IS DISTINCT FROM v_insp.horometro THEN
      -- Debe seguir siendo coherente con la inspección anterior y la siguiente del mismo equipo
      SELECT max(o.horometro) INTO v_prev_horo
      FROM public.inspecciones o
      WHERE o.equipo_id = v_insp.equipo_id AND o.id <> v_insp.id
        AND coalesce(o.finalizado_en, o.iniciado_en) < v_momento;
      SELECT min(o.horometro) INTO v_next_horo
      FROM public.inspecciones o
      WHERE o.equipo_id = v_insp.equipo_id AND o.id <> v_insp.id
        AND coalesce(o.finalizado_en, o.iniciado_en) > v_momento;

      IF v_prev_horo IS NOT NULL AND v_horo_nuevo < v_prev_horo THEN
        RAISE EXCEPTION 'HOROMETRO_INCOHERENTE: No puede ser menor que el de la inspección anterior (%).', v_prev_horo
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_next_horo IS NOT NULL AND v_horo_nuevo > v_next_horo THEN
        RAISE EXCEPTION 'HOROMETRO_INCOHERENTE: No puede ser mayor que el de la inspección siguiente (%).', v_next_horo
          USING ERRCODE = 'check_violation';
      END IF;

      v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
        'tipo', 'cabecera', 'campo', 'horometro', 'etiqueta', 'Horómetro',
        'antes', to_jsonb(v_insp.horometro), 'despues', to_jsonb(v_horo_nuevo)
      ));
    END IF;
  END IF;

  -- ---- Estado resultante ---------------------------------------------------------
  IF p_cambios ? 'estado_resultante' AND (p_cambios->>'estado_resultante') IS NOT NULL THEN
    v_estado_nuevo := p_cambios->>'estado_resultante';
    IF v_estado_nuevo NOT IN ('operativo', 'observado', 'fuera_de_servicio') THEN
      RAISE EXCEPTION 'ESTADO_INVALIDO: El estado (%) no es válido.', v_estado_nuevo
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_estado_nuevo IS DISTINCT FROM v_insp.estado_resultante THEN
      v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
        'tipo', 'cabecera', 'campo', 'estado_resultante', 'etiqueta', 'Estado resultante',
        'antes', to_jsonb(v_insp.estado_resultante), 'despues', to_jsonb(v_estado_nuevo)
      ));
    END IF;
  END IF;

  -- ---- Respuestas ---------------------------------------------------------------
  IF p_cambios ? 'respuestas' THEN
    IF jsonb_typeof(p_cambios->'respuestas') <> 'array' THEN
      RAISE EXCEPTION 'PAYLOAD_INVALIDO: respuestas debe ser un arreglo.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    FOR v_resp IN SELECT * FROM jsonb_array_elements(p_cambios->'respuestas')
    LOOP
      IF jsonb_typeof(v_resp) <> 'object' OR NOT (v_resp ? 'item_id') THEN
        RAISE EXCEPTION 'RESPUESTA_INVALIDA: Cada respuesta debe indicar item_id.'
          USING ERRCODE = 'check_violation';
      END IF;

      BEGIN
        v_item_id := (v_resp->>'item_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'RESPUESTA_INVALIDA: item_id no es un UUID válido.'
          USING ERRCODE = 'check_violation';
      END;

      SELECT * INTO v_row FROM public.respuestas_item
      WHERE inspeccion_id = v_insp.id AND item_id = v_item_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RESPUESTA_NO_ENCONTRADA: La inspección no tiene respuesta para ese ítem.'
          USING ERRCODE = 'data_exception';
      END IF;

      SELECT * INTO v_item FROM public.checklist_items WHERE id = v_item_id;

      v_bool_nuevo := v_row.valor_bool;
      v_num_nuevo := v_row.valor_numero;
      v_txt_nuevo := v_row.valor_texto;
      v_falla_nueva := coalesce(v_row.es_falla, false);

      IF v_resp ? 'valor_bool' THEN
        IF v_item.tipo_dato = 'booleano' AND (v_resp->>'valor_bool') IS NULL THEN
          RAISE EXCEPTION 'VALOR_INVALIDO: El ítem "%" requiere sí/no.', v_item.etiqueta
            USING ERRCODE = 'check_violation';
        END IF;
        BEGIN
          v_bool_nuevo := (v_resp->>'valor_bool')::boolean;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'VALOR_INVALIDO: Valor booleano inválido en "%".', v_item.etiqueta
            USING ERRCODE = 'check_violation';
        END;
        IF v_bool_nuevo IS DISTINCT FROM v_row.valor_bool THEN
          v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
            'tipo', 'respuesta', 'item_id', v_item_id, 'seccion', v_item.seccion,
            'etiqueta', v_item.etiqueta, 'campo', 'valor_bool',
            'antes', to_jsonb(v_row.valor_bool), 'despues', to_jsonb(v_bool_nuevo)
          ));
        END IF;
      END IF;

      IF v_resp ? 'valor_numero' THEN
        IF (v_resp->>'valor_numero') IS NULL THEN
          v_num_nuevo := NULL;
        ELSE
          BEGIN
            v_num_nuevo := (v_resp->>'valor_numero')::numeric;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'VALOR_INVALIDO: "%" requiere un número.', v_item.etiqueta
              USING ERRCODE = 'check_violation';
          END;
        END IF;
        IF v_num_nuevo IS DISTINCT FROM v_row.valor_numero THEN
          v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
            'tipo', 'respuesta', 'item_id', v_item_id, 'seccion', v_item.seccion,
            'etiqueta', v_item.etiqueta, 'campo', 'valor_numero',
            'antes', to_jsonb(v_row.valor_numero), 'despues', to_jsonb(v_num_nuevo)
          ));
        END IF;
      END IF;

      IF v_resp ? 'valor_texto' THEN
        v_txt_nuevo := nullif(btrim(coalesce(v_resp->>'valor_texto', '')), '');
        IF v_txt_nuevo IS DISTINCT FROM v_row.valor_texto THEN
          v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
            'tipo', 'respuesta', 'item_id', v_item_id, 'seccion', v_item.seccion,
            'etiqueta', v_item.etiqueta, 'campo', 'valor_texto',
            'antes', to_jsonb(v_row.valor_texto), 'despues', to_jsonb(v_txt_nuevo)
          ));
        END IF;
      END IF;

      IF v_resp ? 'es_falla' AND (v_resp->>'es_falla') IS NOT NULL THEN
        v_falla_nueva := (v_resp->>'es_falla')::boolean;
      END IF;

      UPDATE public.respuestas_item
      SET valor_bool = v_bool_nuevo, valor_numero = v_num_nuevo,
          valor_texto = v_txt_nuevo, es_falla = v_falla_nueva
      WHERE id = v_row.id;

      -- ---- Falla asociada a la respuesta ----
      SELECT * INTO v_falla_row FROM public.fallas
      WHERE respuesta_id = v_row.id ORDER BY created_at DESC LIMIT 1;

      IF v_falla_nueva THEN
        v_falla := CASE WHEN v_resp ? 'falla' AND jsonb_typeof(v_resp->'falla') = 'object'
                        THEN v_resp->'falla' ELSE NULL END;

        IF v_falla_row.id IS NULL THEN
          IF v_falla IS NULL OR (v_falla->>'gravedad') NOT IN ('leve', 'media', 'critica') THEN
            RAISE EXCEPTION 'FALLA_SIN_DETALLE: "%" se marca como falla: indicá la gravedad.', v_item.etiqueta
              USING ERRCODE = 'check_violation';
          END IF;
          INSERT INTO public.fallas (respuesta_id, equipo_id, gravedad, descripcion, detectado_por, estado_reparacion)
          VALUES (v_row.id, v_insp.equipo_id, v_falla->>'gravedad', nullif(btrim(coalesce(v_falla->>'descripcion', '')), ''),
                  v_insp.operador_id, 'pendiente');
          v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
            'tipo', 'falla', 'item_id', v_item_id, 'seccion', v_item.seccion,
            'etiqueta', v_item.etiqueta, 'campo', 'falla',
            'antes', to_jsonb('Sin falla'::text),
            'despues', to_jsonb('Falla ' || (v_falla->>'gravedad'))
          ));
        ELSE
          IF v_falla_row.deleted_at IS NOT NULL THEN
            UPDATE public.fallas SET deleted_at = NULL WHERE id = v_falla_row.id;
            v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
              'tipo', 'falla', 'item_id', v_item_id, 'seccion', v_item.seccion,
              'etiqueta', v_item.etiqueta, 'campo', 'falla',
              'antes', to_jsonb('Sin falla'::text),
              'despues', to_jsonb('Falla ' || v_falla_row.gravedad)
            ));
          END IF;

          IF v_falla IS NOT NULL THEN
            v_gravedad := v_falla->>'gravedad';
            IF v_gravedad IS NOT NULL THEN
              IF v_gravedad NOT IN ('leve', 'media', 'critica') THEN
                RAISE EXCEPTION 'GRAVEDAD_INVALIDA: La gravedad (%) no es válida.', v_gravedad
                  USING ERRCODE = 'check_violation';
              END IF;
              IF v_gravedad IS DISTINCT FROM v_falla_row.gravedad THEN
                UPDATE public.fallas SET gravedad = v_gravedad WHERE id = v_falla_row.id;
                v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
                  'tipo', 'falla', 'item_id', v_item_id, 'seccion', v_item.seccion,
                  'etiqueta', v_item.etiqueta, 'campo', 'falla_gravedad',
                  'antes', to_jsonb(v_falla_row.gravedad), 'despues', to_jsonb(v_gravedad)
                ));
              END IF;
            END IF;

            IF v_falla ? 'descripcion' THEN
              v_desc := nullif(btrim(coalesce(v_falla->>'descripcion', '')), '');
              IF v_desc IS DISTINCT FROM v_falla_row.descripcion THEN
                UPDATE public.fallas SET descripcion = v_desc WHERE id = v_falla_row.id;
                v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
                  'tipo', 'falla', 'item_id', v_item_id, 'seccion', v_item.seccion,
                  'etiqueta', v_item.etiqueta, 'campo', 'falla_descripcion',
                  'antes', to_jsonb(v_falla_row.descripcion), 'despues', to_jsonb(v_desc)
                ));
              END IF;
            END IF;
          END IF;
        END IF;
      ELSE
        -- Ya no es falla: se archiva (no se borra) para conservar la trazabilidad
        IF v_falla_row.id IS NOT NULL AND v_falla_row.deleted_at IS NULL THEN
          UPDATE public.fallas SET deleted_at = now() WHERE id = v_falla_row.id;
          v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
            'tipo', 'falla', 'item_id', v_item_id, 'seccion', v_item.seccion,
            'etiqueta', v_item.etiqueta, 'campo', 'falla',
            'antes', to_jsonb('Falla ' || v_falla_row.gravedad),
            'despues', to_jsonb('Sin falla'::text)
          ));
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF jsonb_array_length(v_cambios) = 0 THEN
    RAISE EXCEPTION 'SIN_CAMBIOS: No modificaste ningún dato.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---- Cabecera + constancia de la edición ---------------------------------------
  UPDATE public.inspecciones
  SET horometro = v_horo_nuevo,
      estado_resultante = v_estado_nuevo,
      editada_en = now(),
      editada_por = v_uid
  WHERE id = v_insp.id;
  -- (el trigger handle_inspeccion_finalizada actualiza el equipo solo si es la última inspección)

  SELECT NOT EXISTS (
    SELECT 1 FROM public.inspecciones o
    WHERE o.equipo_id = v_insp.equipo_id AND o.id <> v_insp.id
      AND coalesce(o.finalizado_en, o.iniciado_en) > v_momento
  ) INTO v_es_ultima;

  -- Si se corrigió el horómetro de la última inspección y el del equipo venía de ella, se corrige también
  IF v_es_ultima AND v_horo_nuevo IS DISTINCT FROM v_insp.horometro THEN
    UPDATE public.equipos
    SET horometro_actual = v_horo_nuevo
    WHERE id = v_insp.equipo_id AND horometro_actual = v_insp.horometro;
  END IF;

  INSERT INTO public.inspecciones_ediciones (inspeccion_id, equipo_id, editor_id, editor_nombre, motivo, cambios)
  VALUES (v_insp.id, v_insp.equipo_id, v_uid, v_nombre, v_motivo, v_cambios);

  RETURN jsonb_build_object(
    'success', true,
    'inspeccion_id', v_insp.id,
    'cambios', jsonb_array_length(v_cambios),
    'actualiza_equipo', v_es_ultima
  );
END;
$$;

REVOKE ALL ON FUNCTION public.editar_inspeccion_supervisor(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_inspeccion_supervisor(uuid, jsonb, text) TO authenticated;
