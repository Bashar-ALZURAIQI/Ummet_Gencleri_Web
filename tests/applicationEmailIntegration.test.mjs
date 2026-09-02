import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  APPLICATION_EMAIL_DELAY_WARNING,
  deliverApplicationEmailAfterCommit,
  eventTypeForApplicationStatus,
} from '../src/domain/applicationEmailWorkflow.ts';

test('keeps a committed operation successful when email is delayed', async () => {
  const result = await deliverApplicationEmailAfterCommit(
    async () => ({ ok: false, status: 'FAILED', error: 'provider failed' }),
    'app-1',
    'ACCEPTED',
  );
  assert.deepEqual(result, { emailWarning: APPLICATION_EMAIL_DELAY_WARNING });
});

test('returns no warning after sent or idempotently already-sent delivery', async () => {
  assert.deepEqual(await deliverApplicationEmailAfterCommit(
    async () => ({ ok: true, status: 'SENT' }), 'app-1', 'ACCEPTED',
  ), {});
  assert.deepEqual(await deliverApplicationEmailAfterCommit(
    async () => ({ ok: true, status: 'ALREADY_SENT' }), 'app-1', 'ACCEPTED',
  ), {});
});

test('maps every confirmed application status to its authoritative email event', () => {
  assert.equal(eventTypeForApplicationStatus('pending'), 'NEW_APPLICATION');
  assert.equal(eventTypeForApplicationStatus('interview'), 'INTERVIEW_SCHEDULED');
  assert.equal(eventTypeForApplicationStatus('accepted'), 'ACCEPTED');
  assert.equal(eventTypeForApplicationStatus('rejected'), 'REJECTED');
});

test('AppContext invokes delivery after confirmed signup, interview, and decision results', async () => {
  const source = await readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /sendApplicationNotification/);
  assert.match(source, /signup_\$\{signupResult\.userId\}/);
  assert.match(source, /INTERVIEW_SCHEDULED/);
  assert.match(source, /status === 'accepted' \? 'ACCEPTED' : 'REJECTED'/);
  assert.match(source, /emailWarning/);

  const interviewMutation = source.indexOf('scheduleStudentApplicationInterview(applicationId, interview)');
  const interviewDelivery = source.indexOf("'INTERVIEW_SCHEDULED'", interviewMutation);
  assert.ok(interviewMutation >= 0 && interviewDelivery > interviewMutation);

  const decisionMutation = source.indexOf('decideStudentApplication(applicationId, status, rejectionReason)');
  const decisionDelivery = source.indexOf("status === 'accepted' ? 'ACCEPTED' : 'REJECTED'", decisionMutation);
  assert.ok(decisionMutation >= 0 && decisionDelivery > decisionMutation);
});

test('registration and president applications UI distinguish saved operations from email warnings', async () => {
  const authSource = await readFile(new URL('../src/pages/AuthPages.tsx', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../src/pages/AdminDashboard.tsx', import.meta.url), 'utf8');
  assert.match(authSource, /emailWarning/);
  assert.match(authSource, /border-amber/);
  assert.match(adminSource, /applicationEmailNotifications/);
  assert.match(adminSource, /إعادة إرسال البريد/);
  assert.match(adminSource, /تم إرسال البريد/);
  assert.match(adminSource, /تعذر إرسال البريد/);
});
