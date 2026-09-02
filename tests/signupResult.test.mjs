import test from 'node:test';
import assert from 'node:assert/strict';

const { classifySignupResult } = await import('../src/domain/signupResult.ts');

const realUser = {
  id: '11111111-1111-1111-1111-111111111111',
  identities: [{ id: 'identity-1', provider: 'email' }],
};

test('a real signup with a session is ready for confirmed identity loading', () => {
  assert.deepEqual(
    classifySignupResult({ user: realUser, session: { access_token: 'test-token' }, error: null }),
    { kind: 'signed-in', userId: realUser.id },
  );
});

test('a real signup without a session reports that email confirmation is required', () => {
  assert.deepEqual(
    classifySignupResult({ user: realUser, session: null, error: null }),
    { kind: 'confirmation-required', userId: realUser.id },
  );
});

test('an empty identities response is not reported as a new account or application', () => {
  assert.deepEqual(
    classifySignupResult({
      user: { id: 'obfuscated-user-id', identities: [] },
      session: null,
      error: null,
    }),
    { kind: 'existing-or-disguised' },
  );
});

test('a signup or database-trigger error remains a registration failure', () => {
  const error = new Error('Database error saving new user');
  assert.deepEqual(
    classifySignupResult({ user: null, session: null, error }),
    { kind: 'failure' },
  );
});
