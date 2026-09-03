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
  accepted_applications_count integer,
  pending_applications_count integer,
  total_events_count integer,
  active_event_registrations_count integer,
  member_growth_series jsonb,
  event_registrations_series jsonb,
  category_distribution jsonb,
  participation_by_category jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_is_executive boolean := false;
  v_content jsonb;
  v_events jsonb := '[]'::jsonb;
  v_ref_date timestamptz := now();
  v_start_date timestamptz;
  v_total_members integer := 0;
  v_active_members integer := 0;
  v_accepted_applications integer := 0;
  v_pending_applications integer := 0;
  v_total_events integer := 0;
  v_active_registrations integer := 0;
  v_member_growth jsonb := '[]'::jsonb;
  v_event_series jsonb := '[]'::jsonb;
  v_category_dist jsonb := '[]'::jsonb;
  v_participation_dist jsonb := '[]'::jsonb;
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
    SELECT a.user_id AS id FROM public.student_applications AS a
    JOIN public.profiles AS p ON p.id = a.user_id
    WHERE p.status = 'inactive' AND a.status = 'accepted'
  )
  SELECT COUNT(*)::integer INTO v_total_members FROM eligible_members;

  -- Active members: profiles.status = 'active'
  SELECT COUNT(*)::integer INTO v_active_members
  FROM public.profiles AS p
  WHERE p.status = 'active';

  -- Accepted applications count
  SELECT COUNT(*)::integer INTO v_accepted_applications
  FROM public.student_applications AS a
  WHERE a.status = 'accepted';

  -- Pending applications count (applications requiring review)
  SELECT COUNT(*)::integer INTO v_pending_applications
  FROM public.student_applications AS a
  WHERE a.status IN ('pending', 'interview');

  -- 4. Query published events from CMS published_site_content
  SELECT content INTO v_content
  FROM public.published_site_content
  WHERE id = 'main';

  IF v_content IS NOT NULL AND jsonb_typeof(v_content -> 'events') = 'array' THEN
    v_events := v_content -> 'events';
  END IF;

  v_total_events := jsonb_array_length(v_events);

  -- 5. Active event registrations count
  SELECT COUNT(*)::integer INTO v_active_registrations
  FROM public.event_registrations AS er
  WHERE er.status = 'active';

  -- 6. Member Growth Series: Group accepted applications strictly by decided_at
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
  SELECT jsonb_agg(
    jsonb_build_object(
      'year', EXTRACT(YEAR FROM m.month_start)::integer,
      'month', EXTRACT(MONTH FROM m.month_start)::integer,
      'label', to_char(m.month_start, 'YYYY-MM'),
      'count', COALESCE(ac.cnt, 0)
    )
    ORDER BY m.month_start ASC
  ) INTO v_member_growth
  FROM months AS m
  LEFT JOIN app_counts AS ac ON ac.m_date = m.month_start;

  -- 7. Event Registrations Series: Group active event registrations by registered_at
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
    WHERE er.status = 'active'
      AND er.registered_at >= v_start_date
      AND er.registered_at < date_trunc('month', v_ref_date) + interval '1 month'
    GROUP BY date_trunc('month', er.registered_at), EXTRACT(YEAR FROM er.registered_at), EXTRACT(MONTH FROM er.registered_at)
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'year', EXTRACT(YEAR FROM m.month_start)::integer,
      'month', EXTRACT(MONTH FROM m.month_start)::integer,
      'label', to_char(m.month_start, 'YYYY-MM'),
      'count', COALESCE(rc.cnt, 0)
    )
    ORDER BY m.month_start ASC
  ) INTO v_event_series
  FROM months AS m
  LEFT JOIN reg_counts AS rc ON rc.m_date = m.month_start;

  -- 8. Category Distribution of Published Events
  WITH parsed_events AS (
    SELECT
      COALESCE(e ->> 'category', 'other') AS category,
      COUNT(*)::integer AS cnt
    FROM jsonb_array_elements(v_events) AS e
    GROUP BY COALESCE(e ->> 'category', 'other')
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'category', pe.category,
        'count', pe.cnt
      )
      ORDER BY pe.cnt DESC
    ),
    '[]'::jsonb
  ) INTO v_category_dist
  FROM parsed_events AS pe;

  -- 9. Participation by Category: Map active registrations to event categories
  WITH event_regs AS (
    SELECT
      er.event_id,
      COUNT(*)::integer AS reg_count
    FROM public.event_registrations AS er
    WHERE er.status = 'active'
    GROUP BY er.event_id
  ),
  event_category_map AS (
    SELECT
      e ->> 'id' AS event_id,
      COALESCE(e ->> 'category', 'other') AS category
    FROM jsonb_array_elements(v_events) AS e
  ),
  part_by_cat AS (
    SELECT
      ecm.category,
      SUM(COALESCE(er.reg_count, 0))::integer AS total_registrations
    FROM event_category_map AS ecm
    LEFT JOIN event_regs AS er ON er.event_id = ecm.event_id
    GROUP BY ecm.category
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'category', pbc.category,
        'count', pbc.total_registrations
      )
      ORDER BY pbc.total_registrations DESC
    ),
    '[]'::jsonb
  ) INTO v_participation_dist
  FROM part_by_cat AS pbc;

  -- Return single row of aggregate data
  total_members_count := v_total_members;
  active_members_count := v_active_members;
  accepted_applications_count := v_accepted_applications;
  pending_applications_count := v_pending_applications;
  total_events_count := v_total_events;
  active_event_registrations_count := v_active_registrations;
  member_growth_series := COALESCE(v_member_growth, '[]'::jsonb);
  event_registrations_series := COALESCE(v_event_series, '[]'::jsonb);
  category_distribution := COALESCE(v_category_dist, '[]'::jsonb);
  participation_by_category := COALESCE(v_participation_dist, '[]'::jsonb);

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO service_role;

COMMIT;
