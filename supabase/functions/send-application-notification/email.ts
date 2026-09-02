export type ApplicationEmailEventType =
  | 'NEW_APPLICATION'
  | 'INTERVIEW_SCHEDULED'
  | 'ACCEPTED'
  | 'REJECTED';

export interface ApplicationEmailPayload {
  studentName: string;
  studentEmail: string;
  interviewDate: string | null;
  interviewTime: string | null;
  interviewLink: string | null;
  rejectionReason: string | null;
}

export interface RenderedApplicationEmail {
  subject: string;
  text: string;
  html: string;
}

export const escapeApplicationEmailHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const requireHttpsUrl = (value: string, label: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  return parsed.toString();
};

const emailShell = (content: string): string => `
  <div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033;line-height:1.9">
    ${content}
  </div>`;

export function renderApplicationEmail(
  eventType: ApplicationEmailEventType,
  payload: ApplicationEmailPayload,
  sitePublicUrl: string,
): RenderedApplicationEmail {
  const siteUrl = requireHttpsUrl(sitePublicUrl, 'SITE_PUBLIC_URL');
  const safeName = escapeApplicationEmailHtml(payload.studentName);
  const safeSiteUrl = escapeApplicationEmailHtml(siteUrl);

  if (eventType === 'NEW_APPLICATION') {
    const sentence = `يوجد طلب انضمام جديد باسم ${payload.studentName} بانتظار مراجعتك في لوحة التحكم`;
    return {
      subject: `طلب انضمام جديد: ${payload.studentName}`,
      text: `${sentence}\n\n${siteUrl}`,
      html: emailShell(`
        <h2 style="color:#12345b">طلب انضمام جديد</h2>
        <p>يوجد طلب انضمام جديد باسم <strong>${safeName}</strong> بانتظار مراجعتك في لوحة التحكم.</p>
        <p><a href="${safeSiteUrl}" style="color:#12345b;font-weight:bold">فتح لوحة التحكم</a></p>`),
    };
  }

  if (eventType === 'INTERVIEW_SCHEDULED') {
    if (!payload.interviewDate || !payload.interviewTime || !payload.interviewLink) {
      throw new Error('Interview date, time, and HTTPS link are required.');
    }
    const meetingUrl = requireHttpsUrl(payload.interviewLink, 'Interview link');
    const safeDate = escapeApplicationEmailHtml(payload.interviewDate);
    const safeTime = escapeApplicationEmailHtml(payload.interviewTime);
    const safeMeetingUrl = escapeApplicationEmailHtml(meetingUrl);
    return {
      subject: 'تهانينا بالقبول المبدئي وموعد المقابلة',
      text: [
        `مرحباً ${payload.studentName}`,
        'تهانينا، تمت الموافقة المبدئية على طلبك وتم تحديد موعد المقابلة.',
        `التاريخ: ${payload.interviewDate}`,
        `الوقت: ${payload.interviewTime}`,
        `رابط المقابلة: ${meetingUrl}`,
      ].join('\n'),
      html: emailShell(`
        <h2 style="color:#12345b">تهانينا ${safeName}</h2>
        <p>تمت الموافقة المبدئية على طلبك وتم تحديد موعد المقابلة.</p>
        <div style="background:#eff6ff;border-right:4px solid #2563eb;padding:18px;border-radius:10px">
          <p><strong>التاريخ:</strong> ${safeDate}</p>
          <p><strong>الوقت:</strong> ${safeTime}</p>
          <p><a href="${safeMeetingUrl}" style="color:#1d4ed8;font-weight:bold">الدخول إلى رابط المقابلة</a></p>
        </div>`),
    };
  }

  if (eventType === 'ACCEPTED') {
    const sentence = 'مبروك، لقد تم قبولك رسمياً كعضو في اتحاد شباب الأمة';
    return {
      subject: 'مبروك قبولك في اتحاد شباب الأمة',
      text: `مرحباً ${payload.studentName}\n\n${sentence}.\n\n${siteUrl}`,
      html: emailShell(`
        <h2 style="color:#047857">مبروك ${safeName}</h2>
        <p><strong>${sentence}.</strong></p>
        <p><a href="${safeSiteUrl}" style="color:#047857;font-weight:bold">الدخول إلى بوابة الطالب</a></p>`),
    };
  }

  const rejectionReason = payload.rejectionReason?.trim() ?? '';
  const safeReason = escapeApplicationEmailHtml(rejectionReason);
  return {
    subject: 'نتيجة طلب الانضمام إلى اتحاد شباب الأمة',
    text: [
      `مرحباً ${payload.studentName}`,
      'نشكرك على اهتمامك بالانضمام إلى اتحاد شباب الأمة، ونعتذر عن عدم قبول طلبك في هذه الدورة.',
      rejectionReason ? `التوضيح: ${rejectionReason}` : '',
      'نتمنى لك التوفيق ونرحب بتقديمك في دورة قادمة.',
    ].filter(Boolean).join('\n\n'),
    html: emailShell(`
      <h2 style="color:#12345b">مرحباً ${safeName}</h2>
      <p>نشكرك على اهتمامك بالانضمام إلى اتحاد شباب الأمة، ونعتذر عن عدم قبول طلبك في هذه الدورة.</p>
      ${safeReason ? `<p style="background:#fff7ed;padding:14px;border-radius:10px"><strong>التوضيح:</strong> ${safeReason}</p>` : ''}
      <p>نتمنى لك التوفيق ونرحب بتقديمك في دورة قادمة.</p>`),
  };
}
