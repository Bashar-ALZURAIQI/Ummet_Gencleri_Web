import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessContactInbox, canReplyToContactMessage, canRetryContactEmail } from '../src/domain/contactMessagingPolicy.ts';

test('only president and vice president access the institutional inbox', () => {
  assert.equal(canAccessContactInbox('PRESIDENT'), true);
  assert.equal(canAccessContactInbox('VICE_PRESIDENT'), true);
  assert.equal(canAccessContactInbox('MEDIA_HEAD'), false);
  assert.equal(canAccessContactInbox('STUDENT'), false);
});

test('one saved reply disables another reply and only failed/pending visitor email can retry', () => {
  assert.equal(canReplyToContactMessage(null), true);
  assert.equal(canReplyToContactMessage({ deliveryChannel: 'IN_APP', deliveryStatus: 'NOT_REQUIRED' }), false);
  assert.equal(canRetryContactEmail({ deliveryChannel: 'EMAIL', deliveryStatus: 'FAILED' }), true);
  assert.equal(canRetryContactEmail({ deliveryChannel: 'EMAIL', deliveryStatus: 'PENDING' }), true);
  assert.equal(canRetryContactEmail({ deliveryChannel: 'EMAIL', deliveryStatus: 'SENT' }), false);
  assert.equal(canRetryContactEmail({ deliveryChannel: 'IN_APP', deliveryStatus: 'NOT_REQUIRED' }), false);
});
