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

test('notifies the president about a new named application', () => {
  const email = renderApplicationEmail('NEW_APPLICATION', basePayload, 'https://ummet.org');
  assert.match(email.subject, /طلب انضمام جديد/);
  assert.match(email.text, /يوجد طلب انضمام جديد باسم <أحمد> بانتظار مراجعتك في لوحة التحكم/);
  assert.match(email.html, /&lt;أحمد&gt;/);
  assert.doesNotMatch(email.html, /<أحمد>/);
  assert.match(email.html, /https:\/\/ummet\.org/);
});

test('renders interview date, time, and safe meeting link prominently', () => {
  const email = renderApplicationEmail('INTERVIEW_SCHEDULED', {
    ...basePayload,
    interviewDate: '2026-09-02',
    interviewTime: '14:30',
    interviewLink: 'https://meet.example.com/room?a=1&b=2',
  }, 'https://ummet.org');
  assert.match(email.subject, /موعد المقابلة/);
  assert.match(email.text, /2026-09-02/);
  assert.match(email.text, /14:30/);
  assert.match(email.text, /https:\/\/meet\.example\.com/);
  assert.match(email.html, /dir="rtl"/);
  assert.match(email.html, /a=1&amp;b=2/);
});

test('renders the exact acceptance congratulations copy', () => {
  const email = renderApplicationEmail('ACCEPTED', basePayload, 'https://ummet.org');
  assert.match(email.text, /مبروك، لقد تم قبولك رسمياً كعضو في اتحاد شباب الأمة/);
});

test('renders a polite rejection and escapes an optional reason', () => {
  const email = renderApplicationEmail('REJECTED', {
    ...basePayload,
    rejectionReason: 'المقاعد مكتملة <script>alert(1)</script>',
  }, 'https://ummet.org');
  assert.match(email.text, /نعتذر/);
  assert.match(email.text, /هذه الدورة/);
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
