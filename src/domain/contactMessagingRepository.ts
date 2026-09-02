export type ContactMessageStatus = 'UNREAD' | 'READ' | 'REPLIED';
export type ContactDeliveryChannel = 'IN_APP' | 'EMAIL';
export type ContactDeliveryStatus = 'NOT_REQUIRED' | 'PENDING' | 'SENT' | 'FAILED';

export interface ContactReply {
  id: string;
  messageId: string;
  replyText: string;
  repliedBy: string;
  repliedByName: string;
  repliedByRole: 'PRESIDENT' | 'VICE_PRESIDENT';
  deliveryChannel: ContactDeliveryChannel;
  deliveryStatus: ContactDeliveryStatus;
  deliveryAttempts: number;
  deliveryLastError: string | null;
  emailProviderId: string | null;
  repliedAt: string;
  sentAt: string | null;
}

export interface ContactMessageRecord {
  id: string;
  senderUserId: string | null;
  senderName: string;
  senderEmail: string;
  subject: string;
  message: string;
  status: ContactMessageStatus;
  readAt: string | null;
  readBy: string | null;
  createdAt: string;
  updatedAt: string;
  reply: ContactReply | null;
}

export interface SubmitContactMessageInput {
  senderName: string;
  senderEmail: string;
  subject: string;
  message: string;
}

interface ErrorLike { code?: unknown; message?: unknown; details?: unknown }
interface Response { data: unknown; error: ErrorLike | null }
interface ContactQuery {
  select(columns: string): ContactQuery;
  order(column: 'created_at', options: { ascending: false }): Promise<Response>;
}
export interface ContactMessagingClient {
  from(table: 'contact_messages'): ContactQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<Response>;
}

export type ContactRepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: string } };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
const string = (value: unknown) => typeof value === 'string' ? value : '';
const nullableString = (value: unknown) => typeof value === 'string' && value ? value : null;

const fail = <T>(error: ErrorLike | null | undefined, code: string, message: string): ContactRepositoryResult<T> => ({
  ok: false,
  error: {
    code: typeof error?.code === 'string' && error.code ? error.code : code,
    message: typeof error?.message === 'string' && error.message ? error.message : message,
    ...(typeof error?.details === 'string' && error.details ? { details: error.details } : {}),
  },
});

export function mapContactReply(value: unknown): ContactReply | null {
  if (!isRecord(value)) return null;
  const role = string(value.replied_by_role);
  const channel = string(value.delivery_channel);
  const status = string(value.delivery_status);
  if (!string(value.id) || !string(value.message_id) || !string(value.reply_text)
    || !string(value.replied_by) || !string(value.replied_by_name)
    || (role !== 'PRESIDENT' && role !== 'VICE_PRESIDENT')
    || (channel !== 'IN_APP' && channel !== 'EMAIL')
    || !['NOT_REQUIRED', 'PENDING', 'SENT', 'FAILED'].includes(status)
    || !Number.isSafeInteger(value.delivery_attempts)
    || !string(value.replied_at)) return null;
  return {
    id: string(value.id),
    messageId: string(value.message_id),
    replyText: string(value.reply_text),
    repliedBy: string(value.replied_by),
    repliedByName: string(value.replied_by_name),
    repliedByRole: role,
    deliveryChannel: channel,
    deliveryStatus: status as ContactDeliveryStatus,
    deliveryAttempts: Number(value.delivery_attempts),
    deliveryLastError: nullableString(value.delivery_last_error),
    emailProviderId: nullableString(value.email_provider_id),
    repliedAt: string(value.replied_at),
    sentAt: nullableString(value.sent_at),
  };
}

export function mapContactMessage(value: unknown): ContactMessageRecord | null {
  if (!isRecord(value)) return null;
  const status = string(value.status);
  if (!string(value.id) || !string(value.sender_name) || !string(value.sender_email)
    || !string(value.subject) || !string(value.message)
    || !['UNREAD', 'READ', 'REPLIED'].includes(status)
    || !string(value.created_at) || !string(value.updated_at)) return null;
  const replyRows = Array.isArray(value.contact_message_replies) ? value.contact_message_replies : [];
  const reply = replyRows.length ? mapContactReply(replyRows[0]) : null;
  if (replyRows.length && !reply) return null;
  return {
    id: string(value.id),
    senderUserId: nullableString(value.sender_user_id),
    senderName: string(value.sender_name),
    senderEmail: string(value.sender_email),
    subject: string(value.subject),
    message: string(value.message),
    status: status as ContactMessageStatus,
    readAt: nullableString(value.read_at),
    readBy: nullableString(value.read_by),
    createdAt: string(value.created_at),
    updatedAt: string(value.updated_at),
    reply,
  };
}

const CONTACT_SELECT = [
  'id', 'sender_user_id', 'sender_name', 'sender_email', 'subject', 'message',
  'status', 'read_at', 'read_by', 'created_at', 'updated_at',
  'contact_message_replies(id,message_id,reply_text,replied_by,replied_by_name,replied_by_role,delivery_channel,delivery_status,delivery_attempts,delivery_last_error,email_provider_id,replied_at,sent_at)',
].join(',');

export function createContactMessagingRepository(client: ContactMessagingClient) {
  return {
    async listVisible(): Promise<ContactRepositoryResult<ContactMessageRecord[]>> {
      try {
        const response = await client.from('contact_messages').select(CONTACT_SELECT).order('created_at', { ascending: false });
        if (response.error) return fail(response.error, 'CONTACT_MESSAGES_LOAD_FAILED', 'تعذر تحميل الرسائل.');
        if (!Array.isArray(response.data)) return fail(null, 'CONTACT_MESSAGES_RESPONSE_INVALID', 'أعاد الخادم قائمة رسائل غير صالحة.');
        const rows = response.data.map(mapContactMessage);
        return rows.every(Boolean)
          ? { ok: true, data: rows as ContactMessageRecord[] }
          : fail(null, 'CONTACT_MESSAGES_RESPONSE_INVALID', 'أعاد الخادم رسالة غير صالحة.');
      } catch (error) {
        return fail(error as ErrorLike, 'CONTACT_MESSAGES_LOAD_FAILED', 'تعذر تحميل الرسائل.');
      }
    },

    async submit(input: SubmitContactMessageInput): Promise<ContactRepositoryResult<{ id: string }>> {
      try {
        const response = await client.rpc('submit_contact_message', {
          p_sender_name: input.senderName,
          p_sender_email: input.senderEmail,
          p_subject: input.subject,
          p_message: input.message,
        });
        return !response.error && typeof response.data === 'string' && response.data
          ? { ok: true, data: { id: response.data } }
          : fail(response.error, 'CONTACT_MESSAGE_SUBMIT_FAILED', 'تعذر إرسال الرسالة.');
      } catch (error) {
        return fail(error as ErrorLike, 'CONTACT_MESSAGE_SUBMIT_FAILED', 'تعذر إرسال الرسالة.');
      }
    },

    async markRead(messageId: string): Promise<ContactRepositoryResult<ContactMessageRecord>> {
      try {
        const response = await client.rpc('mark_contact_message_read', { p_message_id: messageId });
        if (response.error) return fail(response.error, 'CONTACT_MESSAGE_READ_FAILED', 'تعذر تحديث حالة الرسالة.');
        const message = isRecord(response.data)
          ? mapContactMessage({ ...response.data, contact_message_replies: [] })
          : null;
        return message ? { ok: true, data: message } : fail(null, 'CONTACT_MESSAGE_RESPONSE_INVALID', 'أعاد الخادم رسالة غير صالحة.');
      } catch (error) {
        return fail(error as ErrorLike, 'CONTACT_MESSAGE_READ_FAILED', 'تعذر تحديث حالة الرسالة.');
      }
    },

    async reply(messageId: string, replyText: string): Promise<ContactRepositoryResult<ContactReply>> {
      try {
        const response = await client.rpc('reply_to_contact_message', {
          p_message_id: messageId,
          p_reply_text: replyText,
        });
        if (response.error) return fail(response.error, 'CONTACT_MESSAGE_REPLY_FAILED', 'تعذر حفظ الرد.');
        const reply = mapContactReply(response.data);
        return reply ? { ok: true, data: reply } : fail(null, 'CONTACT_REPLY_RESPONSE_INVALID', 'أعاد الخادم رداً غير صالح.');
      } catch (error) {
        return fail(error as ErrorLike, 'CONTACT_MESSAGE_REPLY_FAILED', 'تعذر حفظ الرد.');
      }
    },
  };
}
