import test from 'node:test';
import assert from 'node:assert/strict';

const { createPhaseThreeEconomyRepository } = await import('../src/domain/phaseThreeEconomyRepository.ts');

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

test('maps pending excuses and sends a final review through the exact RPC contract', async () => {
  const row = {
    enrollment_id: '11111111-1111-4111-8111-111111111111',
    activity_id: '22222222-2222-4222-8222-222222222222',
    activity_title: 'اجتماع إلزامي', student_id: '33333333-3333-4333-8333-333333333333',
    student_name: 'أحمد', avatar_path: null, excuse_text: 'اختبار جامعي',
    submitted_at: '2026-08-28T12:00:00Z',
  };
  const fake = fakeClient([{ data: [row], error: null }, { data: { ...row, excuse_status: 'PARTIAL' }, error: null }]);
  const repository = createPhaseThreeEconomyRepository(fake.client);

  const loaded = await repository.loadPendingExcuses();
  const reviewed = await repository.reviewExcuse(row.enrollment_id, 'PARTIAL');

  assert.equal(loaded.ok, true);
  assert.equal(loaded.data[0].studentName, 'أحمد');
  assert.equal(reviewed.ok, true);
  assert.deepEqual(fake.calls, [
    { name: 'list_pending_mandatory_excuses', args: {} },
    { name: 'review_activity_excuse', args: { p_enrollment_id: row.enrollment_id, p_status: 'PARTIAL' } },
  ]);
});

test('loads active managed tasks and fetches enrollments only for the selected task', async () => {
  const taskId = '77777777-7777-4777-8777-777777777777';
  const task = {
    task_id: taskId,
    task_title: 'تنظيم المكتبة',
    task_description: 'ترتيب الكتب والفهارس',
    points_reward: 20,
    required_students: 4,
    deadline: '2026-09-10T12:00:00Z',
    task_status: 'FULL',
    enrollment_count: 4,
    created_by: '88888888-8888-4888-8888-888888888888',
    created_by_name: 'المسؤول الإعلامي',
  };
  const enrollment = {
    task_id: taskId,
    task_title: task.task_title,
    points_reward: 20,
    deadline: task.deadline,
    student_id: '99999999-9999-4999-8999-999999999999',
    student_name: 'أحمد',
    avatar_path: null,
    completion_status: 'PENDING',
  };
  const fake = fakeClient([
    { data: [task], error: null },
    { data: [enrollment], error: null },
  ]);
  const repository = createPhaseThreeEconomyRepository(fake.client);

  const tasks = await repository.loadManagedTasks();
  const enrollments = await repository.loadManagedTaskEnrollments(taskId);

  assert.deepEqual(tasks, {
    ok: true,
    data: [{
      taskId,
      title: task.task_title,
      description: task.task_description,
      pointsReward: 20,
      requiredStudents: 4,
      deadline: task.deadline,
      status: 'FULL',
      enrollmentCount: 4,
      createdBy: task.created_by,
      createdByName: task.created_by_name,
    }],
  });
  assert.equal(enrollments.ok, true);
  assert.equal(enrollments.data[0].studentName, 'أحمد');
  assert.deepEqual(fake.calls, [
    { name: 'list_managed_tasks', args: {} },
    { name: 'list_managed_task_enrollments', args: { p_task_id: taskId } },
  ]);
});

test('keeps the same manual request id in the authoritative point adjustment payload', async () => {
  const requestId = '44444444-4444-4444-8444-444444444444';
  const fake = fakeClient([{ data: { id: 'ledger-1', student_id: 'student-1', amount: -8, reason: 'تنبيه إداري', created_by: 'actor', source_key: `manual:${requestId}`, created_at: '2026-08-28T12:00:00Z' }, error: null }]);
  const result = await createPhaseThreeEconomyRepository(fake.client).adjustMemberPoints({
    studentId: 'student-1', amount: -8, reason: 'تنبيه إداري', requestId,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(fake.calls[0], {
    name: 'adjust_member_points',
    args: { p_student_id: 'student-1', p_amount: -8, p_reason: 'تنبيه إداري', p_request_id: requestId },
  });
});

test('rejects malformed recognition rows instead of inventing public data', async () => {
  const fake = fakeClient([{ data: [{ rank: 1, student_id: 'student-1', student_name: '', avatar_path: null, total_points: 500, current_tier: 'GOLD' }], error: null }]);
  const result = await createPhaseThreeEconomyRepository(fake.client).loadPublicLeaderboard();
  assert.deepEqual(result, { ok: false, error: { code: 'LEADERBOARD_RESPONSE_INVALID', message: 'تعذر التحقق من بيانات لوحة الشرف.' } });
});

test('maps authorization and incomplete-draft failures to actionable Arabic messages', async () => {
  const fake = fakeClient([
    { data: null, error: { code: '42501', message: 'Not authorized' } },
    { data: null, error: { code: '23514', message: 'Every joining student requires attendance evaluation' } },
  ]);
  const repository = createPhaseThreeEconomyRepository(fake.client);
  assert.equal((await repository.loadMemberPoints()).error.message, 'ليست لديك صلاحية إدارة هذا القسم.');
  assert.equal((await repository.finalizeActivity('activity-1')).error.message, 'يجب تقييم جميع الطلاب قبل إغلاق النشاط.');
});

test('requires and maps the visible creator identity for every recent points entry', async () => {
  const validSummary = {
    studentId: 'student-1', totalPoints: 90, currentTier: 'BRONZE', rank: 4, isTopTen: true,
    recentLedger: [{
      id: 'ledger-1', amount: 15, reason: 'مجهود ممتاز', createdAt: '2026-08-30T10:00:00Z',
      createdByName: 'بشار الزريقي', createdByRole: 'PRESIDENT', createdByIsSelf: false,
    }],
  };
  const malformedSummary = {
    ...validSummary,
    recentLedger: [{ id: 'ledger-2', amount: -5, reason: 'عذر جزئي', createdAt: '2026-08-30T11:00:00Z' }],
  };
  const fake = fakeClient([
    { data: validSummary, error: null },
    { data: malformedSummary, error: null },
  ]);
  const repository = createPhaseThreeEconomyRepository(fake.client);

  const valid = await repository.loadOwnGamificationSummary();
  const malformed = await repository.loadOwnGamificationSummary();

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.data.recentLedger[0], validSummary.recentLedger[0]);
  assert.deepEqual(malformed, {
    ok: false,
    error: { code: 'GAMIFICATION_RESPONSE_INVALID', message: 'تعذر التحقق من بيانات نقاطك.' },
  });
});
