BEGIN;

DO $fixtures$
DECLARE
  v_president uuid;
  v_activity uuid := gen_random_uuid();
BEGIN
  SELECT assignment.user_id
  INTO v_president
  FROM public.executive_assignments AS assignment
  WHERE assignment.position_key = 'PRESIDENT';

  IF v_president IS NULL THEN
    RAISE EXCEPTION 'ACTIVITY_PROGRAM_TEST_PRESIDENT_MISSING';
  END IF;

  INSERT INTO public.activities (
    id, public_event_id, title, description, created_by,
    type, points_value, max_capacity, deadline
  ) VALUES (
    v_activity, 'verification:executive-paid-activity',
    'نشاط مدفوع للتحقق', 'بيانات مؤقتة داخل معاملة متراجعة', v_president,
    'PAID', 100000, 14, now() + interval '1 day'
  );

  PERFORM set_config('activity_program_test.president_id', v_president::text, true);
  PERFORM set_config('activity_program_test.activity_id', v_activity::text, true);
END
$fixtures$;

SET LOCAL ROLE anon;
DO $anonymous_projection$
DECLARE
  v_row record;
BEGIN
  SELECT *
  INTO v_row
  FROM public.list_activity_program_board()
  WHERE activity_id = current_setting('activity_program_test.activity_id')::uuid;

  IF NOT FOUND
     OR v_row.joining_count <> 0
     OR v_row.max_capacity <> 14
     OR v_row.can_participate
     OR v_row.economy_exempt THEN
    RAISE EXCEPTION 'ANONYMOUS_ACTIVITY_COUNT_PROJECTION_INVALID';
  END IF;
END
$anonymous_projection$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', current_setting('activity_program_test.president_id'), true);
SET LOCAL ROLE authenticated;

DO $executive_participation$
DECLARE
  v_activity_id uuid := current_setting('activity_program_test.activity_id')::uuid;
  v_president_id uuid := current_setting('activity_program_test.president_id')::uuid;
  v_before_ledger integer;
  v_after_ledger integer;
  v_row record;
BEGIN
  SELECT count(*)::integer INTO v_before_ledger
  FROM public.points_ledger
  WHERE student_id = v_president_id;

  PERFORM public.set_own_activity_enrollment(v_activity_id, 'JOINING', NULL);

  SELECT * INTO v_row
  FROM public.list_activity_program_board()
  WHERE activity_id = v_activity_id;

  IF NOT FOUND
     OR v_row.joining_count <> 1
     OR v_row.decision <> 'JOINING'
     OR NOT v_row.can_participate
     OR NOT v_row.economy_exempt THEN
    RAISE EXCEPTION 'EXECUTIVE_ACTIVITY_PARTICIPATION_INVALID';
  END IF;

  PERFORM public.save_activity_attendance(v_activity_id, v_president_id, 'ON_TIME');
  PERFORM public.finalize_activity_evaluation(v_activity_id);

  SELECT count(*)::integer INTO v_after_ledger
  FROM public.points_ledger
  WHERE student_id = v_president_id;

  IF v_after_ledger <> v_before_ledger THEN
    RAISE EXCEPTION 'EXECUTIVE_ACTIVITY_CHANGED_POINTS_LEDGER';
  END IF;
END
$executive_participation$;

RESET ROLE;
ROLLBACK;

SELECT 'ACTIVITY_PROGRAM_PARTICIPATION_OK' AS result;
