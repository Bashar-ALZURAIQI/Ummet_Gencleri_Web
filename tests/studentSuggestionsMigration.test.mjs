import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260904140000_create_student_suggestions.sql',
  import.meta.url,
);

test('student suggestions migration creates student_suggestions and suggestion_responses tables with constraints', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  // 1. student_suggestions table exists
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.student_suggestions/i);

  // 2. suggestion_responses table exists
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.suggestion_responses/i);

  // 3. student_user_id references profiles(id)
  assert.match(
    sql,
    /student_user_id\s+uuid\s+NOT NULL\s+REFERENCES public\.profiles\(id\)\s+ON DELETE CASCADE/i,
  );
  assert.match(
    sql,
    /responder_user_id\s+uuid\s+NOT NULL\s+REFERENCES public\.profiles\(id\)\s+ON DELETE RESTRICT/i,
  );
  assert.match(
    sql,
    /suggestion_id\s+uuid\s+NOT NULL\s+REFERENCES public\.student_suggestions\(id\)\s+ON DELETE CASCADE/i,
  );

  // 4. allowed target roles constrained
  assert.match(sql, /CONSTRAINT student_suggestions_target_role_check\s+CHECK/i);
  for (const role of [
    'PRESIDENT',
    'VICE_PRESIDENT',
    'MEDIA_HEAD',
    'FINANCE_HEAD',
    'AUDIT_HEAD',
    'ACADEMIC_HEAD',
    'ACTIVITIES_HEAD',
  ]) {
    assert.ok(sql.includes(`'${role}'`), `Target role ${role} must be constrained`);
  }

  // 5. allowed statuses constrained
  assert.match(sql, /CONSTRAINT student_suggestions_status_check\s+CHECK/i);
  for (const status of ['new', 'reviewing', 'implemented', 'closed']) {
    assert.ok(sql.includes(`'${status}'`), `Status ${status} must be constrained`);
  }

  // Non-empty length checks
  assert.match(sql, /char_length\(btrim\(title\)\)\s*>=\s*3/i);
  assert.match(sql, /char_length\(btrim\(content\)\)\s*>=\s*5/i);
  assert.match(sql, /char_length\(btrim\(response_text\)\)\s*>=\s*1/i);

  // 6. RLS enabled on both tables
  assert.match(sql, /ALTER TABLE public\.student_suggestions ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /ALTER TABLE public\.suggestion_responses ENABLE ROW LEVEL SECURITY/i);

  // 18. Broad unauthenticated/direct writes are revoked from API roles
  assert.match(
    sql,
    /REVOKE INSERT,\s*UPDATE,\s*DELETE ON TABLE public\.student_suggestions FROM PUBLIC,\s*anon,\s*authenticated/i,
  );
  assert.match(
    sql,
    /REVOKE INSERT,\s*UPDATE,\s*DELETE ON TABLE public\.suggestion_responses FROM PUBLIC,\s*anon,\s*authenticated/i,
  );
  assert.match(sql, /GRANT SELECT ON TABLE public\.student_suggestions TO authenticated/i);
  assert.match(sql, /GRANT SELECT ON TABLE public\.suggestion_responses TO authenticated/i);
});

test('student suggestions migration defines authoritative RLS policies for suggestions and responses', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  // Policy: student_suggestions_select
  assert.match(sql, /CREATE POLICY "student_suggestions_select"/i);

  // 12. Student sees own only
  assert.match(sql, /student_user_id = \(SELECT auth\.uid\(\)\)/i);

  // 9. President can see all via private.current_user_authorization.is_president
  assert.match(sql, /authz\.is_president/i);

  // 10. Targeted executive only sees matching target_role
  // 11. Unrelated executive cannot see another committee's suggestion
  assert.match(sql, /ea\.position_key = target_role/i);

  // suggestion_responses policy inherits parent suggestion visibility
  assert.match(sql, /CREATE POLICY "suggestion_responses_select"/i);
  assert.match(sql, /FROM public\.student_suggestions/i);
});

test('submit_student_suggestion RPC enforces membership and derives identity securely', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.submit_student_suggestion\s*\(\s*p_target_role text,\s*p_category text,\s*p_title text,\s*p_content text\s*\)/i,
  );

  // 19. fixed safe search_path on SECURITY DEFINER functions
  assert.match(
    sql,
    /FUNCTION public\.submit_student_suggestion[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i,
  );

  // 7. Server derives student from auth.uid()
  // 8. Browser cannot submit arbitrary student_user_id
  assert.match(sql, /v_user_id uuid := \(SELECT auth\.uid\(\)\)/i);

  // Validates membership: profile must be active, application accepted, not banned
  assert.match(sql, /profiles[\s\S]*?status = 'active'/i);
  assert.match(sql, /student_applications[\s\S]*?status = 'accepted'/i);
  assert.match(sql, /sa\.student_user_id = p\.id/i);
  assert.doesNotMatch(sql, /sa\.user_id/i);
  assert.doesNotMatch(sql, /profiles\.status\s+IN\s*\(\s*'active',\s*'accepted'\s*\)/i);
  assert.match(sql, /auth\.users[\s\S]*?banned_until IS NOT NULL/i);

  // Initial status must be 'new'
  assert.match(sql, /INSERT INTO public\.student_suggestions[\s\S]*?'new'/i);

  // 20. Execution grants/revocations are least privilege
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.submit_student_suggestion FROM PUBLIC,\s*anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.submit_student_suggestion TO authenticated/i);
});

test('respond_to_student_suggestion RPC enforces executive authorization and atomic response update', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.respond_to_student_suggestion\s*\(\s*p_suggestion_id uuid,\s*p_response_text text,\s*p_new_status text\s*\)/i,
  );

  assert.match(
    sql,
    /FUNCTION public\.respond_to_student_suggestion[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i,
  );

  // 13. President can respond to any suggestion
  // 14. Target-role executive can respond to matching suggestion
  // 15. Unrelated executive cannot respond
  // 16. Student cannot respond as executive
  assert.match(sql, /v_actor_id uuid := \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /private\.is_current_president\(\)/i);
  assert.match(sql, /position_key = v_suggestion\.target_role/i);
  assert.doesNotMatch(sql, /executive_assignments\.role/i);

  // 17. Response insert + status change are atomic within single function
  assert.match(sql, /INSERT INTO public\.suggestion_responses/i);
  assert.match(sql, /UPDATE public\.student_suggestions[\s\S]*?SET status = p_new_status/i);

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.respond_to_student_suggestion FROM PUBLIC,\s*anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.respond_to_student_suggestion TO authenticated/i);
});

test('list_visible_student_suggestions RPC enforces RBAC and protects privacy', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.list_visible_student_suggestions\(\)/i,
  );

  assert.match(
    sql,
    /FUNCTION public\.list_visible_student_suggestions[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i,
  );

  // Privacy: MUST NOT select login email from auth.users
  assert.doesNotMatch(
    sql,
    /auth\.users\.email\s+AS\s+student_email/i,
  );
  assert.doesNotMatch(
    sql,
    /JOIN\s+auth\.users[\s\S]*?email/i,
  );

  // Selects canonical profile name (NOT full_name)
  assert.match(sql, /'student_name',\s*COALESCE\(p\.name/i);
  assert.doesNotMatch(sql, /profiles\.full_name/i);
  assert.doesNotMatch(sql, /p\.full_name/i);

  // Selects canonical position_key (NOT role)
  assert.match(sql, /'by_role',\s*COALESCE\(rea\.position_key/i);
  assert.doesNotMatch(sql, /rea\.role/i);

  // Uses private.is_current_president() with 0 arguments
  assert.match(sql, /private\.is_current_president\(\)/i);
  assert.doesNotMatch(sql, /is_current_executive\(/i);

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.list_visible_student_suggestions FROM PUBLIC,\s*anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.list_visible_student_suggestions TO authenticated/i);
});

