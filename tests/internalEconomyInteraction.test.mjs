import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildActivityDecisionRequest,
  formatEnrollmentCount,
  resolveActivityInteraction,
  resolveTaskInteraction,
  toDateTimeLocalValue,
} = await import('../src/domain/internalEconomyInteraction.ts');

const future = '2099-01-01T12:00:00.000Z';
const past = '2020-01-01T12:00:00.000Z';

test('formats stored instants for datetime-local using local clock components', () => {
  const value = '2026-08-28T12:34:00.000Z';
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  const expected = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

  assert.equal(toDateTimeLocalValue(value), expected);
  assert.equal(toDateTimeLocalValue('not-a-date'), '');
});

test('guest activity action always routes to login', () => {
  const state = resolveActivityInteraction({
    hasStudent: false,
    access: 'pending',
    type: 'OPTIONAL',
    pointsValue: 0,
    totalPoints: 0,
    maxCapacity: 10,
    joiningCount: 10,
    deadline: past,
    currentDecision: null,
    now: new Date('2026-08-28T12:00:00.000Z'),
  });

  assert.equal(state.mode, 'LOGIN');
  assert.equal(state.canJoin, false);
  assert.equal(state.canDecline, false);
});

test('formats enrollment totals in current-over-capacity order', () => {
  assert.equal(formatEnrollmentCount(0, 14), '0 / 14 مسجل');
  assert.equal(formatEnrollmentCount(9, 14), '9 / 14 مسجل');
  assert.equal(formatEnrollmentCount(3, null), '3 مسجل');
});

test('current executive may join a paid activity without a points gate', () => {
  const state = resolveActivityInteraction({
    hasStudent: true,
    access: 'pending',
    canParticipate: true,
    economyExempt: true,
    type: 'PAID',
    pointsValue: 500,
    totalPoints: 0,
    maxCapacity: 14,
    joiningCount: 0,
    deadline: future,
    currentDecision: null,
  });

  assert.deepEqual(state, {
    mode: 'READY',
    canJoin: true,
    canDecline: true,
    reason: null,
  });
});

test('non-accepted account is locked before capacity and deadline checks', () => {
  const state = resolveActivityInteraction({
    hasStudent: true,
    access: 'interview',
    type: 'OPTIONAL',
    pointsValue: 0,
    totalPoints: 0,
    maxCapacity: 10,
    joiningCount: 0,
    deadline: future,
    currentDecision: null,
  });

  assert.equal(state.mode, 'LOCKED');
});

test('accepted student cannot join after deadline or when capacity is full', () => {
  const expired = resolveActivityInteraction({
    hasStudent: true,
    access: 'accepted',
    type: 'OPTIONAL',
    pointsValue: 0,
    totalPoints: 0,
    maxCapacity: 10,
    joiningCount: 1,
    deadline: past,
    currentDecision: null,
    now: new Date('2026-08-28T12:00:00.000Z'),
  });
  const full = resolveActivityInteraction({
    hasStudent: true,
    access: 'accepted',
    type: 'OPTIONAL',
    pointsValue: 0,
    totalPoints: 0,
    maxCapacity: 10,
    joiningCount: 10,
    deadline: future,
    currentDecision: null,
  });

  assert.equal(expired.mode, 'CLOSED');
  assert.equal(expired.reason, 'DEADLINE');
  assert.equal(full.mode, 'CLOSED');
  assert.equal(full.reason, 'FULL');
});

test('paid activity blocks joining when the student points are insufficient but allows declining', () => {
  const state = resolveActivityInteraction({
    hasStudent: true,
    access: 'accepted',
    type: 'PAID',
    pointsValue: 50,
    totalPoints: 49,
    maxCapacity: 10,
    joiningCount: 2,
    deadline: future,
    currentDecision: null,
  });

  assert.equal(state.mode, 'INSUFFICIENT_POINTS');
  assert.equal(state.canJoin, false);
  assert.equal(state.canDecline, true);
});

test('existing joining student may keep or change the decision even when capacity is now full', () => {
  const state = resolveActivityInteraction({
    hasStudent: true,
    access: 'accepted',
    type: 'OPTIONAL',
    pointsValue: 0,
    totalPoints: 0,
    maxCapacity: 10,
    joiningCount: 10,
    deadline: future,
    currentDecision: 'JOINING',
  });

  assert.equal(state.mode, 'READY');
  assert.equal(state.canJoin, true);
  assert.equal(state.canDecline, true);
});

test('mandatory decline requires a nonblank excuse while optional decline removes stale excuse', () => {
  assert.deepEqual(buildActivityDecisionRequest({
    activityId: 'activity-1',
    activityType: 'MANDATORY',
    decision: 'DECLINING',
    excuseText: '  لدي اختبار جامعي  ',
  }), {
    ok: true,
    value: {
      p_activity_id: 'activity-1',
      p_decision: 'DECLINING',
      p_excuse_text: 'لدي اختبار جامعي',
    },
  });

  assert.deepEqual(buildActivityDecisionRequest({
    activityId: 'activity-1',
    activityType: 'MANDATORY',
    decision: 'DECLINING',
    excuseText: '   ',
  }), {
    ok: false,
    error: 'العذر مطلوب للنشاط الإلزامي.',
  });

  assert.equal(buildActivityDecisionRequest({
    activityId: 'activity-2',
    activityType: 'OPTIONAL',
    decision: 'DECLINING',
    excuseText: 'عذر قديم',
  }).value.p_excuse_text, null);
});

test('joining always clears the previous excuse', () => {
  assert.deepEqual(buildActivityDecisionRequest({
    activityId: 'activity-3',
    activityType: 'MANDATORY',
    decision: 'JOINING',
    excuseText: 'عذر قديم',
  }), {
    ok: true,
    value: {
      p_activity_id: 'activity-3',
      p_decision: 'JOINING',
      p_excuse_text: null,
    },
  });
});

test('task interaction closes at deadline, full capacity, or non-open server status', () => {
  const open = resolveTaskInteraction({
    hasStudent: true,
    access: 'accepted',
    deadline: future,
    status: 'OPEN',
    requiredStudents: 2,
    enrollmentCount: 1,
    isEnrolled: false,
  });
  const full = resolveTaskInteraction({
    hasStudent: true,
    access: 'accepted',
    deadline: future,
    status: 'FULL',
    requiredStudents: 2,
    enrollmentCount: 2,
    isEnrolled: false,
  });

  assert.deepEqual(open, { mode: 'READY', canRegister: true, reason: null });
  assert.deepEqual(full, { mode: 'CLOSED', canRegister: false, reason: 'FULL' });
});
