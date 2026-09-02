-- Live/disposable behavioral verification. Every fixture and points movement is
-- rolled back, so the official project is left unchanged.
BEGIN;

SELECT set_config(
  'internal_economy_test.student_id',
  (
    SELECT profile.id::text
    FROM public.profiles AS profile
    JOIN public.student_applications AS application
      ON application.student_user_id = profile.id
     AND application.status = 'accepted'
    WHERE profile.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.executive_assignments AS assignment
        WHERE assignment.user_id = profile.id
      )
    ORDER BY profile.created_at
    LIMIT 1
  ),
  true
);

SELECT set_config(
  'internal_economy_test.manager_id',
  (
    SELECT assignment.user_id::text
    FROM public.executive_assignments AS assignment
    WHERE assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
    ORDER BY CASE assignment.position_key
      WHEN 'PRESIDENT' THEN 1
      WHEN 'ACADEMIC_HEAD' THEN 2
      ELSE 3
    END
    LIMIT 1
  ),
  true
);

DO $fixtures$
DECLARE
  v_student_id uuid := current_setting('internal_economy_test.student_id')::uuid;
  v_manager_id uuid := current_setting('internal_economy_test.manager_id')::uuid;
  v_activity_id uuid := gen_random_uuid();
  v_hidden_activity_id uuid := gen_random_uuid();
  v_full_activity_id uuid := gen_random_uuid();
  v_task_id uuid := gen_random_uuid();
  v_hidden_task_id uuid := gen_random_uuid();
  v_before integer;
BEGIN
  IF v_student_id IS NULL OR v_manager_id IS NULL THEN
    RAISE EXCEPTION 'INTERNAL_ECONOMY_BEHAVIOR_FIXTURE_MISSING';
  END IF;

  INSERT INTO public.activities (
    id, title, description, created_by, type, points_value, max_capacity, deadline
  ) VALUES (
    v_activity_id,
    'اختبار أمان مؤقت',
    'يُلغى هذا السجل تلقائياً في نهاية الاختبار',
    v_manager_id,
    'OPTIONAL',
    5,
    1,
    now() + interval '1 day'
  );

  INSERT INTO public.tasks (
    id, title, description, points_reward, created_by, required_students, deadline
  ) VALUES (
    v_task_id,
    'مهمة أمان مؤقتة',
    'يُلغى هذا السجل تلقائياً في نهاية الاختبار',
    5,
    v_manager_id,
    1,
    now() + interval '1 day'
  );

  INSERT INTO public.activities (
    id, title, description, created_by, type, points_value, deadline
  ) VALUES (
    v_hidden_activity_id,
    'نشاط منتهٍ مؤقت',
    'يجب ألا يظهر لطالب لم يشترك فيه',
    v_manager_id,
    'OPTIONAL',
    0,
    now() - interval '1 day'
  );

  INSERT INTO public.tasks (
    id, title, description, points_reward, created_by, required_students, deadline, status
  ) VALUES (
    v_hidden_task_id,
    'مهمة مغلقة مؤقتة',
    'يجب ألا تظهر لطالب لم يشترك فيها',
    5,
    v_manager_id,
    1,
    now() + interval '1 day',
    'CLOSED'
  );

  INSERT INTO public.activities (
    id, title, description, created_by, type, points_value, max_capacity, deadline
  ) VALUES (
    v_full_activity_id,
    'نشاط ممتلئ مؤقت',
    'يجب ألا يظهر لطالب غير مسجل فيه',
    v_manager_id,
    'OPTIONAL',
    0,
    1,
    now() + interval '1 day'
  );
  INSERT INTO public.activity_enrollments (activity_id, student_id, decision)
  VALUES (v_full_activity_id, v_manager_id, 'JOINING');

  SELECT total_points INTO v_before
  FROM public.profiles
  WHERE id = v_student_id;

  PERFORM set_config('internal_economy_test.activity_id', v_activity_id::text, true);
  PERFORM set_config('internal_economy_test.hidden_activity_id', v_hidden_activity_id::text, true);
  PERFORM set_config('internal_economy_test.full_activity_id', v_full_activity_id::text, true);
  PERFORM set_config('internal_economy_test.task_id', v_task_id::text, true);
  PERFORM set_config('internal_economy_test.hidden_task_id', v_hidden_task_id::text, true);
  PERFORM set_config('internal_economy_test.before_points', v_before::text, true);
END
$fixtures$;

-- Accepted students can use the two intent RPCs, but cannot award points or
-- mutate protected columns directly.
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('internal_economy_test.student_id'),
  true
);
SET LOCAL ROLE authenticated;

SELECT public.set_own_activity_enrollment(
  current_setting('internal_economy_test.activity_id')::uuid,
  'JOINING',
  NULL
);
SELECT public.register_for_task(
  current_setting('internal_economy_test.task_id')::uuid
);

DO $student_denials$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tasks
    WHERE id = current_setting('internal_economy_test.task_id')::uuid
      AND status = 'FULL'
  ) THEN
    RAISE EXCEPTION 'TASK_CAPACITY_STATUS_FAILED';
  END IF;

  BEGIN
    UPDATE public.activity_enrollments
    SET attendance_status = 'ABSENT'
    WHERE activity_id = current_setting('internal_economy_test.activity_id')::uuid
      AND student_id = current_setting('internal_economy_test.student_id')::uuid;
    RAISE EXCEPTION 'STUDENT_PROTECTED_UPDATE_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.activity_enrollments
    SET decision = 'DECLINING', excuse_text = 'تجاوز مباشر مرفوض'
    WHERE activity_id = current_setting('internal_economy_test.activity_id')::uuid
      AND student_id = current_setting('internal_economy_test.student_id')::uuid;
    RAISE EXCEPTION 'STUDENT_DECISION_TABLE_UPDATE_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.task_enrollments (task_id, student_id)
    VALUES (
      current_setting('internal_economy_test.hidden_task_id')::uuid,
      current_setting('internal_economy_test.student_id')::uuid
    );
    RAISE EXCEPTION 'STUDENT_TASK_TABLE_INSERT_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.record_points_transaction(
      current_setting('internal_economy_test.student_id')::uuid,
      7,
      'يجب رفض هذه الحركة',
      'verification:student-denied'
    );
    RAISE EXCEPTION 'STUDENT_POINTS_RPC_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$student_denials$;

RESET ROLE;

-- Historical parent rows remain visible to their owner, while unavailable
-- non-enrolled catalog rows stay hidden.
UPDATE public.activities
SET deadline = now() - interval '1 hour'
WHERE id = current_setting('internal_economy_test.activity_id')::uuid;
UPDATE public.tasks
SET status = 'CLOSED'
WHERE id = current_setting('internal_economy_test.task_id')::uuid;

SET LOCAL ROLE authenticated;
DO $student_visibility$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.activities
    WHERE id = current_setting('internal_economy_test.activity_id')::uuid
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = current_setting('internal_economy_test.task_id')::uuid
  ) THEN
    RAISE EXCEPTION 'OWN_HISTORICAL_CATALOG_VISIBILITY_FAILED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.activities
    WHERE id = current_setting('internal_economy_test.hidden_activity_id')::uuid
  ) OR EXISTS (
    SELECT 1 FROM public.activities
    WHERE id = current_setting('internal_economy_test.full_activity_id')::uuid
  ) OR EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = current_setting('internal_economy_test.hidden_task_id')::uuid
  ) THEN
    RAISE EXCEPTION 'UNAVAILABLE_CATALOG_ROW_LEAK';
  END IF;
END
$student_visibility$;
RESET ROLE;

-- An inactive or rejected student is denied before activity/task state checks.
UPDATE public.profiles
SET status = 'inactive'
WHERE id = current_setting('internal_economy_test.student_id')::uuid;
SET LOCAL ROLE authenticated;
DO $inactive_denial$
BEGIN
  BEGIN
    PERFORM public.set_own_activity_enrollment(
      current_setting('internal_economy_test.activity_id')::uuid,
      'JOINING',
      NULL
    );
    RAISE EXCEPTION 'INACTIVE_STUDENT_UNEXPECTEDLY_ENROLLED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$inactive_denial$;
RESET ROLE;
UPDATE public.profiles
SET status = 'active'
WHERE id = current_setting('internal_economy_test.student_id')::uuid;

UPDATE public.student_applications
SET status = 'rejected'
WHERE student_user_id = current_setting('internal_economy_test.student_id')::uuid;
SET LOCAL ROLE authenticated;
DO $rejected_denial$
BEGIN
  BEGIN
    PERFORM public.register_for_task(
      current_setting('internal_economy_test.hidden_task_id')::uuid
    );
    RAISE EXCEPTION 'REJECTED_STUDENT_UNEXPECTEDLY_REGISTERED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$rejected_denial$;
RESET ROLE;
UPDATE public.student_applications
SET status = 'accepted'
WHERE student_user_id = current_setting('internal_economy_test.student_id')::uuid;

-- A manager can record one idempotent transaction. Repeating the same source
-- key returns the existing row and must not increment total_points twice.
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('internal_economy_test.manager_id'),
  true
);
SET LOCAL ROLE authenticated;

SELECT public.record_points_transaction(
  current_setting('internal_economy_test.student_id')::uuid,
  7,
  'حركة تحقق مؤقتة',
  'verification:idempotent-ledger'
);

DO $points_validation$
BEGIN
  BEGIN
    PERFORM public.record_points_transaction(
      current_setting('internal_economy_test.student_id')::uuid,
      100001,
      'قيمة خارج الحد',
      'verification:out-of-range'
    );
    RAISE EXCEPTION 'OUT_OF_RANGE_POINTS_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN invalid_parameter_value THEN NULL;
  END;

  BEGIN
    PERFORM public.record_points_transaction(
      current_setting('internal_economy_test.student_id')::uuid,
      8,
      'حركة متعارضة',
      'verification:idempotent-ledger'
    );
    RAISE EXCEPTION 'CONFLICTING_SOURCE_KEY_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END
$points_validation$;
SELECT public.record_points_transaction(
  current_setting('internal_economy_test.student_id')::uuid,
  7,
  'حركة تحقق مؤقتة',
  'verification:idempotent-ledger'
);

DO $manager_checks$
DECLARE
  v_count integer;
  v_total integer;
BEGIN
  SELECT count(*)::integer INTO v_count
  FROM public.points_ledger
  WHERE source_key = 'verification:idempotent-ledger';

  SELECT total_points INTO v_total
  FROM public.profiles
  WHERE id = current_setting('internal_economy_test.student_id')::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'POINTS_IDEMPOTENCY_FAILED';
  END IF;

  IF v_total <> current_setting('internal_economy_test.before_points')::integer + 7 THEN
    RAISE EXCEPTION 'POINTS_ATOMIC_TOTAL_FAILED';
  END IF;

END
$manager_checks$;

RESET ROLE;

-- Even service_role has no UPDATE/DELETE privilege on the financial ledger.
SET LOCAL ROLE service_role;
DO $service_denials$
BEGIN
  BEGIN
    DELETE FROM public.points_ledger
    WHERE source_key = 'verification:idempotent-ledger';
    RAISE EXCEPTION 'SERVICE_LEDGER_DELETE_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.points_ledger
    SET amount = amount + 1
    WHERE source_key = 'verification:idempotent-ledger';
    RAISE EXCEPTION 'SERVICE_LEDGER_UPDATE_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.activities
    WHERE id = current_setting('internal_economy_test.activity_id')::uuid;
    RAISE EXCEPTION 'SERVICE_ACTIVITY_DELETE_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.tasks
    WHERE id = current_setting('internal_economy_test.task_id')::uuid;
    RAISE EXCEPTION 'SERVICE_TASK_DELETE_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$service_denials$;
RESET ROLE;

ROLLBACK;
