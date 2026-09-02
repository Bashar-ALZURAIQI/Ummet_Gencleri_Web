BEGIN;

CREATE OR REPLACE FUNCTION public.adjust_member_points(
  p_student_id uuid,
  p_amount integer,
  p_reason text,
  p_request_id uuid
)
RETURNS public.points_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_result public.points_ledger;
  v_reason text := btrim(p_reason);
  v_inserted boolean;
BEGIN
  IF NOT (SELECT private.phase_three_has_role(ARRAY['PRESIDENT'])) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the president may adjust points';
  END IF;
  IF p_amount = 0 OR abs(p_amount) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A signed non-zero amount is required';
  END IF;
  IF char_length(v_reason) < 3 OR char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A meaningful reason is required';
  END IF;
  IF NOT (SELECT private.is_accepted_active_student(p_student_id)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Accepted student not found';
  END IF;

  INSERT INTO public.points_ledger (student_id, amount, reason, created_by, source_key)
  VALUES (p_student_id, p_amount, v_reason, v_actor, 'manual:' || p_request_id)
  ON CONFLICT (source_key) DO NOTHING
  RETURNING * INTO v_result;
  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT * INTO v_result
    FROM public.points_ledger
    WHERE source_key = 'manual:' || p_request_id;

    IF v_result.student_id IS DISTINCT FROM p_student_id
       OR v_result.amount IS DISTINCT FROM p_amount
       OR v_result.reason IS DISTINCT FROM v_reason
       OR v_result.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Manual adjustment request id was reused with a different payload';
    END IF;
    RETURN v_result;
  END IF;

  PERFORM private.refresh_top_ten_state(true);
  PERFORM private.enqueue_personal_economy_push(
    p_student_id,
    'economy:manual:' || p_request_id,
    'تم تحديث رصيد نقاطك',
    'تم ' || CASE WHEN p_amount > 0 THEN 'إضافة ' ELSE 'خصم ' END
      || abs(p_amount) || ' نقطة. السبب: ' || v_reason
  );
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.adjust_member_points(uuid, integer, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_member_points(uuid, integer, text, uuid)
  TO authenticated;

COMMIT;
