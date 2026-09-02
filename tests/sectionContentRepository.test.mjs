import test from 'node:test';
import assert from 'node:assert/strict';

const { createSectionContentRepository } = await import('../src/domain/sectionContentRepository.ts');

function createClient({ guideResponse, faqResponse, publishResponse }) {
  const calls = [];
  const responses = { student_guide: guideResponse, faq: faqResponse };
  return {
    calls,
    client: {
      from(table) {
        calls.push(['from', table]);
        return {
          select(columns) {
            calls.push(['select', columns]);
            return this;
          },
          eq(column, value) {
            calls.push(['eq', column, value]);
            return this;
          },
          maybeSingle() {
            calls.push(['maybeSingle']);
            return Promise.resolve(responses[table]);
          },
        };
      },
      rpc(name, args) {
        calls.push(['rpc', name, args]);
        return Promise.resolve(publishResponse);
      },
    },
  };
}

test('loads strict versioned guide and FAQ singleton rows', async () => {
  const fake = createClient({
    guideResponse: {
      data: { quick_info: 'نصيحة', sections: [{ id: 's1' }], version: 3, updated_at: '2026-08-25T10:00:00Z' },
      error: null,
    },
    faqResponse: {
      data: { categories: [{ id: 'c1' }], version: 4, updated_at: '2026-08-25T11:00:00Z' },
      error: null,
    },
    publishResponse: { data: null, error: null },
  });
  const repo = createSectionContentRepository(fake.client);
  assert.deepEqual(await repo.loadGuide(), {
    ok: true,
    data: { quickInfo: 'نصيحة', sections: [{ id: 's1' }], version: 3, updatedAt: '2026-08-25T10:00:00Z' },
  });
  assert.deepEqual(await repo.loadFaq(), {
    ok: true,
    data: { categories: [{ id: 'c1' }], version: 4, updatedAt: '2026-08-25T11:00:00Z' },
  });
});

test('publishes a target with an exact expected version and maps the confirmed envelope', async () => {
  const fake = createClient({
    guideResponse: { data: null, error: null },
    faqResponse: { data: null, error: null },
    publishResponse: {
      data: { target: 'faqCategories', payload: [], version: 5, updated_at: '2026-08-25T12:00:00Z' },
      error: null,
    },
  });
  const result = await createSectionContentRepository(fake.client).publish('faqCategories', [], 4);
  assert.deepEqual(result, {
    ok: true,
    data: { target: 'faqCategories', payload: [], version: 5, updatedAt: '2026-08-25T12:00:00Z' },
  });
  assert.deepEqual(fake.calls, [[
    'rpc',
    'publish_cms_target',
    { p_target: 'faqCategories', p_payload: [], p_expected_version: 4 },
  ]]);
});

test('creates one published event through the dedicated executive-only RPC', async () => {
  const fake = createClient({
    guideResponse: { data: null, error: null },
    faqResponse: { data: null, error: null },
    publishResponse: {
      data: { target: 'events', payload: [{ id: 'event-1' }], version: 6, updated_at: '2026-08-30T12:00:00Z' },
      error: null,
    },
  });
  const event = { id: 'event-1', title: 'فعالية جديدة' };
  const result = await createSectionContentRepository(fake.client).createEvent(event, 5);
  assert.equal(result.ok, true);
  assert.deepEqual(fake.calls, [[
    'rpc',
    'create_published_event',
    { p_event: event, p_expected_version: 5 },
  ]]);
});

test('maps a publish conflict and malformed rows to stable failures', async () => {
  const conflict = createClient({
    guideResponse: { data: { quick_info: '', sections: {}, version: 0, updated_at: null }, error: null },
    faqResponse: { data: null, error: null },
    publishResponse: { data: null, error: { code: '40001', message: 'CONTENT_VERSION_CONFLICT' } },
  });
  const repo = createSectionContentRepository(conflict.client);
  assert.equal((await repo.loadGuide()).error.code, 'SECTION_CONTENT_RESPONSE_INVALID');
  assert.equal((await repo.publish('guideSections', [], 2)).error.code, 'CONTENT_VERSION_CONFLICT');
});
