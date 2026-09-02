import test from 'node:test';
import assert from 'node:assert/strict';

const {
  canPublishOwnProfileOperationResult,
  createOwnProfileOperations,
} = await import('../src/domain/ownProfileOperations.ts');

const identity = {
  userId: '11111111-1111-4111-8111-111111111111',
  loginEmail: 'login@example.org',
  role: 'MEDIA_HEAD',
  ownership: { authEpoch: 7, userId: '11111111-1111-4111-8111-111111111111' },
};
const ok = (data) => ({ ok: true, data });
const fail = (code) => ({ ok: false, error: { code, message: 'raw service detail must not be shown' } });

function dependencies(overrides = {}) {
  return {
    getIdentity: () => identity,
    isOwnershipCurrent: () => true,
    updateProfile: async () => ok({}),
    uploadAvatar: async () => ok({ warnings: [] }),
    deleteAvatar: async () => ok({ warnings: [] }),
    changePassword: async () => ok({ userId: identity.userId }),
    refreshIdentity: async () => ({ ok: true }),
    ...overrides,
  };
}

test('profile mutation targets the confirmed UUID and refreshes only after service confirmation', async () => {
  const calls = [];
  const operations = createOwnProfileOperations(dependencies({
    updateProfile: async (userId, payload) => {
      calls.push(['update', userId, payload]);
      return ok({});
    },
    refreshIdentity: async (userId, role, ownership) => {
      calls.push(['refresh', userId, role, ownership]);
      return { ok: true };
    },
  }));

  const result = await operations.updateProfile({ name: 'أحمد', loginEmail: 'blocked@example.org' });

  assert.deepEqual(calls, [
    ['update', identity.userId, { name: 'أحمد' }],
    ['refresh', identity.userId, identity.role, identity.ownership],
  ]);
  assert.deepEqual(result, { ok: true, message: 'تم حفظ بيانات الملف الشخصي ومزامنتها.' });
});

test('failed profile/avatar services preserve confirmed display by skipping refresh', async () => {
  let refreshes = 0;
  const operations = createOwnProfileOperations(dependencies({
    updateProfile: async () => fail('PROFILE_UPDATE_FAILED'),
    uploadAvatar: async () => fail('AVATAR_UPLOAD_FAILED'),
    refreshIdentity: async () => {
      refreshes += 1;
      return { ok: true };
    },
  }));

  const profileResult = await operations.updateProfile({ name: 'لن يُنشر' });
  const avatarResult = await operations.uploadAvatar({ type: 'image/png', size: 50 });

  assert.equal(profileResult.ok, false);
  assert.equal(avatarResult.ok, false);
  assert.equal(profileResult.error.includes('raw service detail'), false);
  assert.equal(avatarResult.error.includes('raw service detail'), false);
  assert.equal(refreshes, 0);
});

test('superseded or failed confirmed refresh never reports synchronized success', async () => {
  const operations = createOwnProfileOperations(dependencies({
    refreshIdentity: async () => ({ ok: false, error: 'superseded' }),
  }));

  assert.deepEqual(await operations.updateProfile({ name: 'أحمد' }), {
    ok: false,
    error: 'تم الحفظ، لكن تعذر تأكيد مزامنة الملف. حدّث الصفحة قبل المتابعة.',
  });
});

test('avatar cleanup warnings are surfaced after confirmed refresh without failing the primary mutation', async () => {
  const operations = createOwnProfileOperations(dependencies({
    uploadAvatar: async () => ok({ warnings: [{ code: 'PREVIOUS_AVATAR_CLEANUP_FAILED' }] }),
  }));

  assert.deepEqual(await operations.uploadAvatar({ type: 'image/webp', size: 50 }), {
    ok: true,
    message: 'تم تحديث الصورة الشخصية ومزامنتها.',
    warning: 'تم تحديث الصورة، لكن تعذر تنظيف ملف صورة قديم. لن يؤثر ذلك في الصورة الحالية.',
  });
});

test('password change passes only the login email and in-memory password values then confirms identity', async () => {
  const calls = [];
  const operations = createOwnProfileOperations(dependencies({
    changePassword: async (...args) => {
      calls.push(['password', ...args]);
      return ok({ userId: identity.userId });
    },
    refreshIdentity: async (userId, role, ownership) => {
      calls.push(['refresh', userId, role, ownership]);
      return { ok: true };
    },
  }));

  const result = await operations.changePassword('current-secret', 'new-secret-123');

  assert.deepEqual(calls, [
    ['password', identity.loginEmail, 'current-secret', 'new-secret-123', identity.ownership],
    ['refresh', identity.userId, identity.role, identity.ownership],
  ]);
  assert.deepEqual(result, { ok: true, message: 'تم تغيير كلمة المرور بنجاح.' });
});

test('every operation fails closed when there is no confirmed UUID identity', async () => {
  const operations = createOwnProfileOperations(dependencies({ getIdentity: () => null }));
  assert.equal((await operations.updateProfile({ name: 'أحمد' })).ok, false);
  assert.equal((await operations.deleteAvatar()).ok, false);
  assert.equal((await operations.changePassword('old', 'new-password')).ok, false);
});

test('unexpected service exceptions become safe failures and do not start refresh', async () => {
  let refreshes = 0;
  const operations = createOwnProfileOperations(dependencies({
    updateProfile: async () => { throw new Error('network token=secret'); },
    refreshIdentity: async () => {
      refreshes += 1;
      return { ok: true };
    },
  }));

  const result = await operations.updateProfile({ name: 'أحمد' });
  assert.equal(result.ok, false);
  assert.equal(result.error.includes('token=secret'), false);
  assert.equal(refreshes, 0);
});

test('unexpected confirmed-refresh exceptions fail safely after the primary mutation', async () => {
  const operations = createOwnProfileOperations(dependencies({
    refreshIdentity: async () => { throw new Error('opaque refresh details'); },
  }));

  assert.deepEqual(await operations.deleteAvatar(), {
    ok: false,
    error: 'تم الحفظ، لكن تعذر تأكيد مزامنة الملف. حدّث الصفحة قبل المتابعة.',
  });
});

test('a pending account-A mutation cannot start refresh after account-B Auth ownership wins', async () => {
  let finishMutation;
  let ownershipCurrent = true;
  let refreshes = 0;
  const operations = createOwnProfileOperations(dependencies({
    updateProfile: () => new Promise((resolve) => { finishMutation = resolve; }),
    isOwnershipCurrent: (ownership, userId) => ownershipCurrent
      && ownership === identity.ownership
      && userId === identity.userId,
    refreshIdentity: async () => {
      refreshes += 1;
      return { ok: true };
    },
  }));

  const pending = operations.updateProfile({ name: 'حساب أ' });
  ownershipCurrent = false; // A newer exact Auth owner (account B) is now active.
  finishMutation(ok({}));

  assert.deepEqual(await pending, {
    ok: false,
    error: 'تم الحفظ، لكن تعذر تأكيد مزامنة الملف. حدّث الصفحة قبل المتابعة.',
  });
  assert.equal(refreshes, 0);
});

test('a password change completed for A cannot refresh or publish after account B wins', async () => {
  let finishPasswordChange;
  let ownershipCurrent = true;
  let refreshes = 0;
  const operations = createOwnProfileOperations(dependencies({
    changePassword: () => new Promise((resolve) => { finishPasswordChange = resolve; }),
    isOwnershipCurrent: () => ownershipCurrent,
    refreshIdentity: async () => {
      refreshes += 1;
      return { ok: true };
    },
  }));

  const pending = operations.changePassword('current-secret', 'new-secret-123');
  ownershipCurrent = false;
  finishPasswordChange(ok({ userId: identity.userId }));

  assert.deepEqual(await pending, {
    ok: false,
    error: 'تم الحفظ، لكن تعذر تأكيد مزامنة الملف. حدّث الصفحة قبل المتابعة.',
  });
  assert.equal(refreshes, 0);
  assert.equal(canPublishOwnProfileOperationResult({
    ownership: identity.ownership,
    activeUserId: '22222222-2222-4222-8222-222222222222',
    isAuthEpochCurrent: () => false,
  }), false);
});

test('stale result banners cannot mutate state after another account or newer same-user Auth owner wins', () => {
  const capturedOwnership = identity.ownership;
  const input = {
    ownership: capturedOwnership,
    activeUserId: identity.userId,
    isAuthEpochCurrent: () => true,
  };

  assert.equal(canPublishOwnProfileOperationResult(input), true);
  assert.equal(canPublishOwnProfileOperationResult({
    ...input,
    activeUserId: '22222222-2222-4222-8222-222222222222',
  }), false);
  assert.equal(canPublishOwnProfileOperationResult({
    ...input,
    isAuthEpochCurrent: () => false,
  }), false);
});
