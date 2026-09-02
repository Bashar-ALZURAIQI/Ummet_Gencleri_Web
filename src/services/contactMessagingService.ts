import { supabase } from '../lib/supabase.ts';
import {
  createContactMessagingRepository,
  type ContactMessagingClient,
  type SubmitContactMessageInput,
} from '../domain/contactMessagingRepository.ts';

export type {
  ContactDeliveryChannel,
  ContactDeliveryStatus,
  ContactMessageRecord,
  ContactMessageStatus,
  ContactReply,
  SubmitContactMessageInput,
} from '../domain/contactMessagingRepository.ts';

const repository = createContactMessagingRepository(supabase as unknown as ContactMessagingClient);

export const listVisibleContactMessages = () => repository.listVisible();
export const submitContactMessage = (input: SubmitContactMessageInput) => repository.submit(input);
export const markContactMessageRead = (messageId: string) => repository.markRead(messageId);
export const replyToContactMessage = (messageId: string, replyText: string) => repository.reply(messageId, replyText);

export async function sendPendingContactReplyEmail(replyId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.functions.invoke('send-contact-reply', { body: { replyId } });
  return error
    ? { ok: false, error: 'تم حفظ الرد، لكن تعذر إرسال البريد الآن وسيبقى مسجلاً لإعادة المحاولة.' }
    : { ok: true };
}
