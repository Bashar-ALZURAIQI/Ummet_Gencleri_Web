-- Behavioral verification for excuse RBAC and creator-scoped task management.
-- All fixtures and point movements are rolled back.
BEGIN;

SELECT set_config('task_management.president_id', (
  SELECT user_id::text FROM public.executive_assignments WHERE position_key = 'PRESIDENT'
), true);
SELECT set_config('task_management.vice_id', (
  SELECT user_id::text FROM public.executive_assignments WHERE position_key = 'VICE_PRESIDENT'
), true);
SELECT set_config('task_management.academic_id', (
  SELECT user_id::text FROM public.executive_assignments WHERE position_key = 'ACADEMIC_HEAD'
), true);
SELECT set_config('task_management.media_id', (
  SELECT user_id::text FROM public.executive_assignments WHERE position_key = 'MEDIA_HEAD'
), true);
SELECT set_config('task_management.student_id', (
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
  ORDER BY profile.created_at, profile.id
  LIMIT 1
), true);

DO $fixtures$
DECLARE
  v_president uuid := current_setting('task_management.president_id')::uuid;
  v_vice uuid := current_setting('task_management.vice_id')::uuid;
  v_academic uuid := current_setting('task_management.academic_id')::uuid;
  v_media uuid := current_setting('task_management.media_id')::uuid;
  v_student uuid := current_setting('task_management.student_id')::uuid;
  v_media_task uuid := gen_random_uuid();
  v_academic_task uuid := gen_random_uuid();
  v_activity uuid := gen_random_uuid();
BEGIN
  IF v_president IS NULL OR v_vice IS NULL OR v_academic IS NULL
     OR v_media IS NULL OR v_student IS NULL THEN
    RAISE EXCEPTION 'TASK_MANAGEMENT_FIXTURE_ID_MISSING';
  END IF;

  INSERT INTO public.tasks (
    id, title, description, points_reward, created_by,
    required_students, deadline, status
  ) VALUES
    (v_media_task, 'media owned verification task', 'rollback fixture', 12,
     v_media, 2, now() + interval '2 days', 'OPEN'),
    (v_academic_task, 'academic full verification task', 'rollback fixture', 8,
     v_academic, 1, now() + interval '2 days', 'FULL');

  INSERT INTO public.task_enrollments (task_id, student_id)
  VALUES (v_media_task, v_student);

  INSERT INTO public.activities (
    id, title, description, created_by, type, points_value,
    max_capacity, deadline
  ) VALUES (
    v_activity, 'mandatory excuse verification', 'rollback fixture',
    v_president, 'MANDATORY', 5, 10, now() + interval '1 day'
  );

  INSERT INTO public.activity_enrollments (
    activity_id, student_id, decision, excuse_text
  ) VALUES (
    v_activity, v_student, 'DECLINING', 'عذر تحقق مؤقت'
  );

  PERFORM set_config('task_management.media_task_id', v_media_task::text, true);
  PERFORM set_config('task_management.academic_task_id', v_academic_task::text, true);
  PERFORM set_config('task_management.activity_id', v_activity::text, true);
END;
$fixtures$;

SELECT set_config('request.jwt.claim.sub', current_setting('task_management.academic_id'), true);
SET LOCAL ROLE authenticated;
DO $academic_denied_excuses$
BEGIN
  BEGIN
    PERFORM public.list_pending_mandatory_excuses();
    RAISE EXCEPTION 'ACADEMIC_EXCUSE_LIST_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.activity_enrollments
    WHERE student_id = current_setting('task_management.student_id')::uuid
  ) THEN
    RAISE EXCEPTION 'ACADEMIC_RLS_EXPOSED_OTHER_STUDENT_EXCUSE';
  END IF;

  IF (SELECT count(*) FROM public.list_managed_tasks()) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.list_managed_tasks()
       WHERE task_id = current_setting('task_management.academic_task_id')::uuid
         AND task_status = 'FULL'
     ) THEN
    RAISE EXCEPTION 'ACADEMIC_TASK_SCOPE_FAILED';
  END IF;
END;
$academic_denied_excuses$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', current_setting('task_management.vice_id'), true);
SET LOCAL ROLE authenticated;
DO $vice_excuses$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.list_pending_mandatory_excuses()
    WHERE activity_id = current_setting('task_management.activity_id')::uuid
  ) THEN
    RAISE EXCEPTION 'VICE_EXCUSE_ACCESS_FAILED';
  END IF;
END;
$vice_excuses$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', current_setting('task_management.media_id'), true);
SET LOCAL ROLE authenticated;
DO $media_scope$
BEGIN
  IF (SELECT count(*) FROM public.list_managed_tasks()) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.list_managed_tasks()
       WHERE task_id = current_setting('task_management.media_task_id')::uuid
     ) THEN
    RAISE EXCEPTION 'MEDIA_TASK_SCOPE_FAILED';
  END IF;

  BEGIN
    PERFORM public.list_managed_task_enrollments(
      current_setting('task_management.academic_task_id')::uuid
    );
    RAISE EXCEPTION 'MEDIA_OTHER_TASK_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$media_scope$;

SELECT public.save_task_completion(
  current_setting('task_management.media_task_id')::uuid,
  current_setting('task_management.student_id')::uuid,
  'PERFECT'
);
SELECT public.finalize_task_evaluation(
  current_setting('task_management.media_task_id')::uuid
);
SELECT public.finalize_task_evaluation(
  current_setting('task_management.media_task_id')::uuid
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', current_setting('task_management.president_id'), true);
SET LOCAL ROLE authenticated;
DO $president_scope_and_ledger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.list_managed_tasks()
    WHERE task_id = current_setting('task_management.academic_task_id')::uuid
  ) THEN
    RAISE EXCEPTION 'PRESIDENT_ALL_TASKS_SCOPE_FAILED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.list_managed_tasks()
    WHERE task_id = current_setting('task_management.media_task_id')::uuid
  ) THEN
    RAISE EXCEPTION 'CLOSED_TASK_STILL_VISIBLE';
  END IF;

  IF (SELECT count(*) FROM public.points_ledger
      WHERE source_key = 'task-result:'
        || current_setting('task_management.media_task_id')
        || ':' || current_setting('task_management.student_id')) <> 1 THEN
    RAISE EXCEPTION 'TASK_POINTS_IDEMPOTENCY_FAILED';
  END IF;
END;
$president_scope_and_ledger$;
RESET ROLE;

ROLLBACK;
SELECT 'TASK_MANAGEMENT_AUTHORIZATION_OK' AS result;
