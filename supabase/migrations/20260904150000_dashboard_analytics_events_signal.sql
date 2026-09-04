-- Safe signal table for authoritative admin dashboard analytics Realtime invalidation.
-- Prevents exposing sensitive member/application rows to client Realtime subscriptions
-- and ensures non-president leadership accounts (Academic Head, Media Head, Vice President)
-- receive invalidation events regardless of underlying table-level RLS restrictions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboard_analytics_events (
  id text PRIMARY KEY DEFAULT 'dashboard' CHECK (id = 'dashboard'),
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed singleton signal row
INSERT INTO public.dashboard_analytics_events (id, version, updated_at)
VALUES ('dashboard', 0, now())
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.dashboard_analytics_events ENABLE ROW LEVEL SECURITY;

-- Revoke all direct write access from client roles
REVOKE ALL ON TABLE public.dashboard_analytics_events
  FROM PUBLIC, anon, authenticated, service_role;

-- Grant SELECT only to authenticated (for leadership) and service_role
GRANT SELECT ON TABLE public.dashboard_analytics_events TO authenticated;
GRANT SELECT ON TABLE public.dashboard_analytics_events TO service_role;

-- RLS Policy: Only authenticated leadership users (executives) can SELECT the signal
DROP POLICY IF EXISTS "dashboard_analytics_events_select" ON public.dashboard_analytics_events;
CREATE POLICY "dashboard_analytics_events_select"
ON public.dashboard_analytics_events
FOR SELECT
TO authenticated
USING (
  COALESCE((
    SELECT authz.is_executive
    FROM private.current_user_authorization AS authz
  ), false)
);

-- Private trigger function to increment version monotonically
CREATE OR REPLACE FUNCTION private.bump_dashboard_analytics_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.dashboard_analytics_events
  SET version = version + 1,
      updated_at = now()
  WHERE id = 'dashboard';
  RETURN NULL;
END;
$function$;

-- Lock down trigger function execution
REVOKE EXECUTE ON FUNCTION private.bump_dashboard_analytics_event()
  FROM PUBLIC, anon, authenticated, service_role;

-- Attach statement-level triggers to all three authoritative analytics source tables
DROP TRIGGER IF EXISTS profiles_signal_dashboard_analytics ON public.profiles;
CREATE TRIGGER profiles_signal_dashboard_analytics
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH STATEMENT
EXECUTE FUNCTION private.bump_dashboard_analytics_event();

DROP TRIGGER IF EXISTS student_applications_signal_dashboard_analytics ON public.student_applications;
CREATE TRIGGER student_applications_signal_dashboard_analytics
AFTER INSERT OR UPDATE OR DELETE ON public.student_applications
FOR EACH STATEMENT
EXECUTE FUNCTION private.bump_dashboard_analytics_event();

DROP TRIGGER IF EXISTS event_registrations_signal_dashboard_analytics ON public.event_registrations;
CREATE TRIGGER event_registrations_signal_dashboard_analytics
AFTER INSERT OR UPDATE OR DELETE ON public.event_registrations
FOR EACH STATEMENT
EXECUTE FUNCTION private.bump_dashboard_analytics_event();

-- Add signal table to Realtime publication
DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'dashboard_analytics_events'
     ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.dashboard_analytics_events;
  END IF;
END
$realtime$;

COMMIT;
