import assert from 'node:assert/strict';
import test from 'node:test';

import { createPushSubscriptionGateway } from '../src/domain/pushSubscriptionGateway.ts';

const subscription = {
  endpoint: 'https://push.example.test/subscriptions/device-1',
  expirationTime: null,
  keys: { p256dh: 'abc_DEF-123', auth: 'xyz_987-ABC' },
};

const fakeClient = (responses) => {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return responses.shift();
    },
  };
};

test('registers a subscription without accepting or sending a browser user id', async () => {
  const client = fakeClient([{
    data: {
      id: '1fbfded0-9cbc-4a30-a720-e91bde784b23',
      user_id: 'ab35a412-37f6-433d-b916-b6ed27a14fca',
      is_active: true,
      updated_at: '2026-08-26T18:00:00Z',
    },
    error: null,
  }]);
  const gateway = createPushSubscriptionGateway(client);
  const result = await gateway.register(
    { ...subscription, endpoint: `  ${subscription.endpoint}  ` },
    ' Test Browser ',
  );
  assert.deepEqual(client.calls, [{
    name: 'register_accepted_student_push_subscription',
    args: {
      p_endpoint: subscription.endpoint,
      p_p256dh: 'abc_DEF-123',
      p_auth_key: 'xyz_987-ABC',
      p_user_agent: 'Test Browser',
    },
  }]);
  assert.deepEqual(result, {
    ok: true,
    data: {
      id: '1fbfded0-9cbc-4a30-a720-e91bde784b23',
      userId: 'ab35a412-37f6-433d-b916-b6ed27a14fca',
      isActive: true,
      updatedAt: '2026-08-26T18:00:00Z',
    },
  });
});

test('rejects empty subscription values before making an RPC', async () => {
  const client = fakeClient([]);
  const gateway = createPushSubscriptionGateway(client);
  const result = await gateway.register({
    ...subscription,
    keys: { p256dh: '', auth: subscription.keys.auth },
  }, 'browser');
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'PUSH_SUBSCRIPTION_INVALID', message: 'بيانات اشتراك الإشعارات غير مكتملة.' },
  });
  assert.equal(client.calls.length, 0);
});

test('preserves a Supabase authorization error without exposing raw payloads', async () => {
  const client = fakeClient([{
    data: null,
    error: { code: '42501', message: 'Only accepted students may subscribe', details: 'not accepted' },
  }]);
  const result = await createPushSubscriptionGateway(client).register(subscription, 'browser');
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: '42501',
      message: 'تعذر حفظ اشتراك الإشعارات.',
      details: 'not accepted',
    },
  });
});

test('rejects an invalid success row returned by the server', async () => {
  const client = fakeClient([{ data: { id: 'bad', is_active: true }, error: null }]);
  const result = await createPushSubscriptionGateway(client).register(subscription, 'browser');
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'PUSH_SUBSCRIPTION_RESPONSE_INVALID',
      message: 'أعاد الخادم نتيجة غير صالحة لاشتراك الإشعارات.',
    },
  });
});

test('disables only the endpoint provided by the current browser', async () => {
  const client = fakeClient([{ data: true, error: null }]);
  const gateway = createPushSubscriptionGateway(client);
  const result = await gateway.disable(` ${subscription.endpoint} `);
  assert.deepEqual(client.calls, [{
    name: 'disable_own_push_subscription',
    args: { p_endpoint: subscription.endpoint },
  }]);
  assert.deepEqual(result, { ok: true, data: null });
});

test('does not call the disable RPC for an empty endpoint', async () => {
  const client = fakeClient([]);
  const result = await createPushSubscriptionGateway(client).disable('   ');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PUSH_SUBSCRIPTION_INVALID');
  assert.equal(client.calls.length, 0);
});
