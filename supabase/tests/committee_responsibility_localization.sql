-- Behavioral verification for own-committee responsibility AR/TR/EN persistence.
-- The real RPCs and current VICE_PRESIDENT assignment are exercised, then rolled back.
BEGIN;

-- Test-only implementation of the frontend's canonical JSON + FNV-1a source
-- hash contract. Keeping this inside the rollback transaction avoids a
-- sentinel hash and leaves no database objects behind.
CREATE OR REPLACE FUNCTION pg_temp.frontend_canonical_json(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_result text;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'null' THEN RETURN 'null';
    WHEN 'string' THEN RETURN to_jsonb(p_value #>> '{}')::text;
    WHEN 'number' THEN RETURN p_value::text;
    WHEN 'boolean' THEN RETURN p_value::text;
    WHEN 'array' THEN
      SELECT '[' || COALESCE(string_agg(pg_temp.frontend_canonical_json(item), ',' ORDER BY ordinality), '') || ']'
      INTO v_result
      FROM jsonb_array_elements(p_value) WITH ORDINALITY AS element(item, ordinality);
      RETURN v_result;
    WHEN 'object' THEN
      SELECT '{' || COALESCE(
        string_agg(to_jsonb(key)::text || ':' || pg_temp.frontend_canonical_json(value), ',' ORDER BY key COLLATE "C"),
        ''
      ) || '}'
      INTO v_result
      FROM jsonb_each(p_value);
      RETURN v_result;
    ELSE
      RETURN 'null';
  END CASE;
END
$function$;

CREATE OR REPLACE FUNCTION pg_temp.frontend_source_hash(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_canonical text := pg_temp.frontend_canonical_json(p_value);
  v_hash bigint := 2166136261;
  v_codepoint integer;
  v_unit integer;
  v_index integer;
BEGIN
  FOR v_index IN 1 .. char_length(v_canonical) LOOP
    v_codepoint := ascii(substr(v_canonical, v_index, 1));
    IF v_codepoint <= 65535 THEN
      v_hash := mod((v_hash # v_codepoint::bigint) * 16777619, 4294967296);
    ELSE
      v_unit := 55296 + ((v_codepoint - 65536) >> 10);
      v_hash := mod((v_hash # v_unit::bigint) * 16777619, 4294967296);
      v_unit := 56320 + ((v_codepoint - 65536) & 1023);
      v_hash := mod((v_hash # v_unit::bigint) * 16777619, 4294967296);
    END IF;
  END LOOP;
  RETURN lpad(to_hex(v_hash), 8, '0');
END
$function$;

SELECT set_config('committee_responsibility.vice_id', (
  SELECT user_id::text
  FROM public.executive_assignments
  WHERE position_key = 'VICE_PRESIDENT'
), true);

DO $fixtures$
BEGIN
  IF NULLIF(current_setting('committee_responsibility.vice_id'), '') IS NULL THEN
    RAISE EXCEPTION 'COMMITTEE_RESPONSIBILITY_VICE_FIXTURE_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.published_site_content AS site
    CROSS JOIN LATERAL jsonb_array_elements(site.content -> 'committees') AS committee(item)
    WHERE site.id = 'main'
      AND committee.item ->> 'id' = 'vice-presidency'
      AND jsonb_typeof(committee.item -> 'responsibilities') = 'array'
      AND jsonb_array_length(committee.item -> 'responsibilities') > 0
  ) THEN
    RAISE EXCEPTION 'COMMITTEE_RESPONSIBILITY_EXISTING_ITEM_MISSING';
  END IF;
END;
$fixtures$;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('committee_responsibility.vice_id'),
  true
);
SET LOCAL ROLE authenticated;

DO $responsibility_publish$
DECLARE
  v_site public.published_site_content%ROWTYPE;
  v_committee jsonb;
  v_snapshot jsonb;
  v_localized jsonb;
  v_arabic constant text := 'اختبار المسؤولية العربية 321';
  v_turkish constant text := 'Türkçe sorumluluk testi 321';
  v_english constant text := 'English responsibility test 321';
  v_source_hash text;
BEGIN
  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main';

  SELECT item INTO v_committee
  FROM jsonb_array_elements(v_site.content -> 'committees') AS item
  WHERE item ->> 'id' = 'vice-presidency';

  v_snapshot := jsonb_build_object(
    'responsibilities', jsonb_set(v_committee -> 'responsibilities', '{0}', to_jsonb(v_arabic), false),
    'stats', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('label', item -> 'label', 'value', item -> 'value') ORDER BY ordinality),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(v_committee -> 'stats') WITH ORDINALITY AS stat(item, ordinality)
    ),
    'members', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', item -> 'id',
            'name', item -> 'name',
            'position', item -> 'position',
            'photo', item -> 'photo'
          )
          ORDER BY ordinality
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(v_committee -> 'members') WITH ORDINALITY AS member(item, ordinality)
    )
  );

  PERFORM public.publish_own_committee(
    'vice-presidency',
    v_snapshot,
    v_site.version
  );

  SELECT pg_temp.frontend_source_hash(content -> 'committees') INTO v_source_hash
  FROM public.published_site_content
  WHERE id = 'main';
  PERFORM set_config('committee_responsibility.source_hash', v_source_hash, true);

  SELECT jsonb_agg(
    CASE
      WHEN item.value ->> 'id' = 'vice-presidency'
        THEN jsonb_set(item.value, '{responsibilities,0}', to_jsonb(v_turkish), false)
      ELSE item.value
    END
    ORDER BY item.ordinality
  ) INTO v_localized
  FROM jsonb_array_elements((SELECT content -> 'committees' FROM public.published_site_content WHERE id = 'main'))
       WITH ORDINALITY AS item(value, ordinality);

  PERFORM public.publish_own_committee_localization(
    'vice-presidency', 'tr', v_localized, v_source_hash
  );

  SELECT jsonb_agg(
    CASE
      WHEN item.value ->> 'id' = 'vice-presidency'
        THEN jsonb_set(item.value, '{responsibilities,0}', to_jsonb(v_english), false)
      ELSE item.value
    END
    ORDER BY item.ordinality
  ) INTO v_localized
  FROM jsonb_array_elements((SELECT content -> 'committees' FROM public.published_site_content WHERE id = 'main'))
       WITH ORDINALITY AS item(value, ordinality);

  PERFORM public.publish_own_committee_localization(
    'vice-presidency', 'en', v_localized, v_source_hash
  );

  BEGIN
    PERFORM public.publish_own_committee_localization(
      'academic', 'tr', v_localized, 'cross-committee-denial-probe'
    );
    RAISE EXCEPTION 'COMMITTEE_RESPONSIBILITY_CROSS_COMMITTEE_UNEXPECTEDLY_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$responsibility_publish$;

RESET ROLE;

DO $assertions$
DECLARE
  v_canonical jsonb;
  v_tr public.cms_localizations%ROWTYPE;
  v_en public.cms_localizations%ROWTYPE;
  v_canonical_count integer;
  v_tr_count integer;
  v_en_count integer;
  v_expected_source_hash text := current_setting('committee_responsibility.source_hash');
BEGIN
  IF pg_temp.frontend_source_hash('{"a":["T"],"n":1.5,"x":"اختبار😀"}'::jsonb) <> '4bbf50e2' THEN
    RAISE EXCEPTION 'COMMITTEE_RESPONSIBILITY_SOURCE_HASH_TEST_HELPER_INVALID';
  END IF;

  SELECT committee.item INTO v_canonical
  FROM public.published_site_content AS site
  CROSS JOIN LATERAL jsonb_array_elements(site.content -> 'committees') AS committee(item)
  WHERE site.id = 'main' AND committee.item ->> 'id' = 'vice-presidency';

  SELECT * INTO v_tr FROM public.cms_localizations
  WHERE target = 'committees' AND locale = 'tr' AND partition = 'published';
  SELECT * INTO v_en FROM public.cms_localizations
  WHERE target = 'committees' AND locale = 'en' AND partition = 'published';

  IF v_canonical #>> '{responsibilities,0}' <> 'اختبار المسؤولية العربية 321' THEN
    RAISE EXCEPTION 'COMMITTEE_RESPONSIBILITY_ARABIC_NOT_PERSISTED';
  END IF;
  IF (SELECT item #>> '{responsibilities,0}' FROM jsonb_array_elements(v_tr.payload) AS item WHERE item ->> 'id' = 'vice-presidency')
     <> 'Türkçe sorumluluk testi 321' THEN
    RAISE EXCEPTION 'COMMITTEE_RESPONSIBILITY_TURKISH_NOT_PERSISTED';
  END IF;
  IF (SELECT item #>> '{responsibilities,0}' FROM jsonb_array_elements(v_en.payload) AS item WHERE item ->> 'id' = 'vice-presidency')
     <> 'English responsibility test 321' THEN
    RAISE EXCEPTION 'COMMITTEE_RESPONSIBILITY_ENGLISH_NOT_PERSISTED';
  END IF;

  SELECT jsonb_array_length(v_canonical -> 'responsibilities') INTO v_canonical_count;
  SELECT jsonb_array_length(item -> 'responsibilities') INTO v_tr_count
  FROM jsonb_array_elements(v_tr.payload) AS item WHERE item ->> 'id' = 'vice-presidency';
  SELECT jsonb_array_length(item -> 'responsibilities') INTO v_en_count
  FROM jsonb_array_elements(v_en.payload) AS item WHERE item ->> 'id' = 'vice-presidency';
  IF v_tr_count <> v_canonical_count OR v_en_count <> v_canonical_count THEN
    RAISE EXCEPTION 'COMMITTEE_RESPONSIBILITY_TRANSLATION_ARRAY_DUPLICATED';
  END IF;

  IF v_expected_source_hash <> pg_temp.frontend_source_hash(
       (SELECT content -> 'committees' FROM public.published_site_content WHERE id = 'main')
     )
     OR v_tr.status <> 'fresh' OR v_en.status <> 'fresh'
     OR v_tr.source_hash <> v_expected_source_hash
     OR v_en.source_hash <> v_expected_source_hash
     OR NOT ('vice-presidency.responsibilities.0' = ANY(v_tr.manual_paths))
     OR NOT ('vice-presidency.responsibilities.0' = ANY(v_en.manual_paths))
     OR NOT ('vice-presidency.vision' = ANY(v_tr.manual_paths))
     OR NOT ('vice-presidency.goals' = ANY(v_tr.manual_paths))
     OR NOT ('vice-presidency.members.0.position' = ANY(v_tr.manual_paths))
     OR NOT ('vice-presidency.vision' = ANY(v_en.manual_paths))
     OR NOT ('vice-presidency.goals' = ANY(v_en.manual_paths))
     OR NOT ('vice-presidency.members.0.position' = ANY(v_en.manual_paths))
     OR 'vice-presidency.responsibilities' = ANY(v_tr.manual_paths)
     OR 'vice-presidency.responsibilities' = ANY(v_en.manual_paths)
     OR 'vice-presidency.members.0' = ANY(v_tr.manual_paths)
     OR 'vice-presidency.members.0' = ANY(v_en.manual_paths) THEN
    RAISE EXCEPTION 'COMMITTEE_RESPONSIBILITY_LOCALIZATION_METADATA_INVALID';
  END IF;
END;
$assertions$;

SELECT
  pg_temp.frontend_source_hash('{"a":["T"],"n":1.5,"x":"اختبار😀"}'::jsonb) AS hash_contract_fixture,
  current_setting('committee_responsibility.source_hash') AS expected_source_hash,
  tr.source_hash AS tr_source_hash,
  en.source_hash AS en_source_hash,
  tr.status AS tr_status,
  en.status AS en_status,
  tr.stale_paths AS tr_stale_paths,
  en.stale_paths AS en_stale_paths,
  'vice-presidency.responsibilities.0' = ANY(tr.manual_paths) AS tr_responsibility_manual,
  'vice-presidency.responsibilities.0' = ANY(en.manual_paths) AS en_responsibility_manual
FROM public.cms_localizations AS tr
JOIN public.cms_localizations AS en
  ON en.target = tr.target
 AND en.partition = tr.partition
WHERE tr.target = 'committees'
  AND tr.locale = 'tr'
  AND en.locale = 'en'
  AND tr.partition = 'published';

ROLLBACK;
