import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { activityDraftComplete } from '../src/domain/phaseThreeEconomy.ts';
import { createPhaseThreeEconomyRepository } from '../src/domain/phaseThreeEconomyRepository.ts';
import ar from '../src/i18n/locales/ar.ts';
import tr from '../src/i18n/locales/tr.ts';
import en from '../src/i18n/locales/en.ts';

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    client: {
      async rpc(name, args = {}) {
        calls.push({ name, args });
        return responses.shift();
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 1. UI & Domain Logic: activityDraftComplete
// ---------------------------------------------------------------------------

test('activityDraftComplete: preserves false for empty row array', () => {
  assert.equal(activityDraftComplete([]), false);
});

test('activityDraftComplete: returns true when all joining rows are evaluated', () => {
  assert.equal(
    activityDraftComplete([
      { studentId: 'st-1', attendanceStatus: 'ON_TIME', decision: 'JOINING' },
      { studentId: 'st-2', attendanceStatus: 'LATE', decision: 'JOINING' },
    ]),
    true,
  );
});

test('activityDraftComplete: returns false when a joining student is not evaluated', () => {
  assert.equal(
    activityDraftComplete([
      { studentId: 'st-1', attendanceStatus: 'ON_TIME', decision: 'JOINING' },
      { studentId: 'st-2', attendanceStatus: null, decision: 'JOINING' },
    ]),
    false,
  );
});

test('activityDraftComplete: ignored student does not block finalization when joiners are evaluated', () => {
  assert.equal(
    activityDraftComplete([
      { studentId: 'st-1', attendanceStatus: 'ON_TIME', decision: 'JOINING' },
      { studentId: 'st-2', attendanceStatus: null, decision: 'IGNORED' },
    ]),
    true,
  );
});

test('activityDraftComplete: mandatory activity with zero joining students (all ignored) is finalizable', () => {
  assert.equal(
    activityDraftComplete([
      { studentId: 'st-1', attendanceStatus: null, decision: 'IGNORED' },
      { studentId: 'st-2', attendanceStatus: null, decision: 'IGNORED' },
    ]),
    true,
  );
});

test('activityDraftComplete: activity with zero enrolled students (null studentId) is finalizable', () => {
  assert.equal(
    activityDraftComplete([
      { studentId: null, attendanceStatus: null, decision: null },
    ]),
    true,
  );
});

// ---------------------------------------------------------------------------
// 2. Repository Mapping: mapActivity with decision and nullable student_id
// ---------------------------------------------------------------------------

test('mapActivity maps ignored student decision and maintains attendanceStatus null', async () => {
  const row = {
    activity_id: '11111111-1111-4111-8111-111111111111',
    activity_title: 'اجتماع إلزامي',
    activity_type: 'MANDATORY',
    points_value: 20,
    deadline: '2026-09-08T12:00:00Z',
    student_id: '22222222-2222-4222-8222-222222222222',
    student_name: 'أحمد',
    avatar_path: null,
    attendance_status: null,
    decision: 'IGNORED',
  };

  const fake = fakeClient([{ data: [row], error: null }]);
  const repo = createPhaseThreeEconomyRepository(fake.client);
  const result = await repo.loadActivityEvaluations();

  assert.equal(result.ok, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].decision, 'IGNORED');
  assert.equal(result.data[0].attendanceStatus, null);
});

test('mapActivity maps activity with zero enrolled students (student_id is null)', async () => {
  const row = {
    activity_id: '11111111-1111-4111-8111-111111111111',
    activity_title: 'نشاط بدون مسجلين',
    activity_type: 'MANDATORY',
    points_value: 20,
    deadline: '2026-09-08T12:00:00Z',
    student_id: null,
    student_name: null,
    avatar_path: null,
    attendance_status: null,
    decision: null,
  };

  const fake = fakeClient([{ data: [row], error: null }]);
  const repo = createPhaseThreeEconomyRepository(fake.client);
  const result = await repo.loadActivityEvaluations();

  assert.equal(result.ok, true);
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].studentId, null);
  assert.equal(result.data[0].activityTitle, 'نشاط بدون مسجلين');
});

// ---------------------------------------------------------------------------
// 3. i18n Dictionary Checks
// ---------------------------------------------------------------------------

test('i18n includes ignored penalty and empty activity translations in AR, TR, EN', () => {
  for (const [code, loc] of [['ar', ar], ['tr', tr], ['en', en]]) {
    assert.ok(loc.admin?.oversight?.ignoredPenalty, `admin.oversight.ignoredPenalty missing in ${code}`);
    assert.ok(loc.admin?.oversight?.noStudentsEnrolled, `admin.oversight.noStudentsEnrolled missing in ${code}`);
  }
});

// ---------------------------------------------------------------------------
// 4. Migration Source & Contract Assertions
// ---------------------------------------------------------------------------

const migrationUrl = new URL(
  '../supabase/migrations/20260908120000_fix_internal_economy_semantics.sql',
  import.meta.url,
);

test('migration file exists and applies forward-only semantic fixes', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.ok(sql.length > 500, 'Migration file must contain SQL');
  const norm = sql.replace(/\s+/g, ' ');

  // 1. Mandatory IGNORED penalty
  assert.match(norm, /v_activity\.type\s*=\s*'MANDATORY'/i);
  assert.match(norm, /-20/);
  assert.match(norm, /'activity-result:'\s*\|\|\s*p_activity_id\s*\|\|\s*':'/);
  assert.match(norm, /ON CONFLICT\s*\(source_key\)\s*DO NOTHING/i);

  // 2. Executive task exemption
  assert.match(norm, /public\.finalize_task_evaluation/i);
  assert.match(norm, /executive_assignments[\s\S]*?economy_exempt/i);
  assert.match(norm, /WHEN\s+v_row\.economy_exempt\s+THEN\s+0/i);

  // 3. Task registration aligns with activity participation
  assert.match(norm, /public\.register_for_task/i);
  assert.match(norm, /v_is_executive\s+OR\s+v_is_accepted_student/i);

  // 4. Activity creator update authorization
  assert.match(norm, /public\.upsert_event_activity/i);
  assert.match(norm, /created_by\s*=\s*v_user_id/i);
  assert.match(norm, /PRESIDENT/);
  assert.match(norm, /ACADEMIC_HEAD/);
  assert.match(norm, /AUDIT_HEAD/);

  // 5. Finalized activity safety
  assert.match(norm, /evaluation_closed_at\s+IS\s+NOT\s+NULL/i);

  // 6. RLS policy update for activities
  assert.match(norm, /activities_admin_update/i);

  // 7. list_activity_evaluations returns decision
  assert.match(norm, /list_activity_evaluations\(\)[\s\S]*?decision\s+public\.activity_decision/i);
});
