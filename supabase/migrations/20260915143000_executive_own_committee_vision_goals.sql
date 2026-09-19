-- Forward-only migration. The committee Vision/Goals editor (admin Profile tab)
-- must persist canonical Arabic vision/goals for the acting executive's own
-- committee directly. Existing RPCs cannot carry these fields:
--   * publish_own_committee rejects them via normalize_executive_profile_snapshot
--     (its payload is strictly the {responsibilities, stats, members} profile
--     snapshot and only those 3 keys are merged into the committee element).
--   * publish_cms_target requires the current president.
-- This adds a narrow publish_own_committee_fields RPC with the exact same
-- authorization contract as publish_own_committee: any current executive for
-- their own assigned committee, the president as an override across all
-- committees, students/non-executives denied, assignment re-checked after
-- publication, and only the matching committee element inside
-- content->'committees' is updated (vision/goals keys only).

CREATE OR REPLACE FUNCTION public.publish_own_committee_fields(
  p_committee_id text,
  p_fields jsonb,
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
  v_fields jsonb;
  v_next_committee jsonb;
  v_next_committees jsonb;
  v_index integer;
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

  IF v_assignment.position_key <> 'PRESIDENT'
     AND v_assignment.committee_key IS DISTINCT FROM p_committee_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWN_COMMITTEE_FORBIDDEN';
  END IF;

  IF p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid CMS publication input is required';
  END IF;

  -- p_fields must be an object restricted to canonical vision/goals string keys.
  IF p_fields IS NULL
     OR jsonb_typeof(p_fields) <> 'object'
     OR octet_length(p_fields::text) > 65536
     OR (SELECT count(*) FROM jsonb_object_keys(p_fields)) < 1
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_fields) AS key_name
       WHERE key_name NOT IN ('vision', 'goals')
     )
     OR (p_fields ->> 'vision' IS NOT NULL AND (jsonb_typeof(p_fields -> 'vision') <> 'string' OR char_length(btrim(p_fields ->> 'vision')) NOT BETWEEN 1 AND 5000))
     OR (p_fields ->> 'goals' IS NOT NULL AND (jsonb_typeof(p_fields -> 'goals') <> 'string' OR char_length(btrim(p_fields ->> 'goals')) NOT BETWEEN 1 AND 5000)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_INVALID_FIELDS';
  END IF;
  v_fields := jsonb_strip_nulls(jsonb_build_object(
    'vision', CASE WHEN p_fields ->> 'vision' IS NOT NULL THEN btrim(p_fields ->> 'vision') END,
    'goals', CASE WHEN p_fields ->> 'goals' IS NOT NULL THEN btrim(p_fields ->> 'goals') END
  ));

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
  v_next_committee := v_committee || v_fields;
  IF v_next_committee IS NOT DISTINCT FROM v_committee THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OWN_COMMITTEE_NO_CHANGES';
  END IF;

  -- Replace only the matched committee element and preserve array order and
  -- every other site target exactly as stored.
  SELECT jsonb_agg(
    CASE WHEN c.item ->> 'id' = p_committee_id THEN v_next_committee ELSE c.item END
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

REVOKE EXECUTE ON FUNCTION public.publish_own_committee_fields(text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.publish_own_committee_fields(text, jsonb, bigint) TO authenticated;