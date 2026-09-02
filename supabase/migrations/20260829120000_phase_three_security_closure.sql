BEGIN;

-- Phase three replaces these broad legacy mutation surfaces with narrowly
-- scoped RPCs. Keeping them callable would let an authenticated executive
-- bypass the new role matrix, atomic finalization, and notification flow.
REVOKE EXECUTE ON FUNCTION public.record_points_transaction(uuid, integer, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.review_activity_enrollment(
  uuid, uuid, public.excuse_review_status, public.attendance_status
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.review_task_enrollment(
  uuid, uuid, public.task_completion_status
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_member_tier(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Locking the parent row gives draft saves and finalization one serialization
-- point. A save waiting behind finalization therefore observes the closed
-- state and cannot mutate an archived evaluation.
CREATE OR REPLACE FUNCTION public.save_activity_attendance(
  p_activity_id uuid,
  p_student_id uuid,
  p_status public.attendance_status
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_closed_at timestamptz;
  v_result public.activity_enrollments;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not authorized to evaluate attendance';
  END IF;

  SELECT activity.evaluation_closed_at
  INTO v_closed_at
  FROM public.activities AS activity
  WHERE activity.id = p_activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Activity not found';
  END IF;
  IF v_closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Activity evaluation is closed';
  END IF;

  UPDATE public.activity_enrollments
  SET attendance_status = p_status
  WHERE activity_id = p_activity_id
    AND student_id = p_student_id
    AND decision = 'JOINING'
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Joining enrollment not found';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_task_completion(
  p_task_id uuid,
  p_student_id uuid,
  p_status public.task_completion_status
)
RETURNS public.task_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_closed_at timestamptz;
  v_result public.task_enrollments;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not authorized to evaluate tasks';
  END IF;
  IF p_status = 'PENDING' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A final task status is required';
  END IF;

  SELECT task.evaluation_closed_at
  INTO v_closed_at
  FROM public.tasks AS task
  WHERE task.id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Task not found';
  END IF;
  IF v_closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Task evaluation is closed';
  END IF;

  UPDATE public.task_enrollments
  SET completion_status = p_status
  WHERE task_id = p_task_id
    AND student_id = p_student_id
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Task enrollment not found';
  END IF;
  RETURN v_result;
END;
$function$;

COMMIT;
