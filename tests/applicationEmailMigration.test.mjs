import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260826044712_application_email_notifications.sql', import.meta.url);

test('creates a constrained and indexed application notification outbox', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /CREATE TABLE[^;]+public\.application_email_notifications/is);
  for (const event of ['NEW_APPLICATION', 'INTERVIEW_SCHEDULED', 'ACCEPTED', 'REJECTED']) {
    assert.match(sql, new RegExp(`'${event}'`));
  }
  for (const status of ['PENDING', 'SENDING', 'SENT', 'FAILED']) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
  assert.match(sql, /UNIQUE\s*\(application_id,\s*event_type,\s*fingerprint\)/i);
  assert.match(sql, /\(delivery_status,\s*created_at\)/i);
  assert.match(sql, /\(application_id,\s*created_at\s+DESC\)/i);
});

test('locks outbox mutations to the service role and exposes select only through president RLS', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.application_email_notifications\s+FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT SELECT ON TABLE public\.application_email_notifications TO authenticated/i);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.application_email_notifications TO service_role/i);
  assert.match(sql, /CREATE POLICY "application_email_notifications_president_select"[\s\S]+TO authenticated[\s\S]+is_president/i);
  assert.doesNotMatch(sql, /FOR (INSERT|UPDATE|DELETE)\s+TO (anon|authenticated)/i);
});

test('hardens privileged trigger functions with an empty search path and no public execute', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /FUNCTION private\.enqueue_application_email_notification\(\)[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = ''/i);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION private\.enqueue_application_email_notification\(\)\s+FROM PUBLIC, anon, authenticated, service_role/i);
});
