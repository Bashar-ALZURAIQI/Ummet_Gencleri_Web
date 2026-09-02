# Application Email Automation and Welcome Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver durable Resend notifications for every membership-application transition and a per-user dismissible accepted-student welcome banner without allowing email failures to undo saved application changes.

**Architecture:** A PostgreSQL trigger writes immutable event snapshots to an RLS-protected outbox in the same transaction as each application transition. A dedicated Supabase Edge Function claims and sends one outbox row idempotently, while a focused frontend service invokes delivery only after confirmed mutations and exposes persistent retry state to the president. The accepted banner uses a small storage adapter keyed by the confirmed Auth UUID.

**Tech Stack:** React 18, TypeScript 5.5, Supabase Auth/Postgres/RLS/Edge Functions, Deno, Resend API, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-08-26-application-email-automation-welcome-alert-design.md`

## Global Constraints

- Preserve the existing `student_applications` status meanings, president-only decision RPCs, and accepted-profile activation.
- A saved registration, interview schedule, acceptance, or rejection remains successful when email delivery fails.
- Do not modify `supabase/functions/send-contact-reply` or its authorization and templates.
- Never place `RESEND_API_KEY`, service-role credentials, or sender secrets in `.env`, browser code, or any `VITE_` variable.
- `NEW_APPLICATION` is the only event callable without a user session; all other events require a current active `PRESIDENT` assignment.
- Derive recipients and content from authoritative database state, never from browser-supplied email, subject, HTML, role, or arbitrary text.
- Deploy `send-application-notification` with gateway JWT verification disabled and perform event-specific authorization inside the function.
- Use `APPLICATION_EMAIL_FROM` when configured and otherwise fall back to `CONTACT_REPLY_FROM`.
- Use `Idempotency-Key: application-notification/<notification-id>` for Resend.
- Use the exact accepted-banner storage key `welcome_message_dismissed_<confirmed-auth-user-uuid>`.
- Do not perform Git, branch, commit, or GitHub operations; changes are applied directly to the workspace and official Supabase project.
- Do not send a real external email during verification without explicit confirmation at the moment of that action.

## File Map

- Create `src/domain/welcomeMessageDismissal.ts`: safe per-user local-storage key/read/write helpers.
- Create `src/domain/applicationEmailNotification.ts`: notification event/status types and response mapping.
- Create `src/services/applicationEmailService.ts`: Edge Function invocation and president-visible outbox queries.
- Create `supabase/migrations/20260827000000_application_email_notifications.sql`: outbox, trigger, RLS, grants, indexes, and state snapshots.
- Create `supabase/functions/send-application-notification/email.ts`: escaped Arabic plain-text and RTL HTML templates.
- Create `supabase/functions/send-application-notification/index.ts`: authorization, row claim, recipient lookup, Resend delivery, and audit updates.
- Create `supabase/functions/send-application-notification/deno.json`: function import configuration.
- Modify `src/context/AppContext.tsx`: invoke delivery after confirmed application mutations and expose warnings/retry state.
- Modify `src/pages/AuthPages.tsx`: show registration success separately from a non-blocking email warning.
- Modify `src/pages/AdminDashboard.tsx`: show persistent delivery state and retry controls in Applications.
- Modify `src/pages/StudentDashboard.tsx`: dismiss only the accepted top banner for the current UUID.
- Create focused tests under `tests/` for storage behavior, SQL security/trigger contracts, templates, Edge Function policy, repository mapping, and frontend integration.

---

### Task 1: Per-user accepted-banner dismissal

**Files:**
- Create: `src/domain/welcomeMessageDismissal.ts`
- Modify: `src/pages/StudentDashboard.tsx`
- Test: `tests/welcomeMessageDismissal.test.mjs`

**Interfaces:**
- Produces: `welcomeMessageDismissalKey(userId: string): string`.
- Produces: `readWelcomeMessageDismissed(storage: StorageLike, userId: string): boolean`.
- Produces: `dismissWelcomeMessage(storage: StorageLike, userId: string): boolean` where `false` means persistence failed but the caller must still hide the banner for the current React session.
- Consumes: `currentUser.userId` as the confirmed Auth UUID already exposed by `AppContext`.

- [ ] **Step 1: Write the failing storage-helper tests**

```js
test('uses a different accepted-welcome key for each confirmed user', () => {
  assert.equal(welcomeMessageDismissalKey('user-a'), 'welcome_message_dismissed_user-a');
  assert.equal(welcomeMessageDismissalKey('user-b'), 'welcome_message_dismissed_user-b');
});

test('reads only the exact persisted true value and survives storage errors', () => {
  assert.equal(readWelcomeMessageDismissed(memoryStorage({ welcome_message_dismissed_user_a: 'true' }), 'user_a'), true);
  assert.equal(readWelcomeMessageDismissed(memoryStorage({ welcome_message_dismissed_user_a: 'false' }), 'user_a'), false);
  assert.equal(readWelcomeMessageDismissed(throwingStorage(), 'user_a'), false);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `node --test tests/welcomeMessageDismissal.test.mjs`

Expected: FAIL because `src/domain/welcomeMessageDismissal.ts` does not exist.

- [ ] **Step 3: Implement the safe storage adapter**

```ts
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const welcomeMessageDismissalKey = (userId: string) =>
  `welcome_message_dismissed_${userId}`;

export const readWelcomeMessageDismissed = (storage: StorageLike, userId: string) => {
  try {
    return storage.getItem(welcomeMessageDismissalKey(userId)) === 'true';
  } catch {
    return false;
  }
};

export const dismissWelcomeMessage = (storage: StorageLike, userId: string) => {
  try {
    storage.setItem(welcomeMessageDismissalKey(userId), 'true');
    return true;
  } catch {
    return false;
  }
};
```

- [ ] **Step 4: Make only the accepted top banner dismissible**

Pass `currentUser.userId` into `ApplicationBanner`. Reset its session-hidden state whenever the UUID changes, safely read local storage in an effect, and render an accessible `X` button only for `status === 'accepted'`. On click, hide immediately, then call `dismissWelcomeMessage(window.localStorage, userId)`; pending, interview, rejected, removed, and banned screens keep their existing rendering and permissions.

- [ ] **Step 5: Run focused tests and TypeScript**

Run: `node --test tests/welcomeMessageDismissal.test.mjs`

Expected: PASS for key isolation, read/write, and storage-exception cases.

Run: `npm run typecheck`

Expected: PASS with the new banner props and Lucide `X` import.

### Task 2: Arabic application-email templates

**Files:**
- Create: `supabase/functions/send-application-notification/email.ts`
- Create: `supabase/functions/send-application-notification/deno.json`
- Test: `tests/applicationEmailTemplates.test.mjs`

**Interfaces:**
- Produces: `ApplicationEmailEventType = 'NEW_APPLICATION' | 'INTERVIEW_SCHEDULED' | 'ACCEPTED' | 'REJECTED'`.
- Produces: `renderApplicationEmail(eventType, payload, sitePublicUrl): { subject: string; text: string; html: string }`.
- Consumes payload keys: `studentName`, `studentEmail`, `interviewDate`, `interviewTime`, `interviewLink`, and `rejectionReason`.

- [ ] **Step 1: Write failing tests for all four templates and escaping**

```js
test('renders the interview schedule prominently in text and escaped RTL HTML', () => {
  const email = renderApplicationEmail('INTERVIEW_SCHEDULED', {
    studentName: '<أحمد>',
    studentEmail: 'student@example.com',
    interviewDate: '2026-09-02',
    interviewTime: '14:30',
    interviewLink: 'https://meet.example.com/room'
  }, 'https://ummet.org');
  assert.match(email.text, /2026-09-02/);
  assert.match(email.text, /14:30/);
  assert.match(email.html, /&lt;أحمد&gt;/);
  assert.doesNotMatch(email.html, /<أحمد>/);
});
```

Add equivalent assertions for the exact new-application, acceptance, and polite rejection copy, an optional escaped rejection reason, and rejection of a non-HTTPS interview URL.

- [ ] **Step 2: Run the template test and confirm it fails**

Run: `node --test tests/applicationEmailTemplates.test.mjs`

Expected: FAIL because the template module is absent.

- [ ] **Step 3: Implement minimal typed rendering**

Implement one `escapeHtml` function, validate `sitePublicUrl` and interview links with `new URL()` plus `protocol === 'https:'`, and return Arabic plain text plus `<div dir="rtl">` HTML. Do not interpolate unescaped application values into HTML. Configure `deno.json` consistently with the existing contact-reply function.

- [ ] **Step 4: Run template tests**

Run: `node --test tests/applicationEmailTemplates.test.mjs`

Expected: PASS for all four events, escaping, optional rejection reason, and URL validation.

### Task 3: Durable notification outbox, trigger, and RLS

**Files:**
- Create through `supabase migration new application_email_notifications`: `supabase/migrations/20260827000000_application_email_notifications.sql`
- Test: `tests/applicationEmailMigration.test.mjs`
- Test: `tests/applicationEmailTrigger.test.mjs`

**Interfaces:**
- Produces: `public.application_email_notifications` exactly as defined in the approved spec.
- Produces: `public.enqueue_application_email_notification()` as `SECURITY DEFINER SET search_path = ''`.
- Produces: trigger `student_applications_enqueue_email_notification` on `public.student_applications`.
- Consumes: existing `student_applications`, `profiles`, `executive_assignments`, `is_current_president()`, and existing lowercase application statuses.

- [ ] **Step 1: Ask the Supabase CLI for supported migration commands**

Run: `npx supabase --help`

Expected: exit 0 and list the `migration` command. If the repository has a locally installed CLI, use it; otherwise request approval for the CLI package download rather than inventing a migration history entry.

- [ ] **Step 2: Create the migration through the CLI**

Run: `npx supabase migration new application_email_notifications`

Expected: one new timestamped SQL file under `supabase/migrations/`. Use the emitted path for all remaining steps in this task; the planned logical name is `20260827000000_application_email_notifications.sql`.

- [ ] **Step 3: Write failing SQL contract tests**

Assert that the migration contains the four event constraints, four delivery states, composite unique constraint, both indexes, RLS enablement, public privilege revocation, president-only select policy, pinned empty search path, and an `AFTER INSERT OR UPDATE` application trigger. Also assert the insert/update logic covers initial pending, interview/reschedule, accepted, and rejected transitions.

- [ ] **Step 4: Run the migration contract tests and confirm failure**

Run: `node --test tests/applicationEmailMigration.test.mjs tests/applicationEmailTrigger.test.mjs`

Expected: FAIL because the new migration is still empty.

- [ ] **Step 5: Implement the outbox schema and transition trigger**

Create the table, constraints, indexes, `updated_at` maintenance, RLS, and president select policy. Revoke all anonymous/authenticated mutation access. In the trigger, snapshot the server-owned student name/email plus interview or rejection fields, compute fingerprints with `digest(..., 'sha256')`, and insert with `ON CONFLICT (application_id, event_type, fingerprint) DO NOTHING`. Use schema-qualified object references and grant only `SELECT` to authenticated users, with RLS making that effective only for the current president.

- [ ] **Step 6: Run SQL contract tests**

Run: `node --test tests/applicationEmailMigration.test.mjs tests/applicationEmailTrigger.test.mjs`

Expected: PASS for constraints, enqueue transitions, deduplication contract, RLS, grants, and search-path hardening.

### Task 4: Frontend notification repository and service

**Files:**
- Create: `src/domain/applicationEmailNotification.ts`
- Create: `src/services/applicationEmailService.ts`
- Test: `tests/applicationEmailService.test.mjs`

**Interfaces:**
- Produces: `ApplicationEmailEventType` and `ApplicationEmailDeliveryStatus` unions matching Task 3.
- Produces: `ApplicationEmailNotification` with camel-case `id`, `applicationId`, `eventType`, `deliveryStatus`, `deliveryAttempts`, `deliveryLastError`, `createdAt`, and `sentAt`.
- Produces: `sendApplicationNotification(applicationId, eventType): Promise<ApplicationEmailSendResult>`.
- Produces: `listApplicationEmailNotifications(): Promise<ApplicationEmailNotification[]>`.
- Produces: `retryApplicationEmailNotification(applicationId, eventType): Promise<ApplicationEmailSendResult>`.
- `ApplicationEmailSendResult` is `{ ok: true; status: 'SENT' | 'ALREADY_SENT' } | { ok: false; status: 'PENDING' | 'FAILED'; error: string }`.

- [ ] **Step 1: Write failing client-contract tests**

Use a fake Supabase client to assert that sending invokes `send-application-notification` with only `{ applicationId, eventType }`, list selects only the president-visible columns ordered newest first, `alreadySent: true` maps to `ALREADY_SENT`, and provider/function errors map to a bounded `FAILED` result without leaking request headers or secrets.

- [ ] **Step 2: Run the focused service test and confirm failure**

Run: `node --test tests/applicationEmailService.test.mjs`

Expected: FAIL because the domain and service files do not exist.

- [ ] **Step 3: Implement the smallest repository/service boundary**

Follow the project’s existing Supabase-client injection pattern. Keep snake-case row parsing inside this service, validate event/status strings before returning them, and use the same send method for initial delivery and retry. Do not allow callers to supply recipient, subject, HTML, or payload.

- [ ] **Step 4: Run service tests and TypeScript**

Run: `node --test tests/applicationEmailService.test.mjs`

Expected: PASS for invocation shape, mapping, listing, retries, and safe errors.

Run: `npm run typecheck`

Expected: PASS.

### Task 5: Secure and idempotent Edge Function

**Files:**
- Create: `supabase/functions/send-application-notification/index.ts`
- Modify: `supabase/functions/send-application-notification/email.ts`
- Test: `tests/applicationEmailEdgeFunction.test.mjs`

**Interfaces:**
- Consumes request JSON: `{ applicationId: string; eventType: ApplicationEmailEventType }` and no other client-controlled email fields.
- Produces JSON success: `{ ok: true, status: 'SENT', notificationId: string }` or `{ ok: true, status: 'ALREADY_SENT', notificationId: string }`.
- Produces bounded JSON failure with status 4xx/5xx and no secret/provider payload.
- Consumes secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `SITE_PUBLIC_URL`, optional `APPLICATION_EMAIL_FROM`, and fallback `CONTACT_REPLY_FROM`.

- [ ] **Step 1: Write failing static and behavioral function tests**

Assert CORS/OPTIONS handling, strict event parsing, generic public new-application responses, president authorization for the other events, service-role-only outbox mutation, conditional `PENDING|FAILED -> SENDING` claim, attempt increment, the exact Resend idempotency header, `SENT`/`FAILED` audit updates, and absence of edits to `send-contact-reply`.

- [ ] **Step 2: Run the function test and confirm failure**

Run: `node --test tests/applicationEmailEdgeFunction.test.mjs`

Expected: FAIL because `index.ts` is absent.

- [ ] **Step 3: Implement request authentication and authorization**

Parse only `applicationId` and `eventType`. For `NEW_APPLICATION`, ignore absent/unknown work through a generic accepted/no-work response. For the other events, resolve the bearer token with the anon client, obtain the user UUID, and verify an active current `PRESIDENT` assignment through authoritative database state before reading or claiming work.

- [ ] **Step 4: Implement recipient resolution and conditional claim**

Resolve the current president at delivery time for new applications, preferring non-empty `profiles.contact_email` and falling back to the Auth Admin email. Use the immutable student email from the outbox payload for all student events. Claim only the latest matching `PENDING` or `FAILED` row, set `SENDING`, increment attempts, and treat `SENT` as `ALREADY_SENT`; a concurrent failed claim must not send.

- [ ] **Step 5: Implement Resend delivery and persistent audit results**

Render via `renderApplicationEmail`, call Resend with `Idempotency-Key: application-notification/${notification.id}`, then persist provider ID and `sent_at` on success. On configuration/network/provider failure, persist `FAILED` and a length-bounded sanitized message without API keys, authorization values, or full provider responses.

- [ ] **Step 6: Run function/template tests**

Run: `node --test tests/applicationEmailEdgeFunction.test.mjs tests/applicationEmailTemplates.test.mjs`

Expected: PASS for public restrictions, role enforcement, claim concurrency contract, retries, idempotency, and audit updates.

### Task 6: Connect registration, interview, decision, warnings, and retry UI

**Files:**
- Modify: `src/context/AppContext.tsx`
- Modify: `src/pages/AuthPages.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Test: `tests/applicationEmailIntegration.test.mjs`

**Interfaces:**
- Changes `registerWithApplication` result to `{ ok: boolean; error?: string; requiresEmailConfirmation?: boolean; emailWarning?: string }`.
- Changes `scheduleInterview` and `decideApplication` results to `{ ok: boolean; error?: string; emailWarning?: string }`.
- Adds context members `applicationEmailNotifications`, `refreshApplicationEmailNotifications()`, and `retryApplicationEmailNotification(applicationId, eventType)` for president UI.
- Consumes Task 4 service functions and confirmed rows returned by existing application RPCs.

- [ ] **Step 1: Write failing integration-contract tests**

Assert that registration invokes `NEW_APPLICATION` with `signup_<auth-user-uuid>` for both immediate-session and email-confirmation signup, but only after Supabase confirms a genuinely new user. Assert that interview and final notification invocations occur only after their RPC returns a confirmed row and local state updates. Assert failures return the exact non-blocking warning `تم حفظ العملية بنجاح، لكن تعذر إرسال إشعار البريد حالياً. يمكنك إعادة المحاولة من لوحة الطلبات.` rather than `ok: false`.

- [ ] **Step 2: Run the integration test and confirm failure**

Run: `node --test tests/applicationEmailIntegration.test.mjs`

Expected: FAIL because the context does not invoke the new service or expose warnings/status.

- [ ] **Step 3: Wire registration without changing signup success semantics**

After Auth returns a newly created user UUID, invoke `NEW_APPLICATION` using `signup_${user.id}` before returning either the email-confirmation success result or the signed-in `applySession` result. Catch/log only a sanitized delivery error and attach `emailWarning`; do not change the successful account/application result to failure.

- [ ] **Step 4: Wire interview and final decision after confirmed RPC success**

After updating local application state from the returned server row, invoke `INTERVIEW_SCHEDULED`, `ACCEPTED`, or `REJECTED`. Return `ok: true` with `emailWarning` if email is delayed. Keep each president modal closing because the underlying operation committed, and show an amber warning rather than a success claim about email.

- [ ] **Step 5: Load and render persistent outbox status for the president**

Refresh notification rows when the Applications tab is opened and after scheduling, decisions, or retries. Match by `applicationId` and show `قيد الإرسال`, `تم إرسال البريد`, or `تعذر إرسال البريد`. For `FAILED`, render `إعادة إرسال البريد`; on retry, invoke the same application/event tuple, disable the control while pending, refresh rows, and preserve the saved application decision regardless of retry outcome.

- [ ] **Step 6: Keep registration success and warning visually distinct**

In `AuthPages.tsx`, preserve the existing confirmation/success message and add a separate amber warning when `emailWarning` is present. Never show the registration itself as failed solely because the administration email was delayed.

- [ ] **Step 7: Run integration, existing application-security tests, and TypeScript**

Run: `node --test tests/applicationEmailIntegration.test.mjs tests/applicationSecurity.test.mjs`

Expected: PASS with existing president-only application mutations preserved.

Run: `npm run typecheck`

Expected: PASS.

### Task 7: Full verification and official Supabase rollout

**Files:**
- Verify all files from Tasks 1–6.
- Verify unchanged: `supabase/functions/send-contact-reply/index.ts`

**Interfaces:**
- Deploys the migration and `send-application-notification` function to project ref `rscunkzvbsdbjzhnuria`.
- Does not perform a real external-email smoke test until explicit action-time confirmation is received.

- [ ] **Step 1: Run every focused test together**

Run: `node --test tests/welcomeMessageDismissal.test.mjs tests/applicationEmailTemplates.test.mjs tests/applicationEmailMigration.test.mjs tests/applicationEmailTrigger.test.mjs tests/applicationEmailService.test.mjs tests/applicationEmailEdgeFunction.test.mjs tests/applicationEmailIntegration.test.mjs`

Expected: all focused tests PASS.

- [ ] **Step 2: Run the complete local verification suite**

Run: `npm test`

Expected: all tests PASS, including existing contact-reply and application tests.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run lint`

Expected: PASS with no new warnings/errors.

Run: `npm run build`

Expected: production build exits 0.

- [ ] **Step 3: Apply the migration to the official project**

Run: `npx supabase db push --project-ref rscunkzvbsdbjzhnuria`

Expected: the new migration is applied once with no destructive reset and no change to existing application data.

- [ ] **Step 4: Deploy the dedicated Edge Function as public-gateway/custom-auth**

Run: `npx supabase functions deploy send-application-notification --project-ref rscunkzvbsdbjzhnuria --no-verify-jwt`

Expected: deployment succeeds and reports the official project/function URL. Do not print secret values.

- [ ] **Step 5: Verify live schema, RLS, and authorization without sending email**

Confirm the live outbox table, trigger, constraints, indexes, RLS flag, president select policy, and lack of anonymous/authenticated mutation grants. Invoke invalid/public non-new requests and verify they cannot enumerate data; invoke protected events without a president session and expect rejection.

- [ ] **Step 6: Request explicit confirmation for the real delivery smoke test**

Explain the exact recipient/event that will be used. Only after the user confirms, create or reuse one controlled pending outbox event, invoke the function once, verify the row becomes `SENT` with attempts/provider ID/timestamp, and confirm a retry returns `ALREADY_SENT` without another provider delivery.

- [ ] **Step 7: Record the final evidence**

Report focused/full test counts, typecheck/lint/build results, migration name, deployed function name, live RLS/authorization checks, and whether the optional real email test was performed. Do not claim completion for any check that was skipped or failed.
