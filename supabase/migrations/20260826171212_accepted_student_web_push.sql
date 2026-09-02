-- Web Push is intentionally limited to active students whose application is accepted.
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_success_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_check
    CHECK (length(endpoint) BETWEEN 16 AND 2048 AND endpoint ~ '^https://[^[:space:]]+$'),
  CONSTRAINT push_subscriptions_p256dh_check
    CHECK (length(p256dh) BETWEEN 16 AND 256 AND p256dh ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT push_subscriptions_auth_key_check
    CHECK (length(auth_key) BETWEEN 8 AND 128 AND auth_key ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT push_subscriptions_user_agent_check
    CHECK (user_agent IS NULL OR length(user_agent) <= 500)
);

CREATE INDEX push_subscriptions_active_user_idx
  ON public.push_subscriptions (user_id, updated_at DESC)
  WHERE is_active;

CREATE TABLE public.push_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('NEWS', 'EVENT', 'GALLERY_ALBUM')),
  source_event_key text NOT NULL UNIQUE CHECK (length(source_event_key) BETWEEN 8 AND 500),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  destination text NOT NULL CHECK (destination IN ('/?push=news', '/?push=programs', '/?push=gallery')),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'PARTIAL', 'FAILED')),
  delivery_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  expired_count integer NOT NULL DEFAULT 0 CHECK (expired_count >= 0),
  last_error text,
  processing_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_notifications_last_error_check
    CHECK (last_error IS NULL OR length(last_error) <= 800)
);

CREATE INDEX push_notifications_pending_idx
  ON public.push_notifications (created_at)
  WHERE status IN ('PENDING', 'PARTIAL', 'FAILED');

CREATE TABLE public.push_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.push_notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  provider_status integer CHECK (provider_status IS NULL OR provider_status BETWEEN 100 AND 599),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_notification_deliveries_unique UNIQUE (notification_id, subscription_id),
  CONSTRAINT push_notification_deliveries_last_error_check
    CHECK (last_error IS NULL OR length(last_error) <= 800)
);

CREATE INDEX push_notification_deliveries_notification_idx
  ON public.push_notification_deliveries (notification_id, status, created_at);
CREATE INDEX push_notification_deliveries_subscription_idx
  ON public.push_notification_deliveries (subscription_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.push_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.push_notification_deliveries FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_notification_deliveries TO service_role;

CREATE OR REPLACE FUNCTION private.is_accepted_active_student(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT target_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = target_user_id
        AND profile.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.student_applications AS application
      WHERE application.student_user_id = target_user_id
        AND application.status = 'accepted'
    );
$function$;

REVOKE EXECUTE ON FUNCTION private.is_accepted_active_student(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_accepted_student_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (id uuid, user_id uuid, is_active boolean, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_endpoint text := btrim(COALESCE(p_endpoint, ''));
  v_p256dh text := btrim(COALESCE(p_p256dh, ''));
  v_auth_key text := btrim(COALESCE(p_auth_key, ''));
  v_user_agent text := NULLIF(left(btrim(COALESCE(p_user_agent, '')), 500), '');
  v_subscription public.push_subscriptions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF NOT (SELECT private.is_accepted_active_student(v_user_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only accepted active students may subscribe';
  END IF;
  IF length(v_endpoint) NOT BETWEEN 16 AND 2048
     OR v_endpoint !~ '^https://[^[:space:]]+$'
     OR length(v_p256dh) NOT BETWEEN 16 AND 256
     OR v_p256dh !~ '^[A-Za-z0-9_-]+$'
     OR length(v_auth_key) NOT BETWEEN 8 AND 128
     OR v_auth_key !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid push subscription data is required';
  END IF;

  INSERT INTO public.push_subscriptions (
    user_id, endpoint, p256dh, auth_key, user_agent, is_active,
    failure_count, updated_at
  ) VALUES (
    v_user_id, v_endpoint, v_p256dh, v_auth_key, v_user_agent, true,
    0, now()
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh,
      auth_key = EXCLUDED.auth_key,
      user_agent = EXCLUDED.user_agent,
      is_active = true,
      failure_count = 0,
      updated_at = now()
  RETURNING * INTO v_subscription;

  IF v_user_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_accepted_active_student(v_user_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Membership changed during subscription';
  END IF;

  id := v_subscription.id;
  user_id := v_subscription.user_id;
  is_active := v_subscription.is_active;
  updated_at := v_subscription.updated_at;
  RETURN NEXT;
END
$function$;

CREATE OR REPLACE FUNCTION public.disable_own_push_subscription(p_endpoint text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_endpoint text := btrim(COALESCE(p_endpoint, ''));
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF v_endpoint = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A push endpoint is required';
  END IF;

  UPDATE public.push_subscriptions
  SET is_active = false,
      updated_at = now()
  WHERE user_id = v_user_id
    AND endpoint = v_endpoint;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.register_accepted_student_push_subscription(text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.disable_own_push_subscription(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_accepted_student_push_subscription(text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_own_push_subscription(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_eligible_push_subscriptions_for_delivery()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  endpoint text,
  p256dh text,
  auth_key text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT subscription.id,
         subscription.user_id,
         subscription.endpoint,
         subscription.p256dh,
         subscription.auth_key
  FROM public.push_subscriptions AS subscription
  JOIN public.profiles AS profile
    ON profile.id = subscription.user_id
   AND profile.status = 'active'
  WHERE subscription.is_active
    AND EXISTS (
      SELECT 1
      FROM public.student_applications AS application
      WHERE application.student_user_id = subscription.user_id
        AND application.status = 'accepted'
    );
$function$;

CREATE OR REPLACE FUNCTION public.claim_push_notification(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.push_notifications
  SET status = 'SENDING',
      delivery_attempts = delivery_attempts + 1,
      processing_started_at = now(),
      last_error = NULL,
      updated_at = now()
  WHERE id = p_notification_id
    AND status IN ('PENDING', 'PARTIAL', 'FAILED');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END
$function$;

CREATE OR REPLACE FUNCTION public.claim_push_delivery(p_delivery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.push_notification_deliveries
  SET status = 'SENDING',
      attempts = attempts + 1,
      last_error = NULL,
      updated_at = now()
  WHERE id = p_delivery_id
    AND status IN ('PENDING', 'FAILED');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END
$function$;

CREATE OR REPLACE FUNCTION public.finalize_push_notification(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_sent integer;
  v_failed integer;
  v_pending integer;
  v_expired integer;
  v_status text;
BEGIN
  SELECT
    count(*) FILTER (WHERE delivery.status = 'SENT'),
    count(*) FILTER (WHERE delivery.status = 'FAILED'),
    count(*) FILTER (WHERE delivery.status IN ('PENDING', 'SENDING')),
    count(*) FILTER (WHERE delivery.status = 'FAILED' AND delivery.provider_status IN (404, 410))
  INTO v_sent, v_failed, v_pending, v_expired
  FROM public.push_notification_deliveries AS delivery
  WHERE delivery.notification_id = p_notification_id;

  v_status := CASE
    WHEN v_pending > 0 THEN CASE WHEN v_sent > 0 THEN 'PARTIAL' ELSE 'FAILED' END
    WHEN v_failed > 0 THEN CASE WHEN v_sent > 0 THEN 'PARTIAL' ELSE 'FAILED' END
    ELSE 'SENT'
  END;

  UPDATE public.push_notifications
  SET status = v_status,
      sent_count = v_sent,
      failed_count = v_failed,
      expired_count = v_expired,
      completed_at = CASE WHEN v_pending = 0 THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_notification_id;

  RETURN jsonb_build_object(
    'sent', v_sent,
    'failed', v_failed,
    'pending', v_pending,
    'expired', v_expired
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.list_eligible_push_subscriptions_for_delivery()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_push_notification(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.claim_push_delivery(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_push_notification(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_eligible_push_subscriptions_for_delivery() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_notification(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_delivery(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_push_notification(uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.deactivate_ineligible_push_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.student_user_id ELSE NEW.student_user_id END;
  IF v_user_id IS NOT NULL
     AND NOT (SELECT private.is_accepted_active_student(v_user_id)) THEN
    UPDATE public.push_subscriptions
    SET is_active = false,
        updated_at = now()
    WHERE user_id = v_user_id
      AND is_active;
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$function$;

REVOKE EXECUTE ON FUNCTION private.deactivate_ineligible_push_subscriptions()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS student_applications_deactivate_push_subscriptions
  ON public.student_applications;
DROP TRIGGER IF EXISTS student_applications_delete_deactivate_push_subscriptions
  ON public.student_applications;
CREATE TRIGGER student_applications_deactivate_push_subscriptions
AFTER UPDATE OF status, student_user_id ON public.student_applications
FOR EACH ROW
EXECUTE FUNCTION private.deactivate_ineligible_push_subscriptions();

CREATE TRIGGER student_applications_delete_deactivate_push_subscriptions
AFTER DELETE ON public.student_applications
FOR EACH ROW
EXECUTE FUNCTION private.deactivate_ineligible_push_subscriptions();

CREATE OR REPLACE FUNCTION private.deactivate_profile_push_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    UPDATE public.push_subscriptions
    SET is_active = false,
        updated_at = now()
    WHERE user_id = NEW.id
      AND is_active;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.deactivate_profile_push_subscriptions()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS profiles_deactivate_push_subscriptions ON public.profiles;
CREATE TRIGGER profiles_deactivate_push_subscriptions
AFTER UPDATE OF status ON public.profiles
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION private.deactivate_profile_push_subscriptions();

CREATE OR REPLACE FUNCTION private.enqueue_published_content_push_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_target text;
  v_kind text;
  v_body text;
  v_destination text;
  v_previous jsonb;
  v_current jsonb;
  v_item jsonb;
  v_id text;
  v_title text;
BEGIN
  FOREACH v_target IN ARRAY ARRAY['news', 'events', 'galleryAlbums'] LOOP
    v_previous := COALESCE(OLD.content -> v_target, '[]'::jsonb);
    v_current := COALESCE(NEW.content -> v_target, '[]'::jsonb);
    IF jsonb_typeof(v_previous) <> 'array' OR jsonb_typeof(v_current) <> 'array' THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_current) AS entry
      WHERE NULLIF(btrim(entry ->> 'id'), '') IS NOT NULL
      GROUP BY btrim(entry ->> 'id')
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CMS_CONTENT_DUPLICATE_ID';
    END IF;

    IF v_target = 'news' THEN
      v_kind := 'NEWS';
      v_body := 'تم نشر خبر جديد في موقع الاتحاد.';
      v_destination := '/?push=news';
    ELSIF v_target = 'events' THEN
      v_kind := 'EVENT';
      v_body := 'تمت إضافة فعالية أو برنامج جديد.';
      v_destination := '/?push=programs';
    ELSE
      v_kind := 'GALLERY_ALBUM';
      v_body := 'تم نشر ألبوم صور جديد.';
      v_destination := '/?push=gallery';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(v_current) LOOP
      v_id := NULLIF(btrim(v_item ->> 'id'), '');
      v_title := NULLIF(btrim(v_item ->> 'title'), '');
      IF v_id IS NULL OR v_title IS NULL OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_previous) AS old_item
        WHERE btrim(old_item ->> 'id') = v_id
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.push_notifications (
        kind, source_event_key, title, body, destination
      ) VALUES (
        v_kind,
        'cms:' || v_target || ':' || v_id,
        left('جديد اتحاد شباب الأمة: ' || v_title, 240),
        v_body,
        v_destination
      )
      ON CONFLICT (source_event_key) DO NOTHING;
    END LOOP;
  END LOOP;
  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.enqueue_published_content_push_notifications()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS published_site_content_enqueue_push_notifications
  ON public.published_site_content;
CREATE TRIGGER published_site_content_enqueue_push_notifications
AFTER UPDATE OF content ON public.published_site_content
FOR EACH ROW
WHEN (OLD.content IS DISTINCT FROM NEW.content)
EXECUTE FUNCTION private.enqueue_published_content_push_notifications();
