import test from 'node:test';
import assert from 'node:assert/strict';

const assets = await import('../src/domain/managedAssets.ts');

const ownerId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';

test('routes every local asset usage to its required bucket and folder', () => {
  assert.deepEqual(assets.routeForUsage('avatar'), { bucket: 'avatars', folder: null, kind: 'image', area: 'avatar' });
  assert.deepEqual(assets.routeForUsage('news-image'), { bucket: 'gallery', folder: 'news', kind: 'image', area: 'news' });
  assert.deepEqual(assets.routeForUsage('event-image'), { bucket: 'gallery', folder: 'events', kind: 'image', area: 'events' });
  assert.deepEqual(assets.routeForUsage('gallery-image'), { bucket: 'gallery', folder: 'albums', kind: 'image', area: 'gallery' });
  assert.deepEqual(assets.routeForUsage('site-image'), { bucket: 'gallery', folder: 'site', kind: 'image', area: 'site' });
  assert.deepEqual(assets.routeForUsage('plan-document'), { bucket: 'gallery', folder: 'documents', kind: 'document', area: 'plans' });
  assert.deepEqual(assets.routeForUsage('report-document'), { bucket: 'gallery', folder: 'documents', kind: 'document', area: 'reports' });
  assert.deepEqual(assets.routeForUsage('video-file'), { bucket: 'gallery', folder: 'videos', kind: 'video', area: 'gallery' });
  assert.deepEqual(assets.routeForUsage('site-logo'), { bucket: 'site_assets', folder: 'branding', kind: 'image', area: 'site' });
});

test('validates allowed files using per-kind MIME and size limits', () => {
  assert.equal(assets.validateManagedFile({ name: 'photo.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 }, 'image').ok, true);
  assert.equal(assets.validateManagedFile({ name: 'clip.mp4', type: 'video/mp4', size: 50 * 1024 * 1024 }, 'video').ok, true);
  assert.equal(assets.validateManagedFile({ name: 'report.pdf', type: 'application/pdf', size: 20 * 1024 * 1024 }, 'document').ok, true);
});

test('rejects unsafe, oversized, empty, and spoofed files', () => {
  assert.equal(assets.validateManagedFile({ name: 'x.svg', type: 'image/svg+xml', size: 100 }, 'image').ok, false);
  assert.equal(assets.validateManagedFile({ name: 'x.html', type: 'text/html', size: 100 }, 'document').ok, false);
  assert.equal(assets.validateManagedFile({ name: 'x.exe', type: 'application/octet-stream', size: 100 }, 'document').ok, false);
  assert.equal(assets.validateManagedFile({ name: 'x.jpg', type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }, 'image').ok, false);
  assert.equal(assets.validateManagedFile({ name: 'x.png', type: 'image/jpeg', size: 100 }, 'image').ok, false);
  assert.equal(assets.validateManagedFile({ name: 'x.jpg', type: 'image/jpeg', size: 0 }, 'image').ok, false);
});

test('builds versioned non-overwriting paths from UUIDs and trusted MIME types', () => {
  assert.deepEqual(assets.buildManagedAssetPath({ usage: 'news-image', ownerId, assetId, mimeType: 'image/webp' }), {
    ok: true,
    path: `news/${ownerId}/${assetId}.webp`,
  });
  assert.deepEqual(assets.buildManagedAssetPath({ usage: 'avatar', ownerId, assetId, mimeType: 'image/png' }), {
    ok: true,
    path: `${ownerId}/avatar-${assetId}.png`,
  });
  assert.deepEqual(assets.buildManagedAssetPath({ usage: 'site-logo', ownerId, assetId, mimeType: 'image/webp' }), {
    ok: true,
    path: `branding/${ownerId}/${assetId}.webp`,
  });
});

test('invalid UUIDs and unsupported MIME types never produce a path', () => {
  assert.equal(assets.buildManagedAssetPath({ usage: 'news-image', ownerId: 'not-a-uuid', assetId, mimeType: 'image/jpeg' }).ok, false);
  assert.equal(assets.buildManagedAssetPath({ usage: 'news-image', ownerId, assetId, mimeType: 'image/svg+xml' }).ok, false);
});

test('owned managed paths must match exact owner and supported shape', () => {
  assert.equal(assets.isOwnedManagedPath(`news/${ownerId}/${assetId}.jpg`, ownerId), true);
  assert.equal(assets.isOwnedManagedPath(`${ownerId}/avatar-${assetId}.webp`, ownerId), true);
  assert.equal(assets.isOwnedManagedPath(`news/33333333-3333-4333-8333-333333333333/${assetId}.jpg`, ownerId), false);
  assert.equal(assets.isOwnedManagedPath(`../${ownerId}/evil.jpg`, ownerId), false);
  assert.equal(assets.isOwnedManagedPath(`branding/${ownerId}/${assetId}.png`, ownerId), true);
  assert.equal(assets.isOwnedManagedPath(`branding/${ownerId}/nested/${assetId}.png`, ownerId), false);
  assert.equal(assets.isOwnedManagedPath(`branding/33333333-3333-4333-8333-333333333333/${assetId}.jpg`, ownerId), false);
  assert.equal(assets.isOwnedManagedPath(`branding/${ownerId}/${assetId}.gif`, ownerId), false);
});

test('site logo accepts only browser-safe logo MIME types', () => {
  assert.equal(assets.acceptForUsage('site-logo'), 'image/jpeg,image/png,image/webp');
});

test('site logo validation rejects GIF and SVG without restricting gallery GIF uploads', () => {
  assert.equal(assets.validateManagedFile({ name: 'logo.gif', type: 'image/gif', size: 100 }, 'image', 'site-logo').ok, false);
  assert.equal(assets.validateManagedFile({ name: 'logo.svg', type: 'image/svg+xml', size: 100 }, 'image', 'site-logo').ok, false);
  assert.equal(assets.validateManagedFile({ name: 'gallery.gif', type: 'image/gif', size: 100 }, 'image', 'gallery-image').ok, true);
});

test('site logo paths reject GIF MIME types even when generic images allow them', () => {
  assert.equal(assets.buildManagedAssetPath({ usage: 'site-logo', ownerId, assetId, mimeType: 'image/gif' }).ok, false);
  assert.equal(assets.buildManagedAssetPath({ usage: 'gallery-image', ownerId, assetId, mimeType: 'image/gif' }).ok, true);
});
