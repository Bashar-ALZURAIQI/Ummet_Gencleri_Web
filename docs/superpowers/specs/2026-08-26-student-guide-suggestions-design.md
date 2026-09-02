# Student Guide Suggestions Design

## Objective

Add a public suggestion channel dedicated to the student guide without reusing or changing contact messages, member suggestions, or join applications. Visitors and signed-in users may submit; only the current president and academic head may review or manage submissions.

## Architecture

`public.guide_suggestions` is the sole source of truth. It stores `student_name`, `subject`, `description`, a constrained administrative `status`, and `created_at`. The four statuses are `PENDING`, `REVIEWING`, `IMPLEMENTED`, and `REJECTED`.

The browser uses a dedicated repository/service. Public submission inserts only the three user-entered columns, so PostgreSQL supplies `PENDING`, the UUID, and creation time. Administrative reads, status updates, and deletions use the same repository but depend on database RLS for final authorization.

The public guide receives a self-contained callout and modal. The administration dashboard receives a self-contained review panel and a tab visible only to `PRESIDENT` and the application's authoritative academic role, `ACADEMIC_HEAD`.

## Security

- RLS is enabled on `guide_suggestions`.
- `anon` and `authenticated` receive column-level INSERT permission only for `student_name`, `subject`, and `description`.
- The public insert policy requires the resulting status to remain `PENDING`.
- Only authenticated users whose current `private.current_user_authorization.position_key` is `PRESIDENT` or `ACADEMIC_HEAD` may select, update, or delete.
- Authenticated administrators receive UPDATE permission only for `status`; public input fields are immutable after submission.
- Text is trimmed and constrained in both frontend validation and PostgreSQL checks.
- The new table receives explicit Data API grants; no privilege is inherited from `PUBLIC`.

## User Experience

The guide callout says: “هل لديك إضافة أو تصحيح؟ اقترح تعديلاً”. The modal requires student name, subject, and details. It displays validation errors, a submitting state, a clear server error, and a thank-you confirmation. The modal closes only after a successful insert.

The administrative panel lists newest suggestions first, supports filtering by the four statuses, and shows name, subject, description, creation time, and current status. Authorized users can move a row to review, implemented, or rejected, and can delete it after confirmation. Loading, empty, success, and failure states are explicit.

## Isolation

No existing table, context state, service, form handler, route, or RLS policy for `contact_messages`, existing member suggestions, or student applications is changed. The feature is introduced through new files plus two narrow render points in `StudentGuide.tsx` and `AdminDashboard.tsx`.

## Verification

Automated tests cover role gating, validation, row mapping, submission payload isolation, administrative operations, migration grants/RLS/status constraints, and UI wiring. Final verification runs the full test suite, TypeScript, lint, build, migration application, and live role-based smoke tests.
