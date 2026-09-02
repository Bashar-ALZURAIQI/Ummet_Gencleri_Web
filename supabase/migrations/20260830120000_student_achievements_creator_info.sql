BEGIN;

-- Keep the student-facing summary private to the authenticated accepted student,
-- while enriching each ledger row with the visible identity of its creator.
CREATE OR REPLACE FUNCTION public.get_own_gamification_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_profile public.profiles;
  v_rank integer;
  v_recent jsonb;
BEGIN
  IF v_user IS NULL OR NOT (SELECT private.is_accepted_active_student(v_user)) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only accepted students may view gamification';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user;

  SELECT ranked.rank
  INTO v_rank
  FROM (
    SELECT
      profile.id,
      row_number() OVER (
        ORDER BY profile.total_points DESC, profile.created_at, profile.id
      )::integer AS rank
    FROM public.profiles AS profile
    WHERE profile.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.student_applications AS application
        WHERE application.student_user_id = profile.id
          AND application.status = 'accepted'
      )
  ) AS ranked
  WHERE ranked.id = v_user;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', entry.id,
        'amount', entry.amount,
        'reason', entry.reason,
        'createdAt', entry.created_at,
        'createdByName', entry.created_by_name,
        'createdByRole', entry.created_by_role,
        'createdByIsSelf', entry.created_by_is_self
      )
      ORDER BY entry.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent
  FROM (
    SELECT
      ledger.id,
      ledger.amount,
      ledger.reason,
      ledger.created_at,
      NULLIF(btrim(actor.name), '') AS created_by_name,
      assignment.position_key AS created_by_role,
      COALESCE(ledger.created_by = v_user, false) AS created_by_is_self
    FROM public.points_ledger AS ledger
    LEFT JOIN public.profiles AS actor
      ON actor.id = ledger.created_by
    LEFT JOIN public.executive_assignments AS assignment
      ON assignment.user_id = ledger.created_by
    WHERE ledger.student_id = v_user
    ORDER BY ledger.created_at DESC
    LIMIT 20
  ) AS entry;

  RETURN jsonb_build_object(
    'studentId', v_user,
    'totalPoints', v_profile.total_points,
    'currentTier', v_profile.current_tier,
    'rank', v_rank,
    'isTopTen', v_rank <= 10,
    'recentLedger', v_recent
  );
END;
$function$;

COMMIT;
