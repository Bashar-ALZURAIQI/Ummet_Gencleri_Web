import test from 'node:test';
import assert from 'node:assert/strict';

const avatar = await import('../src/domain/userAvatarPolicy.ts');

test('uses safe preview/public URLs directly and resolves a validated storage path once', () => {
  const resolutions = [];
  const resolvePath = (path, updatedAt) => {
    resolutions.push([path, updatedAt]);
    return `https://project.supabase.co/storage/${path}?v=${updatedAt}`;
  };

  assert.equal(avatar.resolveUserAvatarSource({ photo: 'blob:local-preview', avatarPath: 'ignored' }, resolvePath), 'blob:local-preview');
  assert.equal(avatar.resolveUserAvatarSource({ photo: 'https://cdn.example.org/legacy.webp', avatarPath: 'ignored' }, resolvePath), 'https://cdn.example.org/legacy.webp');
  assert.equal(avatar.resolveUserAvatarSource({
    avatarPath: '11111111-1111-4111-8111-111111111111/avatar-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
    updatedAt: '2026-08-22T10:00:00Z',
  }, resolvePath), 'https://project.supabase.co/storage/11111111-1111-4111-8111-111111111111/avatar-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp?v=2026-08-22T10:00:00Z');
  assert.deepEqual(resolutions, [[
    '11111111-1111-4111-8111-111111111111/avatar-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
    '2026-08-22T10:00:00Z',
  ]]);
});

test('rejects unsafe sources and derives an Arabic alt plus first non-space fallback', () => {
  assert.equal(avatar.resolveUserAvatarSource({ photo: 'javascript:alert(1)' }, () => 'never'), null);
  assert.equal(avatar.resolveUserAvatarSource({ avatarPath: '../../secret' }, () => 'never'), null);
  assert.equal(avatar.avatarFallbackInitial('   بشار الزريقي'), 'ب');
  assert.equal(avatar.avatarFallbackInitial(''), '؟');
  assert.equal(avatar.avatarAltText(' بشار الزريقي '), 'صورة بشار الزريقي');
  assert.equal(avatar.avatarAltText(''), 'صورة المستخدم');
});
