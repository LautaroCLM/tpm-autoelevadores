-- ==============================================================================
-- MIGRACIÓN: BAJA LÓGICA (SOFT DELETE) DE AUTOELEVADORES E ÍNDICES PARCIALES
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-09-28
-- Archivo: 20260928000000_soft_delete_equipos.sql
-- ==============================================================================

-- 1. AGREGAR COLUMNA deleted_at A public.equipos (CONSERVA 100% DE LOS DATOS INTACTOS)
ALTER TABLE public.equipos
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. REEMPLAZAR CONSTRAINTS UNIQUE GLOBALES POR ÍNDICES UNIQUE PARCIALES CONDICIONALES
-- Permite reutilizar 'interno' y 'qr_codigo' únicamente cuando el equipo anterior tiene deleted_at IS NOT NULL.
ALTER TABLE public.equipos DROP CONSTRAINT IF EXISTS equipos_interno_key;
ALTER TABLE public.equipos DROP CONSTRAINT IF EXISTS equipos_qr_codigo_key;
DROP INDEX IF EXISTS public.equipos_interno_key;
DROP INDEX IF EXISTS public.equipos_qr_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipos_interno_activo
  ON public.equipos (interno)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipos_qr_activo
  ON public.equipos (qr_codigo)
  WHERE deleted_at IS NULL;

-- 3. TRIGGER EN POSTGRESQL PARA IMPEDIR MODIFICACIONES DE 'interno' O 'qr_codigo' EN BACKEND/REST
CREATE OR REPLACE FUNCTION public.prevent_equipo_code_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.interno != NEW.interno OR OLD.qr_codigo != NEW.qr_codigo THEN
    RAISE EXCEPTION 'CODIGO_INMUTABLE: No está permitido modificar el número de interno ni el código QR de un autoelevador existente.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_equipo_code_immutable ON public.equipos;
CREATE TRIGGER check_equipo_code_immutable
  BEFORE UPDATE ON public.equipos
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_equipo_code_change();

-- 4. ACTUALIZAR POLÍTICA RLS DE LECTURA DE EQUIPOS
-- Operadores/anónimos ven solo equipos activos (deleted_at IS NULL). Supervisores ven todos (activos y dados de baja).
DROP POLICY IF EXISTS "equipos_public_select" ON public.equipos;
DROP POLICY IF EXISTS "equipos_select" ON public.equipos;

CREATE POLICY "equipos_public_select"
  ON public.equipos
  FOR SELECT
  USING (
    deleted_at IS NULL OR public.is_supervisor_or_maint()
  );

-- 5. ACTUALIZAR RPC registrar_inspeccion_completa (RECHAZO DE INSPECCIONES EN EQUIPOS DADOS DE BAJA)
CREATE OR REPLACE FUNCTION public.registrar_inspeccion_completa(
  p_payload jsonb
) RETURNS jsonb AS $$
DECLARE
  v_caller_id uuid;
  v_client_generated_id uuid;
  v_existing_id uuid;
  v_existing_operador_id uuid;
  v_equipo_id uuid;
  v_template_id uuid;
  v_horometro numeric;
  v_equipo_horometro_actual numeric;
  v_equipo_deleted_at timestamptz;
  v_iniciado_en timestamptz;
  v_finalizado_en timestamptz;
  v_estado_resultante text;
  v_inspeccion_id uuid;

  -- Variables de validación de completitud
  v_required_count int;
  v_missing_count int;
  v_invalid_items_count int;
  v_duplicate_items_count int;

  -- Variables para iteración de respuestas y fallas
  v_resp jsonb;
  v_resp_id uuid;
  v_item_id uuid;
  v_item_tipo text;
  v_falla jsonb;
  v_gravedad text;
BEGIN
  -- ----------------------------------------------------------------------------
  -- A. AUTENTICACIÓN Y SEGURIDAD
  -- ----------------------------------------------------------------------------
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debe iniciar sesión para registrar una inspección.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ----------------------------------------------------------------------------
  -- B. VALIDACIÓN DE ESTRUCTURA BÁSICA DE p_payload
  -- ----------------------------------------------------------------------------
  IF p_payload IS NULL OR jsonb_typeof(p_payload) != 'object' THEN
    RAISE EXCEPTION 'PAYLOAD_INVALIDO: El payload debe ser un objeto JSON válido.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ----------------------------------------------------------------------------
  -- C. IDEMPOTENCIA Y PROTECCIÓN MULTIUSUARIO (CLIENT_GENERATED_ID)
  -- ----------------------------------------------------------------------------
  IF NOT (p_payload ? 'client_generated_id') 
     OR (p_payload->>'client_generated_id') IS NULL 
     OR trim(p_payload->>'client_generated_id') = '' THEN
    RAISE EXCEPTION 'CLIENT_GENERATED_ID_REQUERIDO: Toda inspección debe incluir un identificador de idempotencia client_generated_id.'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_client_generated_id := (p_payload->>'client_generated_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CLIENT_GENERATED_ID_INVALIDO: El identificador de idempotencia (%) no es un UUID válido.', (p_payload->>'client_generated_id')
      USING ERRCODE = 'check_violation';
  END;

  -- Buscar inspección preexistente por client_generated_id
  SELECT id, operador_id INTO v_existing_id, v_existing_operador_id
  FROM public.inspecciones
  WHERE client_generated_id = v_client_generated_id;

  IF v_existing_id IS NOT NULL THEN
    -- Validar que la inspección pertenezca estrictamente al usuario autenticado
    IF v_existing_operador_id = v_caller_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'inspeccion_id', v_existing_id,
        'idempotent', true,
        'message', 'Inspección previamente registrada.'
      );
    ELSE
      -- Conflicto: el UUID pertenece a otro operador. Bloquear cross-user retrieval.
      RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: El identificador de la inspección ya pertenece a otro usuario.'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  -- ----------------------------------------------------------------------------
  -- D. EXTRACCIÓN Y VALIDACIÓN DE PARÁMETROS BÁSICOS
  -- ----------------------------------------------------------------------------
  -- 1. Validar equipo_id
  IF NOT (p_payload ? 'equipo_id') OR (p_payload->>'equipo_id') IS NULL THEN
    RAISE EXCEPTION 'EQUIPO_REQUERIDO: Debe especificar el equipo_id.'
      USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    v_equipo_id := (p_payload->>'equipo_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'EQUIPO_ID_INVALIDO: El equipo_id especificado no es un UUID válido.'
      USING ERRCODE = 'check_violation';
  END;

  -- 2. Validar template_id
  IF NOT (p_payload ? 'template_id') OR (p_payload->>'template_id') IS NULL THEN
    RAISE EXCEPTION 'TEMPLATE_REQUERIDO: Debe especificar el template_id.'
      USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    v_template_id := (p_payload->>'template_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'TEMPLATE_ID_INVALIDO: El template_id especificado no es un UUID válido.'
      USING ERRCODE = 'check_violation';
  END;

  -- 3. Validar horometro
  IF NOT (p_payload ? 'horometro') OR (p_payload->>'horometro') IS NULL THEN
    RAISE EXCEPTION 'HOROMETRO_REQUERIDO: Debe ingresar el horómetro del equipo.'
      USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    v_horometro := (p_payload->>'horometro')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'HOROMETRO_INVALIDO: El horómetro debe ser un valor numérico válido.'
      USING ERRCODE = 'check_violation';
  END;

  IF v_horometro < 0 THEN
    RAISE EXCEPTION 'HOROMETRO_INVALIDO: El horómetro no puede ser negativo.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. Validar fechas
  BEGIN
    v_iniciado_en := coalesce((p_payload->>'iniciado_en')::timestamptz, now());
  EXCEPTION WHEN OTHERS THEN
    v_iniciado_en := now();
  END;

  BEGIN
    v_finalizado_en := coalesce((p_payload->>'finalizado_en')::timestamptz, now());
  EXCEPTION WHEN OTHERS THEN
    v_finalizado_en := now();
  END;

  -- 5. Validar estado_resultante
  v_estado_resultante := p_payload->>'estado_resultante';
  IF v_estado_resultante NOT IN ('operativo', 'observado', 'fuera_de_servicio') THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO: El estado resultante (%) no es válido.', v_estado_resultante
      USING ERRCODE = 'check_violation';
  END IF;

  -- 6. Validar existencia del equipo, estado de baja y horómetro no decreciente
  SELECT horometro_actual, deleted_at INTO v_equipo_horometro_actual, v_equipo_deleted_at
  FROM public.equipos
  WHERE id = v_equipo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EQUIPO_NO_ENCONTRADO: El autoelevador especificado no existe.'
      USING ERRCODE = 'data_exception';
  END IF;

  IF v_equipo_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'EQUIPO_DADO_DE_BAJA: El autoelevador fue dado de baja administrativa antes de finalizar esta inspección.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_horometro < coalesce(v_equipo_horometro_actual, 0) THEN
    RAISE EXCEPTION 'HOROMETRO_INVALIDO: El horómetro ingresado (%) no puede ser inferior al actual (%).',
      v_horometro, v_equipo_horometro_actual
      USING ERRCODE = 'check_violation';
  END IF;

  -- 7. Validar existencia de la plantilla
  IF NOT EXISTS (SELECT 1 FROM public.checklist_templates WHERE id = v_template_id) THEN
    RAISE EXCEPTION 'TEMPLATE_NO_ENCONTRADO: La plantilla de checklist no existe.'
      USING ERRCODE = 'data_exception';
  END IF;

  -- ----------------------------------------------------------------------------
  -- E. VALIDACIÓN DE RESPUESTAS Y COMPLETITUD DEL CHECKLIST
  -- ----------------------------------------------------------------------------
  IF NOT (p_payload ? 'respuestas') 
     OR p_payload->'respuestas' IS NULL 
     OR jsonb_typeof(p_payload->'respuestas') != 'array' THEN
    RAISE EXCEPTION 'RESPUESTAS_REQUERIDAS: El payload debe incluir un array de respuestas.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 1. Verificar si hay ítems ajenos a la plantilla
  SELECT count(*) INTO v_invalid_items_count
  FROM jsonb_array_elements(p_payload->'respuestas') r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.checklist_items ci
    WHERE ci.id = (r->>'item_id')::uuid
      AND ci.template_id = v_template_id
  );

  IF v_invalid_items_count > 0 THEN
    RAISE EXCEPTION 'ITEMS_INVALIDOS: El payload contiene % respuesta(s) con ítems ajenos a esta plantilla.',
      v_invalid_items_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Verificar duplicados de ítem en el payload
  SELECT count(*) INTO v_duplicate_items_count
  FROM (
    SELECT (r->>'item_id')::uuid AS item_id, count(*) AS cnt
    FROM jsonb_array_elements(p_payload->'respuestas') r
    GROUP BY (r->>'item_id')::uuid
    HAVING count(*) > 1
  ) dups;

  IF v_duplicate_items_count > 0 THEN
    RAISE EXCEPTION 'ITEMS_DUPLICADOS: El payload contiene respuestas duplicadas para un mismo ítem.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. Verificar que no falte responder ningún ítem de la plantilla activa
  SELECT count(*) INTO v_required_count
  FROM public.checklist_items
  WHERE template_id = v_template_id;

  SELECT count(*) INTO v_missing_count
  FROM public.checklist_items ci
  WHERE ci.template_id = v_template_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payload->'respuestas') r
      WHERE (r->>'item_id')::uuid = ci.id
    );

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'CHECKLIST_INCOMPLETO: Faltan responder % ítem(s) de los % requeridos en la plantilla.',
      v_missing_count, v_required_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- ----------------------------------------------------------------------------
  -- F. PASO 1: INSERTAR CABECERA DE INSPECCIÓN (CON MANEJO DE CONCURRENCIA SEGURO)
  -- ----------------------------------------------------------------------------
  BEGIN
    INSERT INTO public.inspecciones (
      client_generated_id,
      equipo_id,
      operador_id,
      template_id,
      horometro,
      iniciado_en,
      finalizado_en,
      estado_resultante
    ) VALUES (
      v_client_generated_id,
      v_equipo_id,
      v_caller_id, -- SIEMPRE el usuario autenticado real
      v_template_id,
      v_horometro,
      v_iniciado_en,
      v_finalizado_en,
      v_estado_resultante
    ) RETURNING id INTO v_inspeccion_id;
  EXCEPTION WHEN unique_violation THEN
    -- Condición de carrera: otra petición simultánea con el mismo client_generated_id
    SELECT id, operador_id INTO v_existing_id, v_existing_operador_id
    FROM public.inspecciones
    WHERE client_generated_id = v_client_generated_id;

    IF v_existing_id IS NOT NULL THEN
      IF v_existing_operador_id = v_caller_id THEN
        RETURN jsonb_build_object(
          'success', true,
          'inspeccion_id', v_existing_id,
          'idempotent', true,
          'message', 'Inspección registrada concurrentemente.'
        );
      ELSE
        RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: El identificador de la inspección ya pertenece a otro usuario.'
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
    RAISE;
  END;

  -- ----------------------------------------------------------------------------
  -- G. PASO 2: INSERTAR TODAS LAS RESPUESTAS Y SUS FALLAS ASOCIADAS
  -- ----------------------------------------------------------------------------
  FOR v_resp IN SELECT * FROM jsonb_array_elements(p_payload->'respuestas')
  LOOP
    IF jsonb_typeof(v_resp) != 'object' THEN
      RAISE EXCEPTION 'RESPUESTA_INVALIDA: Cada elemento de respuestas debe ser un objeto JSON.'
        USING ERRCODE = 'check_violation';
    END IF;

    v_item_id := (v_resp->>'item_id')::uuid;

    -- Consultar tipo de dato del ítem
    SELECT tipo_dato INTO v_item_tipo
    FROM public.checklist_items
    WHERE id = v_item_id;

    -- Validación estricta según el tipo_dato
    IF v_item_tipo = 'booleano' THEN
      IF (v_resp->>'valor_bool') IS NULL THEN
        RAISE EXCEPTION 'VALOR_INVALIDO: El ítem booleano % requiere un valor booleano (true/false).', v_item_id
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_resp->>'valor_bool') NOT IN ('true', 'false', 't', 'f') THEN
        RAISE EXCEPTION 'VALOR_INVALIDO: El valor booleano del ítem % no es válido.', v_item_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_item_tipo = 'numero' THEN
      IF (v_resp->>'valor_numero') IS NOT NULL THEN
        BEGIN
          PERFORM (v_resp->>'valor_numero')::numeric;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'VALOR_INVALIDO: El ítem % requiere un valor numérico válido.', v_item_id
            USING ERRCODE = 'check_violation';
        END;
      END IF;
    ELSIF v_item_tipo = 'texto' THEN
      -- valor_texto puede ser cadena o null
      NULL;
    END IF;

    -- Inserción de la respuesta
    INSERT INTO public.respuestas_item (
      inspeccion_id,
      item_id,
      valor_bool,
      valor_numero,
      valor_texto,
      es_falla
    ) VALUES (
      v_inspeccion_id,
      v_item_id,
      (v_resp->>'valor_bool')::boolean,
      CASE WHEN (v_resp->>'valor_numero') IS NOT NULL AND (v_resp->>'valor_numero') ~ '^-?[0-9]+(\.[0-9]+)?$' 
           THEN (v_resp->>'valor_numero')::numeric ELSE NULL END,
      v_resp->>'valor_texto',
      coalesce((v_resp->>'es_falla')::boolean, false)
    ) RETURNING id INTO v_resp_id;

    -- Si se registró como falla, insertar en la tabla fallas
    IF (v_resp->>'es_falla')::boolean = true THEN
      IF NOT (v_resp ? 'falla') OR v_resp->'falla' IS NULL THEN
        RAISE EXCEPTION 'FALLA_SIN_DETALLE: El ítem % está marcado como falla pero no incluye el objeto de detalle.', v_item_id
          USING ERRCODE = 'check_violation';
      END IF;

      v_falla := v_resp->'falla';
      v_gravedad := v_falla->>'gravedad';

      IF v_gravedad NOT IN ('leve', 'media', 'critica') THEN
        RAISE EXCEPTION 'GRAVEDAD_INVALIDA: La gravedad de la falla (%) no es válida.', v_gravedad
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.fallas (
        respuesta_id,
        equipo_id,
        gravedad,
        descripcion,
        foto_url,
        detectado_por,
        estado_reparacion
      ) VALUES (
        v_resp_id,
        v_equipo_id,
        v_gravedad,
        v_falla->>'descripcion',
        v_falla->>'foto_url',
        v_caller_id,
        'pendiente'
      );
    END IF;
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- H. PASO 3: ACTUALIZAR EL EQUIPO (HORÓMETRO Y ESTADO) DE FORMA ATÓMICA
  -- ----------------------------------------------------------------------------
  UPDATE public.equipos
  SET
    horometro_actual = greatest(coalesce(horometro_actual, 0), v_horometro),
    estado = v_estado_resultante
  WHERE id = v_equipo_id;

  -- ----------------------------------------------------------------------------
  -- I. CONFIRMACIÓN Y RETORNO
  -- ----------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'inspeccion_id', v_inspeccion_id,
    'idempotent', false
  );

EXCEPTION WHEN OTHERS THEN
  -- Rollback automático de toda la transacción
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- PERMISOS DE EJECUCIÓN Y PROPIETARIO PARA RPC
REVOKE EXECUTE ON FUNCTION public.registrar_inspeccion_completa(jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.registrar_inspeccion_completa(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_inspeccion_completa(jsonb) TO authenticated;
ALTER FUNCTION public.registrar_inspeccion_completa(jsonb) OWNER TO postgres;
