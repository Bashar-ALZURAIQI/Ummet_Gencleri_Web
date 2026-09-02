import test from 'node:test';
import assert from 'node:assert/strict';

const {
  cmsAuthorityForTarget,
  publishedBundleKeyForTarget,
  selectCmsExpectedVersion,
} = await import('../src/domain/cmsTargets.ts');

test('homepage and about publications update their real persisted bundle keys', () => {
  assert.equal(publishedBundleKeyForTarget('site'), 'siteContent');
  assert.equal(publishedBundleKeyForTarget('about'), 'aboutContent');
  assert.equal(publishedBundleKeyForTarget('news'), 'news');
});

test('guide and FAQ use independent optimistic versions', () => {
  assert.equal(cmsAuthorityForTarget('guideSections'), 'guide');
  assert.equal(cmsAuthorityForTarget('guideQuickInfo'), 'guide');
  assert.equal(cmsAuthorityForTarget('faqCategories'), 'faq');
  assert.equal(cmsAuthorityForTarget('contactMap'), 'site');
  assert.equal(selectCmsExpectedVersion('guideSections', { site: 9, guide: 3, faq: 5 }), 3);
  assert.equal(selectCmsExpectedVersion('faqCategories', { site: 9, guide: 3, faq: 5 }), 5);
  assert.equal(selectCmsExpectedVersion('news', { site: 9, guide: 3, faq: 5 }), 9);
});
