interface ReplyDeliveryState {
  deliveryChannel: string;
  deliveryStatus: string;
}

export const canAccessContactInbox = (role: string | null | undefined): boolean => (
  role === 'PRESIDENT' || role === 'VICE_PRESIDENT'
);

export const canReplyToContactMessage = (reply: ReplyDeliveryState | null | undefined): boolean => !reply;

export const canRetryContactEmail = (reply: ReplyDeliveryState | null | undefined): boolean => (
  reply?.deliveryChannel === 'EMAIL'
  && (reply.deliveryStatus === 'PENDING' || reply.deliveryStatus === 'FAILED')
);
