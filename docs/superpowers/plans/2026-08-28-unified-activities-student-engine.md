# Unified Activities and Student Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing programs page conditionally interactive for accepted students and persist all activity/task participation in Supabase.

**Architecture:** CMS events keep public media and layout data while a stable `public_event_id` links each card to the internal-economy activity. Hardened RPCs return safe aggregate board projections and existing mutation RPCs remain the only student write surface.

**Tech Stack:** React 18, TypeScript, Supabase JS 2, PostgreSQL/RLS, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-28-unified-activities-student-engine-design.md`

## Global Constraints

- Do not create a new activities route or admin navigation tab.
- Preserve the existing programs page, media, filters, and CMS content.
- Do not build attendance, excuse-review, points-award, or honor-board UI.
- Student enrollment writes must use server RPCs and survive refresh.
- Only accepted active students may use activity/task interaction.

---

### Task 1: Interaction Policy

**Files:**
- Create: `src/domain/internalEconomyInteraction.ts`
- Test: `tests/internalEconomyInteraction.test.mjs`

**Interfaces:**
- Produces: `resolveActivityInteraction(input)`, `buildActivityDecisionRequest(input)`, and deadline/capacity helpers.

- [ ] Write failing tests for login routing, membership lock, expired/full activity, insufficient paid balance, mandatory excuse, and joining with `excuse_text: null`.
- [ ] Run `node --test tests/internalEconomyInteraction.test.mjs` and confirm failures are caused by the missing module.
- [ ] Implement the minimal pure policy functions.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Safe Database Projection

**Files:**
- Create: `supabase/migrations/20260828120000_unified_activity_student_boards.sql`
- Modify: `supabase/tests/internal_economy_foundation.sql`
- Create: `supabase/tests/unified_activity_student_boards.sql`
- Modify: `src/domain/internalEconomyTypes.ts`

**Interfaces:**
- Produces RPCs `list_student_activity_board`, `list_student_task_board`, `upsert_event_activity`, and `create_internal_task`.

- [ ] Write SQL contract assertions for the linkage column, explicit grants, revoked public execution, accepted-student checks, and manager checks.
- [ ] Run the focused Node migration test and confirm the new contract fails before the migration exists.
- [ ] Implement linkage/backfill, safe board RPCs, manager activity upsert, and manager task creation.
- [ ] Run catalog and behavioral SQL verification against the official project.

### Task 3: Supabase Service Layer

**Files:**
- Create: `src/domain/internalEconomyRepository.ts`
- Create: `src/services/internalEconomyService.ts`
- Test: `tests/internalEconomyRepository.test.mjs`

**Interfaces:**
- Produces typed load, decision, task registration, activity upsert, and task creation functions returning discriminated results.

- [ ] Write failing repository tests with complete fake Supabase responses for success, error, and malformed data.
- [ ] Run the focused repository tests and confirm expected failures.
- [ ] Implement strict mappers and RPC calls.
- [ ] Re-run focused tests and confirm they pass.

### Task 4: Existing Programs Page

**Files:**
- Modify: `src/pages/ProgramsPage.tsx`
- Modify: `src/components/EventCard.tsx`
- Create: `src/components/ActivityDecisionControls.tsx`
- Create: `src/components/TransientToast.tsx`

**Interfaces:**
- Consumes the activity board service and policy module.
- Produces guest login routing, accepted-student decisions, capacity/deadline display, and mandatory excuse modal on the existing route.

- [ ] Wire page-level loading and authoritative reload after each decision.
- [ ] Replace only the event card action area conditionally; preserve existing card presentation.
- [ ] Add mandatory-excuse modal and success/error toast.
- [ ] Verify that joining sends a null excuse and failed mutations leave the modal open.

### Task 5: Student Portal Boards

**Files:**
- Modify: `src/pages/StudentDashboard.tsx`
- Create: `src/components/StudentActivitiesPanel.tsx`
- Create: `src/components/StudentTasksPanel.tsx`

**Interfaces:**
- Consumes safe board projections and mutation services.
- Produces real `أنشطتي` rows from Supabase and a `المهام التطوعية` tab.

- [ ] Replace the local registered-events list with own server enrollments.
- [ ] Add tasks tab and capacity-aware task cards.
- [ ] Reload after successful task registration and show toast feedback.
- [ ] Preserve application, profile, suggestions, and message tabs.

### Task 6: Existing Admin Events Tab

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`
- Create: `src/components/InternalTaskCreationPanel.tsx`

**Interfaces:**
- Consumes manager activity/task service functions.
- Produces new activity fields in the existing event modal and task creation within the same tab.

- [ ] Add type, points, capacity, and deadline fields with validation.
- [ ] Upsert the linked activity before closing the event modal and surface failures.
- [ ] Add task creation form with required-student count, deadline, and points reward.
- [ ] Keep existing admin navigation unchanged.

### Task 7: Apply and Verify

**Files:**
- Verify all files above; do not add phase-three UI.

- [ ] Apply the migration to project `rscunkzvbsdbjzhnuria`.
- [ ] Run live SQL catalog and behavioral tests.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Request an independent code review and fix all Critical/Important findings.
