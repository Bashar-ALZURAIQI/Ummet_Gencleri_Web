import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const rootUrl = new URL('../', import.meta.url);

test('activity and task creation controls use the shared all-executive predicate', async () => {
  const programs = await readFile(new URL('src/pages/ProgramsPage.tsx', rootUrl), 'utf8');
  const dashboard = await readFile(new URL('src/pages/AdminDashboard.tsx', rootUrl), 'utf8');

  assert.match(programs, /canCreateExecutiveContent\(currentUser\?\.role\)/);
  assert.match(dashboard, /canCreateExecutiveContent\(currentUser\?\.role\)/);
  assert.doesNotMatch(dashboard, /currentUser\?\.role === 'PRESIDENT' \|\| currentUser\?\.role === 'ACADEMIC_HEAD' \|\| currentUser\?\.role === 'AUDIT_HEAD'/);
});

test('latest migration grants insert and creation RPCs to every current executive only', async () => {
  const migrationsUrl = new URL('supabase/migrations/', rootUrl);
  const files = await readdir(migrationsUrl);
  const migrationName = files.find((name) => name.endsWith('_all_executives_create_activities_tasks.sql'));
  assert.ok(migrationName, 'missing all-executive creation authorization migration');
  const sql = await readFile(new URL(migrationName, migrationsUrl), 'utf8');

  assert.match(sql, /CREATE POLICY "activities_executive_insert"[\s\S]+authz\.is_executive/i);
  assert.match(sql, /CREATE POLICY "tasks_executive_insert"[\s\S]+authz\.is_executive/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.upsert_event_activity[\s\S]+private\.is_current_executive\(\)/i);
  assert.match(sql, /v_existing_activity_id IS NOT NULL[\s\S]+v_position NOT IN \('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD'\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_internal_task[\s\S]+private\.is_current_executive\(\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_published_event[\s\S]+private\.is_current_executive\(\)/i);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.list_pending_mandatory_excuses/i);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.list_managed_tasks/i);
});
