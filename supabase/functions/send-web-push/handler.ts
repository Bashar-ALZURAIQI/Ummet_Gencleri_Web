import {
  buildPushPayload,
  classifyPushFailure,
  safeSecretEqual,
  sanitizePushError,
  type PushFailure,
  type PushNotificationLike,
  type PushPayload,
} from './delivery.ts';

export interface EligiblePushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

export interface PushDeliveryRow {
  id: string;
  status: string;
  attempts: number;
  subscription: EligiblePushSubscription;
}

export interface PushDeliverySummary {
  sent: number;
  failed: number;
  pending: number;
  expired: number;
}

export interface SendWebPushDependencies {
  expectedSecret: string;
  loadNotification(id: string): Promise<(PushNotificationLike & { status: string }) | null>;
  claimNotification(id: string): Promise<boolean>;
  listEligibleSubscriptions(notificationId: string): Promise<EligiblePushSubscription[]>;
  ensureDeliveries(notificationId: string, subscriptions: EligiblePushSubscription[]): Promise<void>;
  listRetryableDeliveries(notificationId: string): Promise<PushDeliveryRow[]>;
  claimDelivery(deliveryId: string): Promise<boolean>;
  wait(milliseconds: number): Promise<void>;
  send(subscription: EligiblePushSubscription, payload: PushPayload): Promise<void>;
  markDeliverySent(deliveryId: string): Promise<void>;
  markDeliveryFailed(deliveryId: string, failure: PushFailure, error: string): Promise<void>;
  deactivateSubscription(subscriptionId: string): Promise<void>;
  finalizeNotification(notificationId: string): Promise<PushDeliverySummary>;
}

const json = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

const notificationIdFromWebhook = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (body.type !== 'INSERT' || body.table !== 'push_notifications' || body.schema !== 'public') return null;
  if (!body.record || typeof body.record !== 'object') return null;
  const id = (body.record as Record<string, unknown>).id;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : null;
};

export function createSendWebPushHandler(deps: SendWebPushDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
    const suppliedSecret = request.headers.get('x-push-webhook-secret') ?? '';
    if (!safeSecretEqual(suppliedSecret, deps.expectedSecret)) {
      return json(401, { error: 'WEBHOOK_AUTHENTICATION_REQUIRED' });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'INVALID_JSON' });
    }
    const notificationId = notificationIdFromWebhook(body);
    if (!notificationId) return json(400, { error: 'VALID_PUSH_WEBHOOK_REQUIRED' });

    const notification = await deps.loadNotification(notificationId);
    if (!notification) return json(404, { error: 'PUSH_NOTIFICATION_NOT_FOUND' });
    if (notification.status === 'SENT') {
      return json(200, { ok: true, notificationId, alreadySent: true });
    }
    if (!await deps.claimNotification(notificationId)) {
      return json(202, { ok: true, notificationId, status: 'PROCESSING' });
    }

    let payload: PushPayload;
    try {
      payload = buildPushPayload(notification);
    } catch {
      return json(500, { error: 'PUSH_NOTIFICATION_INVALID' });
    }

    const subscriptions = await deps.listEligibleSubscriptions(notificationId);
    await deps.ensureDeliveries(notificationId, subscriptions);
    const deliveries = await deps.listRetryableDeliveries(notificationId);

    for (const delivery of deliveries) {
      if (!await deps.claimDelivery(delivery.id)) continue;
      let deliverySucceeded = false;
      let terminalError: unknown;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await deps.send(delivery.subscription, payload);
          deliverySucceeded = true;
          break;
        } catch (error) {
          terminalError = error;
          const failure = classifyPushFailure(error);
          if (failure.kind !== 'retryable' || attempt === 2) break;
          await deps.wait(250 * (2 ** attempt));
        }
      }

      if (deliverySucceeded) {
        await deps.markDeliverySent(delivery.id);
        continue;
      }

      const failure = classifyPushFailure(terminalError);
      await deps.markDeliveryFailed(delivery.id, failure, sanitizePushError(terminalError));
      if (failure.kind === 'expired') {
        await deps.deactivateSubscription(delivery.subscription.id);
      }
    }

    const summary = await deps.finalizeNotification(notificationId);
    return json(200, { ok: true, notificationId, ...summary });
  };
}
