# Executive Board Edit Approval Workflow Design

## Purpose

Repair the executive-board content edit workflow so that committee content changes are submitted once, reviewed only by the current president, published atomically after approval, and shown as readable field-level comparisons. Personal profile fields remain outside this workflow and continue to save directly.

## Scope

This workflow covers only public committee content managed from the executive-board committee page:

- responsibilities;
- committee statistics;
- committee member list text and allowed member-list changes.

The following remain direct own-profile updates and are not copied into an approval request:

- executive account name;
- contact email;
- biography;
- personal avatar.

Position and permission transfers remain president-only through the existing assignment-transfer workflow. Student join requests and their screens are out of scope and must not change.

## Root Cause

The existing implementation has four independent gaps:

1. `mapEditRequestToHistory` converts pending database rows into audit entries, so an undecided request appears in the read-only history.
2. `decide_edit_request` marks a profile request approved without publishing the committee content in the same database transaction. React then updates `committees` locally, so the decision and publication can diverge and the content can disappear after refresh.
3. The member UI detects an existing request but neither disables all edit actions nor enforces uniqueness on the server. Concurrent submissions can therefore create duplicates.
4. The audit UI renders flattened fallback strings, including raw JSON when an envelope cannot be parsed, instead of carrying structured diffs through the domain model.

## Chosen Architecture

Keep the existing `edit_requests` table as the institutional request ledger, but add structured profile-edit columns and dedicated profile RPCs. This mirrors the already working structured site-content approval design without creating a second audit system.

Database status remains the existing canonical `pending`, `approved`, or `rejected` value. The React/domain model presents `pending` as `PENDING_APPROVAL`. This avoids a destructive status rename shared with site edits while preserving the requested administrative meaning.

## Database Design

Add these nullable columns to `public.edit_requests`:

- `profile_base_snapshot jsonb`: the server-confirmed committee content at submission time, restricted to the approval-managed fields;
- `profile_proposed_snapshot jsonb`: the sanitized proposed committee content;
- `profile_payload_version integer`: `1` for the structured format.

The authoritative committee is the existing `committee_key`, derived from the caller's current `executive_assignments` row. No committee identifier supplied by the browser is trusted.

Add a partial lookup index on `(submitted_by, committee_key, submitted_at desc)` for `edit_type = 'profile' and status = 'pending'`. Duplicate prevention is enforced inside the submission RPC under a transaction-scoped advisory lock keyed by the authenticated UUID and committee. This supports existing legacy duplicates without silently deciding them, while preventing every new duplicate including concurrent requests.

Direct table mutation remains revoked from `authenticated`. All privileged functions use `SECURITY DEFINER`, an empty `search_path`, explicit `auth.uid()` and current-assignment checks, and explicit execute grants. The generic `submit_edit_request` RPC must reject `profile` so callers cannot bypass the dedicated structured RPC.

## Structured Snapshots

A structured profile snapshot contains only:

```ts
interface ExecutiveContentSnapshot {
  responsibilities: string[];
  stats: Array<{ label: string; value: string }>;
  members: Array<{
    id: string;
    name: string;
    position: string;
    photo: string;
  }>;
}
```

`head`, login identity, role, permission, login email, and arbitrary keys are rejected. Member IDs are opaque and hidden from the UI. Existing member IDs and protected photo references cannot be replaced through president text editing. New member identifiers are normalized by the server-side workflow rather than treated as authority supplied by the browser.

Payload size and array lengths receive conservative limits before insertion so a committee request cannot become an oversized JSON document.

## Submission RPC

Create `public.submit_profile_edit_request(p_proposed_snapshot jsonb, p_payload_version integer default 1)`.

The function performs these actions in one transaction:

1. Require an authenticated, active executive assignment other than the president's direct-publication case.
2. Derive the committee from the assignment.
3. Acquire an advisory lock for the caller and committee.
4. Reject when another pending profile request already exists for that caller and committee using a stable `PROFILE_EDIT_ALREADY_PENDING` error.
5. Read the current `committees` payload from `published_site_content` and build the allowed base snapshot.
6. Validate and sanitize the proposed snapshot.
7. Reject a no-op proposal.
8. Insert one `pending` request with both structured snapshots and the human-facing applicant metadata envelope.
9. Return the confirmed inserted row.

The frontend closes the edit modal only after the confirmed row returns, refreshes the request list, disables committee content editing while that request remains pending, and shows exactly:

> تم إرسال طلب التعديل بنجاح وهو قيد انتظار موافقة رئيس الاتحاد

Transport errors, authorization errors, and duplicate errors keep the modal/content unchanged and display a specific Arabic error.

## Approval and Rejection RPCs

Create `public.approve_profile_edit_request(p_request_id uuid, p_revised_snapshot jsonb default null, p_decision_note text default null)`.

The function performs one atomic transaction:

1. Require the current president.
2. Lock the pending request and `published_site_content.main` row.
3. Validate that the request is a structured profile request and still pending.
4. Select the submitted proposal or the president's revised proposal.
5. Compare only the fields targeted by the request against the saved base and current committee data. If a targeted field changed concurrently, return `PROFILE_EDIT_STALE` and leave the request pending.
6. Revalidate the final structured snapshot, preserving protected identifiers and the committee head.
7. Replace only the matching committee's allowed content inside `published_site_content.content->committees`, incrementing the content version.
8. Mark the same request `approved`, recording reviewer, review time, final structured proposal, and an edited-approval note when applicable.
9. Return both the confirmed request and publication envelope.

React applies only this returned publication. It never publishes a committee locally before database confirmation.

Create `public.reject_profile_edit_request(p_request_id uuid, p_decision_note text default null)`. It requires the current president, locks the pending request, marks it rejected, records reviewer/time, and never changes published committee content.

## President Review UI

The `طلبات تعديل الهيئة` tab remains president-only and lists only `PENDING_APPROVAL` profile requests. Every request card shows applicant, committee, submission time, and a structured comparison table.

Actions:

- **موافقة:** invokes atomic approval with the submitted structured proposal.
- **رفض:** invokes the dedicated rejection RPC.
- **تعديل الطلب:** opens a structured editor for the proposed responsibilities, statistic labels/values, and member names/positions. It does not expose IDs, login data, roles, permissions, or raw JSON. Saving this dialog invokes atomic approval with the revised structured proposal.

Buttons are disabled while a request action is running. An RPC failure leaves the card pending and visible with an Arabic error. A successful decision removes it from the pending tab only after the confirmed database response.

## Human-Readable Diff Component

Add one reusable component, `EditDiffTable`, backed by pure domain diff builders. Each row has:

- a localized field label;
- the original value in a red panel;
- the proposed or president-revised value in a green panel.

Arrays are formatted as readable lines:

- responsibilities: one responsibility per line;
- statistics: `القيمة — المسمى`;
- members: `الاسم — المسؤولية`.

Technical IDs and unrecognized object keys are never rendered. The component never receives raw `snapshot`, `payload`, or serialized JSON. If a legacy request cannot be parsed safely, the panel displays a neutral `تعذر قراءة تفاصيل هذا الطلب القديم` notice and permits rejection only.

The same component is used in both the pending review screen and the audit history so the comparison format is consistent.

## Audit History

Create a domain selector that maps only database rows with status `approved` or `rejected` to `EditsHistoryEntry`. Pending rows never enter the audit model.

`EditsHistoryEntry` carries structured `diffs` instead of depending on `originalText` and `proposedText` for presentation. The audit panel is read-only and exposes no mutation controls. It displays the final revised values for an edited approval and the submitted values for a normal approval or rejection.

Existing ownership visibility remains unchanged: the president sees all final decisions; another executive sees only their own final requests; students see no administrative history.

## Existing Data Migration

The migration backfills parseable legacy profile envelopes into the structured proposed snapshot. For pending parseable rows, the current published committee snapshot becomes the safe base used by the corrected approval flow. These rows remain pending and move to the president's pending tab; they are not shown in audit history.

Pending legacy rows that cannot be parsed safely remain visible to the president as unreadable legacy requests. They cannot be approved or edited because their intended change is unknown, but the president can reject them. No migration fabricates an approval or rejection decision.

Existing approved/rejected rows remain immutable audit records. When their envelope is parseable, the UI derives structured diff rows; otherwise it shows the safe legacy notice without dumping JSON.

## Realtime and State Flow

The existing `edit_requests` Realtime subscription continues to refresh RLS-visible requests. `published_site_content` Realtime remains the source of truth for the public committee view. A decision response updates local state immediately from the confirmed publication, while Realtime provides cross-device convergence.

No LocalStorage request or history row becomes authoritative. Local legacy history stays president-only and read-only under its existing unverified label.

## Error Handling

Stable service error codes are mapped to Arabic messages:

- `PROFILE_EDIT_ALREADY_PENDING`: an existing request must be decided first;
- `PROFILE_EDIT_NO_CHANGES`: no changed committee content exists;
- `PROFILE_EDIT_STALE`: the committee changed after submission and the page must refresh;
- `PROFILE_EDIT_INVALID`: the structured content failed validation;
- authorization errors: the caller is no longer the assigned executive or president;
- transport/unknown outcome: no local success is inferred and the authoritative rows are refreshed.

## Testing Strategy

Tests are written before implementation and cover:

1. the submission gateway calling only the dedicated profile RPC with structured payload;
2. duplicate submission prevention, including the advisory-lock and pending-row check in the migration;
3. generic `submit_edit_request` rejecting profile edits;
4. atomic approval publishing `committees` and deciding the request in one function;
5. rollback behavior when validation, authorization, or stale-content detection fails;
6. rejection leaving published content unchanged;
7. history selectors excluding every pending row;
8. RLS ownership visibility remaining unchanged;
9. diff builders emitting only changed localized rows and hiding IDs/unknown keys;
10. edited approval history displaying final revised values;
11. member UI displaying the exact success message and disabling edits during a pending request;
12. president UI providing approve, reject, and edit-before-approve actions;
13. legacy invalid requests never rendering raw JSON or becoming approvable;
14. full test, typecheck, lint, production build, and live SQL verification after deployment.

## Acceptance Criteria

- A non-president executive can have at most one pending committee-content request for their assigned committee.
- Personal profile name, contact email, biography, and avatar continue to save directly.
- No pending request appears in audit history.
- Approval and committee publication are atomic and durable across refresh, logout, and devices.
- Rejection does not change public committee content.
- The president can revise allowed text before atomic approval.
- Both pending and final screens show human-readable changed fields with red/green comparison and no raw JSON or technical IDs.
- Existing safe pending requests are retained in the corrected approval route.
- Student join-request screens and logic are unchanged.
