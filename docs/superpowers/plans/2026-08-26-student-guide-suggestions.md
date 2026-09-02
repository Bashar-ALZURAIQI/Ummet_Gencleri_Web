# Student Guide Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable public student-guide suggestion form and a president/academic-head-only review workflow in Supabase.

**Architecture:** A new RLS-protected `guide_suggestions` table is accessed only through a dedicated typed repository and service. Two isolated UI components integrate at narrow points in the public guide and administration dashboard, leaving existing contact, member suggestion, and join-application flows unchanged.

**Tech Stack:** React 18, TypeScript, Supabase JS 2, PostgreSQL RLS, Node test runner, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-26-student-guide-suggestions-design.md`

## Global Constraints

- Use the application role `ACADEMIC_HEAD` for the academic officer.
- Public users may insert but never select rows.
- Only `PRESIDENT` and `ACADEMIC_HEAD` may select, update status, or delete.
- Status values are exactly `PENDING`, `REVIEWING`, `IMPLEMENTED`, and `REJECTED`.
- Do not change existing contact messages, member suggestions, or join applications.
- Do not perform version-control operations; the user requested direct workspace and database changes.

---

### Task 1: Domain policy and repository

**Files:**
- Create: `tests/guideSuggestionPolicy.test.mjs`
- Create: `tests/guideSuggestionRepository.test.mjs`
- Create: `src/domain/guideSuggestionPolicy.ts`
- Create: `src/domain/guideSuggestionRepository.ts`

**Interfaces:**
- Produces: `validateGuideSuggestionInput(input)`, `canManageGuideSuggestions(role)`, `createGuideSuggestionRepository(client)` and the `GuideSuggestion` types.

- [ ] Write failing tests for trimmed required values, length limits, exact administrative roles, row mapping, public payload isolation, list ordering, status updates, deletes, malformed responses, and server errors.
- [ ] Run `node --test tests/guideSuggestionPolicy.test.mjs tests/guideSuggestionRepository.test.mjs` and confirm failure because the modules do not exist.
- [ ] Implement the smallest policy and repository that satisfy the tests.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Supabase migration

**Files:**
- Create: `tests/guideSuggestionsMigration.test.mjs`
- Create: `supabase/migrations/20260826193000_create_guide_suggestions.sql`

**Interfaces:**
- Produces: `public.guide_suggestions` with public column-limited insert and president/academic-head management policies.

- [ ] Write a failing source-level migration test for columns, four status constraints, text checks, RLS, explicit grants, restricted public insert columns, role-based SELECT/UPDATE/DELETE policies, and useful status/time index.
- [ ] Run `node --test tests/guideSuggestionsMigration.test.mjs` and confirm failure because the migration does not exist.
- [ ] Write the idempotent migration with schema-qualified references and least-privilege grants.
- [ ] Re-run the migration test and confirm it passes.

### Task 3: Public guide callout and submission modal

**Files:**
- Create: `tests/guideSuggestionUiIntegration.test.mjs`
- Create: `src/services/guideSuggestionService.ts`
- Create: `src/components/GuideSuggestionCallout.tsx`
- Modify: `src/pages/StudentGuide.tsx`

**Interfaces:**
- Consumes: `validateGuideSuggestionInput` and `createGuideSuggestionRepository`.
- Produces: `GuideSuggestionCallout` with required fields, preview-free text submission, busy state, error feedback, thanks feedback, and success-only modal close.

- [ ] Write a failing integration test proving the guide renders the independent callout and the component calls only `guideSuggestionService`.
- [ ] Run `node --test tests/guideSuggestionUiIntegration.test.mjs` and confirm the missing component integration failure.
- [ ] Add the service and callout/modal, then render it immediately below the guide edit banner.
- [ ] Re-run domain and UI tests and confirm they pass.

### Task 4: Restricted administration review panel

**Files:**
- Create: `src/components/GuideSuggestionsPanel.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Modify: `tests/guideSuggestionUiIntegration.test.mjs`

**Interfaces:**
- Consumes: list/update/delete service functions and `canManageGuideSuggestions`.
- Produces: administration tab `guide-suggestions`, visible only to `PRESIDENT` and `ACADEMIC_HEAD`, with filtering and review actions.

- [ ] Extend the UI integration test first to require the role-gated tab, render guard, filters, status actions, and delete action.
- [ ] Run the test and confirm it fails because the panel and tab are absent.
- [ ] Implement the panel and wire the guarded tab into `AdminDashboard.tsx`.
- [ ] Re-run the focused tests and confirm they pass.

### Task 5: Verification and live database application

**Files:**
- Verify all changed files and the official Supabase project `rscunkzvbsdbjzhnuria`.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Apply `20260826193000_create_guide_suggestions.sql` to the official Supabase project.
- [ ] Verify public submission, anonymous read denial, president/academic-head access, other-role denial, status update, delete, and persistence after refresh.
