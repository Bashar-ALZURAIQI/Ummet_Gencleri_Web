import test from 'node:test';
import assert from 'node:assert/strict';

const policy = await import('../src/domain/executiveProfileUpdatePolicy.ts').catch(() => ({}));

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';

test('an executive profile update targets only the authenticated owner UUID', () => {
  assert.equal(typeof policy.prepareOwnExecutiveProfileUpdate, 'function');

  assert.deepEqual(policy.prepareOwnExecutiveProfileUpdate({
    actorUserId: ownerId,
    targetUserId: ownerId,
    changes: {
      name: 'الاسم الدائم',
      email: 'contact@example.org',
      bio: 'نبذة',
      university: 'الجامعة',
      role: 'PRESIDENT',
      photo: 'https://example.org/untrusted-avatar.png',
    },
  }), {
    ok: true,
    data: {
      name: 'الاسم الدائم',
      contactEmail: 'contact@example.org',
      bio: 'نبذة',
      university: 'الجامعة',
    },
  });

  assert.deepEqual(policy.prepareOwnExecutiveProfileUpdate({
    actorUserId: ownerId,
    targetUserId: otherId,
    changes: { name: 'لا يجوز' },
  }), { ok: false, code: 'OWN_PROFILE_ONLY' });
});

test('an executive profile update rejects missing ownership instead of becoming a local-only edit', () => {
  assert.deepEqual(policy.prepareOwnExecutiveProfileUpdate({
    actorUserId: '',
    targetUserId: ownerId,
    changes: { name: 'لن يحفظ' },
  }), { ok: false, code: 'OWN_PROFILE_ONLY' });
});
