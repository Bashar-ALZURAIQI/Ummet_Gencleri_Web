BEGIN;

CREATE TABLE IF NOT EXISTS public.guide_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guide_suggestions_student_name_length
    CHECK (char_length(btrim(student_name)) BETWEEN 1 AND 120),
  CONSTRAINT guide_suggestions_subject_length
    CHECK (char_length(btrim(subject)) BETWEEN 1 AND 200),
  CONSTRAINT guide_suggestions_description_length
    CHECK (char_length(btrim(description)) BETWEEN 1 AND 4000),
  CONSTRAINT guide_suggestions_student_name_trimmed
    CHECK (student_name = btrim(student_name)),
  CONSTRAINT guide_suggestions_subject_trimmed
    CHECK (subject = btrim(subject)),
  CONSTRAINT guide_suggestions_description_trimmed
    CHECK (description = btrim(description)),
  CONSTRAINT guide_suggestions_status_allowed
    CHECK (status IN ('PENDING', 'REVIEWING', 'IMPLEMENTED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS guide_suggestions_status_created_idx
  ON public.guide_suggestions (status, created_at DESC);

ALTER TABLE public.guide_suggestions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW private.current_guide_suggestion_authorization
WITH (security_barrier = true)
AS
SELECT ea.position_key
FROM public.executive_assignments AS ea
WHERE ea.user_id = (SELECT auth.uid())
  AND ea.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD');

REVOKE ALL ON TABLE private.current_guide_suggestion_authorization
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.current_guide_suggestion_authorization TO authenticated;

DROP POLICY IF EXISTS "guide_suggestions_public_insert" ON public.guide_suggestions;
CREATE POLICY "guide_suggestions_public_insert"
ON public.guide_suggestions FOR INSERT TO anon, authenticated
WITH CHECK (status = 'PENDING');

DROP POLICY IF EXISTS "guide_suggestions_admin_select" ON public.guide_suggestions;
CREATE POLICY "guide_suggestions_admin_select"
ON public.guide_suggestions FOR SELECT TO authenticated
USING ((
  SELECT EXISTS (
    SELECT 1
    FROM private.current_guide_suggestion_authorization AS authz
    WHERE authz.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD')
  )
));

DROP POLICY IF EXISTS "guide_suggestions_admin_update" ON public.guide_suggestions;
CREATE POLICY "guide_suggestions_admin_update"
ON public.guide_suggestions FOR UPDATE TO authenticated
USING ((
  SELECT EXISTS (
    SELECT 1
    FROM private.current_guide_suggestion_authorization AS authz
    WHERE authz.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD')
  )
))
WITH CHECK ((
  SELECT EXISTS (
    SELECT 1
    FROM private.current_guide_suggestion_authorization AS authz
    WHERE authz.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD')
  )
));

DROP POLICY IF EXISTS "guide_suggestions_admin_delete" ON public.guide_suggestions;
CREATE POLICY "guide_suggestions_admin_delete"
ON public.guide_suggestions FOR DELETE TO authenticated
USING ((
  SELECT EXISTS (
    SELECT 1
    FROM private.current_guide_suggestion_authorization AS authz
    WHERE authz.position_key IN ('PRESIDENT', 'ACADEMIC_HEAD')
  )
));

REVOKE ALL ON TABLE public.guide_suggestions FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT (student_name, subject, description)
  ON TABLE public.guide_suggestions TO anon, authenticated;
GRANT SELECT ON TABLE public.guide_suggestions TO authenticated;
GRANT UPDATE (status) ON TABLE public.guide_suggestions TO authenticated;
GRANT DELETE ON TABLE public.guide_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guide_suggestions TO service_role;

COMMIT;
