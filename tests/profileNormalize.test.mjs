import test from 'node:test';
import assert from 'node:assert/strict';

const { EMPTY_PROFILE, normalizeProfile } = await import('../src/utils/profileNormalize.ts');

test('normalizes confirmed identity fields without confusing login and contact email', () => {
  assert.deepEqual(normalizeProfile({
    name: '  أحمد  ',
    email: 'legacy@example.org',
    loginEmail: 'login@example.org',
    contactEmail: 'contact@example.org',
    bio: 'نبذة',
    photo: 'https://cdn.example.org/avatar.webp',
    avatarPath: '11111111-1111-4111-8111-111111111111/avatar.webp',
    updatedAt: '2026-08-22T10:00:00Z',
    major: 'الهندسة',
    year: 'السنة الثالثة',
  }), {
    ...EMPTY_PROFILE,
    name: '  أحمد  ',
    email: 'legacy@example.org',
    loginEmail: 'login@example.org',
    contactEmail: 'contact@example.org',
    bio: 'نبذة',
    photo: 'https://cdn.example.org/avatar.webp',
    avatarPath: '11111111-1111-4111-8111-111111111111/avatar.webp',
    updatedAt: '2026-08-22T10:00:00Z',
    department: 'الهندسة',
    academicYear: 'السنة الثالثة',
  });
});

test('uses explicit legacy aliases only for display and never turns contact email into login email', () => {
  const profile = normalizeProfile({
    email: 'legacy-login@example.org',
    contactEmail: 'contact@example.org',
    department: 'العلوم',
    academicYear: 'الرابعة',
    photo: '/legacy/photo.webp',
  });

  assert.equal(profile.loginEmail, 'legacy-login@example.org');
  assert.equal(profile.contactEmail, 'contact@example.org');
  assert.equal(profile.department, 'العلوم');
  assert.equal(profile.academicYear, 'الرابعة');
  assert.equal(profile.photo, '/legacy/photo.webp');
  assert.equal(profile.avatarPath, '');
});

test('returns safe empty strings for missing, null, and corrupt profile values', () => {
  assert.deepEqual(normalizeProfile(null), EMPTY_PROFILE);
  const corrupt = normalizeProfile({
    loginEmail: null,
    contactEmail: undefined,
    bio: null,
    photo: null,
    avatarPath: undefined,
    updatedAt: null,
  });
  assert.equal(corrupt.loginEmail, '');
  assert.equal(corrupt.contactEmail, '');
  assert.equal(corrupt.bio, '');
  assert.equal(corrupt.photo, '');
  assert.equal(corrupt.avatarPath, '');
  assert.equal(corrupt.updatedAt, '');
});
