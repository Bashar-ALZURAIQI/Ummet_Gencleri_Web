import test from 'node:test';
import assert from 'node:assert/strict';

const { createMemberRemovalService } = await import('../src/domain/memberRemovalGateway.ts');

const targetUserId = '22222222-2222-4222-8222-222222222222';

test('member removal calls the president-only RPC and confirms the returned target and status', async () => {
  const calls = [];
  const service = createMemberRemovalService({
    async rpc(name, args) {
      calls.push([name, args]);
      return { data: [{ removed_user_id: targetUserId, membership_status: 'removed' }], error: null };
    },
  });
  const result = await service.remove(targetUserId);
  assert.deepEqual(calls, [['remove_member_membership', { target_user_id: targetUserId }]]);
  assert.deepEqual(result, { ok: true, data: { userId: targetUserId, status: 'removed' } });
});

test('empty, malformed, mismatched, and non-removed RPC rows never report success', async () => {
  const responses = [null, [], [{}],
    [{ removed_user_id: '33333333-3333-4333-8333-333333333333', membership_status: 'removed' }],
    [{ removed_user_id: targetUserId, membership_status: 'active' }]];
  for (const data of responses) {
    const result = await createMemberRemovalService({ rpc: async () => ({ data, error: null }) }).remove(targetUserId);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'MEMBER_REMOVAL_INVALID');
  }
});

test('database authorization failures are returned as safe service failures', async () => {
  const service = createMemberRemovalService({
    rpc: async () => ({ data: null, error: { code: '42501', message: 'internal database detail' } }),
  });
  const result = await service.remove(targetUserId);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, '42501');
  assert.doesNotMatch(result.error.message, /internal database detail/);
});

test('invalid UUIDs and thrown transport requests fail safely without fake confirmation', async () => {
  let calls = 0;
  const invalid = await createMemberRemovalService({
    rpc: async () => { calls += 1; return { data: null, error: null }; },
  }).remove('not-a-uuid');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'MEMBER_REMOVAL_TARGET_INVALID');
  assert.equal(calls, 0);

  const thrown = await createMemberRemovalService({
    rpc: async () => { throw new Error('private transport detail'); },
  }).remove(targetUserId);
  assert.equal(thrown.ok, false);
  assert.equal(thrown.error.code, 'MEMBER_REMOVAL_REQUEST_FAILED');
  assert.doesNotMatch(thrown.error.message, /private transport detail/);
});
