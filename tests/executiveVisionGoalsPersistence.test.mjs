import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const migrationsDir = new URL('../supabase/migrations/', import.meta.url);

function migrationNamed(pattern) {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith(pattern));
  assert.equal(names.length, 1, `expected exactly one migration ${pattern}`);
  return readFileSync(new URL(names[0], migrationsDir), 'utf8');
}

const visionGoalsSql = migrationNamed('_executive_own_committee_vision_goals.sql');
const sourceHashSql = migrationNamed('_fix_own_committee_localization_source_hash.sql');
const allMigrationSql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(new URL(name, migrationsDir), 'utf8'))
  .join('\n');

const { createSectionContentRepository } = await import(
  '../src/domain/sectionContentRepository.ts'
);

const validPublication = {
  target: 'committees',
  payload: [
    { id: 'academic', vision: 'رؤية تجريبية', goals: 'هدف تجريبي' },
  ],
  version: 9,
  updated_at: '2026-09-15T12:00:00Z',
};

function createClient({ response }) {
  const calls = [];
  return {
    calls,
    client: {
      from() {
        throw new Error('publish_own_committee_fields must not hit from()');
      },
      rpc(name, args) {
        calls.push([name, args]);
        return Promise.resolve(response);
      },
    },
  };
}

/* ------------------------- Migration: publish_own_committee_fields ------------------------- */

test('vision/goals migration is unique and declares the narrow fields RPC', () => {
  assert.match(visionGoalsSql, /create or replace function public\.publish_own_committee_fields\s*\(\s*p_committee_id text,\s*p_fields jsonb,\s*p_expected_version bigint\s*\)/i);
  assert.match(visionGoalsSql, /security definer/i);
  assert.match(visionGoalsSql, /set search_path = ''/i);
  assert.match(visionGoalsSql, /revoke execute on function public\.publish_own_committee_fields[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(visionGoalsSql, /grant execute on function public\.publish_own_committee_fields[\s\S]*to authenticated/i);
});

test('vision/goals RPC authenticates through auth.uid() and the executive assignment', () => {
  const rpc = visionGoalsSql.match(/create or replace function public\.publish_own_committee_fields[\s\S]*?\n\$function\$;/i)?.[0] ?? '';
  assert.match(rpc, /v_actor_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(rpc, /from public\.executive_assignments\s+where user_id = v_actor_id/i);
  assert.match(rpc, /only a current executive may manage own committee content/i);
  assert.match(rpc, /42501/i);
});

test('vision/goals RPC keeps president override and own-committee binding', () => {
  const rpc = visionGoalsSql.match(/create or replace function public\.publish_own_committee_fields[\s\S]*?\n\$function\$;/i)?.[0] ?? '';
  assert.match(rpc, /v_assignment\.position_key\s*<>\s*'PRESIDENT'/i);
  assert.match(rpc, /v_assignment\.committee_key\s+is distinct from\s+p_committee_id/i);
  assert.match(rpc, /OWN_COMMITTEE_FORBIDDEN/i);
  assert.match(rpc, /p_committee_id\s+not in\s*\(/i);
  assert.match(rpc, /'supervisory'/i);
  assert.match(rpc, /OWN_COMMITTEE_UNKNOWN_COMMITTEE/i);
});

test('vision/goals RPC accepts only the vision/goals string keys with bounded length', () => {
  const rpc = visionGoalsSql.match(/create or replace function public\.publish_own_committee_fields[\s\S]*?\n\$function\$;/i)?.[0] ?? '';
  assert.match(rpc, /key_name\s+not in\s*\(\s*'vision',\s*'goals'\s*\)/i);
  assert.match(rpc, /char_length\(btrim\(p_fields\s*->>\s*'vision'\)\)\s+not between 1 and 5000/i);
  assert.match(rpc, /char_length\(btrim\(p_fields\s*->>\s*'goals'\)\)\s+not between 1 and 5000/i);
  assert.match(rpc, /OWN_COMMITTEE_INVALID_FIELDS/i);
});

test('vision/goals RPC merges only the submitted keys, preserves sibling ordering, and re-checks authority', () => {
  const rpc = visionGoalsSql.match(/create or replace function public\.publish_own_committee_fields[\s\S]*?\n\$function\$;/i)?.[0] ?? '';
  assert.match(rpc, /v_next_committee\s*:=\s*v_committee\s*\|\|\s*v_fields\s*;/i);
  assert.match(rpc, /OWN_COMMITTEE_NO_CHANGES/i);
  assert.match(rpc, /jsonb_agg\s*\(\s*case\s+when c\.item\s*->>\s*'id'\s*=\s*p_committee_id/i);
  assert.match(rpc, /order by c\.position/i);
  assert.match(rpc, /private\.publish_cms_target_locked\s*\(\s*v_actor_id,\s*'committees'/i);
  assert.match(rpc, /private\.executive_can_manage_committee\(\s*\(select auth\.uid\(\)\),\s*p_committee_id\s*\)/i);
  assert.match(rpc, /OWN_COMMITTEE_AUTHORITY_CHANGED/i);
  assert.match(rpc, /when serialization_failure\s+then[\s\S]*?40001[\s\S]*?CONTENT_VERSION_CONFLICT/i);
});

test('vision/goals RPC never writes broad tables or other site targets', () => {
  assert.doesNotMatch(visionGoalsSql, /insert into public\.cms_localizations/i);
  assert.doesNotMatch(visionGoalsSql, /update public\.cms_localizations/i);
  assert.doesNotMatch(visionGoalsSql, /insert into public\.edit_requests/i);
  assert.doesNotMatch(visionGoalsSql, /publish_cms_target\s*\(\s*p_target/i);
});

/* ------------------------- Migration: 15140000 source hash ------------------------- */

test('source-hash migration adds p_source_hash to both committee localization RPCs', () => {
  assert.match(sourceHashSql, /create or replace function public\.publish_own_committee_localization\(\s*p_committee_id text,\s*p_locale text,\s*p_localized_committees jsonb,\s*p_source_hash text\s*\)/i);
  assert.match(sourceHashSql, /create or replace function public\.save_own_committee_draft_localization\(\s*p_committee_id text,\s*p_locale text,\s*p_localized_committees jsonb,\s*p_source_hash text\s*\)/i);
});

test('source-hash migration persists the hash on both INSERT and UPDATE in both partitions', () => {
  const published = sourceHashSql.match(/-- =+[\s\S]*?-- 2\. Draft/i)?.[0] ?? '';
  const draft = sourceHashSql.match(/-- 2\. Draft[\s\S]*?-- 3\. Grant\/revoke/i)?.[0] ?? sourceHashSql;
  assert.ok((sourceHashSql.match(/source_hash\s*=\s*v_source_hash/gi) ?? []).length >= 2, 'source_hash persisted on UPDATE in both partitions');
  assert.ok((sourceHashSql.match(/v_source_hash, now\(\), v_actor_id::text/gi) ?? []).length >= 2, 'source_hash persisted on INSERT in both partitions');
  assert.ok(published.length > 0);
  assert.ok(draft.length > 0);
});

test('source-hash migration replaces only the 4-argument grant surface', () => {
  assert.match(sourceHashSql, /revoke execute on function public\.publish_own_committee_localization\(\s*text,\s*text,\s*jsonb,\s*text\s*\)\s*from public, anon, authenticated, service_role/i);
  assert.match(sourceHashSql, /grant execute on function public\.publish_own_committee_localization\(\s*text,\s*text,\s*jsonb,\s*text\s*\)\s*to authenticated/i);
  assert.match(sourceHashSql, /revoke execute on function public\.save_own_committee_draft_localization\(\s*text,\s*text,\s*jsonb,\s*text\s*\)/i);
  assert.match(sourceHashSql, /grant execute on function public\.save_own_committee_draft_localization\(\s*text,\s*text,\s*jsonb,\s*text\s*\)\s*to authenticated/i);
});

/* ------------------------- Client repository ------------------------- */

test('publishOwnCommitteeFields publishes vision/goals through the narrow RPC', async () => {
  const { calls, client } = createClient({ response: { data: validPublication, error: null } });
  const repo = createSectionContentRepository(client);

  const result = await repo.publishOwnCommitteeFields('academic', { vision: 'رؤية تجريبية', goals: 'هدف تجريبي' }, 9);

  assert.deepEqual(calls[0][0], 'publish_own_committee_fields');
  assert.deepEqual(calls[0][1], {
    p_committee_id: 'academic',
    p_fields: { vision: 'رؤية تجريبية', goals: 'هدف تجريبي' },
    p_expected_version: 9,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.target, 'committees');
    assert.equal(result.data.version, 9);
  }
});

test('publishOwnCommitteeFields accepts a partial set of fields', async () => {
  const { calls, client } = createClient({ response: { data: validPublication, error: null } });
  const repo = createSectionContentRepository(client);

  const result = await repo.publishOwnCommitteeFields('academic', { goals: 'هدف تجريبي' }, 9);

  assert.deepEqual(calls[0][1].p_fields, { goals: 'هدف تجريبي' });
  assert.equal(result.ok, true);
});

test('publishOwnCommitteeFields maps version conflicts to CONTENT_VERSION_CONFLICT', async () => {
  const { client } = createClient({
    response: { data: null, error: { code: '40001', message: 'CONTENT_VERSION_CONFLICT' } },
  });
  const repo = createSectionContentRepository(client);

  const result = await repo.publishOwnCommitteeFields('academic', { vision: 'x' }, 9);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'CONTENT_VERSION_CONFLICT');
  }
});

test('publishOwnCommitteeFields maps other-committee denial to OWN_COMMITTEE_FORBIDDEN', async () => {
  const { client } = createClient({
    response: { data: null, error: { code: '42501', message: 'OWN_COMMITTEE_FORBIDDEN' } },
  });
  const repo = createSectionContentRepository(client);

  const result = await repo.publishOwnCommitteeFields('academic', { vision: 'x' }, 9);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'OWN_COMMITTEE_FORBIDDEN');
  }
});

test('publishOwnCommitteeFields preserves unrelated 42501 diagnostics instead of claiming cross-committee denial', async () => {
  const rawError = {
    code: '42501',
    message: 'Not authorized to update existing activities',
    details: 'activity belongs to another executive',
    hint: 'Only synchronize activities when events change',
  };
  const { client } = createClient({ response: { data: null, error: rawError } });
  const repo = createSectionContentRepository(client);

  const result = await repo.publishOwnCommitteeFields('vice-presidency', { vision: 'x' }, 9);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, '42501');
    assert.equal(result.error.message, rawError.message);
    assert.equal(result.error.details, rawError.details);
    assert.equal(result.error.hint, rawError.hint);
  }
});

test('published-site activity synchronization skips updates whose events payload is unchanged', () => {
  assert.match(
    allMigrationSql,
    /create trigger sync_published_event_activities_update_trigger[\s\S]*?after update of content[\s\S]*?when\s*\([\s\S]*?old\.content\s*->\s*'events'\s+is distinct from\s+new\.content\s*->\s*'events'[\s\S]*?\)[\s\S]*?execute function public\.sync_published_event_activities\(\)/i,
  );
  assert.doesNotMatch(
    allMigrationSql.slice(allMigrationSql.lastIndexOf('DROP TRIGGER IF EXISTS sync_published_event_activities_trigger')),
    /old\.content\s*->\s*'events'\s+is not distinct from\s+new\.content\s*->\s*'events'/i,
  );
});
