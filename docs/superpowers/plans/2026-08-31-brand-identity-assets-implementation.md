# Brand Identity Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** تمكين رئيس الاتحاد وحده من رفع شعار رسمي محفوظ في Supabase وعرضه فورياً في الشريط العلوي وأيقونة المتصفح دون فقدان الشعار السابق عند الفشل.

**Architecture:** يوسّع التنفيذ منظومة `managed_assets` الحالية بمسار `site-logo` وBucket عام جديد باسم `site_assets`. تنسق `AppContext` دورة الرفع والتسجيل والنشر والتعويض، بينما تبقى واجهة الرئيس رقيقة وتستخدم محتوى الموقع المنشور كمصدر الحقيقة.

**Tech Stack:** React 18، TypeScript، Vite، Supabase Storage/PostgreSQL/RLS، Node test runner، Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-31-brand-identity-sidebar-layout-design.md`

## Global Constraints

- Bucket الاسم الحرفي له `site_assets` ومسار الشعار `branding/<uploader-id>/<asset-id>.<ext>`.
- الأنواع المقبولة فقط JPEG وPNG وWebP، والحد الأقصى 5 MB، ولا يقبل SVG.
- الرئيس الحالي فقط يستطيع الرفع والحذف أو النشر المباشر.
- لا يُستبدل الملف في مكانه؛ كل شعار إصدار جديد مع `upsert: false`.
- يجب أن يبقى الشعار القديم منشوراً عند فشل الرفع أو التسجيل أو الحفظ.
- لا يتغير منطق صلاحيات أو محتوى أقسام الإدارة الأخرى.

---

### Task 1: Supabase `site_assets` Bucket and RLS

**Files:**
- Create: `supabase/migrations/20260831120000_site_assets_branding.sql`
- Create: `supabase/tests/site_assets_branding.sql`
- Create: `tests/siteAssetsBrandingMigration.test.mjs`
- Modify: `supabase/migrations/20260824143201_site_wide_managed_assets.sql` only if migration-history verification proves the deployed function signature differs; otherwise leave history immutable.

**Interfaces:**
- Consumes: `private.current_managed_asset_authorization`, `public.managed_assets`, `public.register_managed_asset(...)`.
- Produces: public bucket `site_assets`; president-only object INSERT/DELETE policies; `register_managed_asset` support for `{ bucket: 'site_assets', area: 'site', kind: 'image' }`.

- [ ] **Step 1: Write failing migration contract tests**

Add `tests/siteAssetsBrandingMigration.test.mjs` that reads the new migration and asserts all of these exact contracts:

```js
assert.match(sql, /'site_assets'[\s\S]*true[\s\S]*5242880/);
assert.match(sql, /image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/);
assert.match(sql, /site_assets_public_read/);
assert.match(sql, /site_assets_president_insert/);
assert.match(sql, /site_assets_president_delete/);
assert.match(sql, /position_key\s*=\s*'PRESIDENT'/);
assert.match(sql, /\(storage\.foldername\(name\)\)\[1\]\s*=\s*'branding'/);
assert.match(sql, /asset_bucket\s*=\s*'site_assets'/);
assert.match(sql, /asset_area\s*<>\s*'site'/);
assert.match(sql, /asset_mime_type\s+NOT IN\s*\('image\/jpeg',\s*'image\/png',\s*'image\/webp'\)/);
assert.match(sql, /SET search_path = ''/);
assert.match(sql, /REVOKE EXECUTE[\s\S]*FROM PUBLIC, anon/);
```

- [ ] **Step 2: Run the migration contract test and confirm it fails**

Run: `node --test tests/siteAssetsBrandingMigration.test.mjs`

Expected: FAIL because `20260831120000_site_assets_branding.sql` does not exist.

- [ ] **Step 3: Create the migration with bucket, constraints, policies, and hardened registration**

The migration must:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site_assets', 'site_assets', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.managed_assets
  DROP CONSTRAINT IF EXISTS managed_assets_bucket_check;
ALTER TABLE public.managed_assets
  ADD CONSTRAINT managed_assets_bucket_check
  CHECK (bucket IN ('avatars', 'gallery', 'site_assets'));

ALTER TABLE public.managed_assets
  DROP CONSTRAINT IF EXISTS managed_assets_bucket_area_check;
ALTER TABLE public.managed_assets
  ADD CONSTRAINT managed_assets_bucket_area_check CHECK (
    (bucket = 'avatars' AND area = 'avatar' AND kind = 'image') OR
    (bucket = 'gallery' AND area <> 'avatar') OR
    (bucket = 'site_assets' AND area = 'site' AND kind = 'image')
  );
```

Create `site_assets_public_read`, `site_assets_president_insert`, and `site_assets_president_delete`. The INSERT condition must require `bucket_id = 'site_assets'`, `owner_id = auth.uid()::text`, folder 1 `branding`, folder 2 the caller UUID, and a current `PRESIDENT` assignment. Recreate `register_managed_asset` with an explicit `site_assets` branch that validates owner folder, `area = 'site'`, `kind = 'image'`, MIME allowlist, `size_bytes <= 5242880`, and current presidency. Preserve `SECURITY DEFINER`, `SET search_path = ''`, explicit schema qualification, revoke from `PUBLIC/anon`, and grant only to `authenticated`.

- [ ] **Step 4: Add SQL behavior assertions**

In `supabase/tests/site_assets_branding.sql`, use transaction-local test users/assignments and assert:

```sql
-- president registration for a pre-created branding object succeeds;
-- MEDIA_HEAD and STUDENT registration raises SQLSTATE 42501;
-- wrong folder, wrong owner UUID, SVG MIME, and >5 MB raise an exception;
-- rollback at the end keeps the test repeatable.
```

Use the same assertion helpers and `set_config('request.jwt.claim.sub', ...)` pattern already present in `supabase/tests/task_management_authorization.sql`.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/siteAssetsBrandingMigration.test.mjs tests/managedAssetsMigration.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the database unit**

```bash
git add supabase/migrations/20260831120000_site_assets_branding.sql supabase/tests/site_assets_branding.sql tests/siteAssetsBrandingMigration.test.mjs
git commit -m "feat: secure site branding assets"
```

---

### Task 2: Managed Asset Route and Lookup

**Files:**
- Modify: `src/domain/managedAssets.ts`
- Modify: `src/services/managedAssetService.ts`
- Modify: `tests/managedAssets.test.mjs`
- Create: `tests/siteBrandAssetService.test.mjs`

**Interfaces:**
- Consumes: `routeForUsage`, `buildManagedAssetPath`, `ManagedAssetReference`.
- Produces: `ManagedAssetUsage = ... | 'site-logo'`; bucket union including `site_assets`; `findManagedAssetByPath(bucket, path)`.

- [ ] **Step 1: Add failing route tests**

Add assertions to `tests/managedAssets.test.mjs`:

```js
assert.deepEqual(assets.routeForUsage('site-logo'), {
  bucket: 'site_assets', folder: 'branding', kind: 'image', area: 'site',
});
assert.deepEqual(
  assets.buildManagedAssetPath({ usage: 'site-logo', ownerId, assetId, mimeType: 'image/png' }),
  { ok: true, path: `branding/${ownerId}/${assetId}.png` },
);
assert.equal(assets.isOwnedManagedPath(`branding/${ownerId}/${assetId}.webp`, ownerId), true);
assert.equal(assets.acceptForUsage('site-logo'), 'image/jpeg,image/png,image/webp');
```

- [ ] **Step 2: Run the route tests and confirm failure**

Run: `node --test tests/managedAssets.test.mjs`

Expected: FAIL because `site-logo` is not a known usage.

- [ ] **Step 3: Implement the site-logo route**

Update the TypeScript unions and route table:

```ts
export type ManagedAssetUsage = ExistingManagedAssetUsage | 'site-logo';

export interface ManagedAssetRoute {
  bucket: 'avatars' | 'gallery' | 'site_assets';
  folder: ExistingFolder | 'branding' | null;
  kind: ManagedAssetKind;
  area: ManagedAssetArea;
}

'site-logo': {
  bucket: 'site_assets', folder: 'branding', kind: 'image', area: 'site',
},
```

Restrict `acceptForUsage('site-logo')` to JPEG/PNG/WebP rather than the generic image list containing GIF. Extend the owned-path regex with the exact `branding/<owner>/<uuid>.(jpg|png|webp)` shape.

- [ ] **Step 4: Add a failing service lookup test**

Create `tests/siteBrandAssetService.test.mjs` with a fake client around a pure repository factory. Assert that lookup performs:

```js
['from', 'managed_assets'],
['select', 'id,bucket,object_path,public_url,kind,area,mime_type,size_bytes'],
['eq', 'bucket', 'site_assets'],
['eq', 'object_path', 'branding/...'],
['maybeSingle'],
```

and maps a missing row to `{ ok: true, data: null }`, not an exception.

- [ ] **Step 5: Implement lookup without coupling tests to the global Supabase client**

Add a focused repository factory or an injectable client to `managedAssetService.ts`, then expose:

```ts
export async function findManagedAssetByPath(
  bucket: ManagedAssetReference['bucket'],
  path: string,
): Promise<ServiceResult<ManagedAssetReference | null>>;
```

Reject malformed rows with `ASSET_LOOKUP_RESPONSE_INVALID`, and map query failure to `ASSET_LOOKUP_FAILED`.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `node --test tests/managedAssets.test.mjs tests/siteBrandAssetService.test.mjs`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the asset route unit**

```bash
git add src/domain/managedAssets.ts src/services/managedAssetService.ts tests/managedAssets.test.mjs tests/siteBrandAssetService.test.mjs
git commit -m "feat: add managed site logo route"
```

---

### Task 3: Safe Logo Replacement Coordinator and President UI

**Files:**
- Modify: `src/context/AppContext.tsx`
- Create: `src/components/SiteBrandingPanel.tsx`
- Create: `tests/siteBrandingLifecycle.test.mjs`
- Create: `tests/siteBrandingUiIntegration.test.mjs`

**Interfaces:**
- Consumes: `replaceManagedAsset`, `uploadManagedAsset`, `registerManagedAsset`, `findManagedAssetByPath`, `setManagedAssetStatus`, `removeManagedAssetObject`, `savePublishedSiteTarget` semantics.
- Produces: `SiteContent.brand.logoUrl?: string`, `SiteContent.brand.logoPath?: string`; context method `replaceSiteLogo(file, onProgress?)`.

- [ ] **Step 1: Write failing lifecycle and integration tests**

`tests/siteBrandingLifecycle.test.mjs` must prove that the coordinator:

```js
// publishes { ...siteContent, brand: { ...brand, logoUrl: newUrl, logoPath: newPath } };
// preserves old URL/path when publish fails;
// removes and orphans the new asset when the authenticated owner changes;
// activates the new asset before marking the old asset replaced;
// reports cleanup failure as a warning after a confirmed publish.
```

`tests/siteBrandingUiIntegration.test.mjs` must assert that `SiteBrandingPanel` uses `ManagedFileField` with `usage="site-logo"`, has the label `شعار الاتحاد`, renders `جاري الرفع`, and does not contain a text URL input.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/siteBrandingLifecycle.test.mjs tests/siteBrandingUiIntegration.test.mjs`

Expected: FAIL because the context operation and panel do not exist.

- [ ] **Step 3: Extend the site-content type and defaults compatibly**

In `SiteContent.brand`, add optional fields so old stored JSON remains valid:

```ts
brand: {
  name: string;
  nameTr: string;
  logoIcon: string;
  logoUrl?: string;
  logoPath?: string;
};
```

Do not add placeholder URLs to defaults. Missing fields continue to use the existing Lucide icon.

- [ ] **Step 4: Add `replaceSiteLogo` to AppContext**

Expose:

```ts
replaceSiteLogo: (
  file: File,
  onProgress?: (percentage: number) => void,
) => Promise<ServiceResult<{ publicUrl: string; path: string; warnings: string[] }>>;
```

The operation captures one confirmed president owner, resolves the old managed asset by `logoPath` when present, then calls `replaceManagedAsset`. Its `commitReference` publishes the complete next `siteContent` bundle with optimistic versioning. It rechecks the same user ID, auth epoch, and `PRESIDENT` role before every durable stage. After a confirmed replacement, try deleting the replaced Storage object; map cleanup failures into `warnings` without undoing the successfully published logo.

- [ ] **Step 5: Build the president-only panel**

`SiteBrandingPanel.tsx` must:

```tsx
const { currentUser, siteContent, replaceSiteLogo } = useApp();
if (currentUser?.role !== 'PRESIDENT') return null;
```

Render current logo/fallback, `ManagedFileField usage="site-logo"`, upload progress, and `TransientToast`. The modal/panel must only report success after `replaceSiteLogo` returns `ok: true`; on error use the returned Arabic message and `console.error('[site-branding] replace failed', result.error)`.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `node --test tests/siteBrandingLifecycle.test.mjs tests/siteBrandingUiIntegration.test.mjs tests/managedAssetLifecycle.test.mjs`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the branding editor unit**

```bash
git add src/context/AppContext.tsx src/components/SiteBrandingPanel.tsx tests/siteBrandingLifecycle.test.mjs tests/siteBrandingUiIntegration.test.mjs
git commit -m "feat: add president branding editor"
```

---

### Task 4: Navbar Brand Mark and Dynamic Favicon

**Files:**
- Create: `src/components/BrandMark.tsx`
- Create: `src/components/DynamicFavicon.tsx`
- Modify: `src/components/Navbar.tsx`
- Modify: `src/App.tsx`
- Create: `tests/siteBrandPresentation.test.mjs`

**Interfaces:**
- Consumes: `siteContent.brand.logoUrl`, `siteContent.brand.logoIcon`.
- Produces: reusable `BrandMark`; global `DynamicFavicon` side effect.

- [ ] **Step 1: Write failing presentation tests**

Assert that:

```js
assert.match(navbar, /<BrandMark/);
assert.match(brandMark, /logoUrl/);
assert.match(brandMark, /onError/);
assert.match(favicon, /link\[rel~=["']icon["']\]/);
assert.match(favicon, /document\.createElement\(['"]link['"]\)/);
assert.match(favicon, /logoUrl/);
assert.match(app, /<DynamicFavicon/);
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test tests/siteBrandPresentation.test.mjs`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement resilient brand rendering**

`BrandMark` renders a square `<img>` with `object-contain` when the URL is present. On image error it switches to the existing `Users`/`logoIcon` fallback for that URL and resets when the URL changes. Keep the existing Arabic/Turkish names and inline editing markup in `Navbar` untouched.

- [ ] **Step 4: Implement favicon synchronization**

`DynamicFavicon` reads `siteContent.brand.logoUrl`, finds `link[rel~="icon"]`, creates one if absent, saves the original fallback URL, and sets `href` to the logo URL. When the logo is removed, restore `/icons/union-push-icon.svg`. Render the component once near the root in `App.tsx`.

- [ ] **Step 5: Run presentation, type, lint, and build checks**

Run: `node --test tests/siteBrandPresentation.test.mjs`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Expected: all PASS.

- [ ] **Step 6: Apply and verify Supabase migration**

Before applying, run `npx supabase --help` and the relevant migration command with `--help`. Apply the single new migration to the linked official project. Then query `storage.buckets`, `pg_policies`, and `pg_proc` to verify `site_assets`, all three policies, and the hardened function. Run Supabase Security Advisor and resolve any issue introduced by this migration.

- [ ] **Step 7: Commit the presentation unit**

```bash
git add src/components/BrandMark.tsx src/components/DynamicFavicon.tsx src/components/Navbar.tsx src/App.tsx tests/siteBrandPresentation.test.mjs
git commit -m "feat: display managed union branding"
```

