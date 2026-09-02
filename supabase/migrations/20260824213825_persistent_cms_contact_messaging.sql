-- Durable CMS approvals, independent guide/FAQ content, and private contact messaging.

ALTER TABLE public.edit_requests
  ADD COLUMN IF NOT EXISTS site_target text,
  ADD COLUMN IF NOT EXISTS site_payload jsonb,
  ADD COLUMN IF NOT EXISTS site_base_version bigint,
  ADD COLUMN IF NOT EXISTS site_payload_version integer;

CREATE INDEX IF NOT EXISTS edit_requests_pending_site_idx
  ON public.edit_requests (submitted_at DESC)
  WHERE status = 'pending' AND edit_type = 'site';

CREATE TABLE IF NOT EXISTS public.student_guide (
  id text PRIMARY KEY CHECK (id = 'main'),
  quick_info text NOT NULL CHECK (char_length(btrim(quick_info)) BETWEEN 1 AND 5000),
  sections jsonb NOT NULL CHECK (jsonb_typeof(sections) = 'array'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.faq (
  id text PRIMARY KEY CHECK (id = 'main'),
  categories jsonb NOT NULL CHECK (jsonb_typeof(categories) = 'array'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $seed_content$
DECLARE
  v_content jsonb;
BEGIN
  SELECT content
  INTO v_content
  FROM public.published_site_content
  WHERE id = 'main';

  IF v_content IS NULL
     OR jsonb_typeof(v_content -> 'guideSections') <> 'array'
     OR NULLIF(btrim(v_content ->> 'guideQuickInfo'), '') IS NULL
     OR jsonb_typeof(v_content -> 'faqCategories') <> 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Published guide and FAQ content is required before this migration';
  END IF;

  INSERT INTO public.student_guide (id, quick_info, sections, version, updated_by, updated_at)
  VALUES (
    'main',
    v_content ->> 'guideQuickInfo',
    v_content -> 'guideSections',
    1,
    NULL,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.faq (id, categories, version, updated_by, updated_at)
  VALUES ('main', v_content -> 'faqCategories', 1, NULL, now())
  ON CONFLICT (id) DO NOTHING;
END
$seed_content$;

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text NOT NULL,
  sender_email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'UNREAD'
    CHECK (status IN ('UNREAD', 'READ', 'REPLIED')),
  read_at timestamptz,
  read_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_messages_name_length
    CHECK (char_length(btrim(sender_name)) BETWEEN 2 AND 120),
  CONSTRAINT contact_messages_email_length
    CHECK (char_length(btrim(sender_email)) BETWEEN 5 AND 320),
  CONSTRAINT contact_messages_subject_length
    CHECK (char_length(btrim(subject)) BETWEEN 2 AND 200),
  CONSTRAINT contact_messages_body_length
    CHECK (char_length(btrim(message)) BETWEEN 5 AND 5000),
  CONSTRAINT contact_messages_read_state CHECK (
    (status = 'UNREAD' AND read_at IS NULL AND read_by IS NULL)
    OR (status IN ('READ', 'REPLIED'))
  )
);

CREATE TABLE IF NOT EXISTS public.contact_message_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE
    REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  reply_text text NOT NULL CHECK (char_length(btrim(reply_text)) BETWEEN 2 AND 5000),
  replied_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  replied_by_name text NOT NULL CHECK (char_length(btrim(replied_by_name)) BETWEEN 2 AND 120),
  replied_by_role text NOT NULL CHECK (replied_by_role IN ('PRESIDENT', 'VICE_PRESIDENT')),
  delivery_channel text NOT NULL CHECK (delivery_channel IN ('IN_APP', 'EMAIL')),
  delivery_status text NOT NULL
    CHECK (delivery_status IN ('NOT_REQUIRED', 'PENDING', 'SENT', 'FAILED')),
  delivery_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  delivery_last_error text,
  email_provider_id text,
  replied_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT contact_reply_delivery_pair CHECK (
    (delivery_channel = 'IN_APP' AND delivery_status = 'NOT_REQUIRED')
    OR (delivery_channel = 'EMAIL' AND delivery_status IN ('PENDING', 'SENT', 'FAILED'))
  )
);

CREATE INDEX IF NOT EXISTS contact_messages_sender_created_idx
  ON public.contact_messages (sender_user_id, created_at DESC)
  WHERE sender_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_messages_status_created_idx
  ON public.contact_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_replies_delivery_pending_idx
  ON public.contact_message_replies (replied_at)
  WHERE delivery_status IN ('PENDING', 'FAILED');

ALTER TABLE public.student_guide ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_message_replies ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW private.current_contact_authorization
WITH (security_barrier = true)
AS
SELECT ea.position_key
FROM public.executive_assignments AS ea
WHERE ea.user_id = (SELECT auth.uid())
  AND ea.position_key IN ('PRESIDENT', 'VICE_PRESIDENT');

REVOKE ALL ON TABLE private.current_contact_authorization
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.current_contact_authorization TO authenticated;

DROP POLICY IF EXISTS "student_guide_public_read" ON public.student_guide;
CREATE POLICY "student_guide_public_read"
ON public.student_guide FOR SELECT TO anon, authenticated
USING (id = 'main');

DROP POLICY IF EXISTS "faq_public_read" ON public.faq;
CREATE POLICY "faq_public_read"
ON public.faq FOR SELECT TO anon, authenticated
USING (id = 'main');

DROP POLICY IF EXISTS "contact_messages_select_own" ON public.contact_messages;
CREATE POLICY "contact_messages_select_own"
ON public.contact_messages FOR SELECT TO authenticated
USING (sender_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "contact_messages_select_contact_admin" ON public.contact_messages;
CREATE POLICY "contact_messages_select_contact_admin"
ON public.contact_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM private.current_contact_authorization AS authz
    WHERE authz.position_key IN ('PRESIDENT', 'VICE_PRESIDENT')
  )
);

DROP POLICY IF EXISTS "contact_replies_select_own" ON public.contact_message_replies;
CREATE POLICY "contact_replies_select_own"
ON public.contact_message_replies FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.contact_messages AS message_row
    WHERE message_row.id = message_id
      AND message_row.sender_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "contact_replies_select_contact_admin" ON public.contact_message_replies;
CREATE POLICY "contact_replies_select_contact_admin"
ON public.contact_message_replies FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM private.current_contact_authorization AS authz
    WHERE authz.position_key IN ('PRESIDENT', 'VICE_PRESIDENT')
  )
);

REVOKE ALL ON TABLE public.student_guide FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.faq FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.contact_messages FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.contact_message_replies FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.student_guide TO anon, authenticated;
GRANT SELECT ON TABLE public.faq TO anon, authenticated;
GRANT SELECT ON TABLE public.contact_messages TO authenticated;
GRANT SELECT ON TABLE public.contact_message_replies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_guide TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.faq TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contact_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contact_message_replies TO service_role;

CREATE OR REPLACE FUNCTION private.publish_cms_target_locked(
  p_actor_id uuid,
  p_target text,
  p_payload jsonb,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_site public.published_site_content;
  v_guide public.student_guide;
  v_faq public.faq;
  v_content_key text;
BEGIN
  IF p_actor_id IS NULL OR p_expected_version < 1 OR p_payload IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid CMS publication input is required';
  END IF;

  IF p_target IN ('guideSections', 'guideQuickInfo') THEN
    SELECT * INTO v_guide
    FROM public.student_guide
    WHERE id = 'main'
    FOR UPDATE;
    IF NOT FOUND OR v_guide.version <> p_expected_version THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
    END IF;
    IF p_target = 'guideSections' AND jsonb_typeof(p_payload) <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Guide sections must be an array';
    END IF;
    IF p_target = 'guideQuickInfo'
       AND (jsonb_typeof(p_payload) <> 'string' OR NULLIF(btrim(p_payload #>> '{}'), '') IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Guide quick info must be a non-empty string';
    END IF;
    UPDATE public.student_guide
    SET sections = CASE WHEN p_target = 'guideSections' THEN p_payload ELSE sections END,
        quick_info = CASE WHEN p_target = 'guideQuickInfo' THEN p_payload #>> '{}' ELSE quick_info END,
        version = v_guide.version + 1,
        updated_by = p_actor_id,
        updated_at = now()
    WHERE id = 'main'
    RETURNING * INTO v_guide;
    RETURN jsonb_build_object(
      'target', p_target,
      'payload', CASE WHEN p_target = 'guideSections' THEN v_guide.sections ELSE to_jsonb(v_guide.quick_info) END,
      'version', v_guide.version,
      'updated_at', v_guide.updated_at
    );
  END IF;

  IF p_target = 'faqCategories' THEN
    IF jsonb_typeof(p_payload) <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FAQ categories must be an array';
    END IF;
    SELECT * INTO v_faq
    FROM public.faq
    WHERE id = 'main'
    FOR UPDATE;
    IF NOT FOUND OR v_faq.version <> p_expected_version THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
    END IF;
    UPDATE public.faq
    SET categories = p_payload,
        version = v_faq.version + 1,
        updated_by = p_actor_id,
        updated_at = now()
    WHERE id = 'main'
    RETURNING * INTO v_faq;
    RETURN jsonb_build_object(
      'target', p_target,
      'payload', v_faq.categories,
      'version', v_faq.version,
      'updated_at', v_faq.updated_at
    );
  END IF;

  IF p_target NOT IN (
    'site', 'about', 'programsContent', 'events', 'galleryAlbums',
    'galleryCategories', 'contactCards', 'contactMap', 'news', 'plans',
    'reports', 'committees'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown CMS target';
  END IF;

  v_content_key := CASE p_target
    WHEN 'site' THEN 'siteContent'
    WHEN 'about' THEN 'aboutContent'
    ELSE p_target
  END;

  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;
  IF NOT FOUND OR v_site.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
  END IF;

  UPDATE public.published_site_content
  SET content = jsonb_set(v_site.content, ARRAY[v_content_key], p_payload, true),
      version = v_site.version + 1,
      updated_by = p_actor_id,
      updated_at = now()
  WHERE id = 'main'
  RETURNING * INTO v_site;

  RETURN jsonb_build_object(
    'target', p_target,
    'payload', v_site.content -> v_content_key,
    'version', v_site.version,
    'updated_at', v_site.updated_at
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION private.publish_cms_target_locked(uuid, text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.publish_cms_target(
  p_target text,
  p_payload jsonb,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may publish CMS content';
  END IF;
  v_result := private.publish_cms_target_locked(v_actor_id, p_target, p_payload, p_expected_version);
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Publishing authority changed';
  END IF;
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_site_edit_request(
  p_original_text text,
  p_proposed_text text,
  p_target text,
  p_payload jsonb,
  p_base_version bigint,
  p_payload_version integer DEFAULT 1
)
RETURNS public.edit_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_assignment public.executive_assignments%ROWTYPE;
  v_current_version bigint;
  v_request public.edit_requests;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  SELECT * INTO v_assignment
  FROM public.executive_assignments
  WHERE user_id = v_actor_id AND position_key = 'MEDIA_HEAD';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current media head may submit site edits';
  END IF;
  IF p_target NOT IN (
    'site', 'about', 'programsContent', 'events', 'galleryAlbums',
    'galleryCategories', 'guideSections', 'guideQuickInfo', 'faqCategories',
    'contactCards', 'contactMap', 'news', 'plans', 'reports', 'committees'
  ) OR p_payload IS NULL OR p_base_version < 1 OR p_payload_version <> 1
     OR octet_length(p_payload::text) > 1048576
     OR NULLIF(btrim(p_proposed_text), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid structured site edit content is required';
  END IF;

  IF p_target IN ('guideSections', 'guideQuickInfo') THEN
    SELECT version INTO v_current_version FROM public.student_guide WHERE id = 'main';
  ELSIF p_target = 'faqCategories' THEN
    SELECT version INTO v_current_version FROM public.faq WHERE id = 'main';
  ELSE
    SELECT version INTO v_current_version FROM public.published_site_content WHERE id = 'main';
  END IF;
  IF v_current_version IS DISTINCT FROM p_base_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
  END IF;

  INSERT INTO public.edit_requests (
    submitted_by, submitted_role, committee_key, edit_type, original_text,
    proposed_text, status, site_target, site_payload, site_base_version,
    site_payload_version
  ) VALUES (
    v_actor_id, v_assignment.position_key, v_assignment.committee_key, 'site',
    p_original_text, p_proposed_text, 'pending', p_target, p_payload,
    p_base_version, p_payload_version
  )
  RETURNING * INTO v_request;
  RETURN v_request;
END
$function$;

CREATE OR REPLACE FUNCTION public.approve_site_edit_request(
  p_request_id uuid,
  p_approved_payload jsonb DEFAULT NULL,
  p_decision_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_request public.edit_requests;
  v_publish jsonb;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may approve site edits';
  END IF;
  SELECT * INTO v_request
  FROM public.edit_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' OR v_request.edit_type <> 'site'
     OR v_request.site_target IS NULL OR v_request.site_payload IS NULL
     OR v_request.site_base_version IS NULL OR v_request.site_payload_version <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending structured site edit not found';
  END IF;

  v_publish := private.publish_cms_target_locked(
    v_actor_id,
    v_request.site_target,
    COALESCE(p_approved_payload, v_request.site_payload),
    v_request.site_base_version
  );

  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Approval authority changed';
  END IF;

  UPDATE public.edit_requests
  SET status = 'approved',
      decision_note = p_decision_note,
      reviewed_by = v_actor_id,
      reviewed_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN jsonb_build_object('request', to_jsonb(v_request), 'publication', v_publish);
EXCEPTION
  WHEN serialization_failure THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
END
$function$;

CREATE OR REPLACE FUNCTION public.reject_site_edit_request(
  p_request_id uuid,
  p_decision_note text DEFAULT NULL
)
RETURNS public.edit_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_request public.edit_requests;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may reject site edits';
  END IF;
  UPDATE public.edit_requests
  SET status = 'rejected', decision_note = p_decision_note,
      reviewed_by = v_actor_id, reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending' AND edit_type = 'site'
  RETURNING * INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending site edit not found';
  END IF;
  RETURN v_request;
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_contact_message(
  p_sender_name text,
  p_sender_email text,
  p_subject text,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_sender_user_id uuid := (SELECT auth.uid());
  v_id uuid;
BEGIN
  IF char_length(btrim(COALESCE(p_sender_name, ''))) NOT BETWEEN 2 AND 120
     OR char_length(btrim(COALESCE(p_sender_email, ''))) NOT BETWEEN 5 AND 320
     OR btrim(p_sender_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR char_length(btrim(COALESCE(p_subject, ''))) NOT BETWEEN 2 AND 200
     OR char_length(btrim(COALESCE(p_message, ''))) NOT BETWEEN 5 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid contact message fields are required';
  END IF;
  INSERT INTO public.contact_messages (
    sender_user_id, sender_name, sender_email, subject, message
  ) VALUES (
    v_sender_user_id, btrim(p_sender_name), lower(btrim(p_sender_email)),
    btrim(p_subject), btrim(p_message)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.mark_contact_message_read(p_message_id uuid)
RETURNS public.contact_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_message public.contact_messages;
BEGIN
  SELECT position_key INTO v_position
  FROM public.executive_assignments
  WHERE user_id = v_actor_id AND position_key IN ('PRESIDENT', 'VICE_PRESIDENT');
  IF v_actor_id IS NULL OR v_position IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only contact administrators may read messages';
  END IF;
  UPDATE public.contact_messages
  SET status = CASE WHEN status = 'UNREAD' THEN 'READ' ELSE status END,
      read_at = COALESCE(read_at, now()),
      read_by = COALESCE(read_by, v_actor_id),
      updated_at = now()
  WHERE id = p_message_id
  RETURNING * INTO v_message;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Contact message not found';
  END IF;
  RETURN v_message;
END
$function$;

CREATE OR REPLACE FUNCTION public.reply_to_contact_message(
  p_message_id uuid,
  p_reply_text text
)
RETURNS public.contact_message_replies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_actor_name text;
  v_message public.contact_messages;
  v_reply public.contact_message_replies;
BEGIN
  SELECT ea.position_key, p.name
  INTO v_position, v_actor_name
  FROM public.executive_assignments AS ea
  JOIN public.profiles AS p ON p.id = ea.user_id
  WHERE ea.user_id = v_actor_id
    AND ea.position_key IN ('PRESIDENT', 'VICE_PRESIDENT')
    AND p.status = 'active';
  IF v_actor_id IS NULL OR v_position IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the president or vice president may reply';
  END IF;
  IF char_length(btrim(COALESCE(p_reply_text, ''))) NOT BETWEEN 2 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid reply is required';
  END IF;

  SELECT * INTO v_message
  FROM public.contact_messages
  WHERE id = p_message_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Contact message not found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contact_message_replies WHERE message_id = p_message_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'CONTACT_MESSAGE_ALREADY_REPLIED';
  END IF;

  INSERT INTO public.contact_message_replies (
    message_id, reply_text, replied_by, replied_by_name, replied_by_role,
    delivery_channel, delivery_status
  ) VALUES (
    v_message.id,
    btrim(p_reply_text),
    v_actor_id,
    COALESCE(NULLIF(btrim(v_actor_name), ''), v_position),
    v_position,
    CASE WHEN v_message.sender_user_id IS NULL THEN 'EMAIL' ELSE 'IN_APP' END,
    CASE WHEN v_message.sender_user_id IS NULL THEN 'PENDING' ELSE 'NOT_REQUIRED' END
  ) RETURNING * INTO v_reply;

  UPDATE public.contact_messages
  SET status = 'REPLIED',
      read_at = COALESCE(read_at, now()),
      read_by = COALESCE(read_by, v_actor_id),
      updated_at = now()
  WHERE id = v_message.id;
  RETURN v_reply;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.publish_cms_target(text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_site_edit_request(text, text, text, jsonb, bigint, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.approve_site_edit_request(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reject_site_edit_request(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_contact_message(text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_contact_message_read(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reply_to_contact_message(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.publish_cms_target(text, jsonb, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_site_edit_request(text, text, text, jsonb, bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_site_edit_request(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_site_edit_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_contact_message(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_contact_message_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_to_contact_message(uuid, text) TO authenticated;

DO $realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'student_guide'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_guide;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'faq'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.faq;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contact_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contact_message_replies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_message_replies;
  END IF;
END
$realtime$;
