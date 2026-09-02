# Site-Wide Managed Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every manual local-image/document/video URL field with secure file upload to Supabase Storage, migrate current images without visual loss, and publish shared content across devices.

**Architecture:** Keep the existing TypeScript content shapes and approval workflow. Store the published bundle in one versioned `published_site_content` JSONB row, track uploaded objects in `managed_assets`, and route all mutations through a tested upload/lifecycle service. Avatars retain their secure path-based profile contract; all other managed assets use public URLs returned by the `gallery` bucket.

**Tech Stack:** React 18, TypeScript 5.5, Vite, Supabase JS 2.57, Supabase Postgres/RLS/Storage, Node test runner, `tus-js-client@4.3.1`.

**Spec:** `docs/superpowers/specs/2026-08-24-site-wide-managed-assets-design.md`

## Global Constraints

- Do not alter Join Applications screens, tables, or workflow.
- Preserve executive transfer, president replacement, and current edit-approval behavior.
- Images, videos, PDFs, Office documents, and text documents are local file uploads; YouTube/Vimeo/Instagram/Facebook/external web links remain URL fields.
- Existing images remain visible until their Storage copy is confirmed.
- Never expose a service-role key or persist migration login credentials.
- Use `avatars` only for profile/member avatars and `gallery` for every other asset.
- Use `upsert: false` and versioned UUID paths; never overwrite an existing Storage object.
- No GitHub push, branch, or commit operations; the user requested direct workspace and database changes only.

---

## File Map

**Create**

- `tests/managedAssets.test.mjs`: file validation, routing, and path contracts.
- `tests/managedAssetLifecycle.test.mjs`: upload/register/activate/rollback/replacement behavior.
- `tests/siteContentRepository.test.mjs`: load/versioned-write/conflict behavior.
- `tests/managedAssetsMigration.test.mjs`: executable migration behavior and RLS expectations.
- `tests/managedFileFieldState.test.mjs`: preview and busy-state controller behavior.
- `src/domain/managedAssets.ts`: accepted MIME types, limits, route policy, and safe paths.
- `src/domain/managedAssetAuthorization.ts`: shared role/folder authorization contract mirrored by Storage RLS.
- `src/domain/managedAssetLifecycle.ts`: dependency-injected asset transaction coordinator.
- `src/domain/siteContentRepository.ts`: versioned published-content gateway.
- `src/domain/managedFileFieldState.ts`: pure file-field state transitions.
- `src/services/managedAssetService.ts`: Supabase standard/TUS upload adapter and asset registry.
- `src/services/siteContentService.ts`: Supabase published-content adapter.
- `src/components/ManagedFileField.tsx`: reusable file picker, preview, progress, and errors.
- `scripts/migrate-managed-assets.mjs`: idempotent migration of existing external images.
- A CLI-created `supabase/migrations/*_site_wide_managed_assets.sql` migration.

**Modify**

- `package.json`, `package-lock.json`: pin `tus-js-client@4.3.1`.
- `src/context/AppContext.tsx`: remote content hydration, realtime, versioned publishing, and unified upload API.
- `src/components/InlineEditOverlay.tsx`: image fields use `ManagedFileField`.
- `src/components/HomepageContentCMS.tsx`: homepage images use file upload.
- `src/components/AboutContentCMS.tsx`: About images use file upload.
- `src/pages/ProgramsPage.tsx`: event poster upload.
- `src/pages/MediaGallery.tsx`: album cover/photo/thumbnail upload and video source choice.
- `src/pages/AdminDashboard.tsx`: member photo, gallery, event, news, plan, and report file inputs.
- `src/pages/CommitteePage.tsx`: remove manual avatar URL fields and use managed avatar flow.
- `src/services/avatarService.ts`: register avatar assets and support president-managed avatar replacement without weakening self-service ownership.
- `src/data/mockData.ts`: add stable asset reference IDs where needed for deterministic migration.
- `.env.example` if present: document only non-secret migration variable names.

---

### Task 1: Database, buckets, RLS, and content RPCs

**Files:**

- Create via CLI: `supabase/migrations/*_site_wide_managed_assets.sql`
- Create: `src/domain/managedAssetAuthorization.ts`
- Test: `tests/managedAssetsMigration.test.mjs`

**Interfaces:**

- Produces tables `public.managed_assets`, `public.published_site_content`.
- Produces RPCs `publish_site_content(jsonb, bigint)`, `activate_managed_asset(uuid)`, `replace_member_avatar(uuid, text, text)`.
- Produces public `gallery` bucket and section-aware Storage policies.
- Produces `canUploadManagedFolder(role, folder)` for UI preflight; PostgreSQL RLS remains authoritative.

- [ ] **Step 1: Write the failing migration behavior tests**

Create tests against the production authorization/version contract. Assert these user-visible contracts:

```js
test('gallery upload policy maps roles to permitted folders', () => {
  assert.equal(canUploadManagedFolder('PRESIDENT', 'site'), true);
  assert.equal(canUploadManagedFolder('MEDIA_HEAD', 'news'), true);
  assert.equal(canUploadManagedFolder('MEDIA_HEAD', 'events'), false);
  assert.equal(canUploadManagedFolder('ACADEMIC_HEAD', 'events'), true);
  assert.equal(canUploadManagedFolder('STUDENT', 'news'), false);
});

test('published content rejects a stale expected version', async () => {
  const result = validateExpectedContentVersion({ storedVersion: 4, expectedVersion: 3 });
  assert.deepEqual(result, { ok: false, code: 'CONTENT_VERSION_CONFLICT' });
});
```

- [ ] **Step 2: Run the targeted test and observe RED**

Run `node --test tests/managedAssetsMigration.test.mjs`. Expected failure: the policy evaluator/module and migration are absent.

- [ ] **Step 3: Create the migration with the Supabase CLI**

Run `npx supabase migration new site_wide_managed_assets` and edit only the generated file. Add:

```sql
create table if not exists public.managed_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('avatars', 'gallery')),
  object_path text not null unique,
  public_url text not null,
  kind text not null check (kind in ('image', 'video', 'document')),
  area text not null check (area in ('news','events','gallery','site','plans','reports','avatar')),
  owner_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','active','replaced','orphaned')),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  activated_at timestamptz,
  replaced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.published_site_content (
  id text primary key check (id = 'main'),
  content jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
```

Enable RLS before grants. Grant `SELECT` on the published row to `anon, authenticated`, explicit table privileges needed by the Data API, and only the minimal privileges for managed assets. Implement all privileged writes as `SECURITY DEFINER` functions with `SET search_path = ''`, an explicit `(select auth.uid())` identity check, current-role lookup from `executive_assignments`, `REVOKE EXECUTE ... FROM PUBLIC`, then the narrow authenticated grant.

Insert/update buckets:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery', 'gallery', true, 52428800,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

Storage policies must require folder 2 to equal `auth.uid()::text`, evaluate folder 1 against the current executive role, and let the current president delete/replace objects when administering content. Do not mutate rows in `storage.objects` directly.

- [ ] **Step 4: Implement the production preflight contract used by the tests**

Implement `managedAssetAuthorization.ts` with the exact role/folder matrix and version precondition. Keep it as UI preflight only; duplicate the same predicates explicitly in SQL and prove the live SQL policies in Task 10 rather than pretending a TypeScript check enforces database access.

- [ ] **Step 5: Run migration tests GREEN**

Run `node --test tests/managedAssetsMigration.test.mjs` and confirm all cases pass.

---

### Task 2: File validation and routing domain

**Files:**

- Create: `src/domain/managedAssets.ts`
- Test: `tests/managedAssets.test.mjs`

**Interfaces:**

- Produces `validateManagedFile(file, kind)`, `buildManagedAssetPath(input)`, `routeForUsage(usage)`, `isOwnedManagedPath(path, ownerId)`.
- Consumed by lifecycle, Supabase service, UI, and migration script.

- [ ] **Step 1: Write failing table-driven tests**

Use hand-derived expected values:

```js
test('routes each local asset usage to the required bucket and folder', () => {
  assert.deepEqual(routeForUsage('avatar'), { bucket: 'avatars', folder: null, kind: 'image' });
  assert.deepEqual(routeForUsage('news-image'), { bucket: 'gallery', folder: 'news', kind: 'image' });
  assert.deepEqual(routeForUsage('event-image'), { bucket: 'gallery', folder: 'events', kind: 'image' });
  assert.deepEqual(routeForUsage('document'), { bucket: 'gallery', folder: 'documents', kind: 'document' });
  assert.deepEqual(routeForUsage('video-file'), { bucket: 'gallery', folder: 'videos', kind: 'video' });
});

test('rejects svg, html, executables, oversized files, and MIME-extension spoofing', () => {
  assert.equal(validateManagedFile({ name: 'x.svg', type: 'image/svg+xml', size: 100 }, 'image').ok, false);
  assert.equal(validateManagedFile({ name: 'x.html', type: 'text/html', size: 100 }, 'document').ok, false);
  assert.equal(validateManagedFile({ name: 'x.exe', type: 'application/octet-stream', size: 100 }, 'document').ok, false);
  assert.equal(validateManagedFile({ name: 'x.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }, 'image').ok, false);
});
```

- [ ] **Step 2: Observe RED**

Run `node --test tests/managedAssets.test.mjs`. Expected failure: module not found.

- [ ] **Step 3: Implement minimal domain code**

Use immutable MIME maps, per-kind byte limits, the current account UUID, and a generated asset UUID. Return paths exactly as `<folder>/<owner-uuid>/<asset-uuid>.<safe-extension>`. Return structured Arabic-safe error codes rather than raw exceptions.

- [ ] **Step 4: Run GREEN and mutation-check boundaries**

Run the test, then temporarily reason through wrong folder, wrong limit, and accepting SVG; each realistic mutation must fail at least one test.

---

### Task 3: Transactional asset lifecycle

**Files:**

- Create: `src/domain/managedAssetLifecycle.ts`
- Test: `tests/managedAssetLifecycle.test.mjs`

**Interfaces:**

- Produces `createManagedAsset`, `replaceManagedAsset`, `discardPendingAsset`.
- Dependencies are injected: `upload`, `register`, `commitReference`, `activate`, `removeObject`, `markOrphaned`, `markReplaced`.

- [ ] **Step 1: Write failing lifecycle tests**

Cover these exact outcomes:

```js
test('failed content commit removes the newly uploaded object and preserves the old URL', async () => {
  const result = await replaceManagedAsset(fixture({
    oldUrl: 'https://old.example/image.jpg',
    commitReference: async () => fail('CONTENT_WRITE_FAILED'),
  }));
  assert.equal(result.ok, false);
  assert.equal(result.publishedUrl, 'https://old.example/image.jpg');
  assert.deepEqual(result.effects, ['upload:new', 'register:pending', 'commit:failed', 'remove:new']);
});

test('successful replacement activates new asset before marking old asset replaced', async () => {
  const result = await replaceManagedAsset(fixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.effects, ['upload:new', 'register:pending', 'commit:new-url', 'activate:new', 'replace:old']);
});
```

Also cover cleanup failure as a success-with-warning and stale-auth publication suppression.

- [ ] **Step 2: Observe RED**

Run `node --test tests/managedAssetLifecycle.test.mjs`.

- [ ] **Step 3: Implement minimal coordinator**

No Supabase imports are allowed in this domain file. Enforce upload → pending record → content commit → activation; perform rollback on every earlier failure and never delete an existing URL before the new reference is confirmed.

- [ ] **Step 4: Run GREEN**

Run the targeted lifecycle test and the existing avatar lifecycle tests to ensure the new design does not regress avatars.

---

### Task 4: Supabase adapters and resumable uploads

**Files:**

- Modify: `package.json`, `package-lock.json`
- Create: `src/services/managedAssetService.ts`
- Create: `src/domain/siteContentRepository.ts`
- Create: `src/services/siteContentService.ts`
- Test: `tests/siteContentRepository.test.mjs`

**Interfaces:**

- Produces `uploadManagedAsset(input, onProgress)`, `removeManagedAssetObject`, `registerManagedAsset`, `loadPublishedSiteContent`, `publishSiteContent`.

- [ ] **Step 1: Install the pinned resumable client**

Run `npm install --save-exact tus-js-client@4.3.1`. Verify both manifest and lockfile contain exactly `4.3.1`.

- [ ] **Step 2: Write failing repository tests**

Use a complete fake PostgREST response and assert that `publishSiteContent` sends the expected version and distinguishes `CONTENT_VERSION_CONFLICT` from network failure. Assert load returns `{ content, version }` and never silently substitutes local defaults after a confirmed remote row.

- [ ] **Step 3: Observe RED**

Run `node --test tests/siteContentRepository.test.mjs`.

- [ ] **Step 4: Implement adapters**

For files at or below 6 MB use:

```ts
supabase.storage.from(bucket).upload(path, file, {
  upsert: false,
  contentType: file.type,
  cacheControl: '3600',
});
```

For larger files use `tus.Upload` against `https://<project-ref>.storage.supabase.co/storage/v1/upload/resumable`, obtain only the current access token from `supabase.auth.getSession()`, set bucket/object metadata, report percentage, and resume the first matching prior upload. The server remains the authority for RLS.

Generate public URLs only after successful upload using `getPublicUrl(path)`. Convert raw Supabase errors to stable service codes and user-safe Arabic messages.

- [ ] **Step 5: Run GREEN**

Run repository tests, typecheck, and the existing Supabase service tests.

---

### Task 5: Shared published-content hydration and realtime

**Files:**

- Modify: `src/context/AppContext.tsx`
- Test: extend `tests/backgroundProfileRefresh.test.mjs` only for shared stale-owner semantics, and create repository integration cases in `tests/siteContentRepository.test.mjs`.

**Interfaces:**

- App context produces `contentLoading`, `contentError`, `contentVersion`, `uploadManagedFile`, `publishContentMutation`.
- Existing setters remain internally available, but targeted save flows call versioned async mutations.

- [ ] **Step 1: Write failing hydration/publication tests**

Assert remote content loads before any default write; anonymous users never write; stale realtime events do not overwrite a higher local version; a version conflict leaves the modal open and asks for refresh.

- [ ] **Step 2: Observe RED**

Run the repository integration tests and confirm the missing coordinator behavior.

- [ ] **Step 3: Implement remote hydration**

At provider start, load `main`; if absent and current user is president, seed once using a versioned RPC. Store a local cache only after remote confirmation. On network failure, expose the last local bundle as read-only fallback and do not upsert it automatically.

- [ ] **Step 4: Implement realtime and versioned writes**

Subscribe to `published_site_content` row `main`. Publish only newer versions. `publishContentMutation` computes the next bundle from the latest confirmed content, calls the RPC, then updates all React slices together. Capture the exact authenticated owner/epoch before async mutations and suppress results after logout or account switch.

- [ ] **Step 5: Run GREEN**

Run targeted tests and `npm run typecheck`.

---

### Task 6: Reusable managed file field

**Files:**

- Create: `src/domain/managedFileFieldState.ts`
- Create: `src/components/ManagedFileField.tsx`
- Test: `tests/managedFileFieldState.test.mjs`

**Interfaces:**

- Props include `usage`, `currentUrl`, `required`, `disabled`, `onUploaded`, `onClear`, `allowExternalVideoLink`.
- Emits a confirmed `ManagedAssetReference`; never emits raw input text for local files.

- [ ] **Step 1: Write failing pure-state tests**

Assert selecting a valid file creates preview state, changing selection revokes the old preview, invalid selection produces an error without upload, busy disables submission, upload failure retains current URL, and success clears temporary preview.

- [ ] **Step 2: Observe RED**

Run `node --test tests/managedFileFieldState.test.mjs`.

- [ ] **Step 3: Implement state domain and React component**

Render `<input type="file">` with an accept list derived from usage, image/video preview, document name/size, upload progress, Arabic status text, retry, cancel-selection, and optional remove. Revoke every Object URL on replacement/unmount. Do not render a URL textbox for local assets.

- [ ] **Step 4: Run GREEN and typecheck**

Run the state test and `npm run typecheck`.

---

### Task 7: Replace every targeted form

**Files:**

- Modify: `src/components/InlineEditOverlay.tsx`
- Modify: `src/components/HomepageContentCMS.tsx`
- Modify: `src/components/AboutContentCMS.tsx`
- Modify: `src/pages/ProgramsPage.tsx`
- Modify: `src/pages/MediaGallery.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Modify: `src/pages/CommitteePage.tsx`
- Test: `tests/editSubmissionAwait.test.mjs` and a new behavioral inventory in `tests/managedAssets.test.mjs`.

**Interfaces:**

- Consumes `ManagedFileField` and `publishContentMutation`.
- Preserves external URL fields explicitly named `externalUrl`, `eventUrl`, `photoUrl`, `meetingUrl`, and YouTube/Vimeo source URL.

- [ ] **Step 1: Add failing behavioral inventory tests**

Test form contracts through exported submit helpers, not source-text grep: creating news/events/albums without a confirmed uploaded asset fails; editing without a new selection preserves the old URL; PDF plan/report submission requires a confirmed document reference; external video-link mode accepts YouTube/Vimeo and file mode requires a video asset.

- [ ] **Step 2: Observe RED**

Run `node --test tests/managedAssets.test.mjs tests/editSubmissionAwait.test.mjs`.

- [ ] **Step 3: Convert inline/site CMS image fields**

Replace `type="url"` branches for `type: 'image'` with `ManagedFileField`. Upload before building the approved change envelope. For media-head edits, keep the asset pending until president decision.

- [ ] **Step 4: Convert news and events**

In both Admin Dashboard and public Programs editing flows, require an uploaded image on add, preserve the current URL on edit, display preview/progress, and await the content write before closing the modal. Keep `externalUrl`/`eventUrl` as URL inputs.

- [ ] **Step 5: Convert gallery**

Convert album cover, photo item, and video thumbnail. Add a source selector:

```ts
type GalleryVideoSource = 'upload' | 'external';
```

`upload` renders file upload and stores the Storage URL; `external` renders a YouTube/Vimeo URL. Instagram/Facebook post links remain separate URL fields.

- [ ] **Step 6: Convert documents**

Replace plan/report `pdfUrl` fields with a document picker accepting PDF/DOC/DOCX/XLS/XLSX/PPT/PPTX/TXT. Keep the stored display URL field internally for backward compatibility, but no manual URL input is shown.

- [ ] **Step 7: Convert committee/member legacy photo fields**

Use `avatars` routing for photos. For authenticated UUID members, use the president-managed avatar operation. For legacy display-only committee records, store the uploaded avatar public URL in published content under a president-owned managed avatar path.

- [ ] **Step 8: Run GREEN**

Run targeted tests, typecheck, and targeted ESLint over all modified files.

---

### Task 8: Avatar administration without weakening owner security

**Files:**

- Modify: `src/services/avatarService.ts`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Test: `tests/avatarLifecycle.test.mjs`, `tests/userAvatarPolicy.test.mjs`, `tests/managedAssetsMigration.test.mjs`

**Interfaces:**

- Produces `uploadMemberAvatarAsPresident(targetUserId, file)`.
- Uses RPC `replace_member_avatar(target_user_id, expected_old_path, new_path)` after Storage upload.

- [ ] **Step 1: Write failing authorization and rollback tests**

Assert non-president rejection before upload, president self/session switch suppression, target UUID validation, profile compare-and-set conflict cleanup, and old avatar cleanup only after profile confirmation.

- [ ] **Step 2: Observe RED**

Run the three targeted avatar/policy test files.

- [ ] **Step 3: Implement minimal service and UI binding**

Reuse avatar validation/path safety. Never permit a free-form target path. Upload a versioned object, call the protected RPC, remove the new object on conflict, refresh the authoritative account directory, and then clean the old safe path.

- [ ] **Step 4: Run GREEN**

Run avatar tests and typecheck.

---

### Task 9: Migrate existing images without loss

**Files:**

- Create: `scripts/migrate-managed-assets.mjs`
- Modify: `src/data/mockData.ts` only where stable migration IDs are required.
- Test: add executable migration cases to `tests/managedAssetsMigration.test.mjs`.

**Interfaces:**

- Script reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and process-only `MIGRATION_EMAIL`, `MIGRATION_PASSWORD`.
- Produces a JSON report with `migrated`, `preserved`, `failed`, and `unchanged` counts; never writes credentials or source image bytes to disk.

- [ ] **Step 1: Write failing idempotency and preservation tests**

Use an in-memory content bundle and fake downloader/uploader. Assert duplicate source URLs upload once, every reference is replaced consistently, a failed download preserves the original URL, and a second run performs no duplicate upload.

- [ ] **Step 2: Observe RED**

Run `node --test tests/managedAssetsMigration.test.mjs`.

- [ ] **Step 3: Implement migration script**

Authenticate as the current president with ephemeral process environment variables, inventory image fields recursively from the exact supported paths, fetch each external image into memory, validate response MIME/size, upload using `gallery/<area>/<president-id>/<uuid>.<ext>`, register/activate it, and replace content only after that upload succeeds. Use the current versioned publish RPC once for the final confirmed bundle.

- [ ] **Step 4: Dry-run locally**

Run the script with `--dry-run`; verify counts and that no Storage/database mutation methods are invoked.

- [ ] **Step 5: Run live migration after action-time approval**

Ask the user immediately before running because this uploads objects and changes published database content. Run with credentials in process memory only. Save only the non-secret JSON result under `tmp` if needed, and remove it after verification.

- [ ] **Step 6: Verify visual preservation**

Compare the list of original image fields against the final content bundle: every field must have either a confirmed Supabase URL or its original value. Open representative home, news, events, gallery, board, and About pages and verify no broken image.

---

### Task 10: Apply Supabase changes and complete verification

**Files:**

- All files above.

- [ ] **Step 1: Run full local verification**

Run, in order:

```powershell
npm test
npm run typecheck
npx eslint src/domain/managedAssets.ts src/domain/managedAssetLifecycle.ts src/domain/siteContentRepository.ts src/domain/managedFileFieldState.ts src/services/managedAssetService.ts src/services/siteContentService.ts src/components/ManagedFileField.tsx src/components/InlineEditOverlay.tsx src/components/HomepageContentCMS.tsx src/components/AboutContentCMS.tsx src/pages/ProgramsPage.tsx src/pages/MediaGallery.tsx src/pages/AdminDashboard.tsx src/pages/CommitteePage.tsx src/context/AppContext.tsx
npm run build
```

Record exact pass counts and distinguish pre-existing warnings from new failures.

- [ ] **Step 2: Review migration and security checklist**

Verify every exposed table has RLS, UPDATE has `USING` and `WITH CHECK`, no policy trusts `user_metadata`, all `SECURITY DEFINER` functions have empty search path and explicit authorization, and PUBLIC execute is revoked.

- [ ] **Step 3: Apply the migration after action-time approval**

Use the official Supabase project already supplied by the user. Ask immediately before running the permission-changing migration. Apply it once, inspect success, and do not create any other project/database.

- [ ] **Step 4: Run live SQL verification**

Confirm tables/functions/buckets exist, grants are correct, RLS is enabled, policies contain the expected folder/role predicates, `gallery` is public with a 50 MB bucket cap and allowed MIME list, and `avatars` remains limited to images.

- [ ] **Step 5: Run Supabase Security Advisor**

Confirm zero new errors. Record any pre-existing warnings separately.

- [ ] **Step 6: Browser end-to-end verification**

Test as president and one non-president executive:

1. Existing migrated images still render.
2. Select a replacement and see preview.
3. Save shows upload/progress state and persists after refresh.
4. Another open session/device receives published content.
5. Media-head upload remains pending until president approval.
6. Rejection removes or orphans the pending object without publishing it.
7. Student can change only their avatar.
8. Unauthorized role cannot upload to a forbidden folder.
9. YouTube/Instagram fields remain links.
10. PDF/Word/video local files use file inputs, not URL inputs.

- [ ] **Step 7: Final regression check**

Re-run `npm test`, `npm run typecheck`, targeted ESLint, and `npm run build` after live verification. Report the user-visible result without Git/GitHub instructions.
