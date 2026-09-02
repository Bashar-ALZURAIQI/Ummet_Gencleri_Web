import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260826193000_create_guide_suggestions.sql', import.meta.url);

test('guide suggestions migration creates the isolated durable schema and four-state workflow', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.guide_suggestions/i);
  assert.match(sql, /student_name\s+text\s+NOT NULL/i);
  assert.match(sql, /subject\s+text\s+NOT NULL/i);
  assert.match(sql, /description\s+text\s+NOT NULL/i);
  assert.match(sql, /status\s+text\s+NOT NULL\s+DEFAULT\s+'PENDING'/i);
  for (const status of ['PENDING', 'REVIEWING', 'IMPLEMENTED', 'REJECTED']) assert.match(sql, new RegExp(`'${status}'`));
  assert.match(sql, /created_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/i);
  assert.match(sql, /char_length\(btrim\(student_name\)\)\s+BETWEEN\s+1\s+AND\s+120/i);
  assert.match(sql, /char_length\(btrim\(subject\)\)\s+BETWEEN\s+1\s+AND\s+200/i);
  assert.match(sql, /char_length\(btrim\(description\)\)\s+BETWEEN\s+1\s+AND\s+4000/i);
  assert.match(sql, /guide_suggestions_status_created_idx[\s\S]*\(status, created_at DESC\)/i);
});

test('guide suggestions migration grants public insertion without public reads or status control', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.guide_suggestions FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT INSERT \(student_name, subject, description\)[\s\S]*TO anon, authenticated/i);
  assert.doesNotMatch(sql, /GRANT\s+SELECT[\s\S]{0,80}\bTO\s+anon\b/i);
  assert.doesNotMatch(sql, /GRANT\s+UPDATE[\s\S]{0,80}\bTO\s+anon\b/i);
  assert.match(sql, /FOR INSERT TO anon, authenticated[\s\S]*WITH CHECK \(status = 'PENDING'\)/i);
});

test('guide suggestions migration authorizes management from current server-backed assignments only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /GRANT SELECT ON TABLE public\.guide_suggestions TO authenticated/i);
  assert.match(sql, /GRANT UPDATE \(status\) ON TABLE public\.guide_suggestions TO authenticated/i);
  assert.match(sql, /GRANT DELETE ON TABLE public\.guide_suggestions TO authenticated/i);
  for (const operation of ['SELECT', 'UPDATE', 'DELETE']) {
    assert.match(sql, new RegExp(`ON public\\.guide_suggestions FOR ${operation} TO authenticated`, 'i'));
  }
  assert.match(sql, /CREATE OR REPLACE VIEW private\.current_guide_suggestion_authorization/i);
  assert.match(sql, /FROM private\.current_guide_suggestion_authorization AS authz/i);
  assert.match(sql, /authz\.position_key IN \('PRESIDENT', 'ACADEMIC_HEAD'\)/i);
  assert.doesNotMatch(sql, /user_metadata|raw_user_meta_data|email\s*=/i);
});
