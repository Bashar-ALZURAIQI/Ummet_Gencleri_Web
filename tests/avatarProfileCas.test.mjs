import test from 'node:test';
import assert from 'node:assert/strict';

const {
  AVATAR_PROFILE_SELECT_COLUMNS,
  createAvatarProfileRepository,
} = await import('../src/domain/avatarProfileRepository.ts');

function createClient(response) {
  const operations = [];
  const query = {
    update(values) {
      operations.push(['update', values]);
      return this;
    },
    select(columns) {
      operations.push(['select', columns]);
      return this;
    },
    eq(column, value) {
      operations.push(['eq', column, value]);
      return this;
    },
    is(column, value) {
      operations.push(['is', column, value]);
      return this;
    },
    maybeSingle() {
      operations.push(['maybeSingle']);
      return Promise.resolve(response);
    },
  };

  return {
    operations,
    client: {
      from(table) {
        operations.push(['from', table]);
        return query;
      },
    },
  };
}

const userId = '11111111-1111-4111-8111-111111111111';
const previousPath = `${userId}/avatar-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
const nextPath = `${userId}/avatar-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;

test('replacement CAS matches the observed path and reports a concurrent-change conflict on zero rows', async () => {
  const fake = createClient({ data: null, error: null });
  const repository = createAvatarProfileRepository(fake.client);

  const result = await repository.compareAndSetAvatarPath(userId, previousPath, nextPath);

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'AVATAR_CONFLICT',
      message: 'The avatar changed before this operation could be confirmed.',
    },
  });
  assert.deepEqual(fake.operations, [
    ['from', 'profiles'],
    ['update', { avatar_path: nextPath }],
    ['eq', 'id', userId],
    ['eq', 'avatar_path', previousPath],
    ['select', AVATAR_PROFILE_SELECT_COLUMNS],
    ['maybeSingle'],
  ]);
});

test('initial upload CAS uses IS NULL and returns the confirmed profile row', async () => {
  const profile = { id: userId, avatar_path: nextPath, updated_at: '2026-08-22T12:00:00Z' };
  const fake = createClient({ data: profile, error: null });
  const repository = createAvatarProfileRepository(fake.client);

  const result = await repository.compareAndSetAvatarPath(userId, null, nextPath);

  assert.deepEqual(result, { ok: true, data: profile });
  assert.deepEqual(fake.operations, [
    ['from', 'profiles'],
    ['update', { avatar_path: nextPath }],
    ['eq', 'id', userId],
    ['is', 'avatar_path', null],
    ['select', AVATAR_PROFILE_SELECT_COLUMNS],
    ['maybeSingle'],
  ]);
});

test('delete CAS matches the observed current path and conflicts before storage deletion', async () => {
  const fake = createClient({ data: null, error: null });
  const repository = createAvatarProfileRepository(fake.client);

  const result = await repository.compareAndSetAvatarPath(userId, previousPath, null);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'AVATAR_CONFLICT');
  assert.deepEqual(fake.operations, [
    ['from', 'profiles'],
    ['update', { avatar_path: null }],
    ['eq', 'id', userId],
    ['eq', 'avatar_path', previousPath],
    ['select', AVATAR_PROFILE_SELECT_COLUMNS],
    ['maybeSingle'],
  ]);
});
