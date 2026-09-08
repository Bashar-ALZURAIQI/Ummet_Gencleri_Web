-- Behavioral test suite verifying internal economy semantic fixes.
-- All fixture data, activities, tasks, and ledger movements are strictly rolled back.
BEGIN;

DO $behavioral_test_matrix$
DECLARE
  v_president uuid;
  v_vice uuid;
  v_media uuid;
  v_finance uuid;
  v_academic uuid;
  v_audit uuid;
  v_activities_head uuid;

  v_student_1 uuid;
  v_student_2 uuid;
  v_student_3 uuid;
  v_student_4 uuid;
  v_student_ignored uuid;

  v_mandatory_act uuid := gen_random_uuid();
  v_mandatory_zero_joiners uuid := gen_random_uuid();
  v_optional_act uuid := gen_random_uuid();
  v_paid_act uuid := gen_random_uuid();
  v_media_act uuid := gen_random_uuid();
  v_finance_act uuid := gen_random_uuid();

  v_task_ord uuid := gen_random_uuid();
  v_task_exec uuid := gen_random_uuid();

  v_enrollment_id uuid;
  v_ledger_count integer;
  v_amount integer;
  v_act_row public.activities;
  v_task_row public.tasks;
BEGIN
  -- 1. Identify authoritative actors
  SELECT user_id INTO v_president FROM public.executive_assignments WHERE position_key = 'PRESIDENT';
  SELECT user_id INTO v_vice FROM public.executive_assignments WHERE position_key = 'VICE_PRESIDENT';
  SELECT user_id INTO v_media FROM public.executive_assignments WHERE position_key = 'MEDIA_HEAD';
  SELECT user_id INTO v_finance FROM public.executive_assignments WHERE position_key = 'FINANCE_HEAD';
  SELECT user_id INTO v_academic FROM public.executive_assignments WHERE position_key = 'ACADEMIC_HEAD';
  SELECT user_id INTO v_audit FROM public.executive_assignments WHERE position_key = 'AUDIT_HEAD';
  SELECT user_id INTO v_activities_head FROM public.executive_assignments WHERE position_key = 'ACTIVITIES_HEAD';

  IF v_president IS NULL OR v_vice IS NULL OR v_media IS NULL OR v_finance IS NULL THEN
    RAISE EXCEPTION 'REQUIRED_EXECUTIVES_MISSING_IN_FIXTURES';
  END IF;

  -- 2. Identify ordinary students (active profiles with accepted applications, not executives)
  SELECT p.id INTO v_student_1
  FROM public.profiles p
  JOIN public.student_applications a ON a.student_user_id = p.id AND a.status = 'accepted'
  WHERE p.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM public.executive_assignments e WHERE e.user_id = p.id)
  ORDER BY p.created_at, p.id LIMIT 1;

  SELECT p.id INTO v_student_2
  FROM public.profiles p
  JOIN public.student_applications a ON a.student_user_id = p.id AND a.status = 'accepted'
  WHERE p.status = 'active'
    AND p.id <> v_student_1
    AND NOT EXISTS (SELECT 1 FROM public.executive_assignments e WHERE e.user_id = p.id)
  ORDER BY p.created_at, p.id LIMIT 1;

  SELECT p.id INTO v_student_3
  FROM public.profiles p
  JOIN public.student_applications a ON a.student_user_id = p.id AND a.status = 'accepted'
  WHERE p.status = 'active'
    AND p.id NOT IN (v_student_1, v_student_2)
    AND NOT EXISTS (SELECT 1 FROM public.executive_assignments e WHERE e.user_id = p.id)
  ORDER BY p.created_at, p.id LIMIT 1;

  SELECT p.id INTO v_student_4
  FROM public.profiles p
  JOIN public.student_applications a ON a.student_user_id = p.id AND a.status = 'accepted'
  WHERE p.status = 'active'
    AND p.id NOT IN (v_student_1, v_student_2, v_student_3)
    AND NOT EXISTS (SELECT 1 FROM public.executive_assignments e WHERE e.user_id = p.id)
  ORDER BY p.created_at, p.id LIMIT 1;

  SELECT p.id INTO v_student_ignored
  FROM public.profiles p
  JOIN public.student_applications a ON a.student_user_id = p.id AND a.status = 'accepted'
  WHERE p.status = 'active'
    AND p.id NOT IN (v_student_1, v_student_2, v_student_3, v_student_4)
    AND NOT EXISTS (SELECT 1 FROM public.executive_assignments e WHERE e.user_id = p.id)
  ORDER BY p.created_at, p.id LIMIT 1;

  IF v_student_1 IS NULL OR v_student_2 IS NULL THEN
    RAISE EXCEPTION 'ORDINARY_STUDENT_FIXTURES_MISSING';
  END IF;

  -- =========================================================================
  -- ACTIVITY CREATOR AUTHORIZATION TESTS (Points 25 - 33)
  -- =========================================================================

  -- Point 25: MEDIA_HEAD creates activity -> can update own activity
  PERFORM set_config('request.jwt.claim.sub', v_media::text, true);
  SET LOCAL ROLE authenticated;
  v_act_row := public.upsert_event_activity(
    'evt-media-1', 'Media Title Initial', 'Desc', 'OPTIONAL', 10, 20, now() + interval '3 days'
  );
  IF v_act_row.created_by <> v_media THEN
    RAISE EXCEPTION 'Point 33 failed: created_by was not preserved as creator';
  END IF;

  v_act_row := public.upsert_event_activity(
    'evt-media-1', 'Media Title Updated', 'Desc Updated', 'OPTIONAL', 10, 20, now() + interval '3 days'
  );
  IF v_act_row.title <> 'Media Title Updated' OR v_act_row.created_by <> v_media THEN
    RAISE EXCEPTION 'Point 25 failed: MEDIA_HEAD could not update own activity';
  END IF;

  -- Point 26: FINANCE_HEAD creates activity -> can update own activity
  PERFORM set_config('request.jwt.claim.sub', v_finance::text, true);
  v_act_row := public.upsert_event_activity(
    'evt-finance-1', 'Finance Title Initial', 'Desc', 'OPTIONAL', 10, 20, now() + interval '3 days'
  );
  v_act_row := public.upsert_event_activity(
    'evt-finance-1', 'Finance Title Updated', 'Desc Updated', 'OPTIONAL', 10, 20, now() + interval '3 days'
  );
  IF v_act_row.title <> 'Finance Title Updated' THEN
    RAISE EXCEPTION 'Point 26 failed: FINANCE_HEAD could not update own activity';
  END IF;

  -- Point 32: MEDIA_HEAD cannot edit FINANCE_HEAD's activity
  PERFORM set_config('request.jwt.claim.sub', v_media::text, true);
  BEGIN
    PERFORM public.upsert_event_activity(
      'evt-finance-1', 'Malicious Hijack', 'Desc', 'OPTIONAL', 10, 20, now() + interval '3 days'
    );
    RAISE EXCEPTION 'Point 32 failed: MEDIA_HEAD was able to update FINANCE_HEAD activity';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    -- Expected rejection
    NULL;
  END;

  -- Point 31: PRESIDENT can update any activity
  PERFORM set_config('request.jwt.claim.sub', v_president::text, true);
  v_act_row := public.upsert_event_activity(
    'evt-finance-1', 'Presidential Override', 'Desc', 'OPTIONAL', 10, 20, now() + interval '3 days'
  );
  IF v_act_row.title <> 'Presidential Override' OR v_act_row.created_by <> v_finance THEN
    RAISE EXCEPTION 'Point 31 failed: PRESIDENT could not update activity or altered created_by';
  END IF;

  -- Point 27: VICE_PRESIDENT creates and updates own activity
  PERFORM set_config('request.jwt.claim.sub', v_vice::text, true);
  v_act_row := public.upsert_event_activity(
    'evt-vice-1', 'Vice Title Initial', 'Desc', 'OPTIONAL', 10, 20, now() + interval '3 days'
  );
  v_act_row := public.upsert_event_activity(
    'evt-vice-1', 'Vice Title Updated', 'Desc', 'OPTIONAL', 10, 20, now() + interval '3 days'
  );
  IF v_act_row.title <> 'Vice Title Updated' THEN
    RAISE EXCEPTION 'Point 27 failed: VICE_PRESIDENT could not update own activity';
  END IF;

  -- Point 28: ACTIVITIES_HEAD creates and updates own activity
  IF v_activities_head IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_activities_head::text, true);
    v_act_row := public.upsert_event_activity(
      'evt-act-1', 'Act Head Title Initial', 'Desc', 'OPTIONAL', 10, 20, now() + interval '3 days'
    );
    v_act_row := public.upsert_event_activity(
      'evt-act-1', 'Act Head Title Updated', 'Desc', 'OPTIONAL', 10, 20, now() + interval '3 days'
    );
    IF v_act_row.title <> 'Act Head Title Updated' THEN
      RAISE EXCEPTION 'Point 28 failed: ACTIVITIES_HEAD could not update own activity';
    END IF;
  END IF;

  -- Point 29 & 30: ACADEMIC_HEAD and AUDIT_HEAD management updates
  IF v_academic IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_academic::text, true);
    v_act_row := public.upsert_event_activity(
      'evt-media-1', 'Academic Review Title', 'Desc', 'OPTIONAL', 10, 20, now() + interval '3 days'
    );
    IF v_act_row.title <> 'Academic Review Title' THEN
      RAISE EXCEPTION 'Point 29 failed: ACADEMIC_HEAD update authority broken';
    END IF;
  END IF;

  RESET ROLE;

  -- =========================================================================
  -- ACTIVITY EVALUATION & PENALTY TESTS (Points 1 - 15)
  -- =========================================================================

  -- Setup MANDATORY activity
  INSERT INTO public.activities (
    id, title, description, created_by, type, points_value, max_capacity, deadline
  ) VALUES (
    v_mandatory_act, 'اجتماع عام إلزامي', 'وصف', v_president, 'MANDATORY', 30, 50, now() + interval '2 days'
  );

  -- Student 1: JOINING + ABSENT
  INSERT INTO public.activity_enrollments (activity_id, student_id, decision, attendance_status)
  VALUES (v_mandatory_act, v_student_1, 'JOINING', 'ABSENT');

  -- Student 2: JOINING + ON_TIME
  INSERT INTO public.activity_enrollments (activity_id, student_id, decision, attendance_status)
  VALUES (v_mandatory_act, v_student_2, 'JOINING', 'ON_TIME');

  -- Student 3: DECLINING + excuse
  INSERT INTO public.activity_enrollments (activity_id, student_id, decision, excuse_text, excuse_status)
  VALUES (v_mandatory_act, v_student_3, 'DECLINING', 'مرض شديد', 'PENDING')
  RETURNING id INTO v_enrollment_id;

  -- Executive: JOINING + ABSENT
  INSERT INTO public.activity_enrollments (activity_id, student_id, decision, attendance_status)
  VALUES (v_mandatory_act, v_media, 'JOINING', 'ABSENT');

  -- Review Student 3 excuse: PARTIAL (-5)
  PERFORM set_config('request.jwt.claim.sub', v_president::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.review_activity_excuse(v_enrollment_id, 'PARTIAL');

  -- Points 6 & 8: Student 3 received exactly -5 from excuse, and is NOT treated as ignored
  SELECT amount INTO v_amount FROM public.points_ledger WHERE source_key = 'excuse:' || v_enrollment_id;
  IF v_amount <> -5 THEN
    RAISE EXCEPTION 'Point 6 failed: PARTIAL excuse did not award -5, got %', v_amount;
  END IF;

  -- Finalize the mandatory activity
  PERFORM public.finalize_activity_evaluation(v_mandatory_act);

  -- Point 1: Ordinary student who did not respond received exactly -20 once
  IF v_student_ignored IS NOT NULL THEN
    SELECT amount INTO v_amount
    FROM public.points_ledger
    WHERE source_key = 'activity-result:' || v_mandatory_act || ':' || v_student_ignored;
    IF v_amount <> -20 THEN
      RAISE EXCEPTION 'Point 1 failed: Ignored student did not receive -20, got %', v_amount;
    END IF;
  END IF;

  -- Point 3 & 4: JOINING + ABSENT received -20 exactly once (NOT -40)
  SELECT count(*), COALESCE(sum(amount), 0) INTO v_ledger_count, v_amount
  FROM public.points_ledger
  WHERE source_key LIKE 'activity-result:' || v_mandatory_act || ':' || v_student_1;
  IF v_ledger_count <> 1 OR v_amount <> -20 THEN
    RAISE EXCEPTION 'Point 3/4 failed: JOINING + ABSENT count % sum % (expected 1 and -20)', v_ledger_count, v_amount;
  END IF;

  -- Point 8: Declining student 3 did NOT receive additional -20 ignored penalty
  SELECT count(*) INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key = 'activity-result:' || v_mandatory_act || ':' || v_student_3;
  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Point 8 failed: Declining student also received ignored penalty';
  END IF;

  -- Point 11: Executive + MANDATORY + JOINING + ABSENT received 0 penalty
  SELECT count(*) INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key = 'activity-result:' || v_mandatory_act || ':' || v_media;
  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Point 11 failed: Executive JOINING+ABSENT received penalty';
  END IF;

  -- Point 2: Re-finalize same mandatory activity -> no duplicate penalty (idempotency)
  PERFORM public.finalize_activity_evaluation(v_mandatory_act);
  IF v_student_ignored IS NOT NULL THEN
    SELECT count(*) INTO v_ledger_count
    FROM public.points_ledger
    WHERE source_key = 'activity-result:' || v_mandatory_act || ':' || v_student_ignored;
    IF v_ledger_count <> 1 THEN
      RAISE EXCEPTION 'Point 2 failed: Idempotency violated on re-finalization';
    END IF;
  END IF;

  -- Point 34: Mandatory activity with ZERO JOINING students remains finalizable
  INSERT INTO public.activities (
    id, title, description, created_by, type, points_value, max_capacity, deadline
  ) VALUES (
    v_mandatory_zero_joiners, 'نشاط بدون مسجلين', 'وصف', v_president, 'MANDATORY', 15, 30, now() + interval '2 days'
  );
  -- Zero joining students enrolled. Finalization must succeed.
  PERFORM public.finalize_activity_evaluation(v_mandatory_zero_joiners);
  SELECT evaluation_closed_at INTO v_act_row.evaluation_closed_at
  FROM public.activities WHERE id = v_mandatory_zero_joiners;
  IF v_act_row.evaluation_closed_at IS NULL THEN
    RAISE EXCEPTION 'Point 34 failed: Zero-joiner mandatory activity could not be finalized';
  END IF;

  -- =========================================================================
  -- TASK EVALUATION & EXECUTIVE EXEMPTION TESTS (Points 16 - 24)
  -- =========================================================================

  -- Task 1: Ordinary student task
  INSERT INTO public.tasks (
    id, title, description, points_reward, created_by, required_students, deadline
  ) VALUES (
    v_task_ord, 'مهمة الطلاب', 'وصف', 20, v_president, 5, now() + interval '2 days'
  );

  INSERT INTO public.task_enrollments (task_id, student_id, completion_status)
  VALUES
    (v_task_ord, v_student_1, 'PERFECT'),
    (v_task_ord, v_student_2, 'PARTIAL'),
    (v_task_ord, v_student_3, 'FAILED');

  PERFORM public.finalize_task_evaluation(v_task_ord);

  -- Point 16: Ordinary student PERFECT -> full task reward (must be exactly 20)
  SELECT amount INTO v_amount FROM public.points_ledger
  WHERE source_key = 'task-result:' || v_task_ord || ':' || v_student_1;
  IF v_amount IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION 'Point 16 failed: PERFECT task reward was %, expected 20', v_amount;
  END IF;

  -- Point 17: Ordinary student PARTIAL -> 50% = 10
  SELECT amount INTO v_amount FROM public.points_ledger
  WHERE source_key = 'task-result:' || v_task_ord || ':' || v_student_2;
  IF v_amount IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'Point 17 failed: PARTIAL task reward was %, expected 10', v_amount;
  END IF;

  -- Point 18: Ordinary student FAILED -> 0 points (no ledger row)
  SELECT count(*) INTO v_ledger_count FROM public.points_ledger
  WHERE source_key = 'task-result:' || v_task_ord || ':' || v_student_3;
  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Point 18 failed: FAILED task awarded points';
  END IF;

  -- Point 20: Re-finalize ordinary task -> idempotency (each source_key exists exactly once)
  PERFORM public.finalize_task_evaluation(v_task_ord);
  SELECT count(*) INTO v_ledger_count FROM public.points_ledger
  WHERE source_key = 'task-result:' || v_task_ord || ':' || v_student_1;
  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Point 20 failed: Idempotency violated for PERFECT student, count = %', v_ledger_count;
  END IF;
  SELECT count(*) INTO v_ledger_count FROM public.points_ledger
  WHERE source_key = 'task-result:' || v_task_ord || ':' || v_student_2;
  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Point 20 failed: Idempotency violated for PARTIAL student, count = %', v_ledger_count;
  END IF;

  -- Task 2: Executive task participation
  INSERT INTO public.tasks (
    id, title, description, points_reward, created_by, required_students, deadline
  ) VALUES (
    v_task_exec, 'مهمة إدارية مشتركة', 'وصف', 20, v_president, 5, now() + interval '2 days'
  );

  -- Executive enrolled in task
  INSERT INTO public.task_enrollments (task_id, student_id, completion_status)
  VALUES (v_task_exec, v_media, 'PERFECT');

  PERFORM public.finalize_task_evaluation(v_task_exec);

  -- Point 19: Executive PERFECT -> 0 points
  SELECT count(*) INTO v_ledger_count FROM public.points_ledger
  WHERE source_key = 'task-result:' || v_task_exec || ':' || v_media;
  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Point 19 failed: Executive awarded points for PERFECT task';
  END IF;

  -- Point 22: Executive completion record is still stored normally
  SELECT count(*) INTO v_ledger_count FROM public.task_enrollments
  WHERE task_id = v_task_exec AND student_id = v_media AND completion_status = 'PERFECT';
  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Point 22 failed: Executive task completion record was not saved';
  END IF;

  -- Point 24: Re-finalizing task creates no duplicate ledger entry
  PERFORM public.finalize_task_evaluation(v_task_exec);

  -- Point 35: Direct UPDATE of economic field on finalized activity is rejected by trigger
  BEGIN
    UPDATE public.activities
    SET points_value = 999
    WHERE id = v_mandatory_act;
    RAISE EXCEPTION 'Point 35 failed: Direct UPDATE of finalized activity economic field was not rejected';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    -- Expected: trigger blocked the mutation
    NULL;
  END;

  RESET ROLE;
END
$behavioral_test_matrix$;

ROLLBACK;
