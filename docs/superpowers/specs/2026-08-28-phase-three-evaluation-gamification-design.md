# Phase Three Evaluation, Oversight, and Gamification Design

## Purpose

Complete the internal economy by adding secure administrative evaluation, immutable point distribution, season resets, rankings, badges, public recognition, and accepted-student Web Push notifications. The existing activity/task enrollment flows remain the source of participation intent.

## Non-negotiable rules

- All point-changing operations execute inside PostgreSQL RPC transactions.
- `points_ledger` remains append-only; `profiles.total_points` changes only through its existing ledger trigger.
- Every generated movement has a deterministic `source_key` so retries cannot duplicate points.
- Browser code never supplies `created_by`, student ownership, calculated rewards, final rank, or notification recipients as trusted values.
- Authorization is derived from `auth.uid()` and `executive_assignments`, never email or user metadata.
- The existing project role `AUDIT_HEAD` is the oversight role. No `OBSERVER` role is introduced.
- Web Push remains limited to active, finally accepted students with an active subscription.

## Role matrix

| Capability | PRESIDENT | ACADEMIC_HEAD | AUDIT_HEAD | Student |
|---|---:|---:|---:|---:|
| Read and review pending mandatory excuses | Yes | Yes | No | Own result only |
| Read attendance/task evaluation boards | Yes | No | Yes | No |
| Save attendance/task draft evaluations | Yes | No | Yes | No |
| Close and distribute an activity/task | Yes | No | Yes | No |
| Read the complete member points table | Yes | Yes | Yes | Own row only |
| Manual point adjustment | Yes | No | No | No |
| End a season | Yes | No | No | No |
| Read public Top 10/monthly star | Yes | Yes | Yes | Yes/public |

## Database additions

### Evaluation lifecycle fields

`activities` gains `evaluation_closed_at` and `evaluation_closed_by`. `tasks` gains the same fields. A null timestamp means evaluation remains open. Closing is irreversible through the Data API.

`activity_enrollments` keeps the existing `excuse_status` and `attendance_status` enums. `task_enrollments` keeps `completion_status`. Draft evaluation RPCs update only those administrative fields and only while the parent is open.

### Paid activity fee cycles

`activity_enrollments` gains `paid_charge_cycle integer default 0` and `paid_fee_active boolean default false`.

- Changing to `JOINING` for a `PAID` activity locks the activity, enrollment, and profile balance, verifies sufficient points, increments the cycle, and inserts a negative ledger row with source `paid-join:<activity>:<student>:<cycle>`.
- Changing away from `JOINING` before the deadline inserts an equal refund with source `paid-refund:<activity>:<student>:<cycle>` and clears the active flag.
- Rejoining creates a new cycle, preserving immutable debit/refund history.
- Paid activities produce no attendance reward; attendance can still be recorded for administrative history.

### Seasons

`economy_seasons` stores `id`, `label`, `started_at`, `ended_at`, `ended_by`, and timestamps. Exactly one season may be active.

Ending a season locks the active season and accepted profiles. For each non-zero balance it inserts `-total_points` into the ledger using `season-close:<season>:<student>`. The existing ledger trigger produces a zero balance. The season is closed and the next season is created in the same transaction. Historical ledger rows are never changed or deleted.

### Top-10 membership state

`top_ten_membership_state` stores one row per accepted active student with the latest `is_top_ten`, `rank`, and transition timestamp. A private refresh function recalculates ranking after point-changing RPCs. It enqueues a notification only for a false-to-true transition. Initial backfill and season closing refresh state without sending entry notifications.

## RPC contracts

### Excuses

- `list_pending_mandatory_excuses()` returns only pending excuses for mandatory activities with safe student display fields.
- `review_activity_excuse(p_enrollment_id, p_status)` accepts `ACCEPTED`, `PARTIAL`, or `REJECTED`; it rejects already-reviewed rows.
- `PARTIAL` inserts `-5`; `REJECTED` inserts `-15`; `ACCEPTED` inserts no ledger row.
- Source keys are `excuse:<enrollment>:partial` and `excuse:<enrollment>:rejected`.
- A personal Push notification is enqueued after the decision.

### Attendance and task completion

- `list_open_activity_evaluations()` returns joining students grouped by open activity.
- `set_activity_attendance(p_enrollment_id, p_status)` saves a draft status for `ON_TIME`, `LATE`, `VERY_LATE`, or `ABSENT`.
- `finalize_activity_evaluation(p_activity_id)` locks the activity and all joining enrollments, requires every joining enrollment to have a status, writes all ledger movements, marks the activity closed, and refreshes Top 10.
- Rewards use nearest-integer rounding: 100%, 75%, and 30% of `points_value`. `ABSENT` on `MANDATORY` inserts `-20`; other absence inserts no movement. `PAID` inserts no attendance reward.
- Source keys use `activity-result:<activity>:<student>`.

- `list_open_task_evaluations()` returns enrolled students grouped by open task.
- `set_task_completion(p_enrollment_id, p_status)` saves `PERFECT`, `PARTIAL`, or `FAILED`.
- `finalize_task_evaluation(p_task_id)` requires all enrolled students to have final statuses, inserts 100%, 50%, or no reward, marks the task `CLOSED`, records closure identity/time, and refreshes Top 10.
- Source keys use `task-result:<task>:<student>`.

All finalize RPCs are idempotent: an already-closed parent returns its confirmed state without inserting another movement.

### Points administration

- `list_member_points_admin()` returns accepted active students, total points, computed tier, and warning state (`total_points <= -50`).
- `adjust_member_points(p_request_id, p_student_id, p_amount, p_reason)` is president-only. The UI creates one UUID and retains it across retries; the server validates it, rejects zero/out-of-range amounts and blank reasons, writes `manual:<request_uuid>` as source, returns the existing confirmed movement on an identical retry, enqueues one personal Push notification, and refreshes Top 10.
- `end_economy_season(p_season_id, p_next_label)` is president-only. The UI passes the active season id; retrying a confirmed close returns that same closed season and never closes the newly-created season.

### Recognition projections

- `get_public_leaderboard()` returns up to ten accepted active students ordered by `total_points DESC`, then stable profile creation/id tie-breakers. It exposes only name, avatar, points, rank, and tier.
- `get_monthly_star()` sums net ledger amounts from the last 30 days and returns the highest accepted active student using stable tie-breakers. It returns an empty result when the best net total is not positive.
- `get_own_gamification_summary()` returns the authenticated accepted student's total points, overall rank, tier, recent ledger rows, and whether they are in Top 10.

## Tier rules

- `total_points <= 100`: `BRONZE`, displayed as «عضو مبادر 🥉».
- `101..300`: `SILVER`, displayed as «عضو فعال 🥈».
- `> 300`: `GOLD`, displayed as «عضو نخبوي 🥇».

The existing ledger-to-profile trigger is extended to update `total_points` and derive `current_tier` from the resulting balance in the same statement, so the two fields cannot drift.

## Notification design

The existing durable `push_notifications` outbox and Edge Function remain unchanged. New private SQL helpers insert targeted notification rows only after the corresponding administrative transaction succeeds.

Notification events:

- Excuse reviewed: includes the decision and any deduction.
- Manual adjustment: includes signed amount and the required reason.
- Entered Top 10: includes the new rank and links to the student portal.

Notifications are not sent for draft attendance/completion edits, failed transactions, season balancing, or non-accepted users.

## Frontend architecture

### Domain and service layer

A dedicated phase-three repository strictly maps RPC responses and converts transport/database errors to Arabic results. Pure domain functions calculate labels, draft completeness, tier display, warning state, and button availability. React components never calculate authoritative ledger amounts.

### Administration dashboard

The existing `AdminDashboard` gains role-gated tabs:

- «إدارة الأعذار»: `PRESIDENT`, `ACADEMIC_HEAD`.
- «الرقابة والتحضير»: `PRESIDENT`, `AUDIT_HEAD`.
- «إدارة نقاط الأعضاء»: `PRESIDENT`, `ACADEMIC_HEAD`, `AUDIT_HEAD`; mutation controls render only for `PRESIDENT`.

Reviewed excuses disappear from the pending view after server confirmation. Evaluation boards keep drafts visible until a confirmed finalize response, then move to an archived/closed presentation. Every mutation uses a busy state, success/error toast, and logs structured server failures to the console.

### Student portal

Accepted students receive a gamification summary card showing points, rank, tier badge, Top-10 state, and recent immutable ledger movements. No other student state gains access.

### Public homepage

The homepage receives two read-only components: Top 10 and Monthly Star. Only safe public profile name/avatar fields are shown. Empty states are explicit and do not invent mock rankings.

## Error handling and concurrency

- Parent rows and relevant enrollments are locked with `FOR UPDATE` during review/finalization.
- Deterministic source keys and unique constraints make retries safe.
- Finalization fails with an actionable error when a draft is missing.
- A confirmed server response is required before UI removal, closure, or point display refresh.
- Privileged RPC execution is revoked from `PUBLIC`, `anon`, and `service_role`, then granted only to `authenticated`. Public recognition RPCs are separately revoked by default and explicitly granted to `anon` and `authenticated`; they return a fixed safe projection and accept no identity/filter arguments.
- Every `SECURITY DEFINER` function pins `search_path = ''`. Privileged functions perform an explicit UUID/assignment check; the two anonymous recognition functions are the documented exception and expose only safe leaderboard fields.

## Verification

- Contract tests cover schema, grants, role checks, source-key idempotency, and Push enqueue restrictions.
- Pure TypeScript tests cover tiers, warnings, rank labels, reward display, and draft completeness.
- Repository tests cover strict mapping, exact RPC payloads, malformed responses, and thrown transports.
- Live SQL tests run in transactions and roll back fixtures. They verify excuse deductions, activity/task finalization, retry idempotency, paid debit/refund/rejoin cycles, manual adjustment, season balancing, Top-10 transitions, and unauthorized-role rejection.
- Final validation runs TypeScript, ESLint, the complete Node test suite, production build, and a local browser smoke test.
