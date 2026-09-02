import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveNewCmsPushNotifications } from '../src/domain/webPushCmsDiff.ts';

test('derives one literal notification for each genuinely new content id', () => {
  assert.deepEqual(
    deriveNewCmsPushNotifications(
      [{ id: 'n1', title: 'قديم' }],
      [{ id: 'n2', title: 'الخبر الجديد' }, { id: 'n1', title: 'قديم' }],
      'news',
    ),
    [{
      kind: 'NEWS',
      sourceEventKey: 'cms:news:n2',
      title: 'جديد اتحاد شباب الأمة: الخبر الجديد',
      body: 'تم نشر خبر جديد في موقع الاتحاد.',
      destination: '/?push=news',
    }],
  );
  assert.equal(
    deriveNewCmsPushNotifications([], [{ id: 'e1', title: 'ملتقى الطلاب' }], 'events')[0].sourceEventKey,
    'cms:events:e1',
  );
  assert.equal(
    deriveNewCmsPushNotifications([], [{ id: 'a1', title: 'ألبوم الحفل' }], 'galleryAlbums')[0].sourceEventKey,
    'cms:galleryAlbums:a1',
  );
});

test('does not notify for edits or reordering of existing ids', () => {
  const previous = [{ id: '1', title: 'الأول' }, { id: '2', title: 'الثاني' }];
  const current = [{ id: '2', title: 'الثاني بعد التعديل' }, { id: '1', title: 'الأول' }];
  assert.deepEqual(deriveNewCmsPushNotifications(previous, current, 'news'), []);
});

test('rejects duplicate stable ids because they would make notification identity ambiguous', () => {
  assert.throws(
    () => deriveNewCmsPushNotifications([], [
      { id: 'same', title: 'أ' },
      { id: 'same', title: 'ب' },
    ], 'events'),
    /CMS_CONTENT_DUPLICATE_ID/,
  );
});

test('ignores malformed entries and trims the published title', () => {
  const result = deriveNewCmsPushNotifications(
    [],
    [null, {}, { id: '', title: 'bad' }, { id: 'ok', title: '  عنوان صالح  ' }],
    'galleryAlbums',
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'جديد اتحاد شباب الأمة: عنوان صالح');
});

test('rejects an unknown CMS target instead of creating a wrong destination', () => {
  assert.throws(
    () => deriveNewCmsPushNotifications([], [], 'faq'),
    /CMS_PUSH_TARGET_INVALID/,
  );
});
