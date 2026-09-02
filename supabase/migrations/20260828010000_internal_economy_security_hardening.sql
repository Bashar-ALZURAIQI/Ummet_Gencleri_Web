BEGIN;

ALTER TABLE public.points_ledger
  ADD COLUMN source_key text;

UPDATE public.points_ledger
SET source_key = 'legacy:' || id::text
WHERE source_key IS NULL;

ALTER TABLE public.points_ledger
  ALTER COLUMN source_key SET NOT NULL;
ALTER TABLE public.points_ledger
  ADD CONSTRAINT points_ledger_source_key_check CHECK (
    source_key = btrim(source_key)
    AND char_length(source_key) BETWEEN 1 AND 200
  );
ALTER TABLE public.points_ledger
  ADD CONSTRAINT points_ledger_source_key_key UNIQUE (source_key);

ALTER TABLE public.points_ledger
  DROP CONSTRAINT points_ledger_amount_nonzero_check;
ALTER TABLE public.points_ledger
  ADD CONSTRAINT points_ledger_amount_range_check CHECK (
    amount BETWEEN -100000 AND 100000
    AND amount <> 0
  );

-- Students mutate enrollment intent through serialized RPCs. This prevents
-- deadline/capacity checks from being bypassed or raced through table writes.
REVOKE INSERT, UPDATE ON TABLE public.activity_enrollments FROM authenticated;
REVOKE INSERT ON TABLE public.task_enrollments FROM authenticated;

DROP POLICY IF EXISTS "activity_enrollments_own_or_admin_insert"
  ON public.activity_enrollments;
DROP POLICY IF EXISTS "activity_enrollments_own_or_admin_update"
  ON public.activity_enrollments;
DROP POLICY IF EXISTS "task_enrollments_own_or_admin_insert"
  ON public.task_enrollments;

CREATE OR REPLACE FUNCTION public.set_own_activity_enrollment(
  p_activity_id uuid,
  p_decision public.activity_decision,
  p_excuse_text text DEFAULT NULL
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_deadline timestamptz;
  v_max_capacity integer;
  v_joining_count integer;
  v_result public.activity_enrollments;
BEGIN
  IF v_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles AS profile
       WHERE profile.id = v_user_id
         AND profile.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.student_applications AS application
       WHERE application.student_user_id = v_user_id
         AND application.status = 'accepted'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted active students may update activity enrollment';
  END IF;

  SELECT activity.deadline, activity.max_capacity
  INTO v_deadline, v_max_capacity
  FROM public.activities AS activity
  WHERE activity.id = p_activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Activity not found';
  END IF;

  IF v_deadline <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Activity enrollment is closed';
  END IF;

  IF p_decision = 'JOINING'::public.activity_decision
     AND v_max_capacity IS NOT NULL THEN
    SELECT count(*)::integer
    INTO v_joining_count
    FROM public.activity_enrollments AS enrollment
    WHERE enrollment.activity_id = p_activity_id
      AND enrollment.student_id <> v_user_id
      AND enrollment.decision = 'JOINING'::public.activity_decision;

    IF v_joining_count >= v_max_capacity THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Activity capacity is full';
    END IF;
  END IF;

  INSERT INTO public.activity_enrollments (
    activity_id,
    student_id,
    decision,
    excuse_text
  )
  VALUES (
    p_activity_id,
    v_user_id,
    p_decision,
    NULLIF(btrim(p_excuse_text), '')
  )
  ON CONFLICT (activity_id, student_id) DO UPDATE
  SET decision = EXCLUDED.decision,
      excuse_text = EXCLUDED.excuse_text
  RETURNING * INTO v_result;

  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.register_for_task(p_task_id uuid)
RETURNS public.task_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_deadline timestamptz;
  v_required_students integer;
  v_status public.task_status;
  v_enrollment_count integer;
  v_result public.task_enrollments;
BEGIN
  IF v_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles AS profile
       WHERE profile.id = v_user_id
         AND profile.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.student_applications AS application
       WHERE application.student_user_id = v_user_id
         AND application.status = 'accepted'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted active students may register for tasks';
  END IF;

  SELECT task.deadline, task.required_students, task.status
  INTO v_deadline, v_required_students, v_status
  FROM public.tasks AS task
  WHERE task.id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Task not found';
  END IF;

  SELECT * INTO v_result
  FROM public.task_enrollments AS enrollment
  WHERE enrollment.task_id = p_task_id
    AND enrollment.student_id = v_user_id;

  IF FOUND THEN
    RETURN v_result;
  END IF;

  IF v_status <> 'OPEN'::public.task_status OR v_deadline <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Task registration is closed';
  END IF;

  SELECT count(*)::integer
  INTO v_enrollment_count
  FROM public.task_enrollments AS enrollment
  WHERE enrollment.task_id = p_task_id;

  IF v_enrollment_count >= v_required_students THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Task capacity is full';
  END IF;

  INSERT INTO public.task_enrollments (task_id, student_id)
  VALUES (p_task_id, v_user_id)
  RETURNING * INTO v_result;

  IF v_enrollment_count + 1 >= v_required_students THEN
    UPDATE public.tasks
    SET status = 'FULL'::public.task_status
    WHERE id = p_task_id;
  END IF;

  RETURN v_result;
END
$function$;

-- The financial ledger has no browser table mutation surface. Managers create
-- entries through an idempotent, validated RPC; corrections remain new entries.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.points_ledger
  FROM authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.points_ledger TO service_role;

CREATE OR REPLACE FUNCTION public.record_points_transaction(
  p_student_id uuid,
  p_amount integer,
  p_reason text,
  p_source_key text
)
RETURNS public.points_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_reason text := btrim(p_reason);
  v_source_key text := btrim(p_source_key);
  v_result public.points_ledger;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_user_id
      AND assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to record points';
  END IF;

  IF p_amount IS NULL OR p_amount = 0 OR p_amount NOT BETWEEN -100000 AND 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Points amount is outside the allowed range';
  END IF;

  IF v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Points reason is invalid';
  END IF;

  IF v_source_key IS NULL OR char_length(v_source_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Points source key is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.student_applications AS application
      ON application.student_user_id = profile.id
     AND application.status = 'accepted'
    WHERE profile.id = p_student_id
      AND profile.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Points target is not an accepted active student';
  END IF;

  INSERT INTO public.points_ledger (
    student_id,
    amount,
    reason,
    created_by,
    source_key
  )
  VALUES (
    p_student_id,
    p_amount,
    v_reason,
    v_user_id,
    v_source_key
  )
  ON CONFLICT (source_key) DO NOTHING
  RETURNING * INTO v_result;

  IF FOUND THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_result
  FROM public.points_ledger AS entry
  WHERE entry.source_key = v_source_key;

  IF v_result.student_id <> p_student_id
     OR v_result.amount <> p_amount
     OR v_result.reason <> v_reason
     OR v_result.created_by <> v_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Points source key already belongs to a different transaction';
  END IF;

  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.review_activity_enrollment(
  p_activity_id uuid,
  p_student_id uuid,
  p_excuse_status public.excuse_review_status,
  p_attendance_status public.attendance_status
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_excuse_text text;
  v_deadline timestamptz;
  v_result public.activity_enrollments;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = (SELECT auth.uid())
      AND assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to review activity enrollment';
  END IF;

  SELECT enrollment.excuse_text, activity.deadline
  INTO v_excuse_text, v_deadline
  FROM public.activity_enrollments AS enrollment
  JOIN public.activities AS activity ON activity.id = enrollment.activity_id
  WHERE enrollment.activity_id = p_activity_id
    AND enrollment.student_id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Activity enrollment not found';
  END IF;

  IF (v_excuse_text IS NULL AND p_excuse_status IS NOT NULL)
     OR (v_excuse_text IS NOT NULL AND p_excuse_status IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Excuse review does not match the submitted excuse';
  END IF;

  IF p_attendance_status IS NOT NULL AND v_deadline > now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Attendance cannot be reviewed before the activity deadline';
  END IF;

  UPDATE public.activity_enrollments
  SET excuse_status = p_excuse_status,
      attendance_status = p_attendance_status
  WHERE activity_id = p_activity_id
    AND student_id = p_student_id
  RETURNING * INTO v_result;

  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.set_member_tier(
  p_student_id uuid,
  p_current_tier text
)
RETURNS TABLE (student_id uuid, total_points integer, current_tier text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = (SELECT auth.uid())
      AND assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to update member tier';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.student_applications AS application
      ON application.student_user_id = profile.id
     AND application.status = 'accepted'
    WHERE profile.id = p_student_id
      AND profile.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Tier target is not an accepted active student';
  END IF;

  RETURN QUERY
  UPDATE public.profiles AS profile
  SET current_tier = upper(btrim(p_current_tier))
  WHERE profile.id = p_student_id
  RETURNING profile.id, profile.total_points, profile.current_tier;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.set_own_activity_enrollment(
  uuid, public.activity_decision, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.register_for_task(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.record_points_transaction(uuid, integer, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.set_own_activity_enrollment(
  uuid, public.activity_decision, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_points_transaction(uuid, integer, text, text)
  TO authenticated;

COMMIT;
