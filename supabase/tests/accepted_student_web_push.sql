-- Run against a disposable/local Supabase database or inside an explicit
-- transaction on the official project. This file deliberately does not create
-- Auth fixtures by itself; the runner supplies accepted and non-accepted UUIDs.
BEGIN;

DO $checks$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing
  FROM (VALUES
    ('push_subscriptions'),
    ('push_notifications'),
    ('push_notification_deliveries')
  ) AS expected(name)
  WHERE to_regclass('public.' || expected.name) IS NULL;
  IF v_missing <> 0 THEN RAISE EXCEPTION 'WEB_PUSH_TABLES_MISSING'; END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('push_subscriptions'),
      ('push_notifications'),
      ('push_notification_deliveries')
    ) AS expected(name)
    JOIN pg_class AS relation ON relation.oid = to_regclass('public.' || expected.name)
    WHERE NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'WEB_PUSH_RLS_NOT_ENABLED';
  END IF;

  IF has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.push_notifications', 'INSERT') THEN
    RAISE EXCEPTION 'WEB_PUSH_BROWSER_TABLE_PRIVILEGE_LEAK';
  END IF;

  IF to_regprocedure('public.register_accepted_student_push_subscription(text,text,text,text)') IS NULL
     OR to_regprocedure('public.disable_own_push_subscription(text)') IS NULL THEN
    RAISE EXCEPTION 'WEB_PUSH_RPC_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.published_site_content'::regclass
      AND tgname = 'published_site_content_enqueue_push_notifications'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'WEB_PUSH_CMS_TRIGGER_MISSING';
  END IF;

  IF to_regprocedure('private.dispatch_accepted_student_web_push()') IS NULL THEN
    RAISE EXCEPTION 'WEB_PUSH_DISPATCH_FUNCTION_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.push_notifications'::regclass
      AND tgname = 'send_web_push_notification'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'WEB_PUSH_DISPATCH_TRIGGER_MISSING';
  END IF;
END
$checks$;

-- The live runner adds role-scoped registration checks and disposable CMS
-- updates here, then verifies that rollback leaves no notification fixtures.
ROLLBACK;
