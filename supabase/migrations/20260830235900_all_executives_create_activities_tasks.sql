BEGIN;

-- Creation is intentionally separate from the broader economy-management flag.
-- Every current executive may create rows owned by their auth identity, while
-- update/evaluation policies remain unchanged.
DROP POLICY IF EXISTS "activities_admin_insert" ON public.activities;
DROP POLICY IF EXISTS "activities_executive_insert" ON public.activities;
CREATE POLICY "activities_executive_insert"
ON public.activities
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND COALESCE((
    SELECT authz.is_executive
    FROM private.current_user_authorization AS authz
  ), false)
);

DROP POLICY IF EXISTS "tasks_admin_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_executive_insert" ON public.tasks;
CREATE POLICY "tasks_executive_insert"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND COALESCE((
    SELECT authz.is_executive
    FROM private.current_user_authorization AS authz
  ), false)
);

CREATE OR REPLACE FUNCTION public.upsert_event_activity(
  p_public_event_id text,
  p_title text,
  p_description text,
  p_type public.activity_type,
  p_points_value integer,
  p_max_capacity integer,
  p_deadline timestamptz
)
RETURNS public.activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_public_event_id text := btrim(p_public_event_id);
  v_title text := btrim(p_title);
  v_description text := btrim(p_description);
  v_position text;
  v_existing_activity_id uuid;
  v_joining_count integer;
  v_result public.activities;
BEGIN
  IF v_user_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to create activities';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_user_id;

  IF char_length(v_public_event_id) NOT BETWEEN 1 AND 200
     OR char_length(v_title) NOT BETWEEN 1 AND 200
     OR char_length(v_description) NOT BETWEEN 1 AND 8000
     OR p_points_value IS NULL OR p_points_value NOT BETWEEN 0 AND 100000
     OR p_max_capacity IS NULL OR p_max_capacity <= 0
     OR p_deadline IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid activity fields are required';
  END IF;

  IF p_type = 'PAID'::public.activity_type AND p_points_value <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Paid activities require a positive points value';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_public_event_id, 0));

  SELECT activity.id
  INTO v_existing_activity_id
  FROM public.activities AS activity
  WHERE activity.public_event_id = v_public_event_id
  FOR UPDATE;

  IF v_existing_activity_id IS NOT NULL
     AND v_position NOT IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to update existing activities';
  END IF;

  IF v_existing_activity_id IS NULL THEN
    v_joining_count := 0;
  ELSE
    SELECT count(*)::integer
    INTO v_joining_count
    FROM public.activity_enrollments AS enrollment
    WHERE enrollment.activity_id = v_existing_activity_id
      AND enrollment.decision = 'JOINING'::public.activity_decision;
  END IF;

  IF p_max_capacity < v_joining_count THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Activity capacity cannot be lower than confirmed joining count';
  END IF;

  INSERT INTO public.activities (
    public_event_id, title, description, created_by, type,
    points_value, max_capacity, deadline
  ) VALUES (
    v_public_event_id, v_title, v_description, v_user_id, p_type,
    p_points_value, p_max_capacity, p_deadline
  )
  ON CONFLICT (public_event_id) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      type = EXCLUDED.type,
      points_value = EXCLUDED.points_value,
      max_capacity = EXCLUDED.max_capacity,
      deadline = EXCLUDED.deadline
  RETURNING * INTO v_result;

  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.create_internal_task(
  p_title text,
  p_description text,
  p_points_reward integer,
  p_required_students integer,
  p_deadline timestamptz
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_title text := btrim(p_title);
  v_description text := btrim(p_description);
  v_result public.tasks;
BEGIN
  IF v_user_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to create tasks';
  END IF;

  IF char_length(v_title) NOT BETWEEN 1 AND 200
     OR char_length(v_description) NOT BETWEEN 1 AND 8000
     OR p_points_reward IS NULL OR p_points_reward <= 0
     OR p_required_students IS NULL OR p_required_students <= 0
     OR p_deadline IS NULL OR p_deadline <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid future task fields are required';
  END IF;

  INSERT INTO public.tasks (
    title, description, points_reward, created_by,
    required_students, deadline, status
  ) VALUES (
    v_title, v_description, p_points_reward, v_user_id,
    p_required_students, p_deadline, 'OPEN'::public.task_status
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END
$function$;

-- Appends one event only. It cannot edit/delete existing CMS entries and it
-- derives ownership from the current assignment instead of trusting the client.
CREATE OR REPLACE FUNCTION public.create_published_event(
  p_event jsonb,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_events jsonb;
  v_event jsonb;
  v_event_id text;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only current executives may create events';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id;

  IF p_expected_version < 1
     OR p_event IS NULL
     OR jsonb_typeof(p_event) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event publication input is required';
  END IF;

  v_event_id := NULLIF(btrim(p_event ->> 'id'), '');
  IF v_event_id IS NULL OR char_length(v_event_id) > 200
     OR NULLIF(btrim(p_event ->> 'title'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'category'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'date'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'location'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'description'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'status'), '') IS NULL
     OR NULLIF(btrim(p_event ->> 'image'), '') IS NULL
     OR COALESCE(p_event ->> 'capacity', '') !~ '^[1-9][0-9]{0,8}$'
     OR COALESCE(p_event ->> 'activityType', '') NOT IN ('MANDATORY', 'OPTIONAL', 'PAID')
     OR COALESCE(p_event ->> 'pointsValue', '') !~ '^[0-9]{1,6}$'
     OR NULLIF(btrim(p_event ->> 'registrationDeadline'), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid event fields are required';
  END IF;

  SELECT CASE
    WHEN jsonb_typeof(published.content -> 'events') = 'array'
      THEN published.content -> 'events'
    ELSE '[]'::jsonb
  END
  INTO v_events
  FROM public.published_site_content AS published
  WHERE published.id = 'main';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Published site content is not initialized';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_events) AS event_row(value)
    WHERE event_row.value ->> 'id' = v_event_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Event id already exists';
  END IF;

  v_event := (p_event - 'createdBy' - 'createdByRole' - 'registered')
    || jsonb_build_object(
      'createdByRole', v_position,
      'registered', 0
    );

  v_result := private.publish_cms_target_locked(
    v_actor_id,
    'events',
    jsonb_build_array(v_event) || v_events,
    p_expected_version
  );

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_executive()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Event creation authority changed';
  END IF;
  RETURN v_result;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.upsert_event_activity(
  text, text, text, public.activity_type, integer, integer, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_internal_task(
  text, text, integer, integer, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_published_event(jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_event_activity(
  text, text, text, public.activity_type, integer, integer, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_internal_task(
  text, text, integer, integer, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_published_event(jsonb, bigint)
  TO authenticated;

COMMIT;
