import test from 'node:test';
import assert from 'node:assert/strict';

const { createSiteContentRepository } = await import('../src/domain/siteContentRepository.ts');

function createClient({ loadResponse, publishResponse }) {
  const operations = [];
  const query = {
    select(columns) { operations.push(['select', columns]); return this; },
    eq(column, value) { operations.push(['eq', column, value]); return this; },
    maybeSingle() { operations.push(['maybeSingle']); return Promise.resolve(loadResponse); },
  };
  return {
    operations,
    client: {
      from(table) { operations.push(['from', table]); return query; },
      rpc(name, args) { operations.push(['rpc', name, args]); return Promise.resolve(publishResponse); },
    },
  };
}

test('loads the authoritative published bundle and version', async () => {
  const content = { news: [{ id: 'n1', image: 'https://storage/news.jpg' }] };
  const fake = createClient({
    loadResponse: { data: { content, version: 7, updated_at: '2026-08-24T10:00:00Z' }, error: null },
    publishResponse: { data: null, error: null },
  });
  const result = await createSiteContentRepository(fake.client).load();

  assert.deepEqual(result, {
    ok: true,
    data: { content, version: 7, updatedAt: '2026-08-24T10:00:00Z' },
  });
  assert.deepEqual(fake.operations, [
    ['from', 'published_site_content'],
    ['select', 'content,version,updated_at'],
    ['eq', 'id', 'main'],
    ['maybeSingle'],
  ]);
});

test('missing published row is explicit and never replaced with local defaults', async () => {
  const fake = createClient({
    loadResponse: { data: null, error: null },
    publishResponse: { data: null, error: null },
  });
  const result = await createSiteContentRepository(fake.client).load();
  assert.deepEqual(result, { ok: true, data: null });
});

test('publishes with exact expected version and returns confirmed next version', async () => {
  const content = { hero: { title: 'الجديد' } };
  const fake = createClient({
    loadResponse: { data: null, error: null },
    publishResponse: { data: { content, version: 5, updated_at: '2026-08-24T11:00:00Z' }, error: null },
  });
  const result = await createSiteContentRepository(fake.client).publish(content, 4);
  assert.deepEqual(result, {
    ok: true,
    data: { content, version: 5, updatedAt: '2026-08-24T11:00:00Z' },
  });
  assert.deepEqual(fake.operations, [
    ['rpc', 'publish_site_content', { new_content: content, expected_version: 4 }],
  ]);
});

test('maps a stale version to a stable conflict code', async () => {
  const fake = createClient({
    loadResponse: { data: null, error: null },
    publishResponse: { data: null, error: { code: '40001', message: 'CONTENT_VERSION_CONFLICT' } },
  });
  const result = await createSiteContentRepository(fake.client).publish({ news: [] }, 2);
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'CONTENT_VERSION_CONFLICT',
      message: 'نُشر تعديل أحدث على الموقع. حدّث الصفحة ثم أعد المحاولة.',
    },
  });
});

test('malformed server rows fail closed', async () => {
  const fake = createClient({
    loadResponse: { data: { content: [], version: 0, updated_at: null }, error: null },
    publishResponse: { data: null, error: null },
  });
  const result = await createSiteContentRepository(fake.client).load();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SITE_CONTENT_RESPONSE_INVALID');
});
