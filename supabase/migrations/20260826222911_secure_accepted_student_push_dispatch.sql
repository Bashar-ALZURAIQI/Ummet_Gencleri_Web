CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.dispatch_accepted_student_web_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_url text;
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'accepted_student_push_webhook_url';

  SELECT decrypted_secret
  INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'accepted_student_push_webhook_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'accepted-student Web Push webhook is not configured';
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-webhook-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', NULL
    ),
    timeout_milliseconds := 5000
  )
  INTO v_request_id;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION private.dispatch_accepted_student_web_push()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS send_web_push_notification ON public.push_notifications;
CREATE TRIGGER send_web_push_notification
AFTER INSERT ON public.push_notifications
FOR EACH ROW
EXECUTE FUNCTION private.dispatch_accepted_student_web_push();

COMMENT ON FUNCTION private.dispatch_accepted_student_web_push() IS
  'Dispatches a durable notification outbox row through pg_net. The URL and authentication secret are stored in Vault.';
