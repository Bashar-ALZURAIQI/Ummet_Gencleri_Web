import assert from 'node:assert/strict';
import test from 'node:test';

import { createSendWebPushHandler } from '../supabase/functions/send-web-push/handler.ts';

const notification = {
  id: 'notification-1',
  kind: 'NEWS',
  source_event_key: 'cms:news:n1',
  title: 'جديد اتحاد شباب الأمة: خبر',
  body: 'تم نشر خبر جديد في موقع الاتحاد.',
  destination: '/?push=news',
  status: 'PENDING',
};

const subscription = {
  id: 'subscription-1',
  user_id: 'user-1',
  endpoint: 'https://push.example.test/device-1',
  p256dh: 'p256dh_value',
  auth_key: 'auth_value',
};

function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    expectedSecret: 'webhook-secret-value',
    async loadNotification(id) { calls.push(['loadNotification', id]); return notification; },
    async claimNotification(id) { calls.push(['claimNotification', id]); return true; },
    async listEligibleSubscriptions(notificationId) { calls.push(['listEligibleSubscriptions', notificationId]); return [subscription]; },
    async ensureDeliveries(id, subscriptions) { calls.push(['ensureDeliveries', id, subscriptions.length]); },
    async listRetryableDeliveries(id) {
      calls.push(['listRetryableDeliveries', id]);
      return [{ id: 'delivery-1', status: 'PENDING', attempts: 0, subscription }];
    },
    async claimDelivery(id) { calls.push(['claimDelivery', id]); return true; },
    async wait(ms) { calls.push(['wait', ms]); },
    async send(subscriptionValue, payload) { calls.push(['send', subscriptionValue.id, payload.tag]); },
    async markDeliverySent(id) { calls.push(['markDeliverySent', id]); },
    async markDeliveryFailed(id, failure) { calls.push(['markDeliveryFailed', id, failure.kind]); },
    async deactivateSubscription(id) { calls.push(['deactivateSubscription', id]); },
    async finalizeNotification(id) {
      calls.push(['finalizeNotification', id]);
      return { sent: 1, failed: 0, pending: 0, expired: 0 };
    },
    ...overrides,
  };
}

const webhookRequest = (secret = 'webhook-secret-value', body = {
  type: 'INSERT',
  table: 'push_notifications',
  schema: 'public',
  record: { id: 'notification-1' },
}) => new Request('https://functions.test/send-web-push', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-push-webhook-secret': secret },
  body: JSON.stringify(body),
});

test('rejects a missing or incorrect webhook secret before loading database data', async () => {
  const deps = dependencies();
  const handler = createSendWebPushHandler(deps);
  assert.equal((await handler(webhookRequest('wrong'))).status, 401);
  assert.equal(deps.calls.length, 0);
});

test('rejects malformed webhook payloads', async () => {
  const response = await createSendWebPushHandler(dependencies())(webhookRequest('webhook-secret-value', { record: {} }));
  assert.equal(response.status, 400);
});

test('returns 404 for an unknown authoritative notification', async () => {
  const deps = dependencies({ async loadNotification() { return null; } });
  assert.equal((await createSendWebPushHandler(deps)(webhookRequest())).status, 404);
});

test('a failed conditional claim prevents duplicate workers from sending', async () => {
  const deps = dependencies({ async claimNotification() { return false; } });
  const response = await createSendWebPushHandler(deps)(webhookRequest());
  assert.equal(response.status, 202);
  assert.equal(deps.calls.some((call) => call[0] === 'send'), false);
});

test('sends each claimed delivery and returns aggregate counts without subscription secrets', async () => {
  const deps = dependencies();
  const response = await createSendWebPushHandler(deps)(webhookRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    notificationId: 'notification-1',
    sent: 1,
    failed: 0,
    pending: 0,
    expired: 0,
  });
  assert.equal(JSON.stringify(body).includes('endpoint'), false);
  assert.equal(deps.calls.some((call) => call[0] === 'markDeliverySent'), true);
});

test('deactivates expired subscriptions and records the failed delivery', async () => {
  const error = Object.assign(new Error('gone'), { statusCode: 410 });
  const deps = dependencies({
    async send() { throw error; },
    async finalizeNotification(id) {
      this?.calls?.push?.(['finalizeNotification', id]);
      return { sent: 0, failed: 1, pending: 0, expired: 1 };
    },
  });
  const response = await createSendWebPushHandler(deps)(webhookRequest());
  assert.equal(response.status, 200);
  assert.equal(deps.calls.some((call) => call[0] === 'deactivateSubscription' && call[1] === 'subscription-1'), true);
  assert.equal(deps.calls.some((call) => call[0] === 'markDeliveryFailed' && call[2] === 'expired'), true);
});

test('retries transient provider failures twice before recording a successful delivery', async () => {
  let attempts = 0;
  const deps = dependencies({
    async send(subscriptionValue, payload) {
      this?.calls?.push?.(['send', subscriptionValue.id, payload.tag]);
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error('temporary provider failure'), { statusCode: 503 });
    },
  });

  const response = await createSendWebPushHandler(deps)(webhookRequest());

  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
  assert.deepEqual(deps.calls.filter((call) => call[0] === 'wait').map((call) => call[1]), [250, 500]);
  assert.equal(deps.calls.some((call) => call[0] === 'markDeliverySent'), true);
  assert.equal(deps.calls.some((call) => call[0] === 'markDeliveryFailed'), false);
});

test('does not retry an expired subscription response', async () => {
  let attempts = 0;
  const deps = dependencies({
    async send() {
      attempts += 1;
      throw Object.assign(new Error('gone'), { statusCode: 410 });
    },
    async finalizeNotification() {
      return { sent: 0, failed: 1, pending: 0, expired: 1 };
    },
  });

  await createSendWebPushHandler(deps)(webhookRequest());

  assert.equal(attempts, 1);
  assert.equal(deps.calls.some((call) => call[0] === 'wait'), false);
});
