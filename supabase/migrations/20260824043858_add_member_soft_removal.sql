-- Member removal keeps Auth, applications, and related rows.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id AND status = 'active')
WITH CHECK ((SELECT auth.uid()) = id AND status = 'active');

CREATE OR REPLACE FUNCTION public.remove_member_membership(target_user_id uuid)
RETURNS TABLE (removed_user_id uuid, membership_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_target_status text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A target member is required';
  END IF;
  IF target_user_id = v_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The current president cannot remove their own membership';
  END IF;
  IF NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may remove a member';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('executive_assignments.transfer', 0));
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The current president changed before removal was locked';
  END IF;

  SELECT p.status INTO v_target_status
  FROM public.profiles AS p
  WHERE p.id = target_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Target member profile was not found';
  END IF;
  IF v_target_status NOT IN ('active', 'removed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only an accepted member may be removed';
  END IF;

  DELETE FROM public.executive_assignments WHERE user_id = target_user_id;
  UPDATE public.profiles SET status = 'removed' WHERE id = target_user_id;
  removed_user_id := target_user_id;
  membership_status := 'removed';
  RETURN NEXT;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.remove_member_membership(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member_membership(uuid) TO authenticated;
