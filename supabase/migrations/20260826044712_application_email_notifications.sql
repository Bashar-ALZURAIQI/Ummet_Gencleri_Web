BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.validate_student_application_interview_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.interview_meeting_url IS NOT NULL
     AND btrim(NEW.interview_meeting_url) !~* '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Interview meeting URL must be an absolute HTTPS URL';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.validate_student_application_interview_link()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER student_applications_validate_interview_link
BEFORE INSERT OR UPDATE OF interview_meeting_url ON public.student_applications
FOR EACH ROW
EXECUTE FUNCTION private.validate_student_application_interview_link();

CREATE TABLE public.application_email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id text NOT NULL
    REFERENCES public.student_applications(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  delivery_status text NOT NULL DEFAULT 'PENDING',
  delivery_attempts integer NOT NULL DEFAULT 0,
  delivery_last_error text,
  email_provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT application_email_notifications_event_type_check
    CHECK (event_type IN ('NEW_APPLICATION', 'INTERVIEW_SCHEDULED', 'ACCEPTED', 'REJECTED')),
  CONSTRAINT application_email_notifications_delivery_status_check
    CHECK (delivery_status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  CONSTRAINT application_email_notifications_attempts_check
    CHECK (delivery_attempts >= 0),
  CONSTRAINT application_email_notifications_fingerprint_not_blank
    CHECK (char_length(btrim(fingerprint)) > 0),
  CONSTRAINT application_email_notifications_payload_object
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT application_email_notifications_event_fingerprint_key
    UNIQUE (application_id, event_type, fingerprint)
);

CREATE INDEX application_email_notifications_delivery_created_idx
  ON public.application_email_notifications (delivery_status, created_at);

CREATE INDEX application_email_notifications_application_created_idx
  ON public.application_email_notifications (application_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.set_application_email_notification_updated_at()
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

REVOKE EXECUTE ON FUNCTION private.set_application_email_notification_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER application_email_notifications_set_updated_at
BEFORE UPDATE ON public.application_email_notifications
FOR EACH ROW
EXECUTE FUNCTION private.set_application_email_notification_updated_at();

CREATE OR REPLACE FUNCTION private.enqueue_application_email_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_type text;
  v_fingerprint text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    v_event_type := 'NEW_APPLICATION';
    v_fingerprint := 'initial';
  ELSIF TG_OP = 'UPDATE'
    AND NEW.status = 'interview'
    AND (
      OLD.status IS DISTINCT FROM 'interview'
      OR NEW.interview_date IS DISTINCT FROM OLD.interview_date
      OR NEW.interview_time IS DISTINCT FROM OLD.interview_time
      OR NEW.interview_meeting_url IS DISTINCT FROM OLD.interview_meeting_url
    ) THEN
    v_event_type := 'INTERVIEW_SCHEDULED';
    v_fingerprint := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          COALESCE(NEW.interview_date::text, '') || '|' ||
          COALESCE(btrim(NEW.interview_time), '') || '|' ||
          COALESCE(btrim(NEW.interview_meeting_url), ''),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
  ELSIF TG_OP = 'UPDATE'
    AND NEW.status = 'accepted'
    AND OLD.status IS DISTINCT FROM 'accepted' THEN
    v_event_type := 'ACCEPTED';
    v_fingerprint := 'accepted';
  ELSIF TG_OP = 'UPDATE'
    AND NEW.status = 'rejected'
    AND OLD.status IS DISTINCT FROM 'rejected' THEN
    v_event_type := 'REJECTED';
    v_fingerprint := 'rejected:' || pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(COALESCE(btrim(NEW.rejection_reason), ''), 'UTF8'),
        'sha256'
      ),
      'hex'
    );
  ELSE
    RETURN NEW;
  END IF;

  v_payload := pg_catalog.jsonb_build_object(
    'studentName', NEW.name,
    'studentEmail', NEW.email,
    'interviewDate', CASE WHEN NEW.interview_date IS NULL THEN NULL ELSE NEW.interview_date::text END,
    'interviewTime', NEW.interview_time,
    'interviewLink', NEW.interview_meeting_url,
    'rejectionReason', NEW.rejection_reason
  );

  INSERT INTO public.application_email_notifications (
    application_id,
    event_type,
    fingerprint,
    payload
  )
  VALUES (
    NEW.id,
    v_event_type,
    v_fingerprint,
    v_payload
  )
  ON CONFLICT (application_id, event_type, fingerprint) DO NOTHING;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.enqueue_application_email_notification()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER student_applications_enqueue_email_notification
AFTER INSERT OR UPDATE ON public.student_applications
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_application_email_notification();

ALTER TABLE public.application_email_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "application_email_notifications_president_select"
ON public.application_email_notifications
FOR SELECT
TO authenticated
USING (COALESCE((
  SELECT authz.is_president
  FROM private.current_user_authorization AS authz
), false));

REVOKE ALL ON TABLE public.application_email_notifications
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.application_email_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.application_email_notifications TO service_role;

COMMIT;
