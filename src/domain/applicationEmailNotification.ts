export const APPLICATION_EMAIL_EVENT_TYPES = [
  'NEW_APPLICATION',
  'INTERVIEW_SCHEDULED',
  'ACCEPTED',
  'REJECTED',
] as const;

export const APPLICATION_EMAIL_DELIVERY_STATUSES = [
  'PENDING',
  'SENDING',
  'SENT',
  'FAILED',
] as const;

export type ApplicationEmailEventType = typeof APPLICATION_EMAIL_EVENT_TYPES[number];
export type ApplicationEmailDeliveryStatus = typeof APPLICATION_EMAIL_DELIVERY_STATUSES[number];

export interface ApplicationEmailNotification {
  id: string;
  applicationId: string;
  eventType: ApplicationEmailEventType;
  deliveryStatus: ApplicationEmailDeliveryStatus;
  deliveryAttempts: number;
  deliveryLastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

export type ApplicationEmailSendResult =
  | { ok: true; status: 'SENT' | 'ALREADY_SENT' }
  | { ok: false; status: 'PENDING' | 'FAILED'; error: string };

interface FunctionInvokeResult {
  data: unknown;
  error: unknown;
}

export interface ApplicationEmailClient {
  functions: {
    invoke(
      name: 'send-application-notification',
      options: { body: { applicationId: string; eventType: ApplicationEmailEventType } },
    ): Promise<FunctionInvokeResult>;
  };
  from(table: 'application_email_notifications'): {
    select(columns: string): {
      order(
        column: 'created_at',
        options: { ascending: false },
      ): Promise<{ data: unknown; error: unknown }>;
    };
  };
}

const isEventType = (value: unknown): value is ApplicationEmailEventType =>
  typeof value === 'string'
  && (APPLICATION_EMAIL_EVENT_TYPES as readonly string[]).includes(value);

const isDeliveryStatus = (value: unknown): value is ApplicationEmailDeliveryStatus =>
  typeof value === 'string'
  && (APPLICATION_EMAIL_DELIVERY_STATUSES as readonly string[]).includes(value);

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

const mapNotificationRow = (value: unknown): ApplicationEmailNotification | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string'
    || typeof row.application_id !== 'string'
    || !isEventType(row.event_type)
    || !isDeliveryStatus(row.delivery_status)
    || typeof row.created_at !== 'string'
  ) return null;

  return {
    id: row.id,
    applicationId: row.application_id,
    eventType: row.event_type,
    deliveryStatus: row.delivery_status,
    deliveryAttempts: Number.isFinite(Number(row.delivery_attempts))
      ? Math.max(0, Number(row.delivery_attempts))
      : 0,
    deliveryLastError: textOrNull(row.delivery_last_error),
    createdAt: row.created_at,
    sentAt: textOrNull(row.sent_at),
  };
};

const safeSendFailure = (status: 'PENDING' | 'FAILED' = 'PENDING'): ApplicationEmailSendResult => ({
  ok: false,
  status,
  error: 'تعذر إرسال إشعار البريد حالياً.',
});

export function createApplicationEmailNotificationGateway(client: ApplicationEmailClient) {
  const send = async (
    applicationId: string,
    eventType: ApplicationEmailEventType,
  ): Promise<ApplicationEmailSendResult> => {
    if (!applicationId.trim() || !isEventType(eventType)) {
      return {
        ok: false,
        status: 'PENDING',
        error: 'بيانات إشعار البريد غير صالحة.',
      };
    }

    try {
      const { data, error } = await client.functions.invoke('send-application-notification', {
        body: { applicationId, eventType },
      });
      if (error || !data || typeof data !== 'object') return safeSendFailure();
      const response = data as Record<string, unknown>;
      if (response.ok === true && response.status === 'SENT') {
        return { ok: true, status: 'SENT' };
      }
      if (
        response.ok === true
        && (response.status === 'ALREADY_SENT' || response.alreadySent === true)
      ) {
        return { ok: true, status: 'ALREADY_SENT' };
      }
      return safeSendFailure(response.status === 'FAILED' ? 'FAILED' : 'PENDING');
    } catch {
      return safeSendFailure();
    }
  };

  return {
    send,
    retry: send,
    async list(): Promise<ApplicationEmailNotification[]> {
      const { data, error } = await client
        .from('application_email_notifications')
        .select([
          'id',
          'application_id',
          'event_type',
          'delivery_status',
          'delivery_attempts',
          'delivery_last_error',
          'created_at',
          'sent_at',
        ].join(','))
        .order('created_at', { ascending: false });
      if (error) throw new Error('APPLICATION_EMAIL_NOTIFICATIONS_LOAD_FAILED');
      return (Array.isArray(data) ? data : [])
        .map(mapNotificationRow)
        .filter((row): row is ApplicationEmailNotification => row !== null);
    },
  };
}
