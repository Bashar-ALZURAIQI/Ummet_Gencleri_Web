import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const migrationNames = readdirSync(fileURLToPath(migrationsUrl)).sort();

function latestMigrationContaining(marker) {
  const matches = migrationNames.filter((name) => (
    readFileSync(fileURLToPath(new URL(name, migrationsUrl)), 'utf8').includes(marker)
  ));
  assert.ok(matches.length > 0, `missing migration containing ${marker}`);
  return matches.at(-1);
}

function finalManagedAssetAuthorization() {
  const name = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.register_managed_asset');
  const sql = readFileSync(fileURLToPath(new URL(name, migrationsUrl)), 'utf8').toLowerCase();
  const functionStart = sql.indexOf('create or replace function public.register_managed_asset');
  const policyStart = sql.indexOf('create policy "gallery_authorized_insert"');
  assert.ok(policyStart >= 0, `${name} must define the active gallery INSERT policy`);
  assert.ok(functionStart >= 0, `${name} must define the active asset registration RPC`);
  return {
    name,
    policy: sql.slice(policyStart, functionStart),
    registration: sql.slice(functionStart),
  };
}

const EXECUTIVE_ROLES = [
  'president',
  'vice_president',
  'media_head',
  'finance_head',
  'audit_head',
  'academic_head',
  'activities_head',
];

test('the final storage policy and registration RPC authorize every executive to upload an owner-bound event image', () => {
  const authorization = finalManagedAssetAuthorization();

  assert.match(authorization.policy, /to authenticated/);
  assert.match(authorization.policy, /owner_id = \(select auth\.uid\(\)\)::text/);
  assert.match(authorization.policy, /\(storage\.foldername\(name\)\)\[2\] = \(select auth\.uid\(\)\)::text/);
  assert.match(authorization.registration, /split_part\(asset_path, '\/', 2\) <> v_actor_id::text/);

  for (const role of EXECUTIVE_ROLES) {
    const rolePattern = new RegExp(`'${role}'[\\s\\S]{0,900}?(?:=|in \\()[\\s\\S]{0,900}?'events'`);
    assert.match(authorization.policy, rolePattern, `${role} must pass Storage INSERT for events/<auth.uid()>/...`);
    assert.match(authorization.registration, rolePattern, `${role} must register its own event image`);
  }

  assert.doesNotMatch(authorization.policy, /'student'/);
  assert.doesNotMatch(authorization.registration, /'student'/);
});

test('a registered event image becomes the same public URL used by the event form validation state', async () => {
  const field = await import('../src/domain/managedFileFieldState.ts');
  const selected = field.selectManagedFile(
    field.initialManagedFileFieldState(),
    { name: 'event.webp', type: 'image/webp', size: 1024 },
    'blob:event',
  ).state;
  const uploaded = field.confirmManagedFileUpload(selected, 'https://storage.example/events/owner/event.webp').state;

  assert.equal(uploaded.currentUrl, 'https://storage.example/events/owner/event.webp');
  assert.equal(uploaded.phase, 'uploaded');
  assert.notEqual(uploaded.currentUrl, '');
});

test('a failed event image upload retains the real error and never produces a saveable image URL', async () => {
  const field = await import('../src/domain/managedFileFieldState.ts');
  const selected = field.selectManagedFile(
    field.initialManagedFileFieldState(),
    { name: 'event.webp', type: 'image/webp', size: 1024 },
    'blob:event',
  ).state;
  const failed = field.failManagedFileUpload(field.beginManagedFileUpload(selected), 'The gallery folder is not authorized');

  assert.equal(failed.currentUrl, '');
  assert.equal(failed.phase, 'error');
  assert.equal(failed.error, 'The gallery folder is not authorized');
});
