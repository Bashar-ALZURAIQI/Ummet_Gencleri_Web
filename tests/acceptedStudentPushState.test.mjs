import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initialAcceptedStudentPushState,
  reduceAcceptedStudentPushState,
} from '../src/domain/acceptedStudentPushState.ts';

test('hides the complete push feature for every non-accepted access state', () => {
  for (const access of ['loading', 'pending', 'interview', 'rejected', 'removed']) {
    assert.deepEqual(
      initialAcceptedStudentPushState(access, { kind: 'ready', permission: 'default' }, false),
      { kind: 'hidden' },
    );
  }
});

test('maps accepted students to install guidance, denial, ready, or enabled', () => {
  assert.equal(initialAcceptedStudentPushState('accepted', { kind: 'ios-install-required', reason: 'install' }, false).kind, 'ios-install-required');
  assert.equal(initialAcceptedStudentPushState('accepted', { kind: 'denied', reason: 'denied' }, false).kind, 'denied');
  assert.deepEqual(initialAcceptedStudentPushState('accepted', { kind: 'ready', permission: 'default' }, false), { kind: 'ready' });
  assert.deepEqual(initialAcceptedStudentPushState('accepted', { kind: 'ready', permission: 'granted' }, true), { kind: 'enabled' });
});

test('only reaches enabled after browser permission and server persistence both succeed', () => {
  let state = { kind: 'ready' };
  state = reduceAcceptedStudentPushState(state, { type: 'ENABLE_STARTED' });
  assert.deepEqual(state, { kind: 'enabling' });
  state = reduceAcceptedStudentPushState(state, { type: 'ENABLE_SUCCEEDED' });
  assert.deepEqual(state, { kind: 'enabled' });
});

test('keeps registration failure visible and retryable', () => {
  const state = reduceAcceptedStudentPushState(
    { kind: 'enabling' },
    { type: 'FAILED', message: 'تعذر الحفظ' },
  );
  assert.deepEqual(state, { kind: 'error', message: 'تعذر الحفظ' });
  assert.deepEqual(reduceAcceptedStudentPushState(state, { type: 'RETRY' }), { kind: 'ready' });
});

test('disabling moves through busy and returns to ready only on success', () => {
  const busy = reduceAcceptedStudentPushState({ kind: 'enabled' }, { type: 'DISABLE_STARTED' });
  assert.deepEqual(busy, { kind: 'disabling' });
  assert.deepEqual(reduceAcceptedStudentPushState(busy, { type: 'DISABLE_SUCCEEDED' }), { kind: 'ready' });
});

test('a permission denial becomes terminal until browser settings change', () => {
  assert.deepEqual(
    reduceAcceptedStudentPushState(
      { kind: 'enabling' },
      { type: 'PERMISSION_DENIED', message: 'افتح إعدادات المتصفح' },
    ),
    { kind: 'denied', reason: 'افتح إعدادات المتصفح' },
  );
});
