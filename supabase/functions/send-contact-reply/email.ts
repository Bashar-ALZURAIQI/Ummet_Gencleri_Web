export interface ContactReplyEmailInput {
  senderName: string;
  subject: string;
  replyText: string;
  repliedByName: string;
  sitePublicUrl: string;
}

export const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export function composeContactReplyEmail(input: ContactReplyEmailInput) {
  const safeName = escapeHtml(input.senderName);
  const safeSubject = escapeHtml(input.subject);
  const safeReply = escapeHtml(input.replyText).replaceAll('\n', '<br />');
  const safeResponder = escapeHtml(input.repliedByName);
  const safeSiteUrl = escapeHtml(input.sitePublicUrl);
  return {
    subject: `رد اتحاد شباب الأمة: ${input.subject}`,
    text: [
      `مرحباً ${input.senderName}`,
      `وصل رد الإدارة على استفسارك: ${input.subject}`,
      '',
      input.replyText,
      '',
      `تم الرد بواسطة ${input.repliedByName}.`,
      input.sitePublicUrl,
    ].join('\n'),
    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033;line-height:1.8">
        <h2 style="color:#12345b">مرحباً ${safeName}</h2>
        <p>وصل رد الإدارة على استفسارك: <strong>${safeSubject}</strong></p>
        <div style="background:#f5f7fa;border-right:4px solid #c6a15b;padding:18px;border-radius:10px">${safeReply}</div>
        <p style="font-size:13px;color:#687386">تم الرد بواسطة ${safeResponder}.</p>
        <p><a href="${safeSiteUrl}" style="color:#12345b">زيارة موقع الاتحاد</a></p>
      </div>`,
  };
}
