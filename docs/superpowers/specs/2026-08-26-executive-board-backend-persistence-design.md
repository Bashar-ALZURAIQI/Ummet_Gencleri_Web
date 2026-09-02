# Executive Board Backend Persistence Design

## Problem

Executive-board content is loaded from `published_site_content.content.committees`, but president edits currently update React state only. Non-president submissions call `submit_profile_edit_request`, whose server-side base snapshot builder rejects the richer member objects already stored in production with `PROFILE_EDIT_INVALID_MEMBER`.

## Approved Architecture

- Keep `published_site_content` as the single published source of truth for executive-board content.
- Keep `edit_requests` as the single source of truth for pending and decided board edit requests.
- Do not add duplicate `executive_board` or `board_edits_requests` tables.
- Project persisted committee members to the strict public edit shape (`id`, `name`, `position`, `photo`) inside the private snapshot builder. The strict normalizer remains strict for client payloads.
- Continue submitting member changes through the authenticated `SECURITY DEFINER` RPC `submit_profile_edit_request`. It must derive actor identity and committee assignment from `auth.uid()`, force `status = 'pending'`, prevent duplicates, and never grant browser-side INSERT access to `edit_requests`.
- Publish president changes through the existing president-only RPC `publish_cms_target('committees', payload, expectedVersion)`. This performs the database update atomically and preserves optimistic concurrency.
- Update React committee state only from a confirmed publication returned by Supabase. On error, retain the modal/input state and surface Supabase diagnostics.
- Load pending requests from `edit_requests` and show only `status = 'pending'` in the president approval view.

## Data and Security Invariants

- RLS remains enabled on both public tables.
- `authenticated` keeps SELECT-only table grants; mutations occur only through explicitly granted RPCs.
- Private normalization helpers remain non-executable by `anon` and `authenticated`.
- Public privileged RPCs explicitly check `auth.uid()` and current assignment/president authority.
- Existing rich member fields such as `phone`, `university`, `major`, and `year` remain stored and are not deleted by the migration.
- No existing request or published committee data is deleted.

## Error Handling

- Supabase errors are preserved as structured diagnostics (`code`, `message`, `details`, `hint`) by the gateway.
- The committee submit path logs the diagnostic with `console.error` and returns a visible Arabic error without reporting a false success.
- The modal closes only after the server confirms either a pending request or a published president update.

## Verification

- A database regression query proves rich persisted member objects can be converted to a strict profile snapshot.
- A frontend test proves president edits call the CMS publication repository and update local state only after confirmation.
- A gateway test proves member submissions call `submit_profile_edit_request`, accept only a returned pending row, and retain raw Supabase diagnostics.
- Full tests, typecheck, lint, and production build pass.
- Production Supabase is queried after migration to confirm the helper succeeds, RLS/grants remain least-privilege, and pending requests are queryable under the established policies.
