# Executive Board Edit Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make executive committee-content edits single-pending, president-approved, atomically published, permanently audited, and human-readable without changing direct personal-profile updates.

**Architecture:** Keep `edit_requests` as the institutional ledger, add structured profile snapshots, and introduce dedicated submission/approval/rejection RPCs. React consumes confirmed RPC rows/publications only; pure domain builders produce safe localized diffs for one reusable comparison component used by pending requests and history.

**Tech Stack:** React 18, TypeScript 5.5, Supabase PostgreSQL/RLS/RPC/Realtime, `@supabase/supabase-js` 2.57.4, Node test runner, Tailwind CSS, Lucide React.

**Spec:** `docs/superpowers/specs/2026-08-25-executive-edit-approval-workflow-design.md`

## Global Constraints

- Name, contact email, biography, and personal avatar remain direct own-profile updates.
- Position and permission changes remain president-only through the assignment-transfer workflow.
- Database status stays `pending | approved | rejected`; the UI maps `pending` to `PENDING_APPROVAL`.
- No pending request may appear in audit history.
- No raw JSON, IDs, login data, roles, or permissions may appear in the comparison UI.
- Approval must publish committee content and decide the request in one PostgreSQL transaction.
- Student join-request screens, services, and database functions must not change.
- Do not add new dependencies.
- Do not expose service-role or secret keys to the frontend.
- Use the exact success message: `تم إرسال طلب التعديل بنجاح وهو قيد انتظار موافقة رئيس الاتحاد`.
- Do not create Git branches, commits, or GitHub changes; verification output is the handoff record.

## File Structure

- Create `src/domain/executiveEditWorkflow.ts`: strict structured snapshot normalization, localized diff rows, revision validation, and stable feedback constants.
- Modify `src/domain/editRequestGateway.ts`: map structured database columns and expose dedicated profile submit/approve/reject calls.
- Modify `src/services/editRequestService.ts`: application-level wrappers for the dedicated profile calls.
- Modify `src/domain/editRequestHistory.ts`: map structured profile requests and build decided-only audit entries.
- Modify `src/domain/editApprovalPolicy.ts`: reuse strict profile safety rules for president-revised snapshots without exposing protected fields.
- Create `src/domain/executiveEditCoordinator.ts`: apply only confirmed request rows and atomic committee publications to React state.
- Create `src/domain/editAuditView.ts`: defensively project final decisions into an action-free audit view model.
- Modify `src/data/mockData.ts`: align profile statuses/history entries with structured diffs and `PENDING_APPROVAL` presentation.
- Create `src/components/EditDiffTable.tsx`: reusable red/green field comparison table.
- Create `src/components/ExecutiveEditDraftEditor.tsx`: president editor for allowed structured text only.
- Modify `src/components/ProfileEditsPanel.tsx`: pending-only approve/reject/edit-before-approve UI.
- Modify `src/components/EditsHistoryPanel.tsx`: decided-only, read-only structured comparison UI.
- Modify `src/pages/CommitteePage.tsx`: confirmed success toast, duplicate blocking, and pending-state edit disabling.
- Modify `src/context/AppContext.tsx`: authoritative structured request state and atomic publication application.
- Create one Supabase migration via `npx supabase migration new executive_profile_edit_workflow`; the CLI output becomes the authoritative exact file path and is recorded before editing it.
- Add `tests/executiveEditWorkflow.test.mjs`, `tests/executiveEditWorkflowMigration.test.mjs`, and extend existing edit request/history/submission tests.

---

### Task 1: Structured Executive Snapshot and Safe Diff Domain

**Files:**
- Create: `src/domain/executiveEditWorkflow.ts`
- Create: `tests/executiveEditWorkflow.test.mjs`
- Modify: `src/domain/editApprovalPolicy.ts`

**Interfaces:**
- Produces: `ExecutiveContentSnapshot`, `ExecutiveEditDiffRow`, `normalizeExecutiveContentSnapshot(value)`, `buildExecutiveEditDiff(base, proposed)`, `applyExecutiveTextRevision(snapshot, revision)`, `PROFILE_EDIT_SUBMITTED_MESSAGE`.
- Consumes: existing committee responsibility/stat/member shapes from `src/data/mockData.ts`.

- [ ] **Step 1: Write failing tests for strict snapshots and localized changed-only diffs**

```js
import {
  buildExecutiveEditDiff,
  normalizeExecutiveContentSnapshot,
  PROFILE_EDIT_SUBMITTED_MESSAGE,
} from '../src/domain/executiveEditWorkflow.ts';

test('profile diff exposes only changed localized content and hides technical member fields', () => {
  const base = {
    responsibilities: ['تنظيم اللقاءات'],
    stats: [{ label: 'البرامج', value: '4' }],
    members: [{ id: 'internal-1', name: 'أحمد', position: 'منسق', photo: '/safe.webp' }],
  };
  const proposed = {
    responsibilities: ['تنظيم اللقاءات', 'متابعة الطلاب'],
    stats: [{ label: 'البرامج', value: '5' }],
    members: [{ id: 'internal-1', name: 'أحمد محمود', position: 'منسق', photo: '/safe.webp' }],
  };
  assert.deepEqual(buildExecutiveEditDiff(base, proposed), [
    { key: 'responsibilities', label: 'المهام والمسؤوليات', oldValue: 'تنظيم اللقاءات', newValue: 'تنظيم اللقاءات\nمتابعة الطلاب' },
    { key: 'stats', label: 'الإحصائيات', oldValue: '4 — البرامج', newValue: '5 — البرامج' },
    { key: 'members', label: 'أعضاء اللجنة', oldValue: 'أحمد — منسق', newValue: 'أحمد محمود — منسق' },
  ]);
  assert.equal(JSON.stringify(buildExecutiveEditDiff(base, proposed)).includes('internal-1'), false);
  assert.equal(JSON.stringify(buildExecutiveEditDiff(base, proposed)).includes('/safe.webp'), false);
});

test('structured profile snapshots reject head, role, permission, and unknown keys', () => {
  assert.equal(normalizeExecutiveContentSnapshot({ responsibilities: [], stats: [], members: [], role: 'PRESIDENT' }), null);
  assert.equal(normalizeExecutiveContentSnapshot({ head: { name: 'مزور' }, responsibilities: [], stats: [], members: [] }), null);
});

test('submission feedback uses the approved Arabic message', () => {
  assert.equal(PROFILE_EDIT_SUBMITTED_MESSAGE, 'تم إرسال طلب التعديل بنجاح وهو قيد انتظار موافقة رئيس الاتحاد');
});
```

- [ ] **Step 2: Run the new domain test and confirm RED**

Run: `node --test tests/executiveEditWorkflow.test.mjs`

Expected: FAIL because `src/domain/executiveEditWorkflow.ts` does not exist.

- [ ] **Step 3: Implement the minimal strict domain model**

```ts
export interface ExecutiveContentSnapshot {
  responsibilities: string[];
  stats: Array<{ label: string; value: string }>;
  members: Array<{ id: string; name: string; position: string; photo: string }>;
}

export interface ExecutiveEditDiffRow {
  key: 'responsibilities' | 'stats' | 'members';
  label: string;
  oldValue: string;
  newValue: string;
}

export const PROFILE_EDIT_SUBMITTED_MESSAGE =
  'تم إرسال طلب التعديل بنجاح وهو قيد انتظار موافقة رئيس الاتحاد';
```

Implement normalization with an exact-key allowlist and bounded arrays/strings. Implement formatting without serializing objects. Add revision validation that can change responsibility text, stat label/value, and member name/position while preserving IDs/photos.

- [ ] **Step 4: Reuse the strict snapshot rules from approval policy**

Update `deriveApprovedProfilePatch` to consume normalized `ExecutiveContentSnapshot` values and preserve the existing immutable-head/member-ID protections. Do not permit personal profile fields in this patch.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run: `node --test tests/executiveEditWorkflow.test.mjs tests/editApprovalPolicy.test.mjs`

Expected: all tests pass with zero failures.

### Task 2: Dedicated Structured Profile Request Gateway

**Files:**
- Modify: `src/domain/editRequestGateway.ts`
- Modify: `src/services/editRequestService.ts`
- Modify: `tests/editRequestService.test.mjs`

**Interfaces:**
- Consumes: `ExecutiveContentSnapshot` from Task 1.
- Produces: `SubmitProfileEditRequestInput`, `ProfileApprovalResult`, `EditRequest.profileBaseSnapshot`, `EditRequest.profileProposedSnapshot`, `submitProfile`, `approveProfile`, `rejectProfile`.

- [ ] **Step 1: Add failing gateway tests**

```js
const snapshot = { responsibilities: ['مهمة'], stats: [], members: [] };
const revisedSnapshot = { responsibilities: ['مهمة منقحة'], stats: [], members: [] };
const profileRow = {
  id: 'request-1', edit_type: 'profile', status: 'pending', target_key: 'media',
  profile_base_snapshot: { responsibilities: [], stats: [], members: [] },
  profile_proposed_snapshot: snapshot, profile_payload_version: 1,
};

test('profile submission uses only the dedicated structured RPC', async () => {
  const { client, calls } = createClient({ rpcResponse: { data: profileRow, error: null } });
  const result = await createEditRequestService(client).submitProfile({ proposedSnapshot: snapshot });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [[
    'rpc', 'submit_profile_edit_request',
    { p_proposed_snapshot: snapshot, p_payload_version: 1 },
  ]]);
});

test('profile approval maps the request and committee publication atomically', async () => {
  const publication = { target: 'committees', payload: { media: revisedSnapshot }, version: 7 };
  const { client } = createClient({
    rpcResponse: { data: { request: { ...profileRow, status: 'approved' }, publication }, error: null },
  });
  const result = await createEditRequestService(client).approveProfile(profileRow.id, revisedSnapshot, 'عدّل الرئيس النص');
  assert.deepEqual(result.ok && result.data.publication.target, 'committees');
});

test('profile rejection uses the dedicated rejection RPC', async () => {
  const { client, calls } = createClient({
    rpcResponse: { data: { ...profileRow, status: 'rejected' }, error: null },
  });
  await createEditRequestService(client).rejectProfile(profileRow.id, 'مرفوض');
  assert.equal(calls[0][1], 'reject_profile_edit_request');
});
```

- [ ] **Step 2: Run the gateway tests and confirm RED**

Run: `node --test tests/editRequestService.test.mjs`

Expected: FAIL because the three dedicated methods and structured fields do not exist.

- [ ] **Step 3: Extend the database row mapper**

Add these selected columns:

```ts
'profile_base_snapshot', 'profile_proposed_snapshot', 'profile_payload_version'
```

Map them only when present and valid. Keep existing site mapping unchanged.

- [ ] **Step 4: Implement the three gateway methods and service wrappers**

```ts
submitProfile(input: SubmitProfileEditRequestInput): Promise<ServiceResult<EditRequest>>;
approveProfile(requestId: string, revised?: ExecutiveContentSnapshot, note?: string | null): Promise<ServiceResult<ProfileApprovalResult>>;
rejectProfile(requestId: string, note?: string | null): Promise<ServiceResult<EditRequest>>;
```

Require a complete request-plus-publication envelope before reporting approval success. Convert thrown requests and malformed successful responses into explicit failures.

- [ ] **Step 5: Run the gateway tests and confirm GREEN**

Run: `node --test tests/editRequestService.test.mjs`

Expected: all gateway tests pass.

### Task 3: Supabase Structured Profile Workflow Migration

**Files:**
- Create through CLI: the exact migration file printed by `npx supabase migration new executive_profile_edit_workflow`
- Create: `tests/executiveEditWorkflowMigration.test.mjs`

**Interfaces:**
- Consumes: structured snapshot contract from Task 1 and RPC names from Task 2.
- Produces: `submit_profile_edit_request`, `approve_profile_edit_request`, `reject_profile_edit_request`, structured columns, lookup index, legacy backfill, grants.

- [ ] **Step 1: Verify current CLI commands without guessing**

Run:

```powershell
npx supabase --version
npx supabase migration new --help
```

Expected: both commands exit successfully and show the installed CLI syntax.

- [ ] **Step 2: Generate the migration using the CLI**

Run: `npx supabase migration new executive_profile_edit_workflow`

Expected: Supabase prints the exact new migration path. Use that printed path for all remaining steps in this task.

- [ ] **Step 3: Write a failing migration contract test**

The test locates the single migration whose filename ends in `_executive_profile_edit_workflow.sql` and asserts:

```js
assert.match(sql, /add column if not exists profile_base_snapshot jsonb/i);
assert.match(sql, /pg_advisory_xact_lock/i);
assert.match(sql, /create or replace function public\.submit_profile_edit_request/i);
assert.match(sql, /create or replace function public\.approve_profile_edit_request/i);
assert.match(sql, /private\.publish_cms_target_locked/i);
assert.match(sql, /status = 'pending'/i);
assert.match(sql, /create or replace function public\.reject_profile_edit_request/i);
assert.match(sql, /revoke execute .* from public, anon, authenticated, service_role/is);
assert.match(sql, /grant execute .* to authenticated/is);
assert.doesNotMatch(sql, /user_metadata|raw_user_meta_data/i);
```

- [ ] **Step 4: Run the migration test and confirm RED**

Run: `node --test tests/executiveEditWorkflowMigration.test.mjs`

Expected: FAIL because the generated migration is empty.

- [ ] **Step 5: Add structured columns, index, and safe legacy backfill**

Add:

```sql
alter table public.edit_requests
  add column if not exists profile_base_snapshot jsonb,
  add column if not exists profile_proposed_snapshot jsonb,
  add column if not exists profile_payload_version integer;

create index if not exists edit_requests_pending_profile_owner_idx
  on public.edit_requests (submitted_by, committee_key, submitted_at desc)
  where edit_type = 'profile' and status = 'pending';
```

Backfill parseable version-1 profile envelopes with guarded `jsonb` extraction. For parseable pending rows, derive the base from the matching current committee. Leave unparseable legacy rows pending and reject-only; do not fabricate a reviewer or decision.

- [ ] **Step 6: Implement private validators and the submission RPC**

The function must:

```sql
perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text || ':' || v_assignment.committee_key, 0));
if exists (
  select 1 from public.edit_requests
  where submitted_by = v_actor_id
    and committee_key = v_assignment.committee_key
    and edit_type = 'profile'
    and status = 'pending'
) then
  raise exception using errcode = 'P0001', message = 'PROFILE_EDIT_ALREADY_PENDING';
end if;
```

Read the authoritative base from `published_site_content.content->'committees'`, validate exact allowed keys, reject no-op/oversized payloads, and insert one structured pending row.

- [ ] **Step 7: Block generic profile submission**

Modify `public.submit_edit_request` so `p_edit_type = 'profile'` raises `PROFILE_EDIT_REQUIRES_STRUCTURED_RPC`. Do not change the dedicated site edit RPC.

- [ ] **Step 8: Implement atomic approval and rejection RPCs**

Approval must lock request and published content, detect targeted-field staleness, sanitize the final proposal, call:

```sql
v_publication := private.publish_cms_target_locked(
  v_actor_id,
  'committees',
  v_next_committees,
  v_site.version
);
```

Then update the request to `approved` in the same function and return:

```sql
jsonb_build_object('request', to_jsonb(v_request), 'publication', v_publication)
```

Rejection changes only the request to `rejected`. Both functions require the current president and a still-pending profile request.

- [ ] **Step 9: Harden privileges and RLS compatibility**

Revoke every new function from `PUBLIC, anon, authenticated, service_role`, then grant only the public RPC signatures to `authenticated`. Keep table direct mutation revoked. Pin `search_path = ''` and use schema-qualified names.

- [ ] **Step 10: Run the migration contract test and confirm GREEN**

Run: `node --test tests/executiveEditWorkflowMigration.test.mjs tests/supabaseIdentityMigration.test.mjs tests/supabaseCmsContactMigration.test.mjs`

Expected: all migration/security tests pass.

### Task 4: Decided-Only History and Structured Request Mapping

**Files:**
- Modify: `src/domain/editRequestHistory.ts`
- Modify: `src/data/mockData.ts`
- Modify: `tests/editRequestHistory.test.mjs`

**Interfaces:**
- Consumes: structured columns from Task 2 and diff builder from Task 1.
- Produces: `mapEditRequestToProfileEdit`, `mapDecidedEditRequestsToHistory`, `EditsHistoryEntry.diffs`, `ProfileEditStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'`.

- [ ] **Step 1: Add failing history tests**

```js
const profileRequest = {
  id: 'request-1', editType: 'profile', status: 'pending', targetKey: 'media',
  applicantId: 'member-1', applicantName: 'عضو الإعلام',
  profileBaseSnapshot: { responsibilities: ['مهمة قديمة'], stats: [], members: [] },
  profileProposedSnapshot: { responsibilities: ['مهمة جديدة'], stats: [], members: [] },
  profilePayloadVersion: 1, proposedText: '', createdAt: '2026-08-25T08:00:00.000Z',
};

test('pending requests never enter audit history', () => {
  assert.deepEqual(mapDecidedEditRequestsToHistory([{ ...profileRequest, status: 'pending' }]), []);
});

test('approved structured profile history contains safe localized diffs', () => {
  const [entry] = mapDecidedEditRequestsToHistory([{ ...profileRequest, status: 'approved' }]);
  assert.deepEqual(entry.diffs[0].label, 'المهام والمسؤوليات');
  assert.equal(JSON.stringify(entry.diffs).includes('member-id'), false);
  assert.equal(JSON.stringify(entry.diffs).includes('{"'), false);
});

test('unparseable legacy request exposes no serialized proposal', () => {
  const [entry] = mapDecidedEditRequestsToHistory([{ ...profileRequest, status: 'rejected', proposedText: '{bad json' }]);
  assert.equal(entry.detailsUnavailable, true);
  assert.equal(entry.proposedText.includes('{bad json'), false);
});
```

- [ ] **Step 2: Run the history tests and confirm RED**

Run: `node --test tests/editRequestHistory.test.mjs`

Expected: FAIL because pending rows are still mapped and structured diffs do not exist.

- [ ] **Step 3: Map structured snapshots before legacy envelopes**

For new profile rows, derive the committee and snapshots from database columns. Fall back to the version-1 envelope only for legacy rows. Reject committee/role mismatches.

- [ ] **Step 4: Introduce the decided-only selector**

```ts
export const mapDecidedEditRequestsToHistory = (requests: PersistedEditRequestRecord[]) =>
  requests
    .filter((request) => request.status === 'approved' || request.status === 'rejected')
    .map(mapEditRequestToHistory);
```

Remove `PENDING` from the history decision union and carry `diffs` plus `detailsUnavailable`. Never put raw `proposedText` into a UI-facing field.

- [ ] **Step 5: Run the history tests and confirm GREEN**

Run: `node --test tests/editRequestHistory.test.mjs`

Expected: all history tests pass and no pending audit entry is produced.

### Task 5: AppContext Authoritative Workflow Integration

**Files:**
- Modify: `src/context/AppContext.tsx`
- Create: `src/domain/executiveEditCoordinator.ts`
- Create: `tests/executiveEditApprovalFlow.test.mjs`

**Interfaces:**
- Consumes: service wrappers from Task 2, mappings from Task 4, confirmed `committees` publication.
- Produces: `runExecutiveEditSubmission`, `runExecutiveEditApproval`, `runExecutiveEditRejection`, `submitProfileEdit`, `approveProfileEdit`, `approveProfileEditWithChanges`, `rejectProfileEdit`, pending-only request selectors.

- [ ] **Step 1: Add failing authority-flow tests**

```js
const proposedSnapshot = { responsibilities: ['مهمة جديدة'], stats: [], members: [] };
const profileRequest = {
  id: 'request-1', editType: 'profile', status: 'PENDING_APPROVAL', targetKey: 'media',
  profileBaseSnapshot: { responsibilities: [], stats: [], members: [] },
  profileProposedSnapshot: proposedSnapshot, profilePayloadVersion: 1,
};
const approvedRequest = { ...profileRequest, status: 'APPROVED' };
const publication = { target: 'committees', payload: { media: proposedSnapshot }, version: 7 };

test('confirmed structured submission publishes only the returned request row', async () => {
  const published = [];
  const result = await runExecutiveEditSubmission({
    submit: async () => ({ ok: true, data: profileRequest }),
    publishRequest: (request) => published.push(request),
  }, proposedSnapshot);
  assert.equal(result.ok, true);
  assert.deepEqual(published, [profileRequest]);
});

test('failed profile approval never publishes committee content', async () => {
  const publications = [];
  const result = await runExecutiveEditApproval({
    approve: async () => ({ ok: false, error: { code: 'PROFILE_EDIT_STALE', message: 'stale' } }),
    publishCommittees: (publication) => publications.push(publication),
    publishRequest: () => assert.fail('request must remain pending'),
  }, profileRequest.id);
  assert.equal(result.ok, false);
  assert.deepEqual(publications, []);
});

test('successful profile approval applies only the atomic publication envelope', async () => {
  const publications = [];
  await runExecutiveEditApproval({
    approve: async () => ({ ok: true, data: { request: approvedRequest, publication } }),
    publishCommittees: (value) => publications.push(value),
    publishRequest: () => {},
  }, profileRequest.id);
  assert.deepEqual(publications, [publication]);
});
```

- [ ] **Step 2: Run the integration contract tests and confirm RED**

Run: `node --test tests/executiveEditApprovalFlow.test.mjs`

Expected: FAIL because AppContext still uses generic submission/local publication.

- [ ] **Step 3: Split all requests from pending profile requests**

Keep all RLS-visible rows for ownership/history, but derive:

```ts
const profileEditRequests = ...;
const pendingProfileEdits = profileEditRequests.filter((edit) => edit.status === 'PENDING_APPROVAL');
const editsHistory = mapDecidedEditRequestsToHistory(editRequestRows);
```

Use final rows/history for rejected-notice behavior rather than treating `pendingProfileEdits` as an all-status collection. AppContext delegates service-result publication to the tested coordinator.

- [ ] **Step 4: Replace generic submission with structured submission**

Pass only normalized responsibilities/stats/members. Map `PROFILE_EDIT_ALREADY_PENDING` to a clear Arabic error and return the existing pending row after a refresh without inventing success.

- [ ] **Step 5: Replace local approval with atomic confirmed publication**

Both normal and edited approval call the dedicated service. On success:

```ts
applyCmsPublication('committees', result.data.publication.payload, result.data.publication.version);
upsertEditRequestRow(result.data.request);
```

On any malformed/failed/indeterminate result, refresh authoritative requests and do not mutate committees locally.

- [ ] **Step 6: Replace generic rejection with dedicated rejection**

Update only from the confirmed returned request. Preserve the pending row on failure.

- [ ] **Step 7: Run focused integration tests and confirm GREEN**

Run: `node --test tests/executiveEditApprovalFlow.test.mjs tests/editSubmissionAwait.test.mjs tests/editRequestService.test.mjs`

Expected: all tests pass.

### Task 6: Shared Red/Green Comparison and President Revision Editor

**Files:**
- Create: `src/components/EditDiffTable.tsx`
- Create: `src/components/ExecutiveEditDraftEditor.tsx`
- Modify: `src/components/ProfileEditsPanel.tsx`

**Interfaces:**
- Consumes: `ExecutiveEditDiffRow`, `ExecutiveContentSnapshot`, `approveProfileEditWithChanges`.
- Produces: `buildEditDiffTableModel`, accessible comparison table, and allowed-text revision dialog.

- [ ] **Step 1: Add failing editor/view-model behavior tests to the workflow test**

```js
const snapshot = {
  responsibilities: ['النص القديم'], stats: [{ label: 'برامج', value: '4' }],
  members: [{ id: 'hidden-id', name: 'أحمد', position: 'عضو', photo: '/kept.webp' }],
};
const base = snapshot;
const proposed = {
  responsibilities: ['النص الجديد'], stats: [{ label: 'برامج', value: '8' }],
  members: [{ id: 'hidden-id', name: 'أحمد محمود', position: 'منسق', photo: '/kept.webp' }],
};

test('president revision changes allowed text and preserves hidden member fields', () => {
  const revised = applyExecutiveTextRevision(snapshot, {
    responsibilities: ['النص المعدل'],
    stats: [{ label: 'برامج', value: '8' }],
    members: [{ id: 'hidden-id', name: 'الاسم المعدل', position: 'منسق', photo: '/attempt.webp' }],
  });
  assert.equal(revised.ok, true);
  assert.equal(revised.value.members[0].id, snapshot.members[0].id);
  assert.equal(revised.value.members[0].photo, snapshot.members[0].photo);
});

test('comparison view model contains display rows only', () => {
  const model = buildEditDiffTableModel(buildExecutiveEditDiff(base, proposed));
  assert.deepEqual(Object.keys(model.rows[0]), ['key', 'label', 'oldValue', 'newValue']);
  assert.equal(JSON.stringify(model).includes('hidden-id'), false);
});
```

- [ ] **Step 2: Run the workflow test and confirm RED**

Run: `node --test tests/executiveEditWorkflow.test.mjs`

Expected: FAIL because the revision and comparison view-model behavior does not exist.

- [ ] **Step 3: Implement `EditDiffTable`**

Export `buildEditDiffTableModel(rows)` from the domain module, then render that tested model with headings `اسم الحقل`, `النص الأصلي`, and `النص المقترح/الجديد`. Use `whitespace-pre-line`, rose styling for old values, emerald styling for new values, and `—` for empty values. Accept only prebuilt diff rows.

- [ ] **Step 4: Implement the structured revision editor**

Responsibilities use one line per item. Statistics use explicit value/label inputs. Members expose name/position only; IDs/photos are carried internally and never rendered or editable. Emit a complete validated `ExecutiveContentSnapshot`.

- [ ] **Step 5: Update `ProfileEditsPanel`**

Show only pending requests. Disable all request buttons while busy. Normal approval passes no revised snapshot; rejection calls the dedicated rejection function; edit opens the structured editor then calls `approveProfileEditWithChanges`.

Legacy invalid requests show `تعذر قراءة تفاصيل هذا الطلب القديم`, hide approve/edit, and keep reject available.

- [ ] **Step 6: Run focused tests, typecheck, and confirm GREEN**

Run:

```powershell
node --test tests/executiveEditWorkflow.test.mjs
npm run typecheck
```

Expected: both commands exit successfully.

### Task 7: Member Feedback and Duplicate Blocking

**Files:**
- Modify: `src/pages/CommitteePage.tsx`
- Modify: `tests/editSubmissionAwait.test.mjs`
- Modify: `tests/executiveEditWorkflow.test.mjs`

**Interfaces:**
- Consumes: `pendingProfileEdits`, `PROFILE_EDIT_SUBMITTED_MESSAGE`, confirmed `submitProfileEdit`.
- Produces: `resolveExecutiveContentEditState`, pending-disabled committee editor, and exact confirmed success toast.

- [ ] **Step 1: Add failing pending-edit policy tests**

```js
test('a non-president with a pending request cannot open committee-content editors', () => {
  assert.deepEqual(resolveExecutiveContentEditState({ isPresident: false, hasPendingRequest: true }), {
    canEditContent: false,
    reason: 'PENDING_APPROVAL',
  });
});

test('the president remains able to edit committee content directly', () => {
  assert.equal(resolveExecutiveContentEditState({ isPresident: true, hasPendingRequest: true }).canEditContent, true);
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `node --test tests/executiveEditWorkflow.test.mjs tests/editSubmissionAwait.test.mjs`

Expected: FAIL because the pending-edit policy function does not exist.

- [ ] **Step 3: Replace alert feedback with confirmed toast state**

Set the success message only after `submitProfileEdit` returns a confirmed request. Close the modal after confirmation. Show service/duplicate errors inside the active form or a persistent error toast.

- [ ] **Step 4: Block all committee-content mutation entry points while pending**

Implement `resolveExecutiveContentEditState` in `src/domain/executiveEditWorkflow.ts`. Disable or hide responsibility, statistic, and committee-member content edit actions for the request owner while `myPendingEdit` exists. Personal profile settings remain available elsewhere and unaffected. The president remains able to edit directly.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `node --test tests/executiveEditWorkflow.test.mjs tests/editSubmissionAwait.test.mjs`

Expected: all tests pass.

### Task 8: Read-Only Structured Audit UI

**Files:**
- Create: `src/domain/editAuditView.ts`
- Modify: `src/components/EditsHistoryPanel.tsx`
- Modify: `tests/executiveEditWorkflow.test.mjs`

**Interfaces:**
- Consumes: decided-only `EditsHistoryEntry[]` and `EditDiffTable`.
- Produces: `buildEditAuditViewModel`, action-free final decision history with no pending style or raw text dump.

- [ ] **Step 1: Extend the decided-history behavior test with audit presentation constraints**

```js
const profileRequest = {
  id: 'request-1', editType: 'profile', status: 'pending', targetKey: 'media',
  applicantId: 'member-1', applicantName: 'عضو الإعلام',
  profileBaseSnapshot: { responsibilities: ['مهمة قديمة'], stats: [], members: [] },
  profileProposedSnapshot: { responsibilities: ['مهمة جديدة'], stats: [], members: [] },
  profilePayloadVersion: 1, proposedText: '', createdAt: '2026-08-25T08:00:00.000Z',
};
const entries = mapDecidedEditRequestsToHistory([
  { ...profileRequest, status: 'pending' },
  { ...profileRequest, id: 'approved-id', status: 'approved' },
]);
const model = buildEditAuditViewModel(entries);
assert.equal(model.entries.length, 1);
assert.equal(model.entries[0].id, 'approved-id');
assert.equal(model.entries[0].decision, 'APPROVED');
assert.equal(model.entries[0].actions.length, 0);
assert.ok(model.entries[0].diffs.every((row) => !row.oldValue.includes('{') && !row.newValue.includes('{')));
```

- [ ] **Step 2: Run the workflow test and confirm RED**

Run: `node --test tests/executiveEditWorkflow.test.mjs`

Expected: FAIL because `buildEditAuditViewModel` does not exist.

- [ ] **Step 3: Build and render the read-only audit view model**

Implement `buildEditAuditViewModel(entries)` so it rejects pending input defensively, carries only final metadata/diffs, and always emits an empty `actions` array. Render that model through `EditDiffTable`. Keep applicant, committee, decision, reviewer note, and final date. Render `detailsUnavailable` as the safe legacy message. Do not add buttons, editable controls, or request decisions to the audit panel.

- [ ] **Step 4: Run focused tests, typecheck, and confirm GREEN**

Run:

```powershell
node --test tests/executiveEditWorkflow.test.mjs tests/editRequestHistory.test.mjs
npm run typecheck
```

Expected: all commands exit successfully.

### Task 9: Full Local Regression and Security Verification

**Files:**
- Verify all files changed by Tasks 1–8.

**Interfaces:**
- Consumes: complete local implementation.
- Produces: fresh evidence for correctness before live database mutation.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: zero failed, cancelled, skipped, or pending test markers.

- [ ] **Step 2: Run TypeScript and lint checks**

Run:

```powershell
npm run typecheck
npm run lint
```

Expected: both commands exit `0` with no errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Vite completes and writes `dist`; chunk-size or Browserslist notices are warnings only.

- [ ] **Step 4: Review the requirement checklist against the spec**

Confirm every acceptance criterion in the design has either an automated test or direct build/type evidence. Confirm no file under the student join-request flow changed.

- [ ] **Step 5: Run a local browser UI check**

Start the existing Vite development server, open the committee page and president pending/history tabs with controlled local test state, and verify the red/green table, three president actions, exact member toast, pending-disabled buttons, and absence of raw JSON at desktop and narrow viewport widths. Do not mutate live Supabase during this local visual check.

### Task 10: Live Supabase Rollout and End-to-End Verification

**Files:**
- Apply: the CLI-generated migration from Task 3 to project `rscunkzvbsdbjzhnuria`.

**Interfaces:**
- Consumes: locally verified migration and frontend.
- Produces: live structured workflow, live SQL audit evidence, and one controlled end-to-end test only when explicitly authorized.

- [ ] **Step 1: Obtain action-time confirmation before mutating the live project**

Ask the user to confirm applying the named migration to the official Supabase project. Do not run live SQL before that confirmation.

- [ ] **Step 2: Apply the migration through the authenticated Supabase dashboard or authenticated CLI**

Use the official project ref `rscunkzvbsdbjzhnuria`. Do not create another project or database.

- [ ] **Step 3: Run read-only live schema/security audits**

Verify:

```sql
select
  to_regprocedure('public.submit_profile_edit_request(jsonb,integer)') is not null as submit_ready,
  to_regprocedure('public.approve_profile_edit_request(uuid,jsonb,text)') is not null as approve_ready,
  to_regprocedure('public.reject_profile_edit_request(uuid,text)') is not null as reject_ready,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'edit_requests_pending_profile_owner_idx'
  ) as pending_index_ready;
```

Also verify RLS remains enabled on `edit_requests`, direct authenticated mutation remains revoked, and new function execute grants are limited to `authenticated`.

- [ ] **Step 4: Verify pending-row routing without making a president decision**

Run a read-only count showing pending profile rows separately from decided rows. Confirm pending rows are absent from the frontend audit selector and present in the president pending selector.

- [ ] **Step 5: Request separate confirmation for a real end-to-end request/decision test**

Creating and deciding a real request changes production data. If authorized, use a designated existing executive test account, submit one harmless responsibility-text change, confirm duplicate rejection, approve it, refresh, verify persistence, and restore the original value through another approved request. If not authorized, stop after read-only live verification and report that the production mutation test was intentionally not performed.
