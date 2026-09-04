import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FEATURE_MIGRATIONS = [
  '20260904120000_create_event_registrations.sql',
  '20260904130000_admin_dashboard_authoritative_analytics.sql',
  '20260904140000_create_student_suggestions.sql',
];

test('feature migrations do not use non-authoritative student_applications.user_id', async () => {
  for (const file of FEATURE_MIGRATIONS) {
    const url = new URL(`../supabase/migrations/${file}`, import.meta.url);
    const sql = await readFile(url, 'utf8');

    // Must not reference student_applications.user_id or a.user_id or sa.user_id
    assert.doesNotMatch(
      sql,
      /student_applications\s*\.\s*user_id\b/i,
      `${file} must not reference student_applications.user_id`,
    );
    assert.doesNotMatch(
      sql,
      /\b(a|sa)\.user_id\b/i,
      `${file} must not reference application alias (a|sa).user_id`,
    );
  }
});

test('feature migrations use canonical profiles.name and never profiles.full_name', async () => {
  for (const file of FEATURE_MIGRATIONS) {
    const url = new URL(`../supabase/migrations/${file}`, import.meta.url);
    const sql = await readFile(url, 'utf8');

    assert.doesNotMatch(
      sql,
      /\bfull_name\b/i,
      `${file} must not reference full_name; canonical column is profiles.name`,
    );
  }
});

test('feature migrations use canonical executive_assignments.position_key and never executive_assignments.role', async () => {
  for (const file of FEATURE_MIGRATIONS) {
    const url = new URL(`../supabase/migrations/${file}`, import.meta.url);
    const sql = await readFile(url, 'utf8');

    assert.doesNotMatch(
      sql,
      /executive_assignments\s*\.\s*role\b/i,
      `${file} must not reference executive_assignments.role; canonical column is position_key`,
    );
    assert.doesNotMatch(
      sql,
      /\b(ea|rea)\.role\b/i,
      `${file} must not reference (ea|rea).role; canonical column is position_key`,
    );
  }
});

test('feature migrations do not call non-existent public.is_current_executive helper', async () => {
  for (const file of FEATURE_MIGRATIONS) {
    const url = new URL(`../supabase/migrations/${file}`, import.meta.url);
    const sql = await readFile(url, 'utf8');

    assert.doesNotMatch(
      sql,
      /is_current_executive\s*\(/i,
      `${file} must not call is_current_executive; helpers have 0 args and private visibility`,
    );
  }
});

test('feature migrations call private.is_current_president() with zero arguments in SECURITY DEFINER RPCs', async () => {
  const suggestionsSql = await readFile(
    new URL('../supabase/migrations/20260904140000_create_student_suggestions.sql', import.meta.url),
    'utf8',
  );

  assert.match(
    suggestionsSql,
    /private\.is_current_president\(\)/i,
    'create_student_suggestions must call private.is_current_president() with 0 arguments',
  );
  assert.doesNotMatch(
    suggestionsSql,
    /private\.is_current_president\([^)]+\)/i,
    'private.is_current_president() takes 0 arguments',
  );
});

test('student submission membership semantics: active profile + accepted application required', async () => {
  const suggestionsSql = await readFile(
    new URL('../supabase/migrations/20260904140000_create_student_suggestions.sql', import.meta.url),
    'utf8',
  );

  // Profile must be active
  assert.match(suggestionsSql, /p\.status\s*=\s*'active'/i);
  // Must NOT treat 'accepted' as a profile status
  assert.doesNotMatch(suggestionsSql, /profiles\.status\s+IN\s*\(\s*'active',\s*'accepted'\s*\)/i);
  assert.doesNotMatch(suggestionsSql, /p\.status\s+IN\s*\(\s*'active',\s*'accepted'\s*\)/i);

  // Student application must be accepted and reference student_user_id
  assert.match(suggestionsSql, /sa\.student_user_id\s*=\s*p\.id/i);
  assert.match(suggestionsSql, /sa\.status\s*=\s*'accepted'/i);

  // Reject banned auth accounts
  assert.match(suggestionsSql, /banned_until\s+IS\s+NOT\s+NULL/i);

  // Unit validation of membership predicate states:
  const isEligibleStudent = (profileStatus, appStatus, isBanned = false) => {
    if (isBanned) return false;
    return profileStatus === 'active' && appStatus === 'accepted';
  };

  assert.equal(isEligibleStudent('active', 'accepted'), true, 'active profile + accepted app -> allowed');
  assert.equal(isEligibleStudent('active', 'pending'), false, 'active profile + pending app -> rejected');
  assert.equal(isEligibleStudent('active', 'interview'), false, 'active profile + interview app -> rejected');
  assert.equal(isEligibleStudent('active', 'rejected'), false, 'active profile + rejected app -> rejected');
  assert.equal(isEligibleStudent('inactive', 'accepted'), false, 'inactive profile + accepted app -> rejected');
  assert.equal(isEligibleStudent('removed', 'accepted'), false, 'removed profile + accepted app -> rejected');
  assert.equal(isEligibleStudent('banned', 'accepted'), false, 'banned profile + accepted app -> rejected');
  assert.equal(isEligibleStudent('active', 'accepted', true), false, 'banned auth account -> rejected');
});

test('analytics RPC return contract matches dashboardAnalyticsGateway contract exactly', async () => {
  const analyticsSql = await readFile(
    new URL('../supabase/migrations/20260904130000_admin_dashboard_authoritative_analytics.sql', import.meta.url),
    'utf8',
  );

  const expectedGatewayColumns = [
    'total_members_count',
    'active_members_count',
    'pending_applications_count',
    'six_month_member_growth',
    'six_month_event_participations',
    'event_participation_by_id',
  ];

  for (const col of expectedGatewayColumns) {
    assert.match(
      analyticsSql,
      new RegExp(`\\b${col}\\b`, 'i'),
      `get_admin_dashboard_metrics RPC must return column ${col} matching dashboardAnalyticsGateway`,
    );
  }

  // Obsolete competing columns must not be in the returns table
  const obsoleteColumns = [
    'member_growth_series',
    'event_registrations_series',
    'category_distribution',
    'participation_by_category',
  ];

  for (const obsolete of obsoleteColumns) {
    assert.doesNotMatch(
      analyticsSql,
      new RegExp(`\\b${obsolete}\\b`, 'i'),
      `Obsolete column ${obsolete} must not be present in get_admin_dashboard_metrics returns table`,
    );
  }
});

