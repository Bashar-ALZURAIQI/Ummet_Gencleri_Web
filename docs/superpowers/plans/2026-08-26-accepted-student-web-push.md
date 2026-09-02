# Accepted Student Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver standards-based Web Push notifications for newly published news, events, and gallery albums exclusively to authenticated students whose membership is active and whose application is accepted.

**Architecture:** PostgreSQL detects newly published CMS records and writes an idempotent outbox row. A secret-authenticated Supabase Database Webhook invokes a Deno Edge Function, which expands the outbox into per-subscription delivery rows and sends VAPID-encrypted notifications without exposing endpoints or private keys to the browser. The accepted student dashboard owns the explicit opt-in UI and a lightweight PWA/Service Worker receives notifications while the site is closed.

**Tech Stack:** React 18, TypeScript, Vite, Supabase Auth/Postgres/RLS/Database Webhooks/Edge Functions, Deno 2, `web-push@3.6.5`, Web Push API, Notifications API, Service Worker API, Web App Manifest.

**Spec:** `docs/superpowers/specs/2026-08-26-accepted-student-web-push-design.md`

## Global Constraints

- Web Push is available only when `profiles.status = 'active'` and the current `student_applications.status = 'accepted'` for the authenticated user.
- Visitors and pending/interview/rejected/removed/banned students cannot subscribe.
- Interview, acceptance, and rejection notifications remain email-only.
- Public-content pushes are created only after official CMS publication; pending media edits never trigger a push.
- The browser receives only `VITE_VAPID_PUBLIC_KEY`; VAPID private and webhook secrets never use a `VITE_` prefix.
- The permission request must be initiated by the student's click.
- The Service Worker must not intercept fetches or add offline caching.
- No Git, branch, commit, push, or PR operations are part of this implementation.
- Every production behavior follows a red-green-refactor test cycle where it is locally testable.

---

### Task 1: Browser Push Domain and Service Worker Behavior

**Files:**
- Create: `src/domain/webPushClient.ts`
- Create: `tests/webPushClient.test.mjs`
- Create: `public/push-sw.js`
- Create: `tests/pushServiceWorker.test.mjs`

**Interfaces:**
- Produces: `detectPushCapability(input): PushCapability`
- Produces: `urlBase64ToUint8Array(value: string): Uint8Array`
- Produces: `serializePushSubscription(subscription): SerializedPushSubscription`
- Produces: Service Worker messages `{ title, body, tag, url, icon?, badge? }`

- [ ] **Step 1: Write failing domain tests**

Cover literal expectations for unsupported browsers, insecure production origins, iOS browser versus standalone mode, denied/default/granted permission, invalid VAPID strings, valid URL-safe Base64 conversion, and exact serialization of endpoint plus `p256dh`/`auth` keys. Each test names the behavior that would break.

- [ ] **Step 2: Run the domain tests and verify RED**

Run: `node --test tests/webPushClient.test.mjs`  
Expected: FAIL because `src/domain/webPushClient.ts` does not exist.

- [ ] **Step 3: Implement the minimal browser-independent domain module**

Define:

```ts
export type PushCapability =
  | { kind: 'unsupported'; reason: string }
  | { kind: 'ios-install-required'; reason: string }
  | { kind: 'denied'; reason: string }
  | { kind: 'ready'; permission: 'default' | 'granted' };

export interface SerializedPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}
```

Do feature detection rather than browser-name allowlists. Reject empty/malformed VAPID keys before calling PushManager.

- [ ] **Step 4: Run the domain tests and verify GREEN**

Run: `node --test tests/webPushClient.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 5: Write failing Service Worker behavior tests**

Use Node `vm` with a small fake worker scope to execute the real `public/push-sw.js`. Verify that a valid push calls `registration.showNotification()` with the exact payload, malformed payload uses safe Arabic fallbacks, click routing rejects cross-origin URLs, a matching open window is focused/navigated, and otherwise `clients.openWindow()` receives a same-origin URL.

- [ ] **Step 6: Run the worker tests and verify RED**

Run: `node --test tests/pushServiceWorker.test.mjs`  
Expected: FAIL because the worker is absent.

- [ ] **Step 7: Implement `public/push-sw.js` minimally**

Register `push` and `notificationclick` handlers, call `event.waitUntil`, always show a visible notification, validate click destinations against `self.location.origin`, and avoid any `fetch` event handler.

- [ ] **Step 8: Run both focused suites and verify GREEN**

Run: `node --test tests/webPushClient.test.mjs tests/pushServiceWorker.test.mjs`  
Expected: all tests PASS.

---

### Task 2: Accepted-Only Subscription Gateway

**Files:**
- Create: `src/domain/pushSubscriptionGateway.ts`
- Create: `src/services/pushSubscriptionService.ts`
- Create: `tests/pushSubscriptionGateway.test.mjs`

**Interfaces:**
- Consumes: `SerializedPushSubscription` from Task 1.
- Produces: `registerPushSubscription(subscription, userAgent): Promise<ServiceResult<PushSubscriptionRecord>>`
- Produces: `disablePushSubscription(endpoint): Promise<ServiceResult<void>>`

- [ ] **Step 1: Write failing gateway tests**

Build a complete fake Supabase RPC response shape. Verify exact RPC names and arguments, whitespace normalization, refusal of empty endpoint/keys before network access, correct error-code preservation, invalid success-row rejection, and successful record mapping.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/pushSubscriptionGateway.test.mjs`  
Expected: FAIL because the gateway module does not exist.

- [ ] **Step 3: Implement the gateway and singleton service**

Use RPCs only:

```ts
register_accepted_student_push_subscription({
  p_endpoint,
  p_p256dh,
  p_auth_key,
  p_user_agent,
})

disable_own_push_subscription({ p_endpoint })
```

Do not send `user_id`; the database derives it from the authenticated session.

- [ ] **Step 4: Run and verify GREEN**

Run: `node --test tests/pushSubscriptionGateway.test.mjs`  
Expected: all tests PASS.

---

### Task 3: Postgres Outbox, RLS, Eligibility, and CMS Triggers

**Files:**
- Create: `supabase/migrations/20260826171212_accepted_student_web_push.sql`
- Create: `supabase/tests/accepted_student_web_push.sql`
- Create: `tests/webPushCmsDiff.test.mjs`
- Create: `src/domain/webPushCmsDiff.ts`

**Interfaces:**
- Produces tables: `push_subscriptions`, `push_notifications`, `push_notification_deliveries`.
- Produces RPCs: `register_accepted_student_push_subscription(text,text,text,text)` and `disable_own_push_subscription(text)`.
- Produces trigger function: `private.enqueue_published_content_push_notifications()`.
- Produces eligibility helper: `private.is_accepted_active_student(uuid)` with direct execute revoked.

- [ ] **Step 1: Create the migration through the Supabase CLI**

Discover syntax first:

```powershell
npx supabase migration new --help
npx supabase migration new accepted_student_web_push
```

Use the generated migration `20260826171212_accepted_student_web_push.sql`.

- [ ] **Step 2: Write failing pure CMS-diff tests**

Test the intended stable-ID semantics independently of SQL: additions produce source keys, reorders/edits produce none, duplicate IDs are rejected, and malformed entries are ignored. This provides a fast executable specification for the SQL trigger.

- [ ] **Step 3: Run the diff tests and verify RED**

Run: `node --test tests/webPushCmsDiff.test.mjs`  
Expected: FAIL because `webPushCmsDiff.ts` is absent.

- [ ] **Step 4: Implement the pure diff reference and verify GREEN**

Run: `node --test tests/webPushCmsDiff.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 5: Write the migration**

Implement:

- UUID primary keys, `timestamptz`, text checks, HTTPS endpoint validation, and Base64URL key-shape checks;
- explicit foreign-key and partial active-subscription indexes;
- `UNIQUE (source_event_key)` and `UNIQUE (notification_id, subscription_id)`;
- RLS on every public table;
- revoke all table access from `PUBLIC`, `anon`, and `authenticated`, with service credentials retaining required access;
- SECURITY DEFINER RPCs using `SET search_path = ''`, `(SELECT auth.uid())`, accepted+active checks, and explicit execute revokes/grants;
- subscription deactivation triggers on relevant `profiles` and `student_applications` changes;
- CMS JSON diff trigger for `news`, `events`, and `galleryAlbums` only;
- no trigger on application interview/accept/reject events.

- [ ] **Step 6: Write pgTAP/live SQL behavior checks**

The SQL test must prove:

- anonymous and non-accepted registration fails;
- accepted+active registration succeeds and binds only the caller ID;
- callers cannot select endpoint rows;
- edit/reorder does not enqueue;
- each genuinely new news/event/album ID enqueues exactly once;
- membership removal deactivates subscriptions;
- application status updates do not enqueue Web Push.

- [ ] **Step 7: Run migration verification against an available Supabase database**

Prefer local Supabase if Docker is available. Otherwise apply to the official project only at the remote-application checkpoint, wrap disposable fixtures in a transaction, and roll them back. Expected: every SQL assertion passes and no test fixture remains.

---

### Task 4: Durable Edge Delivery Worker

**Files:**
- Create: `supabase/functions/send-web-push/delivery.ts`
- Create: `supabase/functions/send-web-push/handler.ts`
- Create: `supabase/functions/send-web-push/index.ts`
- Create: `supabase/functions/send-web-push/deno.json`
- Create: `tests/webPushDelivery.test.mjs`
- Create: `tests/webPushEdgeFunction.test.mjs`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: Database Webhook INSERT payload containing `record.id`.
- Consumes secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET`.
- Produces: `{ ok, notificationId, sent, failed, pending, expired }` without endpoint data.

- [ ] **Step 1: Write failing pure delivery-policy tests**

Test exact message payload construction, same-origin route allowlist, constant-time secret comparison contract, error sanitization, `404/410 -> expired`, other 4xx -> permanent failure, 5xx/network -> retryable failure, and selection of only PENDING/FAILED delivery rows.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/webPushDelivery.test.mjs`  
Expected: FAIL because `delivery.ts` is absent.

- [ ] **Step 3: Implement minimal pure delivery helpers and verify GREEN**

Run: `node --test tests/webPushDelivery.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 4: Write failing Edge orchestration tests**

Exercise the handler through dependency injection: invalid/missing secret returns 401, malformed webhook returns 400, unknown notification returns 404, a conditional claim prevents duplicate workers, only accepted+active subscriptions become deliveries, successful sends become SENT, expired sends deactivate subscriptions, and the response never contains an endpoint or encryption key.

- [ ] **Step 5: Run and verify RED**

Run: `node --test tests/webPushEdgeFunction.test.mjs`  
Expected: FAIL before the handler exists.

- [ ] **Step 6: Implement the Edge Function**

Use exact pinned imports in `deno.json`, including `npm:web-push@3.6.5` and the project's pinned Supabase client. Import CommonJS `web-push` through its default export. Validate the webhook secret inside the function, use service credentials only server-side, process bounded batches, and conditionally update statuses to prevent concurrent sends.

- [ ] **Step 7: Configure function gateway behavior**

Add:

```toml
[functions.send-web-push]
verify_jwt = false
```

No other function configuration changes.

- [ ] **Step 8: Run both Edge suites and verify GREEN**

Run: `node --test tests/webPushDelivery.test.mjs tests/webPushEdgeFunction.test.mjs`  
Expected: all tests PASS.

---

### Task 5: Accepted Student UI, Session Rebinding, and PWA Metadata

**Files:**
- Create: `src/hooks/useAcceptedStudentPush.ts`
- Create: `src/domain/acceptedStudentPushState.ts`
- Create: `src/components/PushNotificationControl.tsx`
- Create: `tests/acceptedStudentPushState.test.mjs`
- Create: `public/manifest.webmanifest`
- Create: `public/icons/union-push-icon.svg`
- Create: `public/icons/union-push-badge.svg`
- Modify: `src/pages/StudentDashboard.tsx`
- Modify: `src/App.tsx`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/vite-env.d.ts`
- Modify: `index.html`

**Interfaces:**
- Consumes: `studentAccess`, current user UUID, `VITE_VAPID_PUBLIC_KEY`, Task 1 domain, Task 2 service.
- Produces: `PushNotificationControl` rendered only for accepted students.
- Produces: `detachCurrentPushBindingBeforeLogout(): Promise<void>` as a best-effort privacy cleanup.

- [ ] **Step 1: Write failing state-machine tests**

Verify that only `accepted` can render/enable, iOS non-standalone shows install guidance, denied permission never auto-prompts, enabling moves through busy to enabled only after both Push API and RPC succeed, RPC failure remains retryable, and disable success returns to ready.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/acceptedStudentPushState.test.mjs`  
Expected: FAIL because the state module does not exist.

- [ ] **Step 3: Implement the pure state reducer and verify GREEN**

Run: `node --test tests/acceptedStudentPushState.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 4: Implement the hook**

Register `/push-sw.js`, wait for `navigator.serviceWorker.ready`, request permission only inside `enable()`, subscribe with `{ userVisibleOnly: true, applicationServerKey }`, persist through the RPC, reconcile an existing subscription on accepted-user login, and expose precise Arabic status/error text.

- [ ] **Step 5: Implement the accepted-only UI**

Add an accessible bell control/card to `StudentDashboard`. It must not render for pending, interview, rejected, removed, or loading states. Include iOS Home Screen guidance and enable/disable/retry actions.

Handle the same-origin `?push=news|programs|gallery` destination once in `App.tsx`, map it to the existing internal view, and remove the consumed query parameter so notification clicks reach the intended page without creating a second router.

- [ ] **Step 6: Add logout cleanup**

Before `supabase.auth.signOut()`, best-effort load the active browser subscription and call `disable_own_push_subscription`. Log a sanitized warning on failure, but never block logout. Do not delete or alter email notification logic.

- [ ] **Step 7: Add PWA files and metadata**

Create a manifest with `id`, Arabic name/short name, `start_url`, `scope`, `display: standalone`, navy theme/background colors, and the local icon. Add manifest, theme-color, Apple web-app metadata, and icon links to `index.html`. Keep icons local and same-origin.

- [ ] **Step 8: Extend environment typing**

Declare only:

```ts
readonly VITE_VAPID_PUBLIC_KEY: string;
```

No private secret declaration is allowed in frontend types.

- [ ] **Step 9: Run focused tests, typecheck, and lint**

Run:

```powershell
node --test tests/webPushClient.test.mjs tests/pushServiceWorker.test.mjs tests/pushSubscriptionGateway.test.mjs tests/acceptedStudentPushState.test.mjs
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

---

### Task 6: Environment Setup, Remote Application, and End-to-End Verification

**Files:**
- Modify: `.env`
- Create locally but do not expose: `supabase/functions/.env.local`
- Modify: `README.md`

**Interfaces:**
- Produces frontend environment `VITE_VAPID_PUBLIC_KEY`.
- Produces server secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET`.
- Produces Database Webhook `dispatch-new-web-push` for INSERT on `public.push_notifications`.

- [ ] **Step 1: Generate one persistent VAPID key pair**

Run only after dependency/network approval if required:

```powershell
npx --yes web-push@3.6.5 generate-vapid-keys --json
```

Store the public key as `VITE_VAPID_PUBLIC_KEY` in `.env`. Never place the private key in a `VITE_` variable.

- [ ] **Step 2: Generate a webhook secret and configure local function secrets**

Use a cryptographically random value of at least 32 bytes. Store VAPID and webhook secrets in `supabase/functions/.env.local`, which is covered by the repository's `*.local` ignore rule.

- [ ] **Step 3: Add exact operator documentation**

Document:

- VAPID generation and one-time retention;
- local `supabase functions serve send-web-push --env-file supabase/functions/.env.local`;
- localhost secure-context behavior;
- iOS add-to-Home-Screen requirement;
- production secret names and Database Webhook header `x-push-webhook-secret`;
- warning that VAPID rotation invalidates existing subscriptions.

- [ ] **Step 4: Run the full fresh local verification**

Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: zero test failures and exit code 0 for every command.

- [ ] **Step 5: Apply the SQL migration to the official project**

Use project `rscunkzvbsdbjzhnuria`. Apply only the new migration, then run live read-only checks proving tables, RLS, policies, grants, functions, indexes, and triggers exist. Run disposable eligibility/CMS trigger fixtures in a transaction and roll back.

- [ ] **Step 6: Set Supabase Secrets and deploy `send-web-push`**

This is a security/permission mutation and requires action-time user confirmation. Set the four named secrets, deploy only the new function, verify `Verify JWT` is OFF for this function, and confirm the function rejects a missing/incorrect webhook secret without sending.

- [ ] **Step 7: Configure automatic dispatch**

Create a Database Webhook for INSERT on `public.push_notifications` targeting:

```text
https://rscunkzvbsdbjzhnuria.supabase.co/functions/v1/send-web-push
```

Include `Content-Type: application/json` and `x-push-webhook-secret`. Add a scheduled retry/drain invocation only if the deployed function and project plan support it without exposing the secret; otherwise the function performs bounded in-invocation retries and keeps failed delivery rows visible for operational retry.

- [ ] **Step 8: Perform a controlled end-to-end test**

This sends a real external push and therefore requires separate explicit action-time confirmation. With a test account that is both active and accepted: enable notifications, publish one disposable test news item, confirm delivery while the site is closed, click it and verify the news view opens, then remove the disposable content without creating a second push.

- [ ] **Step 9: Re-run final verification after remote configuration**

Re-run the full local command set and live RLS/security checks. Report exact test counts, build result, deployed function state, and whether the optional real push test was performed.

## Plan Self-Review

- Spec coverage: accepted-only eligibility, CMS-only events, email-only application events, Service Worker, PWA, VAPID, outbox, RLS, webhook, failure handling, and local testing each map to an implementation task.
- Placeholder scan: no incomplete or deferred behavior remains.
- Type consistency: RPC, environment, payload, and function names are identical across tasks.
- Security review: user ID is server-derived; subscription endpoints are unreadable to browser roles; private keys remain server-only; webhook authentication is internal; membership is checked at registration and delivery.
