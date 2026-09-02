import test from 'node:test';
import assert from 'node:assert/strict';

const lifecycle = await import('../src/domain/avatarLifecycle.ts');

const userId = '11111111-1111-4111-8111-111111111111';
const versionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const previousPath = `${userId}/avatar.webp`;
const nextPath = `${userId}/avatar-${versionId}.webp`;
const file = { type: 'image/webp', size: 2048, name: '../../user-controlled.gif' };
const ok = (data) => ({ ok: true, data });
const fail = (code, message) => ({ ok: false, error: { code, message } });

test('replace uploads a generated versioned path, confirms the profile, then removes the previous owned object', async () => {
  const operations = [];

  const result = await lifecycle.replaceAvatar({
    userId,
    file,
    previousPath,
    versionId,
    upload: async (path, uploadedFile, options) => {
      operations.push(['upload', path, uploadedFile.name, options]);
      return ok(undefined);
    },
    writeProfilePath: async (path) => {
      operations.push(['profile', path]);
      return ok({ avatar_path: path });
    },
    removeObject: async (path) => {
      operations.push(['remove', path]);
      return ok(undefined);
    },
  });

  assert.deepEqual(result, {
    ok: true,
    data: {
      path: nextPath,
      profile: { avatar_path: nextPath },
      warnings: [],
    },
  });
  assert.deepEqual(operations, [
    ['upload', nextPath, '../../user-controlled.gif', {
      upsert: false,
      contentType: 'image/webp',
      cacheControl: '3600',
    }],
    ['profile', nextPath],
    ['remove', previousPath],
  ]);
});

test('concurrent replacement conflict removes only the new object, never the observed previous object', async () => {
  const removed = [];
  const result = await lifecycle.replaceAvatar({
    userId,
    file,
    previousPath,
    versionId,
    upload: async () => ok(undefined),
    writeProfilePath: async () => fail('AVATAR_CONFLICT', 'avatar changed concurrently'),
    removeObject: async (path) => {
      removed.push(path);
      return ok(undefined);
    },
  });

  assert.deepEqual(result, fail('AVATAR_CONFLICT', 'avatar changed concurrently'));
  assert.deepEqual(removed, [nextPath]);
});

test('concurrent replacement reports new-object cleanup failure without deleting the observed object', async () => {
  const removed = [];
  const result = await lifecycle.replaceAvatar({
    userId,
    file,
    previousPath,
    versionId,
    upload: async () => ok(undefined),
    writeProfilePath: async () => fail('AVATAR_CONFLICT', 'avatar changed concurrently'),
    removeObject: async (path) => {
      removed.push(path);
      return fail('STORAGE_REMOVE_FAILED', 'rollback remove failed');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'AVATAR_CONFLICT');
  assert.match(result.error.details, /rollback remove failed/);
  assert.deepEqual(removed, [nextPath]);
});

test('replace returns a structured warning when previous-object cleanup fails after profile success', async () => {
  const result = await lifecycle.replaceAvatar({
    userId,
    file,
    previousPath,
    versionId,
    upload: async () => ok(undefined),
    writeProfilePath: async (path) => ok({ avatar_path: path }),
    removeObject: async () => fail('STORAGE_REMOVE_FAILED', 'old remove failed'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.warnings, [{
    code: 'PREVIOUS_AVATAR_CLEANUP_FAILED',
    message: 'The profile was updated, but the previous avatar object could not be removed.',
    details: 'old remove failed',
  }]);
});

test('upload-delete conflict leaves storage untouched when the profile CAS fails', async () => {
  const removed = [];
  const result = await lifecycle.deleteAvatar({
    userId,
    currentPath: previousPath,
    writeProfilePath: async () => fail('AVATAR_CONFLICT', 'avatar changed concurrently'),
    removeObject: async (path) => {
      removed.push(path);
      return ok(undefined);
    },
  });

  assert.deepEqual(result, fail('AVATAR_CONFLICT', 'avatar changed concurrently'));
  assert.deepEqual(removed, []);
});

test('delete clears the profile first and reports an orphan warning when object cleanup fails', async () => {
  const operations = [];
  const result = await lifecycle.deleteAvatar({
    userId,
    currentPath: previousPath,
    writeProfilePath: async (path) => {
      operations.push(['profile', path]);
      return ok({ avatar_path: path });
    },
    removeObject: async (path) => {
      operations.push(['remove', path]);
      return fail('STORAGE_REMOVE_FAILED', 'delete remove failed');
    },
  });

  assert.deepEqual(operations, [
    ['profile', null],
    ['remove', previousPath],
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    path: null,
    profile: { avatar_path: null },
    warnings: [{
      code: 'AVATAR_OBJECT_CLEANUP_FAILED',
      message: 'The profile was cleared, but the avatar object could not be removed.',
      details: 'delete remove failed',
    }],
  });
});
