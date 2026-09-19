import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = new URL(
  '../supabase/migrations/20260919080000_harden_committee_localization_patch_boundary.sql',
  import.meta.url,
);

function migration() {
  assert.equal(
    existsSync(migrationPath),
    true,
    'the forward PATCH-boundary migration must exist',
  );
  return readFileSync(migrationPath, 'utf8');
}

test('committee localization migration applies submitted leaves to the existing localized target', () => {
  const sql = migration();
  assert.match(sql, /apply_committee_localization_patch/i);
  assert.match(sql, /v_existing_committee/i);
  assert.match(sql, /v_merged\s*:=\s*private\.apply_committee_localization_patch/i);
  assert.doesNotMatch(sql, /v_merged\s*:=\s*v_canonical_committee\s*\|\|\s*v_sanitized/i);
});

test('committee localization migration retires authenticated access to both legacy three-argument RPC overloads', () => {
  const sql = migration();
  assert.match(
    sql,
    /revoke all on function public\.publish_own_committee_localization\(text, text, jsonb\)\s+from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.save_own_committee_draft_localization\(text, text, jsonb\)\s+from public, anon, authenticated, service_role/i,
  );
});
