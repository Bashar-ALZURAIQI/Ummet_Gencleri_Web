import test from 'node:test';
import assert from 'node:assert/strict';

const {
  MANAGED_ASSET_LOOKUP_COLUMNS,
  createManagedAssetRepository,
  uploadManagedAsset,
} = await import('../src/services/managedAssetService.ts');

const path = 'branding/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp';
const row = {
  id: '22222222-2222-4222-8222-222222222222',
  bucket: 'site_assets',
  object_path: path,
  public_url: 'https://example.test/logo.webp',
  kind: 'image',
  area: 'site',
  mime_type: 'image/webp',
  size_bytes: 4096,
};

function createClient(response) {
  const operations = [];
  const query = {
    select(columns) {
      operations.push(['select', columns]);
      return this;
    },
    eq(column, value) {
      operations.push(['eq', column, value]);
      return this;
    },
    maybeSingle() {
      operations.push(['maybeSingle']);
      return Promise.resolve(response);
    },
  };
  return {
    operations,
    client: {
      from(table) {
        operations.push(['from', table]);
        return query;
      },
    },
  };
}

test('managed asset lookup reads the exact registered site-logo path and maps its row', async () => {
  const fake = createClient({ data: row, error: null });

  const result = await createManagedAssetRepository(fake.client).findManagedAssetByPath('site_assets', path);

  assert.deepEqual(result, {
    ok: true,
    data: {
      id: row.id,
      bucket: 'site_assets',
      path,
      publicUrl: row.public_url,
      kind: 'image',
      area: 'site',
      mimeType: 'image/webp',
      sizeBytes: 4096,
    },
  });
  assert.deepEqual(fake.operations, [
    ['from', 'managed_assets'],
    ['select', MANAGED_ASSET_LOOKUP_COLUMNS],
    ['eq', 'bucket', 'site_assets'],
    ['eq', 'object_path', path],
    ['maybeSingle'],
  ]);
});

test('managed asset lookup returns null when the registered path is missing', async () => {
  const fake = createClient({ data: null, error: null });

  assert.deepEqual(
    await createManagedAssetRepository(fake.client).findManagedAssetByPath('site_assets', path),
    { ok: true, data: null },
  );
});

test('managed asset lookup surfaces database failures with its stable failure code', async () => {
  const fake = createClient({ data: null, error: { message: 'database unavailable' } });

  const result = await createManagedAssetRepository(fake.client).findManagedAssetByPath('site_assets', path);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ASSET_LOOKUP_FAILED');
});

test('managed asset lookup rejects malformed registered asset rows', async () => {
  for (const invalidRow of [
    { ...row, id: 1 },
    { ...row, bucket: 'unknown' },
    { ...row, object_path: '' },
    { ...row, public_url: 1 },
    { ...row, kind: 'unknown' },
    { ...row, area: 'unknown' },
    { ...row, mime_type: null },
    { ...row, size_bytes: -1 },
  ]) {
    const fake = createClient({ data: invalidRow, error: null });
    const result = await createManagedAssetRepository(fake.client).findManagedAssetByPath('site_assets', path);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'ASSET_LOOKUP_RESPONSE_INVALID');
  }
});

test('site-logo GIF upload fails before the browser Supabase client or Storage is initialized', async () => {
  const result = await uploadManagedAsset({
    usage: 'site-logo',
    ownerId: '11111111-1111-4111-8111-111111111111',
    assetId: '22222222-2222-4222-8222-222222222222',
    file: new File(['GIF89a'], 'logo.gif', { type: 'image/gif' }),
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: 'FILE_TYPE_UNSUPPORTED',
      message: 'نوع الملف غير مسموح.',
    },
  });
});
