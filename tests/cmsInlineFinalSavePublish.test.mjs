import test from 'node:test';
import assert from 'node:assert/strict';

import * as editor from '../src/domain/cmsLocalizationEditor.ts';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';
import { overlayLocalizedCmsPayload } from '../src/domain/cmsPublicRead.ts';

const canonicalAbout = {
  header: { badge: 'AR badge', title: 'AR header', description: 'AR description' },
  story: {
    badge: 'AR story badge',
    title: 'AR story title',
    paragraphs: ['A', 'A paragraph 2', 'A paragraph 3'],
    images: ['one.jpg'],
  },
  mission: {
    badge: 'AR mission badge',
    title: 'AR mission title',
    cards: [{ icon: 'Target', title: 'AR mission card', text: 'AR mission text' }],
  },
  goals: {
    badge: 'AR goals badge',
    title: 'AR goals title',
    cards: [{ icon: 'Sparkles', title: 'AR goal card', desc: 'AR goal description' }],
  },
  cta: { icon: 'Award', title: 'AR CTA', description: 'AR CTA description', buttonText: 'AR button' },
};

async function seedPublished(repo, locale, paragraph, extra = {}) {
  return repo.savePublished({
    target: 'about',
    locale,
    partition: 'published',
    payload: {
      ...structuredClone(canonicalAbout),
      ...extra,
      story: {
        ...structuredClone(canonicalAbout.story),
        ...(extra.story ?? {}),
        paragraphs: [paragraph, `${locale} paragraph 2`, `${locale} paragraph 3`],
      },
    },
    status: 'fresh',
    manualPaths: ['story.paragraphs.0'],
    stalePaths: [],
    sourceHash: computeSourceHash(canonicalAbout),
    updatedAt: '2026-09-09T10:00:00.000Z',
  });
}

function requirePublishFunction() {
  assert.equal(
    typeof editor.publishDirtyLocalizedFields,
    'function',
    'final inline save needs an aggregated dirty-localization publisher',
  );
  return editor.publishDirtyLocalizedFields;
}

test('pending inline localization detection skips unchanged values and includes typed or drafted changes', async () => {
  assert.equal(
    typeof editor.getPendingLocalizedFieldChange,
    'function',
    'translation sections must expose only values pending publication',
  );
  if (!editor.getPendingLocalizedFieldChange) return;

  const repo = new InMemoryCmsLocalizationRepository();
  const published = await seedPublished(repo, 'tr', 'T1');

  assert.equal(editor.getPendingLocalizedFieldChange({
    path: 'story.paragraphs.0',
    value: 'T1',
    publishedRecord: published,
    isDirty: false,
    hasDraft: false,
  }), null);
  assert.deepEqual(editor.getPendingLocalizedFieldChange({
    path: 'story.paragraphs.0',
    value: 'T2',
    publishedRecord: published,
    isDirty: true,
    hasDraft: false,
  }), { path: 'story.paragraphs.0', value: 'T2' });
  assert.deepEqual(editor.getPendingLocalizedFieldChange({
    path: 'story.paragraphs.0',
    value: 'T-draft',
    publishedRecord: published,
    isDirty: false,
    hasDraft: true,
  }), { path: 'story.paragraphs.0', value: 'T-draft' });
});

test('President final-save publishes only dirty Turkish and preserves Arabic and English', async () => {
  const publishDirtyLocalizedFields = requirePublishFunction();
  if (!publishDirtyLocalizedFields) return;

  const repo = new InMemoryCmsLocalizationRepository();
  await seedPublished(repo, 'tr', 'T1');
  await seedPublished(repo, 'en', 'E1');

  await publishDirtyLocalizedFields({
    repository: repo,
    target: 'about',
    canonicalPayload: canonicalAbout,
    changes: { tr: { 'story.paragraphs.0': 'T2' } },
  });

  const tr = await repo.getPublished('about', 'tr');
  const en = await repo.getPublished('about', 'en');
  assert.equal(canonicalAbout.story.paragraphs[0], 'A');
  assert.equal(tr.payload.story.paragraphs[0], 'T2');
  assert.equal(en.payload.story.paragraphs[0], 'E1');
  assert.equal(overlayLocalizedCmsPayload(canonicalAbout, tr.payload, 'about').story.paragraphs[0], 'T2');
  assert.equal(overlayLocalizedCmsPayload(canonicalAbout, en.payload, 'about').story.paragraphs[0], 'E1');
});

test('a later English final-save preserves the newest Turkish publication', async () => {
  const publishDirtyLocalizedFields = requirePublishFunction();
  if (!publishDirtyLocalizedFields) return;

  const repo = new InMemoryCmsLocalizationRepository();
  await seedPublished(repo, 'tr', 'T2');
  await seedPublished(repo, 'en', 'E1');

  await publishDirtyLocalizedFields({
    repository: repo,
    target: 'about',
    canonicalPayload: canonicalAbout,
    changes: { en: { 'story.paragraphs.0': 'E2' } },
  });

  const tr = await repo.getPublished('about', 'tr');
  const en = await repo.getPublished('about', 'en');
  assert.equal(canonicalAbout.story.paragraphs[0], 'A');
  assert.equal(tr.payload.story.paragraphs[0], 'T2');
  assert.equal(en.payload.story.paragraphs[0], 'E2');
});

test('a persisted Turkish draft is promoted by President final-save and becomes public', async () => {
  const publishDirtyLocalizedFields = requirePublishFunction();
  if (!publishDirtyLocalizedFields) return;

  const repo = new InMemoryCmsLocalizationRepository();
  await seedPublished(repo, 'tr', 'T1');
  await repo.saveDraft({
    target: 'about',
    locale: 'tr',
    partition: 'draft',
    payload: {
      ...structuredClone(canonicalAbout),
      story: { ...structuredClone(canonicalAbout.story), paragraphs: ['T-draft', 'TR paragraph 2', 'TR paragraph 3'] },
    },
    status: 'draft',
    manualPaths: ['story.paragraphs.0'],
    stalePaths: [],
    sourceHash: computeSourceHash(canonicalAbout),
    updatedAt: '2026-09-09T11:00:00.000Z',
  });

  const before = await repo.getPublished('about', 'tr');
  assert.equal(overlayLocalizedCmsPayload(canonicalAbout, before.payload, 'about').story.paragraphs[0], 'T1');

  await publishDirtyLocalizedFields({
    repository: repo,
    target: 'about',
    canonicalPayload: canonicalAbout,
    changes: { tr: { 'story.paragraphs.0': 'T-draft' } },
  });

  const after = await repo.getPublished('about', 'tr');
  assert.equal(after.payload.story.paragraphs[0], 'T-draft');
  assert.equal(await repo.getDraft('about', 'tr'), null);
  assert.equal(overlayLocalizedCmsPayload(canonicalAbout, after.payload, 'about').story.paragraphs[0], 'T-draft');
});

test('multiple dirty fields publish once per locale without reverting localized siblings', async () => {
  const publishDirtyLocalizedFields = requirePublishFunction();
  if (!publishDirtyLocalizedFields) return;

  const backing = new InMemoryCmsLocalizationRepository();
  await seedPublished(backing, 'tr', 'T1', {
    header: { badge: 'TR badge old', title: 'TR header old', description: 'TR description preserved' },
  });
  let publishCount = 0;
  const repo = {
    getDraft: (...args) => backing.getDraft(...args),
    getPublished: (...args) => backing.getPublished(...args),
    deleteDraft: (...args) => backing.deleteDraft(...args),
    savePublished: async (...args) => {
      publishCount += 1;
      return backing.savePublished(...args);
    },
  };

  await publishDirtyLocalizedFields({
    repository: repo,
    target: 'about',
    canonicalPayload: canonicalAbout,
    changes: {
      tr: {
        'header.badge': 'TR badge new',
        'header.title': 'TR header new',
      },
    },
  });

  const tr = await backing.getPublished('about', 'tr');
  assert.equal(publishCount, 1);
  assert.equal(tr.payload.header.badge, 'TR badge new');
  assert.equal(tr.payload.header.title, 'TR header new');
  assert.equal(tr.payload.header.description, 'TR description preserved');
  assert.equal(tr.payload.story.paragraphs[0], 'T1');
});

test('retry skips a locale whose requested values are already published', async () => {
  const publishDirtyLocalizedFields = requirePublishFunction();
  if (!publishDirtyLocalizedFields) return;

  const backing = new InMemoryCmsLocalizationRepository();
  await seedPublished(backing, 'tr', 'T2');
  let publishCount = 0;
  const repo = {
    getDraft: (...args) => backing.getDraft(...args),
    getPublished: (...args) => backing.getPublished(...args),
    deleteDraft: (...args) => backing.deleteDraft(...args),
    savePublished: async (...args) => {
      publishCount += 1;
      return backing.savePublished(...args);
    },
  };

  await publishDirtyLocalizedFields({
    repository: repo,
    target: 'about',
    canonicalPayload: canonicalAbout,
    changes: { tr: { 'story.paragraphs.0': 'T2' } },
  });

  assert.equal(publishCount, 0);
});

test('About inline publication covers header, story paragraphs, mission, goals, and CTA fields', async () => {
  const publishDirtyLocalizedFields = requirePublishFunction();
  if (!publishDirtyLocalizedFields) return;

  const repo = new InMemoryCmsLocalizationRepository();
  await publishDirtyLocalizedFields({
    repository: repo,
    target: 'about',
    canonicalPayload: canonicalAbout,
    changes: {
      tr: {
        'header.badge': 'TR header badge',
        'header.title': 'TR header title',
        'header.description': 'TR header description',
        'story.badge': 'TR story badge',
        'story.title': 'TR story title',
        'story.paragraphs.0': 'TR paragraph 1',
        'story.paragraphs.1': 'TR paragraph 2',
        'story.paragraphs.2': 'TR paragraph 3',
        'mission.badge': 'TR mission badge',
        'mission.title': 'TR mission title',
        'mission.cards.0.title': 'TR mission card',
        'mission.cards.0.text': 'TR mission text',
        'goals.badge': 'TR goals badge',
        'goals.title': 'TR goals title',
        'goals.cards.0.title': 'TR goal card',
        'goals.cards.0.desc': 'TR goal description',
        'cta.title': 'TR CTA',
        'cta.description': 'TR CTA description',
        'cta.buttonText': 'TR button',
      },
    },
  });

  const record = await repo.getPublished('about', 'tr');
  const publicAbout = overlayLocalizedCmsPayload(canonicalAbout, record.payload, 'about');
  assert.deepEqual(publicAbout.header, {
    badge: 'TR header badge', title: 'TR header title', description: 'TR header description',
  });
  assert.equal(publicAbout.story.badge, 'TR story badge');
  assert.equal(publicAbout.story.title, 'TR story title');
  assert.deepEqual(publicAbout.story.paragraphs, ['TR paragraph 1', 'TR paragraph 2', 'TR paragraph 3']);
  assert.equal(publicAbout.mission.badge, 'TR mission badge');
  assert.equal(publicAbout.mission.title, 'TR mission title');
  assert.equal(publicAbout.mission.cards[0].title, 'TR mission card');
  assert.equal(publicAbout.mission.cards[0].text, 'TR mission text');
  assert.equal(publicAbout.goals.badge, 'TR goals badge');
  assert.equal(publicAbout.goals.title, 'TR goals title');
  assert.equal(publicAbout.goals.cards[0].title, 'TR goal card');
  assert.equal(publicAbout.goals.cards[0].desc, 'TR goal description');
  assert.equal(publicAbout.cta.title, 'TR CTA');
  assert.equal(publicAbout.cta.description, 'TR CTA description');
  assert.equal(publicAbout.cta.buttonText, 'TR button');
  assert.equal(publicAbout.mission.cards[0].icon, 'Target');
  assert.equal(publicAbout.goals.cards[0].icon, 'Sparkles');
  assert.equal(publicAbout.cta.icon, 'Award');
});

test('partial guide draft publishes one section without deleting published siblings or unrelated draft work', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = [
    { id: 's1', title: 'AR 1', items: [{ id: 'i1', heading: 'AR i1' }] },
    { id: 's2', title: 'AR 2', items: [{ id: 'i2', heading: 'AR i2' }] },
    { id: 's3', title: 'AR 3', items: [{ id: 'i3', heading: 'AR i3' }] },
  ];
  await repo.savePublished({
    target: 'guideSections', locale: 'tr', partition: 'published', status: 'fresh',
    payload: [
      { id: 's1', title: 'T1', items: [{ id: 'i1', heading: 'TI1' }] },
      { id: 's2', title: 'T2', items: [{ id: 'i2', heading: 'TI2' }] },
      { id: 's3', title: 'T3', items: [{ id: 'i3', heading: 'TI3' }] },
    ],
    manualPaths: ['s1.title', 's2.title', 's3.title', 'i1.heading', 'i2.heading', 'i3.heading'],
    stalePaths: [], sourceHash: computeSourceHash(canonical), updatedAt: '2026-09-09T10:00:00.000Z',
  });
  await repo.saveDraft({
    target: 'guideSections', locale: 'tr', partition: 'draft', status: 'draft',
    payload: [{ id: 's2', title: 'T2 draft' }, { id: 's3', title: 'T3 pending' }],
    manualPaths: ['s2.title', 's3.title'], stalePaths: [],
    sourceHash: computeSourceHash(canonical), updatedAt: '2026-09-09T11:00:00.000Z',
  });

  await editor.publishCmsEntityFields({
    repository: repo, target: 'guideSections', locale: 'tr', canonicalPayload: canonical,
    recordId: 's2', fields: { title: 'T2 new' },
  });

  const published = await repo.getPublished('guideSections', 'tr');
  assert.deepEqual(published.payload.map((section) => section.title), ['T1', 'T2 new', 'T3']);
  const draft = await repo.getDraft('guideSections', 'tr');
  assert.ok(draft);
  assert.deepEqual(draft.manualPaths, ['s3.title']);
  assert.equal(draft.payload.find((section) => section.id === 's3').title, 'T3 pending');
  assert.equal(draft.payload.find((section) => section.id === 's2').title, 'T2 new');
});

test('nested guide item and FAQ publications merge by stable id and preserve all siblings', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const guide = [
    { id: 's1', items: [{ id: 'i1', heading: 'AR i1' }, { id: 'i2', heading: 'AR i2' }] },
    { id: 's2', items: [{ id: 'i3', heading: 'AR i3' }] },
  ];
  await repo.savePublished({
    target: 'guideSections', locale: 'en', partition: 'published', status: 'fresh',
    payload: [
      { id: 's1', items: [{ id: 'i1', heading: 'EI1' }, { id: 'i2', heading: 'EI2' }] },
      { id: 's2', items: [{ id: 'i3', heading: 'EI3' }] },
    ], manualPaths: [], stalePaths: [], sourceHash: computeSourceHash(guide), updatedAt: '2026-09-09T10:00:00.000Z',
  });
  await editor.publishCmsEntityFields({
    repository: repo, target: 'guideSections', locale: 'en', canonicalPayload: guide,
    recordId: 'i2', fields: { heading: 'EI2 new' },
  });
  const guidePublished = await repo.getPublished('guideSections', 'en');
  assert.deepEqual(guidePublished.payload[0].items.map((item) => item.heading), ['EI1', 'EI2 new']);
  assert.equal(guidePublished.payload[1].items[0].heading, 'EI3');

  const faq = [
    { id: 'c1', title: 'AR C1', items: [{ id: 'q1', question: 'AR Q1', answer: 'AR A1' }] },
    { id: 'c2', title: 'AR C2', items: [{ id: 'q2', question: 'AR Q2', answer: 'AR A2' }] },
  ];
  await repo.savePublished({
    target: 'faqCategories', locale: 'tr', partition: 'published', status: 'fresh',
    payload: [
      { id: 'c1', title: 'TC1', items: [{ id: 'q1', question: 'TQ1', answer: 'TA1' }] },
      { id: 'c2', title: 'TC2', items: [{ id: 'q2', question: 'TQ2', answer: 'TA2' }] },
    ], manualPaths: [], stalePaths: [], sourceHash: computeSourceHash(faq), updatedAt: '2026-09-09T10:00:00.000Z',
  });
  await editor.publishCmsEntityFields({
    repository: repo, target: 'faqCategories', locale: 'tr', canonicalPayload: faq,
    recordId: 'q1', fields: { answer: 'TA1 new' },
  });
  const faqPublished = await repo.getPublished('faqCategories', 'tr');
  assert.equal(faqPublished.payload[0].items[0].question, 'TQ1');
  assert.equal(faqPublished.payload[0].items[0].answer, 'TA1 new');
  assert.deepEqual(faqPublished.payload[1], { id: 'c2', title: 'TC2', items: [{ id: 'q2', question: 'TQ2', answer: 'TA2' }] });
});

test('publisher rejects numeric-key objects where canonical content requires arrays', async () => {
  assert.throws(
    () => editor.assertLocalizationShapeCompatible(
      canonicalAbout,
      { story: { paragraphs: { 0: 'corrupt' } } },
    ),
    /array/i,
  );
  assert.doesNotThrow(() => editor.assertLocalizationShapeCompatible(
    canonicalAbout,
    { story: { title: 'partial is legitimate' } },
  ));
});

test('both dirty locales publish independently and one-locale retry reconciles without republishing', async () => {
  const backing = new InMemoryCmsLocalizationRepository();
  await seedPublished(backing, 'tr', 'T1');
  await seedPublished(backing, 'en', 'E1');
  await backing.saveDraft({
    target: 'about', locale: 'tr', partition: 'draft', status: 'draft',
    payload: structuredClone((await backing.getPublished('about', 'tr')).payload),
    manualPaths: ['story.paragraphs.0'], stalePaths: [],
    sourceHash: computeSourceHash(canonicalAbout), updatedAt: '2026-09-09T11:00:00.000Z',
  });
  let publishCount = 0;
  let failDraftDeleteOnce = true;
  const repository = {
    getDraft: (...args) => backing.getDraft(...args),
    getPublished: (...args) => backing.getPublished(...args),
    saveDraft: (...args) => backing.saveDraft(...args),
    savePublished: async (...args) => { publishCount += 1; return backing.savePublished(...args); },
    deleteDraft: async (...args) => {
      if (failDraftDeleteOnce) { failDraftDeleteOnce = false; throw new Error('transient reconciliation failure'); }
      return backing.deleteDraft(...args);
    },
  };
  const changes = {
    tr: { 'story.paragraphs.0': 'T2' },
    en: { 'story.paragraphs.0': 'E2' },
  };
  await assert.rejects(() => editor.publishDirtyLocalizedFields({
    repository, target: 'about', canonicalPayload: canonicalAbout, changes,
  }));
  assert.equal((await backing.getPublished('about', 'tr')).payload.story.paragraphs[0], 'T2');
  assert.equal((await backing.getPublished('about', 'en')).payload.story.paragraphs[0], 'E1');

  await editor.publishDirtyLocalizedFields({ repository, target: 'about', canonicalPayload: canonicalAbout, changes });
  assert.equal(publishCount, 2, 'retry must skip already-published TR and publish EN once');
  assert.equal((await backing.getPublished('about', 'en')).payload.story.paragraphs[0], 'E2');
  assert.equal(await backing.getDraft('about', 'tr'), null);
});

test('publishing a newly-created stable-id entity hydrates all canonical siblings first', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = [
    { id: 's1', title: 'AR 1' },
    { id: 's2', title: 'AR 2' },
    { id: 's4', title: 'AR 4' },
  ];
  await repo.savePublished({
    target: 'guideSections', locale: 'tr', partition: 'published', status: 'fresh',
    payload: [{ id: 's1', title: 'T1' }, { id: 's2', title: 'T2' }],
    manualPaths: [], stalePaths: [], sourceHash: computeSourceHash(canonical), updatedAt: '2026-09-09T10:00:00.000Z',
  });
  await editor.publishCmsEntityFields({
    repository: repo, target: 'guideSections', locale: 'tr', canonicalPayload: canonical,
    recordId: 's4', fields: { title: 'T4' },
  });
  const published = await repo.getPublished('guideSections', 'tr');
  assert.deepEqual(published.payload.map((item) => item.id), ['s1', 's2', 's4']);
  assert.deepEqual(published.payload.map((item) => item.title), ['T1', 'T2', 'T4']);
});
