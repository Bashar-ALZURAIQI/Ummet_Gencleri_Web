import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);

test('backend persistence migration projects rich stored members before strict validation', () => {
  const migrationNames = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('_fix_executive_board_backend_persistence.sql'));

  assert.equal(migrationNames.length, 1, 'expected one corrective backend persistence migration');
  const sql = readFileSync(new URL(migrationNames[0], migrationsDir), 'utf8');
  const snapshotFunction = sql.match(
    /create or replace function private\.executive_profile_snapshot_from_committee[\s\S]*?\$function\$;/i,
  )?.[0];

  assert.ok(snapshotFunction, 'expected the migration to replace the committee snapshot function');
  assert.match(snapshotFunction, /jsonb_agg[\s\S]*jsonb_build_object/i);
  for (const key of ['id', 'name', 'position', 'photo']) {
    assert.match(snapshotFunction, new RegExp(`'${key}'\\s*,\\s*(?:member_item|member_row)`,'i'));
  }
  assert.doesNotMatch(snapshotFunction, /'phone'|'university'|'major'|'year'/i);
  assert.match(sql, /revoke execute on function private\.executive_profile_snapshot_from_committee\(jsonb\)/i);
});
