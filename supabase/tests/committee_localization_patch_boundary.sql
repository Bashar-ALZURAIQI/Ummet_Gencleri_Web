-- Permanent rollback-only regression coverage for the committee localization
-- PATCH boundary. Run after the forward migrations against a disposable or
-- otherwise safe database. The test creates no persistent data.
BEGIN;

DO $committee_localization_patch_boundary$
DECLARE
  v_canonical jsonb := jsonb_build_object(
    'id', 'vice-presidency',
    'responsibilities', jsonb_build_array('Arabic A', 'Arabic B', 'Arabic C'),
    'members', jsonb_build_array(
      jsonb_build_object('id', 'm0', 'name', 'Arabic Zero', 'position', 'Arabic Position 0', 'photo', 'p0'),
      jsonb_build_object('id', 'm1', 'name', 'Arabic One', 'position', 'Arabic Position 1', 'photo', 'p1'),
      jsonb_build_object('id', 'm2', 'name', 'Arabic Two', 'position', 'Arabic Position 2', 'photo', 'p2')
    )
  );
  v_existing jsonb := jsonb_build_object(
    'id', 'vice-presidency',
    'responsibilities', jsonb_build_array('TR A', 'TR B', 'TR C'),
    'members', jsonb_build_array(
      jsonb_build_object('id', 'm0', 'name', 'TR Zero', 'position', 'TR Position 0', 'photo', 'p0'),
      jsonb_build_object('id', 'm1', 'name', 'TR One', 'position', 'TR Position 1', 'photo', 'p1'),
      jsonb_build_object('id', 'm2', 'name', 'TR Two', 'position', 'TR Position 2', 'photo', 'p2')
    )
  );
  v_result jsonb;
  v_paths text[];
BEGIN
  -- A NULL placeholder makes the numeric index explicit: patch index 1 only.
  v_result := private.apply_committee_localization_patch(
    v_existing,
    v_canonical,
    jsonb_build_object('responsibilities', jsonb_build_array(NULL, 'TR B updated'))
  );
  IF v_result #>> '{responsibilities,0}' <> 'TR A'
     OR v_result #>> '{responsibilities,1}' <> 'TR B updated'
     OR v_result #>> '{responsibilities,2}' <> 'TR C' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_RESPONSIBILITY_PARTIAL_PATCH_INVALID: %', v_result;
  END IF;

  -- Object-array patches locate members by stable id, not submitted position.
  v_result := private.apply_committee_localization_patch(
    v_existing,
    v_canonical,
    jsonb_build_object('members', jsonb_build_array(jsonb_build_object('id', 'm1', 'position', 'TR Position 1 updated')))
  );
  IF v_result #>> '{members,0,position}' <> 'TR Position 0'
     OR v_result #>> '{members,1,position}' <> 'TR Position 1 updated'
     OR v_result #>> '{members,2,position}' <> 'TR Position 2'
     OR v_result #>> '{members,1,name}' <> 'TR One'
     OR v_result #>> '{members,1,photo}' <> 'p1' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_MEMBER_PARTIAL_PATCH_INVALID: %', v_result;
  END IF;

  v_result := private.apply_committee_localization_patch(
    v_existing,
    v_canonical,
    jsonb_build_object(
      'responsibilities', jsonb_build_array('TR A updated'),
      'members', jsonb_build_array(jsonb_build_object('id', 'm2', 'position', 'TR Position 2 updated'))
    )
  );
  IF v_result #>> '{responsibilities,0}' <> 'TR A updated'
     OR v_result #>> '{responsibilities,1}' <> 'TR B'
     OR v_result #>> '{members,1,position}' <> 'TR Position 1'
     OR v_result #>> '{members,2,position}' <> 'TR Position 2 updated' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_MULTIPLE_PATCH_INVALID: %', v_result;
  END IF;

  v_paths := private.committee_localization_patch_paths(
    v_canonical,
    jsonb_build_object('responsibilities', jsonb_build_array(NULL, 'TR B updated')),
    ''
  );
  IF NOT ('responsibilities.1' = ANY(v_paths)) THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_PATCH_MANUAL_PATH_INVALID: %', v_paths;
  END IF;
END;
$committee_localization_patch_boundary$;

-- RPC-level coverage uses rollback-only fixture rows and the live auth helper
-- contract. It intentionally exercises partial payloads; a fully hydrated
-- client payload is not required for correctness.
DO $committee_localization_patch_fixture$
DECLARE
  v_canonical jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', 'vice-presidency',
      'responsibilities', jsonb_build_array('Arabic A', 'Arabic B', 'Arabic C'),
      'members', jsonb_build_array(
        jsonb_build_object('id', 'm0', 'name', 'Arabic Zero', 'position', 'Arabic Position 0', 'photo', 'p0'),
        jsonb_build_object('id', 'm1', 'name', 'Arabic One', 'position', 'Arabic Position 1', 'photo', 'p1'),
        jsonb_build_object('id', 'm2', 'name', 'Arabic Two', 'position', 'Arabic Position 2', 'photo', 'p2')
      )
    ),
    jsonb_build_object('id', 'academic', 'description', 'Arabic Academic', 'responsibilities', '[]'::jsonb, 'members', '[]'::jsonb)
  );
  v_localized jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', 'vice-presidency',
      'responsibilities', jsonb_build_array('TR A', 'TR B', 'TR C'),
      'members', jsonb_build_array(
        jsonb_build_object('id', 'm0', 'name', 'TR Zero', 'position', 'TR Position 0', 'photo', 'p0'),
        jsonb_build_object('id', 'm1', 'name', 'TR One', 'position', 'TR Position 1', 'photo', 'p1'),
        jsonb_build_object('id', 'm2', 'name', 'TR Two', 'position', 'TR Position 2', 'photo', 'p2')
      )
    ),
    jsonb_build_object('id', 'academic', 'description', 'TR Academic', 'responsibilities', '[]'::jsonb, 'members', '[]'::jsonb)
  );
  v_vice_id uuid;
  v_president_id uuid;
  v_student_id uuid;
BEGIN
  SELECT user_id INTO v_vice_id FROM public.executive_assignments WHERE position_key = 'VICE_PRESIDENT';
  SELECT user_id INTO v_president_id FROM public.executive_assignments WHERE position_key = 'PRESIDENT';
  SELECT p.id INTO v_student_id
  FROM public.profiles AS p
  WHERE NOT EXISTS (SELECT 1 FROM public.executive_assignments AS ea WHERE ea.user_id = p.id)
  LIMIT 1;
  IF v_vice_id IS NULL OR v_president_id IS NULL OR v_student_id IS NULL THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_PATCH_AUTH_FIXTURE_MISSING';
  END IF;

  UPDATE public.published_site_content
  SET content = jsonb_set(content, '{committees}', v_canonical, true)
  WHERE id = 'main';

  INSERT INTO public.cms_localizations (
    target, locale, partition, payload, status, manual_paths, stale_paths, source_hash, updated_at, updated_by
  ) VALUES
    ('committees', 'tr', 'published', v_localized, 'fresh', '{}'::text[], '{}'::text[], 'old-published-hash', now(), v_vice_id::text),
    ('committees', 'tr', 'draft', v_localized, 'draft', '{}'::text[], '{}'::text[], 'old-draft-hash', now(), v_vice_id::text)
  ON CONFLICT (target, locale, partition) DO UPDATE
  SET payload = EXCLUDED.payload,
      status = EXCLUDED.status,
      manual_paths = EXCLUDED.manual_paths,
      stale_paths = EXCLUDED.stale_paths,
      source_hash = EXCLUDED.source_hash,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;

  PERFORM set_config('committee_localization_patch.vice_id', v_vice_id::text, true);
  PERFORM set_config('committee_localization_patch.president_id', v_president_id::text, true);
  PERFORM set_config('committee_localization_patch.student_id', v_student_id::text, true);
END;
$committee_localization_patch_fixture$;

SELECT set_config('request.jwt.claim.sub', current_setting('committee_localization_patch.vice_id'), true);
SET LOCAL ROLE authenticated;

DO $committee_localization_patch_own$
BEGIN
  -- Publish one scalar-array leaf, then two distinct leaves. Existing siblings
  -- must survive each partial submission.
  PERFORM public.publish_own_committee_localization(
    'vice-presidency', 'tr',
    jsonb_build_array(jsonb_build_object('id', 'vice-presidency', 'responsibilities', jsonb_build_array(NULL, 'TR B updated'))),
    'patch-published-hash'
  );
  PERFORM public.publish_own_committee_localization(
    'vice-presidency', 'tr',
    jsonb_build_array(jsonb_build_object(
      'id', 'vice-presidency',
      'responsibilities', jsonb_build_array('TR A updated'),
      'members', jsonb_build_array(jsonb_build_object('id', 'm1', 'position', 'TR Position 1 updated'))
    )),
    'patch-published-hash'
  );

  -- Draft writes follow the same partial PATCH semantics.
  PERFORM public.save_own_committee_draft_localization(
    'vice-presidency', 'tr',
    jsonb_build_array(jsonb_build_object('id', 'vice-presidency', 'members', jsonb_build_array(jsonb_build_object('id', 'm2', 'position', 'TR Draft Position 2')))),
    'patch-draft-hash'
  );

  BEGIN
    PERFORM public.publish_own_committee_localization('vice-presidency', 'tr', '[]'::jsonb);
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_LEGACY_PUBLISH_STILL_CALLABLE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.save_own_committee_draft_localization('vice-presidency', 'tr', '[]'::jsonb);
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_LEGACY_DRAFT_STILL_CALLABLE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.publish_own_committee_localization(
      'academic', 'tr', jsonb_build_array(jsonb_build_object('id', 'academic', 'description', 'forbidden')), 'forbidden'
    );
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_CROSS_COMMITTEE_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$committee_localization_patch_own$;

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', current_setting('committee_localization_patch.student_id'), true);
SET LOCAL ROLE authenticated;
DO $committee_localization_patch_student$
BEGIN
  BEGIN
    PERFORM public.publish_own_committee_localization(
      'vice-presidency', 'tr', jsonb_build_array(jsonb_build_object('id', 'vice-presidency', 'responsibilities', jsonb_build_array('forbidden'))), 'forbidden'
    );
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_STUDENT_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$committee_localization_patch_student$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', current_setting('committee_localization_patch.president_id'), true);
SET LOCAL ROLE authenticated;
DO $committee_localization_patch_president$
BEGIN
  PERFORM public.publish_own_committee_localization(
    'academic', 'tr', jsonb_build_array(jsonb_build_object('id', 'academic', 'description', 'President may publish this'))), 'president-hash'
  );
END;
$committee_localization_patch_president$;
RESET ROLE;

DO $committee_localization_patch_assertions$
DECLARE
  v_published jsonb;
  v_draft jsonb;
  v_published_paths text[];
  v_draft_paths text[];
  v_published_hash text;
  v_draft_hash text;
BEGIN
  SELECT payload, manual_paths, source_hash INTO v_published, v_published_paths, v_published_hash
  FROM public.cms_localizations
  WHERE target = 'committees' AND locale = 'tr' AND partition = 'published';
  SELECT payload, manual_paths, source_hash INTO v_draft, v_draft_paths, v_draft_hash
  FROM public.cms_localizations
  WHERE target = 'committees' AND locale = 'tr' AND partition = 'draft';

  IF (SELECT item #>> '{responsibilities,0}' FROM jsonb_array_elements(v_published) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR A updated'
     OR (SELECT item #>> '{responsibilities,1}' FROM jsonb_array_elements(v_published) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR B updated'
     OR (SELECT item #>> '{responsibilities,2}' FROM jsonb_array_elements(v_published) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR C' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_PUBLISH_RESPONSIBILITY_SIBLING_LOST';
  END IF;
  IF (SELECT item #>> '{members,0,position}' FROM jsonb_array_elements(v_published) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR Position 0'
     OR (SELECT item #>> '{members,1,position}' FROM jsonb_array_elements(v_published) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR Position 1 updated'
     OR (SELECT item #>> '{members,2,position}' FROM jsonb_array_elements(v_published) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR Position 2'
     OR (SELECT item #>> '{members,1,name}' FROM jsonb_array_elements(v_published) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR One'
     OR (SELECT item #>> '{members,1,photo}' FROM jsonb_array_elements(v_published) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'p1' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_PUBLISH_MEMBER_SIBLING_LOST';
  END IF;
  IF (SELECT item #>> '{members,0,position}' FROM jsonb_array_elements(v_draft) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR Position 0'
     OR (SELECT item #>> '{members,1,position}' FROM jsonb_array_elements(v_draft) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR Position 1'
     OR (SELECT item #>> '{members,2,position}' FROM jsonb_array_elements(v_draft) AS item WHERE item ->> 'id' = 'vice-presidency') <> 'TR Draft Position 2' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_DRAFT_MEMBER_SIBLING_LOST';
  END IF;
  IF v_published_hash <> 'patch-published-hash' OR v_draft_hash <> 'patch-draft-hash' THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_SOURCE_HASH_NOT_PERSISTED';
  END IF;
  IF NOT ('vice-presidency.responsibilities.1' = ANY(v_published_paths))
     OR NOT ('vice-presidency.members.1.position' = ANY(v_published_paths))
     OR NOT ('vice-presidency.members.2.position' = ANY(v_draft_paths)) THEN
    RAISE EXCEPTION 'COMMITTEE_LOCALIZATION_PATCH_MANUAL_PATHS_MISSING';
  END IF;
END;
$committee_localization_patch_assertions$;

ROLLBACK;
