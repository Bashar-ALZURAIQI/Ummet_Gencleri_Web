import assert from 'node:assert/strict';
import test from 'node:test';

import { createGuideSuggestionRepository } from '../src/domain/guideSuggestionRepository.ts';

const row = {
  id: 'd41e3a31-35aa-4b69-a4df-57de3db680d4',
  student_name: 'أحمد محمد',
  subject: 'تحديث السكن',
  description: 'يوجد عنوان أحدث للسكن.',
  status: 'REVIEWING',
  created_at: '2026-08-26T16:00:00.000Z',
};

test('submits only normalized public fields and leaves status to the database default', async () => {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, 'guide_suggestions');
      return {
        insert: async (payload) => {
          calls.push(payload);
          return { data: null, error: null };
        },
      };
    },
  };

  const result = await createGuideSuggestionRepository(client).submit({
    studentName: '  أحمد محمد ',
    subject: ' تحديث السكن ',
    description: ' يوجد عنوان أحدث للسكن. ',
  });

  assert.deepEqual(result, { ok: true, data: undefined });
  assert.deepEqual(calls, [[{
    student_name: 'أحمد محمد',
    subject: 'تحديث السكن',
    description: 'يوجد عنوان أحدث للسكن.',
  }]]);
});

test('lists newest RLS-visible suggestions and maps database names', async () => {
  const client = {
    from() {
      return {
        select(columns) {
          assert.equal(columns, 'id,student_name,subject,description,status,created_at');
          return this;
        },
        order: async (column, options) => {
          assert.equal(column, 'created_at');
          assert.deepEqual(options, { ascending: false });
          return { data: [row], error: null };
        },
      };
    },
  };

  const result = await createGuideSuggestionRepository(client).list();

  assert.deepEqual(result, { ok: true, data: [{
    id: row.id,
    studentName: 'أحمد محمد',
    subject: 'تحديث السكن',
    description: 'يوجد عنوان أحدث للسكن.',
    status: 'REVIEWING',
    createdAt: row.created_at,
  }] });
});

test('updates only the selected suggestion status', async () => {
  const calls = [];
  const client = {
    from() {
      return {
        update(payload) {
          calls.push(['update', payload]);
          return this;
        },
        eq(column, value) {
          calls.push(['eq', column, value]);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };

  const result = await createGuideSuggestionRepository(client).updateStatus(row.id, 'IMPLEMENTED');

  assert.deepEqual(result, { ok: true, data: undefined });
  assert.deepEqual(calls, [['update', { status: 'IMPLEMENTED' }], ['eq', 'id', row.id]]);
});

test('deletes only the selected suggestion', async () => {
  const calls = [];
  const client = {
    from() {
      return {
        delete() {
          calls.push(['delete']);
          return this;
        },
        eq(column, value) {
          calls.push(['eq', column, value]);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };

  const result = await createGuideSuggestionRepository(client).remove(row.id);

  assert.deepEqual(result, { ok: true, data: undefined });
  assert.deepEqual(calls, [['delete'], ['eq', 'id', row.id]]);
});

test('returns explicit failures for malformed rows and Supabase errors', async () => {
  const malformedClient = {
    from() {
      return { select() { return this; }, order: async () => ({ data: [{ id: 'broken' }], error: null }) };
    },
  };
  const deniedClient = {
    from() {
      return { insert: async () => ({ data: null, error: { code: '42501', message: 'denied', details: 'RLS' } }) };
    },
  };

  const malformed = await createGuideSuggestionRepository(malformedClient).list();
  const denied = await createGuideSuggestionRepository(deniedClient).submit({ studentName: 'أحمد', subject: 'عنوان', description: 'تفاصيل' });

  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, 'GUIDE_SUGGESTIONS_RESPONSE_INVALID');
  assert.deepEqual(denied, { ok: false, error: { code: '42501', message: 'denied', details: 'RLS' } });
});
