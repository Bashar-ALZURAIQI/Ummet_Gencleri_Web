-- Behavioral regression for JSONB string handling in committee localization.
-- The sanitizer is immutable; this transaction performs no persistent writes.
BEGIN;

DO $committee_localization_jsonb_trim$
DECLARE
  v_result jsonb;
  v_wrong_types jsonb;
BEGIN
  v_result := private.sanitize_committee_localization(
    jsonb_build_object(
      'id', 'vice-presidency',
      'vision', 'Arabic vision',
      'goals', 'Arabic goals',
      'nested', jsonb_build_object('label', 'Arabic label'),
      'labels', jsonb_build_array('Arabic item'),
      'count', 3,
      'enabled', true
    ),
    jsonb_build_object(
      'id', 'vice-presidency',
      'vision', '  Test Türkçe Vizyon 456  ',
      'goals', '  Test Türkçe Hedef 456  ',
      'nested', jsonb_build_object('label', '  Türkçe etiket  '),
      'labels', jsonb_build_array('  Türkçe öğe  '),
      'count', 3,
      'enabled', true,
      'unknown', 'must be dropped'
    )
  );

  IF v_result ->> 'vision' <> 'Test Türkçe Vizyon 456' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_VISION_NOT_SANITIZED: %', v_result;
  END IF;
  IF v_result ->> 'goals' <> 'Test Türkçe Hedef 456' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_GOALS_NOT_SANITIZED: %', v_result;
  END IF;
  IF v_result #>> '{nested,label}' <> 'Türkçe etiket' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_NESTED_STRING_NOT_SANITIZED: %', v_result;
  END IF;
  IF v_result #>> '{labels,0}' <> 'Türkçe öğe' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_ARRAY_STRING_NOT_SANITIZED: %', v_result;
  END IF;
  IF jsonb_typeof(v_result -> 'nested') <> 'object'
     OR jsonb_typeof(v_result -> 'labels') <> 'array'
     OR jsonb_typeof(v_result -> 'count') <> 'number'
     OR jsonb_typeof(v_result -> 'enabled') <> 'boolean' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_STRUCTURE_CHANGED: %', v_result;
  END IF;
  IF v_result ? 'unknown' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_UNKNOWN_KEY_SURVIVED: %', v_result;
  END IF;

  v_wrong_types := private.sanitize_committee_localization(
    jsonb_build_object(
      'vision', 'Arabic vision',
      'nested', jsonb_build_object('label', 'Arabic label'),
      'labels', jsonb_build_array('Arabic item'),
      'count', 3,
      'enabled', true
    ),
    jsonb_build_object(
      'vision', jsonb_build_object('not', 'a string'),
      'nested', 'not an object',
      'labels', jsonb_build_object('not', 'an array'),
      'count', '3',
      'enabled', false
    )
  );

  IF v_wrong_types <> '{}'::jsonb THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_WRONG_TYPES_NOT_REJECTED: %', v_wrong_types;
  END IF;
END;
$committee_localization_jsonb_trim$;

ROLLBACK;
