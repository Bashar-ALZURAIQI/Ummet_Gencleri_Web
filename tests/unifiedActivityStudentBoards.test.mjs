import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../supabase/migrations/20260828120000_unified_activity_student_boards.sql',
  import.meta.url,
);

const sql = await readFile(migrationUrl, 'utf8');

test('links published CMS events to internal activities without replacing public media data', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS public_event_id text/i);
  assert.match(sql, /CREATE UNIQUE INDEX[\s\S]+public_event_id/i);
  assert.match(sql, /published_site_content[\s\S]+jsonb_array_elements[\s\S]+ON CONFLICT \(public_event_id\) DO NOTHING/i);
});

test('student board RPCs validate accepted active membership and expose only aggregate own-state projections', () => {
  for (const functionName of ['list_student_activity_board', 'list_student_task_board']) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}`, 'i'));
  }
  assert.match(sql, /profile\.status = 'active'[\s\S]+application\.status = 'accepted'/i);
  assert.match(sql, /SELECT count\(\*\)::integer AS joining_count/i);
  assert.match(sql, /own_enrollment\.decision/i);
  assert.match(sql, /own_enrollment\.excuse_text/i);
  assert.doesNotMatch(sql, /student_name|student_email/i);
});

test('manager creation RPCs derive ownership and are restricted to approved economy roles', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.upsert_event_activity/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_internal_task/i);
  assert.match(sql, /assignment\.position_key IN \('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD'\)/i);
  assert.match(sql, /created_by[\s\S]+v_user_id/i);
});

test('capacity updates serialize with enrollments and CMS publication syncs event settings atomically', () => {
  assert.match(sql, /pg_advisory_xact_lock[\s\S]+FOR UPDATE[\s\S]+v_joining_count/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sync_published_event_activities/i);
  assert.match(sql, /AFTER INSERT OR UPDATE OF content ON public\.published_site_content/i);
  assert.match(sql, /PERFORM public\.upsert_event_activity/i);
});

test('server enforces mandatory excuses, paid balance, and clears stale excuses when joining', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.set_own_activity_enrollment/i);
  assert.match(sql, /v_activity_type = 'MANDATORY'::public\.activity_type[\s\S]+v_clean_excuse IS NULL/i);
  assert.match(sql, /COALESCE\(v_total_points, 0\) < v_points_value/i);
  assert.match(sql, /IF p_decision = 'JOINING'[\s\S]+v_clean_excuse := NULL/i);
});

test('all new security definer RPCs pin search path and revoke public execution', () => {
  const securityDefinerCount = (sql.match(/SECURITY DEFINER/gi) ?? []).length;
  const pinnedSearchPathCount = (sql.match(/SET search_path = ''/gi) ?? []).length;
  assert.equal(securityDefinerCount, 6);
  assert.equal(pinnedSearchPathCount, 6);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.list_student_activity_board\(\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.list_student_activity_board\(\) TO authenticated/i);
  assert.doesNotMatch(sql, /TO anon/i);
});
