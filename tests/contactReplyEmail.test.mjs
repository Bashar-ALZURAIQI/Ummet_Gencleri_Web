import assert from 'node:assert/strict';
import test from 'node:test';

import { composeContactReplyEmail, escapeHtml } from '../supabase/functions/send-contact-reply/email.ts';

test('escapes visitor-controlled HTML and creates Arabic HTML plus plain text', () => {
  assert.equal(escapeHtml('<img src="x"> & test'), '&lt;img src=&quot;x&quot;&gt; &amp; test');
  const email = composeContactReplyEmail({
    senderName: '<أحمد>', subject: 'مساعدة & تسجيل', replyText: 'أهلاً\n<script>alert(1)</script>',
    repliedByName: 'الرئيس', sitePublicUrl: 'https://ummet.org',
  });
  assert.match(email.subject, /مساعدة & تسجيل/);
  assert.match(email.text, /أهلاً/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /https:\/\/ummet\.org/);
});
