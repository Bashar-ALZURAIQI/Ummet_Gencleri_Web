import test from 'node:test';
import assert from 'node:assert/strict';

const { createInternalEconomyRepository } = await import('../src/domain/internalEconomyRepository.ts');

function clientWith(responses) {
  const calls = [];
  return {
    calls,
    client: {
      async rpc(name, args = {}) {
        calls.push({ name, args });
        const response = responses.shift();
        if (!response) throw new Error(`No fake response for ${name}`);
        return response;
      },
    },
  };
}

const activityRow = {
  activity_id: '0b23d5ae-a3db-4f64-8aeb-809bc4e2e8f0',
  public_event_id: 'event-1',
  title: 'نشاط اختياري',
  description: 'وصف النشاط',
  type: 'OPTIONAL',
  points_value: 10,
  max_capacity: 14,
  deadline: '2099-01-01T12:00:00.000Z',
  joining_count: 9,
  remaining_capacity: 5,
  decision: 'DECLINING',
  excuse_text: null,
  total_points: 75,
  can_participate: true,
  economy_exempt: false,
};

const taskRow = {
  task_id: '9af84776-4a07-4a1c-a4de-7ee4f7f92247',
  title: 'تنظيم القاعة',
  description: 'المساعدة في تجهيز القاعة',
  points_reward: 20,
  required_students: 3,
  deadline: '2099-02-01T12:00:00.000Z',
  status: 'OPEN',
  enrollment_count: 2,
  is_enrolled: false,
  completion_status: null,
};

test('loads and strictly maps the accepted student activity board', async () => {
  const fake = clientWith([{ data: [activityRow], error: null }]);
  const repository = createInternalEconomyRepository(fake.client);

  const result = await repository.loadStudentActivities();

  assert.equal(result.ok, true);
  assert.deepEqual(result.data[0], {
    activityId: activityRow.activity_id,
    publicEventId: 'event-1',
    title: 'نشاط اختياري',
    description: 'وصف النشاط',
    type: 'OPTIONAL',
    pointsValue: 10,
    maxCapacity: 14,
    deadline: activityRow.deadline,
    joiningCount: 9,
    remainingCapacity: 5,
    decision: 'DECLINING',
    excuseText: null,
    totalPoints: 75,
    canParticipate: true,
    economyExempt: false,
  });
  assert.deepEqual(fake.calls, [{ name: 'list_activity_program_board', args: {} }]);
});

test('maps the same authoritative activity count for an anonymous visitor', async () => {
  const anonymousRow = {
    ...activityRow,
    joining_count: 0,
    remaining_capacity: 14,
    decision: null,
    total_points: 0,
    can_participate: false,
    economy_exempt: false,
  };
  const fake = clientWith([{ data: [anonymousRow], error: null }]);

  const result = await createInternalEconomyRepository(fake.client).loadStudentActivities();

  assert.equal(result.ok, true);
  assert.equal(result.data[0].joiningCount, 0);
  assert.equal(result.data[0].maxCapacity, 14);
  assert.equal(result.data[0].canParticipate, false);
  assert.deepEqual(fake.calls, [{ name: 'list_activity_program_board', args: {} }]);
});

test('rejects malformed activity projection instead of inventing local values', async () => {
  const fake = clientWith([{ data: [{ ...activityRow, joining_count: -1 }], error: null }]);
  const result = await createInternalEconomyRepository(fake.client).loadStudentActivities();

  assert.deepEqual(result, {
    ok: false,
    error: { code: 'ACTIVITY_BOARD_RESPONSE_INVALID', message: 'أعاد الخادم بيانات أنشطة غير صالحة.' },
  });
});

test('submits the exact decision RPC payload and reports the confirmed enrollment', async () => {
  const enrollment = {
    activity_id: activityRow.activity_id,
    student_id: 'f20631fa-3952-4d4b-baf4-8c979bfe80ba',
    decision: 'JOINING',
    excuse_text: null,
    excuse_status: null,
    attendance_status: null,
    created_at: '2026-08-28T12:00:00.000Z',
    updated_at: '2026-08-28T12:00:00.000Z',
  };
  const fake = clientWith([{ data: enrollment, error: null }]);
  const repository = createInternalEconomyRepository(fake.client);
  const args = {
    p_activity_id: activityRow.activity_id,
    p_decision: 'JOINING',
    p_excuse_text: null,
  };

  const result = await repository.setOwnActivityDecision(args);

  assert.equal(result.ok, true);
  assert.equal(result.data.decision, 'JOINING');
  assert.equal(result.data.excuse_text, null);
  assert.deepEqual(fake.calls, [{ name: 'set_own_activity_enrollment', args }]);
});

test('loads tasks and registers using only the task id', async () => {
  const enrollment = {
    task_id: taskRow.task_id,
    student_id: 'f20631fa-3952-4d4b-baf4-8c979bfe80ba',
    completion_status: 'PENDING',
    created_at: '2026-08-28T12:00:00.000Z',
    updated_at: '2026-08-28T12:00:00.000Z',
  };
  const fake = clientWith([
    { data: [taskRow], error: null },
    { data: enrollment, error: null },
  ]);
  const repository = createInternalEconomyRepository(fake.client);

  const board = await repository.loadStudentTasks();
  const registration = await repository.registerForTask(taskRow.task_id);

  assert.equal(board.ok, true);
  assert.equal(board.data[0].enrollmentCount, 2);
  assert.equal(registration.ok, true);
  assert.deepEqual(fake.calls, [
    { name: 'list_student_task_board', args: {} },
    { name: 'register_for_task', args: { p_task_id: taskRow.task_id } },
  ]);
});

test('manager creation methods pass validated server-owned RPC payloads', async () => {
  const fake = clientWith([
    { data: { id: activityRow.activity_id, public_event_id: 'event-1' }, error: null },
    { data: { id: taskRow.task_id, title: taskRow.title }, error: null },
  ]);
  const repository = createInternalEconomyRepository(fake.client);
  const activityInput = {
    publicEventId: 'event-1',
    title: 'نشاط',
    description: 'وصف',
    type: 'MANDATORY',
    pointsValue: 15,
    maxCapacity: 20,
    deadline: '2099-03-01T12:00:00.000Z',
  };
  const taskInput = {
    title: 'مهمة',
    description: 'وصف المهمة',
    pointsReward: 25,
    requiredStudents: 4,
    deadline: '2099-04-01T12:00:00.000Z',
  };

  assert.equal((await repository.upsertEventActivity(activityInput)).ok, true);
  assert.equal((await repository.createTask(taskInput)).ok, true);
  assert.deepEqual(fake.calls, [
    {
      name: 'upsert_event_activity',
      args: {
        p_public_event_id: 'event-1',
        p_title: 'نشاط',
        p_description: 'وصف',
        p_type: 'MANDATORY',
        p_points_value: 15,
        p_max_capacity: 20,
        p_deadline: '2099-03-01T12:00:00.000Z',
      },
    },
    {
      name: 'create_internal_task',
      args: {
        p_title: 'مهمة',
        p_description: 'وصف المهمة',
        p_points_reward: 25,
        p_required_students: 4,
        p_deadline: '2099-04-01T12:00:00.000Z',
      },
    },
  ]);
});

test('maps Supabase capacity and permission failures to actionable Arabic feedback', async () => {
  const fake = clientWith([
    { data: null, error: { code: '23514', message: 'Activity capacity is full' } },
    { data: null, error: { code: '42501', message: 'Not authorized' } },
  ]);
  const repository = createInternalEconomyRepository(fake.client);

  assert.deepEqual(await repository.registerForTask(taskRow.task_id), {
    ok: false,
    error: { code: '23514', message: 'اكتمل العدد المتاح، حدّث الصفحة للاطلاع على الحالة الحالية.' },
  });
  assert.deepEqual(await repository.loadStudentTasks(), {
    ok: false,
    error: { code: '42501', message: 'ليست لديك صلاحية استخدام هذه الميزة.' },
  });
});

test('maps paid-balance and mandatory-excuse constraints before generic check violations', async () => {
  const fake = clientWith([
    { data: null, error: { code: '23514', message: 'Student points are insufficient for this activity' } },
    { data: null, error: { code: '23514', message: 'Mandatory activities require an excuse when declining' } },
  ]);
  const repository = createInternalEconomyRepository(fake.client);

  assert.deepEqual(await repository.setOwnActivityDecision({
    p_activity_id: activityRow.activity_id,
    p_decision: 'JOINING',
    p_excuse_text: null,
  }), {
    ok: false,
    error: { code: '23514', message: 'نقاطك غير كافية للانضمام إلى هذا النشاط.' },
  });
  assert.deepEqual(await repository.setOwnActivityDecision({
    p_activity_id: activityRow.activity_id,
    p_decision: 'DECLINING',
    p_excuse_text: null,
  }), {
    ok: false,
    error: { code: '23514', message: 'يجب كتابة عذر الغياب للنشاط الإلزامي.' },
  });
});

test('returns a stable failure when the Supabase request throws', async () => {
  const client = {
    async rpc() {
      throw new TypeError('fetch failed');
    },
  };

  assert.deepEqual(await createInternalEconomyRepository(client).loadStudentActivities(), {
    ok: false,
    error: {
      code: 'INTERNAL_ECONOMY_TRANSPORT_FAILED',
      message: 'تعذر حفظ العملية في الخادم. تحقق من الاتصال ثم أعد المحاولة.',
    },
  });
});
