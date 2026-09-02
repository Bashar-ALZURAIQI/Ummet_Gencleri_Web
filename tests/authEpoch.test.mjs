import test from 'node:test';
import assert from 'node:assert/strict';

const {
  AuthEpochController,
  classifyAuthEvent,
  resolveOwnedOperationEpoch,
} = await import('../src/domain/authEpoch.ts');

function fakeScheduler() {
  let nextId = 1;
  const tasks = new Map();
  return {
    scheduler: {
      schedule(callback) {
        const id = nextId++;
        tasks.set(id, callback);
        return id;
      },
      cancel(id) {
        tasks.delete(id);
      },
    },
    runAll() {
      for (const [id, callback] of [...tasks]) {
        tasks.delete(id);
        callback();
      }
    },
    get pendingCount() {
      return tasks.size;
    },
  };
}

test('delayed SIGNED_IN cannot restore identity after SIGNED_OUT', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  epochs.activate();
  const signedInEpoch = epochs.beginEvent();
  let identity = null;

  assert.notEqual(signedInEpoch, null);
  epochs.schedule(signedInEpoch, () => { identity = 'signed-in'; });
  epochs.beginEvent(); // SIGNED_OUT invalidates and cancels the earlier event.
  identity = null;
  clock.runAll();

  assert.equal(identity, null);
  assert.equal(clock.pendingCount, 0);
});

test('initial getSession completion cannot clear a newer SIGNED_IN identity', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  const initialEpoch = epochs.activate();
  const signedInEpoch = epochs.beginEvent();
  let identity = 'new-user';

  if (epochs.isCurrent(initialEpoch)) identity = null;

  assert.equal(epochs.isCurrent(signedInEpoch), true);
  assert.equal(identity, 'new-user');
});

test('TOKEN_REFRESHED replaces and cancels a queued identity load', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  epochs.activate();
  const signedInEpoch = epochs.beginEvent();
  const applied = [];
  epochs.schedule(signedInEpoch, () => applied.push('signed-in'));

  const refreshedEpoch = epochs.beginEvent();
  epochs.schedule(refreshedEpoch, () => applied.push('refreshed'));
  clock.runAll();

  assert.deepEqual(applied, ['refreshed']);
});

test('unmount cancels queued work and prevents later scheduling', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  epochs.activate();
  const eventEpoch = epochs.beginEvent();
  let ran = false;
  epochs.schedule(eventEpoch, () => { ran = true; });

  epochs.dispose();
  assert.equal(epochs.schedule(eventEpoch, () => { ran = true; }), false);
  clock.runAll();

  assert.equal(ran, false);
  assert.equal(clock.pendingCount, 0);
});

test('failed signOut leaves a fence that rejects queued and subsequent auth events', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  epochs.activate();
  const eventEpoch = epochs.beginEvent();
  let identity = null;
  epochs.schedule(eventEpoch, () => { identity = 'stale-user'; });

  epochs.suspendEvents(); // logout clears UI before the rejected network request.
  const signOutError = new Error('network failure');
  assert.ok(signOutError);
  assert.equal(epochs.beginEvent(), null);
  clock.runAll();

  assert.equal(identity, null);
  assert.equal(clock.pendingCount, 0);
});

for (const newerEvent of ['TOKEN_REFRESHED', 'USER_UPDATED', 'SIGNED_IN']) {
  test(`older operation resolution cannot cancel a newer same-user ${newerEvent}`, () => {
    const clock = fakeScheduler();
    const epochs = new AuthEpochController(clock.scheduler);
    epochs.activate();
    const operationEpoch = epochs.beginOperation();
    const olderSession = { user: { id: 'same-user' }, revision: 'older-operation' };
    const eventEpoch = epochs.beginEvent();
    const newerSession = { user: { id: 'same-user' }, revision: newerEvent };
    const applied = [];
    epochs.schedule(eventEpoch, () => applied.push(newerSession.revision));

    const ownedEpoch = resolveOwnedOperationEpoch({
      controller: epochs,
      operationEpoch,
      operationSession: olderSession,
      latestEvent: { epoch: eventEpoch, session: newerSession },
    });
    if (ownedEpoch !== null) {
      epochs.cancelScheduled(ownedEpoch);
      epochs.schedule(ownedEpoch, () => applied.push(olderSession.revision));
    }
    clock.runAll();

    assert.equal(ownedEpoch, null);
    assert.deepEqual(applied, [newerEvent]);
  });
}

test('an operation may correlate only with the exact session object emitted for it', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  epochs.activate();
  const operationEpoch = epochs.beginOperation();
  const operationSession = { user: { id: 'user-1' } };
  const eventEpoch = epochs.beginEvent();

  assert.equal(
    resolveOwnedOperationEpoch({
      controller: epochs,
      operationEpoch,
      operationSession,
      latestEvent: { epoch: eventEpoch, session: operationSession },
    }),
    eventEpoch,
  );
});

test('MFA_CHALLENGE_VERIFIED owns a refresh that supersedes initialization and completes', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  const initialEpoch = epochs.activate();
  const action = classifyAuthEvent('MFA_CHALLENGE_VERIFIED', true);
  let state = { initializing: true, owner: null };

  assert.equal(action, 'refresh');
  const mfaEpoch = epochs.beginEvent();
  epochs.schedule(mfaEpoch, () => { state = { initializing: false, owner: 'mfa' }; });
  if (epochs.isCurrent(initialEpoch)) state = { initializing: false, owner: 'initial' };
  clock.runAll();

  assert.deepEqual(state, { initializing: false, owner: 'mfa' });
});

test('MFA replacement cancels an older supported event and the MFA owner wins', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  epochs.activate();
  const signedInEpoch = epochs.beginEvent();
  const applied = [];
  epochs.schedule(signedInEpoch, () => applied.push('signed-in'));

  assert.equal(classifyAuthEvent('MFA_CHALLENGE_VERIFIED', true), 'refresh');
  const mfaEpoch = epochs.beginEvent();
  epochs.schedule(mfaEpoch, () => applied.push('mfa'));
  clock.runAll();

  assert.deepEqual(applied, ['mfa']);
});

test('an unsupported event is ignored before epoch advancement so initialization completes', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  const initialEpoch = epochs.activate();
  let state = { initializing: true, owner: null };

  const action = classifyAuthEvent('FUTURE_UNSUPPORTED_EVENT', true);
  if (action !== 'ignore') epochs.beginEvent();
  if (epochs.isCurrent(initialEpoch)) state = { initializing: false, owner: 'initial' };

  assert.equal(action, 'ignore');
  assert.deepEqual(state, { initializing: false, owner: 'initial' });
});

test('capturing operation ownership does not advance or cancel the current Auth owner', () => {
  const clock = fakeScheduler();
  const epochs = new AuthEpochController(clock.scheduler);
  const activeEpoch = epochs.activate();
  const applied = [];
  epochs.schedule(activeEpoch, () => applied.push('active-auth'));

  const captured = epochs.capture();
  clock.runAll();

  assert.equal(captured, activeEpoch);
  assert.deepEqual(applied, ['active-auth']);
});

for (const newerEvent of ['SIGNED_IN-other-account', 'TOKEN_REFRESHED-same-account']) {
  test(`stale profile ownership cannot cancel newer ${newerEvent} work`, () => {
    const clock = fakeScheduler();
    const epochs = new AuthEpochController(clock.scheduler);
    epochs.activate();
    const profileOwnership = epochs.capture();
    const newerEpoch = epochs.beginEvent();
    const applied = [];
    epochs.schedule(newerEpoch, () => applied.push(newerEvent));

    // A profile operation may check ownership, but must never allocate an epoch.
    const mayRefresh = profileOwnership !== null && epochs.isCurrent(profileOwnership);
    clock.runAll();

    assert.equal(mayRefresh, false);
    assert.deepEqual(applied, [newerEvent]);
  });
}
