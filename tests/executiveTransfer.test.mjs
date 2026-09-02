import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildTransferConfirmation,
  executeExecutiveTransfer,
  runTransferWithBusyState,
} = await import('../src/domain/executiveTransfer.ts');

const president = { role: 'PRESIDENT' };
const target = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'أحمد',
};
const previousHolder = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'خير الله',
};

function successfulRpc() {
  return Promise.resolve({
    kind: 'confirmed',
    data: {
      transferredPosition: 'VICE_PRESIDENT',
      previousUserId: previousHolder.id,
      newUserId: target.id,
      targetPreviousPosition: null,
      assignedBy: '33333333-3333-4333-8333-333333333333',
      assignedAt: '2026-08-22T10:00:00Z',
    },
  });
}

test('only a confirmed president may request an executive transfer', async () => {
  let rpcCalls = 0;
  const result = await executeExecutiveTransfer({
    actor: { role: 'VICE_PRESIDENT' },
    target,
    position: 'MEDIA_HEAD',
    previousHolder: null,
    transfer: async () => { rpcCalls += 1; return successfulRpc(); },
    refreshDirectory: async () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /رئيس الاتحاد/);
  assert.equal(rpcCalls, 0);
});

test('rejects STUDENT pseudo-transfers and non-UUID legacy targets before the RPC', async () => {
  let rpcCalls = 0;
  const transfer = async () => { rpcCalls += 1; return successfulRpc(); };
  const refreshDirectory = async () => ({ ok: true });

  const studentResult = await executeExecutiveTransfer({
    actor: president,
    target,
    position: 'STUDENT',
    previousHolder: null,
    transfer,
    refreshDirectory,
  });
  const legacyResult = await executeExecutiveTransfer({
    actor: president,
    target: { id: 'legacy-ahmad', name: 'أحمد' },
    position: 'MEDIA_HEAD',
    previousHolder: null,
    transfer,
    refreshDirectory,
  });

  assert.equal(studentResult.ok, false);
  assert.match(studentResult.error, /لا يمكن تعيين/);
  assert.equal(legacyResult.ok, false);
  assert.match(legacyResult.error, /مرتبط/);
  assert.equal(rpcCalls, 0);
});

test('a confirmed transfer gates authority before directory work and reloads identity last', async () => {
  let resolveRpc;
  const order = [];
  const pendingRpc = new Promise((resolve) => { resolveRpc = resolve; });
  const promise = executeExecutiveTransfer({
    actor: president,
    target,
    position: 'VICE_PRESIDENT',
    previousHolder,
    transfer: async () => { order.push('rpc'); return pendingRpc; },
    gateAuthority: () => { order.push('gate'); },
    refreshDirectory: async () => { order.push('directory'); return { ok: true }; },
    reloadIdentity: async () => { order.push('identity'); return { ok: true }; },
  });

  await Promise.resolve();
  assert.deepEqual(order, ['rpc']);

  resolveRpc(await successfulRpc());
  const result = await promise;

  assert.deepEqual(order, ['rpc', 'gate', 'directory', 'identity']);
  assert.deepEqual(result, {
    ok: true,
    previousHolder,
    newHolder: target,
  });
});

test('an explicit RPC failure preserves local authority because no commit is implied', async () => {
  const events = [];
  const failed = await executeExecutiveTransfer({
    actor: president,
    target,
    position: 'VICE_PRESIDENT',
    previousHolder,
    transfer: async () => ({ kind: 'definitive-failure', error: { code: '42501', message: 'denied' } }),
    gateAuthority: () => { events.push('gate'); },
    refreshDirectory: async () => { events.push('directory'); return { ok: true }; },
    reloadIdentity: async () => { events.push('identity'); return { ok: true }; },
  });

  assert.equal(failed.ok, false);
  assert.deepEqual(events, []);
});

test('a malformed success gates authority and still reloads confirmed identity', async () => {
  const events = [];
  const malformed = await executeExecutiveTransfer({
    actor: president,
    target,
    position: 'VICE_PRESIDENT',
    previousHolder,
    gateAuthority: () => { events.push('gate'); },
    transfer: async () => ({
      kind: 'confirmed',
      data: {
        transferredPosition: 'MEDIA_HEAD',
        previousUserId: previousHolder.id,
        newUserId: target.id,
        targetPreviousPosition: null,
        assignedBy: '33333333-3333-4333-8333-333333333333',
        assignedAt: '2026-08-22T10:00:00Z',
      },
    }),
    refreshDirectory: async () => { events.push('directory'); return { ok: true }; },
    reloadIdentity: async () => { events.push('identity'); return { ok: true }; },
  });

  assert.equal(malformed.ok, false);
  assert.equal(events[0], 'gate');
  assert.equal(events.at(-1), 'identity');
});

test('an indeterminate service outcome gates and reloads because a commit is possible', async () => {
  const events = [];
  const result = await executeExecutiveTransfer({
    actor: president,
    target,
    position: 'VICE_PRESIDENT',
    previousHolder,
    transfer: async () => ({
      kind: 'indeterminate',
      error: { code: 'ASSIGNMENT_TRANSFER_INDETERMINATE', message: 'safe internal message' },
    }),
    gateAuthority: () => { events.push('gate'); },
    refreshDirectory: async () => { events.push('directory'); return { ok: true }; },
    reloadIdentity: async () => { events.push('identity'); return { ok: true }; },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /تعذر التأكد.*نقل المنصب/);
  assert.doesNotMatch(result.error, /safe internal message/);
  assert.deepEqual(events, ['gate', 'identity']);
});

test('a directory rejection cannot prevent confirmed identity reload and returns a warning', async () => {
  const events = [];
  const result = await executeExecutiveTransfer({
    actor: president,
    target,
    position: 'VICE_PRESIDENT',
    previousHolder,
    transfer: async () => successfulRpc(),
    gateAuthority: () => { events.push('gate'); },
    refreshDirectory: async () => { events.push('directory'); throw new Error('offline'); },
    reloadIdentity: async () => { events.push('identity'); return { ok: true }; },
  });

  assert.equal(result.ok, true);
  assert.match(result.error, /تم نقل المنصب.*تعذر تحديث قائمة الأعضاء/);
  assert.deepEqual(events, ['gate', 'directory', 'identity']);
});

test('a pending directory refresh cannot delay the confirmed identity reload attempt', async () => {
  let resolveDirectory;
  let markIdentityStarted;
  const events = [];
  const pendingDirectory = new Promise((resolve) => { resolveDirectory = resolve; });
  const identityStarted = new Promise((resolve) => { markIdentityStarted = resolve; });
  const resultPromise = executeExecutiveTransfer({
    actor: president,
    target,
    position: 'VICE_PRESIDENT',
    previousHolder,
    transfer: async () => successfulRpc(),
    gateAuthority: () => { events.push('gate'); },
    refreshDirectory: async () => { events.push('directory'); return pendingDirectory; },
    reloadIdentity: async () => {
      events.push('identity');
      markIdentityStarted();
      return { ok: true };
    },
  });

  await identityStarted;
  assert.deepEqual(events, ['gate', 'directory', 'identity']);

  resolveDirectory({ ok: true });
  assert.equal((await resultPromise).ok, true);
});

test('identity reload failure leaves authority gated and returns a safe indeterminate result', async () => {
  let gated = false;
  const result = await executeExecutiveTransfer({
    actor: president,
    target,
    position: 'VICE_PRESIDENT',
    previousHolder,
    transfer: async () => successfulRpc(),
    gateAuthority: () => { gated = true; },
    refreshDirectory: async () => ({ ok: true }),
    reloadIdentity: async () => ({ ok: false, error: 'offline' }),
  });

  assert.equal(gated, true);
  assert.equal(result.ok, false);
  assert.match(result.error, /تم نقل المنصب.*تعذر تأكيد صلاحيات الجلسة/);
});

test('a thrown RPC is indeterminate, so it gates and reloads instead of preserving authority', async () => {
  const events = [];
  const result = await executeExecutiveTransfer({
    actor: president,
    target,
    position: 'VICE_PRESIDENT',
    previousHolder,
    transfer: async () => { throw new Error('connection lost after request'); },
    gateAuthority: () => { events.push('gate'); },
    refreshDirectory: async () => { events.push('directory'); return { ok: true }; },
    reloadIdentity: async () => { events.push('identity'); return { ok: true }; },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /تعذر التأكد.*نقل المنصب/);
  assert.deepEqual(events, ['gate', 'identity']);
});

test('busy state always resets when the transfer operation throws', async () => {
  const busy = [];
  await assert.rejects(
    runTransferWithBusyState(
      async () => { throw new Error('unexpected'); },
      (value) => busy.push(value),
    ),
    /unexpected/,
  );
  assert.deepEqual(busy, [true, false]);
});

test('occupied-role confirmation names both holders', () => {
  const message = buildTransferConfirmation({
    position: 'VICE_PRESIDENT',
    previousHolder,
    newHolder: target,
  });

  assert.match(message, /خير الله/);
  assert.match(message, /أحمد/);
  assert.match(message, /منصب نائب الرئيس/);
});

test('president confirmation explicitly warns of immediate permission loss and student routing', () => {
  const message = buildTransferConfirmation({
    position: 'PRESIDENT',
    previousHolder,
    newHolder: target,
  });

  assert.match(message, /ستفقد.*جميع صلاحيات الرئيس فوراً/);
  assert.match(message, /بوابة الطالب/);
  assert.match(message, /خير الله/);
  assert.match(message, /أحمد/);
});
