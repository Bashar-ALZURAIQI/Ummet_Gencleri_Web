-- A non-President executive may create a new event, but the previous trigger
-- replayed every published event through upsert_event_activity. Replaying an
-- unrelated activity correctly hit its creator-ownership guard and rolled back
-- the new event. Synchronize only added or materially changed event records;
-- the existing upsert authorization remains the sole authority for updates.

CREATE OR REPLACE FUNCTION public.sync_published_event_activities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event jsonb;
  v_previous_events jsonb := '[]'::jsonb;
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

  IF TG_OP = 'UPDATE' THEN
    v_previous_events := CASE
      WHEN jsonb_typeof(OLD.content -> 'events') = 'array' THEN OLD.content -> 'events'
      ELSE '[]'::jsonb
    END;
  END IF;

  FOR v_event IN
    SELECT next_event.value
    FROM jsonb_array_elements(NEW.content -> 'events') AS next_event(value)
    LEFT JOIN LATERAL (
      SELECT previous_event.value
      FROM jsonb_array_elements(v_previous_events) AS previous_event(value)
      WHERE jsonb_typeof(previous_event.value) = 'object'
        AND previous_event.value ->> 'id' = next_event.value ->> 'id'
      LIMIT 1
    ) AS previous_event ON true
    WHERE jsonb_typeof(next_event.value) = 'object'
      AND (
        TG_OP = 'INSERT'
        OR previous_event.value IS NULL
        OR previous_event.value IS DISTINCT FROM next_event.value
      )
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
