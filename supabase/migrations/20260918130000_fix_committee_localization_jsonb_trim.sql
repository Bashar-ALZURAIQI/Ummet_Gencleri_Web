-- Fix committee localization sanitization of JSONB string scalars.
--
-- PostgreSQL's btrim() accepts text, not jsonb. Extract JSONB string scalars as
-- text with #>> '{}' only after jsonb_typeof(...) confirms they are strings.
-- Existing structural filtering, length limits, and authorization remain intact.

BEGIN;

CREATE OR REPLACE FUNCTION private.sanitize_committee_localization(
  p_canonical jsonb,
  p_submitted jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_canonical_value jsonb;
  v_submitted_value jsonb;
  v_sanitized jsonb;
  v_canon_items jsonb;
  v_sub_items jsonb;
  v_san_items jsonb := '[]'::jsonb;
  v_canonical_item jsonb;
  v_submitted_item jsonb;
  v_trimmed text;
  i integer;
BEGIN
  IF p_canonical IS NULL OR p_submitted IS NULL
     OR jsonb_typeof(p_canonical) <> 'object'
     OR jsonb_typeof(p_submitted) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_submitted) LOOP
    v_canonical_value := p_canonical -> v_key;
    v_submitted_value := p_submitted -> v_key;
    IF v_canonical_value IS NULL THEN
      CONTINUE;
    END IF;

    IF jsonb_typeof(v_canonical_value) = 'object' THEN
      IF jsonb_typeof(v_submitted_value) = 'object' THEN
        v_sanitized := private.sanitize_committee_localization(v_canonical_value, v_submitted_value);
        IF v_sanitized IS DISTINCT FROM NULL AND v_sanitized <> '{}'::jsonb THEN
          v_result := jsonb_set(v_result, ARRAY[v_key], v_sanitized);
        END IF;
      END IF;

    ELSIF jsonb_typeof(v_canonical_value) = 'array' THEN
      IF jsonb_typeof(v_submitted_value) = 'array' THEN
        v_canon_items := v_canonical_value;
        v_sub_items := v_submitted_value;
        v_san_items := '[]'::jsonb;
        i := 0;
        WHILE i < jsonb_array_length(v_sub_items) AND i < jsonb_array_length(v_canon_items) LOOP
          v_canonical_item := v_canon_items -> i;
          v_submitted_item := v_sub_items -> i;
          IF jsonb_typeof(v_canonical_item) = 'object' THEN
            IF jsonb_typeof(v_submitted_item) = 'object' THEN
              v_sanitized := private.sanitize_committee_localization(v_canonical_item, v_submitted_item);
              IF v_sanitized IS DISTINCT FROM NULL AND v_sanitized <> '{}'::jsonb THEN
                v_san_items := v_san_items || jsonb_build_array(v_canonical_item || v_sanitized);
              ELSE
                v_san_items := v_san_items || jsonb_build_array(v_canonical_item);
              END IF;
            ELSE
              v_san_items := v_san_items || jsonb_build_array(v_canonical_item);
            END IF;
          ELSIF jsonb_typeof(v_canonical_item) = 'string' THEN
            IF jsonb_typeof(v_submitted_item) = 'string' THEN
              v_trimmed := btrim(v_submitted_item #>> '{}');
              IF char_length(v_trimmed) > 0 AND char_length(v_trimmed) <= 5000 THEN
                v_san_items := v_san_items || jsonb_build_array(to_jsonb(v_trimmed));
              ELSE
                v_san_items := v_san_items || jsonb_build_array(v_canonical_item);
              END IF;
            ELSE
              v_san_items := v_san_items || jsonb_build_array(v_canonical_item);
            END IF;
          ELSE
            v_san_items := v_san_items || jsonb_build_array(v_canonical_item);
          END IF;
          i := i + 1;
        END LOOP;
        IF jsonb_array_length(v_san_items) > 0 THEN
          v_result := jsonb_set(v_result, ARRAY[v_key], v_san_items);
        END IF;
      END IF;

    ELSIF jsonb_typeof(v_canonical_value) = 'string' THEN
      IF jsonb_typeof(v_submitted_value) = 'string' THEN
        v_trimmed := btrim(v_submitted_value #>> '{}');
        IF char_length(v_trimmed) > 0 AND char_length(v_trimmed) <= 5000 THEN
          v_result := jsonb_set(v_result, ARRAY[v_key], to_jsonb(v_trimmed));
        END IF;
      END IF;

    ELSIF jsonb_typeof(v_canonical_value) IN ('number', 'boolean') THEN
      IF v_submitted_value = v_canonical_value THEN
        v_result := jsonb_set(v_result, ARRAY[v_key], v_submitted_value);
      END IF;
    END IF;
  END LOOP;

  RETURN v_result;
END
$function$;

COMMIT;
