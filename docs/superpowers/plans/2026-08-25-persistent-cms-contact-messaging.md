# Persistent CMS and Contact Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist CMS changes and approvals, guide/FAQ CRUD, dynamic map settings, visitor messages, in-app student replies, and Resend delivery in the official Supabase project.

**Architecture:** General published content remains in the existing versioned `published_site_content` row, while guide and FAQ use separate versioned singleton tables. Structured media drafts extend the current `edit_requests` workflow, and database RPCs make approval plus publication atomic. Contact messages and one permanent reply per message are protected by RLS; signed-in students read replies in-app, while an authenticated Supabase Edge Function sends visitor replies through Resend.

**Tech Stack:** React 18, TypeScript 5, Vite, `@supabase/supabase-js` 2.57, PostgreSQL/RLS/RPC, Supabase Realtime, Supabase Edge Functions (Deno), Resend HTTP API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-25-persistent-cms-contact-messaging-design.md`

## Global Constraints

- Preserve the existing join-request screens, states, and logic exactly.
- Never expose a Supabase service-role key or `RESEND_API_KEY` in Vite/browser environment variables.
- President CMS changes publish immediately; media-head changes remain pending until president approval.
- Approval and publication must commit or fail together.
- A contact inquiry accepts one administrative reply; email retries reuse that reply.
- Signed-out messages are never linked to an account by matching email.
- All public-schema tables must have RLS plus explicit minimum grants.
- All privileged functions must revoke `PUBLIC` execute, use `security definer set search_path = ''`, schema-qualified relations, and authoritative database role checks.
- Work directly in the project; do not create GitHub branches, pull requests, or commits.

---

### Task 1: Pure validation and contact-map normalization

**Files:**

- Create: `src/domain/cmsValidation.ts`
- Create: `src/domain/contactMap.ts`
- Create: `tests/cmsValidation.test.mjs`
- Create: `tests/contactMap.test.mjs`
- Modify: `src/pages/StudentGuide.tsx`
- Modify: `src/pages/FAQPage.tsx`

**Interfaces:**

- Produces `validateGuideSection`, `validateGuideItem`, `validateGuideContact`, `validateFaqCategory`, and `validateFaqItem`, each returning `{ valid: boolean; invalid: string[] }` with visible field IDs.
- Produces `normalizeGoogleMapsInput(input: string): { ok: true; embedUrl: string; openUrl: string } | { ok: false; error: string }`.

- [ ] **Step 1: Write failing validation regression tests**

```js
assert.deepEqual(
  validateGuideSection({ label: 'السكن', title: 'دليل السكن', intro: 'مقدمة' }),
  { valid: true, invalid: [] },
);
assert.deepEqual(
  validateFaqItem({ question: 'كيف أسجل؟', answer: 'من صفحة التسجيل' }),
  { valid: true, invalid: [] },
);
assert.deepEqual(
  validateGuideItem({ heading: '  ', body: 'شرح' }),
  { valid: false, invalid: ['itemHeading'] },
);
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `node --test tests/cmsValidation.test.mjs`

Expected: failure because `src/domain/cmsValidation.ts` does not exist.

- [ ] **Step 3: Implement semantic-to-visible-field validation**

```ts
type ValidationResult = { valid: boolean; invalid: string[] };

const required = (pairs: ReadonlyArray<readonly [string, unknown]>): ValidationResult => {
  const invalid = pairs
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([field]) => field);
  return { valid: invalid.length === 0, invalid };
};

export const validateGuideSection = (value: { label: string; title: string; intro: string }) =>
  required([['secLabel', value.label], ['secTitle', value.title], ['secIntro', value.intro]]);
```

Implement the other four functions with these exact mappings: `itemHeading/heading`, `itemBody/body`, `contactLabel/label`, `contactValue/value`, `catTitle/title`, `qQuestion/question`, and `qAnswer/answer`.

- [ ] **Step 4: Run the validation tests and confirm GREEN**

Run: `node --test tests/cmsValidation.test.mjs`

Expected: all validation cases pass.

- [ ] **Step 5: Write failing map normalization tests**

```js
assert.equal(
  normalizeGoogleMapsInput('https://www.google.com/maps?q=Erzurum&output=embed').ok,
  true,
);
assert.equal(
  normalizeGoogleMapsInput('<iframe src="https://www.google.com/maps/embed?pb=abc"></iframe>').ok,
  true,
);
assert.deepEqual(
  normalizeGoogleMapsInput('<iframe src="https://evil.example/phish"></iframe>'),
  { ok: false, error: 'رابط الخريطة يجب أن يكون من Google Maps عبر HTTPS.' },
);
```

- [ ] **Step 6: Run the map tests and confirm RED**

Run: `node --test tests/contactMap.test.mjs`

Expected: failure because `normalizeGoogleMapsInput` does not exist.

- [ ] **Step 7: Implement safe URL extraction and normalization**

Accept direct URLs and extract a quoted `src` from iframe text. Parse with `URL`, require `https:`, allow only `google.com`, `www.google.com`, and `maps.google.com`, and require `/maps` at the start of the pathname. Return an `openUrl` derived by removing `output=embed` when possible; never return or render raw HTML.

- [ ] **Step 8: Connect the guide/FAQ forms to the pure validators**

Replace calls that search for `secTitle`, `qQuestion`, and similar names inside unrelated form objects with the matching domain validator. Set `invalid` from the returned result, focus `fieldId(result.invalid[0])`, and submit only when `valid` is true.

- [ ] **Step 9: Run focused tests and type checking**

Run: `node --test tests/cmsValidation.test.mjs tests/contactMap.test.mjs`

Run: `npm run typecheck`

Expected: both commands succeed.

---

### Task 2: Database schema, migration seed, RLS, and transactional RPC contracts

**Files:**

- Create via CLI: `supabase/migrations/<timestamp>_persistent_cms_contact_messaging.sql`
- Create: `tests/supabaseCmsContactMigration.test.mjs`

**Interfaces:**

- Produces tables `student_guide`, `faq`, `contact_messages`, and `contact_message_replies`.
- Extends `edit_requests` with `site_target`, `site_payload`, `site_base_version`, and `site_payload_version`.
- Produces RPCs `submit_site_edit_request`, `publish_cms_target`, `approve_site_edit_request`, `reject_site_edit_request`, `submit_contact_message`, `mark_contact_message_read`, and `reply_to_contact_message`.

- [ ] **Step 1: Discover the installed Supabase CLI interface**

Run: `npx supabase --version`

Run: `npx supabase migration new --help`

Expected: both commands print their current CLI contract.

- [ ] **Step 2: Create the migration through the CLI**

Run: `npx supabase migration new persistent_cms_contact_messaging`

Expected: exactly one timestamped migration file is created.

- [ ] **Step 3: Write failing migration contract tests**

The test locates the migration by the `_persistent_cms_contact_messaging.sql` suffix and asserts behavior-bearing SQL contracts, including:

```js
for (const table of ['student_guide', 'faq', 'contact_messages', 'contact_message_replies']) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
}
assert.match(sql, /unique\s*\(message_id\)/i);
assert.match(sql, /status in \('UNREAD', 'READ', 'REPLIED'\)/i);
assert.match(sql, /revoke execute on function public\.reply_to_contact_message/i);
assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|all)[^;]*contact_messages[^;]*to anon/i);
```

Also extract each privileged function body and assert `security definer set search_path = ''`, an explicit `auth.uid()` check where authentication is required, and schema-qualified table names.

- [ ] **Step 4: Run the migration test and confirm RED**

Run: `node --test tests/supabaseCmsContactMigration.test.mjs`

Expected: failures for missing tables, policies, constraints, and functions.

- [ ] **Step 5: Implement tables, constraints, seeds, grants, policies, and indexes**

Use bounded text checks such as:

```sql
constraint contact_messages_name_length check (char_length(btrim(sender_name)) between 2 and 120),
constraint contact_messages_email_length check (char_length(btrim(sender_email)) between 5 and 320),
constraint contact_messages_subject_length check (char_length(btrim(subject)) between 2 and 200),
constraint contact_messages_body_length check (char_length(btrim(message)) between 5 and 5000)
```

Seed guide/FAQ with `insert ... select` from `published_site_content.content -> 'guideSections'`, `->> 'guideQuickInfo'`, and `-> 'faqCategories'`. Use `on conflict (id) do nothing` so rerunning the migration does not overwrite newer content.

Create partial indexes for pending site requests and pending/failed email replies, plus composite indexes on `(sender_user_id, created_at desc)` and `(status, created_at desc)`.

- [ ] **Step 6: Implement transactional CMS functions**

`publish_cms_target` accepts `p_target text`, `p_payload jsonb`, and `p_expected_version bigint`. It permits only the current president and routes `guideSections`/`guideQuickInfo` to `student_guide`, `faqCategories` to `faq`, and all other whitelisted targets to `published_site_content` with optimistic version checks.

`submit_site_edit_request` permits only the current media head, stores the complete target snapshot and base version, and creates a pending edit row.

`approve_site_edit_request` locks the request with `for update`, permits only the current president, publishes the stored or revised payload at the captured version, and marks the request approved in the same transaction. On version mismatch raise SQLSTATE `40001` with `CONTENT_VERSION_CONFLICT`.

- [ ] **Step 7: Implement contact functions**

`submit_contact_message` captures `(select auth.uid())` internally and accepts only name, email, subject, and message. It returns the inserted row UUID but grants callers no direct table insert.

`reply_to_contact_message` verifies current role `PRESIDENT` or `VICE_PRESIDENT`, locks the message, inserts one reply, snapshots name/role, selects `IN_APP/NOT_REQUIRED` when `sender_user_id is not null` and `EMAIL/PENDING` otherwise, and changes message status to `REPLIED`.

- [ ] **Step 8: Run the migration tests and confirm GREEN**

Run: `node --test tests/supabaseCmsContactMigration.test.mjs tests/supabaseIdentityMigration.test.mjs tests/managedAssetsMigration.test.mjs`

Expected: new and existing migration/security contracts all pass.

---

### Task 3: Versioned CMS repositories and structured approval gateway

**Files:**

- Create: `src/domain/sectionContentRepository.ts`
- Create: `src/services/sectionContentService.ts`
- Modify: `src/domain/siteContentRepository.ts`
- Modify: `src/services/siteContentService.ts`
- Modify: `src/domain/editRequestGateway.ts`
- Modify: `src/services/editRequestService.ts`
- Create: `tests/sectionContentRepository.test.mjs`
- Modify: `tests/siteContentRepository.test.mjs`
- Modify: `tests/editApprovalPolicy.test.mjs`

**Interfaces:**

- Produces `loadStudentGuide`, `loadFaq`, and `publishCmsTarget(target, payload, expectedVersion)`.
- Changes `submitEditRequest` site calls to send structured target/payload/base-version fields.
- Changes approval to call the atomic `approve_site_edit_request` RPC and receive the published snapshot/version.

- [ ] **Step 1: Write failing repository mapping tests**

```js
assert.deepEqual(await repo.loadGuide(), {
  ok: true,
  data: { quickInfo: 'نصيحة', sections: [{ id: 's1' }], version: 3, updatedAt: '2026-08-25T10:00:00Z' },
});
assert.equal((await repo.publish('faqCategories', [], 4)).error.code, 'CONTENT_VERSION_CONFLICT');
```

Include malformed JSON, missing singleton, and Supabase error cases.

- [ ] **Step 2: Run focused repository tests and confirm RED**

Run: `node --test tests/sectionContentRepository.test.mjs tests/siteContentRepository.test.mjs`

Expected: missing repository/RPC behavior failures.

- [ ] **Step 3: Implement strict row mappers and RPC adapters**

Map only safe integers for versions, arrays for sections/categories, strings for timestamps and quick info, and return Arabic repository errors without leaking raw database details to UI.

Use the exact RPC argument contract:

```ts
client.rpc('publish_cms_target', {
  p_target: target,
  p_payload: payload,
  p_expected_version: expectedVersion,
});
```

- [ ] **Step 4: Change site request submission and approval adapters**

Preserve the current `PendingSiteEdit` UI shape, but serialize new requests through `submit_site_edit_request` with `site_payload` as the full proposed target. Approval must consume the row returned by `approve_site_edit_request`; do not call `review_edit_request` followed by a local setter.

- [ ] **Step 5: Run repository, approval, and history tests**

Run: `node --test tests/sectionContentRepository.test.mjs tests/siteContentRepository.test.mjs tests/editApprovalPolicy.test.mjs tests/editSubmissionAwait.test.mjs`

Expected: all pass.

---

### Task 4: AppContext persistence and CMS page integration

**Files:**

- Modify: `src/context/AppContext.tsx`
- Modify: `src/components/AboutContentCMS.tsx`
- Modify: `src/components/HomepageContentCMS.tsx`
- Modify: `src/pages/StudentGuide.tsx`
- Modify: `src/pages/FAQPage.tsx`
- Modify: `src/pages/ProgramsPage.tsx`
- Modify: `src/pages/MediaGallery.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Create: `tests/cmsPersistenceFlow.test.mjs`

**Interfaces:**

- AppContext exposes versioned guide and FAQ persistence while retaining existing page-facing state names.
- `savePublishedSiteTarget` routes every target to `publishCmsTarget`.
- `submitSiteEdit` includes the proposed full target snapshot.
- `approveSiteEdit` and `approveSiteEditWithChanges` publish only through the atomic approval RPC.

- [ ] **Step 1: Write failing application-flow tests**

Test observable contracts: a president save awaits the publish result before applying state; a media submit does not alter published state; an approval result applies the database-returned content; and guide/FAQ setters are not treated as publication operations.

- [ ] **Step 2: Run the CMS flow tests and confirm RED**

Run: `node --test tests/cmsPersistenceFlow.test.mjs`

Expected: current local-only approval and guide/FAQ mutation paths fail the contracts.

- [ ] **Step 3: Load and subscribe to the three published authorities**

On provider startup, load `published_site_content`, `student_guide`, and `faq`. Subscribe to their singleton rows through separate Realtime channels. Guard version monotonicity with refs so stale events cannot replace newer content.

- [ ] **Step 4: Route president and media mutations correctly**

For each page mutation, calculate the next immutable snapshot first. President calls `savePublishedSiteTarget`; media head calls `submitSiteEdit` with that snapshot and leaves displayed published state unchanged. Remove direct `setGuideSections`, `setFaqCategories`, and `setContactCards` publication paths from submit handlers.

- [ ] **Step 5: Make approval database-authoritative**

Replace the current `reviewEditRequest(...); publishApprovedSiteValue(...)` sequence with one atomic approval call. Apply only the published content/version returned by the database. On `CONTENT_VERSION_CONFLICT`, keep the request pending and show the refresh/re-review message.

- [ ] **Step 6: Correct About-page media behavior**

Use `updateAboutFields` or the structured media submission path in every `AboutContentCMS` section. Media head must never call president-only `savePublishedSiteTarget` directly.

- [ ] **Step 7: Run focused and existing CMS tests**

Run: `node --test tests/cmsPersistenceFlow.test.mjs tests/editSubmissionAwait.test.mjs tests/editApprovalPolicy.test.mjs tests/siteContentRepository.test.mjs tests/sectionContentRepository.test.mjs`

Run: `npm run typecheck`

Expected: all pass.

---

### Task 5: Contact repository, dynamic map editor, and durable submission

**Files:**

- Create: `src/domain/contactMessagingRepository.ts`
- Create: `src/services/contactMessagingService.ts`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/pages/ContactPage.tsx`
- Create: `tests/contactMessagingRepository.test.mjs`
- Create: `tests/contactSubmission.test.mjs`

**Interfaces:**

- Produces `submitContactMessage`, `listVisibleContactMessages`, `markContactMessageRead`, `replyToContactMessage`, and `retryContactReplyEmail`.
- AppContext `addContactMessage` becomes `submitContactMessage(input): Promise<{ ok: boolean; error?: string }>`.
- Adds `contactMap` and `saveContactMap` to AppContext.

- [ ] **Step 1: Write failing contact repository tests**

Cover a successful visitor submission, a signed-in submission, invalid response rows, unauthorized listing, reply uniqueness conflict, and delivery-state mapping.

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test tests/contactMessagingRepository.test.mjs tests/contactSubmission.test.mjs`

Expected: missing repository/service behavior.

- [ ] **Step 3: Implement strict message/reply domain types and RPC calls**

```ts
export type ContactMessageStatus = 'UNREAD' | 'READ' | 'REPLIED';
export type ContactDeliveryStatus = 'NOT_REQUIRED' | 'PENDING' | 'SENT' | 'FAILED';
export interface ContactReply {
  id: string;
  messageId: string;
  replyText: string;
  repliedByName: string;
  repliedByRole: 'PRESIDENT' | 'VICE_PRESIDENT';
  repliedAt: string;
  deliveryStatus: ContactDeliveryStatus;
}
```

Validate every server row before returning it to React.

- [ ] **Step 4: Make ContactPage submission asynchronous and durable**

Keep the existing visible required fields. Disable the submit button while awaiting RPC, show success only after the database confirms insertion, preserve entered data on failure, and display a retryable Arabic error.

- [ ] **Step 5: Add the map editor**

Show edit controls only to president/media head. Preview the normalized map before save. President publishes `contactMap` immediately; media head submits it as pending. Render only `contactMap.embedUrl` in iframe `src` and `contactMap.openUrl` in the external link.

- [ ] **Step 6: Run focused tests and type checking**

Run: `node --test tests/contactMessagingRepository.test.mjs tests/contactSubmission.test.mjs tests/contactMap.test.mjs`

Run: `npm run typecheck`

Expected: all pass.

---

### Task 6: President/vice-president inbox and reply workflow

**Files:**

- Create: `src/domain/contactInboxPolicy.ts`
- Create: `src/components/ContactInbox.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Modify: `src/context/AppContext.tsx`
- Create: `tests/contactInboxPolicy.test.mjs`

**Interfaces:**

- `ContactInbox` consumes messages, loading/error state, `markRead`, `reply`, and `retryEmail` callbacks.
- Dashboard tab visibility is exactly `role === 'PRESIDENT' || role === 'VICE_PRESIDENT'`.

- [ ] **Step 1: Write failing role and reply-state tests**

Assert the policy returns true only for president/vice president, prevents reply submission for an already replied message, and permits retry only for visitor replies in `FAILED` state.

- [ ] **Step 2: Run the policy test and confirm RED**

Run: `node --test tests/contactInboxPolicy.test.mjs`

Expected: missing inbox policy module or behavior.

- [ ] **Step 3: Implement inbox UI and exact role gate**

Add the tab label `رسائل الزوار / البريد الوارد`. Display sender name/email, subject, message, creation time, `UNREAD/READ/REPLIED`, responder name/role/time, and email delivery state. Opening an unread message awaits `markContactMessageRead`.

- [ ] **Step 4: Implement reply and delivery flow**

Disable the reply form while saving. After the reply RPC succeeds, invoke `send-contact-reply` only when delivery channel is `EMAIL`. For `FAILED`, retain the saved reply and show `إعادة إرسال البريد`; never enable a second reply form.

- [ ] **Step 5: Subscribe to inbox changes**

Subscribe only while current role is president or vice president. Clear message state immediately when the authenticated identity changes or loses permission.

- [ ] **Step 6: Run inbox and authorization tests**

Run: `node --test tests/contactInboxPolicy.test.mjs tests/contactMessagingRepository.test.mjs`

Run: `npm run typecheck`

Expected: all pass.

---

### Task 7: Student in-app message history

**Files:**

- Create: `src/domain/studentMessagesPolicy.ts`
- Create: `src/components/StudentMessages.tsx`
- Modify: `src/pages/StudentDashboard.tsx`
- Modify: `src/context/AppContext.tsx`
- Create: `tests/studentMessagesPolicy.test.mjs`
- Create: `tests/studentDashboardRendering.test.mjs`

**Interfaces:**

- `StudentMessages` displays only already-authorized rows returned by Supabase.
- The student dashboard renders the section only for an accepted member with normal dashboard access; removed/banned and pre-acceptance screens remain unchanged.

- [ ] **Step 1: Write failing student visibility tests**

Assert accepted students see the component, pending/interview/removed students do not, and rows with a different `senderUserId` are filtered defensively.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/studentMessagesPolicy.test.mjs`

Expected: missing policy/component behavior.

- [ ] **Step 3: Implement the portal section**

Display each inquiry's subject, text, date, and status. For replied rows show reply text, responder role/name, and reply date. For pending rows show `قيد انتظار رد الإدارة`.

- [ ] **Step 4: Load and subscribe under confirmed auth ownership**

Use the same auth-epoch/confirmed-owner safeguards already used by AppContext. Clear prior student's messages before loading the next session. Subscribe with `sender_user_id=eq.<current uuid>` and ignore events after identity change.

- [ ] **Step 5: Run student access regression tests**

Run: `node --test tests/studentMessagesPolicy.test.mjs tests/studentAccess.test.mjs tests/studentDashboardRendering.test.mjs`

Run: `npm run typecheck`

Expected: all pass and existing PENDING/INTERVIEW/REMOVED rendering is unchanged.

---

### Task 8: Resend Supabase Edge Function

**Files:**

- Create: `supabase/functions/send-contact-reply/index.ts`
- Create: `supabase/functions/send-contact-reply/deno.json`
- Create: `supabase/functions/send-contact-reply/email.ts`
- Create: `tests/contactReplyEmail.test.mjs`

**Interfaces:**

- Function request: `{ "replyId": "uuid" }` with authenticated bearer token.
- Resend request: `POST https://api.resend.com/emails` with `from`, `to`, `subject`, `text`, and escaped `html`.
- Function response: `{ ok: true, status: 'SENT' | 'ALREADY_SENT' }` or a bounded error JSON response.

- [ ] **Step 1: Write failing email composition and authorization tests**

Test HTML escaping for `<`, `>`, `&`, quotes; header/body construction; missing bearer token; non-leadership role; in-app reply rejection; already-sent idempotency; provider success; and provider failure recording.

- [ ] **Step 2: Run the email tests and confirm RED**

Run: `node --test tests/contactReplyEmail.test.mjs`

Expected: missing email module/function behavior.

- [ ] **Step 3: Implement pure email composition**

```ts
export const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
```

Compose both plain text and escaped HTML. Include the original subject and the responder's institutional role; do not include private database identifiers.

- [ ] **Step 4: Implement authenticated, idempotent Edge Function handling**

Create a request-scoped user client with the bearer token to resolve the caller, a service-role client for protected rows, and verify the authoritative profile role before sending. Read secrets only with `Deno.env.get`. Record bounded provider errors and increment attempts exactly once per send attempt.

- [ ] **Step 5: Run the email tests and static verification**

Run: `node --test tests/contactReplyEmail.test.mjs`

Run: `npx supabase functions serve --help`

Expected: tests pass and the installed CLI documents function serving.

---

### Task 9: Full local verification and live Supabase deployment

**Files:**

- Modify only if verification reveals a scoped defect in files from Tasks 1-8.

**Interfaces:**

- Produces verified local code, one unapplied migration until confirmation, and one deployable Edge Function.

- [ ] **Step 1: Run the complete local verification suite**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

Run: `npx eslint src tests scripts`

Expected: all tests, type checking, and build pass; lint has no new errors or warnings.

- [ ] **Step 2: Review migration security before external changes**

Confirm all new tables have RLS, explicit grants are minimum, no anonymous direct message-table privileges exist, every definer function has empty search path and revoked public execution, and indexed policy columns match access patterns.

- [ ] **Step 3: Ask for action-time confirmation**

Before changing the live official project, present the exact migration filename, new tables/functions/policies, Edge Function name, and secret names. Request confirmation to apply permission changes and deploy the function.

- [ ] **Step 4: Apply the migration after confirmation**

Use the available Supabase SQL/MCP/browser route for project `rscunkzvbsdbjzhnuria`. Run read-only audit queries immediately afterward to verify table existence, RLS, policies, explicit grants, function execute privileges, seed row counts, and preserved guide/FAQ content.

- [ ] **Step 5: Configure Resend secrets after the user supplies them**

Store only `RESEND_API_KEY`, `CONTACT_REPLY_FROM`, and `SITE_PUBLIC_URL` as Supabase Function secrets. Never echo secret values in logs or save them in repository files.

- [ ] **Step 6: Deploy and verify the Edge Function**

Deploy `send-contact-reply`. Verify unauthorized requests return 401/403, in-app replies do not call Resend, and a controlled visitor reply changes `PENDING` to `SENT`. If a verified sender is not yet available, verify the failure/retry path without claiming live email delivery.

- [ ] **Step 7: Run role-based browser smoke tests**

Verify:

1. president content persists after refresh;
2. media content stays pending and invisible publicly;
3. president approval publishes and persists;
4. guide/FAQ add, edit, and delete persist;
5. map edits follow direct/pending roles;
6. visitor submission appears only in president/vice inbox;
7. president and vice cannot both reply to one message;
8. accepted student sees only their own in-app reply;
9. PENDING, INTERVIEW, REMOVED, and BANNED student screens remain unchanged; and
10. join-request screens and actions are unchanged.

- [ ] **Step 8: Report evidence and remaining external prerequisite**

Report exact verification command results, live schema audit results, Edge Function deployment status, and whether Resend delivery was verified with a real sender. If secrets/domain verification remain missing, state that email code is complete but live delivery is waiting only on those external credentials.
