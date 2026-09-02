import test from 'node:test';
import assert from 'node:assert/strict';

const serviceModule = await import('../src/services/siteBrandingService.ts').catch(() => ({}));
const createSiteBrandingRepository = serviceModule.createSiteBrandingRepository;

const newAsset = {
  id: '33333333-3333-4333-8333-333333333333',
  bucket: 'site_assets',
  path: 'branding/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png',
  publicUrl: 'https://assets.example/new.png',
  kind: 'image',
  area: 'site',
  mimeType: 'image/png',
  sizeBytes: 4096,
};

const oldAsset = {
  id: '22222222-2222-4222-8222-222222222222',
  bucket: 'site_assets',
  path: 'branding/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp',
  publicUrl: 'https://assets.example/old.webp',
  kind: 'image',
  area: 'site',
  mimeType: 'image/webp',
  sizeBytes: 2048,
};

const content = {
  brand: {
    name: 'اتحاد شباب الأمة',
    logoIcon: 'Users',
    logoUrl: newAsset.publicUrl,
    logoPath: newAsset.path,
  },
  hero: { title: 'محتوى كامل' },
};

const rowFor = (asset, status) => ({
  id: asset.id,
  bucket: asset.bucket,
  object_path: asset.path,
  public_url: asset.publicUrl,
  kind: asset.kind,
  area: asset.area,
  mime_type: asset.mimeType,
  size_bytes: asset.sizeBytes,
  status,
});

function factory(client) {
  assert.equal(typeof createSiteBrandingRepository, 'function', 'injectable atomic branding repository must exist');
  return createSiteBrandingRepository(client);
}

test('repository calls the atomic RPC once and maps its confirmed content and asset states', async () => {
  const calls = [];
  const repository = factory({
    async rpc(name, args) {
      calls.push([name, args]);
      return {
        data: {
          target: 'site',
          payload: content,
          version: 8,
          updated_at: '2026-08-31T12:00:00.000Z',
          new_asset: rowFor(newAsset, 'active'),
          old_asset: rowFor(oldAsset, 'replaced'),
        },
        error: null,
      };
    },
  });

  const result = await repository.replace({ newContent: content, expectedVersion: 7, newAsset });

  assert.deepEqual(calls, [[
    'replace_site_logo',
    { p_new_content: content, p_expected_version: 7, p_new_asset_id: newAsset.id },
  ]]);
  assert.deepEqual(result, {
    kind: 'confirmed',
    data: {
      content,
      version: 8,
      updatedAt: '2026-08-31T12:00:00.000Z',
      newAsset,
      oldAsset,
    },
  });
});

test('repository accepts a confirmed legacy replacement with no managed old asset', async () => {
  const repository = factory({
    rpc: async () => ({
      data: {
        target: 'site',
        payload: content,
        version: 8,
        updated_at: '2026-08-31T12:00:00.000Z',
        new_asset: rowFor(newAsset, 'active'),
        old_asset: null,
      },
      error: null,
    }),
  });

  const result = await repository.replace({ newContent: content, expectedVersion: 7, newAsset });
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.data.oldAsset, null);
});

test('malformed or partially confirmed envelopes are indeterminate possibly-committed outcomes', async () => {
  const valid = {
    target: 'site',
    payload: content,
    version: 8,
    updated_at: '2026-08-31T12:00:00.000Z',
    new_asset: rowFor(newAsset, 'active'),
    old_asset: rowFor(oldAsset, 'replaced'),
  };
  const invalidRows = [
    null,
    { ...valid, target: 'about' },
    { ...valid, payload: [] },
    { ...valid, version: 7 },
    { ...valid, new_asset: rowFor(newAsset, 'pending') },
    { ...valid, new_asset: { ...rowFor(newAsset, 'active'), id: oldAsset.id } },
    { ...valid, new_asset: { ...rowFor(newAsset, 'active'), object_path: oldAsset.path } },
    { ...valid, new_asset: { ...rowFor(newAsset, 'active'), public_url: oldAsset.publicUrl } },
    { ...valid, old_asset: rowFor(oldAsset, 'active') },
    { ...valid, payload: { ...content, brand: { ...content.brand, logoPath: oldAsset.path } } },
  ];

  for (const data of invalidRows) {
    const result = await factory({ rpc: async () => ({ data, error: null }) })
      .replace({ newContent: content, expectedVersion: 7, newAsset });
    assert.equal(result.kind, 'indeterminate');
    assert.equal(result.error.code, 'SITE_LOGO_ATOMIC_RESPONSE_INVALID');
  }
});

test('stable PostgreSQL SQLSTATE errors prove the RPC transaction rolled back', async () => {
  const errors = [
    { code: '40001', message: 'CONTENT_VERSION_CONFLICT' },
    { code: '42501', message: 'private authorization detail' },
    { code: '22023', message: 'private validation detail' },
    { code: 'P0002', message: 'private missing-row detail' },
    { code: '23505', message: 'private constraint detail' },
  ];

  for (const error of errors) {
    const result = await factory({ rpc: async () => ({ data: null, error }) })
      .replace({ newContent: content, expectedVersion: 7, newAsset });
    assert.equal(result.kind, 'rolled-back');
    assert.doesNotMatch(result.error.message, /private/);
  }
});

test('lost responses and untrusted errors remain indeterminate and never expose transport details', async () => {
  const errors = [
    { code: 'PGRST000', message: 'database connection failed after commit' },
    { code: 'ABORT_ERR', message: 'request aborted after commit' },
    { code: 'ECONN', message: 'connection outcome unknown' },
    { message: 'failed to fetch after commit' },
  ];

  for (const error of errors) {
    const result = await factory({ rpc: async () => ({ data: null, error }) })
      .replace({ newContent: content, expectedVersion: 7, newAsset });
    assert.equal(result.kind, 'indeterminate');
    assert.equal(result.error.code, 'SITE_LOGO_ATOMIC_RESULT_INDETERMINATE');
    assert.doesNotMatch(result.error.message, /connection failed|aborted|failed to fetch/);
  }

  const thrown = await factory({
    rpc: async () => { throw new Error('response lost after commit'); },
  }).replace({ newContent: content, expectedVersion: 7, newAsset });
  assert.equal(thrown.kind, 'indeterminate');
  assert.equal(thrown.error.code, 'SITE_LOGO_ATOMIC_RESULT_INDETERMINATE');
  assert.doesNotMatch(thrown.error.message, /response lost/);
});
