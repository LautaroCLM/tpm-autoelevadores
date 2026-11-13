-- ==============================================================================
-- MIGRACIÓN: LÍMITE DE INTENTOS PERSISTENTE (RATE LIMIT COMPARTIDO ENTRE INSTANCIAS)
-- Proyecto: TPM Autoelevadores
-- Fecha: 2026-11-14
--
-- PROBLEMA:
--   El limitador de intentos vivía en memoria. En Vercel (serverless) cada instancia
--   tiene su propio contador y se reinicia en cada arranque en frío, así que el límite
--   del login no era fiable.
--
-- SOLUCIÓN:
--   Contador en Postgres, accesible solo con service_role (backend). Sin políticas RLS
--   para anon ni authenticated: nadie más puede leerlo ni escribirlo.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key       text PRIMARY KEY CHECK (char_length(key) <= 200),
  count     integer NOT NULL DEFAULT 0,
  reset_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON public.rate_limits (reset_at);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM PUBLIC, anon, authenticated;

-- p_increment = true : registra un evento y devuelve allowed = (conteo <= p_max)
-- p_increment = false: solo consulta y devuelve allowed = (conteo <  p_max)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer,
  p_increment boolean DEFAULT true
)
RETURNS TABLE (allowed boolean, remaining integer, reset_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.rate_limits%ROWTYPE;
BEGIN
  IF p_key IS NULL OR char_length(p_key) = 0 OR char_length(p_key) > 200
     OR p_max < 1 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'PARAMETROS_INVALIDOS' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Limpieza oportunista de registros vencidos hace más de una hora
  IF random() < 0.02 THEN
    DELETE FROM public.rate_limits WHERE reset_at < v_now - interval '1 hour';
  END IF;

  IF p_increment THEN
    INSERT INTO public.rate_limits AS r (key, count, reset_at)
    VALUES (p_key, 1, v_now + make_interval(secs => p_window_seconds))
    ON CONFLICT (key) DO UPDATE SET
      count    = CASE WHEN r.reset_at <= v_now THEN 1 ELSE r.count + 1 END,
      reset_at = CASE WHEN r.reset_at <= v_now
                      THEN v_now + make_interval(secs => p_window_seconds)
                      ELSE r.reset_at END
    RETURNING * INTO v_row;

    RETURN QUERY SELECT
      v_row.count <= p_max,
      GREATEST(p_max - v_row.count, 0),
      GREATEST(CEIL(EXTRACT(EPOCH FROM (v_row.reset_at - v_now)))::integer, 0);
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.rate_limits WHERE key = p_key;

  IF NOT FOUND OR v_row.reset_at <= v_now THEN
    RETURN QUERY SELECT true, p_max, p_window_seconds;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_row.count < p_max,
    GREATEST(p_max - v_row.count, 0),
    GREATEST(CEIL(EXTRACT(EPOCH FROM (v_row.reset_at - v_now)))::integer, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer, boolean) TO service_role;
