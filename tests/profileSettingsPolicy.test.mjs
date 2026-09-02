import test from 'node:test';
import assert from 'node:assert/strict';

const policy = await import('../src/domain/profileSettingsPolicy.ts');

test('builds only editable profile fields and excludes identity, authority, and avatar fields', () => {
  assert.deepEqual(policy.buildProfileUpdatePayload({
    userId: 'attacker-id',
    loginEmail: 'changed-login@example.org',
    email: 'legacy@example.org',
    role: 'PRESIDENT',
    committee: 'presidency',
    avatarPath: 'attacker/avatar.webp',
    photo: 'blob:preview',
    status: 'active',
    name: '  أحمد علي  ',
    contactEmail: '  ahmad@example.org  ',
    phone: '  +90 555 000 0000  ',
    university: '  جامعة المثال  ',
    major: '  هندسة  ',
    year: '  السنة الثالثة  ',
    bio: '  نبذة قصيرة  ',
  }), {
    name: 'أحمد علي',
    contactEmail: 'ahmad@example.org',
    phone: '+90 555 000 0000',
    university: 'جامعة المثال',
    major: 'هندسة',
    year: 'السنة الثالثة',
    bio: 'نبذة قصيرة',
  });
});

test('validates optional contact email without treating the login email as editable', () => {
  assert.deepEqual(policy.validateContactEmail(''), { ok: true });
  assert.deepEqual(policy.validateContactEmail('contact@example.org'), { ok: true });
  assert.deepEqual(policy.validateContactEmail('not-an-email'), {
    ok: false,
    error: 'يرجى إدخال بريد تواصل صالح.',
  });
});

test('requires current password, eight-character new password, and matching confirmation', () => {
  assert.deepEqual(policy.validatePasswordChange('', 'abcdefgh', 'abcdefgh'), {
    ok: false,
    error: 'يرجى إدخال كلمة المرور الحالية.',
  });
  assert.deepEqual(policy.validatePasswordChange('old-pass', 'short', 'short'), {
    ok: false,
    error: 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف.',
  });
  assert.deepEqual(policy.validatePasswordChange('old-pass', 'abcdefgh', 'different'), {
    ok: false,
    error: 'تأكيد كلمة المرور الجديدة غير مطابق.',
  });
  assert.deepEqual(policy.validatePasswordChange('old-pass', 'abcdefgh', 'abcdefgh'), { ok: true });
});

test('maps avatar MIME and size validation to safe Arabic messages', () => {
  assert.deepEqual(policy.validateProfileAvatar({ type: 'image/gif', size: 100 }), {
    ok: false,
    error: 'صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.',
  });
  assert.deepEqual(policy.validateProfileAvatar({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), {
    ok: false,
    error: 'حجم الصورة أكبر من 5 ميجابايت.',
  });
  assert.deepEqual(policy.validateProfileAvatar({ type: 'image/webp', size: 5 * 1024 * 1024 }), { ok: true });
});
