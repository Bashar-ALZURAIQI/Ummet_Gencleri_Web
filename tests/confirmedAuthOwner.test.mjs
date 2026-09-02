import test from 'node:test';
import assert from 'node:assert/strict';

const { AuthEpochController } = await import('../src/domain/authEpoch.ts');
const { ConfirmedAuthOwnerStore } = await import('../src/domain/confirmedAuthOwner.ts');
const { createOwnProfileOperations, canPublishOwnProfileOperationResult } = await import('../src/domain/ownProfileOperations.ts');

function scheduler() {
  let next = 0;
  const pending = new Map();
  return {
    adapter: {
      schedule(callback) {
        const id = ++next;
        pending.set(id, callback);
        return id;
      },
      cancel(id) { pending.delete(id); },
    },
    runAll() {
      for (const [id, callback] of [...pending]) {
        pending.delete(id);
        callback();
      }
    },
  };
}

const accountA = {
  userId: '11111111-1111-4111-8111-111111111111',
  loginEmail: 'a@example.org',
  role: 'MEDIA_HEAD',
};
const accountB = {
  userId: '22222222-2222-4222-8222-222222222222',
  loginEmail: 'b@example.org',
  role: 'PRESIDENT',
};

function operationsFrom(store, epochs, serviceCalls) {
  return createOwnProfileOperations({
    getIdentity: () => {
      const owner = store.capture((epoch) => epochs.isCurrent(epoch));
      return owner ? { ...owner, ownership: { authEpoch: owner.epoch, userId: owner.userId } } : null;
    },
    isOwnershipCurrent: (ownership) => epochs.isCurrent(ownership.authEpoch),
    updateProfile: async () => { serviceCalls.push('profile'); return { ok: true, data: {} }; },
    uploadAvatar: async () => ({ ok: true, data: { warnings: [] } }),
    deleteAvatar: async () => ({ ok: true, data: { warnings: [] } }),
    changePassword: async () => ({ ok: true, data: { userId: accountA.userId } }),
    refreshIdentity: async () => ({ ok: true }),
  });
}

for (const transition of ['SIGNED_IN account B', 'same-user TOKEN_REFRESHED']) {
  test(`an old account-A handler is inert in the synchronous ${transition} pre-commit window`, async () => {
    const clock = scheduler();
    const epochs = new AuthEpochController(clock.adapter);
    const owners = new ConfirmedAuthOwnerStore();
    const accountAEpoch = epochs.activate();
    owners.publish({ epoch: accountAEpoch, ...accountA }, (epoch) => epochs.isCurrent(epoch));

    // Auth transition order: clear the atomic owner before advancing the epoch.
    owners.clear();
    const newerEpoch = epochs.beginEvent();
    let newerAuthApplied = false;
    epochs.schedule(newerEpoch, () => { newerAuthApplied = true; });

    const serviceCalls = [];
    const result = await operationsFrom(owners, epochs, serviceCalls).updateProfile({ name: 'stale A' });
    const staleBannerMayPublish = canPublishOwnProfileOperationResult({
      ownership: { authEpoch: accountAEpoch, userId: accountA.userId },
      activeUserId: owners.capture((epoch) => epochs.isCurrent(epoch))?.userId ?? null,
      isAuthEpochCurrent: (epoch) => epochs.isCurrent(epoch),
    });
    clock.runAll();

    assert.equal(result.ok, false);
    assert.deepEqual(serviceCalls, []);
    assert.equal(staleBannerMayPublish, false);
    assert.equal(newerAuthApplied, true);
  });
}

test('a newly confirmed account-B handler captures and uses only the B owner tuple', async () => {
  const clock = scheduler();
  const epochs = new AuthEpochController(clock.adapter);
  const owners = new ConfirmedAuthOwnerStore();
  epochs.activate();
  owners.clear();
  const accountBEpoch = epochs.beginEvent();
  owners.publish({ epoch: accountBEpoch, ...accountB }, (epoch) => epochs.isCurrent(epoch));
  const captured = owners.capture((epoch) => epochs.isCurrent(epoch));

  assert.deepEqual(captured, { epoch: accountBEpoch, ...accountB });
  assert.notEqual(captured, owners.capture((epoch) => epochs.isCurrent(epoch)), 'captures are immutable copies');
});

test('publishing under a stale epoch cannot replace the atomic confirmed owner', () => {
  const clock = scheduler();
  const epochs = new AuthEpochController(clock.adapter);
  const owners = new ConfirmedAuthOwnerStore();
  const staleEpoch = epochs.activate();
  owners.clear();
  const currentEpoch = epochs.beginEvent();

  assert.equal(owners.publish({ epoch: staleEpoch, ...accountA }, (epoch) => epochs.isCurrent(epoch)), false);
  assert.equal(owners.publish({ epoch: currentEpoch, ...accountB }, (epoch) => epochs.isCurrent(epoch)), true);
  assert.equal(owners.capture((epoch) => epochs.isCurrent(epoch))?.userId, accountB.userId);
});
