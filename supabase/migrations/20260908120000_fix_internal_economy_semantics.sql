BEGIN;

-- ===========================================================================
-- 1. Activities Update Policy: Preserve Manager-Only Direct Table Updates
-- ===========================================================================

DROP POLICY IF EXISTS "activities_admin_update" ON public.activities;

CREATE POLICY "activities_admin_update"
ON public.activities
FOR UPDATE
TO authenticated
USING (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
)
WITH CHECK (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
);

-- ===========================================================================
-- 2. Upsert Event Activity: Authorize Creator Updates & Protect Finalized
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.upsert_event_activity(
  p_public_event_id text,
  p_title text,
  p_description text,
  p_type public.activity_type,
  p_points_value integer,
  p_max_capacity integer,
  p_deadline timestamptz
)
RETURNS public.activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_public_event_id text := btrim(p_public_event_id);
  v_title text := btrim(p_title);
  v_description text := btrim(p_description);
  v_position text;
  v_existing_activity_id uuid;
  v_existing_created_by uuid;
  v_existing_closed_at timestamptz;
  v_existing_type public.activity_type;
  v_existing_points integer;
  v_existing_capacity integer;
  v_existing_deadline timestamptz;
  v_joining_count integer;
  v_result public.activities;
BEGIN
  IF v_user_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to create activities';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_user_id;

  IF char_length(v_public_event_id) NOT BETWEEN 1 AND 200
     OR char_length(v_title) NOT BETWEEN 1 AND 200
     OR char_length(v_description) NOT BETWEEN 1 AND 8000
     OR p_points_value IS NULL OR p_points_value NOT BETWEEN 0 AND 100000
     OR p_max_capacity IS NULL OR p_max_capacity <= 0
     OR p_deadline IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid activity fields are required';
  END IF;

  IF p_type = 'PAID'::public.activity_type AND p_points_value <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Paid activities require a positive points value';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_public_event_id, 0));

  SELECT activity.id, activity.created_by, activity.evaluation_closed_at,
         activity.type, activity.points_value, activity.max_capacity, activity.deadline
  INTO v_existing_activity_id, v_existing_created_by, v_existing_closed_at,
       v_existing_type, v_existing_points, v_existing_capacity, v_existing_deadline
  FROM public.activities AS activity
  WHERE activity.public_event_id = v_public_event_id
  FOR UPDATE;

  -- Authorization check: Creator can edit own activity; PRESIDENT, ACADEMIC_HEAD, AUDIT_HEAD retain management authority
  -- created_by = v_user_id means the caller is the original creator of this activity
  IF v_existing_activity_id IS NOT NULL THEN
    IF v_position NOT IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
       AND v_existing_created_by <> v_user_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to update existing activities';
    END IF;

    -- Finalized activity safety: protect economic history from silent mutation
    IF v_existing_closed_at IS NOT NULL THEN
      IF p_type <> v_existing_type
         OR p_points_value <> v_existing_points
         OR p_max_capacity <> v_existing_capacity
         OR p_deadline <> v_existing_deadline THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cannot alter economic settings of an already finalized activity';
      END IF;
    END IF;
  END IF;

  IF v_existing_activity_id IS NULL THEN
    v_joining_count := 0;
  ELSE
    SELECT count(*)::integer
    INTO v_joining_count
    FROM public.activity_enrollments AS enrollment
    WHERE enrollment.activity_id = v_existing_activity_id
      AND enrollment.decision = 'JOINING'::public.activity_decision;
  END IF;

  IF p_max_capacity < v_joining_count THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Activity capacity cannot be lower than confirmed joining count';
  END IF;

  -- Insert or update while preserving original created_by
  INSERT INTO public.activities (
    public_event_id, title, description, created_by, type,
    points_value, max_capacity, deadline
  ) VALUES (
    v_public_event_id, v_title, v_description, v_user_id, p_type,
    p_points_value, p_max_capacity, p_deadline
  )
  ON CONFLICT (public_event_id) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      type = EXCLUDED.type,
      points_value = EXCLUDED.points_value,
      max_capacity = EXCLUDED.max_capacity,
      deadline = EXCLUDED.deadline
  RETURNING * INTO v_result;

  RETURN v_result;
END
$function$;

-- ===========================================================================
-- 3. Register For Task: Align with Activity Participation (Executive Access)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.register_for_task(p_task_id uuid)
RETURNS public.task_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_is_executive boolean := false;
  v_is_accepted_student boolean := false;
  v_deadline timestamptz;
  v_required_students integer;
  v_status public.task_status;
  v_enrollment_count integer;
  v_result public.task_enrollments;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.executive_assignments AS assignment
      WHERE assignment.user_id = v_user_id
    ) INTO v_is_executive;

    IF NOT v_is_executive THEN
      v_is_accepted_student := (SELECT private.is_accepted_active_student(v_user_id));
    END IF;
  END IF;

  IF v_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles AS profile
       WHERE profile.id = v_user_id
         AND profile.status = 'active'
     )
     OR NOT (v_is_executive OR v_is_accepted_student) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted active students or current executives may register for tasks';
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
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Task is already full';
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

-- ===========================================================================
-- 4. Finalize Task Evaluation: Enforce Executive Economy Exemption
-- ===========================================================================

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
    SELECT
      enrollment.*,
      EXISTS (
        SELECT 1
        FROM public.executive_assignments AS assignment
        WHERE assignment.user_id = enrollment.student_id
      ) AS economy_exempt
    FROM public.task_enrollments AS enrollment
    WHERE enrollment.task_id = p_task_id
    ORDER BY enrollment.student_id
  LOOP
    v_amount := CASE
      WHEN v_row.economy_exempt THEN 0
      WHEN v_row.completion_status = 'PERFECT' THEN v_task.points_reward
      WHEN v_row.completion_status = 'PARTIAL' THEN round(v_task.points_reward * 0.50)::integer
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
  SET status = 'CLOSED'::public.task_status,
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

-- ===========================================================================
-- 5. Finalize Activity Evaluation: Mandatory IGNORED Penalty (-20)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.finalize_activity_evaluation(p_activity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_activity public.activities;
  v_actor uuid := (SELECT auth.uid());
  v_row record;
  v_amount integer;
  v_count integer := 0;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT', 'AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to finalize attendance';
  END IF;

  SELECT * INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Activity not found';
  END IF;
  IF v_activity.evaluation_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('activityId', p_activity_id, 'alreadyFinalized', true, 'ledgerEntries', 0);
  END IF;

  PERFORM 1
  FROM public.activity_enrollments
  WHERE activity_id = p_activity_id
    AND decision = 'JOINING'
  ORDER BY student_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.activity_enrollments
    WHERE activity_id = p_activity_id
      AND decision = 'JOINING'
      AND attendance_status IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Every joining student requires attendance evaluation';
  END IF;

  -- 1. Evaluate JOINING students
  FOR v_row IN
    SELECT
      enrollment.*,
      EXISTS (
        SELECT 1
        FROM public.executive_assignments AS assignment
        WHERE assignment.user_id = enrollment.student_id
      ) AS economy_exempt
    FROM public.activity_enrollments AS enrollment
    WHERE enrollment.activity_id = p_activity_id
      AND enrollment.decision = 'JOINING'
    ORDER BY enrollment.student_id
  LOOP
    v_amount := CASE
      WHEN v_row.economy_exempt THEN 0
      WHEN v_row.attendance_status = 'ABSENT' AND v_activity.type = 'MANDATORY' THEN -20
      WHEN v_activity.type = 'PAID' OR v_row.attendance_status = 'ABSENT' THEN 0
      WHEN v_row.attendance_status = 'ON_TIME' THEN v_activity.points_value
      WHEN v_row.attendance_status = 'LATE' THEN round(v_activity.points_value * 0.75)::integer
      WHEN v_row.attendance_status = 'VERY_LATE' THEN round(v_activity.points_value * 0.30)::integer
      ELSE 0
    END;

    IF v_amount <> 0 THEN
      INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
      VALUES (
        v_row.student_id,
        v_amount,
        'نتيجة النشاط: ' || v_activity.title,
        v_actor,
        'activity-result:' || p_activity_id || ':' || v_row.student_id
      )
      ON CONFLICT (source_key) DO NOTHING;
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- 2. Evaluate MANDATORY ignored / no-response students
  IF v_activity.type = 'MANDATORY' THEN
    FOR v_row IN
      SELECT
        p.id AS student_id,
        EXISTS (
          SELECT 1
          FROM public.executive_assignments AS assignment
          WHERE assignment.user_id = p.id
        ) AS economy_exempt
      FROM public.profiles AS p
      JOIN public.student_applications AS app
        ON app.student_user_id = p.id
      WHERE p.status = 'active'
        AND app.status = 'accepted'
        AND NOT EXISTS (
          SELECT 1
          FROM public.activity_enrollments AS enrollment
          WHERE enrollment.activity_id = p_activity_id
            AND enrollment.student_id = p.id
            AND enrollment.decision IN ('JOINING', 'DECLINING')
        )
      ORDER BY p.id
    LOOP
      -- Upsert enrollment row as IGNORED
      INSERT INTO public.activity_enrollments (activity_id, student_id, decision)
      VALUES (p_activity_id, v_row.student_id, 'IGNORED')
      ON CONFLICT (activity_id, student_id) DO UPDATE
      SET decision = 'IGNORED'
      WHERE public.activity_enrollments.decision NOT IN ('JOINING', 'DECLINING');

      v_amount := CASE
        WHEN v_row.economy_exempt THEN 0
        ELSE -20
      END;

      IF v_amount <> 0 THEN
        INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
        VALUES (
          v_row.student_id,
          v_amount,
          'عدم الاستجابة للنشاط الإلزامي: ' || v_activity.title,
          v_actor,
          'activity-result:' || p_activity_id || ':' || v_row.student_id
        )
        ON CONFLICT (source_key) DO NOTHING;
        IF FOUND THEN
          v_count := v_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.activities
  SET evaluation_closed_at = now(),
      evaluation_closed_by = v_actor
  WHERE id = p_activity_id;

  IF v_count > 0 THEN
    PERFORM private.refresh_top_ten_state(true);
  END IF;
  RETURN jsonb_build_object('activityId', p_activity_id, 'alreadyFinalized', false, 'ledgerEntries', v_count);
END;
$function$;

-- ===========================================================================
-- 6. List Activity Evaluations: Support Ignored & Zero Joiners
-- ===========================================================================

-- The return table shape changed (a decision column was added).
-- PostgreSQL cannot change OUT/RETURNS TABLE columns with CREATE OR REPLACE,
-- so drop the old zero-argument function first, then recreate it below.
DROP FUNCTION IF EXISTS public.list_activity_evaluations();

CREATE FUNCTION public.list_activity_evaluations()
RETURNS TABLE (
  activity_id uuid,
  activity_title text,
  activity_type public.activity_type,
  points_value integer,
  deadline timestamptz,
  evaluation_closed_at timestamptz,
  student_id uuid,
  student_name text,
  avatar_path text,
  attendance_status public.attendance_status,
  decision public.activity_decision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT', 'AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to evaluate attendance';
  END IF;

  RETURN QUERY
  -- 1. JOINING enrollments for unclosed activities
  SELECT
    a.id, a.title, a.type, a.points_value, a.deadline, a.evaluation_closed_at,
    p.id, p.name, p.avatar_path, e.attendance_status, e.decision
  FROM public.activities a
  JOIN public.activity_enrollments e ON e.activity_id = a.id
  JOIN public.profiles p ON p.id = e.student_id
  WHERE e.decision = 'JOINING'
    AND a.evaluation_closed_at IS NULL

  UNION ALL

  -- 2. Explicitly IGNORED enrollments for unclosed activities
  SELECT
    a.id, a.title, a.type, a.points_value, a.deadline, a.evaluation_closed_at,
    p.id, p.name, p.avatar_path, NULL::public.attendance_status, e.decision
  FROM public.activities a
  JOIN public.activity_enrollments e ON e.activity_id = a.id
  JOIN public.profiles p ON p.id = e.student_id
  WHERE e.decision = 'IGNORED'
    AND a.evaluation_closed_at IS NULL

  UNION ALL

  -- 3. Active accepted students with no enrollment for unclosed MANDATORY activities
  SELECT
    a.id, a.title, a.type, a.points_value, a.deadline, a.evaluation_closed_at,
    p.id, p.name, p.avatar_path, NULL::public.attendance_status, 'IGNORED'::public.activity_decision
  FROM public.activities a
  CROSS JOIN public.profiles p
  JOIN public.student_applications app ON app.student_user_id = p.id
  WHERE a.type = 'MANDATORY'
    AND a.evaluation_closed_at IS NULL
    AND p.status = 'active'
    AND app.status = 'accepted'
    AND NOT EXISTS (
      SELECT 1
      FROM public.activity_enrollments e
      WHERE e.activity_id = a.id
        AND e.student_id = p.id
    )

  UNION ALL

  -- 4. Unclosed activities with zero enrollments and zero students, so the activity card is not lost
  SELECT
    a.id, a.title, a.type, a.points_value, a.deadline, a.evaluation_closed_at,
    NULL::uuid, NULL::text, NULL::text, NULL::public.attendance_status, NULL::public.activity_decision
  FROM public.activities a
  WHERE a.evaluation_closed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.activity_enrollments e WHERE e.activity_id = a.id AND e.decision = 'JOINING'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.activity_enrollments e WHERE e.activity_id = a.id AND e.decision = 'IGNORED'
    )
    AND (
      a.type <> 'MANDATORY'
      OR NOT EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.student_applications app ON app.student_user_id = p.id
        WHERE p.status = 'active' AND app.status = 'accepted'
      )
    )

  ORDER BY deadline, student_name NULLS LAST;
END;
$function$;

-- ===========================================================================
-- 7. Table-Level Finalized Activity Protection (BEFORE UPDATE trigger)
-- ===========================================================================

CREATE OR REPLACE FUNCTION private.guard_finalized_activity_economic_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $trigger_fn$
BEGIN
  -- If the row is already finalized (evaluation_closed_at IS NOT NULL),
  -- reject any attempt to change economic fields via direct table UPDATE.
  -- title and description edits are intentionally allowed.
  IF OLD.evaluation_closed_at IS NOT NULL THEN
    IF NEW.type            IS DISTINCT FROM OLD.type
    OR NEW.points_value    IS DISTINCT FROM OLD.points_value
    OR NEW.max_capacity    IS DISTINCT FROM OLD.max_capacity
    OR NEW.deadline        IS DISTINCT FROM OLD.deadline
    THEN
      RAISE EXCEPTION
        USING ERRCODE = '23514',
              MESSAGE = 'Cannot alter economic fields of an already finalized activity';
    END IF;
  END IF;
  RETURN NEW;
END;
$trigger_fn$;

DROP TRIGGER IF EXISTS trg_guard_finalized_activity_economic_fields ON public.activities;
CREATE TRIGGER trg_guard_finalized_activity_economic_fields
  BEFORE UPDATE ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_finalized_activity_economic_fields();

-- ===========================================================================
-- 8. Grant & Revoke Execution Privileges
-- ===========================================================================

REVOKE EXECUTE ON FUNCTION public.upsert_event_activity(text, text, text, public.activity_type, integer, integer, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.register_for_task(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_task_evaluation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_activity_evaluation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.list_activity_evaluations() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_event_activity(text, text, text, public.activity_type, integer, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_task_evaluation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_activity_evaluation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_activity_evaluations() TO authenticated;

COMMIT;
