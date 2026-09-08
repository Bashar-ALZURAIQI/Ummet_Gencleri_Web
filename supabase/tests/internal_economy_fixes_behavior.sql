-- Behavioral test suite verifying internal economy semantic fixes.
-- Designed for databases with at least THREE active accepted non-executive students.
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

  v_mandatory_act uuid := gen_random_uuid();
  v_mandatory_ignored_act uuid := gen_random_uuid();
  v_mandatory_zero_joiners uuid := gen_random_uuid();

  v_task_ord uuid := gen_random_uuid();
  v_task_exec uuid := gen_random_uuid();

  v_enrollment_id uuid;
  v_ledger_count integer;
  v_amount integer;
  v_act_row public.activities;
BEGIN
  -- =========================================================================
  -- 1. Identify authoritative actors
  -- =========================================================================
  SELECT user_id INTO v_president
  FROM public.executive_assignments
  WHERE position_key = 'PRESIDENT';

  SELECT user_id INTO v_vice
  FROM public.executive_assignments
  WHERE position_key = 'VICE_PRESIDENT';

  SELECT user_id INTO v_media
  FROM public.executive_assignments
  WHERE position_key = 'MEDIA_HEAD';

  SELECT user_id INTO v_finance
  FROM public.executive_assignments
  WHERE position_key = 'FINANCE_HEAD';

  SELECT user_id INTO v_academic
  FROM public.executive_assignments
  WHERE position_key = 'ACADEMIC_HEAD';

  SELECT user_id INTO v_audit
  FROM public.executive_assignments
  WHERE position_key = 'AUDIT_HEAD';

  SELECT user_id INTO v_activities_head
  FROM public.executive_assignments
  WHERE position_key = 'ACTIVITIES_HEAD';

  IF v_president IS NULL
     OR v_vice IS NULL
     OR v_media IS NULL
     OR v_finance IS NULL THEN
    RAISE EXCEPTION 'REQUIRED_EXECUTIVES_MISSING_IN_FIXTURES';
  END IF;

  -- =========================================================================
  -- 2. Identify THREE ordinary students
  -- =========================================================================
  SELECT p.id INTO v_student_1
  FROM public.profiles p
  JOIN public.student_applications a
    ON a.student_user_id = p.id
   AND a.status = 'accepted'
  WHERE p.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.executive_assignments e
      WHERE e.user_id = p.id
    )
  ORDER BY p.created_at, p.id
  LIMIT 1;

  SELECT p.id INTO v_student_2
  FROM public.profiles p
  JOIN public.student_applications a
    ON a.student_user_id = p.id
   AND a.status = 'accepted'
  WHERE p.status = 'active'
    AND p.id <> v_student_1
    AND NOT EXISTS (
      SELECT 1
      FROM public.executive_assignments e
      WHERE e.user_id = p.id
    )
  ORDER BY p.created_at, p.id
  LIMIT 1;

  SELECT p.id INTO v_student_3
  FROM public.profiles p
  JOIN public.student_applications a
    ON a.student_user_id = p.id
   AND a.status = 'accepted'
  WHERE p.status = 'active'
    AND p.id NOT IN (v_student_1, v_student_2)
    AND NOT EXISTS (
      SELECT 1
      FROM public.executive_assignments e
      WHERE e.user_id = p.id
    )
  ORDER BY p.created_at, p.id
  LIMIT 1;

  IF v_student_1 IS NULL
     OR v_student_2 IS NULL
     OR v_student_3 IS NULL THEN
    RAISE EXCEPTION
      'ORDINARY_STUDENT_FIXTURES_MISSING: three active accepted non-executive students are required';
  END IF;

  -- =========================================================================
  -- ACTIVITY CREATOR AUTHORIZATION TESTS
  -- =========================================================================

  -- MEDIA_HEAD creates activity and updates own activity
  PERFORM set_config('request.jwt.claim.sub', v_media::text, true);
  SET LOCAL ROLE authenticated;

  v_act_row := public.upsert_event_activity(
    'evt-media-1',
    'Media Title Initial',
    'Desc',
    'OPTIONAL',
    10,
    20,
    now() + interval '3 days'
  );

  IF v_act_row.created_by <> v_media THEN
    RAISE EXCEPTION
      'Creator authorization failed: created_by was not preserved for MEDIA_HEAD';
  END IF;

  v_act_row := public.upsert_event_activity(
    'evt-media-1',
    'Media Title Updated',
    'Desc Updated',
    'OPTIONAL',
    10,
    20,
    now() + interval '3 days'
  );

  IF v_act_row.title <> 'Media Title Updated'
     OR v_act_row.created_by <> v_media THEN
    RAISE EXCEPTION
      'Creator authorization failed: MEDIA_HEAD could not update own activity';
  END IF;

  -- FINANCE_HEAD creates and updates own activity
  PERFORM set_config('request.jwt.claim.sub', v_finance::text, true);

  v_act_row := public.upsert_event_activity(
    'evt-finance-1',
    'Finance Title Initial',
    'Desc',
    'OPTIONAL',
    10,
    20,
    now() + interval '3 days'
  );

  v_act_row := public.upsert_event_activity(
    'evt-finance-1',
    'Finance Title Updated',
    'Desc Updated',
    'OPTIONAL',
    10,
    20,
    now() + interval '3 days'
  );

  IF v_act_row.title <> 'Finance Title Updated' THEN
    RAISE EXCEPTION
      'Creator authorization failed: FINANCE_HEAD could not update own activity';
  END IF;

  -- MEDIA_HEAD cannot edit FINANCE_HEAD's activity
  PERFORM set_config('request.jwt.claim.sub', v_media::text, true);

  BEGIN
    PERFORM public.upsert_event_activity(
      'evt-finance-1',
      'Malicious Hijack',
      'Desc',
      'OPTIONAL',
      10,
      20,
      now() + interval '3 days'
    );

    RAISE EXCEPTION
      'Authorization failed: MEDIA_HEAD was able to update FINANCE_HEAD activity';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  -- PRESIDENT retains global management authority
  PERFORM set_config('request.jwt.claim.sub', v_president::text, true);

  v_act_row := public.upsert_event_activity(
    'evt-finance-1',
    'Presidential Override',
    'Desc',
    'OPTIONAL',
    10,
    20,
    now() + interval '3 days'
  );

  IF v_act_row.title <> 'Presidential Override'
     OR v_act_row.created_by <> v_finance THEN
    RAISE EXCEPTION
      'President authority failed or created_by changed unexpectedly';
  END IF;

  -- VICE_PRESIDENT creates and updates own activity
  PERFORM set_config('request.jwt.claim.sub', v_vice::text, true);

  v_act_row := public.upsert_event_activity(
    'evt-vice-1',
    'Vice Title Initial',
    'Desc',
    'OPTIONAL',
    10,
    20,
    now() + interval '3 days'
  );

  v_act_row := public.upsert_event_activity(
    'evt-vice-1',
    'Vice Title Updated',
    'Desc Updated',
    'OPTIONAL',
    10,
    20,
    now() + interval '3 days'
  );

  IF v_act_row.title <> 'Vice Title Updated' THEN
    RAISE EXCEPTION
      'Creator authorization failed: VICE_PRESIDENT could not update own activity';
  END IF;

  -- ACTIVITIES_HEAD creates and updates own activity when assigned
  IF v_activities_head IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_activities_head::text, true);

    v_act_row := public.upsert_event_activity(
      'evt-act-1',
      'Act Head Title Initial',
      'Desc',
      'OPTIONAL',
      10,
      20,
      now() + interval '3 days'
    );

    v_act_row := public.upsert_event_activity(
      'evt-act-1',
      'Act Head Title Updated',
      'Desc Updated',
      'OPTIONAL',
      10,
      20,
      now() + interval '3 days'
    );

    IF v_act_row.title <> 'Act Head Title Updated' THEN
      RAISE EXCEPTION
        'Creator authorization failed: ACTIVITIES_HEAD could not update own activity';
    END IF;
  END IF;

  -- ACADEMIC_HEAD retains management authority when assigned
  IF v_academic IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_academic::text, true);

    v_act_row := public.upsert_event_activity(
      'evt-media-1',
      'Academic Review Title',
      'Desc',
      'OPTIONAL',
      10,
      20,
      now() + interval '3 days'
    );

    IF v_act_row.title <> 'Academic Review Title' THEN
      RAISE EXCEPTION
        'ACADEMIC_HEAD management authority is broken';
    END IF;
  END IF;

  RESET ROLE;

  -- =========================================================================
  -- ACTIVITY EVALUATION TEST 1:
  -- JOINING ABSENT, JOINING ON_TIME, DECLINING PARTIAL, executive exemption
  -- =========================================================================

  INSERT INTO public.activities (
    id,
    title,
    description,
    created_by,
    type,
    points_value,
    max_capacity,
    deadline
  ) VALUES (
    v_mandatory_act,
    'اجتماع عام إلزامي',
    'وصف',
    v_president,
    'MANDATORY',
    30,
    50,
    now() + interval '2 days'
  );

  -- Student 1: JOINING + ABSENT -> -20
  INSERT INTO public.activity_enrollments (
    activity_id,
    student_id,
    decision,
    attendance_status
  ) VALUES (
    v_mandatory_act,
    v_student_1,
    'JOINING',
    'ABSENT'
  );

  -- Student 2: JOINING + ON_TIME -> +30
  INSERT INTO public.activity_enrollments (
    activity_id,
    student_id,
    decision,
    attendance_status
  ) VALUES (
    v_mandatory_act,
    v_student_2,
    'JOINING',
    'ON_TIME'
  );

  -- Student 3: DECLINING + PARTIAL excuse -> -5 only
  INSERT INTO public.activity_enrollments (
    activity_id,
    student_id,
    decision,
    excuse_text,
    excuse_status
  ) VALUES (
    v_mandatory_act,
    v_student_3,
    'DECLINING',
    'مرض شديد',
    'PENDING'
  )
  RETURNING id INTO v_enrollment_id;

  -- Executive: JOINING + ABSENT -> economy-exempt
  INSERT INTO public.activity_enrollments (
    activity_id,
    student_id,
    decision,
    attendance_status
  ) VALUES (
    v_mandatory_act,
    v_media,
    'JOINING',
    'ABSENT'
  );

  PERFORM set_config('request.jwt.claim.sub', v_president::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM public.review_activity_excuse(v_enrollment_id, 'PARTIAL');

  SELECT amount
  INTO v_amount
  FROM public.points_ledger
  WHERE source_key = 'excuse:' || v_enrollment_id;

  IF v_amount IS DISTINCT FROM -5 THEN
    RAISE EXCEPTION
      'PARTIAL excuse failed: got %, expected -5',
      v_amount;
  END IF;

  PERFORM public.finalize_activity_evaluation(v_mandatory_act);

  -- Student 1 must get exactly one -20 activity result
  SELECT count(*), COALESCE(sum(amount), 0)
  INTO v_ledger_count, v_amount
  FROM public.points_ledger
  WHERE source_key =
    'activity-result:' || v_mandatory_act || ':' || v_student_1;

  IF v_ledger_count <> 1 OR v_amount <> -20 THEN
    RAISE EXCEPTION
      'JOINING + ABSENT failed: count %, sum %, expected 1 / -20',
      v_ledger_count,
      v_amount;
  END IF;

  -- Student 2 must get full +30
  SELECT amount
  INTO v_amount
  FROM public.points_ledger
  WHERE source_key =
    'activity-result:' || v_mandatory_act || ':' || v_student_2;

  IF v_amount IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION
      'ON_TIME activity reward failed: got %, expected 30',
      v_amount;
  END IF;

  -- Student 3 declined, so no ignored/activity-result penalty
  SELECT count(*)
  INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key =
    'activity-result:' || v_mandatory_act || ':' || v_student_3;

  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION
      'DECLINING student incorrectly received an activity-result penalty';
  END IF;

  -- Executive must receive zero activity-result ledger entries
  SELECT count(*)
  INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key =
    'activity-result:' || v_mandatory_act || ':' || v_media;

  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION
      'Executive activity economy exemption failed';
  END IF;

  -- Re-finalizing must not duplicate Student 1 result
  PERFORM public.finalize_activity_evaluation(v_mandatory_act);

  SELECT count(*)
  INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key =
    'activity-result:' || v_mandatory_act || ':' || v_student_1;

  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION
      'Activity finalization idempotency failed, count = %',
      v_ledger_count;
  END IF;

  RESET ROLE;

  -- =========================================================================
  -- ACTIVITY EVALUATION TEST 2:
  -- Explicitly verify mandatory NO RESPONSE / IGNORED = exactly -20
  -- =========================================================================

  INSERT INTO public.activities (
    id,
    title,
    description,
    created_by,
    type,
    points_value,
    max_capacity,
    deadline
  ) VALUES (
    v_mandatory_ignored_act,
    'اختبار عدم الاستجابة',
    'وصف',
    v_president,
    'MANDATORY',
    20,
    50,
    now() + interval '2 days'
  );

  -- Students 1 and 2 respond and attend; Student 3 gives NO RESPONSE.
  INSERT INTO public.activity_enrollments (
    activity_id,
    student_id,
    decision,
    attendance_status
  ) VALUES
    (v_mandatory_ignored_act, v_student_1, 'JOINING', 'ON_TIME'),
    (v_mandatory_ignored_act, v_student_2, 'JOINING', 'ON_TIME');

  PERFORM set_config('request.jwt.claim.sub', v_president::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM public.finalize_activity_evaluation(v_mandatory_ignored_act);

  SELECT count(*), COALESCE(sum(amount), 0)
  INTO v_ledger_count, v_amount
  FROM public.points_ledger
  WHERE source_key =
    'activity-result:' || v_mandatory_ignored_act || ':' || v_student_3;

  IF v_ledger_count <> 1 OR v_amount <> -20 THEN
    RAISE EXCEPTION
      'Mandatory IGNORED penalty failed: count %, sum %, expected 1 / -20',
      v_ledger_count,
      v_amount;
  END IF;

  -- The system must also materialize the IGNORED enrollment decision.
  SELECT count(*)
  INTO v_ledger_count
  FROM public.activity_enrollments
  WHERE activity_id = v_mandatory_ignored_act
    AND student_id = v_student_3
    AND decision = 'IGNORED';

  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION
      'Mandatory IGNORED enrollment was not materialized';
  END IF;

  -- Re-finalization must remain idempotent.
  PERFORM public.finalize_activity_evaluation(v_mandatory_ignored_act);

  SELECT count(*)
  INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key =
    'activity-result:' || v_mandatory_ignored_act || ':' || v_student_3;

  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION
      'Mandatory IGNORED idempotency failed, count = %',
      v_ledger_count;
  END IF;

  RESET ROLE;

  -- =========================================================================
  -- ACTIVITY EVALUATION TEST 3:
  -- Mandatory activity with ZERO JOINING students remains finalizable
  -- =========================================================================

  INSERT INTO public.activities (
    id,
    title,
    description,
    created_by,
    type,
    points_value,
    max_capacity,
    deadline
  ) VALUES (
    v_mandatory_zero_joiners,
    'نشاط بدون مسجلين',
    'وصف',
    v_president,
    'MANDATORY',
    15,
    30,
    now() + interval '2 days'
  );

  PERFORM set_config('request.jwt.claim.sub', v_president::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM public.finalize_activity_evaluation(v_mandatory_zero_joiners);

  SELECT *
  INTO v_act_row
  FROM public.activities
  WHERE id = v_mandatory_zero_joiners;

  IF v_act_row.evaluation_closed_at IS NULL THEN
    RAISE EXCEPTION
      'Zero-joiner mandatory activity could not be finalized';
  END IF;

  RESET ROLE;

  -- =========================================================================
  -- TASK EVALUATION TEST 1:
  -- ordinary PERFECT / PARTIAL / FAILED + idempotency
  -- =========================================================================

  INSERT INTO public.tasks (
    id,
    title,
    description,
    points_reward,
    created_by,
    required_students,
    deadline
  ) VALUES (
    v_task_ord,
    'مهمة الطلاب',
    'وصف',
    20,
    v_president,
    5,
    now() + interval '2 days'
  );

  INSERT INTO public.task_enrollments (
    task_id,
    student_id,
    completion_status
  )
  VALUES
    (v_task_ord, v_student_1, 'PERFECT'),
    (v_task_ord, v_student_2, 'PARTIAL'),
    (v_task_ord, v_student_3, 'FAILED');

  PERFORM set_config('request.jwt.claim.sub', v_president::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM public.finalize_task_evaluation(v_task_ord);

  SELECT amount
  INTO v_amount
  FROM public.points_ledger
  WHERE source_key =
    'task-result:' || v_task_ord || ':' || v_student_1;

  IF v_amount IS DISTINCT FROM 20 THEN
    RAISE EXCEPTION
      'PERFECT task reward failed: got %, expected 20',
      v_amount;
  END IF;

  SELECT amount
  INTO v_amount
  FROM public.points_ledger
  WHERE source_key =
    'task-result:' || v_task_ord || ':' || v_student_2;

  IF v_amount IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION
      'PARTIAL task reward failed: got %, expected 10',
      v_amount;
  END IF;

  SELECT count(*)
  INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key =
    'task-result:' || v_task_ord || ':' || v_student_3;

  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION
      'FAILED task incorrectly awarded points';
  END IF;

  PERFORM public.finalize_task_evaluation(v_task_ord);

  SELECT count(*)
  INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key =
    'task-result:' || v_task_ord || ':' || v_student_1;

  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION
      'PERFECT task idempotency failed, count = %',
      v_ledger_count;
  END IF;

  SELECT count(*)
  INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key =
    'task-result:' || v_task_ord || ':' || v_student_2;

  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION
      'PARTIAL task idempotency failed, count = %',
      v_ledger_count;
  END IF;

  RESET ROLE;

  -- =========================================================================
  -- TASK EVALUATION TEST 2:
  -- executive completion is stored but economy change remains zero
  -- =========================================================================

  INSERT INTO public.tasks (
    id,
    title,
    description,
    points_reward,
    created_by,
    required_students,
    deadline
  ) VALUES (
    v_task_exec,
    'مهمة إدارية مشتركة',
    'وصف',
    20,
    v_president,
    5,
    now() + interval '2 days'
  );

  INSERT INTO public.task_enrollments (
    task_id,
    student_id,
    completion_status
  ) VALUES (
    v_task_exec,
    v_media,
    'PERFECT'
  );

  PERFORM set_config('request.jwt.claim.sub', v_president::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM public.finalize_task_evaluation(v_task_exec);

  SELECT count(*)
  INTO v_ledger_count
  FROM public.points_ledger
  WHERE source_key =
    'task-result:' || v_task_exec || ':' || v_media;

  IF v_ledger_count <> 0 THEN
    RAISE EXCEPTION
      'Executive task economy exemption failed';
  END IF;

  SELECT count(*)
  INTO v_ledger_count
  FROM public.task_enrollments
  WHERE task_id = v_task_exec
    AND student_id = v_media
    AND completion_status = 'PERFECT';

  IF v_ledger_count <> 1 THEN
    RAISE EXCEPTION
      'Executive task completion record was not preserved';
  END IF;

  PERFORM public.finalize_task_evaluation(v_task_exec);

  -- =========================================================================
  -- FINALIZED ACTIVITY TABLE-LEVEL PROTECTION
  -- =========================================================================
  BEGIN
    UPDATE public.activities
    SET points_value = 999
    WHERE id = v_mandatory_act;

    RAISE EXCEPTION
      'Finalized activity economic field update was not rejected';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    NULL;
  END;

  RESET ROLE;
END
$behavioral_test_matrix$;

ROLLBACK;

SELECT 'INTERNAL_ECONOMY_BEHAVIOR_TESTS_PASSED' AS result;
