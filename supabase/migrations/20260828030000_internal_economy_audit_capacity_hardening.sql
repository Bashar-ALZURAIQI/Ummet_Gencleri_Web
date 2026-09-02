BEGIN;

CREATE INDEX activity_enrollments_joining_capacity_idx
  ON public.activity_enrollments (activity_id)
  WHERE decision = 'JOINING'::public.activity_decision;

CREATE OR REPLACE VIEW private.activity_joining_capacity
WITH (security_barrier = true)
AS
SELECT
  enrollment.activity_id,
  count(*)::integer AS joining_count
FROM public.activity_enrollments AS enrollment
WHERE enrollment.decision = 'JOINING'::public.activity_decision
GROUP BY enrollment.activity_id;

REVOKE ALL ON TABLE private.activity_joining_capacity
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.activity_joining_capacity TO authenticated;

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
      EXISTS (
        SELECT 1
        FROM public.activity_enrollments AS enrollment
        WHERE enrollment.activity_id = activities.id
          AND enrollment.student_id = (SELECT auth.uid())
      )
      OR (
        activities.deadline > now()
        AND (
          activities.max_capacity IS NULL
          OR COALESCE((
            SELECT capacity.joining_count
            FROM private.activity_joining_capacity AS capacity
            WHERE capacity.activity_id = activities.id
          ), 0) < activities.max_capacity
        )
      )
    )
  )
);

-- Enrollment and assessment records are durable history. Parent/member hard
-- deletion is rejected once such history exists; the application uses status
-- and deadline transitions instead of destructive lifecycle operations.
ALTER TABLE public.activity_enrollments
  DROP CONSTRAINT activity_enrollments_activity_id_fkey,
  ADD CONSTRAINT activity_enrollments_activity_id_fkey
    FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE RESTRICT;
ALTER TABLE public.activity_enrollments
  DROP CONSTRAINT activity_enrollments_student_id_fkey,
  ADD CONSTRAINT activity_enrollments_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.task_enrollments
  DROP CONSTRAINT task_enrollments_task_id_fkey,
  ADD CONSTRAINT task_enrollments_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE RESTRICT;
ALTER TABLE public.task_enrollments
  DROP CONSTRAINT task_enrollments_student_id_fkey,
  ADD CONSTRAINT task_enrollments_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

REVOKE DELETE ON TABLE public.activities FROM service_role;
REVOKE DELETE ON TABLE public.activity_enrollments FROM service_role;
REVOKE DELETE ON TABLE public.tasks FROM service_role;
REVOKE DELETE ON TABLE public.task_enrollments FROM service_role;

COMMIT;
