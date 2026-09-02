import test from 'node:test';
import assert from 'node:assert/strict';

const {
  classifyTransferRpcResult,
  executeTransferRpcRequest,
} = await import('../src/domain/executiveTransferServiceOutcome.ts');
const { executeExecutiveTransfer } = await import('../src/domain/executiveTransfer.ts');

const validRow = {
  transferred_position: 'VICE_PRESIDENT',
  previous_user_id: '11111111-1111-4111-8111-111111111111',
  new_user_id: '22222222-2222-4222-8222-222222222222',
  target_previous_position: null,
  assigned_by: '33333333-3333-4333-8333-333333333333',
  assigned_at: '2026-08-22T10:00:00Z',
};

test('a stable PostgreSQL rejection proves rollback and is the only no-commit outcome', () => {
  const authorization = classifyTransferRpcResult({
    data: null,
    error: { code: '42501', message: 'Only the current president may transfer' },
  });
  const constraint = classifyTransferRpcResult({
    data: null,
    error: { code: '23505', message: 'unique violation' },
  });

  assert.equal(authorization.kind, 'definitive-failure');
  assert.equal(constraint.kind, 'definitive-failure');
});

test('transport, timeout, aborted, and message-only errors default to indeterminate', () => {
  const errors = [
    { code: '', message: 'TypeError: Failed to fetch' },
    { code: 'PGRST000', message: 'Database connection failed' },
    { code: 'ABORT_ERR', message: 'request aborted' },
    { message: 'permission denied after request' },
  ];

  for (const error of errors) {
    const outcome = classifyTransferRpcResult({ data: null, error });
    assert.equal(outcome.kind, 'indeterminate');
    assert.equal(outcome.error.code, 'ASSIGNMENT_TRANSFER_INDETERMINATE');
    assert.doesNotMatch(outcome.error.message, /Failed to fetch|permission denied|request aborted/);
  }
});

test('empty and malformed successful responses are indeterminate possibly-committed outcomes', () => {
  const empty = classifyTransferRpcResult({ data: [], error: null });
  const malformed = classifyTransferRpcResult({
    data: [{ ...validRow, new_user_id: '' }],
    error: null,
  });

  assert.equal(empty.kind, 'indeterminate');
  assert.equal(malformed.kind, 'indeterminate');
});

test('a complete RPC row is mapped as a confirmed outcome', () => {
  assert.deepEqual(classifyTransferRpcResult({ data: [validRow], error: null }), {
    kind: 'confirmed',
    data: {
      transferredPosition: 'VICE_PRESIDENT',
      previousUserId: '11111111-1111-4111-8111-111111111111',
      newUserId: '22222222-2222-4222-8222-222222222222',
      targetPreviousPosition: null,
      assignedBy: '33333333-3333-4333-8333-333333333333',
      assignedAt: '2026-08-22T10:00:00Z',
    },
  });
});

test('an unknown exception from the Supabase request is indeterminate and safe', async () => {
  const outcome = await executeTransferRpcRequest(async () => {
    throw new Error('socket secret');
  });

  assert.equal(outcome.kind, 'indeterminate');
  assert.equal(outcome.error.code, 'ASSIGNMENT_TRANSFER_INDETERMINATE');
  assert.doesNotMatch(outcome.error.message, /socket secret/);
});

async function coordinate(response) {
  const events = [];
  const result = await executeExecutiveTransfer({
    actor: { role: 'PRESIDENT' },
    target: { id: validRow.new_user_id, name: 'أحمد' },
    position: 'VICE_PRESIDENT',
    previousHolder: null,
    transfer: async () => classifyTransferRpcResult(response),
    gateAuthority: () => { events.push('gate'); },
    refreshDirectory: async () => { events.push('directory'); return { ok: true }; },
    reloadIdentity: async () => { events.push('identity'); return { ok: true }; },
  });
  return { events, result };
}

test('a classified PostgreSQL rollback preserves authority through the coordinator', async () => {
  const coordinated = await coordinate({
    data: null,
    error: { code: '42501', message: 'raw database detail' },
  });

  assert.deepEqual(coordinated.events, []);
  assert.equal(coordinated.result.ok, false);
  assert.doesNotMatch(coordinated.result.error, /raw database detail/);
});

test('transport, empty, and malformed RPC results all gate and reload through the coordinator', async () => {
  const responses = [
    { data: null, error: { code: '', message: 'Failed to fetch after commit' } },
    { data: [], error: null },
    { data: [{ ...validRow, assigned_at: '' }], error: null },
  ];

  for (const response of responses) {
    const coordinated = await coordinate(response);
    assert.deepEqual(coordinated.events, ['gate', 'identity']);
    assert.equal(coordinated.result.ok, false);
    assert.match(coordinated.result.error, /تعذر التأكد.*نقل المنصب/);
  }
});
