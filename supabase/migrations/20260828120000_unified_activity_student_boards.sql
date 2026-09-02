BEGIN;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS public_event_id text;

ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_public_event_id_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_public_event_id_check CHECK (
    public_event_id IS NULL
    OR (
      public_event_id = btrim(public_event_id)
      AND char_length(public_event_id) BETWEEN 1 AND 200
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS activities_public_event_id_unique_idx
  ON public.activities (public_event_id);

-- Preserve every currently published event and its media. The CMS remains the
-- public presentation source; this creates only the durable interaction link.
DO $backfill_published_events$
DECLARE
  v_created_by uuid;
BEGIN
  SELECT assignment.user_id
  INTO v_created_by
  FROM public.executive_assignments AS assignment
  WHERE assignment.position_key = 'PRESIDENT'
  ORDER BY assignment.assigned_at DESC
  LIMIT 1;

  IF v_created_by IS NOT NULL THEN
    INSERT INTO public.activities (
      public_event_id,
      title,
      description,
      created_by,
      type,
      points_value,
      max_capacity,
      deadline
    )
    SELECT
      btrim(event_row.value ->> 'id'),
      left(btrim(event_row.value ->> 'title'), 200),
      left(COALESCE(NULLIF(btrim(event_row.value ->> 'description'), ''), 'فعالية اتحاد شباب الأمة'), 8000),
      v_created_by,
      'OPTIONAL'::public.activity_type,
      0,
      CASE
        WHEN COALESCE(event_row.value ->> 'capacity', '') ~ '^[1-9][0-9]{0,8}$'
          THEN (event_row.value ->> 'capacity')::integer
        ELSE NULL
      END,
      CASE
        WHEN COALESCE(event_row.value ->> 'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          THEN (event_row.value ->> 'date')::timestamptz
        ELSE now()
      END
    FROM public.published_site_content AS published
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(published.content -> 'events') = 'array'
          THEN published.content -> 'events'
        ELSE '[]'::jsonb
      END
    ) AS event_row(value)
    WHERE published.id = 'main'
      AND jsonb_typeof(event_row.value) = 'object'
      AND NULLIF(btrim(event_row.value ->> 'id'), '') IS NOT NULL
      AND NULLIF(btrim(event_row.value ->> 'title'), '') IS NOT NULL
    ON CONFLICT (public_event_id) DO NOTHING;
  END IF;
END
$backfill_published_events$;

CREATE OR REPLACE FUNCTION public.list_student_activity_board()
RETURNS TABLE (
  activity_id uuid,
  public_event_id text,
  title text,
  description text,
  type public.activity_type,
  points_value integer,
  max_capacity integer,
  deadline timestamptz,
  joining_count integer,
  remaining_capacity integer,
  decision public.activity_decision,
  excuse_text text,
  total_points integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.student_applications AS application
      ON application.student_user_id = profile.id
     AND application.status = 'accepted'
    WHERE profile.id = v_user_id
      AND profile.status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted active students may load the activity board';
  END IF;

  RETURN QUERY
  SELECT
    activity.id AS activity_id,
    activity.public_event_id,
    activity.title,
    activity.description,
    activity.type,
    activity.points_value,
    activity.max_capacity,
    activity.deadline,
    counts.joining_count,
    CASE
      WHEN activity.max_capacity IS NULL THEN NULL
      ELSE GREATEST(activity.max_capacity - counts.joining_count, 0)
    END AS remaining_capacity,
    own_enrollment.decision,
    own_enrollment.excuse_text,
    profile.total_points
  FROM public.activities AS activity
  JOIN public.profiles AS profile ON profile.id = v_user_id
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS joining_count
    FROM public.activity_enrollments AS enrollment
    WHERE enrollment.activity_id = activity.id
      AND enrollment.decision = 'JOINING'::public.activity_decision
  ) AS counts
  LEFT JOIN public.activity_enrollments AS own_enrollment
    ON own_enrollment.activity_id = activity.id
   AND own_enrollment.student_id = v_user_id
  WHERE activity.public_event_id IS NOT NULL
  ORDER BY activity.deadline ASC, activity.created_at DESC;
END
$function$;

-- Re-assert enrollment invariants at the trusted server boundary. The UI also
-- explains these rules, but callers cannot bypass them by invoking the API
-- directly. Point charging/refunds remain a separate, auditable ledger action.
CREATE OR REPLACE FUNCTION public.set_own_activity_enrollment(
  p_activity_id uuid,
  p_decision public.activity_decision,
  p_excuse_text text DEFAULT NULL
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_deadline timestamptz;
  v_max_capacity integer;
  v_activity_type public.activity_type;
  v_points_value integer;
  v_total_points integer;
  v_joining_count integer;
  v_clean_excuse text := NULLIF(btrim(p_excuse_text), '');
  v_result public.activity_enrollments;
BEGIN
  IF v_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles AS profile
       WHERE profile.id = v_user_id
         AND profile.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.student_applications AS application
       WHERE application.student_user_id = v_user_id
         AND application.status = 'accepted'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted active students may update activity enrollment';
  END IF;

  SELECT
    activity.deadline,
    activity.max_capacity,
    activity.type,
    activity.points_value
  INTO
    v_deadline,
    v_max_capacity,
    v_activity_type,
    v_points_value
  FROM public.activities AS activity
  WHERE activity.id = p_activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Activity not found';
  END IF;

  IF v_deadline <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Activity enrollment is closed';
  END IF;

  IF p_decision = 'DECLINING'::public.activity_decision
     AND v_activity_type = 'MANDATORY'::public.activity_type
     AND v_clean_excuse IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Mandatory activities require an excuse when declining';
  END IF;

  IF p_decision = 'JOINING'::public.activity_decision THEN
    IF v_max_capacity IS NOT NULL THEN
      SELECT count(*)::integer
      INTO v_joining_count
      FROM public.activity_enrollments AS enrollment
      WHERE enrollment.activity_id = p_activity_id
        AND enrollment.student_id <> v_user_id
        AND enrollment.decision = 'JOINING'::public.activity_decision;

      IF v_joining_count >= v_max_capacity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Activity capacity is full';
      END IF;
    END IF;

    IF v_activity_type = 'PAID'::public.activity_type THEN
      SELECT profile.total_points
      INTO v_total_points
      FROM public.profiles AS profile
      WHERE profile.id = v_user_id;

      IF COALESCE(v_total_points, 0) < v_points_value THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Student points are insufficient for this activity';
      END IF;
    END IF;

    v_clean_excuse := NULL;
  END IF;

  INSERT INTO public.activity_enrollments (
    activity_id,
    student_id,
    decision,
    excuse_text
  )
  VALUES (
    p_activity_id,
    v_user_id,
    p_decision,
    v_clean_excuse
  )
  ON CONFLICT (activity_id, student_id) DO UPDATE
  SET decision = EXCLUDED.decision,
      excuse_text = EXCLUDED.excuse_text
  RETURNING * INTO v_result;

  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.list_student_task_board()
RETURNS TABLE (
  task_id uuid,
  title text,
  description text,
  points_reward integer,
  required_students integer,
  deadline timestamptz,
  status public.task_status,
  enrollment_count integer,
  is_enrolled boolean,
  completion_status public.task_completion_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.student_applications AS application
      ON application.student_user_id = profile.id
     AND application.status = 'accepted'
    WHERE profile.id = v_user_id
      AND profile.status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted active students may load the task board';
  END IF;

  RETURN QUERY
  SELECT
    task.id AS task_id,
    task.title,
    task.description,
    task.points_reward,
    task.required_students,
    task.deadline,
    task.status,
    counts.enrollment_count,
    (own_enrollment.student_id IS NOT NULL) AS is_enrolled,
    own_enrollment.completion_status
  FROM public.tasks AS task
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS enrollment_count
    FROM public.task_enrollments AS enrollment
    WHERE enrollment.task_id = task.id
  ) AS counts
  LEFT JOIN public.task_enrollments AS own_enrollment
    ON own_enrollment.task_id = task.id
   AND own_enrollment.student_id = v_user_id
  ORDER BY task.deadline ASC, task.created_at DESC;
END
$function$;

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
  v_existing_activity_id uuid;
  v_joining_count integer;
  v_result public.activities;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_user_id
      AND assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to manage activities';
  END IF;

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
    public_event_id,
    title,
    description,
    created_by,
    type,
    points_value,
    max_capacity,
    deadline
  )
  VALUES (
    v_public_event_id,
    v_title,
    v_description,
    v_user_id,
    p_type,
    p_points_value,
    p_max_capacity,
    p_deadline
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

-- Publishing or approving the CMS event card and its registration settings is
-- one database transaction. This also covers media-head requests at the moment
-- the president approves and publishes them.
CREATE OR REPLACE FUNCTION public.sync_published_event_activities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event jsonb;
  v_public_event_id text;
  v_title text;
  v_description text;
  v_type public.activity_type;
  v_points_value integer;
  v_max_capacity integer;
  v_deadline timestamptz;
  v_deadline_text text;
BEGIN
  IF NEW.id <> 'main' OR jsonb_typeof(NEW.content -> 'events') <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR v_event IN
    SELECT event_row.value
    FROM jsonb_array_elements(NEW.content -> 'events') AS event_row(value)
    WHERE jsonb_typeof(event_row.value) = 'object'
  LOOP
    v_public_event_id := NULLIF(btrim(v_event ->> 'id'), '');
    v_title := NULLIF(btrim(v_event ->> 'title'), '');
    IF v_public_event_id IS NULL OR v_title IS NULL THEN
      CONTINUE;
    END IF;

    v_description := COALESCE(NULLIF(btrim(v_event ->> 'description'), ''), 'فعالية اتحاد شباب الأمة');
    v_type := CASE upper(COALESCE(v_event ->> 'activityType', 'OPTIONAL'))
      WHEN 'MANDATORY' THEN 'MANDATORY'::public.activity_type
      WHEN 'PAID' THEN 'PAID'::public.activity_type
      ELSE 'OPTIONAL'::public.activity_type
    END;
    v_points_value := CASE
      WHEN COALESCE(v_event ->> 'pointsValue', '') ~ '^[0-9]{1,6}$'
        THEN (v_event ->> 'pointsValue')::integer
      ELSE 0
    END;
    v_max_capacity := CASE
      WHEN COALESCE(v_event ->> 'capacity', '') ~ '^[1-9][0-9]{0,8}$'
        THEN (v_event ->> 'capacity')::integer
      ELSE 1
    END;
    v_deadline_text := COALESCE(
      NULLIF(btrim(v_event ->> 'registrationDeadline'), ''),
      NULLIF(btrim(v_event ->> 'date'), '')
    );
    BEGIN
      v_deadline := v_deadline_text::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_deadline := now();
    END;

    IF v_type = 'PAID'::public.activity_type AND v_points_value <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Paid published events require a positive points value';
    END IF;

    PERFORM public.upsert_event_activity(
      v_public_event_id,
      left(v_title, 200),
      left(v_description, 8000),
      v_type,
      v_points_value,
      v_max_capacity,
      v_deadline
    );
  END LOOP;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS sync_published_event_activities_trigger
  ON public.published_site_content;
CREATE TRIGGER sync_published_event_activities_trigger
AFTER INSERT OR UPDATE OF content ON public.published_site_content
FOR EACH ROW
WHEN (NEW.id = 'main')
EXECUTE FUNCTION public.sync_published_event_activities();

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
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_user_id
      AND assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
  ) THEN
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
    title,
    description,
    points_reward,
    created_by,
    required_students,
    deadline,
    status
  )
  VALUES (
    v_title,
    v_description,
    p_points_reward,
    v_user_id,
    p_required_students,
    p_deadline,
    'OPEN'::public.task_status
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.list_student_activity_board()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.list_student_task_board()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.upsert_event_activity(
  text, text, text, public.activity_type, integer, integer, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_internal_task(
  text, text, integer, integer, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_own_activity_enrollment(
  uuid, public.activity_decision, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_published_event_activities()
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_student_activity_board() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_student_task_board() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_event_activity(
  text, text, text, public.activity_type, integer, integer, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_internal_task(
  text, text, integer, integer, timestamptz
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_own_activity_enrollment(
  uuid, public.activity_decision, text
) TO authenticated;

COMMIT;
