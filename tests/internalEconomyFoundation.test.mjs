import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260828000000_internal_economy_foundation.sql',
  import.meta.url,
);
const hardeningMigrationUrl = new URL(
  '../supabase/migrations/20260828010000_internal_economy_security_hardening.sql',
  import.meta.url,
);
const visibilityMigrationUrl = new URL(
  '../supabase/migrations/20260828020000_internal_economy_visibility_hardening.sql',
  import.meta.url,
);
const auditCapacityMigrationUrl = new URL(
  '../supabase/migrations/20260828030000_internal_economy_audit_capacity_hardening.sql',
  import.meta.url,
);
const typesUrl = new URL('../src/domain/internalEconomyTypes.ts', import.meta.url);

test('creates the internal economy schema with constrained enums and relationships', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS current_tier text NOT NULL DEFAULT 'BRONZE'/i);

  for (const enumName of [
    'activity_type',
    'activity_decision',
    'excuse_review_status',
    'attendance_status',
    'task_status',
    'task_completion_status',
  ]) {
    assert.match(sql, new RegExp(`CREATE TYPE public\\.${enumName}`, 'i'));
  }

  for (const tableName of [
    'activities',
    'activity_enrollments',
    'tasks',
    'task_enrollments',
    'points_ledger',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${tableName}`, 'i'));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${tableName} ENABLE ROW LEVEL SECURITY`, 'i'));
  }

  assert.match(sql, /PRIMARY KEY \(activity_id, student_id\)/i);
  assert.match(sql, /PRIMARY KEY \(task_id, student_id\)/i);
  assert.match(sql, /REFERENCES public\.profiles\(id\)/i);
});

test('restricts students to their own rows and their decision or excuse columns', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /position_key IN \('PRESIDENT', 'ACADEMIC_HEAD', 'AUDIT_HEAD'\)/i);
  assert.match(sql, /GRANT UPDATE \(decision, excuse_text\)[\s\S]+activity_enrollments TO authenticated/i);
  assert.doesNotMatch(sql, /GRANT UPDATE \([^)]*(excuse_status|attendance_status|completion_status|total_points)[^)]*\)[\s\S]+TO authenticated/i);
  assert.match(sql, /student_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /is_accepted_student/i);
  assert.doesNotMatch(sql, /\bOBSERVER\b/i);
});

test('keeps the points ledger append-only and updates profile totals atomically', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE TABLE public\.points_ledger/i);
  assert.match(sql, /amount integer NOT NULL/i);
  assert.match(sql, /created_at timestamptz NOT NULL DEFAULT now\(\)/i);
  assert.match(sql, /CREATE TRIGGER points_ledger_apply_to_profile_total/i);
  assert.match(sql, /SET total_points = total_points \+ NEW\.amount/i);
  assert.doesNotMatch(sql, /GRANT[^;]*(UPDATE|DELETE)[^;]*points_ledger[^;]*authenticated/i);
});

test('exports exact database-facing TypeScript unions and row interfaces', async () => {
  const source = await readFile(typesUrl, 'utf8');

  for (const exportedType of [
    'ActivityType',
    'ActivityDecision',
    'ExcuseReviewStatus',
    'AttendanceStatus',
    'TaskStatus',
    'TaskCompletionStatus',
  ]) {
    assert.match(source, new RegExp(`export type ${exportedType} =`));
  }

  for (const exportedInterface of [
    'Activity',
    'ActivityEnrollment',
    'InternalEconomyTask',
    'TaskEnrollment',
    'PointsLedgerEntry',
    'ProfileEconomyFields',
  ]) {
    assert.match(source, new RegExp(`export interface ${exportedInterface}`));
  }
});

test('routes student registration and protected points through hardened RPCs', async () => {
  const sql = await readFile(hardeningMigrationUrl, 'utf8');

  assert.match(sql, /FUNCTION public\.set_own_activity_enrollment\(/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /max_capacity/i);
  assert.match(sql, /FUNCTION public\.register_for_task\(/i);
  assert.match(sql, /required_students/i);
  assert.match(sql, /FUNCTION public\.record_points_transaction\(/i);
  assert.match(sql, /source_key/i);
  assert.match(sql, /ON CONFLICT \(source_key\) DO NOTHING/i);

  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.points_ledger\s+FROM authenticated, service_role/i);
  assert.match(sql, /GRANT SELECT, INSERT ON TABLE public\.points_ledger TO service_role/i);
  assert.doesNotMatch(sql, /GRANT[^;]*(UPDATE|DELETE)[^;]*points_ledger[^;]*service_role/i);
  assert.match(sql, /REVOKE INSERT, UPDATE ON TABLE public\.activity_enrollments FROM authenticated/i);
  assert.match(sql, /REVOKE INSERT ON TABLE public\.task_enrollments FROM authenticated/i);
});

test('shows students only available catalog rows or their own historical enrollments', async () => {
  const sql = await readFile(visibilityMigrationUrl, 'utf8');

  assert.match(sql, /DROP POLICY IF EXISTS "activities_accepted_or_admin_select"/i);
  assert.match(sql, /activities\.deadline > now\(\)/i);
  assert.match(sql, /enrollment\.student_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /DROP POLICY IF EXISTS "tasks_accepted_or_admin_select"/i);
  assert.match(sql, /tasks\.status = 'OPEN'::public\.task_status/i);
  assert.match(sql, /tasks\.deadline > now\(\)/i);
  assert.match(sql, /No DELETE policy is intentional/i);
});

test('hides capacity-exhausted activities and enforces durable enrollment history', async () => {
  const sql = await readFile(auditCapacityMigrationUrl, 'utf8');

  assert.match(sql, /activity_enrollments_joining_capacity_idx/i);
  assert.match(sql, /private\.activity_joining_capacity/i);
  assert.match(sql, /joining_count[\s\S]+< activities\.max_capacity/i);
  assert.match(sql, /ON DELETE RESTRICT/i);
  assert.match(sql, /REVOKE DELETE ON TABLE public\.activities FROM service_role/i);
  assert.match(sql, /REVOKE DELETE ON TABLE public\.activity_enrollments FROM service_role/i);
  assert.match(sql, /REVOKE DELETE ON TABLE public\.tasks FROM service_role/i);
  assert.match(sql, /REVOKE DELETE ON TABLE public\.task_enrollments FROM service_role/i);
});
