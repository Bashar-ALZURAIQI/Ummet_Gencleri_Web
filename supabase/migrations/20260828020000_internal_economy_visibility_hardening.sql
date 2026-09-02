BEGIN;

DROP POLICY IF EXISTS "activities_accepted_or_admin_select"
  ON public.activities;
CREATE POLICY "activities_accepted_or_admin_select"
ON public.activities FOR SELECT TO authenticated
USING (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
  OR (
    COALESCE((
      SELECT authz.is_accepted_student
      FROM private.current_internal_economy_authorization AS authz
    ), false)
    AND (
      activities.deadline > now()
      OR EXISTS (
        SELECT 1
        FROM public.activity_enrollments AS enrollment
        WHERE enrollment.activity_id = activities.id
          AND enrollment.student_id = (SELECT auth.uid())
      )
    )
  )
);

DROP POLICY IF EXISTS "tasks_accepted_or_admin_select"
  ON public.tasks;
CREATE POLICY "tasks_accepted_or_admin_select"
ON public.tasks FOR SELECT TO authenticated
USING (
  COALESCE((
    SELECT authz.can_manage
    FROM private.current_internal_economy_authorization AS authz
  ), false)
  OR (
    COALESCE((
      SELECT authz.is_accepted_student
      FROM private.current_internal_economy_authorization AS authz
    ), false)
    AND (
      (
        tasks.status = 'OPEN'::public.task_status
        AND tasks.deadline > now()
      )
      OR EXISTS (
        SELECT 1
        FROM public.task_enrollments AS enrollment
        WHERE enrollment.task_id = tasks.id
          AND enrollment.student_id = (SELECT auth.uid())
      )
    )
  )
);

-- No DELETE policy is intentional. Activities close by deadline, tasks by
-- status/deadline, and enrollment/assessment rows remain durable audit history.

COMMIT;
