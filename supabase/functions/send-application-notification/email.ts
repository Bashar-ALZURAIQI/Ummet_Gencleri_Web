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
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#172033;line-height:1.9">
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
    return {
      subject: `Yeni Üyelik Başvurusu | طلب انضمام جديد – ${payload.studentName}`,
      text: [
        'Yeni bir üyelik başvurusu alındı.',
        `Öğrenci: ${payload.studentName}`,
        'Başvuruyu incelemek için yönetim panelini açınız:',
        siteUrl,
        'Ümmet Gençleri Birliği',
        '',
        'تم استلام طلب انضمام جديد.',
        `اسم الطالب: ${payload.studentName}`,
        'يرجى فتح لوحة الإدارة لمراجعة الطلب:',
        siteUrl,
        'اتحاد شباب الأمة',
      ].join('\n\n'),
      html: emailShell(`
        <section dir="ltr">
          <h2 style="color:#12345b">Yeni Üyelik Başvurusu</h2>
          <p>Yeni bir üyelik başvurusu alındı.</p>
          <p><strong>Öğrenci:</strong> ${safeName}</p>
          <p>Başvuruyu incelemek için yönetim panelini açınız:</p>
          <p><a href="${safeSiteUrl}" style="color:#12345b;font-weight:bold">Yönetim panelini aç</a></p>
          <p>Ümmet Gençleri Birliği</p>
        </section>
        <hr style="border:0;border-top:1px solid #dbe3ec;margin:28px 0">
        <section dir="rtl">
          <h2 style="color:#12345b">طلب انضمام جديد</h2>
          <p>تم استلام طلب انضمام جديد.</p>
          <p><strong>اسم الطالب:</strong> ${safeName}</p>
          <p>يرجى فتح لوحة الإدارة لمراجعة الطلب:</p>
          <p><a href="${safeSiteUrl}" style="color:#12345b;font-weight:bold">فتح لوحة الإدارة</a></p>
          <p>اتحاد شباب الأمة</p>
        </section>`),
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
      subject: 'Ümmet Gençleri Birliği – Mülakat Daveti | اتحاد شباب الأمة – دعوة للمقابلة',
      text: [
        `Merhaba ${payload.studentName},`,
        'Ümmet Gençleri Birliği üyelik başvurunuz değerlendirilmiştir.',
        'Sizi başvurunuzun bir sonraki aşaması olan mülakata davet etmekten memnuniyet duyuyoruz.',
        '',
        'Mülakat Bilgileri:',
        `Tarih: ${payload.interviewDate}`,
        `Saat: ${payload.interviewTime}`,
        `Mülakat Bağlantısı: ${meetingUrl}`,
        '',
        'Lütfen belirtilen tarih ve saatte bağlantı üzerinden görüşmeye katılınız.',
        'Başvurunuz ve ilginiz için teşekkür ederiz.',
        '',
        'Saygılarımızla,',
        'Ümmet Gençleri Birliği',
        '',
        `مرحبًا ${payload.studentName}،`,
        'تم تقييم طلب انضمامكم إلى اتحاد شباب الأمة،',
        'ويسعدنا دعوتكم إلى المقابلة باعتبارها المرحلة التالية من طلب الانضمام.',
        '',
        'بيانات المقابلة:',
        `التاريخ: ${payload.interviewDate}`,
        `الوقت: ${payload.interviewTime}`,
        `رابط المقابلة: ${meetingUrl}`,
        '',
        'نرجو منكم الانضمام عبر الرابط في التاريخ والوقت المحددين.',
        'نشكر لكم اهتمامكم ورغبتكم في الانضمام.',
        '',
        'مع خالص التحية،',
        'اتحاد شباب الأمة',
      ].join('\n'),
      html: emailShell(`
        <section dir="ltr">
          <p>Merhaba ${safeName},</p>
          <p>Ümmet Gençleri Birliği üyelik başvurunuz değerlendirilmiştir.<br>Sizi başvurunuzun bir sonraki aşaması olan mülakata davet etmekten memnuniyet duyuyoruz.</p>
          <h3 style="color:#12345b">Mülakat Bilgileri</h3>
          <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:18px;border-radius:10px">
            <p><strong>Tarih:</strong> ${safeDate}</p><p><strong>Saat:</strong> ${safeTime}</p>
            <p><strong>Mülakat Bağlantısı:</strong> <a href="${safeMeetingUrl}" style="color:#1d4ed8;font-weight:bold">${safeMeetingUrl}</a></p>
          </div>
          <p>Lütfen belirtilen tarih ve saatte bağlantı üzerinden görüşmeye katılınız.</p>
          <p>Başvurunuz ve ilginiz için teşekkür ederiz.</p><p>Saygılarımızla,<br>Ümmet Gençleri Birliği</p>
        </section>
        <hr style="border:0;border-top:1px solid #dbe3ec;margin:28px 0">
        <section dir="rtl">
          <p>مرحبًا ${safeName}،</p>
          <p>تم تقييم طلب انضمامكم إلى اتحاد شباب الأمة،<br>ويسعدنا دعوتكم إلى المقابلة باعتبارها المرحلة التالية من طلب الانضمام.</p>
          <h3 style="color:#12345b">بيانات المقابلة</h3>
          <div style="background:#eff6ff;border-right:4px solid #2563eb;padding:18px;border-radius:10px">
            <p><strong>التاريخ:</strong> ${safeDate}</p><p><strong>الوقت:</strong> ${safeTime}</p>
            <p><strong>رابط المقابلة:</strong> <a href="${safeMeetingUrl}" style="color:#1d4ed8;font-weight:bold">${safeMeetingUrl}</a></p>
          </div>
          <p>نرجو منكم الانضمام عبر الرابط في التاريخ والوقت المحددين.</p>
          <p>نشكر لكم اهتمامكم ورغبتكم في الانضمام.</p><p>مع خالص التحية،<br>اتحاد شباب الأمة</p>
        </section>`),
    };
  }

  if (eventType === 'ACCEPTED') {
    return {
      subject: 'Üyelik Başvurunuz Kabul Edildi | تم قبول طلب انضمامكم',
      text: [
        `Tebrikler ${payload.studentName}!`,
        'Üyelik başvurunuzun değerlendirme süreci başarıyla tamamlandı.',
        "Ümmet Gençleri Birliği'ne üye olarak kabul edildiğinizi memnuniyetle bildiririz.",
        'Aramıza hoş geldiniz.',
        'Sizi ailemizin bir parçası olarak görmekten mutluluk duyuyor, birlikte güzel ve faydalı çalışmalara imza atmayı diliyoruz.',
        `Öğrenci portalına giriş:\n${siteUrl}`,
        'Saygılarımızla,\nÜmmet Gençleri Birliği',
        '',
        `مبارك لكم ${payload.studentName}!`,
        'تم استكمال عملية تقييم طلب انضمامكم بنجاح.',
        'ويسعدنا إبلاغكم بقبولكم عضوًا في اتحاد شباب الأمة.',
        'أهلًا وسهلًا بكم بيننا، وسعداء بانضمامكم إلى عائلتنا،',
        'ونتطلع إلى أن نصنع معًا أعمالًا نافعة وأثرًا جميلًا.',
        `الدخول إلى بوابة الطالب:\n${siteUrl}`,
        'مع خالص التحية،\nاتحاد شباب الأمة',
      ].join('\n\n'),
      html: emailShell(`
        <section dir="ltr"><h2 style="color:#047857">Tebrikler ${safeName}!</h2>
          <p>Üyelik başvurunuzun değerlendirme süreci başarıyla tamamlandı.</p>
          <p><strong>Ümmet Gençleri Birliği'ne üye olarak kabul edildiğinizi memnuniyetle bildiririz.</strong></p>
          <p>Aramıza hoş geldiniz.<br>Sizi ailemizin bir parçası olarak görmekten mutluluk duyuyor, birlikte güzel ve faydalı çalışmalara imza atmayı diliyoruz.</p>
          <p>Öğrenci portalına giriş:<br><a href="${safeSiteUrl}" style="color:#047857;font-weight:bold">${safeSiteUrl}</a></p>
          <p>Saygılarımızla,<br>Ümmet Gençleri Birliği</p></section>
        <hr style="border:0;border-top:1px solid #dbe3ec;margin:28px 0">
        <section dir="rtl"><h2 style="color:#047857">مبارك لكم ${safeName}!</h2>
          <p>تم استكمال عملية تقييم طلب انضمامكم بنجاح.</p><p><strong>ويسعدنا إبلاغكم بقبولكم عضوًا في اتحاد شباب الأمة.</strong></p>
          <p>أهلًا وسهلًا بكم بيننا، وسعداء بانضمامكم إلى عائلتنا،<br>ونتطلع إلى أن نصنع معًا أعمالًا نافعة وأثرًا جميلًا.</p>
          <p>الدخول إلى بوابة الطالب:<br><a href="${safeSiteUrl}" style="color:#047857;font-weight:bold">${safeSiteUrl}</a></p>
          <p>مع خالص التحية،<br>اتحاد شباب الأمة</p></section>`),
    };
  }

  const rejectionReason = payload.rejectionReason?.trim() ?? '';
  const safeReason = escapeApplicationEmailHtml(rejectionReason);
  return {
    subject: 'Üyelik Başvurunuz Hakkında | بشأن طلب انضمامكم',
    text: [
      `Merhaba ${payload.studentName},`,
      "Ümmet Gençleri Birliği'ne göstermiş olduğunuz ilgi ve üyelik başvurunuz için teşekkür ederiz.",
      'Başvurunuzun değerlendirme süreci sonucunda, bu dönem için üyelik başvurunuzu kabul edemediğimizi üzülerek bildiririz.',
      rejectionReason ? `Açıklama: ${rejectionReason}` : '',
      'İlginiz için tekrar teşekkür eder, eğitim ve çalışmalarınızda başarılar dileriz.',
      'Saygılarımızla,\nÜmmet Gençleri Birliği',
      '',
      `مرحبًا ${payload.studentName}،`,
      'نشكر لكم اهتمامكم باتحاد شباب الأمة وتقديمكم طلب الانضمام.',
      'بعد استكمال تقييم طلبكم، نعتذر عن عدم إمكانية قبول طلب الانضمام في هذه الدورة.',
      rejectionReason ? `التوضيح: ${rejectionReason}` : '',
      'نشكر لكم اهتمامكم، ونتمنى لكم التوفيق والنجاح في مسيرتكم العلمية والعملية.',
      'مع خالص التحية،\nاتحاد شباب الأمة',
    ].filter(Boolean).join('\n\n'),
    html: emailShell(`
      <section dir="ltr"><p>Merhaba ${safeName},</p>
        <p>Ümmet Gençleri Birliği'ne göstermiş olduğunuz ilgi ve üyelik başvurunuz için teşekkür ederiz.</p>
        <p>Başvurunuzun değerlendirme süreci sonucunda, bu dönem için üyelik başvurunuzu kabul edemediğimizi üzülerek bildiririz.</p>
        ${safeReason ? `<p style="background:#fff7ed;padding:14px;border-radius:10px"><strong>Açıklama:</strong> ${safeReason}</p>` : ''}
        <p>İlginiz için tekrar teşekkür eder, eğitim ve çalışmalarınızda başarılar dileriz.</p><p>Saygılarımızla,<br>Ümmet Gençleri Birliği</p></section>
      <hr style="border:0;border-top:1px solid #dbe3ec;margin:28px 0">
      <section dir="rtl"><p>مرحبًا ${safeName}،</p><p>نشكر لكم اهتمامكم باتحاد شباب الأمة وتقديمكم طلب الانضمام.</p>
        <p>بعد استكمال تقييم طلبكم، نعتذر عن عدم إمكانية قبول طلب الانضمام في هذه الدورة.</p>
        ${safeReason ? `<p style="background:#fff7ed;padding:14px;border-radius:10px"><strong>التوضيح:</strong> ${safeReason}</p>` : ''}
        <p>نشكر لكم اهتمامكم، ونتمنى لكم التوفيق والنجاح في مسيرتكم العلمية والعملية.</p><p>مع خالص التحية،<br>اتحاد شباب الأمة</p></section>`),
  };
}
