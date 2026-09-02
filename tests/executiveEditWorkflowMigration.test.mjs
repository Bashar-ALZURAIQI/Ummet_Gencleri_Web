import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const migrationNames = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('_executive_profile_edit_workflow.sql'));

test('the executive profile migration is unique and creates the structured atomic workflow', () => {
  assert.equal(migrationNames.length, 1);
  const sql = readFileSync(new URL(migrationNames[0], migrationsDir), 'utf8');

  assert.match(sql, /add column if not exists profile_base_snapshot jsonb/i);
  assert.match(sql, /add column if not exists profile_proposed_snapshot jsonb/i);
  assert.match(sql, /add column if not exists profile_payload_version integer/i);
  assert.match(sql, /create index if not exists edit_requests_pending_profile_owner_idx/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /create or replace function public\.submit_profile_edit_request/i);
  assert.match(sql, /create or replace function public\.approve_profile_edit_request/i);
  assert.match(sql, /private\.publish_cms_target_locked/i);
  assert.match(sql, /create or replace function public\.reject_profile_edit_request/i);
  assert.match(sql, /PROFILE_EDIT_ALREADY_PENDING/i);
  assert.match(sql, /PROFILE_EDIT_REQUIRES_STRUCTURED_RPC/i);
  assert.match(sql, /revoke execute[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /user_metadata|raw_user_meta_data/i);
});

test('the generic request RPC cannot insert profile requests', () => {
  const sql = readFileSync(new URL(migrationNames[0], migrationsDir), 'utf8');
  const genericFunction = sql.match(
    /create or replace function public\.submit_edit_request[\s\S]*?\$function\$;/i,
  )?.[0];
  assert.ok(genericFunction);

  assert.match(genericFunction, /btrim\(coalesce\(p_edit_type,\s*''\)\)\s*=\s*'profile'/i);
  assert.match(genericFunction, /PROFILE_EDIT_REQUIRES_STRUCTURED_RPC/i);
});
