import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = (await readFile(new URL('../supabase/migrations/20260824043858_add_member_soft_removal.sql', import.meta.url), 'utf8'))
  .toLowerCase()
  .replace(/\s+/g, ' ');

test('soft removal is a president-only atomic RPC that revokes assignments and preserves related rows', () => {
  assert.match(sql, /create or replace function public\.remove_member_membership\(target_user_id uuid\)/);
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /private\.is_current_president\(\)/);
  assert.match(sql, /target_user_id = v_actor_id/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /delete from public\.executive_assignments where user_id = target_user_id/);
  assert.match(sql, /update public\.profiles set status = 'removed'/);
  assert.match(sql, /v_target_status not in \('active', 'removed'\)/);
  assert.doesNotMatch(sql, /v_target_status not in \([^)]*'banned'/);
  assert.doesNotMatch(sql, /delete from public\.(profiles|student_applications)/);
  assert.match(sql, /revoke execute on function public\.remove_member_membership\(uuid\) from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.remove_member_membership\(uuid\) to authenticated/);
});

test('only active owners can update their own profile after the removal migration', () => {
  assert.match(sql, /drop policy if exists "profiles_update_own" on public\.profiles/);
  assert.match(sql, /create policy "profiles_update_own" on public\.profiles for update to authenticated/);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = id and status = 'active'\)/);
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = id and status = 'active'\)/);
});
