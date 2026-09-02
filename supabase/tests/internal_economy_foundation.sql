-- Run against a disposable/local Supabase database or inside an explicit
-- transaction on the official project. This test performs catalog checks only.
BEGIN;

DO $checks$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing
  FROM (VALUES
    ('activities'),
    ('activity_enrollments'),
    ('tasks'),
    ('task_enrollments'),
    ('points_ledger')
  ) AS expected(name)
  WHERE to_regclass('public.' || expected.name) IS NULL;
  IF v_missing <> 0 THEN RAISE EXCEPTION 'INTERNAL_ECONOMY_TABLES_MISSING'; END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('activities'),
      ('activity_enrollments'),
      ('tasks'),
      ('task_enrollments'),
      ('points_ledger')
    ) AS expected(name)
    JOIN pg_class AS relation ON relation.oid = to_regclass('public.' || expected.name)
    WHERE NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'INTERNAL_ECONOMY_RLS_NOT_ENABLED';
  END IF;

  IF has_table_privilege('anon', 'public.activities', 'SELECT')
     OR has_table_privilege('anon', 'public.points_ledger', 'SELECT') THEN
    RAISE EXCEPTION 'INTERNAL_ECONOMY_ANON_PRIVILEGE_LEAK';
  END IF;

  IF has_table_privilege('authenticated', 'public.points_ledger', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.points_ledger', 'DELETE')
     OR has_table_privilege('authenticated', 'public.points_ledger', 'INSERT')
     OR has_table_privilege('service_role', 'public.points_ledger', 'UPDATE')
     OR has_table_privilege('service_role', 'public.points_ledger', 'DELETE') THEN
    RAISE EXCEPTION 'POINTS_LEDGER_IS_NOT_APPEND_ONLY';
  END IF;

  IF has_table_privilege('service_role', 'public.activities', 'DELETE')
     OR has_table_privilege('service_role', 'public.activity_enrollments', 'DELETE')
     OR has_table_privilege('service_role', 'public.tasks', 'DELETE')
     OR has_table_privilege('service_role', 'public.task_enrollments', 'DELETE') THEN
    RAISE EXCEPTION 'ENROLLMENT_HISTORY_DELETE_PRIVILEGE_LEAK';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid IN (
      'public.activity_enrollments'::regclass,
      'public.task_enrollments'::regclass
    )
      AND contype = 'f'
      AND confdeltype <> 'r'
  ) THEN
    RAISE EXCEPTION 'ENROLLMENT_HISTORY_FOREIGN_KEY_NOT_RESTRICTED';
  END IF;

  IF has_column_privilege('authenticated', 'public.activity_enrollments', 'attendance_status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.activity_enrollments', 'excuse_status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.task_enrollments', 'completion_status', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.profiles', 'total_points', 'UPDATE') THEN
    RAISE EXCEPTION 'STUDENT_ADMIN_COLUMN_PRIVILEGE_LEAK';
  END IF;

  IF has_table_privilege('authenticated', 'public.activity_enrollments', 'INSERT')
     OR has_table_privilege('authenticated', 'public.activity_enrollments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.task_enrollments', 'INSERT')
     OR has_column_privilege('authenticated', 'public.activity_enrollments', 'activity_id', 'INSERT')
     OR has_column_privilege('authenticated', 'public.activity_enrollments', 'decision', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.activity_enrollments', 'excuse_text', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.task_enrollments', 'task_id', 'INSERT') THEN
    RAISE EXCEPTION 'STUDENT_ENROLLMENT_TABLE_MUTATION_LEAK';
  END IF;

  IF to_regprocedure('public.set_own_activity_enrollment(uuid,activity_decision,text)') IS NULL
     OR to_regprocedure('public.register_for_task(uuid)') IS NULL
     OR to_regprocedure('public.record_points_transaction(uuid,integer,text,text)') IS NULL THEN
    RAISE EXCEPTION 'INTERNAL_ECONOMY_HARDENED_RPC_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.points_ledger'::regclass
      AND tgname = 'points_ledger_apply_to_profile_total'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'POINTS_LEDGER_TOTAL_TRIGGER_MISSING';
  END IF;
END
$checks$;

ROLLBACK;
