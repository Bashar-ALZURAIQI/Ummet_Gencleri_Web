import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createIdentitySubscriptionGeneration,
  reduceRealtimeWarning,
} = await import('../src/domain/realtimeIdentityGuard.ts');

test('account replacement and unmount invalidate old callbacks before they can begin auth work', () => {
  const generations = createIdentitySubscriptionGeneration();
  const first = generations.activate('old-user');
  let authWork = 0;
  const oldCallback = () => {
    if (!generations.isActive(first, 'old-user')) return;
    authWork += 1;
  };

  generations.invalidate(first);
  const second = generations.activate('new-user');
  oldCallback();

  assert.equal(generations.isActive(second, 'new-user'), true);
  assert.equal(authWork, 0);

  generations.invalidate(second);
  assert.equal(generations.isActive(second, 'new-user'), false);
});

test('a stale old-user callback cannot supersede newer sign-in auth work', () => {
  const generations = createIdentitySubscriptionGeneration();
  const old = generations.activate('old-user');
  const events = [];

  generations.invalidateAll();
  events.push('new-sign-in');
  if (generations.isActive(old, 'old-user')) events.push('stale-realtime');

  assert.deepEqual(events, ['new-sign-in']);
});

test('realtime warning survives identity refresh and stale recovery until active recovery', () => {
  let warning = null;
  warning = reduceRealtimeWarning(warning, { kind: 'error', active: true });
  assert.match(warning, /الاتصال المباشر/);

  // An identity refresh does not itself constitute channel recovery.
  const warningAfterIdentityRefresh = warning;
  warning = reduceRealtimeWarning(warningAfterIdentityRefresh, { kind: 'subscribed', active: false });
  assert.equal(warning, warningAfterIdentityRefresh);

  warning = reduceRealtimeWarning(warning, { kind: 'subscribed', active: true });
  assert.equal(warning, null);
});
