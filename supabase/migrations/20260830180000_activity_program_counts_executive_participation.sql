BEGIN;

-- Public program projection: exposes aggregate counts to guests while returning
-- private decision and balance fields only for the current authenticated user.
CREATE OR REPLACE FUNCTION public.list_activity_program_board()
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
  total_points integer,
  can_participate boolean,
  economy_exempt boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_profile_active boolean := false;
  v_is_executive boolean := false;
  v_is_accepted_student boolean := false;
  v_can_participate boolean := false;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = v_user_id
        AND profile.status = 'active'
    ) INTO v_profile_active;

    IF v_profile_active THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.executive_assignments AS assignment
        WHERE assignment.user_id = v_user_id
      ) INTO v_is_executive;

      SELECT EXISTS (
        SELECT 1
        FROM public.student_applications AS application
        WHERE application.student_user_id = v_user_id
          AND application.status = 'accepted'
      ) INTO v_is_accepted_student;
    END IF;
  END IF;

  v_can_participate := v_profile_active AND (v_is_executive OR v_is_accepted_student);

  RETURN QUERY
  SELECT
    activity.id,
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
    END,
    own_enrollment.decision,
    own_enrollment.excuse_text,
    COALESCE(profile.total_points, 0),
    v_can_participate,
    v_is_executive
  FROM public.activities AS activity
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS joining_count
    FROM public.activity_enrollments AS enrollment
    WHERE enrollment.activity_id = activity.id
      AND enrollment.decision = 'JOINING'::public.activity_decision
  ) AS counts
  LEFT JOIN public.profiles AS profile
    ON profile.id = v_user_id
   AND v_can_participate
  LEFT JOIN public.activity_enrollments AS own_enrollment
    ON own_enrollment.activity_id = activity.id
   AND own_enrollment.student_id = v_user_id
   AND v_can_participate
  WHERE activity.public_event_id IS NOT NULL
  ORDER BY activity.deadline, activity.created_at DESC;
END;
$function$;

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
  v_activity public.activities;
  v_existing public.activity_enrollments;
  v_result public.activity_enrollments;
  v_clean_excuse text := NULLIF(btrim(p_excuse_text), '');
  v_joining_count integer;
  v_balance integer;
  v_cycle integer;
  v_fee_active boolean;
  v_balance_changed boolean := false;
  v_is_executive boolean := false;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.executive_assignments AS assignment
      WHERE assignment.user_id = v_user_id
    ) INTO v_is_executive;
  END IF;

  IF v_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles AS profile
       WHERE profile.id = v_user_id
         AND profile.status = 'active'
     )
     OR (NOT v_is_executive AND NOT (SELECT private.is_accepted_active_student(v_user_id))) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted active students or current executives may update activity enrollment';
  END IF;

  SELECT *
  INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Activity not found';
  END IF;
  IF v_activity.deadline <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Activity enrollment is closed';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.activity_enrollments
  WHERE activity_id = p_activity_id
    AND student_id = v_user_id
  FOR UPDATE;

  IF p_decision = 'DECLINING'
     AND v_activity.type = 'MANDATORY'
     AND v_clean_excuse IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Mandatory activities require an excuse when declining';
  END IF;

  IF p_decision = 'JOINING' THEN
    IF v_activity.max_capacity IS NOT NULL THEN
      SELECT count(*)::integer
      INTO v_joining_count
      FROM public.activity_enrollments AS enrollment
      WHERE enrollment.activity_id = p_activity_id
        AND enrollment.student_id <> v_user_id
        AND enrollment.decision = 'JOINING';

      IF v_joining_count >= v_activity.max_capacity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Activity capacity is full';
      END IF;
    END IF;
    v_clean_excuse := NULL;
  END IF;

  IF NOT v_is_executive
     AND v_activity.type = 'PAID'
     AND p_decision = 'JOINING'
     AND COALESCE(v_existing.paid_fee_active, false) = false THEN
    SELECT profile.total_points
    INTO v_balance
    FROM public.profiles AS profile
    WHERE profile.id = v_user_id
    FOR UPDATE;

    IF COALESCE(v_balance, 0) < v_activity.points_value THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Student points are insufficient for this activity';
    END IF;

    v_cycle := COALESCE(v_existing.paid_charge_cycle, 0) + 1;
    INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
    VALUES (
      v_user_id,
      -v_activity.points_value,
      'رسوم الانضمام: ' || v_activity.title,
      v_user_id,
      'paid-join:' || p_activity_id || ':' || v_user_id || ':' || v_cycle
    )
    ON CONFLICT (source_key) DO NOTHING;
    v_balance_changed := FOUND;
    v_fee_active := true;
  ELSIF NOT v_is_executive
        AND v_activity.type = 'PAID'
        AND p_decision <> 'JOINING'
        AND COALESCE(v_existing.paid_fee_active, false) THEN
    v_cycle := v_existing.paid_charge_cycle;
    INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
    VALUES (
      v_user_id,
      v_activity.points_value,
      'استرجاع رسوم النشاط: ' || v_activity.title,
      v_user_id,
      'paid-refund:' || p_activity_id || ':' || v_user_id || ':' || v_cycle
    )
    ON CONFLICT (source_key) DO NOTHING;
    v_balance_changed := FOUND;
    v_fee_active := false;
  ELSE
    v_cycle := COALESCE(v_existing.paid_charge_cycle, 0);
    v_fee_active := CASE
      WHEN v_is_executive THEN COALESCE(v_existing.paid_fee_active, false)
      ELSE v_activity.type = 'PAID' AND p_decision = 'JOINING'
    END;
  END IF;

  INSERT INTO public.activity_enrollments (
    activity_id,
    student_id,
    decision,
    excuse_text,
    paid_charge_cycle,
    paid_fee_active
  ) VALUES (
    p_activity_id,
    v_user_id,
    p_decision,
    v_clean_excuse,
    v_cycle,
    v_fee_active
  )
  ON CONFLICT (activity_id, student_id) DO UPDATE
  SET decision = EXCLUDED.decision,
      excuse_text = EXCLUDED.excuse_text,
      paid_charge_cycle = EXCLUDED.paid_charge_cycle,
      paid_fee_active = EXCLUDED.paid_fee_active
  RETURNING * INTO v_result;

  IF v_balance_changed THEN
    PERFORM private.refresh_top_ten_state(true);
  END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_activity_excuse(
  p_enrollment_id uuid,
  p_status public.excuse_review_status
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.activity_enrollments;
  v_actor uuid := (SELECT auth.uid());
  v_amount integer;
  v_is_executive boolean;
  v_notification_body text;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT', 'ACADEMIC_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to review excuses';
  END IF;
  IF p_status NOT IN ('ACCEPTED', 'PARTIAL', 'REJECTED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A final excuse decision is required';
  END IF;

  SELECT enrollment.*
  INTO v_row
  FROM public.activity_enrollments AS enrollment
  JOIN public.activities AS activity ON activity.id = enrollment.activity_id
  WHERE enrollment.id = p_enrollment_id
    AND activity.type = 'MANDATORY'
    AND enrollment.decision = 'DECLINING'
  FOR UPDATE OF enrollment;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending excuse not found';
  END IF;
  IF v_row.excuse_status <> 'PENDING' THEN
    RETURN v_row;
  END IF;

  UPDATE public.activity_enrollments
  SET excuse_status = p_status
  WHERE id = p_enrollment_id
  RETURNING * INTO v_row;

  SELECT EXISTS (
    SELECT 1
    FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = v_row.student_id
  ) INTO v_is_executive;

  v_amount := CASE
    WHEN v_is_executive THEN 0
    WHEN p_status = 'PARTIAL' THEN -5
    WHEN p_status = 'REJECTED' THEN -15
    ELSE 0
  END;

  IF v_amount <> 0 THEN
    INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
    VALUES (
      v_row.student_id,
      v_amount,
      CASE p_status
        WHEN 'PARTIAL' THEN 'عذر مقنع جزئياً'
        ELSE 'عذر غير مقنع'
      END,
      v_actor,
      'excuse:' || p_enrollment_id
    )
    ON CONFLICT (source_key) DO NOTHING;
    PERFORM private.refresh_top_ten_state(true);
  END IF;

  v_notification_body := CASE
    WHEN v_is_executive THEN 'تم تقييم عذرك دون أي تغيير في النقاط أثناء توليك المنصب.'
    WHEN p_status = 'ACCEPTED' THEN 'تم قبول عذرك دون خصم نقاط.'
    WHEN p_status = 'PARTIAL' THEN 'تم قبول عذرك جزئياً وخصم 5 نقاط.'
    ELSE 'لم يُقبل العذر وتم خصم 15 نقطة.'
  END;

  PERFORM private.enqueue_personal_economy_push(
    v_row.student_id,
    'economy:excuse:' || p_enrollment_id,
    'تم تقييم عذرك',
    v_notification_body
  );
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_activity_evaluation(p_activity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_activity public.activities;
  v_actor uuid := (SELECT auth.uid());
  v_row record;
  v_amount integer;
  v_count integer := 0;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT', 'AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to finalize attendance';
  END IF;

  SELECT * INTO v_activity
  FROM public.activities
  WHERE id = p_activity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Activity not found';
  END IF;
  IF v_activity.evaluation_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('activityId', p_activity_id, 'alreadyFinalized', true, 'ledgerEntries', 0);
  END IF;

  PERFORM 1
  FROM public.activity_enrollments
  WHERE activity_id = p_activity_id
    AND decision = 'JOINING'
  ORDER BY student_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.activity_enrollments
    WHERE activity_id = p_activity_id
      AND decision = 'JOINING'
      AND attendance_status IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Every joining student requires attendance evaluation';
  END IF;

  FOR v_row IN
    SELECT
      enrollment.*,
      EXISTS (
        SELECT 1
        FROM public.executive_assignments AS assignment
        WHERE assignment.user_id = enrollment.student_id
      ) AS economy_exempt
    FROM public.activity_enrollments AS enrollment
    WHERE enrollment.activity_id = p_activity_id
      AND enrollment.decision = 'JOINING'
    ORDER BY enrollment.student_id
  LOOP
    v_amount := CASE
      WHEN v_row.economy_exempt THEN 0
      WHEN v_row.attendance_status = 'ABSENT' AND v_activity.type = 'MANDATORY' THEN -20
      WHEN v_activity.type = 'PAID' OR v_row.attendance_status = 'ABSENT' THEN 0
      WHEN v_row.attendance_status = 'ON_TIME' THEN v_activity.points_value
      WHEN v_row.attendance_status = 'LATE' THEN round(v_activity.points_value * 0.75)::integer
      WHEN v_row.attendance_status = 'VERY_LATE' THEN round(v_activity.points_value * 0.30)::integer
      ELSE 0
    END;

    IF v_amount <> 0 THEN
      INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
      VALUES (
        v_row.student_id,
        v_amount,
        'نتيجة النشاط: ' || v_activity.title,
        v_actor,
        'activity-result:' || p_activity_id || ':' || v_row.student_id
      )
      ON CONFLICT (source_key) DO NOTHING;
      IF FOUND THEN
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.activities
  SET evaluation_closed_at = now(),
      evaluation_closed_by = v_actor
  WHERE id = p_activity_id;

  IF v_count > 0 THEN
    PERFORM private.refresh_top_ten_state(true);
  END IF;
  RETURN jsonb_build_object('activityId', p_activity_id, 'alreadyFinalized', false, 'ledgerEntries', v_count);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_activity_program_board()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_activity_program_board()
  TO anon, authenticated;

COMMIT;
