import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260829120000_phase_three_security_closure.sql',
  import.meta.url,
);

test('closes every legacy RPC that can bypass the phase-three role matrix', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const normalized = sql
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');

  for (const signature of [
    'record_points_transaction\\(uuid, integer, text, text\\)',
    'review_activity_enrollment\\(uuid, uuid, public\\.excuse_review_status, public\\.attendance_status\\)',
    'review_task_enrollment\\(uuid, uuid, public\\.task_completion_status\\)',
    'set_member_tier\\(uuid, text\\)',
  ]) {
    assert.match(
      normalized,
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${signature} FROM PUBLIC, anon, authenticated, service_role`, 'i'),
    );
  }

  assert.doesNotMatch(normalized, /GRANT EXECUTE ON FUNCTION public\.(?:record_points_transaction|review_activity_enrollment|review_task_enrollment|set_member_tier)/i);
});

test('serializes evaluation drafts against finalization by locking the parent row first', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const normalized = sql.replace(/\s+/g, ' ');

  assert.match(
    normalized,
    /FUNCTION public\.save_activity_attendance\([\s\S]*?FROM public\.activities[\s\S]*?FOR UPDATE;[\s\S]*?IF v_closed_at IS NOT NULL[\s\S]*?UPDATE public\.activity_enrollments/i,
  );
  assert.match(
    normalized,
    /FUNCTION public\.save_task_completion\([\s\S]*?FROM public\.tasks[\s\S]*?FOR UPDATE;[\s\S]*?IF v_closed_at IS NOT NULL[\s\S]*?UPDATE public\.task_enrollments/i,
  );
});
