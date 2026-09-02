import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(new URL(
  '../supabase/migrations/20260822000000_identity_roles_profiles_history.sql',
  import.meta.url,
));
const migration = readFileSync(migrationPath, 'utf8');
const normalized = migration.toLowerCase().replace(/\s+/g, ' ');

function functionDefinition(name) {
  const match = normalized.match(new RegExp(
    `create or replace function public\\.${name}\\([^]*?\\$function\\$;`,
  ));
  assert.ok(match, `missing ${name} function`);
  return match[0];
}

test('student applications expose authenticated SELECT only and scope rows by UUID or presidency', () => {
  for (const policy of [
    'anon_select_applications',
    'anon_insert_applications',
    'anon_update_applications',
    'anon_delete_applications',
  ]) {
    assert.match(normalized, new RegExp(`drop policy if exists "${policy}" on public\\.student_applications`));
  }

  assert.match(normalized, /alter table public\.student_applications add column if not exists student_user_id uuid/);
  assert.match(normalized, /revoke all on table public\.student_applications from public, anon, authenticated/);
  assert.match(normalized, /grant select on table public\.student_applications to authenticated/);
  assert.doesNotMatch(normalized, /grant (?:insert|update|delete|all)[^;]*on table public\.student_applications to (?:anon|authenticated)/);

  assert.match(normalized, /create policy "student_applications_select_own"[^;]*for select to authenticated[^;]*auth\.uid\(\)[^;]*student_user_id/);
  assert.match(normalized, /create policy "student_applications_select_president"[^;]*for select to authenticated[^;]*authz\.is_president/);
  assert.doesNotMatch(normalized, /create policy [^;]*student_applications[^;]*for (?:insert|update|delete) to (?:anon|authenticated)/);
});

test('application scheduling is a president-only confirmed RPC with a pinned search path', () => {
  const definition = functionDefinition('schedule_student_application_interview');
  assert.match(definition, /security definer set search_path = ''/);
  assert.match(definition, /auth\.uid\(\)/);
  assert.match(definition, /private\.is_current_president\(\)/);
  assert.match(definition, /update public\.student_applications/);
  assert.match(definition, /student_user_id is not null/);
  assert.match(definition, /returning \* into/);
  assert.match(normalized, /revoke execute on function public\.schedule_student_application_interview\([^;]*from public, anon, authenticated, service_role/);
  assert.match(normalized, /grant execute on function public\.schedule_student_application_interview\([^;]*to authenticated/);
});

test('accepted application decision activates the UUID-owned profile in the same president-only RPC', () => {
  const definition = functionDefinition('decide_student_application');
  assert.match(definition, /security definer set search_path = ''/);
  assert.match(definition, /private\.is_current_president\(\)/);
  assert.match(definition, /p_decision not in \('accepted', 'rejected'\)/);
  assert.match(definition, /update public\.student_applications/);
  assert.match(definition, /student_user_id is not null/);
  assert.match(definition, /if p_decision = 'accepted'/);
  assert.match(definition, /update public\.profiles[^]*where id = v_application\.student_user_id/);
  assert.doesNotMatch(definition, /email\s*=/);
  assert.match(normalized, /revoke execute on function public\.decide_student_application\([^;]*from public, anon, authenticated, service_role/);
  assert.match(normalized, /grant execute on function public\.decide_student_application\([^;]*to authenticated/);
});

test('application gateway lists only RLS-visible rows and mutates only through confirmed RPC rows', async () => {
  const gatewayPath = fileURLToPath(new URL('../src/domain/applicationGateway.ts', import.meta.url));
  assert.equal(existsSync(gatewayPath), true, 'applicationGateway.ts must own the database contract');
  const { createApplicationService } = await import('../src/domain/applicationGateway.ts');

  const confirmedRow = {
    id: 'signup_student-1',
    student_user_id: '11111111-1111-4111-8111-111111111111',
    name: 'أحمد',
    email: 'contact@example.org',
    university: 'الجامعة',
    major: 'التخصص',
    year: 'السنة الأولى',
    phone: null,
    motivation: 'المشاركة',
    applied_at: '2026-08-23',
    status: 'interview',
    interview_date: '2026-08-30',
    interview_time: '16:00',
    interview_meeting_url: 'https://meet.example.org/room',
    decided_at: null,
    rejection_reason: null,
    created_at: '2026-08-23T00:00:00Z',
  };
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            order(column, options) {
              calls.push(['order', column, options]);
              return Promise.resolve({ data: [confirmedRow], error: null });
            },
          };
        },
      };
    },
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve({
        data: {
          ...confirmedRow,
          status: name === 'decide_student_application' ? 'accepted' : 'interview',
        },
        error: null,
      });
    },
  };
  const service = createApplicationService(client);

  const listed = await service.listVisible();
  const scheduled = await service.scheduleInterview('signup_student-1', {
    date: '2026-08-30',
    time: '16:00',
    meetingUrl: 'https://meet.example.org/room',
  });
  const decided = await service.decide('signup_student-1', 'accepted');

  assert.equal(listed.ok, true);
  assert.equal(listed.ok && listed.data[0].studentId, '11111111-1111-4111-8111-111111111111');
  assert.equal(scheduled.ok, true);
  assert.equal(decided.ok, true);
  assert.deepEqual(calls.filter(([kind]) => kind === 'rpc'), [
    ['rpc', 'schedule_student_application_interview', {
      p_application_id: 'signup_student-1',
      p_interview_date: '2026-08-30',
      p_interview_time: '16:00',
      p_interview_meeting_url: 'https://meet.example.org/room',
    }],
    ['rpc', 'decide_student_application', {
      p_application_id: 'signup_student-1',
      p_decision: 'accepted',
      p_rejection_reason: null,
    }],
  ]);
});

test('application gateway never reports an empty or failed RPC response as success', async () => {
  const gatewayPath = fileURLToPath(new URL('../src/domain/applicationGateway.ts', import.meta.url));
  assert.equal(existsSync(gatewayPath), true, 'applicationGateway.ts must own the database contract');
  const { createApplicationService } = await import('../src/domain/applicationGateway.ts');
  const service = createApplicationService({
    from() {
      return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
    },
    async rpc(name) {
      return name === 'schedule_student_application_interview'
        ? { data: null, error: null }
        : { data: null, error: { code: '42501', message: 'president only' } };
    },
  });

  const scheduled = await service.scheduleInterview('app-1', {
    date: '2026-08-30',
    time: '16:00',
    meetingUrl: 'https://meet.example.org/room',
  });
  const decided = await service.decide('app-1', 'accepted');

  assert.equal(scheduled.ok, false);
  assert.equal(scheduled.error.code, 'APPLICATION_INTERVIEW_EMPTY');
  assert.equal(decided.ok, false);
  assert.equal(decided.error.code, '42501');
});

test('application gateway rejects malformed, mismatched, and unowned RPC rows', async () => {
  const { createApplicationService } = await import('../src/domain/applicationGateway.ts');
  const valid = {
    id: 'signup_student-1',
    student_user_id: '11111111-1111-4111-8111-111111111111',
    name: 'أحمد',
    email: 'student@example.org',
    university: 'الجامعة',
    major: 'التخصص',
    year: 'السنة الأولى',
    motivation: 'المشاركة',
    applied_at: '2026-08-23',
    status: 'interview',
  };
  const malformedRows = [
    {},
    { ...valid, student_user_id: 'not-a-uuid' },
    { ...valid, id: 'another-application' },
    { ...valid, status: 'accepted' },
    { ...valid, name: '' },
  ];

  for (const data of malformedRows) {
    const service = createApplicationService({
      from() {
        return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
      },
      async rpc() {
        return { data, error: null };
      },
    });
    const result = await service.scheduleInterview('signup_student-1', {
      date: '2026-08-30',
      time: '16:00',
      meetingUrl: 'https://meet.example.org/room',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'APPLICATION_INTERVIEW_INVALID');
  }

  const wrongDecision = createApplicationService({
    from() {
      return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
    },
    async rpc() {
      return { data: { ...valid, status: 'rejected' }, error: null };
    },
  });
  const decision = await wrongDecision.decide('signup_student-1', 'accepted');
  assert.equal(decision.ok, false);
  assert.equal(decision.error.code, 'APPLICATION_DECISION_INVALID');
});
