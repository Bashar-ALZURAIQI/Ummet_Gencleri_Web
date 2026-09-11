-- Direct own-committee content management for current executives.
--
-- Every current executive may manage the institutional content (responsibilities,
-- statistics, committee members) of the committee they are currently assigned to,
-- without a pending-approval request or a president's review. The president keeps
-- an override across all committees. Students and non-executive callers are denied.
-- Only the single matching committee element inside content->'committees' is
-- replaced; every other site target and every other committee stays untouched.
-- No edit_requests row is created or consumed.

CREATE OR REPLACE FUNCTION private.executive_can_manage_committee(
  p_user_id uuid,
  p_committee_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS ea
    WHERE ea.user_id = p_user_id
      AND (
        ea.position_key = 'PRESIDENT'
        OR ea.committee_key = p_committee_id
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.publish_own_committee(
  p_committee_id text,
  p_snapshot jsonb,
  p_expected_version bigint
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
  v_committees jsonb;
  v_committee jsonb;
  v_current_snapshot jsonb;
  v_snapshot jsonb;
  v_index integer;
  v_next_committees jsonb;
  v_publication jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  SELECT * INTO v_assignment
  FROM public.executive_assignments
  WHERE user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a current executive may manage own committee content';
  END IF;

  IF p_committee_id IS NULL
     OR p_committee_id NOT IN (
       'presidency', 'vice-presidency', 'media', 'finance',
       'supervisory', 'academic', 'activities'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_UNKNOWN_COMMITTEE';
  END IF;

  -- The single assignment row is authoritative: a non-president may only touch
  -- the committee bound to their current assignment (checked again after publish).
  IF v_assignment.position_key <> 'PRESIDENT'
     AND v_assignment.committee_key IS DISTINCT FROM p_committee_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_FORBIDDEN';
  END IF;

  IF p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid CMS publication input is required';
  END IF;

  BEGIN
    -- Latest-profile normalization with no identity source keeps member photos
    -- as submitted while strictly validating shape, limits, and duplicate ids.
    v_snapshot := private.normalize_executive_profile_snapshot(p_snapshot);
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_INVALID_SNAPSHOT';
  END;

  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(v_site.content -> 'committees') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_SOURCE_NOT_FOUND';
  END IF;
  v_committees := v_site.content -> 'committees';

  SELECT position::int - 1 INTO v_index
  FROM jsonb_array_elements(v_committees) WITH ORDINALITY AS c(item, position)
  WHERE c.item ->> 'id' = p_committee_id;
  IF v_index IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'OWN_COMMITTEE_NOT_FOUND';
  END IF;

  SELECT c.item INTO v_committee
  FROM jsonb_array_elements(v_committees) WITH ORDINALITY AS c(item, position)
  WHERE c.position::int = v_index + 1;
  v_current_snapshot := private.executive_profile_snapshot_from_committee(v_committee);
  IF v_current_snapshot IS NOT DISTINCT FROM v_snapshot THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_NO_CHANGES';
  END IF;

  -- Replace only the matched committee element and preserve array order and
  -- every other site target exactly as stored.
  SELECT jsonb_agg(
    CASE WHEN c.item ->> 'id' = p_committee_id THEN c.item || v_snapshot ELSE c.item END
    ORDER BY c.position
  ) INTO v_next_committees
  FROM jsonb_array_elements(v_committees) WITH ORDINALITY AS c(item, position);

  v_publication := private.publish_cms_target_locked(
    v_actor_id,
    'committees',
    v_next_committees,
    p_expected_version
  );

  -- If the caller lost their assignment mid-publication (role transfer or
  -- revocation), roll the whole operation back instead of publishing.
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.executive_can_manage_committee((SELECT auth.uid()), p_committee_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_AUTHORITY_CHANGED';
  END IF;

  RETURN v_publication;
EXCEPTION
  WHEN serialization_failure THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
END
$function$;

REVOKE EXECUTE ON FUNCTION private.executive_can_manage_committee(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.publish_own_committee(text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.publish_own_committee(text, jsonb, bigint) TO authenticated;