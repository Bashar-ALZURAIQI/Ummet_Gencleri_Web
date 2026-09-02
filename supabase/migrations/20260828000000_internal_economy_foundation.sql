BEGIN;

CREATE TYPE public.activity_type AS ENUM ('MANDATORY', 'OPTIONAL', 'PAID');
CREATE TYPE public.activity_decision AS ENUM ('JOINING', 'DECLINING', 'IGNORED');
CREATE TYPE public.excuse_review_status AS ENUM ('PENDING', 'ACCEPTED', 'PARTIAL', 'REJECTED');
CREATE TYPE public.attendance_status AS ENUM ('ON_TIME', 'LATE', 'VERY_LATE', 'ABSENT');
CREATE TYPE public.task_status AS ENUM ('OPEN', 'FULL', 'CLOSED');
CREATE TYPE public.task_completion_status AS ENUM ('PENDING', 'PERFECT', 'PARTIAL', 'FAILED');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_tier text NOT NULL DEFAULT 'BRONZE';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_current_tier_format_check CHECK (
    current_tier = upper(btrim(current_tier))
    AND char_length(current_tier) BETWEEN 1 AND 40
  );

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  type public.activity_type NOT NULL,
  points_value integer NOT NULL DEFAULT 0,
  max_capacity integer,
  deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activities_title_check CHECK (
    title = btrim(title) AND char_length(title) BETWEEN 1 AND 200
  ),
  CONSTRAINT activities_description_check CHECK (
    description = btrim(description) AND char_length(description) BETWEEN 1 AND 8000
  ),
  CONSTRAINT activities_max_capacity_check CHECK (
    max_capacity IS NULL OR max_capacity > 0
  )
);

CREATE TABLE public.activity_enrollments (
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision public.activity_decision NOT NULL DEFAULT 'IGNORED',
  excuse_text text,
  excuse_status public.excuse_review_status,
  attendance_status public.attendance_status,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, student_id),
  CONSTRAINT activity_enrollments_excuse_length_check CHECK (
    excuse_text IS NULL OR char_length(excuse_text) BETWEEN 1 AND 4000
  )
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  points_reward integer NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  required_students integer NOT NULL,
  deadline timestamptz NOT NULL,
  status public.task_status NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_title_check CHECK (
    title = btrim(title) AND char_length(title) BETWEEN 1 AND 200
  ),
  CONSTRAINT tasks_description_check CHECK (
    description = btrim(description) AND char_length(description) BETWEEN 1 AND 8000
  ),
  CONSTRAINT tasks_points_reward_check CHECK (points_reward > 0),
  CONSTRAINT tasks_required_students_check CHECK (required_students > 0)
);

CREATE TABLE public.task_enrollments (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completion_status public.task_completion_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, student_id)
);

CREATE TABLE public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount integer NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT points_ledger_amount_nonzero_check CHECK (amount <> 0),
  CONSTRAINT points_ledger_reason_check CHECK (
    reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 1000
  )
);

CREATE INDEX activities_deadline_idx ON public.activities (deadline);
CREATE INDEX activities_type_deadline_idx ON public.activities (type, deadline);
CREATE INDEX activities_created_by_idx ON public.activities (created_by);
CREATE INDEX activity_enrollments_student_idx
  ON public.activity_enrollments (student_id, created_at DESC);
CREATE INDEX activity_enrollments_attendance_idx
  ON public.activity_enrollments (attendance_status)
  WHERE attendance_status IS NOT NULL;
CREATE INDEX tasks_status_deadline_idx ON public.tasks (status, deadline);
CREATE INDEX tasks_created_by_idx ON public.tasks (created_by);
CREATE INDEX task_enrollments_student_idx
  ON public.task_enrollments (student_id, created_at DESC);
CREATE INDEX points_ledger_student_created_idx
  ON public.points_ledger (student_id, created_at DESC);
CREATE INDEX points_ledger_created_by_idx ON public.points_ledger (created_by);

CREATE OR REPLACE VIEW private.current_internal_economy_authorization
WITH (security_barrier = true)
AS
SELECT
  request_user.user_id,
  assignment.position_key,
  COALESCE(
    assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD'),
    false
  ) AS can_manage,
  EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = request_user.user_id
      AND profile.status = 'active'
  )
  AND EXISTS (
    SELECT 1
    FROM public.student_applications AS application
    WHERE application.student_user_id = request_user.user_id
      AND application.status = 'accepted'
  ) AS is_accepted_student
FROM (SELECT auth.uid() AS user_id) AS request_user
LEFT JOIN public.executive_assignments AS assignment
  ON assignment.user_id = request_user.user_id
WHERE request_user.user_id IS NOT NULL;

REVOKE ALL ON TABLE private.current_internal_economy_authorization
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.current_internal_economy_authorization TO authenticated;

CREATE OR REPLACE FUNCTION private.set_internal_economy_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.set_internal_economy_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER activities_set_updated_at
BEFORE UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION private.set_internal_economy_updated_at();

CREATE TRIGGER activity_enrollments_set_updated_at
BEFORE UPDATE ON public.activity_enrollments
FOR EACH ROW EXECUTE FUNCTION private.set_internal_economy_updated_at();

CREATE TRIGGER tasks_set_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION private.set_internal_economy_updated_at();

CREATE TRIGGER task_enrollments_set_updated_at
BEFORE UPDATE ON public.task_enrollments
FOR EACH ROW EXECUTE FUNCTION private.set_internal_economy_updated_at();

CREATE OR REPLACE FUNCTION private.normalize_activity_excuse()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.excuse_text := NULLIF(btrim(NEW.excuse_text), '');

  IF NEW.excuse_text IS NULL THEN
    NEW.excuse_status := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.excuse_text IS DISTINCT FROM OLD.excuse_text THEN
    NEW.excuse_status := 'PENDING'::public.excuse_review_status;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.normalize_activity_excuse()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER activity_enrollments_normalize_excuse
BEFORE INSERT OR UPDATE OF excuse_text ON public.activity_enrollments
FOR EACH ROW EXECUTE FUNCTION private.normalize_activity_excuse();

CREATE OR REPLACE FUNCTION private.apply_points_ledger_to_profile_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.profiles
  SET total_points = total_points + NEW.amount
  WHERE id = NEW.student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Points ledger student profile does not exist';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.apply_points_ledger_to_profile_total()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER points_ledger_apply_to_profile_total
AFTER INSERT ON public.points_ledger
FOR EACH ROW EXECUTE FUNCTION private.apply_points_ledger_to_profile_total();

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_accepted_or_admin_select"
ON public.activities FOR SELECT TO authenticated
USING (COALESCE((
  SELECT authz.is_accepted_student OR authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false));

CREATE POLICY "activities_admin_insert"
ON public.activities FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
);

CREATE POLICY "activities_admin_update"
ON public.activities FOR UPDATE TO authenticated
USING (COALESCE((
  SELECT authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false))
WITH CHECK (COALESCE((
  SELECT authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false));

CREATE POLICY "activity_enrollments_own_or_admin_select"
ON public.activity_enrollments FOR SELECT TO authenticated
USING (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
  OR (
    student_id = (SELECT auth.uid())
    AND COALESCE((
      SELECT authz.is_accepted_student
      FROM private.current_internal_economy_authorization AS authz
    ), false)
  )
);

CREATE POLICY "activity_enrollments_own_or_admin_insert"
ON public.activity_enrollments FOR INSERT TO authenticated
WITH CHECK (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
  OR (
    student_id = (SELECT auth.uid())
    AND COALESCE((
      SELECT authz.is_accepted_student
      FROM private.current_internal_economy_authorization AS authz
    ), false)
  )
);

CREATE POLICY "activity_enrollments_own_or_admin_update"
ON public.activity_enrollments FOR UPDATE TO authenticated
USING (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
  OR (
    student_id = (SELECT auth.uid())
    AND COALESCE((
      SELECT authz.is_accepted_student
      FROM private.current_internal_economy_authorization AS authz
    ), false)
  )
)
WITH CHECK (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
  OR (
    student_id = (SELECT auth.uid())
    AND COALESCE((
      SELECT authz.is_accepted_student
      FROM private.current_internal_economy_authorization AS authz
    ), false)
  )
);

CREATE POLICY "tasks_accepted_or_admin_select"
ON public.tasks FOR SELECT TO authenticated
USING (COALESCE((
  SELECT authz.is_accepted_student OR authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false));

CREATE POLICY "tasks_admin_insert"
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
);

CREATE POLICY "tasks_admin_update"
ON public.tasks FOR UPDATE TO authenticated
USING (COALESCE((
  SELECT authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false))
WITH CHECK (COALESCE((
  SELECT authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false));

CREATE POLICY "task_enrollments_own_or_admin_select"
ON public.task_enrollments FOR SELECT TO authenticated
USING (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
  OR (
    student_id = (SELECT auth.uid())
    AND COALESCE((
      SELECT authz.is_accepted_student
      FROM private.current_internal_economy_authorization AS authz
    ), false)
  )
);

CREATE POLICY "task_enrollments_own_or_admin_insert"
ON public.task_enrollments FOR INSERT TO authenticated
WITH CHECK (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
  OR (
    student_id = (SELECT auth.uid())
    AND COALESCE((
      SELECT authz.is_accepted_student
      FROM private.current_internal_economy_authorization AS authz
    ), false)
  )
);

CREATE POLICY "task_enrollments_admin_update"
ON public.task_enrollments FOR UPDATE TO authenticated
USING (COALESCE((
  SELECT authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false))
WITH CHECK (COALESCE((
  SELECT authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false));

CREATE POLICY "points_ledger_own_or_admin_select"
ON public.points_ledger FOR SELECT TO authenticated
USING (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
  OR (
    student_id = (SELECT auth.uid())
    AND COALESCE((
      SELECT authz.is_accepted_student
      FROM private.current_internal_economy_authorization AS authz
    ), false)
  )
);

CREATE POLICY "points_ledger_admin_insert"
ON public.points_ledger FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
);

CREATE POLICY "profiles_internal_economy_admin_select"
ON public.profiles FOR SELECT TO authenticated
USING (COALESCE((
  SELECT authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false));

CREATE POLICY "profiles_internal_economy_admin_update"
ON public.profiles FOR UPDATE TO authenticated
USING (COALESCE((
  SELECT authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false))
WITH CHECK (COALESCE((
  SELECT authz.can_manage
  FROM private.current_internal_economy_authorization AS authz
), false));

CREATE OR REPLACE FUNCTION public.review_activity_enrollment(
  p_activity_id uuid,
  p_student_id uuid,
  p_excuse_status public.excuse_review_status,
  p_attendance_status public.attendance_status
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result public.activity_enrollments;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = (SELECT auth.uid())
      AND assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to review activity enrollment';
  END IF;

  UPDATE public.activity_enrollments
  SET excuse_status = p_excuse_status,
      attendance_status = p_attendance_status
  WHERE activity_id = p_activity_id
    AND student_id = p_student_id
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Activity enrollment not found';
  END IF;

  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.review_task_enrollment(
  p_task_id uuid,
  p_student_id uuid,
  p_completion_status public.task_completion_status
)
RETURNS public.task_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result public.task_enrollments;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = (SELECT auth.uid())
      AND assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to review task enrollment';
  END IF;

  UPDATE public.task_enrollments
  SET completion_status = p_completion_status
  WHERE task_id = p_task_id
    AND student_id = p_student_id
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Task enrollment not found';
  END IF;

  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.set_member_tier(
  p_student_id uuid,
  p_current_tier text
)
RETURNS TABLE (student_id uuid, total_points integer, current_tier text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = (SELECT auth.uid())
      AND assignment.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to update member tier';
  END IF;

  RETURN QUERY
  UPDATE public.profiles AS profile
  SET current_tier = upper(btrim(p_current_tier))
  WHERE profile.id = p_student_id
  RETURNING profile.id, profile.total_points, profile.current_tier;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Student profile not found';
  END IF;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.review_activity_enrollment(
  uuid, uuid, public.excuse_review_status, public.attendance_status
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.review_task_enrollment(
  uuid, uuid, public.task_completion_status
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_member_tier(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.review_activity_enrollment(
  uuid, uuid, public.excuse_review_status, public.attendance_status
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_task_enrollment(
  uuid, uuid, public.task_completion_status
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_member_tier(uuid, text) TO authenticated;

REVOKE ALL ON TABLE public.activities FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.activity_enrollments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.tasks FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.task_enrollments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.points_ledger FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.activities TO authenticated;
GRANT INSERT (title, description, created_by, type, points_value, max_capacity, deadline)
  ON TABLE public.activities TO authenticated;
GRANT UPDATE (title, description, type, points_value, max_capacity, deadline)
  ON TABLE public.activities TO authenticated;

GRANT SELECT ON TABLE public.activity_enrollments TO authenticated;
GRANT INSERT (activity_id, student_id, decision, excuse_text)
  ON TABLE public.activity_enrollments TO authenticated;
GRANT UPDATE (decision, excuse_text)
  ON TABLE public.activity_enrollments TO authenticated;

GRANT SELECT ON TABLE public.tasks TO authenticated;
GRANT INSERT (title, description, points_reward, created_by, required_students, deadline, status)
  ON TABLE public.tasks TO authenticated;
GRANT UPDATE (title, description, points_reward, required_students, deadline, status)
  ON TABLE public.tasks TO authenticated;

GRANT SELECT ON TABLE public.task_enrollments TO authenticated;
GRANT INSERT (task_id, student_id)
  ON TABLE public.task_enrollments TO authenticated;

GRANT SELECT ON TABLE public.points_ledger TO authenticated;
GRANT INSERT (student_id, amount, reason, created_by)
  ON TABLE public.points_ledger TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activity_enrollments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_enrollments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.points_ledger TO service_role;

GRANT SELECT (total_points, current_tier) ON TABLE public.profiles TO authenticated;

COMMIT;
