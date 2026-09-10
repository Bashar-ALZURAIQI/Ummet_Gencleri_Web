import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION_FILE = '20260910130000_allow_executive_event_images.sql';
const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const migrations = readdirSync(fileURLToPath(migrationsUrl)).sort();
const fileName = migrations.find((name) => name.endsWith(MIGRATION_FILE) || name === MIGRATION_FILE);
assert.ok(fileName, 'missing executive event image migration');

const sql = readFileSync(fileURLToPath(new URL(fileName, migrationsUrl)), 'utf8');
const normalized = sql.toLowerCase();

const policyStart = normalized.indexOf('create policy "gallery_authorized_insert"');
assert.ok(policyStart >= 0, 'gallery_authorized_insert policy must be recreated');
const functionStart = normalized.indexOf('create or replace function public.register_managed_asset');
assert.ok(functionStart >= 0, 'register_managed_asset must be redefined');
const policyBlock = normalized.slice(policyStart, functionStart);
const functionBlock = normalized.slice(functionStart);

const NON_PRESIDENT_EXECUTIVES = [
  'vice_president',
  'media_head',
  'finance_head',
  'audit_head',
  'academic_head',
  'activities_head',
];

test('executive event image migration is applied after every existing migration', () => {
  assert.ok(
    migrations.indexOf(fileName) === migrations.length - 1,
    'executive event image migration must be the newest migration',
  );
});

test('gallery INSERT policy derives authorization from auth.uid() and stays owner-bound', () => {
  assert.match(policyBlock, /for insert[\s\S]*to authenticated[\s\S]*with check/);
  assert.match(policyBlock, /owner_id = \(select auth\.uid\(\)\)::text/);
  assert.match(policyBlock, /\(storage\.foldername\(name\)\)\[2\] = \(select auth\.uid\(\)\)::text/);
  assert.ok(
    policyBlock.indexOf('(storage.foldername(name))[2] = (select auth.uid())::text')
      < policyBlock.indexOf("= 'events'"),
    'the owner-bound path check must apply to the events folder branch',
  );
  assert.match(policyBlock, /from private\.current_managed_asset_authorization as authz/);
});

test('gallery INSERT policy allows the events folder for every executive role', () => {
  assert.match(policyBlock, /authz\.position_key = 'president'/);
  assert.match(policyBlock, new RegExp(
    `authz\\.position_key in \\(\\s*'${NON_PRESIDENT_EXECUTIVES.join("',\\s*'")}'\\s*\\)`
      + '[\\s\\S]*\\(storage\\.foldername\\(name\\)\\)\\[1\\] = \'events\'',
  ));
});

test('gallery INSERT policy preserves the narrower per-folder permissions', () => {
  assert.match(policyBlock, /authz\.position_key = 'media_head'[\s\S]*in \('news', 'albums', 'site', 'documents', 'videos'\)/);
  assert.match(policyBlock, /authz\.position_key in \('academic_head', 'activities_head'\)[\s\S]*= 'documents'/);
  assert.match(policyBlock, /authz\.position_key in \('vice_president', 'finance_head', 'audit_head'\)[\s\S]*= 'documents'/);
  assert.doesNotMatch(policyBlock, /is_executive/);
});

test('register_managed_asset stays owner-bound and allows events for every executive role', () => {
  assert.match(functionBlock, /elsif asset_bucket = 'gallery'/);
  assert.match(functionBlock, /split_part\(asset_path, '\/', 2\) <> v_actor_id::text/);
  assert.ok(
    functionBlock.indexOf("split_part(asset_path, '/', 2) <> v_actor_id::text")
      < functionBlock.indexOf("v_folder = 'events'"),
    'the owner-bound path check must run before the events folder authorization',
  );
  assert.match(functionBlock, /v_position = 'president'/);
  assert.match(functionBlock, new RegExp(
    `v_position in \\(\\s*'${NON_PRESIDENT_EXECUTIVES.join("',\\s*'")}'\\s*\\)`
      + '[\\s\\S]*v_folder = \'events\'',
  ));
  assert.match(functionBlock, /v_position = 'media_head'[\s\S]*in \('news', 'albums', 'site', 'documents', 'videos'\)/);
  assert.match(functionBlock, /v_position in \('academic_head', 'activities_head'\)[\s\S]*v_folder = 'documents'/);
  assert.match(functionBlock, /v_position in \('vice_president', 'finance_head', 'audit_head'\)[\s\S]*v_folder = 'documents'/);
});

test('MEDIA_HEAD can upload and register the exact event-image path for their own event', async () => {
  const { buildManagedAssetPath } = await import('../src/domain/managedAssets.ts');
  const ownerId = 'a63a4a43-8ad2-4f6f-8a03-9f2c1d0e5b77';
  const assetId = 'b83b5b54-9be3-4a07-9b14-a03d2e1f6c88';
  const pathResult = buildManagedAssetPath({ usage: 'event-image', ownerId, assetId, mimeType: 'image/png' });
  assert.deepEqual(pathResult, { ok: true, path: `events/${ownerId}/${assetId}.png` });

  assert.match(policyBlock, /'media_head'[\s\S]{0,220}= 'events'/);
  assert.match(policyBlock, /'media_head'[\s\S]*'news', 'albums', 'site', 'documents', 'videos'/);
  assert.match(functionBlock, /'media_head'[\s\S]{0,220}v_folder = 'events'/);
  assert.match(functionBlock, /'media_head'[\s\S]*'news', 'albums', 'site', 'documents', 'videos'/);
  assert.ok(
    policyBlock.indexOf('(storage.foldername(name))[2] = (select auth.uid())::text')
      < policyBlock.indexOf('media_head'),
    "MEDIA_HEAD event uploads must still be bound to the caller's own folder-2 uuid",
  );
});

test('STUDENT is never granted the events folder or any gallery write', () => {
  assert.doesNotMatch(normalized, /student/);
  assert.doesNotMatch(policyBlock, /position_key\s*=?\s*'student'/);
  assert.doesNotMatch(functionBlock, /v_position[\s\S]{0,40}'student'/);
});

test('preserves owner-only cleanup and leaves unrelated storage config untouched', () => {
  assert.doesNotMatch(normalized, /drop policy[\s\S]{0,60}gallery_owner_or_president_delete/);
  assert.doesNotMatch(normalized, /create policy[\s\S]{0,60}gallery_owner_or_president_delete/);
  assert.doesNotMatch(normalized, /insert into storage\.buckets/);
  assert.doesNotMatch(normalized, /alter table public\.managed_assets/);
  assert.doesNotMatch(normalized, /create policy[\s\S]{0,60}avatars_/);
  assert.doesNotMatch(normalized, /create policy[\s\S]{0,60}site_assets_/);
});

test('registers the RPC for authenticated only, never anon or service_role', () => {
  assert.match(normalized, /revoke execute on function public\.register_managed_asset[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(normalized, /grant execute on function public\.register_managed_asset[\s\S]*to authenticated/);
  assert.doesNotMatch(normalized, /grant execute on function public\.register_managed_asset[\s\S]*to (?:anon|service_role)/);
});