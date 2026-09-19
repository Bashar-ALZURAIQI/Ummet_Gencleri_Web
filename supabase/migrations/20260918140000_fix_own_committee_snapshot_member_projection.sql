-- Fix own-committee edits when persisted member rows contain private profile
-- metadata beyond the strict public snapshot shape.
--
-- publish_own_committee compares the submitted snapshot with the current
-- committee through this helper. Project persisted members to the exact
-- id/name/position/photo contract before strict normalization.

BEGIN;

CREATE OR REPLACE FUNCTION private.executive_profile_snapshot_from_committee(
  p_committee jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_members jsonb;
BEGIN
  IF p_committee IS NULL OR jsonb_typeof(p_committee) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_COMMITTEE_NOT_FOUND';
  END IF;

  IF jsonb_typeof(COALESCE(p_committee -> 'members', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_INVALID_MEMBER';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', member_item -> 'id',
        'name', member_item -> 'name',
        'position', member_item -> 'position',
        'photo', member_item -> 'photo'
      )
      ORDER BY member_position
    ),
    '[]'::jsonb
  )
  INTO v_members
  FROM jsonb_array_elements(COALESCE(p_committee -> 'members', '[]'::jsonb))
    WITH ORDINALITY AS member_rows(member_item, member_position);

  RETURN private.normalize_executive_profile_snapshot(jsonb_build_object(
    'responsibilities', COALESCE(p_committee -> 'responsibilities', '[]'::jsonb),
    'stats', COALESCE(p_committee -> 'stats', '[]'::jsonb),
    'members', v_members
  ));
END
$function$;

REVOKE EXECUTE ON FUNCTION private.executive_profile_snapshot_from_committee(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
