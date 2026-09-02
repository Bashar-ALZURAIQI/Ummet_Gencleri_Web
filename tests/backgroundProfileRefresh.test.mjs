import test from 'node:test';
import assert from 'node:assert/strict';

const { createBackgroundProfileRefreshCoordinator } = await import('../src/domain/backgroundProfileRefresh.ts');

const ownership = { authEpoch: 4, userId: '11111111-1111-4111-8111-111111111111' };
const session = { user: { id: ownership.userId } };
const identity = { currentUser: { userId: ownership.userId, role: 'MEDIA_HEAD', name: 'محدث' } };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function input(overrides = {}) {
  return {
    ownership,
    expectedRole: 'MEDIA_HEAD',
    isOwnershipCurrent: () => true,
    loadSession: async () => ({ ok: true, session }),
    loadIdentity: async () => ({ ok: true, identity }),
    applyIdentity: () => {},
    ...overrides,
  };
}

test('stale account-A ownership performs no request or state change after account B wins', async () => {
  const coordinator = createBackgroundProfileRefreshCoordinator();
  let loads = 0;
  let applies = 0;
  const result = await coordinator.refresh(input({
    isOwnershipCurrent: () => false,
    loadSession: async () => { loads += 1; return { ok: true, session }; },
    applyIdentity: () => { applies += 1; },
  }));

  assert.deepEqual(result, { ok: false, reason: 'stale' });
  assert.equal(loads, 0);
  assert.equal(applies, 0);
});

test('a profile refresh already waiting on I/O cannot apply after account B takes Auth ownership', async () => {
  const coordinator = createBackgroundProfileRefreshCoordinator();
  const pendingSession = deferred();
  let ownershipCurrent = true;
  let identityLoads = 0;
  let applies = 0;
  const pending = coordinator.refresh(input({
    isOwnershipCurrent: () => ownershipCurrent,
    loadSession: () => pendingSession.promise,
    loadIdentity: async () => {
      identityLoads += 1;
      return { ok: true, identity };
    },
    applyIdentity: () => { applies += 1; },
  }));

  ownershipCurrent = false;
  pendingSession.resolve({ ok: true, session });

  assert.deepEqual(await pending, { ok: false, reason: 'stale' });
  assert.equal(identityLoads, 0);
  assert.equal(applies, 0);
});

test('a same-role profile refresh applies in the background without touching dashboard UI state', async () => {
  const coordinator = createBackgroundProfileRefreshCoordinator();
  const ui = { spinner: false, adminTab: 'profile', studentModalOpen: true, banner: 'avatar-warning' };
  let appliedIdentity = null;

  const result = await coordinator.refresh(input({
    applyIdentity: (next) => { appliedIdentity = next; },
  }));

  assert.deepEqual(result, { ok: true });
  assert.equal(appliedIdentity, identity);
  assert.deepEqual(ui, { spinner: false, adminTab: 'profile', studentModalOpen: true, banner: 'avatar-warning' });
});

test('a confirmed role change is never applied as a background profile refresh', async () => {
  const coordinator = createBackgroundProfileRefreshCoordinator();
  let applies = 0;
  const result = await coordinator.refresh(input({
    loadIdentity: async () => ({
      ok: true,
      identity: { currentUser: { ...identity.currentUser, role: 'STUDENT' } },
    }),
    applyIdentity: () => { applies += 1; },
  }));

  assert.deepEqual(result, { ok: false, reason: 'role-changed' });
  assert.equal(applies, 0);
});

test('newer profile refresh wins when Realtime and an explicit mutation overlap', async () => {
  const coordinator = createBackgroundProfileRefreshCoordinator();
  const olderIdentity = deferred();
  const applied = [];
  const older = coordinator.refresh(input({
    loadIdentity: () => olderIdentity.promise,
    applyIdentity: (next) => applied.push(next.currentUser.name),
  }));

  const newer = coordinator.refresh(input({
    loadIdentity: async () => ({
      ok: true,
      identity: { currentUser: { ...identity.currentUser, name: 'الأحدث' } },
    }),
    applyIdentity: (next) => applied.push(next.currentUser.name),
  }));
  assert.deepEqual(await newer, { ok: true });
  olderIdentity.resolve({
    ok: true,
    identity: { currentUser: { ...identity.currentUser, name: 'الأقدم' } },
  });

  assert.deepEqual(await older, { ok: false, reason: 'stale' });
  assert.deepEqual(applied, ['الأحدث']);
});
