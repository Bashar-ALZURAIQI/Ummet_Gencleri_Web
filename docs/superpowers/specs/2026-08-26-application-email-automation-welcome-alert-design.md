# Application Email Automation and Welcome Alert Design

## Objective

Automate four durable membership-application email events through Resend and Supabase Edge Functions while preserving the current application status workflow:

- notify the current president when a new application becomes `pending`;
- notify the student when an interview is scheduled or rescheduled;
- notify the student after final acceptance;
- notify the student after final rejection.

Email failure must never roll back or misreport a successfully committed registration, interview schedule, acceptance, or rejection. The accepted-student welcome banner becomes dismissible per authenticated user and remains dismissed across refreshes on that device.

## Existing System

New Auth users are provisioned transactionally by `public.handle_new_auth_user_profile()`, which inserts an inactive profile and a `pending` `student_applications` row even when email confirmation prevents the browser from receiving a session. Interview and final decisions are committed by president-only RPCs and return the confirmed application row.

The existing `send-contact-reply` Edge Function sends saved contact-message replies through Resend. It uses `RESEND_API_KEY`, `CONTACT_REPLY_FROM`, and `SITE_PUBLIC_URL`, records provider delivery state, and requires a president or vice-president session. Membership notifications have different authorization and recipient rules, so they must not be added to the contact-reply function.

## Chosen Architecture

### Durable notification outbox

Create `public.application_email_notifications` with:

- `id uuid primary key default gen_random_uuid()`;
- `application_id text not null` referencing `student_applications(id)` with `ON DELETE CASCADE`;
- `event_type text not null` constrained to `NEW_APPLICATION`, `INTERVIEW_SCHEDULED`, `ACCEPTED`, or `REJECTED`;
- `fingerprint text not null` identifying the exact state snapshot;
- `payload jsonb not null` containing the immutable application/email-template snapshot required for delivery;
- `delivery_status text not null default 'PENDING'` constrained to `PENDING`, `SENDING`, `SENT`, or `FAILED`;
- `delivery_attempts integer not null default 0`;
- `delivery_last_error text null`;
- `email_provider_id text null`;
- `created_at`, `updated_at`, and `sent_at` timestamps;
- a unique constraint on `(application_id, event_type, fingerprint)`.

Indexes cover `(delivery_status, created_at)` and `(application_id, created_at desc)`.

The outbox is written only by a database trigger and updated only by the service role used inside the Edge Function. RLS is enabled. The current president may select rows for delivery-status visibility and retry controls. Other authenticated users and anonymous visitors receive no table privileges.

### Application transition trigger

Add an `AFTER INSERT OR UPDATE` trigger on `public.student_applications` with a pinned-search-path trigger function:

- an inserted `pending` application creates `NEW_APPLICATION` with fingerprint `initial`;
- an update to `interview`, or a change to any interview date/time/link while already in `interview`, creates `INTERVIEW_SCHEDULED` using a SHA-256 fingerprint of those three normalized values;
- a transition to `accepted` creates `ACCEPTED` with fingerprint `accepted`;
- a transition to `rejected` creates `REJECTED` with a fingerprint containing the final rejection reason hash.

The unique constraint makes repeated identical scheduling or repeated requests idempotent. A genuinely rescheduled interview has a different fingerprint and therefore generates one new email.

The trigger snapshots only server-owned application fields. It does not accept recipients, templates, event types, or notification status from browser input.

### Edge Function

Create a dedicated `send-application-notification` function and leave `send-contact-reply` unchanged. The new function accepts only:

```json
{
  "applicationId": "signup_<uuid>",
  "eventType": "NEW_APPLICATION | INTERVIEW_SCHEDULED | ACCEPTED | REJECTED"
}
```

The function is deployed with gateway JWT verification disabled because a newly registered user may have no session while email confirmation is enabled. It therefore performs its own authorization:

- `NEW_APPLICATION` may be invoked without a user session, but only for an authoritative, already-enqueued notification row whose application is still valid. The caller cannot choose the recipient or content.
- `INTERVIEW_SCHEDULED`, `ACCEPTED`, and `REJECTED` require a valid Supabase user token and a current active `PRESIDENT` assignment.

The function returns a generic response for missing new-application work so it cannot be used to enumerate applications. It selects the latest matching `PENDING` or `FAILED` outbox row, conditionally claims it as `SENDING`, increments attempts, composes the email from the stored snapshot, and calls Resend with `Idempotency-Key: application-notification/<notification-id>`.

On success, it records `SENT`, provider ID, and `sent_at`. On provider/configuration/network failure, it records `FAILED` and a bounded non-secret error. A `SENT` row returns `alreadySent` without another provider call. Concurrent invocations cannot claim the same notification twice, and Resend idempotency provides a second duplicate-delivery barrier.

The function uses the existing `RESEND_API_KEY` and `SITE_PUBLIC_URL`. The sender is `APPLICATION_EMAIL_FROM` when configured, otherwise the already configured `CONTACT_REPLY_FROM`, allowing the existing Resend setup to work without exposing secrets to Vite or browser code.

### Recipient derivation

For `NEW_APPLICATION`, the function resolves the current `PRESIDENT` assignment at delivery time. It uses that president profile's non-empty `contact_email`; if unavailable, it retrieves the president Auth login email with the service-role Admin API. The request body never contains the president email.

For interview and final-decision notifications, the student recipient is the immutable email snapshot placed in the outbox by the database trigger. The frontend cannot override it.

### Email templates

Templates produce Arabic plain text and escaped RTL HTML.

- `NEW_APPLICATION`: “يوجد طلب انضمام جديد باسم [اسم الطالب] بانتظار مراجعتك في لوحة التحكم” with a dashboard/site link.
- `INTERVIEW_SCHEDULED`: congratulates the student on preliminary acceptance and prominently displays the server-confirmed date, time, and HTTPS meeting link.
- `ACCEPTED`: “مبروك، لقد تم قبولك رسمياً كعضو في اتحاد شباب الأمة”.
- `REJECTED`: a polite apology explaining that the student was not accepted in this cycle. The saved rejection reason may be included when present.

Student/application-controlled values are escaped before inclusion in HTML. Meeting links must be absolute HTTPS URLs before the president RPC accepts them and before the template renders them as links.

## Frontend Data Flow

Create a dedicated application-email repository/service. It invokes `send-application-notification`, maps `SENT`, `FAILED`, and `alreadySent` responses, lists the current president's RLS-visible delivery rows, and exposes retry using the same application/event tuple.

### Registration

After Supabase Auth confirms a genuinely new user, `registerWithApplication` invokes `NEW_APPLICATION` using `signup_<auth-user-uuid>`. This happens for both signed-in signup and email-confirmation signup. The notification result never changes the successful signup result into a failure. A failure is logged without secrets and returns a non-blocking Arabic `emailWarning` explaining that the application is saved and the administration notification will be retried.

### Interview scheduling

After `schedule_student_application_interview` returns the confirmed `interview` application row and local state is updated, the frontend invokes `INTERVIEW_SCHEDULED`. The modal closes because the schedule is committed. If delivery fails, the Applications tab shows an amber warning and a retry action instead of claiming the email was sent.

### Final decision

After `decide_student_application` returns the confirmed `accepted` or `rejected` row, the frontend invokes the matching event. The decision and accepted-profile activation remain committed even if delivery fails. The Applications tab shows the saved decision plus delivery warning and retry action.

### Persistent retry visibility

When the president opens the Applications tab, it loads RLS-visible notification delivery rows and displays failed/pending delivery state beside the related application. `FAILED` rows offer “إعادة إرسال البريد”. A refresh cannot erase this state because it lives in Supabase, not React memory.

## Dismissible Accepted Welcome Alert

Only the top `ApplicationBanner` for `accepted` becomes dismissible. Pending, interview, rejected, removed, and access-gating screens remain unchanged.

The local-storage key is:

```text
welcome_message_dismissed_<confirmed-auth-user-uuid>
```

The component reads the key safely when the confirmed user changes. Pressing an accessible `X` button writes `true` and hides the banner immediately. Storage access failures do not crash the dashboard; they hide it for the current React session only. Logging out does not delete another user's preference, and another account on the same device uses a different key.

The existing accepted-member details and dashboard functionality remain visible; only the repeated congratulatory banner is dismissed.

## Error Handling

- Database transitions and notification enqueueing occur in the same transaction.
- Email delivery occurs after the transition and never rolls it back.
- A frontend invocation/network failure leaves the outbox row `PENDING` or `FAILED` for retry.
- Resend errors are persisted without API keys, authorization headers, or full provider payloads.
- The UI distinguishes “operation failed” from “operation saved, email delayed”.
- Duplicate clicks, retries, reschedules, and concurrent calls are controlled by the database unique fingerprint, conditional claim, and Resend idempotency key.

## Security

- `application_email_notifications` has RLS and explicit least-privilege grants.
- Authorization uses `executive_assignments` and active `profiles`, never email strings, `user_metadata`, or browser-supplied roles.
- The service-role key and Resend key stay only in Edge Function secrets.
- Public invocation cannot submit a recipient, subject, HTML, or arbitrary text.
- Non-new application events require a valid current-president session inside the function even though gateway JWT verification is disabled.
- Every privileged database function has an empty `search_path`, schema-qualified objects, revoked `PUBLIC` execution, and narrow grants.

## Testing and Verification

Implementation follows test-driven development. Automated tests cover:

- trigger enqueueing for insert, reschedule, acceptance, and rejection;
- identical-event deduplication and changed-interview fingerprinting;
- migration RLS, grants, constraints, and indexes;
- all four Arabic text/HTML templates and HTML escaping;
- public new-application invocation restrictions;
- president-only interview/final invocation;
- conditional delivery claim, Resend idempotency, sent/failed audit updates, and retries;
- frontend invocation only after confirmed application mutations;
- email failures returning warnings without changing successful operation results;
- per-UUID welcome-banner dismissal and storage-failure handling;
- preservation of the existing contact-reply function and application status behavior.

Verification runs focused tests, the full suite, TypeScript, lint, production build, migration application to project `rscunkzvbsdbjzhnuria`, Edge Function deployment, live schema/RLS checks, and role-based function checks. A real email-delivery smoke test is performed only with an explicit action-time confirmation because it sends an external email.

## Deployment

Apply the migration to the official Supabase project and deploy `send-application-notification` with `verify_jwt = false`. Reuse the existing `RESEND_API_KEY`, `CONTACT_REPLY_FROM`, and `SITE_PUBLIC_URL`. `APPLICATION_EMAIL_FROM` is optional. No secret is added to `.env` or any `VITE_` variable.

## Out of Scope

- No changes to contact-message email content or authorization.
- No change to application status meanings, president-only decision authority, or accepted-profile activation.
- No marketing campaigns, scheduled newsletters, or threaded email conversations.
- No automatic deletion of delivery history.
