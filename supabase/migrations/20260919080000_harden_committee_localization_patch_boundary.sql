-- Forward-only hardening for committee-localization writes.
--
-- The previous source-hash migration merged a sanitized submitted committee
-- onto the canonical committee with jsonb ||. That replaces nested arrays as
-- complete values, so a partial members/responsibilities submission could
-- erase already-localized siblings. This migration makes the RPC boundary
-- PATCH-oriented: only valid submitted string leaves are applied to the
-- existing localized committee payload. Object-array entries are addressed by
-- stable id; scalar arrays use their explicit numeric position.

BEGIN;

CREATE OR REPLACE FUNCTION private.committee_localization_patch_paths(
  p_canonical jsonb,
  p_submitted jsonb,
  p_prefix text DEFAULT ''
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_paths text[] := '{}'::text[];
  v_key text;
  v_canonical_value jsonb;
  v_submitted_value jsonb;
  v_child_paths text[];
  v_index integer;
  v_target_index integer;
  v_canonical_item jsonb;
  v_submitted_item jsonb;
  v_path text;
BEGIN
  IF p_canonical IS NULL OR p_submitted IS NULL THEN
    RETURN v_paths;
  END IF;

  IF jsonb_typeof(p_canonical) = 'string' THEN
    IF jsonb_typeof(p_submitted) = 'string'
       AND char_length(btrim(p_submitted #>> '{}')) BETWEEN 1 AND 5000
       AND p_prefix <> '' THEN
      RETURN ARRAY[p_prefix];
    END IF;
    RETURN v_paths;
  END IF;

  IF jsonb_typeof(p_canonical) = 'object' THEN
    IF jsonb_typeof(p_submitted) <> 'object' THEN
      RETURN v_paths;
    END IF;
    FOR v_key, v_submitted_value IN SELECT key, value FROM jsonb_each(p_submitted) LOOP
      v_canonical_value := p_canonical -> v_key;
      IF v_canonical_value IS NULL THEN
        CONTINUE;
      END IF;
      v_path := CASE WHEN p_prefix = '' THEN v_key ELSE p_prefix || '.' || v_key END;
      v_child_paths := private.committee_localization_patch_paths(
        v_canonical_value,
        v_submitted_value,
        v_path
      );
      v_paths := v_paths || v_child_paths;
    END LOOP;
    RETURN v_paths;
  END IF;

  IF jsonb_typeof(p_canonical) = 'array' THEN
    IF jsonb_typeof(p_submitted) <> 'array' THEN
      RETURN v_paths;
    END IF;
    FOR v_submitted_item, v_index IN
      SELECT value, ordinality::integer - 1
      FROM jsonb_array_elements(p_submitted) WITH ORDINALITY
    LOOP
      IF jsonb_typeof(v_submitted_item) = 'null' THEN
        CONTINUE;
      END IF;
      v_target_index := v_index;
      IF jsonb_typeof(v_submitted_item) = 'object'
         AND jsonb_typeof(v_submitted_item -> 'id') = 'string' THEN
        SELECT ordinality::integer - 1, item
        INTO v_target_index, v_canonical_item
        FROM jsonb_array_elements(p_canonical) WITH ORDINALITY AS items(item, ordinality)
        WHERE item ->> 'id' = v_submitted_item ->> 'id'
        LIMIT 1;
      ELSE
        v_canonical_item := p_canonical -> v_target_index;
      END IF;
      IF v_canonical_item IS NULL THEN
        CONTINUE;
      END IF;
      v_path := CASE
        WHEN p_prefix = '' THEN v_target_index::text
        ELSE p_prefix || '.' || v_target_index::text
      END;
      v_child_paths := private.committee_localization_patch_paths(
        v_canonical_item,
        v_submitted_item,
        v_path
      );
      v_paths := v_paths || v_child_paths;
    END LOOP;
  END IF;

  RETURN ARRAY(SELECT DISTINCT path FROM unnest(v_paths) AS path ORDER BY path);
END
$function$;

CREATE OR REPLACE FUNCTION private.apply_committee_localization_patch(
  p_base jsonb,
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
  v_result jsonb;
  v_key text;
  v_canonical_value jsonb;
  v_submitted_value jsonb;
  v_current_value jsonb;
  v_patched_value jsonb;
  v_index integer;
  v_target_index integer;
  v_canonical_item jsonb;
  v_submitted_item jsonb;
BEGIN
  IF p_canonical IS NULL THEN
    RETURN p_base;
  END IF;

  IF jsonb_typeof(p_canonical) = 'string' THEN
    IF jsonb_typeof(p_submitted) = 'string'
       AND char_length(btrim(p_submitted #>> '{}')) BETWEEN 1 AND 5000 THEN
      RETURN to_jsonb(btrim(p_submitted #>> '{}'));
    END IF;
    RETURN COALESCE(p_base, p_canonical);
  END IF;

  IF jsonb_typeof(p_canonical) = 'object' THEN
    v_result := CASE
      WHEN jsonb_typeof(p_base) = 'object' THEN p_base
      ELSE p_canonical
    END;
    IF jsonb_typeof(p_submitted) <> 'object' THEN
      RETURN v_result;
    END IF;
    FOR v_key, v_submitted_value IN SELECT key, value FROM jsonb_each(p_submitted) LOOP
      v_canonical_value := p_canonical -> v_key;
      IF v_canonical_value IS NULL THEN
        CONTINUE;
      END IF;
      v_current_value := COALESCE(v_result -> v_key, v_canonical_value);
      v_patched_value := private.apply_committee_localization_patch(
        v_current_value,
        v_canonical_value,
        v_submitted_value
      );
      v_result := jsonb_set(v_result, ARRAY[v_key], v_patched_value, true);
    END LOOP;
    RETURN v_result;
  END IF;

  IF jsonb_typeof(p_canonical) = 'array' THEN
    v_result := CASE
      WHEN jsonb_typeof(p_base) = 'array' THEN p_base
      ELSE p_canonical
    END;
    IF jsonb_typeof(p_submitted) <> 'array' THEN
      RETURN v_result;
    END IF;
    FOR v_submitted_item, v_index IN
      SELECT value, ordinality::integer - 1
      FROM jsonb_array_elements(p_submitted) WITH ORDINALITY
    LOOP
      IF jsonb_typeof(v_submitted_item) = 'null' THEN
        CONTINUE;
      END IF;
      v_target_index := v_index;
      IF jsonb_typeof(v_submitted_item) = 'object'
         AND jsonb_typeof(v_submitted_item -> 'id') = 'string' THEN
        SELECT ordinality::integer - 1, item
        INTO v_target_index, v_canonical_item
        FROM jsonb_array_elements(p_canonical) WITH ORDINALITY AS items(item, ordinality)
        WHERE item ->> 'id' = v_submitted_item ->> 'id'
        LIMIT 1;
      ELSE
        v_canonical_item := p_canonical -> v_target_index;
      END IF;
      IF v_canonical_item IS NULL THEN
        CONTINUE;
      END IF;
      v_current_value := COALESCE(v_result -> v_target_index, v_canonical_item);
      v_patched_value := private.apply_committee_localization_patch(
        v_current_value,
        v_canonical_item,
        v_submitted_item
      );
      v_result := jsonb_set(v_result, ARRAY[v_target_index::text], v_patched_value, false);
    END LOOP;
    RETURN v_result;
  END IF;

  -- Numbers and booleans are canonical-only values. A localization submission
  -- cannot modify them, preserving the existing approved field contract.
  RETURN COALESCE(p_base, p_canonical);
END
$function$;

CREATE OR REPLACE FUNCTION public.publish_own_committee_localization(
  p_committee_id text,
  p_locale text,
  p_localized_committees jsonb,
  p_source_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_assignment public.executive_assignments%ROWTYPE;
  v_site public.published_site_content%ROWTYPE;
  v_canonical_committees jsonb;
  v_canonical_committee jsonb;
  v_submitted_committee jsonb;
  v_existing_committee jsonb;
  v_merged jsonb;
  v_row public.cms_localizations%ROWTYPE;
  v_base jsonb;
  v_next jsonb;
  v_manual text[];
  v_stale_kept text[];
  v_leaves text[];
  v_address_manual text[];
  v_source_hash text := nullif(btrim(coalesce(p_source_hash, '')), '');
  i integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  SELECT * INTO v_assignment FROM public.executive_assignments WHERE user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a current executive may publish own committee localizations';
  END IF;
  IF p_committee_id IS NULL OR p_committee_id NOT IN ('presidency', 'vice-presidency', 'media', 'finance', 'supervisory', 'academic', 'activities') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_UNKNOWN_COMMITTEE';
  END IF;
  IF v_assignment.position_key <> 'PRESIDENT' AND v_assignment.committee_key IS DISTINCT FROM p_committee_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_FORBIDDEN';
  END IF;
  IF p_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid locale (tr or en) is required';
  END IF;
  IF p_localized_committees IS NULL OR jsonb_typeof(p_localized_committees) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid committees localization array is required';
  END IF;
  SELECT item INTO v_submitted_committee FROM jsonb_array_elements(p_localized_committees) AS item WHERE item ->> 'id' = p_committee_id LIMIT 1;
  IF v_submitted_committee IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_PAYLOAD_MISSING';
  END IF;
  SELECT * INTO v_site FROM public.published_site_content WHERE id = 'main' FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(v_site.content -> 'committees') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_SOURCE_NOT_FOUND';
  END IF;
  v_canonical_committees := v_site.content -> 'committees';
  SELECT item INTO v_canonical_committee FROM jsonb_array_elements(v_canonical_committees) AS item WHERE item ->> 'id' = p_committee_id LIMIT 1;
  IF v_canonical_committee IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_NOT_FOUND';
  END IF;
  v_leaves := private.committee_localization_patch_paths(v_canonical_committee, v_submitted_committee, '');
  IF cardinality(v_leaves) IS NULL OR cardinality(v_leaves) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_NO_FIELDS';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms_localizations_committees_' || p_locale, 0));
  SELECT * INTO v_row FROM public.cms_localizations WHERE target = 'committees' AND locale = p_locale AND partition = 'published' FOR UPDATE;
  IF FOUND THEN
    v_base := CASE WHEN jsonb_typeof(v_row.payload) = 'array' THEN v_row.payload ELSE v_canonical_committees END;
    v_manual := COALESCE(v_row.manual_paths, '{}'::text[]);
    v_stale_kept := ARRAY(SELECT sp FROM unnest(COALESCE(v_row.stale_paths, '{}'::text[])) AS sp WHERE sp IS NOT NULL AND sp NOT LIKE p_committee_id || '.%');
  ELSE
    v_base := v_canonical_committees;
    v_manual := '{}'::text[];
    v_stale_kept := '{}'::text[];
  END IF;
  SELECT item INTO v_existing_committee FROM jsonb_array_elements(v_base) AS item WHERE item ->> 'id' = p_committee_id LIMIT 1;
  IF v_existing_committee IS NULL THEN
    v_base := v_base || jsonb_build_array(v_canonical_committee);
    v_existing_committee := v_canonical_committee;
  END IF;
  v_merged := private.apply_committee_localization_patch(COALESCE(v_existing_committee, v_canonical_committee), v_canonical_committee, v_submitted_committee);
  v_address_manual := v_manual;
  IF v_leaves IS NOT NULL THEN
    FOR i IN 1 .. cardinality(v_leaves) LOOP
      v_address_manual := array_append(v_address_manual, p_committee_id || '.' || v_leaves[i]);
    END LOOP;
  END IF;
  v_manual := ARRAY(SELECT DISTINCT mp FROM unnest(v_address_manual) AS mp WHERE mp IS NOT NULL ORDER BY 1);
  SELECT jsonb_agg(CASE WHEN item.item_value ->> 'id' = p_committee_id THEN v_merged ELSE item.item_value END ORDER BY item.position_value)
  INTO v_next FROM jsonb_array_elements(v_base) WITH ORDINALITY AS item(item_value, position_value);
  IF v_next IS NULL THEN v_next := v_base; END IF;
  IF FOUND THEN
    UPDATE public.cms_localizations SET payload = v_next, status = 'fresh', manual_paths = v_manual, stale_paths = v_stale_kept, source_hash = v_source_hash, updated_at = now(), updated_by = v_actor_id::text WHERE id = v_row.id;
  ELSE
    INSERT INTO public.cms_localizations (target, locale, partition, payload, status, manual_paths, stale_paths, source_hash, updated_at, updated_by)
    VALUES ('committees', p_locale, 'published', v_next, 'fresh', v_manual, v_stale_kept, v_source_hash, now(), v_actor_id::text);
  END IF;
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid()) OR NOT (SELECT private.executive_can_manage_committee((SELECT auth.uid()), p_committee_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_AUTHORITY_CHANGED';
  END IF;
  RETURN jsonb_build_object('target', 'committees', 'locale', p_locale, 'partition', 'published', 'committeeId', p_committee_id, 'status', 'fresh');
END
$function$;

CREATE OR REPLACE FUNCTION public.save_own_committee_draft_localization(
  p_committee_id text,
  p_locale text,
  p_localized_committees jsonb,
  p_source_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_assignment public.executive_assignments%ROWTYPE;
  v_site public.published_site_content%ROWTYPE;
  v_canonical_committees jsonb;
  v_canonical_committee jsonb;
  v_submitted_committee jsonb;
  v_existing_committee jsonb;
  v_merged jsonb;
  v_row public.cms_localizations%ROWTYPE;
  v_base jsonb;
  v_next jsonb;
  v_manual text[];
  v_leaves text[];
  v_address_manual text[];
  v_source_hash text := nullif(btrim(coalesce(p_source_hash, '')), '');
  i integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  SELECT * INTO v_assignment FROM public.executive_assignments WHERE user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a current executive may save own committee drafts';
  END IF;
  IF p_committee_id IS NULL OR p_committee_id NOT IN ('presidency', 'vice-presidency', 'media', 'finance', 'supervisory', 'academic', 'activities') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_DRAFT_UNKNOWN_COMMITTEE';
  END IF;
  IF v_assignment.position_key <> 'PRESIDENT' AND v_assignment.committee_key IS DISTINCT FROM p_committee_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_DRAFT_FORBIDDEN';
  END IF;
  IF p_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid locale (tr or en) is required';
  END IF;
  IF p_localized_committees IS NULL OR jsonb_typeof(p_localized_committees) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid committees localization array is required';
  END IF;
  SELECT item INTO v_submitted_committee FROM jsonb_array_elements(p_localized_committees) AS item WHERE item ->> 'id' = p_committee_id LIMIT 1;
  IF v_submitted_committee IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_DRAFT_PAYLOAD_MISSING';
  END IF;
  SELECT * INTO v_site FROM public.published_site_content WHERE id = 'main' FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(v_site.content -> 'committees') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_DRAFT_SOURCE_NOT_FOUND';
  END IF;
  v_canonical_committees := v_site.content -> 'committees';
  SELECT item INTO v_canonical_committee FROM jsonb_array_elements(v_canonical_committees) AS item WHERE item ->> 'id' = p_committee_id LIMIT 1;
  IF v_canonical_committee IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_DRAFT_NOT_FOUND';
  END IF;
  v_leaves := private.committee_localization_patch_paths(v_canonical_committee, v_submitted_committee, '');
  IF cardinality(v_leaves) IS NULL OR cardinality(v_leaves) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_DRAFT_NO_FIELDS';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms_localizations_committees_' || p_locale, 0));
  SELECT * INTO v_row FROM public.cms_localizations WHERE target = 'committees' AND locale = p_locale AND partition = 'draft' FOR UPDATE;
  IF FOUND THEN
    v_base := CASE WHEN jsonb_typeof(v_row.payload) = 'array' THEN v_row.payload ELSE v_canonical_committees END;
    v_manual := COALESCE(v_row.manual_paths, '{}'::text[]);
  ELSE
    v_base := v_canonical_committees;
    v_manual := '{}'::text[];
  END IF;
  SELECT item INTO v_existing_committee FROM jsonb_array_elements(v_base) AS item WHERE item ->> 'id' = p_committee_id LIMIT 1;
  IF v_existing_committee IS NULL THEN
    v_base := v_base || jsonb_build_array(v_canonical_committee);
    v_existing_committee := v_canonical_committee;
  END IF;
  v_merged := private.apply_committee_localization_patch(COALESCE(v_existing_committee, v_canonical_committee), v_canonical_committee, v_submitted_committee);
  v_address_manual := v_manual;
  IF v_leaves IS NOT NULL THEN
    FOR i IN 1 .. cardinality(v_leaves) LOOP
      v_address_manual := array_append(v_address_manual, p_committee_id || '.' || v_leaves[i]);
    END LOOP;
  END IF;
  v_manual := ARRAY(SELECT DISTINCT mp FROM unnest(v_address_manual) AS mp WHERE mp IS NOT NULL ORDER BY 1);
  SELECT jsonb_agg(CASE WHEN item.item_value ->> 'id' = p_committee_id THEN v_merged ELSE item.item_value END ORDER BY item.position_value)
  INTO v_next FROM jsonb_array_elements(v_base) WITH ORDINALITY AS item(item_value, position_value);
  IF v_next IS NULL THEN v_next := v_base; END IF;
  IF FOUND THEN
    UPDATE public.cms_localizations SET payload = v_next, status = 'draft', manual_paths = v_manual, source_hash = v_source_hash, updated_at = now(), updated_by = v_actor_id::text WHERE id = v_row.id;
  ELSE
    INSERT INTO public.cms_localizations (target, locale, partition, payload, status, manual_paths, stale_paths, source_hash, updated_at, updated_by)
    VALUES ('committees', p_locale, 'draft', v_next, 'draft', v_manual, '{}'::text[], v_source_hash, now(), v_actor_id::text);
  END IF;
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid()) OR NOT (SELECT private.executive_can_manage_committee((SELECT auth.uid()), p_committee_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_DRAFT_AUTHORITY_CHANGED';
  END IF;
  RETURN jsonb_build_object('target', 'committees', 'locale', p_locale, 'partition', 'draft', 'committeeId', p_committee_id, 'status', 'draft');
END
$function$;

-- PostgreSQL overloads coexist. The only supported public contract now has a
-- source-hash argument, so authenticated API callers cannot use either old
-- three-argument overload.
REVOKE ALL ON FUNCTION public.publish_own_committee_localization(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_own_committee_draft_localization(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION private.committee_localization_patch_paths(jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.apply_committee_localization_patch(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
