# Executive Board Backend Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist president executive-board edits and restore member approval-request insertion without duplicate tables or relaxed browser write access.

**Architecture:** The existing `published_site_content` row remains the published store and `edit_requests` remains the approval store. A migration repairs server-side base-snapshot projection, while the frontend routes president changes through the existing president-only CMS publication RPC and keeps member changes on the structured edit-request RPC.

**Tech Stack:** React 18, TypeScript, Vite, `@supabase/supabase-js`, PostgreSQL, Supabase RLS/RPC, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-26-executive-board-backend-persistence-design.md`

## Global Constraints

- No duplicate board or board-request tables.
- No direct browser INSERT/UPDATE grants on protected tables.
- No UI redesign.
- No deletion or lossy rewrite of existing committee data.
- All server-confirmed writes must survive refresh.

---

### Task 1: Repair the server-side base snapshot

**Files:**
- Create: `supabase/migrations/<generated>_fix_executive_board_backend_persistence.sql`
- Test: `tests/executiveBoardBackendPersistenceMigration.test.mjs`

**Interfaces:**
- Consumes: `private.normalize_executive_profile_snapshot(jsonb, jsonb, boolean)`.
- Produces: corrected `private.executive_profile_snapshot_from_committee(jsonb) returns jsonb`.

- [ ] Write a failing migration regression test that executes the SQL function contract against a committee whose members include profile-only fields and expects a strict four-field snapshot.
- [ ] Run `npm test -- tests/executiveBoardBackendPersistenceMigration.test.mjs` and confirm failure because no corrective migration exists.
- [ ] Generate a migration with `supabase migration new fix_executive_board_backend_persistence`.
- [ ] Implement a private projection of persisted members before passing the snapshot to the existing strict normalizer; keep private execution revoked.
- [ ] Run the focused test and confirm it passes.

### Task 2: Persist president committee changes

**Files:**
- Modify: `src/context/AppContext.tsx`
- Modify: `src/pages/CommitteePage.tsx`
- Test: `tests/executiveBoardPresidentPersistence.test.mjs`

**Interfaces:**
- Produces: `publishExecutiveCommittee(committeeId, nextCommittee) -> Promise<{ok:true}|{ok:false,error:string,diagnostic?:unknown}>` on `AppContextValue`.
- Uses: `publishCmsTarget('committees', nextCommittees, contentVersionRef.current)` and `applyCmsPublication(...)`.

- [ ] Write a failing coordinator test proving a president publication waits for Supabase confirmation and publishes the full committees payload with the current content version.
- [ ] Run the focused test and confirm it fails because no president persistence coordinator exists.
- [ ] Implement a small domain coordinator with dependency injection for the publication boundary.
- [ ] Wire `AppContext` to publish the next committee list through `publishCmsTarget` and apply only the returned publication.
- [ ] Replace the president `setCommittees` branch in `CommitteePage` with the awaited context operation.
- [ ] Run the focused test and confirm it passes.

### Task 3: Preserve actionable Supabase submission diagnostics

**Files:**
- Modify: `src/domain/editRequestGateway.ts`
- Modify: `src/context/AppContext.tsx`
- Test: `tests/executiveBoardSubmissionDiagnostics.test.mjs`

**Interfaces:**
- Consumes: Supabase `PostgrestError`-shaped values.
- Produces: stable diagnostic fields used by the existing console/error-toast path.

- [ ] Write a failing test using a complete Supabase error fixture and assert that code, message, details, and hint survive the gateway boundary.
- [ ] Run the focused test and confirm the details are currently lost or not normalized.
- [ ] Implement minimal error normalization and return it from the profile submit failure.
- [ ] Map known server codes to specific Arabic feedback while leaving the raw diagnostic available for `console.error`.
- [ ] Run the focused test and confirm it passes.

### Task 4: Apply and verify production behavior

**Files:**
- Verify: the generated migration and existing Supabase project `rscunkzvbsdbjzhnuria`.

**Interfaces:**
- Consumes: completed migration and frontend build.
- Produces: verified production schema/function behavior.

- [ ] Run all automated tests, typecheck, lint, and build.
- [ ] Apply the migration through the authenticated Supabase dashboard because the management connector lacks project permission.
- [ ] Run a read-only production query proving all current rich committee member rows normalize successfully.
- [ ] Re-audit RLS, table grants, RPC execute grants, and existing pending-request filtering.
- [ ] Run the relevant application flow with authenticated president/member sessions when available; otherwise report the exact remaining manual credential-dependent check.
