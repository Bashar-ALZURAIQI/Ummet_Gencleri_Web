import test from 'node:test';
import assert from 'node:assert/strict';

import {
  registerForEventWithAuthority,
  unregisterFromEventWithAuthority,
  hydrateStudentRegisteredEvents,
  applyEventRegistrationToState,
} from '../src/domain/eventRegistrationCoordinator.ts';

const mockStudent = {
  id: 'student-123',
  userId: 'student-123',
  name: 'طالب معتمد',
  email: 'student@example.org',
  university: 'جامعة اسطنبول',
  major: 'هندسة حاسوب',
  year: 'السنة الثالثة',
  registeredEvents: ['e-prev'],
  status: 'active',
};

const mockEvents = [
  { id: 'e1', title: 'ورشة عمل', registered: 5, capacity: 20 },
  { id: 'e2', title: 'محاضرة', registered: 10, capacity: 10 },
];

test('1. registerForEvent calls server authority', async () => {
  let serverCalledWith = null;
  const deps = {
    currentStudent: { ...mockStudent },
    studentAccess: 'accepted',
    isConfirmedOwner: () => true,
    registerParticipation: async (eventId) => {
      serverCalledWith = eventId;
      return { ok: true, data: { eventId, isRegistered: true, registeredCount: 6 } };
    },
    applyRegistrationUpdate: () => {},
  };

  const result = await registerForEventWithAuthority('e1', deps);

  assert.equal(result.ok, true);
  assert.equal(serverCalledWith, 'e1');
});

test('2. pending student cannot register', async () => {
  let serverCalled = false;
  let stateMutated = false;
  const deps = {
    currentStudent: { ...mockStudent, status: 'inactive' },
    studentAccess: 'pending',
    isConfirmedOwner: () => true,
    registerParticipation: async () => {
      serverCalled = true;
      return { ok: true, data: { eventId: 'e1', isRegistered: true, registeredCount: 6 } };
    },
    applyRegistrationUpdate: () => { stateMutated = true; },
  };

  const result = await registerForEventWithAuthority('e1', deps);

  assert.equal(result.ok, false);
  assert.equal(serverCalled, false);
  assert.equal(stateMutated, false);
  assert.match(result.error, /متاح فقط للأعضاء المقبولين والنشطين/);
});

test('3. rejected student cannot register', async () => {
  let serverCalled = false;
  const deps = {
    currentStudent: { ...mockStudent, status: 'inactive' },
    studentAccess: 'rejected',
    isConfirmedOwner: () => true,
    registerParticipation: async () => {
      serverCalled = true;
      return { ok: true, data: { eventId: 'e1', isRegistered: true, registeredCount: 6 } };
    },
    applyRegistrationUpdate: () => {},
  };

  const result = await registerForEventWithAuthority('e1', deps);

  assert.equal(result.ok, false);
  assert.equal(serverCalled, false);
  assert.match(result.error, /متاح فقط للأعضاء المقبولين والنشطين/);
});

test('4. removed student cannot register', async () => {
  let serverCalled = false;
  const deps = {
    currentStudent: { ...mockStudent, status: 'removed' },
    studentAccess: 'removed',
    isConfirmedOwner: () => true,
    registerParticipation: async () => {
      serverCalled = true;
      return { ok: true, data: { eventId: 'e1', isRegistered: true, registeredCount: 6 } };
    },
    applyRegistrationUpdate: () => {},
  };

  const result = await registerForEventWithAuthority('e1', deps);

  assert.equal(result.ok, false);
  assert.equal(serverCalled, false);
  assert.match(result.error, /متاح فقط للأعضاء المقبولين والنشطين/);
});

test('5. banned/non-eligible access cannot mutate local event registration state', async () => {
  let appliedEvents = null;
  const deps = {
    currentStudent: { ...mockStudent, status: 'banned' },
    studentAccess: 'removed',
    isConfirmedOwner: () => true,
    registerParticipation: async () => ({
      ok: true,
      data: { eventId: 'e1', isRegistered: true, registeredCount: 99 },
    }),
    applyRegistrationUpdate: (eventId, isRegistered, count) => {
      appliedEvents = { eventId, isRegistered, count };
    },
  };

  const result = await registerForEventWithAuthority('e1', deps);

  assert.equal(result.ok, false);
  assert.equal(appliedEvents, null);
});

test('6. successful registration adds eventId based on server result', async () => {
  let updatedStudent = null;
  const deps = {
    currentStudent: { ...mockStudent, registeredEvents: ['e-old'] },
    studentAccess: 'accepted',
    isConfirmedOwner: () => true,
    registerParticipation: async (eventId) => ({
      ok: true,
      data: { eventId, isRegistered: true, registeredCount: 8 },
    }),
    applyRegistrationUpdate: (eventId, isRegistered, registeredCount) => {
      const outcome = applyEventRegistrationToState(
        mockEvents,
        deps.currentStudent,
        eventId,
        isRegistered,
        registeredCount,
      );
      updatedStudent = outcome.updatedStudent;
    },
  };

  const result = await registerForEventWithAuthority('e1', deps);

  assert.equal(result.ok, true);
  assert.ok(updatedStudent);
  assert.deepEqual(updatedStudent.registeredEvents, ['e-old', 'e1']);
});

test('7. successful registration uses server registeredCount exactly', async () => {
  let updatedEvents = null;
  const deps = {
    currentStudent: { ...mockStudent },
    studentAccess: 'accepted',
    isConfirmedOwner: () => true,
    // Server returns exact count 17 (suppose prior local was 5)
    registerParticipation: async (eventId) => ({
      ok: true,
      data: { eventId, isRegistered: true, registeredCount: 17 },
    }),
    applyRegistrationUpdate: (eventId, isRegistered, registeredCount) => {
      const outcome = applyEventRegistrationToState(
        mockEvents,
        deps.currentStudent,
        eventId,
        isRegistered,
        registeredCount,
      );
      updatedEvents = outcome.updatedEvents;
    },
  };

  const result = await registerForEventWithAuthority('e1', deps);

  assert.equal(result.ok, true);
  const targetEvent = updatedEvents.find((e) => e.id === 'e1');
  assert.equal(targetEvent.registered, 17);
});

test('8. no client-side registered + 1 authority remains', () => {
  // Verify applyEventRegistrationToState sets exact count, never e.registered + 1
  const events = [{ id: 'e1', title: 'ورشة', registered: 5, capacity: 20 }];
  const outcome = applyEventRegistrationToState(events, mockStudent, 'e1', true, 42);

  assert.equal(outcome.updatedEvents[0].registered, 42);
  assert.notEqual(outcome.updatedEvents[0].registered, 6);
});

test('9. failed registration leaves state unchanged', async () => {
  let stateModified = false;
  const deps = {
    currentStudent: { ...mockStudent, registeredEvents: ['e-prev'] },
    studentAccess: 'accepted',
    isConfirmedOwner: () => true,
    registerParticipation: async () => ({
      ok: false,
      error: { code: 'EVENT_FULL', message: 'اكتمل العدد المحدد للفعالية.' },
    }),
    applyRegistrationUpdate: () => { stateModified = true; },
  };

  const result = await registerForEventWithAuthority('e1', deps);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'اكتمل العدد المحدد للفعالية.');
  assert.equal(stateModified, false);
});

test('10. successful cancellation removes eventId when server says isRegistered=false', async () => {
  let updatedStudent = null;
  const student = { ...mockStudent, registeredEvents: ['e1', 'e2'] };
  const deps = {
    currentStudent: student,
    studentAccess: 'accepted',
    isConfirmedOwner: () => true,
    unregisterParticipation: async (eventId) => ({
      ok: true,
      data: { eventId, isRegistered: false, registeredCount: 4 },
    }),
    applyRegistrationUpdate: (eventId, isRegistered, registeredCount) => {
      const outcome = applyEventRegistrationToState(
        mockEvents,
        student,
        eventId,
        isRegistered,
        registeredCount,
      );
      updatedStudent = outcome.updatedStudent;
    },
  };

  const result = await unregisterFromEventWithAuthority('e1', deps);

  assert.equal(result.ok, true);
  assert.deepEqual(updatedStudent.registeredEvents, ['e2']);
});

test('11. cancellation uses server registeredCount exactly', async () => {
  let updatedEvents = null;
  const deps = {
    currentStudent: { ...mockStudent, registeredEvents: ['e1'] },
    studentAccess: 'accepted',
    isConfirmedOwner: () => true,
    // Server reports count 3 after cancellation
    unregisterParticipation: async (eventId) => ({
      ok: true,
      data: { eventId, isRegistered: false, registeredCount: 3 },
    }),
    applyRegistrationUpdate: (eventId, isRegistered, registeredCount) => {
      const outcome = applyEventRegistrationToState(
        mockEvents,
        deps.currentStudent,
        eventId,
        isRegistered,
        registeredCount,
      );
      updatedEvents = outcome.updatedEvents;
    },
  };

  const result = await unregisterFromEventWithAuthority('e1', deps);

  assert.equal(result.ok, true);
  const targetEvent = updatedEvents.find((e) => e.id === 'e1');
  assert.equal(targetEvent.registered, 3);
});

test('12. no client-side registered - 1 authority remains', () => {
  const events = [{ id: 'e1', title: 'ورشة', registered: 10, capacity: 20 }];
  const outcome = applyEventRegistrationToState(events, mockStudent, 'e1', false, 2);

  assert.equal(outcome.updatedEvents[0].registered, 2);
  assert.notEqual(outcome.updatedEvents[0].registered, 9);
});

test('13. failed cancellation leaves state unchanged', async () => {
  let stateModified = false;
  const deps = {
    currentStudent: { ...mockStudent, registeredEvents: ['e1'] },
    studentAccess: 'accepted',
    isConfirmedOwner: () => true,
    unregisterParticipation: async () => ({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'تعذر الاتصال بالخادم.' },
    }),
    applyRegistrationUpdate: () => { stateModified = true; },
  };

  const result = await unregisterFromEventWithAuthority('e1', deps);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'تعذر الاتصال بالخادم.');
  assert.equal(stateModified, false);
});

test('14. confirmed student session hydrates registeredEvents from listMyRegisteredEventIds()', async () => {
  let publishedEvents = null;
  let targetUserId = null;

  const deps = {
    target: { epoch: 1, userId: 'student-123', role: 'STUDENT' },
    isOwnershipCurrent: () => true,
    listRegisteredEventIds: async () => ({
      ok: true,
      data: ['e1', 'e2', 'e5'],
    }),
    applyHydratedRegisteredEvents: (userId, eventIds) => {
      targetUserId = userId;
      publishedEvents = eventIds;
    },
  };

  const hydrated = await hydrateStudentRegisteredEvents(deps);

  assert.equal(hydrated, true);
  assert.equal(targetUserId, 'student-123');
  assert.deepEqual(publishedEvents, ['e1', 'e2', 'e5']);
});

test('15. server registration list replaces legacy/mock/local registeredEvents for confirmed session authority', async () => {
  // Starting with mock events ['mock1', 'mock2']
  let currentRegisteredEvents = ['mock1', 'mock2'];

  const deps = {
    target: { epoch: 2, userId: 'student-456', role: 'STUDENT' },
    isOwnershipCurrent: () => true,
    listRegisteredEventIds: async () => ({
      ok: true,
      data: ['server-e1'],
    }),
    applyHydratedRegisteredEvents: (_userId, eventIds) => {
      // Replaces completely, never merges with mock
      currentRegisteredEvents = eventIds;
    },
  };

  await hydrateStudentRegisteredEvents(deps);

  assert.deepEqual(currentRegisteredEvents, ['server-e1']);
});

test('16. stale hydration response cannot publish after logout/account switch/auth epoch change', async () => {
  let publishedEvents = null;
  let isCurrent = true;

  const deps = {
    target: { epoch: 1, userId: 'student-A', role: 'STUDENT' },
    isOwnershipCurrent: () => isCurrent,
    listRegisteredEventIds: async () => {
      // While awaiting, user logs out or switches accounts
      isCurrent = false;
      return { ok: true, data: ['e-user-A'] };
    },
    applyHydratedRegisteredEvents: (_userId, eventIds) => {
      publishedEvents = eventIds;
    },
  };

  const hydrated = await hydrateStudentRegisteredEvents(deps);

  assert.equal(hydrated, false);
  assert.equal(publishedEvents, null);
});

test('17. non-STUDENT authenticated roles do not run student registration hydration', async () => {
  let listCalled = false;

  for (const role of ['PRESIDENT', 'VICE_PRESIDENT', 'MEDIA_HEAD', 'FINANCE_HEAD', 'AUDIT_HEAD', 'ACADEMIC_HEAD', 'ACTIVITIES_HEAD']) {
    const deps = {
      target: { epoch: 1, userId: 'executive-user', role },
      isOwnershipCurrent: () => true,
      listRegisteredEventIds: async () => {
        listCalled = true;
        return { ok: true, data: ['e1'] };
      },
      applyHydratedRegisteredEvents: () => {},
    };

    const hydrated = await hydrateStudentRegisteredEvents(deps);
    assert.equal(hydrated, false, `Role ${role} must not hydrate student registered events`);
    assert.equal(listCalled, false);
  }
});
