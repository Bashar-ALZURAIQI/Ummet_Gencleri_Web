# Unified Activities and Student Engine Design

## Scope

Phase two keeps the existing public `ProgramsPage` route and event cards. It adds authenticated student decisions, durable Supabase enrollment, remaining-capacity information, and voluntary tasks without creating a second activities route. Attendance, excuse review, points awards, and honor-board UI remain out of scope.

## Architecture

The published CMS `events` array remains the source for public presentation fields such as image, category, date, location, and homepage visibility. Every interactive event is linked to `public.activities` through a stable `public_event_id`. Existing published events are backfilled as optional, zero-point activities so current images and content remain intact.

An authenticated accepted student loads a safe activity-board projection through a hardened PostgreSQL RPC. The projection returns only public activity data, aggregate joining count, the caller's own decision and excuse, and the caller's current points. It never exposes another student's identity or excuse. A similar RPC returns voluntary tasks with aggregate enrollment counts and the caller's own enrollment.

Student mutations use the existing `set_own_activity_enrollment` and `register_for_task` RPCs. The UI never writes directly to enrollment tables. After every successful mutation, it reloads authoritative rows from Supabase so refresh and concurrent capacity changes remain correct.

## Conditional Rendering

- Guest: the existing card shows `سجل الآن` and routes to login.
- Non-accepted authenticated account: the card stays locked by the existing membership gate.
- Accepted student: the classic button is replaced by `سأنضم` and `لن أنضم`, deadline, type, cost/reward, and remaining capacity.
- A mandatory decline opens an excuse modal and cannot submit blank text.
- An optional decline submits with a null excuse.
- Joining always sends a null excuse, clearing any previous decline excuse.
- Paid joining is disabled when `total_points < points_value`.
- Deadline expiry or exhausted capacity disables joining. A student may still see their own confirmed decision.

## Existing Page and Admin Integration

`EventCard` receives an optional server activity projection. `ProgramsPage` owns loading, mutation feedback, and the mandatory-excuse modal while preserving its current filters, CMS editor, images, and layout.

The existing admin `EventsTab` remains the only administrative activities location. Its current event form gains activity type, points value, maximum capacity, and deadline. Saving also upserts the linked internal activity through a manager-only RPC. A voluntary-task creation section is rendered inside the same tab, not as a new route or navigation entry.

`StudentDashboard` keeps the existing `activities` tab, but its activity list is loaded from the caller's real `activity_enrollments`. A new `tasks` tab renders the task board and uses the existing registration RPC.

## Error Handling

All Supabase errors are logged with their safe operation context. User-visible text is mapped to Arabic messages for permission, deadline, capacity, points, validation, and connectivity failures. Modals close only after successful server confirmation. Success and error feedback use a shared transient toast component.

## Security

All board RPCs verify `auth.uid()`, active profile status, and an accepted application. Manager mutations derive `created_by` from `auth.uid()` and verify one of `PRESIDENT`, `ACADEMIC_HEAD`, or `AUDIT_HEAD`. Functions use `SECURITY DEFINER`, an empty search path, explicit schema qualification, and revoked `PUBLIC` execution.

## Verification

Pure policy tests cover guest/login routing, deadline/full states, paid balance, mandatory excuse requirements, decision replacement, and excuse clearing. Repository tests cover RPC payloads, response validation, and server error mapping. SQL behavior tests cover privacy, accepted-student access, aggregate counts, and manager-only creation. Full tests, TypeScript, lint, and production build must pass.
