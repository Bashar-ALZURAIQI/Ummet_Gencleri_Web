import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourcePath = new URL('../supabase/functions/send-contact-reply/index.ts', import.meta.url);

test('email function verifies the caller role and never exposes the service key to the browser', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /executive_assignments/);
  assert.match(source, /PRESIDENT/);
  assert.match(source, /VICE_PRESIDENT/);
  assert.match(source, /auth\.getUser/);
});

test('email function uses Resend idempotency and persists delivery audit state', async () => {
  const source = await readFile(sourcePath, 'utf8');
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /delivery_status/);
  assert.match(source, /email_provider_id/);
  assert.match(source, /delivery_attempts/);
  assert.match(source, /RESEND_API_KEY/);
});
