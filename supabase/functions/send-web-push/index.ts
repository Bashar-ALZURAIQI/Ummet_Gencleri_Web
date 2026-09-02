import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';
import { createSendWebPushHandler, type EligiblePushSubscription } from './handler.ts';
import { classifyPushFailure, sanitizePushError, type PushFailure, type PushPayload } from './delivery.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? '';
const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

const notificationColumns = [
  'id', 'kind', 'source_event_key', 'title', 'body', 'destination', 'status',
].join(',');

const repository = {
  expectedSecret: webhookSecret,

  async loadNotification(id: string) {
    const { data, error } = await admin
      .from('push_notifications')
      .select(notificationColumns)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`PUSH_NOTIFICATION_LOOKUP_FAILED:${sanitizePushError(error.message)}`);
    return data;
  },

  async claimNotification(id: string) {
    const { data, error } = await admin.rpc('claim_push_notification', { p_notification_id: id });
    if (error) throw new Error(`PUSH_NOTIFICATION_CLAIM_FAILED:${sanitizePushError(error.message)}`);
    return data === true;
  },

  async listEligibleSubscriptions(notificationId: string): Promise<EligiblePushSubscription[]> {
    const { data, error } = await admin.rpc('list_eligible_push_subscriptions_for_delivery', {
      p_notification_id: notificationId,
    });
    if (error) throw new Error(`PUSH_SUBSCRIPTIONS_LOOKUP_FAILED:${sanitizePushError(error.message)}`);
    return (data ?? []) as EligiblePushSubscription[];
  },

  async ensureDeliveries(notificationId: string, subscriptions: EligiblePushSubscription[]) {
    if (subscriptions.length === 0) return;
    const rows = subscriptions.map((subscription) => ({
      notification_id: notificationId,
      subscription_id: subscription.id,
      status: 'PENDING',
    }));
    const { error } = await admin
      .from('push_notification_deliveries')
      .upsert(rows, { onConflict: 'notification_id,subscription_id', ignoreDuplicates: true });
    if (error) throw new Error(`PUSH_DELIVERIES_CREATE_FAILED:${sanitizePushError(error.message)}`);
  },

  async listRetryableDeliveries(notificationId: string) {
    const { data, error } = await admin
      .from('push_notification_deliveries')
      .select('id,status,attempts,subscription:push_subscriptions!inner(id,user_id,endpoint,p256dh,auth_key)')
      .eq('notification_id', notificationId)
      .in('status', ['PENDING', 'FAILED'])
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw new Error(`PUSH_DELIVERIES_LOOKUP_FAILED:${sanitizePushError(error.message)}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      attempts: row.attempts,
      subscription: Array.isArray(row.subscription) ? row.subscription[0] : row.subscription,
    }));
  },

  async claimDelivery(id: string) {
    const { data, error } = await admin.rpc('claim_push_delivery', { p_delivery_id: id });
    if (error) throw new Error(`PUSH_DELIVERY_CLAIM_FAILED:${sanitizePushError(error.message)}`);
    return data === true;
  },

  async wait(milliseconds: number) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  },

  async send(subscription: EligiblePushSubscription, payload: PushPayload) {
    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      throw new Error('VAPID_CONFIGURATION_MISSING');
    }
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
      },
      JSON.stringify(payload),
      { TTL: 86400, urgency: 'normal' },
    );
  },

  async markDeliverySent(id: string) {
    const { error } = await admin
      .from('push_notification_deliveries')
      .update({ status: 'SENT', last_error: null, provider_status: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'SENDING');
    if (error) throw new Error(`PUSH_DELIVERY_AUDIT_FAILED:${sanitizePushError(error.message)}`);
  },

  async markDeliveryFailed(id: string, failure: PushFailure, errorMessage: string) {
    const { error } = await admin
      .from('push_notification_deliveries')
      .update({
        status: 'FAILED',
        last_error: errorMessage,
        provider_status: failure.statusCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'SENDING');
    if (error) throw new Error(`PUSH_DELIVERY_AUDIT_FAILED:${sanitizePushError(error.message)}`);
  },

  async deactivateSubscription(id: string) {
    const { error } = await admin
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`PUSH_SUBSCRIPTION_DEACTIVATE_FAILED:${sanitizePushError(error.message)}`);
  },

  async finalizeNotification(id: string) {
    const { data, error } = await admin.rpc('finalize_push_notification', { p_notification_id: id });
    if (error) throw new Error(`PUSH_NOTIFICATION_FINALIZE_FAILED:${sanitizePushError(error.message)}`);
    return data as { sent: number; failed: number; pending: number; expired: number };
  },
};

const handler = createSendWebPushHandler(repository);

Deno.serve(async (request) => {
  try {
    if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
      return Response.json({ error: 'PUSH_FUNCTION_NOT_CONFIGURED' }, { status: 500 });
    }
    return await handler(request);
  } catch (error) {
    const failure = classifyPushFailure(error);
    console.error('send-web-push failed', {
      kind: failure.kind,
      statusCode: failure.statusCode,
      message: sanitizePushError(error),
    });
    return Response.json({ error: 'PUSH_DELIVERY_FAILED' }, { status: 500 });
  }
});
