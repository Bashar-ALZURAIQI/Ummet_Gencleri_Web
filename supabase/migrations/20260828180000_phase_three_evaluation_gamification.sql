BEGIN;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS evaluation_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS evaluation_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.activity_enrollments
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS paid_charge_cycle integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_fee_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.activity_enrollments ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS activity_enrollments_id_key ON public.activity_enrollments (id);

CREATE TABLE IF NOT EXISTS public.economy_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 120),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS economy_seasons_one_active_idx
  ON public.economy_seasons ((true)) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS economy_seasons_ended_by_idx ON public.economy_seasons (ended_by);

INSERT INTO public.economy_seasons (label)
SELECT 'الموسم الحالي'
WHERE NOT EXISTS (SELECT 1 FROM public.economy_seasons WHERE ended_at IS NULL);

CREATE TABLE IF NOT EXISTS public.top_ten_membership_state (
  student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_top_ten boolean NOT NULL DEFAULT false,
  rank integer CHECK (rank IS NULL OR rank > 0),
  changed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS top_ten_membership_active_idx
  ON public.top_ten_membership_state (rank) WHERE is_top_ten;

ALTER TABLE public.push_notifications ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS push_notifications_target_user_idx
  ON public.push_notifications (target_user_id, created_at DESC) WHERE target_user_id IS NOT NULL;
ALTER TABLE public.push_notifications DROP CONSTRAINT IF EXISTS push_notifications_kind_check;
ALTER TABLE public.push_notifications ADD CONSTRAINT push_notifications_kind_check
  CHECK (kind IN ('NEWS', 'EVENT', 'GALLERY_ALBUM', 'PERSONAL'));
ALTER TABLE public.push_notifications DROP CONSTRAINT IF EXISTS push_notifications_destination_check;
ALTER TABLE public.push_notifications ADD CONSTRAINT push_notifications_destination_check
  CHECK (destination IN ('/?push=news', '/?push=programs', '/?push=gallery', '/?push=student-dashboard'));

ALTER TABLE public.economy_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.top_ten_membership_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.economy_seasons FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.top_ten_membership_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.economy_seasons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.top_ten_membership_state TO service_role;

CREATE OR REPLACE FUNCTION private.phase_three_has_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.executive_assignments AS assignment
    WHERE assignment.user_id = (SELECT auth.uid())
      AND assignment.position_key = ANY (p_roles)
  );
$function$;

CREATE OR REPLACE FUNCTION public.list_activity_evaluations()
RETURNS TABLE (
  activity_id uuid, activity_title text, activity_type public.activity_type,
  points_value integer, deadline timestamptz, evaluation_closed_at timestamptz,
  student_id uuid, student_name text, avatar_path text,
  attendance_status public.attendance_status
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not authorized to evaluate attendance';
  END IF;
  RETURN QUERY SELECT a.id,a.title,a.type,a.points_value,a.deadline,a.evaluation_closed_at,
    p.id,p.name,p.avatar_path,e.attendance_status
  FROM public.activities a JOIN public.activity_enrollments e ON e.activity_id=a.id
  JOIN public.profiles p ON p.id=e.student_id
  WHERE e.decision='JOINING' AND a.evaluation_closed_at IS NULL
  ORDER BY a.deadline,p.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_activity_attendance(
  p_activity_id uuid, p_student_id uuid, p_status public.attendance_status
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_result public.activity_enrollments;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not authorized to evaluate attendance';
  END IF;
  IF EXISTS(SELECT 1 FROM public.activities WHERE id=p_activity_id AND evaluation_closed_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Activity evaluation is closed';
  END IF;
  UPDATE public.activity_enrollments SET attendance_status=p_status
  WHERE activity_id=p_activity_id AND student_id=p_student_id AND decision='JOINING'
  RETURNING * INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Joining enrollment not found'; END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_activity_evaluation(p_activity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_activity public.activities; v_actor uuid:=(SELECT auth.uid()); v_row record; v_amount integer; v_count integer:=0;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not authorized to finalize attendance';
  END IF;
  SELECT * INTO v_activity FROM public.activities WHERE id=p_activity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Activity not found'; END IF;
  IF v_activity.evaluation_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('activityId',p_activity_id,'alreadyFinalized',true,'ledgerEntries',0);
  END IF;
  PERFORM 1 FROM public.activity_enrollments WHERE activity_id=p_activity_id AND decision='JOINING' ORDER BY student_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.activity_enrollments WHERE activity_id=p_activity_id AND decision='JOINING' AND attendance_status IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Every joining student requires attendance evaluation';
  END IF;
  FOR v_row IN SELECT * FROM public.activity_enrollments WHERE activity_id=p_activity_id AND decision='JOINING' ORDER BY student_id LOOP
    v_amount := CASE
      WHEN v_row.attendance_status='ABSENT' AND v_activity.type='MANDATORY' THEN -20
      WHEN v_activity.type='PAID' OR v_row.attendance_status='ABSENT' THEN 0
      WHEN v_row.attendance_status='ON_TIME' THEN v_activity.points_value
      WHEN v_row.attendance_status='LATE' THEN round(v_activity.points_value*0.75)::integer
      WHEN v_row.attendance_status='VERY_LATE' THEN round(v_activity.points_value*0.30)::integer
      ELSE 0 END;
    IF v_amount <> 0 THEN
      INSERT INTO public.points_ledger(student_id,amount,reason,created_by,source_key)
      VALUES(v_row.student_id,v_amount,'نتيجة النشاط: '||v_activity.title,v_actor,
             'activity-result:'||p_activity_id||':'||v_row.student_id)
      ON CONFLICT(source_key) DO NOTHING;
      IF FOUND THEN v_count:=v_count+1; END IF;
    END IF;
  END LOOP;
  UPDATE public.activities SET evaluation_closed_at=now(),evaluation_closed_by=v_actor WHERE id=p_activity_id;
  PERFORM private.refresh_top_ten_state(true);
  RETURN jsonb_build_object('activityId',p_activity_id,'alreadyFinalized',false,'ledgerEntries',v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_task_evaluations()
RETURNS TABLE (
  task_id uuid, task_title text, points_reward integer, deadline timestamptz,
  evaluation_closed_at timestamptz, student_id uuid, student_name text,
  avatar_path text, completion_status public.task_completion_status
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not authorized to evaluate tasks';
  END IF;
  RETURN QUERY SELECT t.id,t.title,t.points_reward,t.deadline,t.evaluation_closed_at,
    p.id,p.name,p.avatar_path,e.completion_status
  FROM public.tasks t JOIN public.task_enrollments e ON e.task_id=t.id
  JOIN public.profiles p ON p.id=e.student_id
  WHERE t.evaluation_closed_at IS NULL ORDER BY t.deadline,p.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_task_completion(
  p_task_id uuid, p_student_id uuid, p_status public.task_completion_status
)
RETURNS public.task_enrollments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_result public.task_enrollments;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not authorized to evaluate tasks';
  END IF;
  IF p_status='PENDING' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='A final task status is required'; END IF;
  IF EXISTS(SELECT 1 FROM public.tasks WHERE id=p_task_id AND evaluation_closed_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Task evaluation is closed';
  END IF;
  UPDATE public.task_enrollments SET completion_status=p_status
  WHERE task_id=p_task_id AND student_id=p_student_id RETURNING * INTO v_result;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Task enrollment not found'; END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_task_evaluation(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_task public.tasks; v_actor uuid:=(SELECT auth.uid()); v_row record; v_amount integer; v_count integer:=0;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not authorized to finalize tasks';
  END IF;
  SELECT * INTO v_task FROM public.tasks WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Task not found'; END IF;
  IF v_task.evaluation_closed_at IS NOT NULL THEN
    RETURN jsonb_build_object('taskId',p_task_id,'alreadyFinalized',true,'ledgerEntries',0);
  END IF;
  PERFORM 1 FROM public.task_enrollments WHERE task_id=p_task_id ORDER BY student_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.task_enrollments WHERE task_id=p_task_id AND completion_status='PENDING') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Every enrolled student requires task evaluation';
  END IF;
  FOR v_row IN SELECT * FROM public.task_enrollments WHERE task_id=p_task_id ORDER BY student_id LOOP
    v_amount:=CASE v_row.completion_status WHEN 'PERFECT' THEN v_task.points_reward
      WHEN 'PARTIAL' THEN round(v_task.points_reward*0.50)::integer ELSE 0 END;
    IF v_amount<>0 THEN
      INSERT INTO public.points_ledger(student_id,amount,reason,created_by,source_key)
      VALUES(v_row.student_id,v_amount,'نتيجة المهمة: '||v_task.title,v_actor,
             'task-result:'||p_task_id||':'||v_row.student_id)
      ON CONFLICT(source_key) DO NOTHING;
      IF FOUND THEN v_count:=v_count+1; END IF;
    END IF;
  END LOOP;
  UPDATE public.tasks SET evaluation_closed_at=now(),evaluation_closed_by=v_actor,status='CLOSED' WHERE id=p_task_id;
  PERFORM private.refresh_top_ten_state(true);
  RETURN jsonb_build_object('taskId',p_task_id,'alreadyFinalized',false,'ledgerEntries',v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_member_points()
RETURNS TABLE(student_id uuid,student_name text,avatar_path text,total_points integer,current_tier text,needs_warning boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','ACADEMIC_HEAD','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Not authorized to list member points';
  END IF;
  RETURN QUERY SELECT p.id,p.name,p.avatar_path,p.total_points,p.current_tier,p.total_points<=-50
  FROM public.profiles p WHERE p.status='active' AND EXISTS(
    SELECT 1 FROM public.student_applications a WHERE a.student_user_id=p.id AND a.status='accepted')
  ORDER BY p.total_points DESC,p.created_at,p.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_member_points(
  p_student_id uuid,p_amount integer,p_reason text,p_request_id uuid
)
RETURNS public.points_ledger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_result public.points_ledger; v_reason text:=btrim(p_reason);
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Only the president may adjust points';
  END IF;
  IF p_amount=0 OR abs(p_amount)>100000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='A signed non-zero amount is required'; END IF;
  IF char_length(v_reason)<3 OR char_length(v_reason)>1000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='A meaningful reason is required'; END IF;
  IF NOT (SELECT private.is_accepted_active_student(p_student_id)) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Accepted student not found'; END IF;
  INSERT INTO public.points_ledger(student_id,amount,reason,created_by,source_key)
  VALUES(p_student_id,p_amount,v_reason,v_actor,'manual:'||p_request_id)
  ON CONFLICT(source_key) DO UPDATE SET source_key=EXCLUDED.source_key
  RETURNING * INTO v_result;
  PERFORM private.refresh_top_ten_state(true);
  PERFORM private.enqueue_personal_economy_push(p_student_id,'economy:manual:'||p_request_id,
    'تم تحديث رصيد نقاطك','تم '||CASE WHEN p_amount>0 THEN 'إضافة ' ELSE 'خصم ' END||abs(p_amount)||' نقطة. السبب: '||v_reason);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_economy_season()
RETURNS public.economy_seasons
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_result public.economy_seasons;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','ACADEMIC_HEAD','AUDIT_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Not authorized to view economy season';
  END IF;
  SELECT * INTO v_result FROM public.economy_seasons WHERE ended_at IS NULL;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.end_economy_season(p_season_id uuid,p_next_label text)
RETURNS public.economy_seasons
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=(SELECT auth.uid()); v_season public.economy_seasons; v_result public.economy_seasons; v_student record;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT'])) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Only the president may end a season';
  END IF;
  IF char_length(btrim(p_next_label))<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Next season label is required'; END IF;
  SELECT * INTO v_season FROM public.economy_seasons WHERE id=p_season_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Season not found'; END IF;
  IF v_season.ended_at IS NOT NULL THEN
    SELECT * INTO v_result FROM public.economy_seasons WHERE ended_at IS NULL;
    RETURN v_result;
  END IF;
  FOR v_student IN SELECT p.id,p.total_points FROM public.profiles p WHERE p.status='active'
    AND p.total_points<>0 AND EXISTS(SELECT 1 FROM public.student_applications a WHERE a.student_user_id=p.id AND a.status='accepted')
    ORDER BY p.id FOR UPDATE OF p
  LOOP
    INSERT INTO public.points_ledger(student_id,amount,reason,created_by,source_key)
    VALUES(v_student.id,-v_student.total_points,'تصفير رصيد نهاية الموسم: '||v_season.label,v_actor,
           'season-close:'||p_season_id||':'||v_student.id) ON CONFLICT(source_key) DO NOTHING;
  END LOOP;
  UPDATE public.economy_seasons SET ended_at=now(),ended_by=v_actor WHERE id=p_season_id;
  INSERT INTO public.economy_seasons(label) VALUES(btrim(p_next_label)) RETURNING * INTO v_result;
  PERFORM private.refresh_top_ten_state(false);
  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION private.phase_three_has_role(text[]) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.enqueue_personal_economy_push(
  p_student_id uuid,
  p_source_event_key text,
  p_title text,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.is_accepted_active_student(p_student_id)) THEN RETURN; END IF;
  INSERT INTO public.push_notifications (
    kind, source_event_key, title, body, destination, target_user_id
  ) VALUES (
    'PERSONAL', left(p_source_event_key, 500), left(p_title, 240), left(p_body, 500),
    '/?push=student-dashboard', p_student_id
  ) ON CONFLICT (source_event_key) DO NOTHING;
END;
$function$;
REVOKE EXECUTE ON FUNCTION private.enqueue_personal_economy_push(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.apply_points_ledger_to_profile_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.profiles
  SET total_points = total_points + NEW.amount,
      current_tier = CASE
        WHEN total_points + NEW.amount > 300 THEN 'GOLD'
        WHEN total_points + NEW.amount > 100 THEN 'SILVER'
        ELSE 'BRONZE'
      END
  WHERE id = NEW.student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Points ledger student profile does not exist';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION private.apply_points_ledger_to_profile_total()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.refresh_top_ten_state(p_notify boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_row record;
BEGIN
  FOR v_row IN
    WITH ranked AS (
      SELECT p.id AS student_id,
             row_number() OVER (ORDER BY p.total_points DESC, p.created_at ASC, p.id ASC)::integer AS rank
      FROM public.profiles p
      WHERE p.status = 'active'
        AND EXISTS (SELECT 1 FROM public.student_applications a
                    WHERE a.student_user_id = p.id AND a.status = 'accepted')
    )
    SELECT r.student_id, r.rank, COALESCE(s.is_top_ten, false) AS was_top_ten
    FROM ranked r LEFT JOIN public.top_ten_membership_state s ON s.student_id = r.student_id
  LOOP
    INSERT INTO public.top_ten_membership_state (student_id, is_top_ten, rank, changed_at, updated_at)
    VALUES (v_row.student_id, v_row.rank <= 10, v_row.rank,
            CASE WHEN v_row.was_top_ten IS DISTINCT FROM (v_row.rank <= 10) THEN now() ELSE now() END, now())
    ON CONFLICT (student_id) DO UPDATE SET
      is_top_ten = EXCLUDED.is_top_ten,
      rank = EXCLUDED.rank,
      changed_at = CASE WHEN public.top_ten_membership_state.is_top_ten IS DISTINCT FROM EXCLUDED.is_top_ten
                        THEN now() ELSE public.top_ten_membership_state.changed_at END,
      updated_at = now();
    IF p_notify AND NOT v_row.was_top_ten AND v_row.rank <= 10 THEN
      PERFORM private.enqueue_personal_economy_push(
        v_row.student_id,
        'economy:top10:' || v_row.student_id || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
        'تهانينا! دخلت قائمة أفضل 10',
        'ارتفع ترتيبك وأصبحت ضمن لوحة الشرف في اتحاد شباب الأمة.'
      );
    END IF;
  END LOOP;
END;
$function$;
REVOKE EXECUTE ON FUNCTION private.refresh_top_ten_state(boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- The fee is charged only while a PAID enrollment is JOINING. Every rejoin starts
-- a new auditable cycle, while duplicate retries remain protected by source_key.
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
  v_balance_changed boolean := false;
BEGIN
  IF v_user_id IS NULL OR NOT (SELECT private.is_accepted_active_student(v_user_id)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only accepted active students may update activity enrollment';
  END IF;
  SELECT * INTO v_activity FROM public.activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Activity not found'; END IF;
  IF v_activity.deadline <= now() THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Activity enrollment is closed'; END IF;
  SELECT * INTO v_existing FROM public.activity_enrollments
  WHERE activity_id = p_activity_id AND student_id = v_user_id FOR UPDATE;

  IF p_decision = 'DECLINING' AND v_activity.type = 'MANDATORY' AND v_clean_excuse IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Mandatory activities require an excuse when declining';
  END IF;
  IF p_decision = 'JOINING' THEN
    IF v_activity.max_capacity IS NOT NULL THEN
      SELECT count(*)::integer INTO v_joining_count FROM public.activity_enrollments
      WHERE activity_id = p_activity_id AND student_id <> v_user_id AND decision = 'JOINING';
      IF v_joining_count >= v_activity.max_capacity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Activity capacity is full';
      END IF;
    END IF;
    v_clean_excuse := NULL;
  END IF;

  IF v_activity.type = 'PAID' AND p_decision = 'JOINING' AND COALESCE(v_existing.paid_fee_active, false) = false THEN
    SELECT total_points INTO v_balance FROM public.profiles WHERE id = v_user_id FOR UPDATE;
    IF COALESCE(v_balance, 0) < v_activity.points_value THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Student points are insufficient for this activity';
    END IF;
    v_cycle := COALESCE(v_existing.paid_charge_cycle, 0) + 1;
    INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
    VALUES (v_user_id, -v_activity.points_value, 'رسوم الانضمام: ' || v_activity.title, v_user_id,
            'paid-join:' || p_activity_id || ':' || v_user_id || ':' || v_cycle)
    ON CONFLICT (source_key) DO NOTHING;
    v_balance_changed := FOUND;
  ELSIF v_activity.type = 'PAID' AND p_decision <> 'JOINING' AND COALESCE(v_existing.paid_fee_active, false) THEN
    v_cycle := v_existing.paid_charge_cycle;
    INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
    VALUES (v_user_id, v_activity.points_value, 'استرجاع رسوم النشاط: ' || v_activity.title, v_user_id,
            'paid-refund:' || p_activity_id || ':' || v_user_id || ':' || v_cycle)
    ON CONFLICT (source_key) DO NOTHING;
    v_balance_changed := FOUND;
  ELSE
    v_cycle := COALESCE(v_existing.paid_charge_cycle, 0);
  END IF;

  INSERT INTO public.activity_enrollments (
    activity_id, student_id, decision, excuse_text, paid_charge_cycle, paid_fee_active
  ) VALUES (
    p_activity_id, v_user_id, p_decision, v_clean_excuse, v_cycle,
    v_activity.type = 'PAID' AND p_decision = 'JOINING'
  ) ON CONFLICT (activity_id, student_id) DO UPDATE SET
    decision = EXCLUDED.decision,
    excuse_text = EXCLUDED.excuse_text,
    paid_charge_cycle = EXCLUDED.paid_charge_cycle,
    paid_fee_active = EXCLUDED.paid_fee_active
  RETURNING * INTO v_result;
  IF v_balance_changed THEN PERFORM private.refresh_top_ten_state(true); END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_pending_mandatory_excuses()
RETURNS TABLE (
  enrollment_id uuid, activity_id uuid, activity_title text, student_id uuid,
  student_name text, avatar_path text, excuse_text text, submitted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','ACADEMIC_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to review excuses';
  END IF;
  RETURN QUERY SELECT e.id, a.id, a.title, p.id, p.name, p.avatar_path, e.excuse_text, e.updated_at
  FROM public.activity_enrollments e
  JOIN public.activities a ON a.id = e.activity_id
  JOIN public.profiles p ON p.id = e.student_id
  WHERE a.type = 'MANDATORY' AND e.decision = 'DECLINING'
    AND e.excuse_text IS NOT NULL AND e.excuse_status = 'PENDING'
  ORDER BY e.updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_activity_excuse(
  p_enrollment_id uuid,
  p_status public.excuse_review_status
)
RETURNS public.activity_enrollments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_row public.activity_enrollments; v_actor uuid := (SELECT auth.uid()); v_amount integer;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT','ACADEMIC_HEAD'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Not authorized to review excuses';
  END IF;
  IF p_status NOT IN ('ACCEPTED','PARTIAL','REJECTED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A final excuse decision is required';
  END IF;
  SELECT e.* INTO v_row FROM public.activity_enrollments e
  JOIN public.activities a ON a.id=e.activity_id
  WHERE e.id=p_enrollment_id AND a.type='MANDATORY' AND e.decision='DECLINING' FOR UPDATE OF e;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Pending excuse not found'; END IF;
  IF v_row.excuse_status <> 'PENDING' THEN RETURN v_row; END IF;
  UPDATE public.activity_enrollments SET excuse_status=p_status WHERE id=p_enrollment_id RETURNING * INTO v_row;
  v_amount := CASE p_status WHEN 'PARTIAL' THEN -5 WHEN 'REJECTED' THEN -15 ELSE 0 END;
  IF v_amount <> 0 THEN
    INSERT INTO public.points_ledger(student_id,amount,reason,created_by,source_key)
    VALUES(v_row.student_id,v_amount,
      CASE p_status WHEN 'PARTIAL' THEN 'عذر مقنع جزئياً' ELSE 'عذر غير مقنع' END,
      v_actor,'excuse:'||p_enrollment_id) ON CONFLICT(source_key) DO NOTHING;
    PERFORM private.refresh_top_ten_state(true);
  END IF;
  PERFORM private.enqueue_personal_economy_push(v_row.student_id,'economy:excuse:'||p_enrollment_id,
    'تم تقييم عذرك', CASE p_status WHEN 'ACCEPTED' THEN 'تم قبول عذرك دون خصم نقاط.' WHEN 'PARTIAL' THEN 'تم قبول عذرك جزئياً وخصم 5 نقاط.' ELSE 'لم يُقبل العذر وتم خصم 15 نقطة.' END);
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_public_top_ten()
RETURNS TABLE(rank integer,student_id uuid,student_name text,avatar_path text,total_points integer,current_tier text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT row_number() OVER(ORDER BY p.total_points DESC,p.created_at,p.id)::integer,
         p.id,p.name,p.avatar_path,p.total_points,p.current_tier
  FROM public.profiles p
  WHERE p.status='active' AND EXISTS(SELECT 1 FROM public.student_applications a
    WHERE a.student_user_id=p.id AND a.status='accepted')
  ORDER BY p.total_points DESC,p.created_at,p.id LIMIT 10;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_monthly_star()
RETURNS TABLE(student_id uuid,student_name text,avatar_path text,points_last_30_days bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT p.id,p.name,p.avatar_path,sum(l.amount)::bigint
  FROM public.points_ledger l JOIN public.profiles p ON p.id=l.student_id
  WHERE l.created_at>=now()-interval '30 days' AND p.status='active'
    AND EXISTS(SELECT 1 FROM public.student_applications a WHERE a.student_user_id=p.id AND a.status='accepted')
  GROUP BY p.id,p.name,p.avatar_path,p.created_at
  HAVING sum(l.amount)>0
  ORDER BY sum(l.amount) DESC,p.created_at,p.id LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_own_gamification_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_user uuid:=(SELECT auth.uid()); v_profile public.profiles; v_rank integer; v_recent jsonb;
BEGIN
  IF v_user IS NULL OR NOT (SELECT private.is_accepted_active_student(v_user)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Only accepted students may view gamification';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id=v_user;
  SELECT ranked.rank INTO v_rank FROM (
    SELECT p.id,row_number() OVER(ORDER BY p.total_points DESC,p.created_at,p.id)::integer rank
    FROM public.profiles p WHERE p.status='active' AND EXISTS(
      SELECT 1 FROM public.student_applications a WHERE a.student_user_id=p.id AND a.status='accepted')) ranked
  WHERE ranked.id=v_user;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'amount',q.amount,'reason',q.reason,'createdAt',q.created_at)
    ORDER BY q.created_at DESC),'[]'::jsonb) INTO v_recent
  FROM (SELECT id,amount,reason,created_at FROM public.points_ledger WHERE student_id=v_user ORDER BY created_at DESC LIMIT 20) q;
  RETURN jsonb_build_object('studentId',v_user,'totalPoints',v_profile.total_points,
    'currentTier',v_profile.current_tier,'rank',v_rank,'isTopTen',v_rank<=10,'recentLedger',v_recent);
END;
$function$;

-- Delivery keeps accepted-student filtering and additionally scopes PERSONAL
-- notifications to their intended user.
DROP FUNCTION IF EXISTS public.list_eligible_push_subscriptions_for_delivery();
CREATE OR REPLACE FUNCTION public.list_eligible_push_subscriptions_for_delivery(p_notification_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,user_id uuid,endpoint text,p256dh text,auth_key text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $function$
  SELECT s.id,s.user_id,s.endpoint,s.p256dh,s.auth_key
  FROM public.push_subscriptions s
  JOIN public.profiles p ON p.id=s.user_id AND p.status='active'
  LEFT JOIN public.push_notifications n ON n.id=p_notification_id
  WHERE s.is_active
    AND EXISTS(SELECT 1 FROM public.student_applications a WHERE a.student_user_id=s.user_id AND a.status='accepted')
    AND (p_notification_id IS NULL OR n.target_user_id IS NULL OR n.target_user_id=s.user_id);
$function$;

SELECT private.refresh_top_ten_state(false);

REVOKE EXECUTE ON FUNCTION public.set_own_activity_enrollment(uuid,public.activity_decision,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.list_pending_mandatory_excuses() FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.review_activity_excuse(uuid,public.excuse_review_status) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.list_activity_evaluations() FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.save_activity_attendance(uuid,uuid,public.attendance_status) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_activity_evaluation(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.list_task_evaluations() FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.save_task_completion(uuid,uuid,public.task_completion_status) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_task_evaluation(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.list_member_points() FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.adjust_member_points(uuid,integer,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.get_active_economy_season() FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.end_economy_season(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.list_public_top_ten() FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.get_public_monthly_star() FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.get_own_gamification_summary() FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.list_eligible_push_subscriptions_for_delivery(uuid) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.set_own_activity_enrollment(uuid,public.activity_decision,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_mandatory_excuses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_activity_excuse(uuid,public.excuse_review_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_activity_evaluations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_activity_attendance(uuid,uuid,public.attendance_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_activity_evaluation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_task_evaluations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_task_completion(uuid,uuid,public.task_completion_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_task_evaluation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_member_points() TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_member_points(uuid,integer,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_economy_season() TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_economy_season(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_gamification_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_top_ten() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_monthly_star() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_eligible_push_subscriptions_for_delivery(uuid) TO service_role;

COMMIT;
