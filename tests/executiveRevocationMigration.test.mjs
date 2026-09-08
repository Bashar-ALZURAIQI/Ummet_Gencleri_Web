import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = (await readFile(new URL('../supabase/migrations/20260904193000_revoke_executive_assignment.sql', import.meta.url), 'utf8'))
  .toLowerCase()
  .replace(/\s+/g, ' ');

test('revoke_executive_assignment is a president-only atomic RPC that deletes only executive assignment', () => {
  assert.match(sql, /create or replace function public\.revoke_executive_assignment\s*\(\s*target_user_id uuid\s*\)/);
  assert.match(sql, /returns table\s*\(\s*revoked_position text\s*,\s*revoked_user_id uuid\s*,\s*revoked_by uuid\s*,\s*revoked_at timestamptz\s*\)/);
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /private\.is_current_president\(\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('executive_assignments\.transfer',\s*0\)\)/);
  assert.match(sql, /target_user_id = v_actor_id/);
  assert.match(sql, /from public\.executive_assignments as ea where ea\.user_id = target_user_id for update/);
  assert.match(sql, /errcode = 'p0002'/);
  assert.match(sql, /delete from public\.executive_assignments where user_id = target_user_id/);
  assert.doesNotMatch(sql, /delete from public\.(profiles|student_applications|event_registrations)/);
  assert.doesNotMatch(sql, /update public\.profiles/);
  assert.match(sql, /revoke execute on function public\.revoke_executive_assignment\(uuid\) from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.revoke_executive_assignment\(uuid\) to authenticated/);
});
