import assert from 'node:assert/strict';
import test from 'node:test';

import {
  escapeApplicationEmailHtml,
  renderApplicationEmail,
} from '../supabase/functions/send-application-notification/email.ts';

const basePayload = {
  studentName: '<أحمد>',
  studentEmail: 'student@example.com',
  interviewDate: null,
  interviewTime: null,
  interviewLink: null,
  rejectionReason: null,
};

test('notifies the president with Turkish first and Arabic second', () => {
  const email = renderApplicationEmail('NEW_APPLICATION', basePayload, 'https://ummet.org');
  assert.match(email.subject, /Yeni Üyelik Başvurusu/);
  assert.match(email.subject, /طلب انضمام جديد/);
  assert.ok(email.text.indexOf('Yeni bir üyelik başvurusu alındı.') < email.text.indexOf('تم استلام طلب انضمام جديد.'));
  assert.ok(email.html.indexOf('Yeni bir üyelik başvurusu alındı.') < email.html.indexOf('تم استلام طلب انضمام جديد.'));
  assert.match(email.html, /&lt;أحمد&gt;/);
  assert.doesNotMatch(email.html, /<أحمد>/);
  assert.match(email.html, /https:\/\/ummet\.org/);
});

test('renders a Turkish-first bilingual interview invitation without claiming final acceptance', () => {
  const email = renderApplicationEmail('INTERVIEW_SCHEDULED', {
    ...basePayload,
    interviewDate: '2026-09-02',
    interviewTime: '14:30',
    interviewLink: 'https://meet.example.com/room?a=1&b=2',
  }, 'https://ummet.org');
  assert.match(email.subject, /Mülakat Daveti/);
  assert.match(email.subject, /دعوة للمقابلة/);
  assert.ok(email.text.indexOf('Merhaba') < email.text.indexOf('مرحبًا'));
  assert.ok(email.html.indexOf('Mülakat Bilgileri') < email.html.indexOf('بيانات المقابلة'));
  assert.match(email.text, /2026-09-02/);
  assert.match(email.text, /14:30/);
  assert.match(email.text, /https:\/\/meet\.example\.com/);
  assert.match(email.html, /2026-09-02/);
  assert.match(email.html, /14:30/);
  assert.match(email.html, /a=1&amp;b=2/);
  assert.doesNotMatch(email.text, /üye olarak kabul edildiğinizi|تم قبولكم عضوًا/iu);
});

test('renders Turkish-first bilingual acceptance with a warm welcome', () => {
  const email = renderApplicationEmail('ACCEPTED', basePayload, 'https://ummet.org');
  assert.match(email.subject, /Üyelik Başvurunuz Kabul Edildi/);
  assert.match(email.subject, /تم قبول طلب انضمامكم/);
  assert.ok(email.text.indexOf('Tebrikler') < email.text.indexOf('مبارك لكم'));
  assert.match(email.text, /Aramıza hoş geldiniz/);
  assert.match(email.text, /أهلًا وسهلًا بكم بيننا/);
  assert.match(email.text, /https:\/\/ummet\.org/);
});

test('renders a Turkish-first bilingual rejection and safely escapes an optional reason', () => {
  const email = renderApplicationEmail('REJECTED', {
    ...basePayload,
    rejectionReason: 'المقاعد مكتملة <script>alert(1)</script>',
  }, 'https://ummet.org');
  assert.ok(email.text.indexOf('Merhaba') < email.text.indexOf('مرحبًا'));
  assert.match(email.text, /bu dönem için üyelik başvurunuzu kabul edemediğimizi/);
  assert.match(email.text, /نعتذر/);
  assert.match(email.text, /هذه الدورة/);
  assert.match(email.text, /Açıklama:/);
  assert.match(email.text, /التوضيح:/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.doesNotMatch(email.html, /<script>/);
});

test('rejects non-HTTPS links and escapes all HTML-sensitive characters', () => {
  assert.equal(
    escapeApplicationEmailHtml(`<>&"'`),
    '&lt;&gt;&amp;&quot;&#039;',
  );
  assert.throws(() => renderApplicationEmail('INTERVIEW_SCHEDULED', {
    ...basePayload,
    interviewDate: '2026-09-02',
    interviewTime: '14:30',
    interviewLink: 'javascript:alert(1)',
  }, 'https://ummet.org'), /HTTPS/);
  assert.throws(() => renderApplicationEmail('ACCEPTED', basePayload, 'http://ummet.org'), /HTTPS/);
});
