-- Create Event Registrations Ledger and Hardened Lifecycle RPCs
-- This migration is intentionally local-only until reviewed and applied through
-- the project's normal migration workflow.

BEGIN;

-- 1. Create event registrations ledger table referencing public.profiles(id)
-- Each registration cycle is recorded as an immutable ledger entry.
-- Re-registration after cancellation creates a new row with its own timestamp,
-- preserving truthful historical analytics without mutating prior records.
CREATE TABLE IF NOT EXISTS public.event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  registered_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  CONSTRAINT event_registrations_status_check CHECK (
    status IN ('active', 'cancelled')
  ),
  CONSTRAINT event_registrations_event_id_trimmed CHECK (
    event_id = btrim(event_id) AND char_length(event_id) BETWEEN 1 AND 120
  ),
  CONSTRAINT event_registrations_lifecycle_check CHECK (
    (status = 'active' AND cancelled_at IS NULL) OR
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
  )
);

-- Partial unique index ensures at most ONE ACTIVE registration per user per event.
-- Multiple historical cancelled registrations for the same user/event may coexist.
CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_active_user_event_idx
  ON public.event_registrations (event_id, user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS event_registrations_user_active_idx
  ON public.event_registrations (user_id, registered_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS event_registrations_event_active_idx
  ON public.event_registrations (event_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS event_registrations_active_date_idx
  ON public.event_registrations (registered_at DESC);

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- Raw SELECT is restricted to own registrations or the current PRESIDENT.
-- Other executive roles consume aggregate statistics via get_admin_dashboard_metrics().
DROP POLICY IF EXISTS "event_registrations_select" ON public.event_registrations;
CREATE POLICY "event_registrations_select"
ON public.event_registrations
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.executive_assignments AS ea
    WHERE ea.user_id = (SELECT auth.uid())
      AND ea.position_key = 'PRESIDENT'
  )
);

REVOKE ALL ON TABLE public.event_registrations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.event_registrations TO authenticated;
GRANT ALL ON TABLE public.event_registrations TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_registrations FROM PUBLIC, anon, authenticated;

-- 2. Server-side registration operation
CREATE OR REPLACE FUNCTION public.register_event_participation(p_event_id text)
RETURNS TABLE (
  ok boolean,
  is_registered boolean,
  registered_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_is_active_member boolean := false;
  v_content jsonb;
  v_event_item jsonb := NULL;
  v_item jsonb;
  v_deadline timestamptz;
  v_capacity integer;
  v_active_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Event ID must not be empty';
  END IF;

  p_event_id := btrim(p_event_id);

  -- Validate active member eligibility
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = v_user_id
      AND p.status = 'active'
  ) INTO v_is_active_member;

  IF NOT v_is_active_member THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active union membership is required to register for events';
  END IF;

  -- Validate user is not banned in Auth (NULL = no ban, <= now() = expired ban, > now() = active ban)
  IF EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = v_user_id
      AND u.banned_until IS NOT NULL
      AND u.banned_until > now()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Account is currently suspended';
  END IF;

  -- Transaction-scoped advisory lock per normalized event_id to serialize concurrent capacity operations
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event_registration:' || p_event_id, 0)
  );

  -- If the user already has an active registration for this event, return idempotent success
  IF EXISTS (
    SELECT 1
    FROM public.event_registrations
    WHERE event_id = p_event_id
      AND user_id = v_user_id
      AND status = 'active'
  ) THEN
    SELECT COUNT(*)::integer INTO v_active_count
    FROM public.event_registrations
    WHERE event_id = p_event_id AND status = 'active';

    ok := true;
    is_registered := true;
    registered_count := v_active_count;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Re-read authoritative published event catalog under lock
  SELECT content INTO v_content
  FROM public.published_site_content
  WHERE id = 'main';

  IF v_content IS NULL OR jsonb_typeof(v_content -> 'events') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Published CMS events catalog is unavailable';
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(v_content -> 'events')
  LOOP
    IF v_item ->> 'id' = p_event_id THEN
      v_event_item := v_item;
      EXIT;
    END IF;
  END LOOP;

  IF v_event_item IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Event was not found in published events catalog';
  END IF;

  -- Re-validate registration deadline if set
  IF NULLIF(btrim(COALESCE(v_event_item ->> 'registrationDeadline', '')), '') IS NOT NULL THEN
    BEGIN
      v_deadline := (v_event_item ->> 'registrationDeadline')::timestamptz;
      IF v_deadline IS NOT NULL AND now() > v_deadline THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Registration deadline has passed';
      END IF;
    EXCEPTION
      WHEN datetime_field_overflow OR invalid_datetime_format THEN
        NULL;
    END;
  END IF;

  -- Re-count active registrations under lock and validate capacity if set
  IF NULLIF(btrim(COALESCE(v_event_item ->> 'capacity', '')), '') IS NOT NULL THEN
    v_capacity := (v_event_item ->> 'capacity')::integer;
    IF v_capacity IS NOT NULL AND v_capacity > 0 THEN
      SELECT COUNT(*)::integer INTO v_active_count
      FROM public.event_registrations
      WHERE event_id = p_event_id AND status = 'active';

      IF v_active_count >= v_capacity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Event is at full capacity';
      END IF;
    END IF;
  END IF;

  -- Insert a new active registration record for this registration cycle.
  -- Prior cancelled rows are never mutated; this preserves immutable historical timestamps.
  INSERT INTO public.event_registrations (
    event_id,
    user_id,
    registered_at,
    cancelled_at,
    status
  )
  VALUES (
    p_event_id,
    v_user_id,
    now(),
    NULL,
    'active'
  );

  SELECT COUNT(*)::integer INTO v_active_count
  FROM public.event_registrations
  WHERE event_id = p_event_id AND status = 'active';

  ok := true;
  is_registered := true;
  registered_count := v_active_count;
  RETURN NEXT;
END;
$function$;

-- 3. Server-side cancellation operation
CREATE OR REPLACE FUNCTION public.unregister_event_participation(p_event_id text)
RETURNS TABLE (
  ok boolean,
  is_registered boolean,
  registered_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_active_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  IF p_event_id IS NULL OR btrim(p_event_id) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Event ID must not be empty';
  END IF;

  p_event_id := btrim(p_event_id);

  -- Transaction-scoped advisory lock per normalized event_id
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('event_registration:' || p_event_id, 0)
  );

  -- Update only the current active row for this user/event cycle
  -- Prior registered_at timestamp remains preserved for truthful analytics
  UPDATE public.event_registrations
  SET status = 'cancelled',
      cancelled_at = now()
  WHERE event_id = p_event_id
    AND user_id = v_user_id
    AND status = 'active';

  SELECT COUNT(*)::integer INTO v_active_count
  FROM public.event_registrations
  WHERE event_id = p_event_id AND status = 'active';

  ok := true;
  is_registered := false;
  registered_count := v_active_count;
  RETURN NEXT;
END;
$function$;

-- 4. List my active registrations
CREATE OR REPLACE FUNCTION public.list_my_event_registrations()
RETURNS TABLE (
  event_id text,
  registered_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT er.event_id, er.registered_at
  FROM public.event_registrations AS er
  WHERE er.user_id = (SELECT auth.uid())
    AND er.status = 'active'
  ORDER BY er.registered_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.register_event_participation(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.unregister_event_participation(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_my_event_registrations() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.register_event_participation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_event_participation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_event_registrations() TO authenticated;

COMMIT;
