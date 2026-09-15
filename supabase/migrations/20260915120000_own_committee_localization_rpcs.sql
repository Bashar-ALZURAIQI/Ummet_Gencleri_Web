-- Migration: 20260915120000_own_committee_localization_rpcs.sql
-- Description: Introduces narrow, server-enforced SECURITY DEFINER RPCs for
--              committee localization persistence so the server itself verifies
--              auth.uid() -> current executive assignment -> requested committee.
--
-- Required behavior table (enforced here, never on the React UI):
--   PRESIDENT        : PASS for every committee
--   VICE_PRESIDENT.. : PASS own committee only (position_key == committee_key)
--   STUDENT          : DENIED
--   anonymous        : DENIED
--   executive editing another committee : DENIED
--   old holder after role transfer      : DENIED (re-checked after the write)
--   new holder                          : PASS
--
-- Background: committee localization ROWS in public.cms_localizations are shared
-- per (target, locale, partition); the published partition is President-only via
-- table RLS, and the draft partition is currently writable by ANY executive for
-- ANY target. These RPCs keep the single shared-row data model but enforce
-- per-committee scoping at the server: only the caller's OWN committee element is
-- read, structurally sanitized against the canonical committee, and merged.
--
-- This migration is NOT applied to production yet (local draft only).

BEGIN;

-- ===========================================================================
-- 1. Helper: structurally sanitize a submitted committee localization against
--    the canonical committee entity. Unknown keys are dropped, string values are
--    trimmed and length-limited, arrays are capped to the canonical length, and
--    object-array items retain their canonical base (id, unlocalized siblings).
-- ===========================================================================
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
      CONTINUE; -- keys absent from the canonical committee are dropped
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
              v_trimmed := btrim(v_submitted_item);
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
        v_trimmed := btrim(v_submitted_value);
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

-- ===========================================================================
-- 2. Helper: enumerate dotted leaf paths of all string values in an object.
-- ===========================================================================
CREATE OR REPLACE FUNCTION private.localization_leaf_paths(
  p_object jsonb,
  p_prefix text
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
  v_value jsonb;
  v_child text[];
  v_path text;
BEGIN
  IF p_object IS NULL OR jsonb_typeof(p_object) <> 'object' THEN
    RETURN v_paths;
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_object) LOOP
    v_value := p_object -> v_key;
    v_path := CASE WHEN p_prefix = '' THEN v_key ELSE p_prefix || '.' || v_key END;
    IF jsonb_typeof(v_value) = 'string' THEN
      v_paths := array_append(v_paths, v_path);
    ELSE
      v_child := private.localization_leaf_paths(v_value, v_path);
      v_paths := v_paths || v_child;
    END IF;
  END LOOP;
  RETURN v_paths;
END
$function$;

-- ===========================================================================
-- 3. Published partition: narrow own-committee localization publication.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.publish_own_committee_localization(
  p_committee_id text,
  p_locale text,
  p_localized_committees jsonb
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
  v_sanitized jsonb;
  v_merged jsonb;
  v_row public.cms_localizations%ROWTYPE;
  v_base jsonb;
  v_next jsonb;
  v_manual text[];
  v_stale_kept text[];
  v_leaves text[];
  v_address_manual text[];
  i integer;
BEGIN
  -- 1. Authentication
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  -- 2. Current executive assignment (the single authoritative row)
  SELECT * INTO v_assignment
  FROM public.executive_assignments
  WHERE user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a current executive may publish own committee localizations';
  END IF;

  -- 3. Committee id + binding (president override)
  IF p_committee_id IS NULL
     OR p_committee_id NOT IN (
       'presidency', 'vice-presidency', 'media', 'finance',
       'supervisory', 'academic', 'activities'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_UNKNOWN_COMMITTEE';
  END IF;
  IF v_assignment.position_key <> 'PRESIDENT'
     AND v_assignment.committee_key IS DISTINCT FROM p_committee_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_FORBIDDEN';
  END IF;

  -- 4. Locale
  IF p_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid locale (tr or en) is required';
  END IF;

  -- 5. Submitted payload must be the committees array carrying the target element
  IF p_localized_committees IS NULL OR jsonb_typeof(p_localized_committees) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid committees localization array is required';
  END IF;
  SELECT item INTO v_submitted_committee
  FROM jsonb_array_elements(p_localized_committees) AS item
  WHERE item ->> 'id' = p_committee_id
  LIMIT 1;
  IF v_submitted_committee IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_PAYLOAD_MISSING';
  END IF;

  -- 6. Canonical committee from the officially published site content
  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(v_site.content -> 'committees') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_SOURCE_NOT_FOUND';
  END IF;
  v_canonical_committees := v_site.content -> 'committees';
  SELECT item INTO v_canonical_committee
  FROM jsonb_array_elements(v_canonical_committees) AS item
  WHERE item ->> 'id' = p_committee_id
  LIMIT 1;
  IF v_canonical_committee IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_NOT_FOUND';
  END IF;

  -- 7. Sanitize the submitted element against canonical shape, then merge onto
  --    the canonical base so unlocalized siblings and ids are preserved.
  v_sanitized := private.sanitize_committee_localization(v_canonical_committee, v_submitted_committee);
  IF v_sanitized IS NULL OR v_sanitized = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_NO_FIELDS';
  END IF;
  v_merged := v_canonical_committee || v_sanitized;

  -- 8. Serialize concurrent publishes per locale
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cms_localizations_committees_' || p_locale, 0)
  );

  -- 9. Lock and merge into the shared published row
  SELECT * INTO v_row
  FROM public.cms_localizations
  WHERE target = 'committees'
    AND locale = p_locale
    AND partition = 'published'
  FOR UPDATE;

  IF FOUND THEN
    v_base := CASE
      WHEN jsonb_typeof(v_row.payload) = 'array' THEN v_row.payload
      ELSE v_canonical_committees
    END;
    v_manual := COALESCE(v_row.manual_paths, '{}'::text[]);
    v_stale_kept := ARRAY(
      SELECT sp
      FROM unnest(COALESCE(v_row.stale_paths, '{}'::text[])) AS sp
      WHERE sp IS NOT NULL AND sp NOT LIKE p_committee_id || '.%'
    );
  ELSE
    v_base := v_canonical_committees;
    v_manual := '{}'::text[];
    v_stale_kept := '{}'::text[];
  END IF;

  v_leaves := private.localization_leaf_paths(v_sanitized, '');
  v_address_manual := v_manual;
  IF v_leaves IS NOT NULL THEN
    FOR i IN 1 .. cardinality(v_leaves) LOOP
      v_address_manual := array_append(v_address_manual, p_committee_id || '.' || v_leaves[i]);
    END LOOP;
  END IF;
  v_manual := ARRAY(SELECT DISTINCT mp FROM unnest(v_address_manual) AS mp WHERE mp IS NOT NULL ORDER BY 1);

  SELECT jsonb_agg(
    CASE WHEN item.item_value ->> 'id' = p_committee_id THEN v_merged ELSE item.item_value END
    ORDER BY item.position_value
  )
  INTO v_next
  FROM jsonb_array_elements(v_base) WITH ORDINALITY AS item(item_value, position_value);
  IF v_next IS NULL THEN
    v_next := v_base;
  END IF;

  IF FOUND THEN
    UPDATE public.cms_localizations
    SET payload = v_next,
        status = 'fresh',
        manual_paths = v_manual,
        stale_paths = v_stale_kept,
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_row.id;
  ELSE
    INSERT INTO public.cms_localizations (
      target, locale, partition, payload, status,
      manual_paths, stale_paths, updated_at, updated_by
    ) VALUES (
      'committees', p_locale, 'published', v_next, 'fresh',
      v_manual, v_stale_kept, now(), v_actor_id::text
    );
  END IF;

  -- 10. Post-execution sanity: identity/assignment must not have changed
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.executive_can_manage_committee((SELECT auth.uid()), p_committee_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_LOCALIZATION_AUTHORITY_CHANGED';
  END IF;

  RETURN jsonb_build_object(
    'target', 'committees',
    'locale', p_locale,
    'partition', 'published',
    'committeeId', p_committee_id,
    'status', 'fresh'
  );
END
$function$;

-- ===========================================================================
-- 4. Draft partition: narrow own-committee draft localization saves.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.save_own_committee_draft_localization(
  p_committee_id text,
  p_locale text,
  p_localized_committees jsonb
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
  v_sanitized jsonb;
  v_merged jsonb;
  v_row public.cms_localizations%ROWTYPE;
  v_base jsonb;
  v_next jsonb;
  v_manual text[];
  v_leaves text[];
  v_address_manual text[];
  i integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  SELECT * INTO v_assignment
  FROM public.executive_assignments
  WHERE user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a current executive may save own committee drafts';
  END IF;

  IF p_committee_id IS NULL
     OR p_committee_id NOT IN (
       'presidency', 'vice-presidency', 'media', 'finance',
       'supervisory', 'academic', 'activities'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_DRAFT_UNKNOWN_COMMITTEE';
  END IF;
  IF v_assignment.position_key <> 'PRESIDENT'
     AND v_assignment.committee_key IS DISTINCT FROM p_committee_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_DRAFT_FORBIDDEN';
  END IF;

  IF p_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid locale (tr or en) is required';
  END IF;

  IF p_localized_committees IS NULL OR jsonb_typeof(p_localized_committees) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid committees localization array is required';
  END IF;
  SELECT item INTO v_submitted_committee
  FROM jsonb_array_elements(p_localized_committees) AS item
  WHERE item ->> 'id' = p_committee_id
  LIMIT 1;
  IF v_submitted_committee IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_DRAFT_PAYLOAD_MISSING';
  END IF;

  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(v_site.content -> 'committees') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_DRAFT_SOURCE_NOT_FOUND';
  END IF;
  v_canonical_committees := v_site.content -> 'committees';
  SELECT item INTO v_canonical_committee
  FROM jsonb_array_elements(v_canonical_committees) AS item
  WHERE item ->> 'id' = p_committee_id
  LIMIT 1;
  IF v_canonical_committee IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_DRAFT_NOT_FOUND';
  END IF;

  v_sanitized := private.sanitize_committee_localization(v_canonical_committee, v_submitted_committee);
  IF v_sanitized IS NULL OR v_sanitized = '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_DRAFT_NO_FIELDS';
  END IF;
  v_merged := v_canonical_committee || v_sanitized;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cms_localizations_committees_' || p_locale, 0)
  );

  SELECT * INTO v_row
  FROM public.cms_localizations
  WHERE target = 'committees'
    AND locale = p_locale
    AND partition = 'draft'
  FOR UPDATE;

  IF FOUND THEN
    v_base := CASE
      WHEN jsonb_typeof(v_row.payload) = 'array' THEN v_row.payload
      ELSE v_canonical_committees
    END;
    v_manual := COALESCE(v_row.manual_paths, '{}'::text[]);
  ELSE
    v_base := v_canonical_committees;
    v_manual := '{}'::text[];
  END IF;

  v_leaves := private.localization_leaf_paths(v_sanitized, '');
  v_address_manual := v_manual;
  IF v_leaves IS NOT NULL THEN
    FOR i IN 1 .. cardinality(v_leaves) LOOP
      v_address_manual := array_append(v_address_manual, p_committee_id || '.' || v_leaves[i]);
    END LOOP;
  END IF;
  v_manual := ARRAY(SELECT DISTINCT mp FROM unnest(v_address_manual) AS mp WHERE mp IS NOT NULL ORDER BY 1);

  SELECT jsonb_agg(
    CASE WHEN item.item_value ->> 'id' = p_committee_id THEN v_merged ELSE item.item_value END
    ORDER BY item.position_value
  )
  INTO v_next
  FROM jsonb_array_elements(v_base) WITH ORDINALITY AS item(item_value, position_value);
  IF v_next IS NULL THEN
    v_next := v_base;
  END IF;

  IF FOUND THEN
    UPDATE public.cms_localizations
    SET payload = v_next,
        status = 'draft',
        manual_paths = v_manual,
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_row.id;
  ELSE
    INSERT INTO public.cms_localizations (
      target, locale, partition, payload, status,
      manual_paths, stale_paths, updated_at, updated_by
    ) VALUES (
      'committees', p_locale, 'draft', v_next, 'draft',
      v_manual, '{}'::text[], now(), v_actor_id::text
    );
  END IF;

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.executive_can_manage_committee((SELECT auth.uid()), p_committee_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_DRAFT_AUTHORITY_CHANGED';
  END IF;

  RETURN jsonb_build_object(
    'target', 'committees',
    'locale', p_locale,
    'partition', 'draft',
    'committeeId', p_committee_id,
    'status', 'draft'
  );
END
$function$;

-- ===========================================================================
-- 5. Draft deletion: narrow to own committee (row is shared, deletion is coarse
--    but only own-committee holders may delete the shared committee row).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.delete_own_committee_draft_localization(
  p_committee_id text,
  p_locale text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_assignment public.executive_assignments%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  SELECT * INTO v_assignment
  FROM public.executive_assignments
  WHERE user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a current executive may delete own committee drafts';
  END IF;

  IF p_committee_id IS NULL
     OR p_committee_id NOT IN (
       'presidency', 'vice-presidency', 'media', 'finance',
       'supervisory', 'academic', 'activities'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_DRAFT_UNKNOWN_COMMITTEE';
  END IF;
  IF v_assignment.position_key <> 'PRESIDENT'
     AND v_assignment.committee_key IS DISTINCT FROM p_committee_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_DRAFT_FORBIDDEN';
  END IF;

  IF p_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid locale (tr or en) is required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cms_localizations_committees_' || p_locale, 0)
  );

  DELETE FROM public.cms_localizations
  WHERE target = 'committees'
    AND locale = p_locale
    AND partition = 'draft';

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.executive_can_manage_committee((SELECT auth.uid()), p_committee_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_DRAFT_AUTHORITY_CHANGED';
  END IF;

  RETURN true;
END
$function$;

-- ===========================================================================
-- 6. Grant/revoke: authenticated callers only, minimum necessary surface.
-- ===========================================================================
REVOKE ALL ON FUNCTION private.sanitize_committee_localization(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.localization_leaf_paths(jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.publish_own_committee_localization(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_own_committee_localization(text, text, jsonb)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_own_committee_draft_localization(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_own_committee_draft_localization(text, text, jsonb)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_own_committee_draft_localization(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_own_committee_draft_localization(text, text)
  TO authenticated;

COMMIT;