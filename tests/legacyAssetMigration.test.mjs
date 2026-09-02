import test from 'node:test';
import assert from 'node:assert/strict';

const migration = await import('../src/domain/legacyAssetMigration.ts');

test('collects only file-backed image fields and keeps social/video links untouched', () => {
  const value = {
    image: 'https://images.example.com/news.jpg',
    externalUrl: 'https://instagram.com/p/123',
    video: 'https://youtube.com/watch?v=123',
    photoUrl: 'https://facebook.com/post/1',
    thumbnail: 'https://images.example.com/thumb.webp',
  };

  assert.deepEqual(migration.collectLegacyImageAssets(value), [
    { path: ['image'], sourceUrl: value.image, usage: 'site-image' },
    { path: ['thumbnail'], sourceUrl: value.thumbnail, usage: 'gallery-image' },
  ]);
});

test('routes news, events, gallery, site and avatars by their content path', () => {
  const value = {
    news: [{ image: 'https://cdn.example.com/news.png' }],
    events: [{ image: 'https://cdn.example.com/event.jpg' }],
    galleryAlbums: [{ coverImage: 'https://cdn.example.com/cover.jpg', media: [{ type: 'photo', url: 'https://cdn.example.com/photo.jpg' }] }],
    site: { hero: { image: 'https://cdn.example.com/hero.webp' } },
    committees: [{ head: { photo: 'https://cdn.example.com/avatar.jpg' } }],
  };

  assert.deepEqual(migration.collectLegacyImageAssets(value).map((asset) => asset.usage), [
    'news-image',
    'event-image',
    'gallery-image',
    'gallery-image',
    'site-image',
    'avatar',
  ]);
});

test('replaces exact collected paths without mutating the source bundle', () => {
  const source = { news: [{ image: 'https://cdn.example.com/old.jpg', externalUrl: 'https://instagram.com/x' }] };
  const next = migration.replaceLegacyAssetUrls(source, new Map([
    ['https://cdn.example.com/old.jpg', 'https://project.supabase.co/storage/v1/object/public/gallery/news/new.jpg'],
  ]));

  assert.notEqual(next, source);
  assert.equal(source.news[0].image, 'https://cdn.example.com/old.jpg');
  assert.equal(next.news[0].image, 'https://project.supabase.co/storage/v1/object/public/gallery/news/new.jpg');
  assert.equal(next.news[0].externalUrl, source.news[0].externalUrl);
});

test('does not re-migrate existing Supabase Storage URLs, data URLs, blobs, or unsafe schemes', () => {
  const value = {
    image: 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/gallery/site/x.jpg',
    images: ['data:image/png;base64,abc', 'blob:https://example.com/id', 'javascript:alert(1)'],
  };
  assert.deepEqual(migration.collectLegacyImageAssets(value), []);
});
