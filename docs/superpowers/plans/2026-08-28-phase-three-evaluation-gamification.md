# Phase Three Evaluation and Gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver secure excuse review, attendance/task finalization, member point administration, seasons, rankings, recognition UI, and accepted-student Web Push notifications.

**Architecture:** PostgreSQL RPCs own authorization, locking, calculations, idempotency, ledger insertion, season closure, and notification enqueueing. A strict TypeScript repository maps safe RPC projections, while focused React panels integrate into the existing administration dashboard, student portal, and homepage.

**Tech Stack:** PostgreSQL/Supabase RLS and RPCs, React 18, TypeScript, Supabase JS, Lucide, Node test runner, ESLint, Vite.

**Spec:** `docs/superpowers/specs/2026-08-28-phase-three-evaluation-gamification-design.md`

## Global Constraints

- Use the existing `AUDIT_HEAD` role; never introduce `OBSERVER`.
- Keep `points_ledger` append-only and update balances only through ledger inserts.
- Derive authority from `auth.uid()` plus `executive_assignments`; never trust email or metadata roles.
- Keep Web Push limited to active, accepted students.
- Pin every privileged function with `SET search_path = ''`, revoke default execution, and grant only the exact API surface.
- Do not add Git commits or branches; the user explicitly requested direct workspace/database work.

---

### Task 1: Schema and SQL contract for evaluation, seasons, and paid fees

**Files:**
- Create: `supabase/migrations/20260828180000_phase_three_evaluation_gamification.sql`
- Create: `tests/phaseThreeEconomyMigration.test.mjs`
- Modify: `src/domain/internalEconomyTypes.ts`

**Interfaces:**
- Produces tables/columns: `evaluation_closed_at`, `evaluation_closed_by`, `paid_charge_cycle`, `paid_fee_active`, `economy_seasons`, `top_ten_membership_state`.
- Produces RPC names used by all later tasks exactly as specified in the design.

- [ ] **Step 1: Write the failing migration contract test**

```js
const sql = await readFile(new URL('../supabase/migrations/20260828180000_phase_three_evaluation_gamification.sql', import.meta.url), 'utf8');
test('creates phase-three state and protected RPCs', () => {
  assert.match(sql, /CREATE TABLE public\.economy_seasons/i);
  assert.match(sql, /CREATE TABLE public\.top_ten_membership_state/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS evaluation_closed_at timestamptz/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.review_activity_excuse/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.finalize_activity_evaluation/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.finalize_task_evaluation/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.adjust_member_points/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.end_economy_season/i);
});
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `node --test tests/phaseThreeEconomyMigration.test.mjs`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create the migration through Supabase CLI, then implement constrained state**

Run first: `npx supabase migration new phase_three_evaluation_gamification`

Use the generated migration as `supabase/migrations/20260828180000_phase_three_evaluation_gamification.sql` in this workspace and add:

```sql
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS evaluation_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_closed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS evaluation_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS evaluation_closed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.activity_enrollments
  ADD COLUMN IF NOT EXISTS paid_charge_cycle integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_fee_active boolean NOT NULL DEFAULT false;

CREATE TABLE public.economy_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
CREATE UNIQUE INDEX economy_seasons_one_active_idx
  ON public.economy_seasons ((true)) WHERE ended_at IS NULL;

CREATE TABLE public.top_ten_membership_state (
  student_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_top_ten boolean NOT NULL DEFAULT false,
  rank integer CHECK (rank IS NULL OR rank > 0),
  changed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Enable RLS, revoke all Data API privileges by default, and grant no direct mutations to browser roles.

- [ ] **Step 4: Extend exported TypeScript database types**

Add exact row/projection types for seasons, excuse review rows, activity evaluation rows, task evaluation rows, member point rows, leaderboard rows, monthly star, own gamification summary, and recent ledger entries. Preserve existing exports.

- [ ] **Step 5: Run the migration contract and TypeScript checks**

Run: `node --test tests/phaseThreeEconomyMigration.test.mjs && npm run typecheck`

Expected: PASS.

---

### Task 2: Atomic point engine, authorization, idempotency, and Push enqueue

**Files:**
- Modify: `supabase/migrations/20260828180000_phase_three_evaluation_gamification.sql`
- Create: `supabase/tests/phase_three_evaluation_gamification.sql`
- Modify: `tests/phaseThreeEconomyMigration.test.mjs`

**Interfaces:**
- Consumes existing `points_ledger.source_key`, its balance trigger, accepted applications, assignments, and `push_notifications` outbox.
- Produces all privileged/public RPCs from the approved spec.

- [ ] **Step 1: Add failing SQL contract assertions for security and calculations**

```js
test('uses deterministic ledger sources and exact role gates', () => {
  assert.match(sql, /excuse:' \|\| p_enrollment_id/i);
  assert.match(sql, /activity-result:' \|\| p_activity_id/i);
  assert.match(sql, /task-result:' \|\| p_task_id/i);
  assert.match(sql, /position_key IN \('PRESIDENT', 'ACADEMIC_HEAD'\)/i);
  assert.match(sql, /position_key IN \('PRESIDENT', 'AUDIT_HEAD'\)/i);
  assert.match(sql, /total_points <= -50/i);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/i);
});
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `node --test tests/phaseThreeEconomyMigration.test.mjs`

Expected: FAIL on missing function bodies/security contracts.

- [ ] **Step 3: Implement private helpers**

Implement private role checks, accepted-student checks, safe targeted Push enqueue, tier calculation, and `refresh_top_ten_state(p_notify boolean)`. The refresh ranks accepted active students by `total_points DESC, created_at ASC, id ASC`, inserts/updates state, and enqueues only false-to-true transitions when `p_notify` is true.

- [ ] **Step 4: Extend the ledger trigger atomically**

Replace the existing trigger body so its profile update uses the resulting balance for both fields:

```sql
UPDATE public.profiles
SET total_points = total_points + NEW.amount,
    current_tier = CASE
      WHEN total_points + NEW.amount > 300 THEN 'GOLD'
      WHEN total_points + NEW.amount > 100 THEN 'SILVER'
      ELSE 'BRONZE'
    END
WHERE id = NEW.student_id;
```

- [ ] **Step 5: Replace paid enrollment RPC with reversible fee cycles**

Modify `set_own_activity_enrollment` to lock the parent/enrollment/profile, charge `-points_value` on paid joining, refund on decline, clear excuses on joining, and refresh Top 10 after a confirmed balance change. Use `paid-join:<activity>:<student>:<cycle>` and `paid-refund:<activity>:<student>:<cycle>`.

- [ ] **Step 6: Implement excuse review RPCs**

Create `list_pending_mandatory_excuses()` and `review_activity_excuse(uuid, excuse_review_status)`. Enforce PRESIDENT/ACADEMIC_HEAD, mandatory activity, declining decision, pending state, and exact deductions 0/-5/-15. Queue one personal notification and refresh Top 10 after deductions.

- [ ] **Step 7: Implement attendance and task evaluation RPCs**

Create list/draft/finalize functions. Finalize locks the parent and children, rejects incomplete drafts, uses nearest-integer rewards, makes PAID reward zero, penalizes mandatory absence by -20, inserts deterministic ledger rows, closes the parent, and refreshes Top 10. A repeated finalize returns the already-closed state without inserting rows.

- [ ] **Step 8: Implement points, season, and recognition RPCs**

Implement admin list, idempotent manual adjustment with `p_request_id`, season closure keyed by `p_season_id`, public Top 10, positive monthly star, and own gamification summary. Keep public outputs fixed and argument-free.

- [ ] **Step 9: Write live rollback tests**

The SQL test must create accepted student fixtures in a transaction and assert:

```sql
-- PARTIAL excuse changes balance by exactly -5 once.
-- PAID JOINING, DECLINING, JOINING produces debit, refund, and a new-cycle debit.
-- Activity/task finalize retries do not add ledger rows.
-- Manual p_request_id retry returns one movement.
-- Season closure makes every accepted total zero but retains ledger rows.
-- MEDIA_HEAD cannot call privileged evaluation RPCs.
ROLLBACK;
```

- [ ] **Step 10: Run contract tests locally**

Run: `node --test tests/phaseThreeEconomyMigration.test.mjs`

Expected: PASS. Live SQL execution is deferred to Task 8 after the migration is applied.

---

### Task 3: Pure domain policy and strict Supabase repository

**Files:**
- Create: `src/domain/phaseThreeEconomy.ts`
- Create: `src/domain/phaseThreeEconomyRepository.ts`
- Create: `src/services/phaseThreeEconomyService.ts`
- Create: `tests/phaseThreeEconomy.test.mjs`
- Create: `tests/phaseThreeEconomyRepository.test.mjs`

**Interfaces:**
- Produces `tierPresentation`, `memberWarning`, `activityDraftComplete`, `taskDraftComplete`, and repository methods matching every phase-three RPC.
- Consumes types from Task 1 and `supabase` from `src/lib/supabase.ts`.

- [ ] **Step 1: Write failing pure-domain tests**

```js
assert.deepEqual(tierPresentation(-50), { tier: 'BRONZE', label: 'عضو مبادر', medal: '🥉' });
assert.equal(tierPresentation(100).tier, 'BRONZE');
assert.equal(tierPresentation(101).tier, 'SILVER');
assert.equal(tierPresentation(300).tier, 'SILVER');
assert.equal(tierPresentation(301).tier, 'GOLD');
assert.equal(memberWarning(-50), true);
assert.equal(memberWarning(-49), false);
assert.equal(activityDraftComplete([{ attendanceStatus: null }]), false);
assert.equal(taskDraftComplete([{ completionStatus: 'PERFECT' }]), true);
```

- [ ] **Step 2: Run pure-domain tests and confirm RED**

Run: `node --test tests/phaseThreeEconomy.test.mjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement minimal pure-domain functions and confirm GREEN**

Run: `node --test tests/phaseThreeEconomy.test.mjs`

Expected: PASS.

- [ ] **Step 4: Write failing repository tests**

Cover exact RPC names/arguments, strict row mapping, malformed-response failure, 42501 Arabic authorization errors, incomplete-draft errors, idempotent manual request IDs, and thrown transport conversion.

- [ ] **Step 5: Run repository tests and confirm RED**

Run: `node --test tests/phaseThreeEconomyRepository.test.mjs`

Expected: FAIL because the repository is missing.

- [ ] **Step 6: Implement repository and service exports**

Expose methods: `loadPendingExcuses`, `reviewExcuse`, `loadActivityEvaluations`, `saveAttendance`, `finalizeActivity`, `loadTaskEvaluations`, `saveTaskCompletion`, `finalizeTask`, `loadMemberPoints`, `adjustMemberPoints`, `loadActiveSeason`, `endSeason`, `loadPublicLeaderboard`, `loadMonthlyStar`, and `loadOwnGamificationSummary`.

- [ ] **Step 7: Run domain, repository, and type checks**

Run: `node --test tests/phaseThreeEconomy.test.mjs tests/phaseThreeEconomyRepository.test.mjs && npm run typecheck`

Expected: PASS.

---

### Task 4: Excuse administration panel

**Files:**
- Create: `src/components/ExcuseReviewPanel.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Create: `tests/phaseThreeAdminIntegration.test.mjs`

**Interfaces:**
- Consumes `loadPendingExcuses` and `reviewExcuse` from Task 3.
- Produces the `excuses` admin tab visible only to PRESIDENT/ACADEMIC_HEAD.

- [ ] **Step 1: Write failing integration assertions**

```js
assert.match(adminSource, /id: 'excuses'[\s\S]+PRESIDENT[\s\S]+ACADEMIC_HEAD/);
assert.match(panelSource, /عذر مقنع/);
assert.match(panelSource, /مقنع جزئياً/);
assert.match(panelSource, /غير مقنع/);
assert.match(panelSource, /await reviewExcuse/);
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/phaseThreeAdminIntegration.test.mjs`

Expected: FAIL because the panel/tab is absent.

- [ ] **Step 3: Build the panel and role-gated tab**

Render pending cards, decision buttons, one busy enrollment at a time, retry state, structured console errors, success/error toast, and remove a card only after confirmed server success.

- [ ] **Step 4: Run integration, type, and lint checks**

Run: `node --test tests/phaseThreeAdminIntegration.test.mjs && npm run typecheck && npm run lint`

Expected: PASS.

---

### Task 5: Oversight attendance and task finalization panel

**Files:**
- Create: `src/components/OversightEvaluationPanel.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Modify: `tests/phaseThreeAdminIntegration.test.mjs`

**Interfaces:**
- Consumes activity/task list, draft-save, and finalize service methods from Task 3.
- Produces the `oversight` admin tab visible only to PRESIDENT/AUDIT_HEAD.

- [ ] **Step 1: Add failing integration assertions**

Assert exact attendance options, task completion options, role gates, draft saves, disabled finalize when drafts are incomplete, and confirmed refresh after finalization.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/phaseThreeAdminIntegration.test.mjs`

Expected: FAIL on missing panel content.

- [ ] **Step 3: Implement grouped evaluation UI**

Render activities and tasks in separate sub-tabs. Save each dropdown immediately through its RPC. Display calculated explanatory percentages but never send calculated point amounts. Finalize requires confirmation and closes only after server confirmation.

- [ ] **Step 4: Run integration, type, and lint checks**

Run: `node --test tests/phaseThreeAdminIntegration.test.mjs && npm run typecheck && npm run lint`

Expected: PASS.

---

### Task 6: Member points and season administration

**Files:**
- Create: `src/components/MemberPointsAdminPanel.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Modify: `tests/phaseThreeAdminIntegration.test.mjs`

**Interfaces:**
- Consumes member list/manual adjustment/active season/end season methods from Task 3.
- Produces the `member-points` tab for PRESIDENT/ACADEMIC_HEAD/AUDIT_HEAD with president-only mutations.

- [ ] **Step 1: Add failing integration assertions**

Assert the `<= -50` warning, required reason, signed non-zero amount, stable `crypto.randomUUID()` request id retained during retries, president-only controls, explicit destructive season confirmation, and active-season id passed to the RPC.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/phaseThreeAdminIntegration.test.mjs`

Expected: FAIL on missing member-points panel.

- [ ] **Step 3: Implement table, modal, and season card**

The modal keeps the same request UUID until a confirmed success or user cancel. Academic/audit roles see balances and warnings but no mutation controls. Season closure refreshes all authoritative rows only after confirmation.

- [ ] **Step 4: Run integration, type, and lint checks**

Run: `node --test tests/phaseThreeAdminIntegration.test.mjs && npm run typecheck && npm run lint`

Expected: PASS.

---

### Task 7: Student gamification and public recognition

**Files:**
- Create: `src/components/StudentGamificationPanel.tsx`
- Create: `src/components/PublicRecognition.tsx`
- Modify: `src/pages/StudentDashboard.tsx`
- Modify: `src/pages/HomePage.tsx`
- Create: `tests/phaseThreeGamificationUi.test.mjs`

**Interfaces:**
- Consumes public leaderboard/monthly star/own summary methods from Task 3.
- Produces accepted-only portal summary and public Top 10/monthly star components.

- [ ] **Step 1: Write failing UI integration assertions**

```js
assert.match(studentSource, /StudentGamificationPanel/);
assert.match(studentPanel, /ترتيبك/);
assert.match(studentPanel, /سجل النقاط/);
assert.match(homeSource, /PublicRecognition/);
assert.match(recognition, /أفضل 10/);
assert.match(recognition, /نجم الشهر/);
assert.doesNotMatch(recognition, /mock|fallbackStudent/i);
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/phaseThreeGamificationUi.test.mjs`

Expected: FAIL because the components are absent.

- [ ] **Step 3: Implement student summary**

Render total points, rank, badge, Top-10 indicator, and recent ledger entries. Mount only inside the existing accepted-student dashboard branch. Use explicit loading/error/empty states.

- [ ] **Step 4: Implement public recognition**

Render safe name/avatar/points/rank data using `UserAvatar`; show no invented rows. Monthly Star has an explicit empty state when the RPC returns no positive net result.

- [ ] **Step 5: Run UI, type, and lint checks**

Run: `node --test tests/phaseThreeGamificationUi.test.mjs && npm run typecheck && npm run lint`

Expected: PASS.

---

### Task 8: Apply Supabase migration and prove live behavior

**Files:**
- Use: `supabase/migrations/20260828180000_phase_three_evaluation_gamification.sql`
- Use: `supabase/tests/phase_three_evaluation_gamification.sql`

**Interfaces:**
- Consumes the official project `rscunkzvbsdbjzhnuria` and its signed-in SQL editor when the connector lacks DDL permission.
- Produces a migrated official database with rollback-tested behavior.

- [ ] **Step 1: Attempt the Supabase connector migration once**

Use `apply_migration` with name `phase_three_evaluation_gamification`. If permission is denied, use the already authenticated Supabase SQL editor rather than retrying the connector.

- [ ] **Step 2: Run the live SQL verification file**

Execute `supabase/tests/phase_three_evaluation_gamification.sql`; require success and final `ROLLBACK`.

- [ ] **Step 3: Run existing economy regression SQL tests**

Execute:

- `supabase/tests/internal_economy_foundation.sql`
- `supabase/tests/internal_economy_security_behavior.sql`
- `supabase/tests/unified_activity_student_boards.sql`

Require success for all three.

- [ ] **Step 4: Confirm fixture cleanup**

Run a read-only count for every `verification:` source key, activity, task, season label, and notification event used by the SQL tests. Every count must be zero.

---

### Task 9: Full verification and independent review

**Files:**
- Review all files from Tasks 1-8.

**Interfaces:**
- Produces final evidence that the phase is production-ready.

- [ ] **Step 1: Run the complete local verification suite**

Run in parallel where safe:

```text
npm run typecheck
npm run lint
npm test
npm run build
```

Require exit code 0 for every command. The existing Vite chunk-size warning is informational; new errors/warnings from phase-three code are not accepted.

- [ ] **Step 2: Run a local browser smoke test**

Verify public Top 10/monthly-star empty or data states, guest navigation, accepted-student gamification mounting when an accepted session is available, and no console errors.

- [ ] **Step 3: Request independent read-only code review**

Ask the reviewer to check role gates, double-award prevention, paid refund cycles, season retry safety, public PII projection, Push deduplication, strict mapping, and UI confirmation semantics. Fix every Critical/Important issue and rerun the affected tests.

- [ ] **Step 4: Re-run final evidence after review fixes**

Repeat TypeScript, lint, full tests, build, and affected live SQL tests. Report completion only from fresh successful output.
