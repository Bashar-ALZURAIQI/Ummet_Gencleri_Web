import assert from 'node:assert/strict';
import test from 'node:test';

import { createContactMessagingRepository } from '../src/domain/contactMessagingRepository.ts';

const messageRow = {
  id: 'm-1', sender_user_id: 'student-1', sender_name: 'أحمد', sender_email: 'ahmad@example.com',
  subject: 'استفسار', message: 'أحتاج إلى مساعدة', status: 'REPLIED', read_at: '2026-08-25T10:00:00Z',
  read_by: 'president-1', created_at: '2026-08-25T09:00:00Z', updated_at: '2026-08-25T10:05:00Z',
  contact_message_replies: [{
    id: 'r-1', message_id: 'm-1', reply_text: 'تمت المساعدة', replied_by: 'president-1',
    replied_by_name: 'الرئيس', replied_by_role: 'PRESIDENT', delivery_channel: 'IN_APP',
    delivery_status: 'NOT_REQUIRED', delivery_attempts: 0, delivery_last_error: null,
    email_provider_id: null, replied_at: '2026-08-25T10:05:00Z', sent_at: null,
  }],
};

test('lists RLS-visible messages and maps their single administrative reply', async () => {
  const client = {
    from() {
      return {
        select() { return this; },
        order: async () => ({ data: [messageRow], error: null }),
      };
    },
    rpc: async () => ({ data: null, error: null }),
  };
  const result = await createContactMessagingRepository(client).listVisible();
  assert.equal(result.ok, true);
  assert.equal(result.data[0].reply.replyText, 'تمت المساعدة');
  assert.equal(result.data[0].reply.repliedByRole, 'PRESIDENT');
});

test('submits visitor or student messages only through the validation RPC', async () => {
  const calls = [];
  const client = {
    from() { throw new Error('direct writes are forbidden'); },
    rpc: async (name, args) => { calls.push([name, args]); return { data: 'm-2', error: null }; },
  };
  const result = await createContactMessagingRepository(client).submit({
    senderName: 'زائر', senderEmail: 'visitor@example.com', subject: 'مساعدة', message: 'لا أستطيع التسجيل',
  });
  assert.deepEqual(calls, [['submit_contact_message', {
    p_sender_name: 'زائر', p_sender_email: 'visitor@example.com', p_subject: 'مساعدة', p_message: 'لا أستطيع التسجيل',
  }]]);
  assert.deepEqual(result, { ok: true, data: { id: 'm-2' } });
});

test('marks read and replies through role-protected RPCs', async () => {
  const calls = [];
  const client = {
    from() { throw new Error('unused'); },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'mark_contact_message_read') return { data: messageRow, error: null };
      return { data: messageRow.contact_message_replies[0], error: null };
    },
  };
  const repository = createContactMessagingRepository(client);
  assert.equal((await repository.markRead('m-1')).ok, true);
  const reply = await repository.reply('m-1', 'تمت المساعدة');
  assert.equal(reply.ok, true);
  assert.equal(reply.data.deliveryChannel, 'IN_APP');
  assert.deepEqual(calls.map(([name]) => name), ['mark_contact_message_read', 'reply_to_contact_message']);
});

test('rejects malformed rows instead of inventing a successful inbox', async () => {
  const client = {
    from() { return { select() { return this; }, order: async () => ({ data: [{ id: 'broken' }], error: null }) }; },
    rpc: async () => ({ data: null, error: { code: '42501', message: 'denied' } }),
  };
  const repository = createContactMessagingRepository(client);
  assert.equal((await repository.listVisible()).ok, false);
  assert.equal((await repository.reply('m-1', 'ok')).ok, false);
});
