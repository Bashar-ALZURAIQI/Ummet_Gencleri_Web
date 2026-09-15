import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION_FILE = '20260915130000_guide_document_safe_path_authorization.sql';
const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const migrations = readdirSync(fileURLToPath(migrationsUrl)).sort();
const fileName = migrations.find((name) => name.endsWith(MIGRATION_FILE) || name === MIGRATION_FILE);
assert.ok(fileName, 'missing guide document safe path authorization migration');

const sql = readFileSync(fileURLToPath(new URL(fileName, migrationsUrl)), 'utf8');
const normalized = sql.toLowerCase();

const policyStart = normalized.indexOf('create policy "gallery_authorized_insert"');
assert.ok(policyStart >= 0, 'gallery_authorized_insert policy must be recreated');
const functionStart = normalized.indexOf('create or replace function public.register_managed_asset');
assert.ok(functionStart >= 0, 'register_managed_asset must be redefined');
const policyBlock = normalized.slice(policyStart, functionStart);
const functionBlock = normalized.slice(functionStart);

// Non-PRESIDENT executive roles (used for role-matrix assertions)
const NON_PRESIDENT_EXECUTIVES = [
  'vice_president',
  'media_head',
  'finance_head',
  'audit_head',
  'academic_head',
  'activities_head',
];

// ---------- Migration ordering ----------

test('guide document migration follows the own-committee localization RPC draft', () => {
  const ownCommittee = migrations.find((name) => name.endsWith('_own_committee_localization_rpcs.sql'));
  assert.ok(ownCommittee, 'missing own-committee localization RPCs migration');
  assert.ok(
    migrations.indexOf(fileName) > migrations.indexOf(ownCommittee),
    'guide document migration must be newer than the own-committee localization RPCs migration',
  );
});

// ---------- Gallery INSERT policy ----------

test('gallery INSERT policy derives authorization from auth.uid() and stays owner-bound', () => {
  assert.match(policyBlock, /for insert[\s\S]*to authenticated[\s\S]*with check/);
  assert.match(policyBlock, /owner_id = \(select auth\.uid\(\)\)::text/);
  assert.match(policyBlock, /\(storage\.foldername\(name\)\)\[2\] = \(select auth\.uid\(\)\)::text/);
  assert.ok(
    policyBlock.indexOf('(storage.foldername(name))[2] = (select auth.uid())::text')
      < policyBlock.indexOf("= 'guide'"),
    'the owner-bound path check must apply before the guide marker check',
  );
  assert.match(policyBlock, /from private\.current_managed_asset_authorization as authz/);
});

test('gallery INSERT policy restricts guide documents to PRESIDENT and MEDIA_HEAD only', () => {
  // guide marker check must appear
  assert.match(policyBlock, /= 'guide'/);
  assert.match(policyBlock, /string_to_array\(name, '\/'\)\)\[3\]/);
  // PRESIDENT always allowed
  assert.match(policyBlock, /authz\.position_key = 'president'/);
  // MEDIA_HEAD must be the only other role that sees guide paths
  assert.match(policyBlock, /authz\.position_key = 'media_head'[\s\S]*= 'guide'/);
  // Other roles must NOT appear in the guide path branch
  for (const role of ['vice_president', 'finance_head', 'audit_head', 'academic_head', 'activities_head']) {
    assert.doesNotMatch(
      policyBlock,
      new RegExp(`position_key\\s*=\\s*'${role}'[\\s\\S]{0,250}= 'guide'`),
      `${role} must not have access to guide documents`,
    );
  }
});

test('gallery INSERT policy preserves the existing per-folder permissions for non-guide paths', () => {
  // MEDIA_HEAD keeps news, albums, site, videos and a separate documents clause
  assert.match(policyBlock, /authz\.position_key = 'media_head'[\s\S]*in \('news', 'albums', 'site', 'videos'\)/);
  assert.match(policyBlock, /authz\.position_key = 'media_head'[\s\S]*foldername\(name\)\)\[1\]\s*=\s*'documents'/);
  // Non-president executives keep events and documents under one grouped role condition
  assert.match(policyBlock, /authz\.position_key in \([\s\S]*'vice_president',\s*'finance_head',\s*'audit_head',\s*'academic_head',\s*'activities_head'\s*\)/);
  assert.match(policyBlock, /authz\.position_key in \([\s\S]*'activities_head'\s*\)[\s\S]*foldername\(name\)\)\[1\]\s*=\s*'events'/);
  assert.match(policyBlock, /authz\.position_key in \([\s\S]*'activities_head'\s*\)[\s\S]*foldername\(name\)\)\[1\]\s*=\s*'documents'/);
  assert.doesNotMatch(policyBlock, /is_executive/);
});

test('gallery INSERT policy denies guide paths for non-guide roles via segment-3 null check', () => {
  // Non-guide roles must have a segment-3-is-null constraint in their branch
  assert.match(
    policyBlock,
    /vice_president[\s\S]*finance_head[\s\S]*audit_head[\s\S]*= 'documents'[\s\S]*string_to_array\(name, '\/'\)\)\[3\]\s+is\s+null/i,
  );
});

// ---------- register_managed_asset ----------

test('register_managed_asset stays owner-bound and handles guide documents for PRESIDENT and MEDIA_HEAD', () => {
  assert.match(functionBlock, /elsif asset_bucket = 'gallery'/);
  assert.match(functionBlock, /split_part\(asset_path, '\/', 2\) <> v_actor_id::text/);
  assert.ok(
    functionBlock.indexOf("split_part(asset_path, '/', 2) <> v_actor_id::text")
      < functionBlock.indexOf("v_folder = 'documents'"),
    'the owner-bound path check must run before the guide/documents folder authorization',
  );
  assert.match(functionBlock, /v_is_guide_document/);
  assert.match(functionBlock, /split_part\(asset_path, '\/', 3\)/);
  assert.match(functionBlock, /v_position\s+not\s+in\s*\('president',\s*'media_head'\)/);
  assert.match(functionBlock, /asset_area\s+<>\s*'guide'/);
  assert.match(functionBlock, /asset_kind\s+<>\s*'document'/);
  assert.match(functionBlock, /asset_id::text.*\[.\].*pdf\|doc\|docx\|xls\|xlsx\|ppt\|pptx/i);
  assert.match(functionBlock, /v_position = 'president'/);
  assert.match(functionBlock, /v_position = 'media_head'[\s\S]*v_folder = 'documents'/);
});

test('register_managed_asset preserves the existing per-folder non-guide permissions', () => {
  assert.match(functionBlock, /v_position = 'media_head'[\s\S]*in \('news', 'albums', 'site', 'documents', 'videos'\)/);
  assert.match(functionBlock, /v_position in \('academic_head', 'activities_head'\)[\s\S]*v_folder = 'documents'/);
  assert.match(functionBlock, /v_position in \('vice_president', 'finance_head', 'audit_head'\)[\s\S]*v_folder = 'documents'/);
});

test('register_managed_asset validates guide path shape: exactly 4 segments and allowed extensions', () => {
  assert.match(functionBlock, /cardinality\(string_to_array\(asset_path, '\/'\)\)/);
  assert.match(functionBlock, /coalesce\(cardinality\(string_to_array\(asset_path, '\/'\)\),?\s*0\)\s*<> 4/);
  assert.match(functionBlock, /pdf\|doc\|docx\|xls\|xlsx\|ppt\|pptx/i);
  assert.match(functionBlock, /split_part\(asset_path, '\/', 4\)\s+!~\*/);
  assert.match(functionBlock, /'\^'\s*\|\|\s*asset_id::text\s*\|\|\s*'\[\.\]\(pdf\|doc\|docx\|xls\|xlsx\|ppt\|pptx\)\$'/);
});

// ---------- Role matrix (STUDENT never granted) ----------

test('STUDENT is never granted gallery write or guide-document access', () => {
  const codeOnly = normalized.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(codeOnly, /'student'/);
  assert.doesNotMatch(policyBlock, /position_key\s*=?\s*'student'/);
  assert.doesNotMatch(functionBlock, /v_position[\s\S]{0,40}'student'/);
});

test('ANONYMOUS is denied by the FOR INSERT TO authenticated clause', () => {
  assert.match(policyBlock, /to authenticated/);
  assert.doesNotMatch(policyBlock, /to\s+anon[\s\S]*insert/);
});

// ---------- Path spoofing ----------

test('gallery INSERT policy requires both folder-1 owner and folder-2 owner match', () => {
  assert.match(policyBlock, /owner_id = \(select auth\.uid\(\)\)::text/);
  assert.match(policyBlock, /\(storage\.foldername\(name\)\)\[2\] = \(select auth\.uid\(\)\)::text/);
});

test('register_managed_asset rejects gallery paths not owned by the caller', () => {
  assert.match(functionBlock, /split_part\(asset_path, '\/', 2\) <> v_actor_id::text/);
});

// ---------- Regression: plan/report documents, event images, avatars ----------

test('plan-document and report-document paths remain under generic documents folder', () => {
  // documents folder is still listed for multiple roles
  assert.match(normalized, /documents.*documents/);
  assert.match(functionBlock, /v_folder = 'documents'/);
});

test('event-image and all executive event folders remain unchanged', () => {
  assert.match(functionBlock, /v_position = 'president'/);
  assert.match(functionBlock, /v_folder in \('events', 'documents'\)/);
});

test('avatars branch remains president-only and untouched', () => {
  assert.match(functionBlock, /if asset_bucket = 'avatars'/);
  assert.match(functionBlock, /v_position.*president/);
});

test('site_assets branch remains president-only and untouched', () => {
  assert.match(functionBlock, /elsif asset_bucket = 'site_assets'/);
  assert.match(functionBlock, /v_position is distinct from 'president'/);
  assert.match(functionBlock, /v_folder <> 'branding'/);
});

// ---------- Preserves table and storage config ----------

test('preserves owner-only cleanup and leaves unrelated storage config untouched', () => {
  assert.doesNotMatch(normalized, /drop policy[\s\S]{0,60}gallery_owner_or_president_delete/);
  assert.doesNotMatch(normalized, /create policy[\s\S]{0,60}gallery_owner_or_president_delete/);
  assert.doesNotMatch(normalized, /insert into storage\.buckets/);
  assert.doesNotMatch(normalized, /alter table public\.managed_assets/);
  assert.doesNotMatch(normalized, /create policy[\s\S]{0,60}avatars_/);
  assert.doesNotMatch(normalized, /create policy[\s\S]{0,60}site_assets_/);
});

// ---------- RPC access control ----------

test('registers the RPC for authenticated only, never anon or service_role', () => {
  assert.match(normalized, /revoke execute on function public\.register_managed_asset[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(normalized, /grant execute on function public\.register_managed_asset[\s\S]*to authenticated/);
  assert.doesNotMatch(normalized, /grant execute on function public\.register_managed_asset[\s\S]*to (?:anon|service_role)/);
});

// ---------- Client path routing ----------

test('buildManagedAssetPath generates guide path with guide marker', async () => {
  const { buildManagedAssetPath } = await import('../src/domain/managedAssets.ts');
  const ownerId = 'a1b2c3d4-e5f6-4a2b-8c4d-5e6f7a8b9c0d';
  const assetId = 'd0c9b8a7-6f5e-4d3c-9b1a-0f9e8d7c6b5a';
  const result = buildManagedAssetPath({
    usage: 'guide-document',
    ownerId,
    assetId,
    mimeType: 'application/pdf',
  });
  assert.deepEqual(result, {
    ok: true,
    path: `documents/${ownerId}/guide/${assetId}.pdf`,
  });
});

test('buildManagedAssetPath guide path includes doc/docx/xls/xlsx/ppt/pptx extensions', async () => {
  const { buildManagedAssetPath } = await import('../src/domain/managedAssets.ts');
  const ownerId = 'a1b2c3d4-e5f6-4a2b-8c4d-5e6f7a8b9c0d';
  const assetId = 'd0c9b8a7-6f5e-4d3c-9b1a-0f9e8d7c6b5a';
  const cases = [
    ['application/pdf', 'pdf'],
    ['application/msword', 'doc'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['application/vnd.ms-excel', 'xls'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['application/vnd.ms-powerpoint', 'ppt'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
  ];
  for (const [mime, ext] of cases) {
    const result = buildManagedAssetPath({ usage: 'guide-document', ownerId, assetId, mimeType: mime });
    assert.deepEqual(result, { ok: true, path: `documents/${ownerId}/guide/${assetId}.${ext}` });
  }
});

test('buildManagedAssetPath plan-document and report-document paths remain unchanged', async () => {
  const { buildManagedAssetPath } = await import('../src/domain/managedAssets.ts');
  const ownerId = 'a1b2c3d4-e5f6-4a2b-8c4d-5e6f7a8b9c0d';
  const assetId = 'd0c9b8a7-6f5e-4d3c-9b1a-0f9e8d7c6b5a';
  const plan = buildManagedAssetPath({ usage: 'plan-document', ownerId, assetId, mimeType: 'application/pdf' });
  assert.deepEqual(plan, { ok: true, path: `documents/${ownerId}/${assetId}.pdf` });
  const report = buildManagedAssetPath({ usage: 'report-document', ownerId, assetId, mimeType: 'application/msword' });
  assert.deepEqual(report, { ok: true, path: `documents/${ownerId}/${assetId}.doc` });
});

test('buildManagedAssetPath event-image path is unchanged', async () => {
  const { buildManagedAssetPath } = await import('../src/domain/managedAssets.ts');
  const ownerId = 'a1b2c3d4-e5f6-4a2b-8c4d-5e6f7a8b9c0d';
  const assetId = 'd0c9b8a7-6f5e-4d3c-9b1a-0f9e8d7c6b5a';
  const result = buildManagedAssetPath({ usage: 'event-image', ownerId, assetId, mimeType: 'image/png' });
  assert.deepEqual(result, { ok: true, path: `events/${ownerId}/${assetId}.png` });
});

// ---------- isOwnedManagedPath ----------

test('isOwnedManagedPath recognizes guide paths with guide marker', async () => {
  const { isOwnedManagedPath } = await import('../src/domain/managedAssets.ts');
  const ownerId = 'a1b2c3d4-e5f6-4a2b-8c4d-5e6f7a8b9c0d';
  const assetId = 'd0c9b8a7-6f5e-4d3c-9b1a-0f9e8d7c6b5a';
  assert.equal(isOwnedManagedPath(`documents/${ownerId}/guide/${assetId}.pdf`, ownerId), true);
  assert.equal(isOwnedManagedPath(`documents/${ownerId}/guide/${assetId}.docx`, ownerId), true);
  assert.equal(isOwnedManagedPath(`documents/${ownerId}/guide/${assetId}.xlsx`, ownerId), true);
  assert.equal(isOwnedManagedPath(`documents/${ownerId}/guide/${assetId}.pptx`, ownerId), true);
  // Wrong owner → false
  const wrongOwner = '99999999-9999-4999-9999-999999999999';
  assert.equal(isOwnedManagedPath(`documents/${ownerId}/guide/${assetId}.pdf`, wrongOwner), false);
  // Wrong segment → false
  assert.equal(isOwnedManagedPath(`documents/${ownerId}/reports/${assetId}.pdf`, ownerId), false);
  // Non-guide documents still recognized
  assert.equal(isOwnedManagedPath(`documents/${ownerId}/${assetId}.pdf`, ownerId), true);
});

test('isOwnedManagedPath preserves all legacy path patterns', async () => {
  const { isOwnedManagedPath } = await import('../src/domain/managedAssets.ts');
  const ownerId = 'a1b2c3d4-e5f6-4a2b-8c4d-5e6f7a8b9c0d';
  const assetId = 'd0c9b8a7-6f5e-4d3c-9b1a-0f9e8d7c6b5a';
  assert.equal(isOwnedManagedPath(`news/${ownerId}/${assetId}.jpg`, ownerId), true);
  assert.equal(isOwnedManagedPath(`events/${ownerId}/${assetId}.png`, ownerId), true);
  assert.equal(isOwnedManagedPath(`branding/${ownerId}/${assetId}.webp`, ownerId), true);
  assert.equal(isOwnedManagedPath(`${ownerId}/avatar-${assetId}.webp`, ownerId), true);
});

test('managed_assets area allows guide as a valid area value', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/domain/managedAssets.ts', import.meta.url), 'utf8');
  assert.match(src, /ManagedAssetArea.*=.*'guide'/);
});