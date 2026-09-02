BEGIN;

-- Direct table reads must not let the former academic excuse manager inspect
-- other students' excuses. Attendance auditors use their dedicated RPCs.
DROP POLICY IF EXISTS "activity_enrollments_own_or_admin_select"
  ON public.activity_enrollments;
DROP POLICY IF EXISTS "activity_enrollments_self_or_excuse_managers_select"
  ON public.activity_enrollments;
CREATE POLICY "activity_enrollments_self_or_excuse_managers_select"
ON public.activity_enrollments
FOR SELECT
TO authenticated
USING (
  student_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = (SELECT auth.uid())
      AND assignment.position_key IN ('PRESIDENT', 'VICE_PRESIDENT')
  )
);

CREATE OR REPLACE FUNCTION public.list_pending_mandatory_excuses()
RETURNS TABLE (
  enrollment_id uuid,
  activity_id uuid,
  activity_title text,
  student_id uuid,
  student_name text,
  avatar_path text,
  excuse_text text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT', 'VICE_PRESIDENT'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to review excuses';
  END IF;

  RETURN QUERY
  SELECT
    enrollment.id,
    activity.id,
    activity.title,
    profile.id,
    profile.name,
    profile.avatar_path,
    enrollment.excuse_text,
    enrollment.updated_at
  FROM public.activity_enrollments AS enrollment
  JOIN public.activities AS activity ON activity.id = enrollment.activity_id
  JOIN public.profiles AS profile ON profile.id = enrollment.student_id
  WHERE activity.type = 'MANDATORY'
    AND enrollment.decision = 'DECLINING'
    AND enrollment.excuse_text IS NOT NULL
    AND enrollment.excuse_status = 'PENDING'
  ORDER BY enrollment.updated_at, enrollment.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_activity_excuse(
  p_enrollment_id uuid,
  p_status public.excuse_review_status
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.activity_enrollments;
  v_actor uuid := (SELECT auth.uid());
  v_amount integer;
  v_is_executive boolean;
  v_notification_body text;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT', 'VICE_PRESIDENT'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to review excuses';
  END IF;
  IF p_status NOT IN ('ACCEPTED', 'PARTIAL', 'REJECTED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A final excuse decision is required';
  END IF;

  SELECT enrollment.*
  INTO v_row
  FROM public.activity_enrollments AS enrollment
  JOIN public.activities AS activity ON activity.id = enrollment.activity_id
  WHERE enrollment.id = p_enrollment_id
    AND activity.type = 'MANDATORY'
    AND enrollment.decision = 'DECLINING'
  FOR UPDATE OF enrollment;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending excuse not found';
  END IF;
  IF v_row.excuse_status <> 'PENDING' THEN
    RETURN v_row;
  END IF;

  UPDATE public.activity_enrollments
  SET excuse_status = p_status
  WHERE id = p_enrollment_id
  RETURNING * INTO v_row;

  SELECT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_row.student_id
  ) INTO v_is_executive;

  v_amount := CASE
    WHEN v_is_executive THEN 0
    WHEN p_status = 'PARTIAL' THEN -5
    WHEN p_status = 'REJECTED' THEN -15
    ELSE 0
  END;

  IF v_amount <> 0 THEN
    INSERT INTO public.points_ledger (
      student_id, amount, reason, created_by, source_key
    ) VALUES (
      v_row.student_id,
      v_amount,
      CASE p_status
        WHEN 'PARTIAL' THEN 'عذر مقنع جزئياً'
        ELSE 'عذر غير مقنع'
      END,
      v_actor,
      'excuse:' || p_enrollment_id
    )
    ON CONFLICT (source_key) DO NOTHING;
    PERFORM private.refresh_top_ten_state(true);
  END IF;

  v_notification_body := CASE
    WHEN v_is_executive AND p_status = 'ACCEPTED' THEN 'تم قبول عذرك دون تغيير في النقاط.'
    WHEN v_is_executive AND p_status = 'PARTIAL' THEN 'تم قبول عذرك جزئياً دون تغيير في النقاط لأنك ضمن الهيئة التنفيذية.'
    WHEN v_is_executive THEN 'لم يُقبل العذر، دون تغيير في النقاط لأنك ضمن الهيئة التنفيذية.'
    WHEN p_status = 'ACCEPTED' THEN 'تم قبول عذرك دون خصم نقاط.'
    WHEN p_status = 'PARTIAL' THEN 'تم قبول عذرك جزئياً وخصم 5 نقاط.'
    ELSE 'لم يُقبل العذر وتم خصم 15 نقطة.'
  END;

  PERFORM private.enqueue_personal_economy_push(
    v_row.student_id,
    'economy:excuse:' || p_enrollment_id,
    'تم تقييم عذرك',
    v_notification_body
  );
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_managed_tasks()
RETURNS TABLE (
  task_id uuid,
  task_title text,
  task_description text,
  points_reward integer,
  required_students integer,
  deadline timestamptz,
  task_status public.task_status,
  enrollment_count integer,
  created_by uuid,
  created_by_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_president boolean;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_actor
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to manage tasks';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_actor
      AND assignment.position_key = 'PRESIDENT'
  ) INTO v_is_president;

  RETURN QUERY
  SELECT
    task.id,
    task.title,
    task.description,
    task.points_reward,
    task.required_students,
    task.deadline,
    task.status,
    count(enrollment.student_id)::integer,
    task.created_by,
    COALESCE(NULLIF(btrim(creator.name), ''), 'عضو الهيئة')
  FROM public.tasks AS task
  LEFT JOIN public.task_enrollments AS enrollment ON enrollment.task_id = task.id
  LEFT JOIN public.profiles AS creator ON creator.id = task.created_by
  WHERE task.status IN ('OPEN', 'FULL')
    AND task.evaluation_closed_at IS NULL
    AND (v_is_president OR task.created_by = v_actor)
  GROUP BY task.id, creator.name
  ORDER BY task.deadline, task.created_at, task.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_managed_task_enrollments(p_task_id uuid)
RETURNS TABLE (
  task_id uuid,
  task_title text,
  points_reward integer,
  deadline timestamptz,
  student_id uuid,
  student_name text,
  avatar_path text,
  completion_status public.task_completion_status
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_task public.tasks;
  v_is_president boolean;
BEGIN
  SELECT * INTO v_task
  FROM public.tasks AS task
  WHERE task.id = p_task_id;

  IF NOT FOUND OR v_task.status = 'CLOSED' OR v_task.evaluation_closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Active task not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_actor
      AND assignment.position_key = 'PRESIDENT'
  ) INTO v_is_president;

  IF v_actor IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.executive_assignments AS assignment
       WHERE assignment.user_id = v_actor
     )
     OR NOT (v_is_president OR v_task.created_by = v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to manage this task';
  END IF;

  RETURN QUERY
  SELECT
    v_task.id,
    v_task.title,
    v_task.points_reward,
    v_task.deadline,
    profile.id,
    profile.name,
    profile.avatar_path,
    enrollment.completion_status
  FROM public.task_enrollments AS enrollment
  JOIN public.profiles AS profile ON profile.id = enrollment.student_id
  WHERE enrollment.task_id = p_task_id
  ORDER BY enrollment.created_at, profile.name, profile.id;
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
  v_actor uuid := (SELECT auth.uid());
  v_task public.tasks;
  v_is_president boolean;
  v_result public.task_enrollments;
BEGIN
  IF p_status = 'PENDING' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A final task status is required';
  END IF;

  SELECT * INTO v_task
  FROM public.tasks AS task
  WHERE task.id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Task not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_actor
      AND assignment.position_key = 'PRESIDENT'
  ) INTO v_is_president;

  IF v_actor IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.executive_assignments AS assignment
       WHERE assignment.user_id = v_actor
     )
     OR NOT (v_is_president OR v_task.created_by = v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to manage this task';
  END IF;
  IF v_task.status = 'CLOSED' OR v_task.evaluation_closed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Task evaluation is closed';
  END IF;

  UPDATE public.task_enrollments
  SET completion_status = p_status
  WHERE task_id = p_task_id
    AND student_id = p_student_id
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Task enrollment not found';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_task_evaluation(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_task public.tasks;
  v_is_president boolean;
  v_row record;
  v_amount integer;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_task
  FROM public.tasks AS task
  WHERE task.id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Task not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_actor
      AND assignment.position_key = 'PRESIDENT'
  ) INTO v_is_president;

  IF v_actor IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.executive_assignments AS assignment
       WHERE assignment.user_id = v_actor
     )
     OR NOT (v_is_president OR v_task.created_by = v_actor) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to finalize this task';
  END IF;

  IF v_task.status = 'CLOSED' OR v_task.evaluation_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'taskId', p_task_id,
      'alreadyFinalized', true,
      'ledgerEntries', 0
    );
  END IF;

  PERFORM 1
  FROM public.task_enrollments
  WHERE task_id = p_task_id
  ORDER BY student_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.task_enrollments
    WHERE task_id = p_task_id
      AND completion_status = 'PENDING'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Every enrolled student requires task evaluation';
  END IF;

  FOR v_row IN
    SELECT enrollment.*
    FROM public.task_enrollments AS enrollment
    WHERE enrollment.task_id = p_task_id
    ORDER BY enrollment.student_id
  LOOP
    v_amount := CASE v_row.completion_status
      WHEN 'PERFECT' THEN v_task.points_reward
      WHEN 'PARTIAL' THEN round(v_task.points_reward * 0.50)::integer
      ELSE 0
    END;

    IF v_amount <> 0 THEN
      INSERT INTO public.points_ledger (
        student_id, amount, reason, created_by, source_key
      ) VALUES (
        v_row.student_id,
        v_amount,
        'نتيجة المهمة: ' || v_task.title,
        v_actor,
        'task-result:' || p_task_id || ':' || v_row.student_id
      )
      ON CONFLICT (source_key) DO NOTHING;
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.tasks
  SET status = 'CLOSED',
      evaluation_closed_at = now(),
      evaluation_closed_by = v_actor
  WHERE id = p_task_id;

  IF v_count > 0 THEN
    PERFORM private.refresh_top_ten_state(true);
  END IF;

  RETURN jsonb_build_object(
    'taskId', p_task_id,
    'alreadyFinalized', false,
    'ledgerEntries', v_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_pending_mandatory_excuses()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.review_activity_excuse(uuid, public.excuse_review_status)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.list_task_evaluations()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.list_managed_tasks()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.list_managed_task_enrollments(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_task_completion(uuid, uuid, public.task_completion_status)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_task_evaluation(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_pending_mandatory_excuses()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_activity_excuse(uuid, public.excuse_review_status)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_managed_tasks()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_managed_task_enrollments(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_task_completion(uuid, uuid, public.task_completion_status)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_task_evaluation(uuid)
  TO authenticated;

COMMIT;
