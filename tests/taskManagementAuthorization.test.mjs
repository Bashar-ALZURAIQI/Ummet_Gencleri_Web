import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260830220000_task_management_authorization.sql',
  import.meta.url,
);

const sql = await readFile(migrationUrl, 'utf8').catch(() => '');
const normalized = sql.replace(/\s+/g, ' ');

test('limits excuse review RPCs to president and vice president', () => {
  assert.match(normalized, /list_pending_mandatory_excuses[\s\S]*?ARRAY\['PRESIDENT',\s*'VICE_PRESIDENT'\]/i);
  assert.match(normalized, /review_activity_excuse[\s\S]*?ARRAY\['PRESIDENT',\s*'VICE_PRESIDENT'\]/i);
  assert.doesNotMatch(normalized, /(?:list_pending_mandatory_excuses|review_activity_excuse)[\s\S]*?ARRAY\[[^\]]*ACADEMIC_HEAD[^\]]*\]/i);
});

test('scopes task management to all current executives and creator ownership outside presidency', () => {
  assert.match(normalized, /CREATE OR REPLACE FUNCTION public\.list_managed_tasks\(\)/i);
  assert.match(normalized, /CREATE OR REPLACE FUNCTION public\.list_managed_task_enrollments\(p_task_id uuid\)/i);
  assert.match(normalized, /position_key = 'PRESIDENT'[\s\S]*?created_by = v_actor/i);
  assert.match(normalized, /status IN \('OPEN',\s*'FULL'\)/i);
  assert.match(normalized, /FOR UPDATE[\s\S]*?task-result:/i);
  assert.match(normalized, /ON CONFLICT\s*\(source_key\)\s*DO NOTHING/i);
});

test('removes authenticated access to the old unscoped task evaluation listing', () => {
  assert.match(normalized, /REVOKE EXECUTE ON FUNCTION public\.list_task_evaluations\(\)[\s\S]*?authenticated/i);
  assert.doesNotMatch(normalized, /GRANT EXECUTE ON FUNCTION public\.list_task_evaluations\(\) TO authenticated/i);
});
