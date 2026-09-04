-- 20260904140000_create_student_suggestions.sql
-- Relational persistence and authoritative RBAC for general student suggestions and responses

-- 1. Create student_suggestions table
CREATE TABLE IF NOT EXISTS public.student_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_role text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_suggestions_target_role_check CHECK (
    target_role IN (
      'PRESIDENT',
      'VICE_PRESIDENT',
      'MEDIA_HEAD',
      'FINANCE_HEAD',
      'AUDIT_HEAD',
      'ACADEMIC_HEAD',
      'ACTIVITIES_HEAD'
    )
  ),
  CONSTRAINT student_suggestions_status_check CHECK (
    status IN ('new', 'reviewing', 'implemented', 'closed')
  ),
  CONSTRAINT student_suggestions_title_length CHECK (
    char_length(btrim(title)) >= 3 AND char_length(title) <= 200
  ),
  CONSTRAINT student_suggestions_content_length CHECK (
    char_length(btrim(content)) >= 5 AND char_length(content) <= 5000
  ),
  CONSTRAINT student_suggestions_category_length CHECK (
    char_length(btrim(category)) >= 1 AND char_length(category) <= 100
  )
);

CREATE INDEX IF NOT EXISTS student_suggestions_target_created_idx
  ON public.student_suggestions (target_role, created_at DESC);

CREATE INDEX IF NOT EXISTS student_suggestions_student_idx
  ON public.student_suggestions (student_user_id, created_at DESC);

-- 2. Create suggestion_responses table
CREATE TABLE IF NOT EXISTS public.suggestion_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.student_suggestions(id) ON DELETE CASCADE,
  responder_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  response_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suggestion_responses_text_length CHECK (
    char_length(btrim(response_text)) >= 1 AND char_length(response_text) <= 5000
  )
);

CREATE INDEX IF NOT EXISTS suggestion_responses_suggestion_idx
  ON public.suggestion_responses (suggestion_id, created_at ASC);

CREATE INDEX IF NOT EXISTS suggestion_responses_responder_idx
  ON public.suggestion_responses (responder_user_id, created_at DESC);

-- 3. Enable Row-Level Security (RLS)
ALTER TABLE public.student_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestion_responses ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: Revoke direct writes from API roles
REVOKE ALL ON TABLE public.student_suggestions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.student_suggestions TO authenticated;
GRANT ALL ON TABLE public.student_suggestions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.student_suggestions FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.suggestion_responses FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.suggestion_responses TO authenticated;
GRANT ALL ON TABLE public.suggestion_responses TO service_role;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.suggestion_responses FROM PUBLIC, anon, authenticated;

-- 4. RLS Select Policies
DROP POLICY IF EXISTS "student_suggestions_select" ON public.student_suggestions;
CREATE POLICY "student_suggestions_select"
ON public.student_suggestions
FOR SELECT
TO authenticated
USING (
  student_user_id = (SELECT auth.uid())
  OR COALESCE((
    SELECT authz.is_president
    FROM private.current_user_authorization AS authz
  ), false)
  OR EXISTS (
    SELECT 1
    FROM public.executive_assignments AS ea
    WHERE ea.user_id = (SELECT auth.uid())
      AND ea.position_key = target_role
  )
);

DROP POLICY IF EXISTS "suggestion_responses_select" ON public.suggestion_responses;
CREATE POLICY "suggestion_responses_select"
ON public.suggestion_responses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.student_suggestions AS s
    WHERE s.id = suggestion_id
      AND (
        s.student_user_id = (SELECT auth.uid())
        OR COALESCE((
          SELECT authz.is_president
          FROM private.current_user_authorization AS authz
        ), false)
        OR EXISTS (
          SELECT 1
          FROM public.executive_assignments AS ea
          WHERE ea.user_id = (SELECT auth.uid())
            AND ea.position_key = s.target_role
        )
      )
  )
);

-- 5. RPC: submit_student_suggestion
CREATE OR REPLACE FUNCTION public.submit_student_suggestion(
  p_target_role text,
  p_category text,
  p_title text,
  p_content text
)
RETURNS TABLE (
  ok boolean,
  suggestion_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_is_eligible boolean := false;
  v_new_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  p_target_role := btrim(COALESCE(p_target_role, ''));
  p_category := btrim(COALESCE(p_category, ''));
  p_title := btrim(COALESCE(p_title, ''));
  p_content := btrim(COALESCE(p_content, ''));

  IF p_target_role NOT IN (
    'PRESIDENT',
    'VICE_PRESIDENT',
    'MEDIA_HEAD',
    'FINANCE_HEAD',
    'AUDIT_HEAD',
    'ACADEMIC_HEAD',
    'ACTIVITIES_HEAD'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid target executive role';
  END IF;

  IF char_length(p_title) < 3 OR char_length(p_title) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Title must be between 3 and 200 characters';
  END IF;

  IF char_length(p_content) < 5 OR char_length(p_content) > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Content must be between 5 and 5000 characters';
  END IF;

  IF char_length(p_category) < 1 OR char_length(p_category) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Category must be specified';
  END IF;

  -- Validate active accepted membership
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = v_user_id
      AND p.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.student_applications AS sa
        WHERE sa.student_user_id = p.id
          AND sa.status = 'accepted'
      )
  ) INTO v_is_eligible;

  IF NOT v_is_eligible THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active accepted student membership is required to submit suggestions';
  END IF;

  -- Validate account not suspended in Auth
  IF EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = v_user_id
      AND u.banned_until IS NOT NULL
      AND u.banned_until > now()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Account is currently suspended';
  END IF;

  INSERT INTO public.student_suggestions (
    student_user_id,
    target_role,
    category,
    title,
    content,
    status
  ) VALUES (
    v_user_id,
    p_target_role,
    p_category,
    p_title,
    p_content,
    'new'
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT true, v_new_id, 'تم إرسال الاقتراح بنجاح'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_student_suggestion FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_student_suggestion TO authenticated;

-- 6. RPC: respond_to_student_suggestion
CREATE OR REPLACE FUNCTION public.respond_to_student_suggestion(
  p_suggestion_id uuid,
  p_response_text text,
  p_new_status text
)
RETURNS TABLE (
  ok boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_suggestion public.student_suggestions%ROWTYPE;
  v_is_authorized boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  p_response_text := btrim(COALESCE(p_response_text, ''));
  p_new_status := btrim(COALESCE(p_new_status, ''));

  IF char_length(p_response_text) < 1 OR char_length(p_response_text) > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Response text must not be empty';
  END IF;

  IF p_new_status NOT IN ('new', 'reviewing', 'implemented', 'closed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid suggestion status';
  END IF;

  SELECT * INTO v_suggestion
  FROM public.student_suggestions
  WHERE id = p_suggestion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Suggestion not found';
  END IF;

  -- Verify actor is either the current PRESIDENT or holds the matching target_role
  IF (SELECT private.is_current_president()) THEN
    v_is_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.executive_assignments AS ea
      WHERE ea.user_id = v_actor_id
        AND ea.position_key = v_suggestion.target_role
    ) INTO v_is_authorized;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the assigned executive role or President can respond to this suggestion';
  END IF;

  -- Atomic: insert response row and update suggestion status
  INSERT INTO public.suggestion_responses (
    suggestion_id,
    responder_user_id,
    response_text
  ) VALUES (
    p_suggestion_id,
    v_actor_id,
    p_response_text
  );

  UPDATE public.student_suggestions
  SET status = p_new_status,
      updated_at = now()
  WHERE id = p_suggestion_id;

  RETURN QUERY SELECT true, 'تم إضافة الرد وتحديث الحالة بنجاح'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.respond_to_student_suggestion FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_student_suggestion TO authenticated;

-- 7. RPC: list_visible_student_suggestions
CREATE OR REPLACE FUNCTION public.list_visible_student_suggestions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_is_president boolean := false;
  v_exec_role text := NULL;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Check executive assignment
  v_is_president := (SELECT private.is_current_president());
  IF NOT v_is_president THEN
    SELECT position_key INTO v_exec_role
    FROM public.executive_assignments
    WHERE user_id = v_user_id;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'student_user_id', s.student_user_id,
        'student_name', COALESCE(p.name, 'طالب'),
        'student_email', p.contact_email,
        'student_university', p.university,
        'student_major', p.major,
        'target_role', s.target_role,
        'category', s.category,
        'title', s.title,
        'content', s.content,
        'status', s.status,
        'created_at', s.created_at,
        'responses', COALESCE(resp_agg.items, '[]'::jsonb)
      ) ORDER BY s.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_result
  FROM public.student_suggestions AS s
  LEFT JOIN public.profiles AS p ON p.id = s.student_user_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'by', COALESCE(rp.name, 'الإدارة'),
        'by_role', COALESCE(rea.position_key, 'إدارة الاتحاد'),
        'text', r.response_text,
        'created_at', r.created_at
      ) ORDER BY r.created_at ASC
    ) AS items
    FROM public.suggestion_responses AS r
    LEFT JOIN public.profiles AS rp ON rp.id = r.responder_user_id
    LEFT JOIN public.executive_assignments AS rea ON rea.user_id = r.responder_user_id
    WHERE r.suggestion_id = s.id
  ) AS resp_agg ON true
  WHERE (
    v_is_president
    OR (v_exec_role IS NOT NULL AND s.target_role = v_exec_role)
    OR (s.student_user_id = v_user_id)
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_visible_student_suggestions FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_visible_student_suggestions TO authenticated;
