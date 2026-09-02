-- Separate immutable Auth identity from mutable profile data and executive office.
-- This migration is intentionally local-only until it is reviewed and applied through
-- the project's normal Supabase migration workflow.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- profiles.email remains a read-only compatibility copy of the Auth login email.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_path text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.set_profiles_updated_at() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_profiles_updated_at();

UPDATE public.profiles
SET contact_email = email
WHERE contact_email IS NULL;

ALTER TABLE public.student_applications
  ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.student_applications
  ADD COLUMN IF NOT EXISTS student_user_id uuid;

-- Preserve legacy text ids for display compatibility, but authorize applications
-- only through an immutable UUID that resolves to a real Auth account.
UPDATE public.student_applications AS application
SET student_user_id = auth_user.id
FROM auth.users AS auth_user
WHERE application.student_user_id IS NULL
  AND application.student_id = auth_user.id::text;

DO $application_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.student_applications'::regclass
      AND conname = 'student_applications_student_user_id_fkey'
  ) THEN
    ALTER TABLE public.student_applications
      ADD CONSTRAINT student_applications_student_user_id_fkey
      FOREIGN KEY (student_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END
$application_constraints$;

-- Applications must only be created by the auth.users trigger below. The
-- former anonymous browser INSERT path could report an application even when
-- Supabase returned a disguised response for an already-registered email.
DROP POLICY IF EXISTS "anon_insert_applications" ON public.student_applications;
REVOKE INSERT ON TABLE public.student_applications FROM anon, authenticated;

-- Hosted projects commonly require email confirmation, so signUp can return no
-- client session. Provision the profile in the Auth transaction instead of
-- granting browser INSERT access or exposing a service-role credential.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    contact_email,
    university,
    major,
    year,
    phone,
    status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Member'
    ),
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'contact_email'), ''),
      NEW.email
    ),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'university'), ''), 'غير محدد'),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'major'), ''), 'غير محدد'),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'year'), ''), 'السنة الأولى'),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
    'inactive'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.student_applications (
    id,
    student_id,
    student_user_id,
    name,
    email,
    university,
    major,
    year,
    phone,
    motivation,
    applied_at,
    status
  )
  VALUES (
    'signup_' || NEW.id::text,
    NEW.id::text,
    NEW.id,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Member'
    ),
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'university'), ''), 'غير محدد'),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'major'), ''), 'غير محدد'),
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data ->> 'year'), ''), 'السنة الأولى'),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), ''),
    COALESCE(NEW.raw_user_meta_data ->> 'motivation', ''),
    CURRENT_DATE,
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user_profile()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS auth_user_profile_created ON auth.users;
CREATE TRIGGER auth_user_profile_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_profile();

CREATE INDEX IF NOT EXISTS profiles_email_normalized_idx
  ON public.profiles (lower(btrim(email)));

CREATE TABLE IF NOT EXISTS public.executive_assignments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_key text NOT NULL,
  committee_key text NOT NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT executive_assignments_user_id_key UNIQUE (user_id),
  CONSTRAINT executive_assignments_position_key_key UNIQUE (position_key),
  CONSTRAINT executive_assignments_position_key_check CHECK (
    position_key IN (
      'PRESIDENT',
      'VICE_PRESIDENT',
      'MEDIA_HEAD',
      'FINANCE_HEAD',
      'AUDIT_HEAD',
      'ACADEMIC_HEAD',
      'ACTIVITIES_HEAD'
    )
  ),
  CONSTRAINT executive_assignments_committee_key_check CHECK (
    committee_key IN (
      'presidency',
      'vice-presidency',
      'media',
      'finance',
      'supervisory',
      'academic',
      'activities'
    )
  ),
  CONSTRAINT executive_assignments_position_committee_check CHECK (
    (position_key = 'PRESIDENT' AND committee_key = 'presidency') OR
    (position_key = 'VICE_PRESIDENT' AND committee_key = 'vice-presidency') OR
    (position_key = 'MEDIA_HEAD' AND committee_key = 'media') OR
    (position_key = 'FINANCE_HEAD' AND committee_key = 'finance') OR
    (position_key = 'AUDIT_HEAD' AND committee_key = 'supervisory') OR
    (position_key = 'ACADEMIC_HEAD' AND committee_key = 'academic') OR
    (position_key = 'ACTIVITIES_HEAD' AND committee_key = 'activities')
  )
);

CREATE INDEX IF NOT EXISTS executive_assignments_assigned_by_idx
  ON public.executive_assignments (assigned_by);

CREATE TABLE IF NOT EXISTS public.edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_role text NOT NULL,
  committee_key text,
  edit_type text NOT NULL,
  original_text text,
  proposed_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  decision_note text,
  reviewed_by uuid CONSTRAINT edit_requests_reviewed_by_fkey
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT edit_requests_status_check CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT edit_requests_review_state_check CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
    (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS edit_requests_submitted_by_idx
  ON public.edit_requests (submitted_by);
CREATE INDEX IF NOT EXISTS edit_requests_reviewed_by_idx
  ON public.edit_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS edit_requests_status_submitted_at_idx
  ON public.edit_requests (status, submitted_at DESC);

-- CREATE TABLE IF NOT EXISTS does not repair a partially-created table. Add any
-- missing constraints by catalog lookup without using unsupported
-- ADD CONSTRAINT IF NOT EXISTS syntax.
DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.executive_assignments'::regclass
      AND conname = 'executive_assignments_user_id_key'
  ) THEN
    ALTER TABLE public.executive_assignments
      ADD CONSTRAINT executive_assignments_user_id_key UNIQUE (user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.executive_assignments'::regclass
      AND conname = 'executive_assignments_position_key_key'
  ) THEN
    ALTER TABLE public.executive_assignments
      ADD CONSTRAINT executive_assignments_position_key_key UNIQUE (position_key);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.executive_assignments'::regclass
      AND conname = 'executive_assignments_position_key_check'
  ) THEN
    ALTER TABLE public.executive_assignments
      ADD CONSTRAINT executive_assignments_position_key_check CHECK (
        position_key IN (
          'PRESIDENT', 'VICE_PRESIDENT', 'MEDIA_HEAD', 'FINANCE_HEAD',
          'AUDIT_HEAD', 'ACADEMIC_HEAD', 'ACTIVITIES_HEAD'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.executive_assignments'::regclass
      AND conname = 'executive_assignments_committee_key_check'
  ) THEN
    ALTER TABLE public.executive_assignments
      ADD CONSTRAINT executive_assignments_committee_key_check CHECK (
        committee_key IN (
          'presidency', 'vice-presidency', 'media', 'finance',
          'supervisory', 'academic', 'activities'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.executive_assignments'::regclass
      AND conname = 'executive_assignments_position_committee_check'
  ) THEN
    ALTER TABLE public.executive_assignments
      ADD CONSTRAINT executive_assignments_position_committee_check CHECK (
        (position_key = 'PRESIDENT' AND committee_key = 'presidency') OR
        (position_key = 'VICE_PRESIDENT' AND committee_key = 'vice-presidency') OR
        (position_key = 'MEDIA_HEAD' AND committee_key = 'media') OR
        (position_key = 'FINANCE_HEAD' AND committee_key = 'finance') OR
        (position_key = 'AUDIT_HEAD' AND committee_key = 'supervisory') OR
        (position_key = 'ACADEMIC_HEAD' AND committee_key = 'academic') OR
        (position_key = 'ACTIVITIES_HEAD' AND committee_key = 'activities')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.edit_requests'::regclass
      AND conname = 'edit_requests_status_check'
  ) THEN
    ALTER TABLE public.edit_requests
      ADD CONSTRAINT edit_requests_status_check CHECK (
        status IN ('pending', 'approved', 'rejected')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.edit_requests'::regclass
      AND conname = 'edit_requests_review_state_check'
  ) THEN
    ALTER TABLE public.edit_requests
      ADD CONSTRAINT edit_requests_review_state_check CHECK (
        (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
        (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.edit_requests'::regclass
      AND conname = 'edit_requests_reviewed_by_fkey'
      AND confdeltype <> 'r'
  ) THEN
    ALTER TABLE public.edit_requests
      DROP CONSTRAINT edit_requests_reviewed_by_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.edit_requests'::regclass
      AND conname = 'edit_requests_reviewed_by_fkey'
  ) THEN
    ALTER TABLE public.edit_requests
      ADD CONSTRAINT edit_requests_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
  END IF;
END
$constraints$;

-- DELETE changes cannot be filtered by Realtime. Use the existing unique,
-- non-null UUID index as the smallest replica identity instead of exposing a
-- FULL deleted assignment row.
ALTER TABLE public.executive_assignments
  REPLICA IDENTITY USING INDEX executive_assignments_user_id_key;

CREATE OR REPLACE FUNCTION private.is_current_president()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.executive_assignments AS ea
      WHERE ea.user_id = (SELECT auth.uid())
        AND ea.position_key = 'PRESIDENT'
    );
$function$;

CREATE OR REPLACE FUNCTION private.is_current_executive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.executive_assignments AS ea
      WHERE ea.user_id = (SELECT auth.uid())
    );
$function$;

REVOKE EXECUTE ON FUNCTION private.is_current_president() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.is_current_executive() FROM PUBLIC, anon, authenticated, service_role;

-- Policies run with caller privileges, so they cannot invoke the revoked helpers.
-- This owner-run private view exposes only authorization booleans for the caller.
CREATE OR REPLACE VIEW private.current_user_authorization
WITH (security_barrier = true)
AS
SELECT
  EXISTS (
    SELECT 1
    FROM public.executive_assignments AS ea
    WHERE ea.user_id = (SELECT auth.uid())
      AND ea.position_key = 'PRESIDENT'
  ) AS is_president,
  EXISTS (
    SELECT 1
    FROM public.executive_assignments AS ea
    WHERE ea.user_id = (SELECT auth.uid())
  ) AS is_executive
WHERE (SELECT auth.uid()) IS NOT NULL;

REVOKE ALL ON TABLE private.current_user_authorization FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT ON TABLE private.current_user_authorization TO authenticated;

-- Public Realtime subscribers must not subscribe to profiles or assignments.
-- This singleton carries only a monotonically increasing signal; clients reload
-- the already-sanitized public view after each signal.
CREATE TABLE IF NOT EXISTS public.public_executive_directory_events (
  id text PRIMARY KEY DEFAULT 'directory' CHECK (id = 'directory'),
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.public_executive_directory_events (id, version, updated_at)
VALUES ('directory', 0, now())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.public_executive_directory_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_executive_directory_events_select"
  ON public.public_executive_directory_events;
CREATE POLICY "public_executive_directory_events_select"
ON public.public_executive_directory_events
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE ALL ON TABLE public.public_executive_directory_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.public_executive_directory_events TO anon, authenticated;
GRANT SELECT ON TABLE public.public_executive_directory_events TO service_role;

CREATE OR REPLACE FUNCTION private.bump_public_executive_directory_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.public_executive_directory_events
  SET version = version + 1,
      updated_at = now()
  WHERE id = 'directory';
  RETURN NULL;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.bump_public_executive_directory_event()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS profiles_signal_public_executive_directory ON public.profiles;
CREATE TRIGGER profiles_signal_public_executive_directory
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH STATEMENT
EXECUTE FUNCTION private.bump_public_executive_directory_event();

DROP TRIGGER IF EXISTS assignments_signal_public_executive_directory
  ON public.executive_assignments;
CREATE TRIGGER assignments_signal_public_executive_directory
AFTER INSERT OR UPDATE OR DELETE ON public.executive_assignments
FOR EACH STATEMENT
EXECUTE FUNCTION private.bump_public_executive_directory_event();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_requests ENABLE ROW LEVEL SECURITY;

-- Replace legacy profile CRUD policies with read-own/read-directory and
-- column-granted update-own access. Signup/profile provisioning stays server-side.
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "delete_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_president" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "executive_assignments_select_own" ON public.executive_assignments;
DROP POLICY IF EXISTS "executive_assignments_select_president" ON public.executive_assignments;

CREATE POLICY "executive_assignments_select_own"
ON public.executive_assignments
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "executive_assignments_select_president"
ON public.executive_assignments
FOR SELECT
TO authenticated
USING (COALESCE((
  SELECT authz.is_president
  FROM private.current_user_authorization AS authz
), false));

DROP POLICY IF EXISTS "edit_requests_select_own" ON public.edit_requests;
DROP POLICY IF EXISTS "edit_requests_select_president" ON public.edit_requests;

CREATE POLICY "edit_requests_select_own"
ON public.edit_requests
FOR SELECT
TO authenticated
USING (
  submitted_by = (SELECT auth.uid())
  AND COALESCE((
    SELECT authz.is_executive
    FROM private.current_user_authorization AS authz
  ), false)
);

CREATE POLICY "edit_requests_select_president"
ON public.edit_requests
FOR SELECT
TO authenticated
USING (COALESCE((
  SELECT authz.is_president
  FROM private.current_user_authorization AS authz
), false));

-- Application rows are never writable through the browser Data API. A student
-- sees only the row bound to their Auth UUID; the current president sees all.
ALTER TABLE public.student_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_applications" ON public.student_applications;
DROP POLICY IF EXISTS "anon_insert_applications" ON public.student_applications;
DROP POLICY IF EXISTS "anon_update_applications" ON public.student_applications;
DROP POLICY IF EXISTS "anon_delete_applications" ON public.student_applications;
DROP POLICY IF EXISTS "student_applications_select_own" ON public.student_applications;
DROP POLICY IF EXISTS "student_applications_select_president" ON public.student_applications;

CREATE POLICY "student_applications_select_own"
ON public.student_applications
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = student_user_id);

CREATE POLICY "student_applications_select_president"
ON public.student_applications
FOR SELECT
TO authenticated
USING (COALESCE((
  SELECT authz.is_president
  FROM private.current_user_authorization AS authz
), false));

REVOKE ALL ON TABLE public.student_applications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.student_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_applications TO service_role;

-- Keep the public views invoker-run so they cannot inherit the view owner's
-- privileges. Hardened helpers live outside the exposed schema and return only
-- the fixed public projections needed by anonymous visitors.
CREATE OR REPLACE FUNCTION private.list_public_member_profiles()
RETURNS TABLE (
  user_id uuid,
  name text,
  university text,
  major text,
  year text,
  bio text,
  avatar_path text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
SELECT
  p.id AS user_id,
  p.name,
  p.university,
  p.major,
  p.year,
  p.bio,
  p.avatar_path,
  p.updated_at
FROM public.profiles AS p
WHERE p.status = 'active'
$function$;

CREATE OR REPLACE FUNCTION private.list_public_executive_directory()
RETURNS TABLE (
  user_id uuid,
  position_key text,
  committee_key text,
  name text,
  contact_email text,
  university text,
  major text,
  year text,
  bio text,
  avatar_path text,
  profile_updated_at timestamptz,
  assignment_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
SELECT
  ea.user_id,
  ea.position_key,
  ea.committee_key,
  p.name,
  p.contact_email AS contact_email,
  p.university,
  p.major,
  p.year,
  p.bio,
  p.avatar_path,
  p.updated_at AS profile_updated_at,
  ea.updated_at AS assignment_updated_at
FROM public.executive_assignments AS ea
JOIN public.profiles AS p ON p.id = ea.user_id
WHERE p.status = 'active'
$function$;

REVOKE EXECUTE ON FUNCTION private.list_public_member_profiles()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.list_public_executive_directory()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.list_public_member_profiles()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.list_public_executive_directory()
  TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.public_member_profiles
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  member.user_id,
  member.name,
  member.university,
  member.major,
  member.year,
  member.bio,
  member.avatar_path,
  member.updated_at
FROM private.list_public_member_profiles() AS member;

CREATE OR REPLACE VIEW public.public_executive_directory
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  executive.user_id,
  executive.position_key,
  executive.committee_key,
  executive.name,
  executive.contact_email,
  executive.university,
  executive.major,
  executive.year,
  executive.bio,
  executive.avatar_path,
  executive.profile_updated_at,
  executive.assignment_updated_at
FROM private.list_public_executive_directory() AS executive;

REVOKE ALL ON TABLE public.public_member_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_executive_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_member_profiles TO anon, authenticated;
GRANT SELECT ON TABLE public.public_executive_directory TO anon, authenticated;
GRANT SELECT ON TABLE public.public_member_profiles TO service_role;
GRANT SELECT ON TABLE public.public_executive_directory TO service_role;

-- Login email is private account data. Only the current president receives it,
-- through this narrowly-scoped RPC; it is never added to either public view.
CREATE OR REPLACE FUNCTION public.list_president_assignable_members()
RETURNS TABLE (
  user_id uuid,
  login_email text,
  name text,
  university text,
  major text,
  year text,
  bio text,
  avatar_path text,
  profile_updated_at timestamptz,
  position_key text,
  committee_key text,
  assignment_updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only the current president may list account login emails';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.name,
    p.university,
    p.major,
    p.year,
    p.bio,
    p.avatar_path,
    p.updated_at,
    ea.position_key,
    ea.committee_key,
    ea.updated_at
  FROM auth.users AS u
  JOIN public.profiles AS p ON p.id = u.id
  LEFT JOIN public.executive_assignments AS ea ON ea.user_id = u.id
  WHERE u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
    AND p.status = 'active'
  ORDER BY p.name, u.id;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.list_president_assignable_members() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_president_assignable_members() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_edit_request(
  p_edit_type text,
  p_original_text text,
  p_proposed_text text
)
RETURNS public.edit_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_assignment public.executive_assignments%ROWTYPE;
  v_request public.edit_requests%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  SELECT ea.*
  INTO v_assignment
  FROM public.executive_assignments AS ea
  WHERE ea.user_id = v_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a current executive may submit an edit request';
  END IF;

  IF NULLIF(btrim(p_edit_type), '') IS NULL
     OR NULLIF(btrim(p_proposed_text), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Edit type and proposed text are required';
  END IF;

  INSERT INTO public.edit_requests (
    submitted_by,
    submitted_role,
    committee_key,
    edit_type,
    original_text,
    proposed_text,
    status,
    decision_note,
    reviewed_by,
    reviewed_at
  )
  VALUES (
    v_actor_id,
    v_assignment.position_key,
    v_assignment.committee_key,
    btrim(p_edit_type),
    p_original_text,
    p_proposed_text,
    'pending',
    NULL,
    NULL,
    NULL
  )
  RETURNING * INTO v_request;

  RETURN v_request;
END
$function$;

CREATE OR REPLACE FUNCTION public.schedule_student_application_interview(
  p_application_id text,
  p_interview_date date,
  p_interview_time text,
  p_interview_meeting_url text
)
RETURNS public.student_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application public.student_applications%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  IF NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may schedule interviews';
  END IF;

  IF NULLIF(btrim(p_application_id), '') IS NULL
     OR p_interview_date IS NULL
     OR p_interview_date < CURRENT_DATE
     OR NULLIF(btrim(p_interview_time), '') IS NULL
     OR NULLIF(btrim(p_interview_meeting_url), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid future interview schedule is required';
  END IF;

  UPDATE public.student_applications
  SET status = 'interview',
      interview_date = p_interview_date,
      interview_time = btrim(p_interview_time),
      interview_meeting_url = btrim(p_interview_meeting_url),
      decided_at = NULL,
      rejection_reason = NULL
  WHERE id = p_application_id
    AND status IN ('pending', 'interview')
    AND student_user_id IS NOT NULL
  RETURNING * INTO v_application;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending application not found';
  END IF;

  RETURN v_application;
END
$function$;

CREATE OR REPLACE FUNCTION public.decide_student_application(
  p_application_id text,
  p_decision text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS public.student_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_application public.student_applications%ROWTYPE;
  v_profile_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  IF NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may decide applications';
  END IF;

  IF p_decision NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Decision must be accepted or rejected';
  END IF;

  IF p_decision = 'rejected' AND NULLIF(btrim(p_rejection_reason), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A rejection reason is required';
  END IF;

  UPDATE public.student_applications
  SET status = p_decision,
      decided_at = CURRENT_DATE,
      rejection_reason = CASE
        WHEN p_decision = 'rejected' THEN btrim(p_rejection_reason)
        ELSE NULL
      END
  WHERE id = p_application_id
    AND status IN ('pending', 'interview')
    AND student_user_id IS NOT NULL
  RETURNING * INTO v_application;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending application not found';
  END IF;

  IF p_decision = 'accepted' THEN
    IF v_application.student_user_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Application is not linked to an Auth UUID';
    END IF;

    UPDATE public.profiles
    SET status = 'active'
    WHERE id = v_application.student_user_id;

    GET DIAGNOSTICS v_profile_count = ROW_COUNT;
    IF v_profile_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Application profile was not found';
    END IF;
  END IF;

  RETURN v_application;
END
$function$;

CREATE OR REPLACE FUNCTION public.decide_edit_request(
  p_request_id uuid,
  p_decision text,
  p_decision_note text DEFAULT NULL
)
RETURNS public.edit_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_request public.edit_requests%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  IF NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may decide edit requests';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Decision must be approved or rejected';
  END IF;

  UPDATE public.edit_requests
  SET status = p_decision,
      decision_note = p_decision_note,
      reviewed_by = v_actor_id,
      reviewed_at = now()
  WHERE id = p_request_id
    AND status = 'pending'
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending edit request not found';
  END IF;

  RETURN v_request;
END
$function$;

CREATE OR REPLACE FUNCTION public.transfer_executive_assignment(
  "position" text,
  target_user_id uuid
)
RETURNS TABLE (
  transferred_position text,
  previous_user_id uuid,
  new_user_id uuid,
  target_previous_position text,
  assigned_by uuid,
  assigned_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_committee_key text;
  v_previous_user_id uuid;
  v_target_previous_position text;
  v_target_is_active boolean;
  v_assigned_at timestamptz := now();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  -- Fast rejection before waiting. Authorization is checked again under the
  -- transaction-level lock, which serializes the rare assignment transfers.
  IF NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may transfer an executive assignment';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('executive_assignments.transfer', 0));

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The current president changed before the transfer was locked';
  END IF;

  IF target_user_id = v_actor_id AND "position" <> 'PRESIDENT' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'The current president cannot vacate the last presidency by targeting themself';
  END IF;

  v_committee_key := CASE "position"
    WHEN 'PRESIDENT' THEN 'presidency'
    WHEN 'VICE_PRESIDENT' THEN 'vice-presidency'
    WHEN 'MEDIA_HEAD' THEN 'media'
    WHEN 'FINANCE_HEAD' THEN 'finance'
    WHEN 'AUDIT_HEAD' THEN 'supervisory'
    WHEN 'ACADEMIC_HEAD' THEN 'academic'
    WHEN 'ACTIVITIES_HEAD' THEN 'activities'
    ELSE NULL
  END;

  IF v_committee_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown executive position';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS u
    JOIN public.profiles AS p ON p.id = u.id
    WHERE u.id = target_user_id
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND p.status = 'active'
  )
  INTO v_target_is_active;

  IF NOT v_target_is_active THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Target must be an existing active Auth account';
  END IF;

  SELECT ea.user_id
  INTO v_previous_user_id
  FROM public.executive_assignments AS ea
  WHERE ea.position_key = "position"
  FOR UPDATE;

  SELECT ea.position_key
  INTO v_target_previous_position
  FROM public.executive_assignments AS ea
  WHERE ea.user_id = target_user_id
  FOR UPDATE;

  -- A target holding another office vacates it. Deleting by target first also
  -- handles a no-op transfer back to the current holder without uniqueness races.
  DELETE FROM public.executive_assignments
  WHERE user_id = target_user_id;

  DELETE FROM public.executive_assignments
  WHERE position_key = "position";

  INSERT INTO public.executive_assignments (
    user_id,
    position_key,
    committee_key,
    assigned_by,
    assigned_at,
    updated_at
  )
  VALUES (
    target_user_id,
    "position",
    v_committee_key,
    v_actor_id,
    v_assigned_at,
    v_assigned_at
  );

  transferred_position := "position";
  previous_user_id := v_previous_user_id;
  new_user_id := target_user_id;
  target_previous_position := v_target_previous_position;
  assigned_by := v_actor_id;
  assigned_at := v_assigned_at;
  RETURN NEXT;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_edit_request(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.decide_edit_request(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.transfer_executive_assignment(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.schedule_student_application_interview(text, date, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.decide_student_application(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_edit_request(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_edit_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_executive_assignment(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_student_application_interview(text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_student_application(text, text, text) TO authenticated;

-- Explicit Data API privileges. RLS remains the row-level authorization layer.
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.executive_assignments FROM anon, authenticated;
REVOKE ALL ON TABLE public.edit_requests FROM anon, authenticated;

GRANT SELECT (
  id,
  name,
  contact_email,
  university,
  major,
  year,
  phone,
  status,
  joined_at,
  created_at,
  bio,
  avatar_path,
  updated_at
) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (name, contact_email, university, major, year, phone, bio, avatar_path)
  ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.executive_assignments TO authenticated;
GRANT SELECT ON TABLE public.edit_requests TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.executive_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.edit_requests TO service_role;

-- Normalize only public legacy tables. Current Supabase projects restrict custom
-- DDL in auth, so auth.users is joined but never altered or populated here.
CREATE INDEX IF NOT EXISTS board_members_email_normalized_idx
  ON public.board_members (lower(btrim(email)));

-- Build every recognized legacy-to-Auth candidate before inserting anything.
-- Windowed counts make ambiguous email, user, and position matches visible and
-- exclude them from automatic migration rather than choosing a scan-order winner.
CREATE OR REPLACE VIEW private.legacy_board_assignment_candidates
WITH (security_barrier = true)
AS
WITH mapped_board AS (
  SELECT
    b.id AS board_member_id,
    b.email AS legacy_email,
    lower(btrim(b.email)) AS normalized_email,
    CASE
      WHEN b.role = 'president' THEN 'PRESIDENT'
      WHEN b.committee = 'vice-presidency' THEN 'VICE_PRESIDENT'
      WHEN b.committee = 'media' THEN 'MEDIA_HEAD'
      WHEN b.committee = 'finance' THEN 'FINANCE_HEAD'
      WHEN b.committee = 'supervisory' THEN 'AUDIT_HEAD'
      WHEN b.committee = 'academic' THEN 'ACADEMIC_HEAD'
      WHEN b.committee = 'activities' THEN 'ACTIVITIES_HEAD'
    END AS position_key,
    CASE
      WHEN b.role = 'president' THEN 'presidency'
      ELSE b.committee
    END AS committee_key
  FROM public.board_members AS b
  WHERE
    b.role = 'president'
    OR b.committee IN (
      'vice-presidency', 'media', 'finance', 'supervisory', 'academic', 'activities'
    )
), joined_candidates AS (
  SELECT
    mapped.*,
    u.id AS user_id
  FROM mapped_board AS mapped
  LEFT JOIN auth.users AS u
    ON lower(btrim(u.email)) = lower(btrim(mapped.legacy_email))
)
SELECT
  candidate.board_member_id,
  candidate.legacy_email,
  candidate.normalized_email,
  candidate.user_id,
  candidate.position_key,
  candidate.committee_key,
  COUNT(candidate.user_id) FILTER (WHERE candidate.user_id IS NOT NULL)
    OVER (PARTITION BY candidate.board_member_id) AS auth_match_count,
  COUNT(candidate.user_id) FILTER (WHERE candidate.user_id IS NOT NULL)
    OVER (PARTITION BY candidate.user_id) AS user_candidate_count,
  COUNT(candidate.user_id) FILTER (WHERE candidate.user_id IS NOT NULL)
    OVER (PARTITION BY candidate.position_key) AS position_candidate_count,
  COUNT(candidate.user_id) FILTER (WHERE candidate.user_id IS NOT NULL)
    OVER (PARTITION BY candidate.normalized_email) AS normalized_candidate_count,
  position_assignment.user_id AS existing_position_user_id,
  user_assignment.position_key AS existing_user_position_key,
  (
    position_assignment.user_id IS NOT NULL
    AND position_assignment.user_id IS DISTINCT FROM candidate.user_id
  ) AS position_assignment_conflict,
  (
    user_assignment.position_key IS NOT NULL
    AND user_assignment.position_key IS DISTINCT FROM candidate.position_key
  ) AS user_assignment_conflict,
  (
    position_assignment.user_id = candidate.user_id
    AND user_assignment.position_key = candidate.position_key
  ) AS is_exact_existing_assignment
FROM joined_candidates AS candidate
LEFT JOIN public.executive_assignments AS position_assignment
  ON position_assignment.position_key = candidate.position_key
LEFT JOIN public.executive_assignments AS user_assignment
  ON user_assignment.user_id = candidate.user_id;

CREATE OR REPLACE VIEW private.legacy_board_member_migration_review
WITH (security_barrier = true)
AS
SELECT
  candidate.board_member_id,
  candidate.legacy_email,
  candidate.normalized_email,
  candidate.user_id,
  candidate.position_key,
  candidate.committee_key,
  candidate.auth_match_count,
  candidate.user_candidate_count,
  candidate.position_candidate_count,
  candidate.normalized_candidate_count,
  CASE
    WHEN candidate.auth_match_count = 0 THEN 'no_auth_match'
    WHEN candidate.auth_match_count > 1 THEN 'ambiguous_auth_email'
    WHEN candidate.normalized_candidate_count > 1 THEN 'ambiguous_normalized_email'
    WHEN candidate.user_candidate_count > 1 THEN 'ambiguous_user'
    WHEN candidate.position_candidate_count > 1 THEN 'ambiguous_position'
    WHEN candidate.position_assignment_conflict
         AND candidate.user_assignment_conflict THEN 'position_and_user_conflict'
    WHEN candidate.position_assignment_conflict THEN 'position_occupied_by_different_user'
    WHEN candidate.user_assignment_conflict THEN 'user_assigned_to_different_position'
    ELSE 'manual_review'
  END AS review_reason,
  candidate.existing_position_user_id,
  candidate.existing_user_position_key,
  candidate.position_assignment_conflict,
  candidate.user_assignment_conflict,
  candidate.is_exact_existing_assignment
FROM private.legacy_board_assignment_candidates AS candidate
WHERE
  candidate.auth_match_count <> 1
  OR candidate.user_candidate_count <> 1
  OR candidate.position_candidate_count <> 1
  OR candidate.normalized_candidate_count <> 1
  OR candidate.position_assignment_conflict
  OR candidate.user_assignment_conflict;

REVOKE ALL ON TABLE private.legacy_board_assignment_candidates FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.legacy_board_member_migration_review FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.executive_assignments (
  user_id,
  position_key,
  committee_key,
  assigned_by,
  assigned_at,
  updated_at
)
SELECT
  candidate.user_id,
  candidate.position_key,
  candidate.committee_key,
  NULL,
  now(),
  now()
FROM private.legacy_board_assignment_candidates AS candidate
WHERE candidate.auth_match_count = 1
  AND candidate.user_candidate_count = 1
  AND candidate.position_candidate_count = 1
  AND candidate.normalized_candidate_count = 1
  AND NOT candidate.position_assignment_conflict
  AND NOT candidate.user_assignment_conflict
ON CONFLICT DO NOTHING;

-- Candidate/review views preserve a manual audit path after public access closes.
-- Remove its former public login-email lookup path after the safe UUID migration.
DROP POLICY IF EXISTS "public_read_board_members" ON public.board_members;
REVOKE ALL ON TABLE public.board_members FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.board_members TO service_role;

-- Public bucket metadata enforces MIME and size. RLS restricts mutation to the
-- caller's first path segment; public read is intentional for profile cards.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;

CREATE POLICY "avatars_public_read"
ON storage.objects
FOR SELECT
TO PUBLIC
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_owner_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND owner_id = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "avatars_owner_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND owner_id = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND owner_id = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "avatars_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND owner_id = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Realtime publication changes are catalog-checked because ALTER PUBLICATION has
-- no ADD TABLE IF NOT EXISTS form.
DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'profiles'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'executive_assignments'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.executive_assignments;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'edit_requests'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.edit_requests;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'public_executive_directory_events'
     ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.public_executive_directory_events;
  END IF;
END
$realtime$;
