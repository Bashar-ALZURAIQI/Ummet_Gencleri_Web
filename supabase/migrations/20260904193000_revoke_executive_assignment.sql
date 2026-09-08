-- Revoke executive assignment to return member to student ("طالب عادي")
-- Strictly deletes only the executive assignment row without touching profiles,
-- applications, event registrations, points, or auth user rows.

CREATE OR REPLACE FUNCTION public.revoke_executive_assignment(
  target_user_id uuid
)
RETURNS TABLE (
  revoked_position text,
  revoked_user_id uuid,
  revoked_by uuid,
  revoked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_target_position text;
  v_revoked_at timestamptz := now();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A target member is required';
  END IF;

  -- Fast authorization check before waiting on lock
  IF NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may revoke an executive assignment';
  END IF;

  -- Same race-safe authority lock used by transfer_executive_assignment
  PERFORM pg_advisory_xact_lock(hashtextextended('executive_assignments.transfer', 0));

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The current president changed before revocation was locked';
  END IF;

  -- President cannot be demoted directly to student
  IF target_user_id = v_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The current president cannot revoke their own presidency to student';
  END IF;

  -- Safely lock and check target assignment
  SELECT ea.position_key
  INTO v_target_position
  FROM public.executive_assignments AS ea
  WHERE ea.user_id = target_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target_position IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Target member does not hold an executive assignment';
  END IF;

  IF v_target_position = 'PRESIDENT' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The presidency cannot be revoked directly to student';
  END IF;

  -- Delete only the target assignment row. Existing statement trigger on executive_assignments
  -- (assignments_signal_public_executive_directory) automatically bumps directory event on DELETE.
  DELETE FROM public.executive_assignments
  WHERE user_id = target_user_id;

  revoked_position := v_target_position;
  revoked_user_id := target_user_id;
  revoked_by := v_actor_id;
  revoked_at := v_revoked_at;
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.revoke_executive_assignment(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_executive_assignment(uuid) TO authenticated;
