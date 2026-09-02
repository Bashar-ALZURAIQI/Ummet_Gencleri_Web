# Persistent CMS and Contact Messaging Design

## Objective

Make public site content, the student guide, FAQ content, contact-map settings, visitor messages, and administrative replies durable in the official Supabase project. Preserve the current join-request screens and workflow unchanged.

The final behavior is:

- A president's CMS changes publish immediately.
- A media head's CMS changes remain pending and invisible to visitors until a president approves them.
- Approval and publication happen in one database transaction.
- Student-guide and FAQ CRUD persists across refreshes and devices.
- Contact messages are private and routed only to the president and vice president.
- Signed-in students see their own previous messages and administrative replies in the student portal.
- Replies to signed-out visitors are delivered through a Supabase Edge Function using Resend.
- Every reply permanently records the responder, responder role, timestamp, and delivery state.

## Existing System and Root Causes

The application already stores the public bundle in `public.published_site_content` and uses `public.edit_requests` for media-head proposals. Direct president publication is durable. The current approval path, however, marks the edit request approved and then changes React/localStorage state without republishing that approved value to Supabase. The approved content can therefore disappear after refresh or on another device.

The guide and FAQ validation failure is caused by a mismatch between form-state keys and validation keys. For example, the guide state contains `label`, `title`, and `intro`, while validation looks for `secLabel`, `secTitle`, and `secIntro` inside that state object. FAQ has the same mismatch for `catTitle`, `qQuestion`, and `qAnswer`. The validator consequently reports visible, completed fields as empty.

Contact messages currently exist only in React state. The contact map is hardcoded in `ContactPage.tsx`.

## Chosen Architecture

### Published content and approval requests

`public.published_site_content` remains the authority for general published site content. It stores only the currently visible version; pending content never enters this row.

The existing `public.edit_requests` table is extended for site edits with structured columns:

- `site_target text`
- `site_payload jsonb`
- `site_base_version bigint`
- `site_payload_version integer`

The legacy text envelope remains available for the existing history display, but structured payload columns become the authority for new CMS approvals. Database constraints require these fields for new `edit_type = 'site'` requests and reject them for unrelated profile requests.

A media head submits through a restricted RPC. The RPC verifies the current executive assignment from database rows, validates a target whitelist and payload-size limits, captures the published version, and inserts a pending request. Media users cannot update the published tables directly.

A president publishes directly through a versioned RPC. A president approves a media request through a separate transactional RPC that:

1. locks the pending request;
2. verifies the caller is the current president;
3. checks that the request is still pending;
4. checks the target's current version against the request base version;
5. publishes the approved payload or president-revised payload;
6. increments the published version;
7. records the reviewer and review timestamp; and
8. changes the request status to approved.

Any conflict leaves both the published content and request status unchanged. The president refreshes and reviews the newer content before retrying.

### Student guide and FAQ

Two separate singleton content tables are added:

`public.student_guide`

- `id text primary key` constrained to `main`
- `quick_info text not null`
- `sections jsonb not null`
- `version bigint not null`
- `updated_by uuid`
- `updated_at timestamptz not null`

`public.faq`

- `id text primary key` constrained to `main`
- `categories jsonb not null`
- `version bigint not null`
- `updated_by uuid`
- `updated_at timestamptz not null`

The migration seeds both tables from the existing `published_site_content.content` values. Because the official project already has this authoritative row, the migration aborts instead of creating empty guide/FAQ tables if the required source keys are absent. This fail-closed behavior preserves all existing guide and FAQ data and prevents a silent content reset.

The frontend continues exposing the current `guideSections`, `guideQuickInfo`, and `faqCategories` state interfaces so page components do not need a broad rewrite. Their repositories load, subscribe to, and publish the new tables. Local storage becomes an offline display fallback, never the publishing authority.

President mutations publish a full validated snapshot with optimistic version checking. Media-head mutations submit the resulting full snapshot as a pending site edit. Approval updates the correct standalone table transactionally.

Validation is moved into pure domain functions that validate actual state properties:

- guide section: `label`, `title`, `intro`
- guide item: `heading`, `body`
- guide contact: `label`, `value`
- FAQ category: `title`
- FAQ item: `question`, `answer`

The UI maps returned semantic errors to visible input IDs. Optional and hidden fields never participate in required-field validation.

### Dynamic contact map

The published content bundle receives a `contactMap` object:

- `title`
- `embedUrl`
- `openUrl`

Existing hardcoded values seed this object during migration. President changes publish directly; media-head changes enter the same approval path.

The frontend accepts either a Google Maps embed URL or pasted iframe markup, extracts only the `src`, validates an HTTPS Google Maps host and approved path/query shape, and stores the sanitized URL. It never renders administrator-provided HTML with `dangerouslySetInnerHTML`.

### Contact messages and replies

`public.contact_messages` stores:

- `id uuid primary key`
- `sender_user_id uuid null`
- `sender_name text`
- `sender_email text`
- `subject text`
- `message text`
- `status text` constrained to `UNREAD`, `READ`, or `REPLIED`
- `read_at timestamptz null`
- `read_by uuid null`
- `created_at timestamptz`
- `updated_at timestamptz`

`sender_user_id` is captured from `auth.uid()` for a signed-in student and remains null for a signed-out visitor. It is never accepted as a client-supplied identifier.

`public.contact_message_replies` stores:

- `id uuid primary key`
- `message_id uuid unique`
- `reply_text text`
- `replied_by uuid`
- `replied_by_name text`
- `replied_by_role text` constrained to president or vice president
- `delivery_channel text` constrained to `IN_APP` or `EMAIL`
- `delivery_status text` constrained to `NOT_REQUIRED`, `PENDING`, `SENT`, or `FAILED`
- `delivery_attempts integer`
- `delivery_last_error text null`
- `email_provider_id text null`
- `replied_at timestamptz`
- `sent_at timestamptz null`

The unique constraint on `message_id` permits one final administrative reply per inquiry. This prevents the president and vice president from replying independently to the same message. Failed email delivery retries the same saved reply; it never creates another administrative reply.

A restricted transactional RPC inserts the reply, snapshots the responder's current public name and role, changes the message status to `REPLIED`, and selects the delivery channel:

- signed-in student message: `IN_APP` and `NOT_REQUIRED`;
- signed-out visitor message: `EMAIL` and `PENDING`.

### Inbox and student portal

The administration dashboard gains a `رسائل الزوار / البريد الوارد` tab visible only when the database-confirmed role is `PRESIDENT` or `VICE_PRESIDENT`. It lists status, sender data, sent time, and reply/delivery state. Opening an unread message calls a restricted RPC to mark it read. The reply dialog refuses empty content, shows the other administrator's completed reply if one already exists, and prevents a second reply.

The student dashboard gains a compact `رسائلي وردود الإدارة` section. It queries only messages whose `sender_user_id` equals the authenticated user's UUID and displays the saved reply when available. Signed-out visitor messages are not later attached by matching an email address, preventing account-takeover data disclosure.

### Resend Edge Function

`supabase/functions/send-contact-reply/index.ts` accepts only a reply UUID. It:

1. requires an authenticated bearer token;
2. verifies the caller is the current president or vice president;
3. loads the saved message and reply using the service-role client;
4. exits idempotently when delivery is already `SENT`;
5. refuses in-app replies and non-pending/non-failed email deliveries;
6. sends escaped HTML and plain text through the Resend HTTP API;
7. records provider ID, attempt count, sent timestamp, and `SENT`; or
8. records a bounded error summary and `FAILED` without exposing secrets.

The function reads `RESEND_API_KEY`, `CONTACT_REPLY_FROM`, and `SITE_PUBLIC_URL` from Supabase Function secrets. No email secret is placed in Vite environment variables or browser code.

The dashboard invokes the function immediately after the reply transaction for visitor messages. If the invocation or provider fails, the permanent reply remains visible with a retry button. Repeated invocation is idempotent.

## Security and RLS

All new public-schema tables have RLS enabled and explicit grants because current Supabase platform defaults no longer guarantee Data API exposure.

- `student_guide`, `faq`, and `published_site_content`: `anon` and `authenticated` receive select only; writes happen through restricted RPCs.
- `edit_requests`: the submitter can read their own rows; the current president can read and decide site requests; no direct client insert/update/delete grants are added.
- `contact_messages`: no direct anonymous table grant. `anon` and `authenticated` can execute the validated submission RPC. A signed-in student can select only rows owned by their UUID. Current president and vice president can select all rows.
- `contact_message_replies`: students can select replies only through parent messages they own. Current president and vice president can select all. No client role inserts or updates directly.
- Delivery/provider fields are never readable by anonymous visitors and can be updated only by the Edge Function's service role.

Every `SECURITY DEFINER` RPC uses an empty `search_path`, schema-qualified names, explicit role checks, revoked `PUBLIC` execute permission, and narrowly granted execution. Role decisions use authoritative profile/executive-assignment data rather than user-editable metadata.

Indexes cover:

- pending site requests by status and submission time;
- contact messages by status and creation time;
- student messages by sender UUID and creation time;
- replies by message UUID;
- failed/pending email delivery states.

## Error Handling and Concurrency

- Optimistic version conflicts never overwrite newer published CMS content.
- Approval is atomic with publication.
- Double-clicks and concurrent replies are stopped by the unique reply constraint and transactional RPC.
- Contact submission enforces trimmed length limits and valid email shape in both frontend and database RPC.
- Email failure never rolls back or loses the administrative reply.
- Realtime subscriptions refresh published content, pending approvals, administrative inbox, and the signed-in student's own messages.
- UI loading, success, validation, version-conflict, authorization, and email-retry states are displayed explicitly in Arabic.

## Testing Strategy

Implementation follows test-driven development.

Automated tests cover:

- the guide and FAQ validation regression using populated visible fields;
- empty and whitespace-only required fields;
- contact-map extraction and host validation;
- repository mapping, version conflicts, and malformed Supabase responses;
- registered versus visitor contact-message routing;
- reply idempotency and role gating;
- migration constraints, grants, RLS policies, indexes, and function privileges;
- preservation of existing guide/FAQ seed content;
- UI conditional visibility for president, vice president, media head, student, and visitor;
- student-only message visibility;
- Edge Function authorization, Resend request shape, escaping, successful delivery, failure recording, and retry behavior.

Verification includes the focused tests, full test suite, TypeScript checking, production build, scoped lint, SQL security review, and live role-based smoke tests after the migration and function are deployed.

## Deployment Prerequisites

The database migration and Edge Function code can be completed locally without secrets. Live email delivery requires:

- a Resend account;
- a verified sending domain or sender address;
- `RESEND_API_KEY` stored as a Supabase Function secret;
- `CONTACT_REPLY_FROM` set to the verified sender;
- `SITE_PUBLIC_URL` set to the public site URL.

The live migration, grants/RLS changes, Edge Function deployment, and secret creation are external changes. They require an action-time confirmation immediately before execution. The Resend key must never be pasted into a frontend `.env` file.

## Out of Scope

- The existing join-request screens, statuses, and workflow are not changed.
- Students do not continue a threaded conversation under one inquiry; they can submit a new inquiry after receiving the single administrative reply.
- Visitor messages are not retroactively linked to an account by email address.
- No external email is sent for an inquiry submitted while authenticated; its reply appears in the student portal.
