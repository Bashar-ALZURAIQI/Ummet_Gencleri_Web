-- Migration: 20260907060000_align_cms_localizations_authorization.sql
-- Description: Secures cms_localizations published write authorization.
--              Restores generic published write policies to President-only,
--              preventing target-wide payload tampering by normal executives.
--              Introduces a dedicated, server-enforced, narrow RPC
--              (public.publish_event_localization) permitting authorized executives
--              to publish localizations ONLY for their own allowed newly-created events.

BEGIN;

-- 1. Restore generic published write policies on public.cms_localizations to President-only
DROP POLICY IF EXISTS "cms_localizations_published_insert" ON public.cms_localizations;
CREATE POLICY "cms_localizations_published_insert"
ON public.cms_localizations
FOR INSERT
TO authenticated
WITH CHECK (
  partition = 'published'
  AND COALESCE((
    SELECT authz.is_president
    FROM private.current_user_authorization AS authz
  ), false)
);

DROP POLICY IF EXISTS "cms_localizations_published_update" ON public.cms_localizations;
CREATE POLICY "cms_localizations_published_update"
ON public.cms_localizations
FOR UPDATE
TO authenticated
USING (
  partition = 'published'
  AND COALESCE((
    SELECT authz.is_president
    FROM private.current_user_authorization AS authz
  ), false)
)
WITH CHECK (
  partition = 'published'
  AND COALESCE((
    SELECT authz.is_president
    FROM private.current_user_authorization AS authz
  ), false)
);

DROP POLICY IF EXISTS "cms_localizations_published_delete" ON public.cms_localizations;
CREATE POLICY "cms_localizations_published_delete"
ON public.cms_localizations
FOR DELETE
TO authenticated
USING (
  partition = 'published'
  AND COALESCE((
    SELECT authz.is_president
    FROM private.current_user_authorization AS authz
  ), false)
);

-- 2. Create scoped RPC for publishing event localizations by authorized executives
CREATE OR REPLACE FUNCTION public.publish_event_localization(
  p_event_id text,
  p_locale text,
  p_translation jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_is_president boolean;
  v_event_id text := NULLIF(btrim(p_event_id), '');
  v_events jsonb;
  v_canonical_event jsonb;
  v_current_payload jsonb;
  v_updated_payload jsonb;
  v_sanitized_translation jsonb;
  v_existing_row public.cms_localizations%ROWTYPE;
  v_matched boolean := false;
  v_manual_paths text[];
BEGIN
  -- 1. Authentication check
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may publish event localizations';
  END IF;

  v_is_president := (SELECT private.is_current_president());

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  -- 2. Input validation
  IF v_event_id IS NULL OR char_length(v_event_id) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event id is required';
  END IF;

  IF p_locale NOT IN ('tr', 'en') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid locale (tr or en) is required';
  END IF;

  IF p_translation IS NULL OR jsonb_typeof(p_translation) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid translation object is required';
  END IF;

  -- 3. Canonical event existence check in published_site_content
  SELECT CASE
    WHEN jsonb_typeof(published.content -> 'events') = 'array'
      THEN published.content -> 'events'
    ELSE '[]'::jsonb
  END
  INTO v_events
  FROM public.published_site_content AS published
  WHERE published.id = 'main';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Published site content is not initialized';
  END IF;

  SELECT event_item
  INTO v_canonical_event
  FROM jsonb_array_elements(v_events) AS event_item
  WHERE event_item ->> 'id' = v_event_id
  LIMIT 1;

  IF v_canonical_event IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Event not found in published events';
  END IF;

  -- 4. Authorization check for non-president
  IF NOT v_is_president THEN
    IF (v_canonical_event ->> 'createdByRole') IS DISTINCT FROM v_position THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to localize events created by another role';
    END IF;
  END IF;

  -- 5. Sanitize translation fields (allow only title, description, location)
  v_sanitized_translation := jsonb_build_object('id', v_event_id);
  IF p_translation ? 'title' AND NULLIF(btrim(p_translation ->> 'title'), '') IS NOT NULL THEN
    v_sanitized_translation := v_sanitized_translation || jsonb_build_object('title', btrim(p_translation ->> 'title'));
  END IF;
  IF p_translation ? 'description' AND NULLIF(btrim(p_translation ->> 'description'), '') IS NOT NULL THEN
    v_sanitized_translation := v_sanitized_translation || jsonb_build_object('description', btrim(p_translation ->> 'description'));
  END IF;
  IF p_translation ? 'location' AND NULLIF(btrim(p_translation ->> 'location'), '') IS NOT NULL THEN
    v_sanitized_translation := v_sanitized_translation || jsonb_build_object('location', btrim(p_translation ->> 'location'));
  END IF;

  -- 6. Lock and merge into published cms_localizations
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cms_localizations_events_' || p_locale, 0)
  );

  SELECT *
  INTO v_existing_row
  FROM public.cms_localizations
  WHERE target = 'events'
    AND locale = p_locale
    AND partition = 'published'
  FOR UPDATE;

  IF FOUND THEN
    v_current_payload := CASE
      WHEN jsonb_typeof(v_existing_row.payload) = 'array' THEN v_existing_row.payload
      ELSE '[]'::jsonb
    END;

    -- Build updated payload: update the matching element or append if not present
    SELECT jsonb_agg(
      CASE
        WHEN item ->> 'id' = v_event_id THEN v_sanitized_translation
        ELSE item
      END
    )
    INTO v_updated_payload
    FROM jsonb_array_elements(v_current_payload) AS item;

    -- Check if element existed
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_current_payload) AS item
      WHERE item ->> 'id' = v_event_id
    ) INTO v_matched;

    IF NOT v_matched THEN
      v_updated_payload := COALESCE(v_updated_payload, '[]'::jsonb) || jsonb_build_array(v_sanitized_translation);
    END IF;

    -- Prepare manual_paths
    v_manual_paths := v_existing_row.manual_paths;
    IF NOT (v_event_id || '.title' = ANY(v_manual_paths)) THEN
      v_manual_paths := array_append(v_manual_paths, v_event_id || '.title');
    END IF;

    UPDATE public.cms_localizations
    SET payload = v_updated_payload,
        status = 'fresh',
        manual_paths = v_manual_paths,
        stale_paths = array_remove(stale_paths, v_event_id || '.title'),
        updated_at = now(),
        updated_by = v_actor_id::text
    WHERE id = v_existing_row.id;

  ELSE
    v_updated_payload := jsonb_build_array(v_sanitized_translation);
    v_manual_paths := ARRAY[v_event_id || '.title'];

    INSERT INTO public.cms_localizations (
      target, locale, partition, payload, status,
      manual_paths, stale_paths, updated_at, updated_by
    ) VALUES (
      'events', p_locale, 'published', v_updated_payload, 'fresh',
      v_manual_paths, '{}'::text[], now(), v_actor_id::text
    );
  END IF;

  -- 7. Post-execution sanity check: ensure calling identity has not changed
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Executive authority changed';
  END IF;

  RETURN jsonb_build_object(
    'target', 'events',
    'locale', p_locale,
    'partition', 'published',
    'eventId', v_event_id,
    'status', 'fresh'
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.publish_event_localization(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_event_localization(text, text, jsonb)
  TO authenticated;

COMMIT;
