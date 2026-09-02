import test from 'node:test';
import assert from 'node:assert/strict';

const lifecycle = await import('../src/domain/managedAssetLifecycle.ts');

const ok = (data) => ({ ok: true, data });
const fail = (code, message = code) => ({ ok: false, error: { code, message } });

function fixture(overrides = {}) {
  const effects = [];
  const uploaded = {
    id: '22222222-2222-4222-8222-222222222222',
    bucket: 'gallery',
    path: 'news/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg',
    publicUrl: 'https://project.supabase.co/storage/v1/object/public/gallery/news/new.jpg',
  };
  const base = {
    oldAsset: {
      id: '33333333-3333-4333-8333-333333333333',
      publicUrl: 'https://old.example/image.jpg',
    },
    upload: async () => { effects.push('upload:new'); return ok(uploaded); },
    register: async (asset) => { effects.push('register:pending'); return ok(asset); },
    commitReference: async () => { effects.push('commit:new-url'); return ok(undefined); },
    activate: async () => { effects.push('activate:new'); return ok(undefined); },
    removeObject: async () => { effects.push('remove:new'); return ok(undefined); },
    markOrphaned: async () => { effects.push('orphan:new'); return ok(undefined); },
    markReplaced: async () => { effects.push('replace:old'); return ok(undefined); },
    isOperationCurrent: () => true,
  };
  return { input: { ...base, ...overrides }, effects, uploaded };
}

test('failed content commit removes the new object and preserves the old URL', async () => {
  const setup = fixture({
    commitReference: async () => { setup.effects.push('commit:failed'); return fail('CONTENT_WRITE_FAILED'); },
  });
  const result = await lifecycle.replaceManagedAsset(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.publishedUrl, 'https://old.example/image.jpg');
  assert.deepEqual(setup.effects, ['upload:new', 'register:pending', 'commit:failed', 'remove:new', 'orphan:new']);
});

test('successful replacement activates new asset before marking old asset replaced', async () => {
  const setup = fixture();
  const result = await lifecycle.replaceManagedAsset(setup.input);

  assert.equal(result.ok, true);
  assert.equal(result.data.publishedUrl, setup.uploaded.publicUrl);
  assert.deepEqual(setup.effects, ['upload:new', 'register:pending', 'commit:new-url', 'activate:new', 'replace:old']);
});

test('registration failure removes uploaded object before returning failure', async () => {
  const setup = fixture({
    register: async () => { setup.effects.push('register:failed'); return fail('ASSET_REGISTER_FAILED'); },
  });
  const result = await lifecycle.replaceManagedAsset(setup.input);
  assert.equal(result.ok, false);
  assert.deepEqual(setup.effects, ['upload:new', 'register:failed', 'remove:new']);
});

test('stale authentication after registration rolls back and never commits content', async () => {
  let checks = 0;
  const setup = fixture({ isOperationCurrent: () => ++checks === 1 });
  const result = await lifecycle.replaceManagedAsset(setup.input);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'OPERATION_OWNER_CHANGED');
  assert.deepEqual(setup.effects, ['upload:new', 'register:pending', 'remove:new', 'orphan:new']);
});

test('old asset cleanup metadata failure returns confirmed success with warning', async () => {
  const setup = fixture({
    markReplaced: async () => { setup.effects.push('replace:failed'); return fail('OLD_ASSET_CLEANUP_FAILED'); },
  });
  const result = await lifecycle.replaceManagedAsset(setup.input);
  assert.equal(result.ok, true);
  assert.equal(result.data.warnings[0].code, 'OLD_ASSET_CLEANUP_FAILED');
  assert.deepEqual(setup.effects, ['upload:new', 'register:pending', 'commit:new-url', 'activate:new', 'replace:failed']);
});

test('createManagedAsset is replacement without an old asset', async () => {
  const setup = fixture();
  delete setup.input.oldAsset;
  const result = await lifecycle.createManagedAsset(setup.input);
  assert.equal(result.ok, true);
  assert.deepEqual(setup.effects, ['upload:new', 'register:pending', 'commit:new-url', 'activate:new']);
});
