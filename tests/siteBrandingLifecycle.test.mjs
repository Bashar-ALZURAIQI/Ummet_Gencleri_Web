import test from 'node:test';
import assert from 'node:assert/strict';

const lifecycleModule = await import('../src/domain/siteBrandingLifecycle.ts');
const replaceSiteLogoAtomically = lifecycleModule.replaceSiteLogoAtomically;
const { createSiteBrandingRepository } = await import('../src/services/siteBrandingService.ts');

const ok = (data) => ({ ok: true, data });
const fail = (code, message = code) => ({ ok: false, error: { code, message } });
const confirmed = (data) => ({ kind: 'confirmed', data });
const rolledBack = (code, message = code) => ({ kind: 'rolled-back', error: { code, message } });
const indeterminate = () => ({
  kind: 'indeterminate',
  error: {
    code: 'SITE_LOGO_ATOMIC_RESULT_INDETERMINATE',
    message: 'تعذر تأكيد نتيجة تحديث الشعار؛ حدّث الصفحة قبل إعادة المحاولة.',
  },
});

const president = {
  userId: '11111111-1111-4111-8111-111111111111',
  epoch: 7,
  role: 'PRESIDENT',
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

function fixture(overrides = {}) {
  const effects = [];
  let activeOwner = president;
  let appliedPublication = null;
  const siteContent = {
    brand: {
      name: 'اتحاد شباب الأمة',
      nameTr: 'Ummet Gençleri Birliği',
      logoIcon: 'Users',
      logoUrl: oldAsset.publicUrl,
      logoPath: oldAsset.path,
    },
    hero: { title: 'يبقى هذا المحتوى كاملاً' },
  };
  const input = {
    siteContent,
    expectedVersion: 7,
    captureOwner: () => activeOwner,
    upload: async (owner) => {
      effects.push(`upload:${owner.userId}`);
      return ok(newAsset);
    },
    register: async (asset) => {
      effects.push(`register:${asset.id}`);
      return ok(asset);
    },
    publishAtomically: async ({ newContent, expectedVersion, newAsset: asset }) => {
      effects.push(`atomic:${expectedVersion}:${asset.id}`);
      return confirmed({
        content: newContent,
        version: expectedVersion + 1,
        updatedAt: '2026-08-31T12:00:00.000Z',
        newAsset: asset,
        oldAsset,
      });
    },
    applyPublication: (publication) => {
      effects.push(`apply:${publication.version}`);
      appliedPublication = publication;
    },
    removeObject: async (asset) => {
      effects.push(`remove:${asset.id}`);
      return ok(undefined);
    },
    markOrphaned: async (assetId) => {
      effects.push(`orphaned:${assetId}`);
      return ok(undefined);
    },
    ...overrides,
  };
  return {
    input,
    effects,
    siteContent,
    setOwner: (owner) => { activeOwner = owner; },
    getAppliedPublication: () => appliedPublication,
  };
}

function run(input) {
  assert.equal(typeof replaceSiteLogoAtomically, 'function', 'atomic site-logo coordinator must exist');
  return replaceSiteLogoAtomically(input);
}

test('confirmed atomic envelope is applied before old-object cleanup and needs no client status calls', async () => {
  let atomicInput;
  const setup = fixture({
    publishAtomically: async (input) => {
      setup.effects.push(`atomic:${input.expectedVersion}:${input.newAsset.id}`);
      atomicInput = input;
      return confirmed({
        content: input.newContent,
        version: 8,
        updatedAt: '2026-08-31T12:00:00.000Z',
        newAsset,
        oldAsset,
      });
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { ...newAsset, warnings: [] });
  assert.deepEqual(atomicInput, {
    newContent: {
      ...setup.siteContent,
      brand: {
        ...setup.siteContent.brand,
        logoUrl: newAsset.publicUrl,
        logoPath: newAsset.path,
      },
    },
    expectedVersion: 7,
    newAsset,
  });
  assert.equal(setup.getAppliedPublication().newAsset.id, newAsset.id);
  assert.deepEqual(setup.effects, [
    `upload:${president.userId}`,
    `register:${newAsset.id}`,
    `atomic:7:${newAsset.id}`,
    'apply:8',
    `remove:${oldAsset.id}`,
  ]);
});

test('owner change during atomic publish returns committed indeterminate UI result without apply or cleanup', async () => {
  const setup = fixture({
    publishAtomically: async ({ newContent }) => {
      setup.effects.push('atomic:committed');
      setup.setOwner({ ...president, epoch: president.epoch + 1 });
      return confirmed({
        content: newContent,
        version: 8,
        updatedAt: '2026-08-31T12:00:00.000Z',
        newAsset,
        oldAsset,
      });
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, true);
  assert.equal(result.error.code, 'SITE_LOGO_COMMITTED_OWNER_CHANGED');
  assert.match(result.error.message, /تم تحديث الشعار في الخادم/);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(setup.effects, [
    `upload:${president.userId}`,
    `register:${newAsset.id}`,
    'atomic:committed',
  ]);
  assert.equal(setup.getAppliedPublication(), null);
});

test('atomic publication failure rolls back the registered object and preserves old content', async () => {
  const setup = fixture({
    publishAtomically: async () => {
      setup.effects.push('atomic:failed');
      return rolledBack('CONTENT_VERSION_CONFLICT', 'نُشر تعديل أحدث.');
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, false);
  assert.equal(result.error.code, 'CONTENT_VERSION_CONFLICT');
  assert.deepEqual(result.warnings, []);
  assert.equal(setup.siteContent.brand.logoUrl, oldAsset.publicUrl);
  assert.deepEqual(setup.effects, [
    `upload:${president.userId}`,
    `register:${newAsset.id}`,
    'atomic:failed',
    `orphaned:${newAsset.id}`,
    `remove:${newAsset.id}`,
  ]);
});

test('confirmed rollback marks the registered asset orphaned before attempting object removal', async () => {
  const setup = fixture({
    publishAtomically: async () => {
      setup.effects.push('atomic:failed');
      return rolledBack('22023', 'رفضت قاعدة البيانات نشر الشعار.');
    },
    removeObject: async (asset) => {
      setup.effects.push(`remove:failed:${asset.id}`);
      return fail('ASSET_REMOVE_FAILED', 'تعذر حذف ملف الشعار الجديد من التخزين.');
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, false);
  assert.deepEqual(result.warnings, ['تعذر حذف ملف الشعار الجديد من التخزين.']);
  assert.deepEqual(setup.effects.slice(-2), [
    `orphaned:${newAsset.id}`,
    `remove:failed:${newAsset.id}`,
  ]);
});

test('orphan transition failure preserves the registered object and returns a warning', async () => {
  const setup = fixture({
    publishAtomically: async () => {
      setup.effects.push('atomic:failed');
      return rolledBack('22023', 'رفضت قاعدة البيانات نشر الشعار.');
    },
    markOrphaned: async (assetId) => {
      setup.effects.push(`orphaned:failed:${assetId}`);
      return fail('ASSET_STATUS_FAILED', 'تعذر تعليم ملف الشعار الجديد كملف يتيم.');
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, false);
  assert.deepEqual(result.warnings, ['تعذر تعليم ملف الشعار الجديد كملف يتيم.']);
  assert.deepEqual(setup.effects.slice(-1), [`orphaned:failed:${newAsset.id}`]);
  assert.equal(setup.effects.some((effect) => effect.startsWith('remove:')), false);
});

test('indeterminate atomic outcome preserves the registered object without orphan or removal', async () => {
  const setup = fixture({
    publishAtomically: async () => {
      setup.effects.push('atomic:response-lost');
      return indeterminate();
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, true);
  assert.equal(result.error.code, 'SITE_LOGO_ATOMIC_RESULT_INDETERMINATE');
  assert.match(result.error.message, /تعذر تأكيد.*حدّث الصفحة/);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(setup.effects, [
    `upload:${president.userId}`,
    `register:${newAsset.id}`,
    'atomic:response-lost',
  ]);
});

test('a lost RPC response after a possible commit leaves the registered object untouched', async () => {
  const repository = createSiteBrandingRepository({
    rpc: async () => { throw new Error('response lost after commit'); },
  });
  const setup = fixture({
    publishAtomically: async (input) => {
      setup.effects.push('atomic:network-lost');
      return repository.replace(input);
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, true);
  assert.equal(result.error.code, 'SITE_LOGO_ATOMIC_RESULT_INDETERMINATE');
  assert.deepEqual(setup.effects.slice(-1), ['atomic:network-lost']);
  assert.equal(setup.effects.some((effect) => effect.startsWith('orphaned:')), false);
  assert.equal(setup.effects.some((effect) => effect.startsWith('remove:')), false);
});

test('a malformed success envelope leaves the possibly active object untouched', async () => {
  const repository = createSiteBrandingRepository({
    rpc: async () => ({ data: { target: 'site' }, error: null }),
  });
  const setup = fixture({
    publishAtomically: async (input) => {
      setup.effects.push('atomic:malformed-envelope');
      return repository.replace(input);
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, true);
  assert.equal(result.error.code, 'SITE_LOGO_ATOMIC_RESULT_INDETERMINATE');
  assert.deepEqual(setup.effects.slice(-1), ['atomic:malformed-envelope']);
  assert.equal(setup.effects.some((effect) => effect.startsWith('orphaned:')), false);
  assert.equal(setup.effects.some((effect) => effect.startsWith('remove:')), false);
});

test('registration failure reports uploaded-object cleanup failure and never marks an unregistered asset orphaned', async () => {
  const setup = fixture({
    register: async (asset) => {
      setup.effects.push(`register:failed:${asset.id}`);
      return fail('ASSET_REGISTER_FAILED', 'تعذر تسجيل الشعار.');
    },
    removeObject: async (asset) => {
      setup.effects.push(`remove:failed:${asset.id}`);
      return fail('ASSET_REMOVE_FAILED', 'تعذر حذف الملف المرفوع غير المسجل.');
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, false);
  assert.deepEqual(result.warnings, ['تعذر حذف الملف المرفوع غير المسجل.']);
  assert.deepEqual(setup.effects, [
    `upload:${president.userId}`,
    `register:failed:${newAsset.id}`,
    `remove:failed:${newAsset.id}`,
  ]);
});

test('owner change after registration rolls back before invoking the atomic RPC', async () => {
  const setup = fixture({
    register: async (asset) => {
      setup.effects.push(`register:${asset.id}`);
      setup.setOwner({ ...president, userId: '44444444-4444-4444-8444-444444444444' });
      return ok(asset);
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, false);
  assert.equal(result.error.code, 'OPERATION_OWNER_CHANGED');
  assert.deepEqual(setup.effects, [
    `upload:${president.userId}`,
    `register:${newAsset.id}`,
    `orphaned:${newAsset.id}`,
    `remove:${newAsset.id}`,
  ]);
});

test('confirmed publication cleanup failure is successful with a visible warning', async () => {
  const setup = fixture({
    removeObject: async (asset) => {
      setup.effects.push(`remove:failed:${asset.id}`);
      return fail('ASSET_REMOVE_FAILED', 'تم تحديث الشعار، لكن تعذر تنظيف الملف السابق.');
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.warnings, ['تم تحديث الشعار، لكن تعذر تنظيف الملف السابق.']);
  assert.deepEqual(setup.effects.slice(-2), ['apply:8', `remove:failed:${oldAsset.id}`]);
});

test('legacy publication envelope without a managed old asset never performs old-object cleanup', async () => {
  const setup = fixture({
    publishAtomically: async ({ newContent }) => {
      setup.effects.push('atomic:legacy');
      return confirmed({
        content: newContent,
        version: 8,
        updatedAt: '2026-08-31T12:00:00.000Z',
        newAsset,
        oldAsset: null,
      });
    },
  });

  const result = await run(setup.input);

  assert.equal(result.ok, true);
  assert.deepEqual(setup.effects.slice(-2), ['atomic:legacy', 'apply:8']);
});

test('a non-president cannot begin upload', async () => {
  const setup = fixture({ captureOwner: () => ({ ...president, role: 'MEDIA_HEAD' }) });

  const result = await run(setup.input);

  assert.equal(result.ok, false);
  assert.equal(result.committed, false);
  assert.equal(result.error.code, 'SITE_LOGO_FORBIDDEN');
  assert.deepEqual(setup.effects, []);
});
