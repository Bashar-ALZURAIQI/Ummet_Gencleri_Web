-- Forward-only migration. Committee localization publishes and drafts route
-- through the narrow own-committee RPCs, but those RPCs never persisted the
-- canonical source_hash the client computes. Without a stored source_hash, a
-- published/draft row cannot be matched against later canonical growth, so
-- previously-persisted hashes are never refreshed and fresh saves keep reporting
-- stale/archived in the translation monitor. This migration gives
-- publish_own_committee_localization and save_own_committee_draft_localization
-- an optional p_source_hash argument and persists it on both UPDATE and INSERT.

-- ===========================================================================
-- 1. Published partition: persist the canonical source hash.
-- ===========================================================================
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
  v_sanitized jsonb;
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
        source_hash = v_source_hash,
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_row.id;
  ELSE
    INSERT INTO public.cms_localizations (
      target, locale, partition, payload, status,
      manual_paths, stale_paths, source_hash, updated_at, updated_by
    ) VALUES (
      'committees', p_locale, 'published', v_next, 'fresh',
      v_manual, v_stale_kept, v_source_hash, now(), v_actor_id::text
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
-- 2. Draft partition: persist the canonical source hash.
-- ===========================================================================
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
  v_sanitized jsonb;
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
        source_hash = v_source_hash,
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_row.id;
  ELSE
    INSERT INTO public.cms_localizations (
      target, locale, partition, payload, status,
      manual_paths, stale_paths, source_hash, updated_at, updated_by
    ) VALUES (
      'committees', p_locale, 'draft', v_next, 'draft',
      v_manual, '{}'::text[], v_source_hash, now(), v_actor_id::text
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
-- 3. Grant/revoke: authenticated callers only, minimum necessary surface.
--    Adding the p_source_hash argument creates new function identities, so the
--    previous grants on the 3-argument forms are replaced without broadening.
-- ===========================================================================
REVOKE EXECUTE ON FUNCTION public.publish_own_committee_localization(text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_own_committee_localization(text, text, jsonb, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_own_committee_draft_localization(text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_own_committee_draft_localization(text, text, jsonb, text)
  TO authenticated;

COMMIT;