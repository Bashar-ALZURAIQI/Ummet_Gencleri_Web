-- Authoritative Admin Dashboard Analytics Aggregate RPC
-- This migration is intentionally local-only until reviewed and applied through
-- the project's normal migration workflow.

BEGIN;

-- Executive Analytics RPC
-- Returns aggregate metrics only, avoiding exposure of member/applicant private data to client.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS TABLE (
  total_members_count integer,
  active_members_count integer,
  pending_applications_count integer,
  six_month_member_growth jsonb,
  six_month_event_participations jsonb,
  event_participation_by_id jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_is_executive boolean := false;
  v_ref_date timestamptz := now();
  v_start_date timestamptz;
  v_total_members integer := 0;
  v_active_members integer := 0;
  v_pending_applications integer := 0;
  v_member_growth jsonb := '[]'::jsonb;
  v_event_participations jsonb := '[]'::jsonb;
  v_event_participation_by_id jsonb := '{}'::jsonb;
BEGIN
  -- 1. Authorization: Only assigned executives may run aggregate analytics
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.executive_assignments WHERE user_id = v_actor_id
  ) INTO v_is_executive;

  IF NOT v_is_executive THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Insufficient privileges: Executive assignment required';
  END IF;

  -- 2. Calculate rolling 6 months boundary (reference month minus 5 calendar months to end of reference month)
  v_start_date := date_trunc('month', v_ref_date) - interval '5 months';

  -- 3. Query profiles & applications counts
  -- Total members count: Deduplicated union of active profiles PLUS accepted applications with inactive profiles
  -- Exclude removed, banned, unapproved/pending-only/rejected-only
  WITH eligible_members AS (
    SELECT p.id FROM public.profiles AS p WHERE p.status = 'active'
    UNION
    SELECT a.student_user_id AS id FROM public.student_applications AS a
    JOIN public.profiles AS p ON p.id = a.student_user_id
    WHERE p.status = 'inactive' AND a.status = 'accepted'
  )
  SELECT COUNT(*)::integer INTO v_total_members FROM eligible_members;

  -- Active members: profiles.status = 'active'
  SELECT COUNT(*)::integer INTO v_active_members
  FROM public.profiles AS p
  WHERE p.status = 'active';

  -- Pending applications count (applications requiring review)
  SELECT COUNT(*)::integer INTO v_pending_applications
  FROM public.student_applications AS a
  WHERE a.status IN ('pending', 'interview');

  -- 4. Member Growth Series: Group accepted applications strictly by decided_at
  -- Exclude records with null decided_at without inventing fake months
  WITH months AS (
    SELECT generate_series(
      v_start_date,
      date_trunc('month', v_ref_date),
      interval '1 month'
    )::timestamptz AS month_start
  ),
  app_counts AS (
    SELECT
      date_trunc('month', a.decided_at) AS m_date,
      EXTRACT(YEAR FROM a.decided_at)::integer AS yr,
      EXTRACT(MONTH FROM a.decided_at)::integer AS mo,
      COUNT(*)::integer AS cnt
    FROM public.student_applications AS a
    WHERE a.status = 'accepted'
      AND a.decided_at IS NOT NULL
      AND a.decided_at >= v_start_date
      AND a.decided_at < date_trunc('month', v_ref_date) + interval '1 month'
    GROUP BY date_trunc('month', a.decided_at), EXTRACT(YEAR FROM a.decided_at), EXTRACT(MONTH FROM a.decided_at)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'year', EXTRACT(YEAR FROM m.month_start)::integer,
        'month', EXTRACT(MONTH FROM m.month_start)::integer,
        'count', COALESCE(ac.cnt, 0)
      )
      ORDER BY m.month_start ASC
    ),
    '[]'::jsonb
  ) INTO v_member_growth
  FROM months AS m
  LEFT JOIN app_counts AS ac ON ac.m_date = m.month_start;

  -- 5. Six-Month Event Participations Series: Group ALL genuine registration cycles by registered_at
  -- Does NOT filter by status = 'active' because historical registrations remain truthful even if later cancelled
  WITH months AS (
    SELECT generate_series(
      v_start_date,
      date_trunc('month', v_ref_date),
      interval '1 month'
    )::timestamptz AS month_start
  ),
  reg_counts AS (
    SELECT
      date_trunc('month', er.registered_at) AS m_date,
      EXTRACT(YEAR FROM er.registered_at)::integer AS yr,
      EXTRACT(MONTH FROM er.registered_at)::integer AS mo,
      COUNT(*)::integer AS cnt
    FROM public.event_registrations AS er
    WHERE er.registered_at >= v_start_date
      AND er.registered_at < date_trunc('month', v_ref_date) + interval '1 month'
    GROUP BY date_trunc('month', er.registered_at), EXTRACT(YEAR FROM er.registered_at), EXTRACT(MONTH FROM er.registered_at)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'year', EXTRACT(YEAR FROM m.month_start)::integer,
        'month', EXTRACT(MONTH FROM m.month_start)::integer,
        'count', COALESCE(rc.cnt, 0)
      )
      ORDER BY m.month_start ASC
    ),
    '[]'::jsonb
  ) INTO v_event_participations
  FROM months AS m
  LEFT JOIN reg_counts AS rc ON rc.m_date = m.month_start;

  -- 6. Current Active Event Participation by ID Map
  -- Authoritative active registrations grouped by event_id
  WITH active_part AS (
    SELECT
      er.event_id,
      COUNT(*)::integer AS cnt
    FROM public.event_registrations AS er
    WHERE er.status = 'active'
    GROUP BY er.event_id
  )
  SELECT COALESCE(
    (SELECT jsonb_object_agg(ap.event_id, ap.cnt) FROM active_part AS ap),
    '{}'::jsonb
  ) INTO v_event_participation_by_id;

  -- Return single row of aggregate data
  total_members_count := v_total_members;
  active_members_count := v_active_members;
  pending_applications_count := v_pending_applications;
  six_month_member_growth := COALESCE(v_member_growth, '[]'::jsonb);
  six_month_event_participations := COALESCE(v_event_participations, '[]'::jsonb);
  event_participation_by_id := COALESCE(v_event_participation_by_id, '{}'::jsonb);

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO service_role;

COMMIT;
