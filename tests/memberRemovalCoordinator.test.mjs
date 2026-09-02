import test from 'node:test';
import assert from 'node:assert/strict';

const { executeMemberRemoval } = await import('../src/domain/memberRemoval.ts');

const president = { epoch: 7, userId: '11111111-1111-4111-8111-111111111111', role: 'PRESIDENT' };
const targetUserId = '22222222-2222-4222-8222-222222222222';

test('confirmed removal refreshes the directory only while the exact president owner remains current', async () => {
  const events = [];
  const result = await executeMemberRemoval({
    actor: president,
    targetUserId,
    remove: async () => ({ ok: true, data: { userId: targetUserId, status: 'removed' } }),
    isOwnershipCurrent: () => true,
    refreshDirectory: async (canPublish) => {
      events.push(canPublish() ? 'published' : 'blocked');
      return { ok: true };
    },
  });
  assert.deepEqual(events, ['published']);
  assert.deepEqual(result, { ok: true });
});

test('account replacement after a committed removal blocks all directory publication', async () => {
  let current = true;
  const events = [];
  const result = await executeMemberRemoval({
    actor: president,
    targetUserId,
    remove: async () => {
      current = false;
      return { ok: true, data: { userId: targetUserId, status: 'removed' } };
    },
    isOwnershipCurrent: () => current,
    refreshDirectory: async () => {
      events.push('published');
      return { ok: true };
    },
  });
  assert.deepEqual(events, []);
  assert.equal(result.ok, true);
  assert.match(result.error, /تم طرد العضو.*تغيّر الحساب/);
});

test('account replacement during directory I/O makes its publish guard fail', async () => {
  let current = true;
  const events = [];
  const result = await executeMemberRemoval({
    actor: president,
    targetUserId,
    remove: async () => ({ ok: true, data: { userId: targetUserId, status: 'removed' } }),
    isOwnershipCurrent: () => current,
    refreshDirectory: async (canPublish) => {
      current = false;
      events.push(canPublish() ? 'published' : 'blocked');
      return { ok: false, error: 'stale owner' };
    },
  });
  assert.deepEqual(events, ['blocked']);
  assert.equal(result.ok, true);
  assert.match(result.error, /تم طرد العضو/);
});

test('non-president and self-removal requests never call the mutation', async () => {
  let calls = 0;
  const base = {
    targetUserId,
    remove: async () => { calls += 1; return { ok: true, data: { userId: targetUserId, status: 'removed' } }; },
    isOwnershipCurrent: () => true,
    refreshDirectory: async () => ({ ok: true }),
  };
  assert.equal((await executeMemberRemoval({ ...base, actor: { ...president, role: 'STUDENT' } })).ok, false);
  assert.equal((await executeMemberRemoval({ ...base, actor: president, targetUserId: president.userId })).ok, false);
  assert.equal(calls, 0);
});
