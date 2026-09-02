import test from 'node:test';
import assert from 'node:assert/strict';

const { createIsolatedAuthClient } = await import('../src/domain/isolatedAuthClient.ts');
const { executePasswordChange } = await import('../src/domain/passwordChange.ts');

const userId = '11111111-1111-4111-8111-111111111111';
const loginEmail = 'login@example.org';
const mainSession = { user: { id: userId, email: loginEmail }, access_token: 'not-logged' };

test('isolated password verification disables persistence, URL detection, and auto refresh', () => {
  let creation = null;
  const expectedClient = { auth: {} };
  const client = createIsolatedAuthClient(
    (url, key, options) => { creation = { url, key, options }; return expectedClient; },
    'https://project.supabase.co',
    'public-anon-key',
  );

  assert.equal(client, expectedClient);
  assert.deepEqual(creation, {
    url: 'https://project.supabase.co',
    key: 'public-anon-key',
    options: {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  });
});

function setup(overrides = {}) {
  const order = [];
  let currentMainSession = mainSession;
  const mainClient = {
    auth: {
      getSession: async () => ({ data: { session: currentMainSession }, error: null }),
    },
  };
  const verificationClient = {
    auth: {
      signInWithPassword: async () => {
        order.push('isolated-sign-in');
        return { data: { user: { id: userId }, session: { user: { id: userId } } }, error: null };
      },
      updateUser: async () => {
        order.push('isolated-update');
        return { data: { user: { id: userId } }, error: null };
      },
      signOut: async (options) => { order.push(['isolated-sign-out', options]); return { error: null }; },
    },
  };
  const input = {
    loginEmail,
    expectedUserId: userId,
    currentPassword: 'current-secret',
    newPassword: 'new-secret-123',
    mainClient,
    createVerificationClient: () => verificationClient,
    ...overrides,
  };
  return {
    input,
    mainClient,
    verificationClient,
    order,
    replaceMainSession: (session) => { currentMainSession = session; },
  };
}

test('password success verifies and updates on the same isolated session then cleans it', async () => {
  const state = setup();
  const result = await executePasswordChange(state.input);

  assert.deepEqual(result, { ok: true, userId });
  assert.deepEqual(state.order, [
    'isolated-sign-in',
    'isolated-update',
    ['isolated-sign-out', { scope: 'local' }],
  ]);
  assert.equal('signInWithPassword' in state.mainClient.auth, false);
  assert.equal('updateUser' in state.mainClient.auth, false);
});

test('wrong current password never calls isolated update and still cleans the isolated client', async () => {
  let isolatedUpdates = 0;
  const state = setup();
  state.verificationClient.auth.signInWithPassword = async () => ({
    data: { user: null, session: null }, error: { code: 'invalid_credentials' },
  });
  state.verificationClient.auth.updateUser = async () => { isolatedUpdates += 1; throw new Error('must not run'); };

  assert.deepEqual(await executePasswordChange(state.input), { ok: false, code: 'CURRENT_PASSWORD_INVALID' });
  assert.equal(isolatedUpdates, 0);
  assert.deepEqual(state.order.at(-1), ['isolated-sign-out', { scope: 'local' }]);
});

test('different isolated UUID never calls isolated update', async () => {
  let isolatedUpdates = 0;
  const state = setup();
  state.verificationClient.auth.signInWithPassword = async () => ({
    data: {
      user: { id: '22222222-2222-4222-8222-222222222222' },
      session: { user: { id: '22222222-2222-4222-8222-222222222222' } },
    },
    error: null,
  });
  state.verificationClient.auth.updateUser = async () => { isolatedUpdates += 1; throw new Error('must not run'); };

  assert.deepEqual(await executePasswordChange(state.input), { ok: false, code: 'REAUTHENTICATED_USER_MISMATCH' });
  assert.equal(isolatedUpdates, 0);
});

test('an inconsistent isolated session UUID never calls isolated update', async () => {
  let isolatedUpdates = 0;
  const state = setup();
  state.verificationClient.auth.signInWithPassword = async () => ({
    data: {
      user: { id: userId },
      session: { user: { id: '22222222-2222-4222-8222-222222222222' } },
    },
    error: null,
  });
  state.verificationClient.auth.updateUser = async () => { isolatedUpdates += 1; throw new Error('must not run'); };

  assert.deepEqual(await executePasswordChange(state.input), { ok: false, code: 'REAUTHENTICATED_USER_MISMATCH' });
  assert.equal(isolatedUpdates, 0);
});

for (const failure of ['error', 'throw']) {
  test(`isolated update ${failure} fails safely and cleans the isolated session`, async () => {
    const state = setup();
    state.verificationClient.auth.updateUser = failure === 'error'
      ? async () => ({ data: { user: null }, error: { code: 'update_failed' } })
      : async () => { throw new Error('opaque update failure'); };

    assert.deepEqual(await executePasswordChange(state.input), { ok: false, code: 'PASSWORD_UPDATE_FAILED' });
    assert.deepEqual(state.order.at(-1), ['isolated-sign-out', { scope: 'local' }]);
  });
}

test('main account replacement cannot redirect an in-flight isolated A password update to B', async () => {
  let finishUpdate;
  let markUpdateStarted;
  const updateStarted = new Promise((resolve) => { markUpdateStarted = resolve; });
  const state = setup();
  state.verificationClient.auth.updateUser = () => new Promise((resolve) => {
    state.order.push('isolated-update');
    finishUpdate = resolve;
    markUpdateStarted();
  });

  const pending = executePasswordChange(state.input);
  await updateStarted;
  state.replaceMainSession({
    user: { id: '22222222-2222-4222-8222-222222222222', email: 'b@example.org' },
  });
  finishUpdate({ data: { user: { id: userId } }, error: null });

  assert.deepEqual(await pending, { ok: true, userId });
  assert.equal('updateUser' in state.mainClient.auth, false);
  assert.deepEqual(state.order, [
    'isolated-sign-in',
    'isolated-update',
    ['isolated-sign-out', { scope: 'local' }],
  ]);
});

test('starting main session must match both the expected atomic UUID and login email', async () => {
  let isolatedSignIns = 0;
  const state = setup({ expectedUserId: '22222222-2222-4222-8222-222222222222' });
  state.verificationClient.auth.signInWithPassword = async () => { isolatedSignIns += 1; throw new Error('must not run'); };

  assert.deepEqual(await executePasswordChange(state.input), { ok: false, code: 'SESSION_OWNER_MISMATCH' });
  assert.equal(isolatedSignIns, 0);
});

test('isolated update returning a different UUID fails', async () => {
  const state = setup();
  state.verificationClient.auth.updateUser = async () => ({
    data: { user: { id: '22222222-2222-4222-8222-222222222222' } }, error: null,
  });

  assert.deepEqual(await executePasswordChange(state.input), { ok: false, code: 'PASSWORD_UPDATE_FAILED' });
});
