-- Behavioral verification for phase three. All fixture rows and ledger entries
-- are rolled back, leaving the official database unchanged.
BEGIN;

DO $security_closure$
BEGIN
  IF has_function_privilege('authenticated','public.record_points_transaction(uuid,integer,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.review_activity_enrollment(uuid,uuid,public.excuse_review_status,public.attendance_status)','EXECUTE')
     OR has_function_privilege('authenticated','public.review_task_enrollment(uuid,uuid,public.task_completion_status)','EXECUTE')
     OR has_function_privilege('authenticated','public.set_member_tier(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'LEGACY_PHASE_THREE_BYPASS_STILL_OPEN';
  END IF;
  IF position('FOR UPDATE' in pg_get_functiondef('public.save_activity_attendance(uuid,uuid,public.attendance_status)'::regprocedure)) = 0
     OR position('FOR UPDATE' in pg_get_functiondef('public.save_task_completion(uuid,uuid,public.task_completion_status)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'EVALUATION_FINALIZATION_LOCK_MISSING';
  END IF;
END $security_closure$;

SELECT set_config('phase3.student_id',(
  SELECT p.id::text FROM public.profiles p JOIN public.student_applications a ON a.student_user_id=p.id AND a.status='accepted'
  WHERE p.status='active' AND NOT EXISTS(SELECT 1 FROM public.executive_assignments e WHERE e.user_id=p.id)
  ORDER BY p.created_at LIMIT 1),true);
SELECT set_config('phase3.president_id',(SELECT user_id::text FROM public.executive_assignments WHERE position_key='PRESIDENT'),true);
SELECT set_config('phase3.media_id',(SELECT user_id::text FROM public.executive_assignments WHERE position_key='MEDIA_HEAD'),true);

DO $fixtures$
DECLARE s uuid:=current_setting('phase3.student_id')::uuid; p uuid:=current_setting('phase3.president_id')::uuid;
  mandatory_id uuid:=gen_random_uuid(); activity_id uuid:=gen_random_uuid(); paid_id uuid:=gen_random_uuid(); task_id uuid:=gen_random_uuid(); season_id uuid;
BEGIN
  IF s IS NULL OR p IS NULL THEN RAISE EXCEPTION 'PHASE3_FIXTURE_MISSING'; END IF;
  INSERT INTO public.points_ledger(student_id,amount,reason,created_by,source_key)
    VALUES(s,100,'verification phase three balance',p,'verification:phase3:opening');
  INSERT INTO public.activities(id,title,description,created_by,type,points_value,max_capacity,deadline) VALUES
    (mandatory_id,'verification mandatory','rollback fixture',p,'MANDATORY',20,20,now()+interval '1 day'),
    (activity_id,'verification attendance','rollback fixture',p,'OPTIONAL',7,20,now()+interval '1 day'),
    (paid_id,'verification paid','rollback fixture',p,'PAID',10,20,now()+interval '1 day');
  INSERT INTO public.tasks(id,title,description,points_reward,created_by,required_students,deadline)
    VALUES(task_id,'verification task','rollback fixture',9,p,5,now()+interval '1 day');
  PERFORM set_config('phase3.mandatory_id',mandatory_id::text,true); PERFORM set_config('phase3.activity_id',activity_id::text,true);
  PERFORM set_config('phase3.paid_id',paid_id::text,true); PERFORM set_config('phase3.task_id',task_id::text,true);
  SELECT id INTO season_id FROM public.economy_seasons WHERE ended_at IS NULL;
  PERFORM set_config('phase3.season_id',season_id::text,true);
END $fixtures$;

SELECT set_config('request.jwt.claim.sub',current_setting('phase3.student_id'),true); SET LOCAL ROLE authenticated;
SELECT public.set_own_activity_enrollment(current_setting('phase3.paid_id')::uuid,'JOINING',NULL);
SELECT public.set_own_activity_enrollment(current_setting('phase3.paid_id')::uuid,'DECLINING',NULL);
SELECT public.set_own_activity_enrollment(current_setting('phase3.paid_id')::uuid,'JOINING',NULL);
SELECT public.set_own_activity_enrollment(current_setting('phase3.mandatory_id')::uuid,'DECLINING','عذر تحقق مؤقت');
SELECT public.set_own_activity_enrollment(current_setting('phase3.activity_id')::uuid,'JOINING',NULL);
SELECT public.register_for_task(current_setting('phase3.task_id')::uuid);
DO $student_summary_creator$
DECLARE v_entry jsonb;
BEGIN
  v_entry := public.get_own_gamification_summary()->'recentLedger'->0;
  IF v_entry IS NULL
     OR NOT (v_entry ? 'createdByName')
     OR NOT (v_entry ? 'createdByRole')
     OR NOT (v_entry ? 'createdByIsSelf') THEN
    RAISE EXCEPTION 'GAMIFICATION_CREATOR_INFO_MISSING';
  END IF;
END $student_summary_creator$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',current_setting('phase3.president_id'),true); SET LOCAL ROLE authenticated;
SELECT public.review_activity_excuse((SELECT id FROM public.activity_enrollments WHERE activity_id=current_setting('phase3.mandatory_id')::uuid),'PARTIAL');
SELECT public.review_activity_excuse((SELECT id FROM public.activity_enrollments WHERE activity_id=current_setting('phase3.mandatory_id')::uuid),'PARTIAL');
SELECT public.save_activity_attendance(current_setting('phase3.activity_id')::uuid,current_setting('phase3.student_id')::uuid,'LATE');
SELECT public.finalize_activity_evaluation(current_setting('phase3.activity_id')::uuid);
SELECT public.finalize_activity_evaluation(current_setting('phase3.activity_id')::uuid);
SELECT public.save_task_completion(current_setting('phase3.task_id')::uuid,current_setting('phase3.student_id')::uuid,'PERFECT');
SELECT public.finalize_task_evaluation(current_setting('phase3.task_id')::uuid);
SELECT public.finalize_task_evaluation(current_setting('phase3.task_id')::uuid);
SELECT public.adjust_member_points(current_setting('phase3.student_id')::uuid,3,'verification manual adjustment','99999999-9999-4999-8999-999999999999');
SELECT public.adjust_member_points(current_setting('phase3.student_id')::uuid,3,'verification manual adjustment','99999999-9999-4999-8999-999999999999');
DO $manual_conflict$ BEGIN
  BEGIN
    PERFORM public.adjust_member_points(current_setting('phase3.student_id')::uuid,4,'different retry payload','99999999-9999-4999-8999-999999999999');
    RAISE EXCEPTION 'CONFLICTING_MANUAL_RETRY_UNEXPECTEDLY_SUCCEEDED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $manual_conflict$;

DO $assertions$
DECLARE paid_count integer; excuse_count integer; activity_count integer; task_count integer; manual_count integer;
BEGIN
  SELECT count(*) INTO paid_count FROM public.points_ledger
  WHERE source_key LIKE 'paid-%:'||current_setting('phase3.paid_id')||':'||current_setting('phase3.student_id')||':%';
  SELECT count(*) INTO excuse_count FROM public.points_ledger WHERE source_key LIKE 'excuse:%' AND student_id=current_setting('phase3.student_id')::uuid;
  SELECT count(*) INTO activity_count FROM public.points_ledger WHERE source_key='activity-result:'||current_setting('phase3.activity_id')||':'||current_setting('phase3.student_id');
  SELECT count(*) INTO task_count FROM public.points_ledger WHERE source_key='task-result:'||current_setting('phase3.task_id')||':'||current_setting('phase3.student_id');
  SELECT count(*) INTO manual_count FROM public.points_ledger WHERE source_key='manual:99999999-9999-4999-8999-999999999999';
  IF paid_count<>3 THEN RAISE EXCEPTION 'PAID_CYCLES_FAILED:%',paid_count; END IF;
  IF excuse_count<>1 THEN RAISE EXCEPTION 'EXCUSE_IDEMPOTENCY_FAILED'; END IF;
  IF activity_count<>1 OR task_count<>1 OR manual_count<>1 THEN RAISE EXCEPTION 'FINALIZATION_IDEMPOTENCY_FAILED'; END IF;
END $assertions$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',current_setting('phase3.media_id'),true); SET LOCAL ROLE authenticated;
DO $media_denial$ BEGIN
  BEGIN PERFORM public.list_member_points(); RAISE EXCEPTION 'MEDIA_UNEXPECTEDLY_AUTHORIZED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $media_denial$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',current_setting('phase3.president_id'),true); SET LOCAL ROLE authenticated;
SELECT public.end_economy_season(current_setting('phase3.season_id')::uuid,'verification next season');
SELECT public.end_economy_season(current_setting('phase3.season_id')::uuid,'verification next season');
DO $season_assertion$ DECLARE v_season public.economy_seasons; BEGIN
  IF EXISTS(SELECT 1 FROM public.list_member_points() WHERE total_points<>0) THEN
    RAISE EXCEPTION 'SEASON_BALANCING_FAILED';
  END IF;
  v_season:=public.get_active_economy_season();
  IF v_season.id IS NULL OR v_season.label<>'verification next season' THEN RAISE EXCEPTION 'SEASON_RETRY_FAILED'; END IF;
END $season_assertion$;
RESET ROLE;

ROLLBACK;
SELECT 'PHASE3_TEST_OK' AS result;
