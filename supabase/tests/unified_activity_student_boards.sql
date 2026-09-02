-- Live verification for the phase-two board projections. All rows roll back.
BEGIN;

SELECT set_config(
  'unified_board_test.student_id',
  (
    SELECT profile.id::text
    FROM public.profiles AS profile
    JOIN public.student_applications AS application
      ON application.student_user_id = profile.id
     AND application.status = 'accepted'
    WHERE profile.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.executive_assignments AS assignment
        WHERE assignment.user_id = profile.id
      )
    ORDER BY profile.created_at
    LIMIT 1
  ),
  true
);

SELECT set_config(
  'unified_board_test.manager_id',
  (
    SELECT assignment.user_id::text
    FROM public.executive_assignments AS assignment
    WHERE assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
    ORDER BY CASE assignment.position_key WHEN 'PRESIDENT' THEN 1 WHEN 'ACADEMIC_HEAD' THEN 2 ELSE 3 END
    LIMIT 1
  ),
  true
);

DO $fixture_guard$
BEGIN
  IF NULLIF(current_setting('unified_board_test.student_id'), '') IS NULL
     OR NULLIF(current_setting('unified_board_test.manager_id'), '') IS NULL THEN
    RAISE EXCEPTION 'UNIFIED_ACTIVITY_BOARD_FIXTURE_MISSING';
  END IF;
END
$fixture_guard$;

SELECT set_config('request.jwt.claim.sub', current_setting('unified_board_test.manager_id'), true);
SET LOCAL ROLE authenticated;

SELECT set_config(
  'unified_board_test.activity_id',
  (public.upsert_event_activity(
    'verification:unified-event',
    'نشاط واجهة مؤقت',
    'يُلغى هذا النشاط تلقائياً بعد الاختبار',
    'OPTIONAL',
    10,
    2,
    now() + interval '1 day'
  )).id::text,
  true
);

SELECT set_config(
  'unified_board_test.task_id',
  (public.create_internal_task(
    'مهمة واجهة مؤقتة',
    'تُلغى هذه المهمة تلقائياً بعد الاختبار',
    20,
    2,
    now() + interval '1 day'
  )).id::text,
  true
);

SELECT set_config(
  'unified_board_test.mandatory_activity_id',
  (public.upsert_event_activity(
    'verification:mandatory-event',
    'نشاط إلزامي مؤقت',
    'يختبر فرض العذر داخل الخادم',
    'MANDATORY',
    0,
    2,
    now() + interval '1 day'
  )).id::text,
  true
);

SELECT set_config(
  'unified_board_test.paid_activity_id',
  (public.upsert_event_activity(
    'verification:paid-event',
    'نشاط مدفوع مؤقت',
    'يختبر رصيد الطالب داخل الخادم',
    'PAID',
    100000,
    2,
    now() + interval '1 day'
  )).id::text,
  true
);

RESET ROLE;

UPDATE public.published_site_content
SET content = jsonb_set(
  content,
  '{events}',
  COALESCE(content -> 'events', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id', 'verification:cms-synced-event',
    'title', 'فعالية منشورة مترابطة',
    'description', 'اختبار مزامنة بطاقة المحتوى مع إعدادات التسجيل',
    'activityType', 'MANDATORY',
    'pointsValue', 15,
    'capacity', 3,
    'registrationDeadline', (now() + interval '2 days')::text,
    'date', (now() + interval '3 days')::text
  )),
  true
)
WHERE id = 'main';

DO $cms_sync_check$
DECLARE
  v_synced record;
BEGIN
  SELECT * INTO v_synced
  FROM public.activities
  WHERE public_event_id = 'verification:cms-synced-event';
  IF NOT FOUND
     OR v_synced.type <> 'MANDATORY'::public.activity_type
     OR v_synced.points_value <> 15
     OR v_synced.max_capacity <> 3 THEN
    RAISE EXCEPTION 'PUBLISHED_EVENT_ACTIVITY_SYNC_FAILED';
  END IF;
END
$cms_sync_check$;

UPDATE public.profiles
SET total_points = 0
WHERE id = current_setting('unified_board_test.student_id')::uuid;

SELECT set_config('request.jwt.claim.sub', current_setting('unified_board_test.student_id'), true);
SET LOCAL ROLE authenticated;

DO $server_invariants$
BEGIN
  BEGIN
    PERFORM public.set_own_activity_enrollment(
      current_setting('unified_board_test.mandatory_activity_id')::uuid,
      'DECLINING',
      NULL
    );
    RAISE EXCEPTION 'MANDATORY_DECLINE_WITHOUT_EXCUSE_WAS_ALLOWED';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    PERFORM public.set_own_activity_enrollment(
      current_setting('unified_board_test.paid_activity_id')::uuid,
      'JOINING',
      NULL
    );
    RAISE EXCEPTION 'PAID_JOIN_WITHOUT_POINTS_WAS_ALLOWED';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$server_invariants$;

DO $initial_projection$
DECLARE
  v_activity record;
  v_task record;
BEGIN
  SELECT * INTO v_activity
  FROM public.list_student_activity_board()
  WHERE public_event_id = 'verification:unified-event';
  IF NOT FOUND OR v_activity.joining_count <> 0 OR v_activity.remaining_capacity <> 2
     OR v_activity.decision IS NOT NULL THEN
    RAISE EXCEPTION 'UNIFIED_ACTIVITY_INITIAL_PROJECTION_INVALID';
  END IF;

  SELECT * INTO v_task
  FROM public.list_student_task_board()
  WHERE task_id = current_setting('unified_board_test.task_id')::uuid;
  IF NOT FOUND OR v_task.enrollment_count <> 0 OR v_task.is_enrolled THEN
    RAISE EXCEPTION 'UNIFIED_TASK_INITIAL_PROJECTION_INVALID';
  END IF;
END
$initial_projection$;

SELECT public.set_own_activity_enrollment(
  current_setting('unified_board_test.activity_id')::uuid,
  'JOINING',
  NULL
);
SELECT public.register_for_task(current_setting('unified_board_test.task_id')::uuid);

DO $confirmed_projection$
DECLARE
  v_activity record;
  v_task record;
BEGIN
  SELECT * INTO v_activity
  FROM public.list_student_activity_board()
  WHERE public_event_id = 'verification:unified-event';
  IF v_activity.joining_count <> 1 OR v_activity.remaining_capacity <> 1
     OR v_activity.decision <> 'JOINING'::public.activity_decision
     OR v_activity.excuse_text IS NOT NULL THEN
    RAISE EXCEPTION 'UNIFIED_ACTIVITY_CONFIRMED_PROJECTION_INVALID';
  END IF;

  SELECT * INTO v_task
  FROM public.list_student_task_board()
  WHERE task_id = current_setting('unified_board_test.task_id')::uuid;
  IF v_task.enrollment_count <> 1 OR NOT v_task.is_enrolled
     OR v_task.completion_status <> 'PENDING'::public.task_completion_status THEN
    RAISE EXCEPTION 'UNIFIED_TASK_CONFIRMED_PROJECTION_INVALID';
  END IF;
END
$confirmed_projection$;

RESET ROLE;
SET LOCAL ROLE anon;
DO $anon_denial$
BEGIN
  BEGIN
    PERFORM public.list_student_activity_board();
    RAISE EXCEPTION 'ANON_ACTIVITY_BOARD_EXECUTION_WAS_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$anon_denial$;
RESET ROLE;

ROLLBACK;
