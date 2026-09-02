import assert from 'node:assert/strict';
import test from 'node:test';

import { createApplicationEmailNotificationGateway } from '../src/domain/applicationEmailNotification.ts';

const notificationRow = {
  id: '11111111-1111-4111-8111-111111111111',
  application_id: 'signup_user-a',
  event_type: 'NEW_APPLICATION',
  delivery_status: 'FAILED',
  delivery_attempts: 2,
  delivery_last_error: 'RESEND_500',
  created_at: '2026-08-26T08:00:00.000Z',
  sent_at: null,
};

function fakeClient({ invokeData, invokeError = null, rows = [notificationRow], listError = null }) {
  const calls = [];
  return {
    calls,
    functions: {
      async invoke(name, options) {
        calls.push({ type: 'invoke', name, options });
        return { data: invokeData, error: invokeError };
      },
    },
    from(table) {
      calls.push({ type: 'from', table });
      return {
        select(columns) {
          calls.push({ type: 'select', columns });
          return {
            async order(column, options) {
              calls.push({ type: 'order', column, options });
              return { data: rows, error: listError };
            },
          };
        },
      };
    },
  };
}

test('invokes the application function with only application id and event type', async () => {
  const client = fakeClient({ invokeData: { ok: true, status: 'SENT' } });
  const gateway = createApplicationEmailNotificationGateway(client);
  const result = await gateway.send('signup_user-a', 'NEW_APPLICATION');
  assert.deepEqual(result, { ok: true, status: 'SENT' });
  assert.deepEqual(client.calls[0], {
    type: 'invoke',
    name: 'send-application-notification',
    options: { body: { applicationId: 'signup_user-a', eventType: 'NEW_APPLICATION' } },
  });
  assert.equal(JSON.stringify(client.calls).includes('recipient'), false);
  assert.equal(JSON.stringify(client.calls).includes('subject'), false);
  assert.equal(JSON.stringify(client.calls).includes('html'), false);
});

test('maps already-sent and failed invocation results without exposing raw errors', async () => {
  const already = createApplicationEmailNotificationGateway(fakeClient({
    invokeData: { ok: true, status: 'ALREADY_SENT', alreadySent: true },
  }));
  assert.deepEqual(await already.send('app-1', 'ACCEPTED'), { ok: true, status: 'ALREADY_SENT' });

  const failed = createApplicationEmailNotificationGateway(fakeClient({
    invokeData: null,
    invokeError: { message: 'Authorization Bearer secret-value' },
  }));
  assert.deepEqual(await failed.send('app-1', 'REJECTED'), {
    ok: false,
    status: 'PENDING',
    error: 'تعذر إرسال إشعار البريد حالياً.',
  });
});

test('loads and maps the president-visible outbox rows newest first', async () => {
  const client = fakeClient({ invokeData: null });
  const gateway = createApplicationEmailNotificationGateway(client);
  const rows = await gateway.list();
  assert.deepEqual(rows, [{
    id: notificationRow.id,
    applicationId: 'signup_user-a',
    eventType: 'NEW_APPLICATION',
    deliveryStatus: 'FAILED',
    deliveryAttempts: 2,
    deliveryLastError: 'RESEND_500',
    createdAt: '2026-08-26T08:00:00.000Z',
    sentAt: null,
  }]);
  assert.deepEqual(client.calls.at(-1), {
    type: 'order',
    column: 'created_at',
    options: { ascending: false },
  });
});

test('rejects invalid application ids and event types before invoking Supabase', async () => {
  const client = fakeClient({ invokeData: null });
  const gateway = createApplicationEmailNotificationGateway(client);
  assert.deepEqual(await gateway.send('', 'ACCEPTED'), {
    ok: false,
    status: 'PENDING',
    error: 'بيانات إشعار البريد غير صالحة.',
  });
  assert.deepEqual(await gateway.send('app-1', 'UNKNOWN'), {
    ok: false,
    status: 'PENDING',
    error: 'بيانات إشعار البريد غير صالحة.',
  });
  assert.equal(client.calls.length, 0);
});
