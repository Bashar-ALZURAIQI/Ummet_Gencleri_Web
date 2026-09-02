import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260826044712_application_email_notifications.sql', import.meta.url);

test('enqueues all authoritative application transitions from an after trigger', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /AFTER INSERT OR UPDATE ON public\.student_applications/i);
  assert.match(sql, /TG_OP = 'INSERT'[\s\S]+NEW\.status = 'pending'[\s\S]+NEW_APPLICATION/i);
  assert.match(sql, /NEW\.status = 'interview'[\s\S]+INTERVIEW_SCHEDULED/i);
  assert.match(sql, /NEW\.status = 'accepted'[\s\S]+ACCEPTED/i);
  assert.match(sql, /NEW\.status = 'rejected'[\s\S]+REJECTED/i);
});

test('deduplicates identical events and fingerprints changed interview and rejection details', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /extensions\.digest/i);
  assert.match(sql, /NEW\.interview_date IS DISTINCT FROM OLD\.interview_date/i);
  assert.match(sql, /NEW\.interview_time IS DISTINCT FROM OLD\.interview_time/i);
  assert.match(sql, /NEW\.interview_meeting_url IS DISTINCT FROM OLD\.interview_meeting_url/i);
  assert.match(sql, /NEW\.rejection_reason/i);
  assert.match(sql, /ON CONFLICT \(application_id, event_type, fingerprint\) DO NOTHING/i);
});

test('stores only server-owned immutable email snapshot fields', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const key of ['studentName', 'studentEmail', 'interviewDate', 'interviewTime', 'interviewLink', 'rejectionReason']) {
    assert.match(sql, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(sql, /recipient_email|client_payload|request\.headers/i);
});

test('rejects non-HTTPS interview links before an application update is committed', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /FUNCTION private\.validate_student_application_interview_link\(\)/i);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF interview_meeting_url ON public\.student_applications/i);
  assert.match(sql, /interview_meeting_url\) !~\* '\^https:/i);
  assert.match(sql, /ERRCODE = '22023'/i);
});
