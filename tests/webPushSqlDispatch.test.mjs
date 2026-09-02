import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260826222911_secure_accepted_student_push_dispatch.sql',
  import.meta.url,
);

test('dispatches queued Web Push rows through pg_net with Vault-owned configuration', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create extension if not exists pg_net/i);
  assert.match(sql, /from vault\.decrypted_secrets/i);
  assert.match(sql, /create or replace function private\.dispatch_accepted_student_web_push\(\)/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /after insert on public\.push_notifications/i);
  assert.match(sql, /revoke execute on function private\.dispatch_accepted_student_web_push\(\)/i);
  assert.doesNotMatch(sql, /VAPID_PRIVATE_KEY|PUSH_WEBHOOK_SECRET|x-push-webhook-secret['"]\s*:\s*['"][A-Za-z0-9_-]{20,}/);
});
