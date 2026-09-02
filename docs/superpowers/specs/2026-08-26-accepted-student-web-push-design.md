# Accepted Student Web Push Design

**Date:** 2026-08-26  
**Status:** User-approved design, pending implementation plan

## Objective

Add standards-based Web Push notifications that work while the site is closed, but only for authenticated students who are full union members. A student is eligible only when the authoritative database state is both:

- `profiles.status = 'active'`
- the student's current `student_applications.status = 'accepted'`

Visitors and students in `pending`, `interview`, `rejected`, `removed`, or `banned` states cannot create or retain a push subscription.

## Scope

Web Push is used only for new published public content:

- a new news item;
- a new event/program;
- a new gallery album.

Interview scheduling and final acceptance/rejection remain email-only. These application events are intentionally excluded from Web Push because the student is not an eligible push subscriber before final acceptance.

## User Experience

- The enable control appears only inside the accepted student's dashboard.
- The browser permission prompt is never opened on page load. It is opened only after the student presses `تفعيل الإشعارات`.
- The UI reports one of: unsupported browser, iOS installation required, ready, enabling, enabled, permission denied, or recoverable error.
- A persistent bell control allows an eligible student to inspect the current state and disable notifications.
- On iPhone/iPad, the UI explains that the site must first be added to the Home Screen. A lightweight PWA manifest and installable icons are included.
- Notification clicks route to the relevant internal view:
  - news -> `news`
  - event/program -> `programs`
  - album -> `gallery`
- No membership-sensitive information is shown on the lock screen.

## Architecture

The database is the source of truth. A notification is created only after content has actually been published to `published_site_content`. This covers both direct presidential publishing and a media edit that is later approved by the president. Pending CMS requests never generate notifications.

The delivery pipeline is:

1. The CMS publication transaction updates `published_site_content`.
2. A PostgreSQL trigger compares old and new JSON arrays by stable item ID and inserts one durable row per newly published item into `push_notifications`.
3. A Supabase Database Webhook invokes `send-web-push` after a notification row is inserted.
4. The Edge Function authenticates the webhook with a dedicated shared secret, loads the authoritative notification row, expands it into per-device delivery rows, and sends the encrypted payload using VAPID.
5. Each device result is persisted in `push_notification_deliveries`. Successful devices are never resent during a retry.
6. HTTP `404` or `410` responses deactivate the expired subscription. Temporary failures remain retryable.

The frontend does not decide that content deserves a push and does not contain the VAPID private key.

## Database Design

### `push_subscriptions`

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `endpoint text not null unique`
- `p256dh text not null`
- `auth_key text not null`
- `user_agent text`
- `is_active boolean not null default true`
- `failure_count integer not null default 0`
- `last_success_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

An index on `(user_id) where is_active` supports personal eligibility checks and membership revocation. The endpoint and encryption keys are capability data and are never selectable by browser roles.

### `push_notifications`

- durable notification ID;
- `kind` constrained to `NEWS`, `EVENT`, or `GALLERY_ALBUM`;
- title, body, and same-origin destination;
- unique `source_event_key` such as `cms:news:<item-id>` for idempotency;
- aggregate delivery state and timestamps.

### `push_notification_deliveries`

- one row per `(notification_id, subscription_id)`;
- status constrained to `PENDING`, `SENDING`, `SENT`, or `FAILED`;
- attempts, sanitized last error, provider status, and sent timestamp;
- foreign keys indexed explicitly.

This table makes retries safe: only unsent device rows are retried.

## Database API and RLS

All three tables have RLS enabled and no direct browser mutation grants.

The frontend receives access only to narrow RPCs:

- `register_accepted_student_push_subscription(endpoint, p256dh, auth_key, user_agent)`
- `disable_own_push_subscription(endpoint)`

Both functions derive the user from `auth.uid()` and never accept a caller-provided `user_id`. Registration verifies current membership from `profiles` and `student_applications` in the same server-side operation. Inputs receive HTTPS, length, and Base64URL-shape validation.

Database triggers deactivate all subscriptions when the profile becomes `removed`, `banned`, or inactive, or when the accepted application state is no longer valid. The Edge Function repeats the eligibility check before each send as defense in depth.

## Content Detection

The CMS trigger compares the old and new arrays under:

- `content.news`
- `content.events`
- `content.galleryAlbums`

Only an object whose stable `id` did not exist in the previous published array is considered new. Reordering, editing, pinning, or adding images to an existing album does not generate another push.

Messages use:

- title: `جديد اتحاد شباب الأمة: <published title>`
- body: a short category-specific Arabic sentence;
- tag: the unique source event key, allowing the browser to collapse duplicates.

## Edge Function

`send-web-push` runs on Supabase Edge Functions with a pinned `web-push` npm dependency in a per-function `deno.json`.

Required secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` using an official `mailto:` address or HTTPS URL
- `PUSH_WEBHOOK_SECRET`

The function uses the built-in Supabase URL and secret/service credentials, never exposes secret credentials, validates a constant-time shared-secret header, claims rows conditionally to prevent concurrent sends, sends in bounded batches, sanitizes logged errors, and returns aggregate counts without returning subscription endpoints.

The function has platform `verify_jwt = false` because the database webhook is not a user JWT caller. Authorization is enforced inside the function with `PUSH_WEBHOOK_SECRET`.

## Service Worker and PWA

`public/push-sw.js` handles:

- `push`: validate a small JSON payload and immediately call `showNotification()`;
- `notificationclick`: close the notification and focus or open only a same-origin URL;
- safe fallbacks for malformed or empty payloads.

The service worker does not intercept page fetches or implement offline caching; that is outside this feature and avoids changing current site loading behavior.

`manifest.webmanifest`, app icons, theme metadata, and an Apple touch icon make the site installable for iOS/iPadOS Home Screen Web Push. The icon assets use the site's existing navy/gold visual identity.

## Frontend Components

- A focused domain module performs support detection, Base64URL conversion, subscription serialization, and iOS standalone detection.
- A Supabase service calls the registration and disable RPCs.
- `useAcceptedStudentPush` owns service-worker registration and the explicit enable/disable workflow.
- `PushNotificationControl` is rendered only when `studentAccess === 'accepted'`.
- On authentication/account changes, an existing browser subscription is reconciled with the current accepted account.
- Logout attempts to disable the current user's binding before ending the session. The server-side eligibility check remains authoritative if the client is offline.

Frontend environment:

- `VITE_VAPID_PUBLIC_KEY` only. It is public by design.

The VAPID private key and webhook secret must never use the `VITE_` prefix and must never be bundled into the browser.

## Failure Handling

- Permission denied: explain how to re-enable it in browser settings; do not repeatedly prompt.
- Unsupported/insecure context: disable the control with a precise message. `localhost` is allowed for development; production requires HTTPS.
- Database registration failure: keep the local Push API subscription, show a retry action, and never claim activation succeeded.
- Expired endpoint: mark inactive on `404/410`.
- Partial provider failure: retain failed delivery rows for retry without duplicating successful deliveries.
- Membership removal: deactivate subscriptions before any future audience expansion and recheck membership at send time.

## Testing and Verification

Automated tests cover:

- support and iOS/PWA state detection;
- VAPID public-key conversion and subscription serialization;
- accepted-only UI and service eligibility;
- registration/disable repository behavior;
- RLS grants and RPC authorization constraints;
- CMS JSON diff detection and idempotent source keys;
- no pushes for edits/reorders or application status changes;
- delivery claim, per-device deduplication, expired endpoint cleanup, and error sanitization;
- service-worker push parsing and same-origin click routing;
- absence of private keys from frontend code.

Completion verification includes the focused tests, full test suite, TypeScript, lint, production build, live SQL checks for RLS/grants/triggers, Edge Function deployment, and one controlled end-to-end browser push test after the user explicitly approves sending it.

## VAPID Setup and Local Testing

The implementation handoff will include exact commands to generate one VAPID key pair with `web-push`, place only the public key in the Vite environment, place both keys and the subject in Supabase Secrets, configure the Database Webhook secret, and test on `localhost` using a supported browser. The same key pair must be retained; rotating it invalidates existing subscriptions and requires students to subscribe again.

## Non-Goals

- No visitor subscriptions.
- No subscriptions for pending/interview/rejected/removed/banned users.
- No Web Push for interview, acceptance, rejection, contact replies, or administrative logs.
- No offline page cache.
- No marketing-topic preferences or per-category toggles in this version.
- No silent/background-only pushes; every received push produces a visible notification.
