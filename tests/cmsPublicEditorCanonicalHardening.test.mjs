import test from 'node:test';
import assert from 'node:assert/strict';

import * as editor from '../src/domain/cmsLocalizationEditor.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';
import {
  InMemoryCmsLocalizationRepository,
  resolveCmsTargetForLocale,
} from '../src/domain/cmsLocalizationRepository.ts';
import { overlayLocalizedCmsPayload } from '../src/domain/cmsPublicRead.ts';

function canonicalEntity(canonical, displayed) {
  assert.equal(typeof editor.resolveCanonicalEntityById, 'function');
  return editor.resolveCanonicalEntityById(canonical, displayed);
}

test('FAQ Arabic edit source stays canonical when the displayed locale is Turkish or English', () => {
  const canonical = [{
    id: 'cat-1',
    title: 'AR category',
    items: [{ id: 'q-1', question: 'AR-Q', answer: 'AR-A' }],
  }];

  for (const displayedQuestion of ['TR-Q', 'EN-Q']) {
    const displayedCategory = {
      id: 'cat-1',
      title: displayedQuestion === 'TR-Q' ? 'TR category' : 'EN category',
      items: [{ id: 'q-1', question: displayedQuestion, answer: `${displayedQuestion}-A` }],
    };
    const category = canonicalEntity(canonical, displayedCategory);
    assert.equal(category.title, 'AR category');
    assert.equal(typeof editor.resolveCanonicalNestedEntityById, 'function');
    const question = editor.resolveCanonicalNestedEntityById(
      canonical,
      'cat-1',
      'items',
      displayedCategory.items[0],
    );
    assert.deepEqual(question, { id: 'q-1', question: 'AR-Q', answer: 'AR-A' });
  }
});

test('event Arabic edit uses the canonical entity and preserves localized overlays', () => {
  const canonical = [
    { id: 'e1', title: 'AR Event', description: 'AR body' },
    { id: 'e2', title: 'AR sibling', description: 'AR sibling body' },
  ];
  const displayed = { id: 'e1', title: 'TR Event', description: 'TR body' };
  const source = canonicalEntity(canonical, displayed);
  const savedCanonical = canonical.map((event) => event.id === source.id
    ? { ...source, title: 'AR Event 2' }
    : event);

  assert.equal(source.title, 'AR Event');
  assert.equal(savedCanonical[0].title, 'AR Event 2');
  assert.equal(savedCanonical[1].title, 'AR sibling');
  assert.equal(displayed.title, 'TR Event');
});

test('gallery album and category Arabic editors resolve canonical stable-id entities', () => {
  const albums = [{ id: 'a1', title: 'AR Album' }, { id: 'a2', title: 'AR Album sibling' }];
  const categories = [{ id: 'c1', label: 'AR Category' }, { id: 'c2', label: 'AR Category sibling' }];

  assert.equal(canonicalEntity(albums, { id: 'a1', title: 'TR Album' }).title, 'AR Album');
  assert.equal(canonicalEntity(categories, { id: 'c1', label: 'EN Category' }).label, 'AR Category');
});

test('Gallery public category read ignores a newer draft and resolves published content', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const base = {
    target: 'galleryCategories', locale: 'tr', status: 'fresh',
    manualPaths: ['0.label'], stalePaths: [], sourceHash: 'hash', updatedAt: '2026-09-09T00:00:00.000Z',
  };
  await repo.savePublished({ ...base, partition: 'published', payload: [{ id: 'c1', label: 'Yayın' }] });
  await repo.saveDraft({ ...base, partition: 'draft', payload: [{ id: 'c1', label: 'Taslak' }] });

  const result = await resolveCmsTargetForLocale({
    repository: repo,
    target: 'galleryCategories',
    requestedLocale: 'tr',
    canonicalPayload: [{ id: 'c1', label: 'AR' }],
  });
  assert.equal(result.payload[0].label, 'Yayın');
});

test('contact card edit preserves canonical Arabic siblings', () => {
  const canonical = [
    { id: 'address', title: 'AR Address', value: 'AR place', sub: 'AR sub' },
    { id: 'hours', title: 'AR Hours', value: 'AR time', sub: 'AR hours sub' },
  ];
  const displayed = { id: 'address', title: 'TR Address', value: 'TR place', sub: 'TR sub' };
  const source = canonicalEntity(canonical, displayed);
  const saved = canonical.map((card) => card.id === source.id ? { ...source, title: 'AR Address 2' } : card);

  assert.equal(saved[0].title, 'AR Address 2');
  assert.deepEqual(saved[1], canonical[1]);
});

test('inline Arabic editor keeps a legitimately empty canonical value', () => {
  assert.equal(typeof editor.getCanonicalEditorValue, 'function');
  assert.equal(editor.getCanonicalEditorValue({ hero: { title: '' } }, 'hero.title'), '');
  assert.notEqual(editor.getCanonicalEditorValue({ hero: { title: '' } }, 'hero.title'), 'Türkçe');
});

test('Guide Quick Info publishes AR, TR, and EN independently', async () => {
  assert.equal(typeof editor.publishCmsLocalizationPatch, 'function');
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = 'AR quick info';

  await editor.publishCmsLocalizationPatch({
    repository: repo, target: 'guideQuickInfo', locale: 'tr', canonicalPayload: canonical,
    changes: { value: 'TR quick info' },
  });
  await editor.publishCmsLocalizationPatch({
    repository: repo, target: 'guideQuickInfo', locale: 'en', canonicalPayload: canonical,
    changes: { value: 'EN quick info' },
  });

  const ar = await resolveCmsTargetForLocale({ repository: repo, target: 'guideQuickInfo', requestedLocale: 'ar', canonicalPayload: canonical });
  const tr = await resolveCmsTargetForLocale({ repository: repo, target: 'guideQuickInfo', requestedLocale: 'tr', canonicalPayload: canonical });
  const en = await resolveCmsTargetForLocale({ repository: repo, target: 'guideQuickInfo', requestedLocale: 'en', canonicalPayload: canonical });
  assert.equal(ar.payload, 'AR quick info');
  assert.equal(tr.payload, 'TR quick info');
  assert.equal(en.payload, 'EN quick info');
});

test('locale switching and refresh resolution never mutate stored AR, TR, or EN values', async () => {
  const canonical = { header: { title: 'AR' } };
  const tr = { header: { title: 'TR' } };
  const en = { header: { title: 'EN' } };
  const snapshots = [
    overlayLocalizedCmsPayload(canonical, tr, 'about'),
    overlayLocalizedCmsPayload(canonical, en, 'about'),
    overlayLocalizedCmsPayload(canonical, null, 'about'),
    overlayLocalizedCmsPayload(canonical, tr, 'about'),
  ];

  assert.deepEqual(snapshots.map((item) => item.header.title), ['TR', 'EN', 'AR', 'TR']);
  assert.deepEqual(canonical, { header: { title: 'AR' } });
  assert.deepEqual(tr, { header: { title: 'TR' } });
  assert.deepEqual(en, { header: { title: 'EN' } });
  assert.equal(computeSourceHash(canonical), computeSourceHash({ header: { title: 'AR' } }));
});
