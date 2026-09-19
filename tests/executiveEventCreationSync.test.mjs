import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = new URL(
  '../supabase/migrations/20260919110000_fix_executive_event_creation_sync.sql',
  import.meta.url,
);

function syncFunction() {
  assert.equal(existsSync(migrationPath), true, 'missing forward event-creation synchronization migration');
  const sql = readFileSync(migrationPath, 'utf8');
  const match = sql.match(/create or replace function public\.sync_published_event_activities\(\)[\s\S]*?\n\$function\$;/i);
  assert.ok(match, 'migration must replace only the event activity synchronization function');
  return { sql, fn: match[0] };
}

test('creating an event synchronizes only the new event instead of replaying older activities', () => {
  const { fn } = syncFunction();

  assert.match(fn, /v_previous_events\s+jsonb\s*:=\s*'\[\]'::jsonb/i);
  assert.match(fn, /if\s+tg_op\s*=\s*'update'\s+then[\s\S]*?old\.content\s*->\s*'events'/i);
  assert.match(fn, /left join lateral[\s\S]*?jsonb_array_elements\(v_previous_events\)/i);
  assert.match(fn, /previous_event\.value\s*->>\s*'id'\s*=\s*next_event\.value\s*->>\s*'id'/i);
  assert.match(fn, /tg_op\s*=\s*'insert'[\s\S]*?previous_event\.value\s+is\s+null[\s\S]*?previous_event\.value\s+is distinct from\s+next_event\.value/i);
  assert.match(fn, /perform public\.upsert_event_activity\(/i);
});

test('the creation sync preserves current activity ownership protections and does not broaden unrelated authority', () => {
  const { sql, fn } = syncFunction();

  assert.doesNotMatch(sql, /create or replace function public\.upsert_event_activity/i);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /grant execute/i);
  assert.doesNotMatch(sql, /alter table|insert into public\.activities|update public\.activities/i);
  assert.match(fn, /security definer/i);
  assert.match(fn, /set search_path = ''/i);
});

test('the new activity remains transactionally linked to the new published event', () => {
  const { fn } = syncFunction();
  const invocation = fn.match(/perform public\.upsert_event_activity\([\s\S]*?\);/i)?.[0] ?? '';

  assert.match(invocation, /v_public_event_id/);
  assert.match(invocation, /left\(v_title, 200\)/);
  assert.match(invocation, /left\(v_description, 8000\)/);
  assert.match(invocation, /v_type[\s\S]*?v_points_value[\s\S]*?v_max_capacity[\s\S]*?v_deadline/);
});
