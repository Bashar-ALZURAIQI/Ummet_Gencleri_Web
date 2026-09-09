import test from 'node:test';
import assert from 'node:assert/strict';

import * as editor from '../src/domain/cmsLocalizationEditor.ts';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';
import { overlayLocalizedCmsPayload } from '../src/domain/cmsPublicRead.ts';

const canonicalGuide = [
  {
    id: 'section-a', title: 'AR A',
    items: [{ id: 'item-a', heading: 'AR item A' }],
    contacts: [{ id: 'contact-a', label: 'AR Contact A' }],
  },
  {
    id: 'section-b', title: 'AR B',
    items: [{ id: 'item-b', heading: 'AR item B' }],
    contacts: [
      { id: 'contact-b', label: 'AR Contact B' },
      { id: 'contact-c', label: 'AR Contact C' },
    ],
  },
];

function record(partition, payload, manualPaths, status = partition === 'draft' ? 'draft' : 'fresh') {
  return {
    target: 'guideSections', locale: 'tr', partition, payload, status,
    manualPaths, stalePaths: [], sourceHash: computeSourceHash(canonicalGuide),
    updatedAt: partition === 'draft' ? '2026-09-10T11:00:00.000Z' : '2026-09-10T10:00:00.000Z',
  };
}

function resolveScope(params) {
  assert.equal(typeof editor.resolveCmsLocalizationScope, 'function');
  return editor.resolveCmsLocalizationScope(params);
}

test('A. draft for entity A does not make published entity B Draft', () => {
  const published = record('published', [
    { id: 'section-a', title: 'TR A1' },
    { id: 'section-b', title: 'TR B1' },
  ], ['section-a.title', 'section-b.title']);
  const draft = record('draft', [
    { id: 'section-a', title: 'TR A2' },
    { id: 'section-b', title: 'TR B1' },
  ], ['section-a.title']);

  const scope = resolveScope({ draftRecord: draft, publishedRecord: published, recordId: 'section-b', fieldPaths: ['title'] });
  assert.equal(scope.status, 'fresh');
  assert.equal(scope.hasDraft, false);
  assert.deepEqual(scope.values, { title: 'TR B1' });
});

test('B. publishing B preserves A draft and B reopens Fresh', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await repo.savePublished(record('published', [
    { id: 'section-a', title: 'TR A1' },
    { id: 'section-b', title: 'TR B1' },
  ], ['section-a.title', 'section-b.title']));
  await repo.saveDraft(record('draft', [
    { id: 'section-a', title: 'TR A2' },
    { id: 'section-b', title: 'TR B2' },
  ], ['section-a.title', 'section-b.title']));

  await editor.publishCmsEntityFields({
    repository: repo, target: 'guideSections', locale: 'tr', canonicalPayload: canonicalGuide,
    recordId: 'section-b', fields: { title: 'TR B2' },
  });

  const [draft, published] = await Promise.all([
    repo.getDraft('guideSections', 'tr'), repo.getPublished('guideSections', 'tr'),
  ]);
  const a = resolveScope({ draftRecord: draft, publishedRecord: published, recordId: 'section-a', fieldPaths: ['title'] });
  const b = resolveScope({ draftRecord: draft, publishedRecord: published, recordId: 'section-b', fieldPaths: ['title'] });
  assert.equal(a.status, 'draft');
  assert.equal(a.values.title, 'TR A2');
  assert.equal(b.status, 'fresh');
  assert.equal(b.values.title, 'TR B2');
  assert.deepEqual(draft.manualPaths, ['section-a.title']);
});

test('C. published Student Guide contact is found recursively inside section.contacts', () => {
  assert.equal(typeof editor.findCmsEntityById, 'function');
  const payload = [{ id: 'section-b', contacts: [{ id: 'contact-b', label: 'TR Contact' }] }];
  assert.deepEqual(editor.findCmsEntityById(payload, 'contact-b'), { id: 'contact-b', label: 'TR Contact' });
  const scope = resolveScope({
    draftRecord: null,
    publishedRecord: record('published', payload, ['contact-b.label']),
    recordId: 'contact-b', fieldPaths: ['label'],
  });
  assert.equal(scope.status, 'fresh');
  assert.equal(scope.values.label, 'TR Contact');
});

test('D. saving a nested contact draft updates its stable-id entity without creating a root key', async () => {
  assert.equal(typeof editor.saveCmsEntityDraft, 'function');
  const repo = new InMemoryCmsLocalizationRepository();
  await repo.savePublished(record('published', [
    { id: 'section-a', title: 'TR A', contacts: [{ id: 'contact-a', label: 'TR Contact A' }] },
    { id: 'section-b', title: 'TR B', contacts: [
      { id: 'contact-b', label: 'TR Contact B1' },
      { id: 'contact-c', label: 'TR Contact C' },
    ] },
  ], ['section-a.title', 'section-b.title', 'contact-a.label', 'contact-b.label', 'contact-c.label']));

  const saved = await editor.saveCmsEntityDraft({
    repository: repo, target: 'guideSections', locale: 'tr', canonicalPayload: canonicalGuide,
    recordId: 'contact-b', fields: { label: 'TR Contact B2' },
  });

  assert.equal(editor.findCmsEntityById(saved.payload, 'contact-b').label, 'TR Contact B2');
  assert.equal(editor.findCmsEntityById(saved.payload, 'contact-c').label, 'TR Contact C');
  assert.equal(editor.findCmsEntityById(saved.payload, 'item-a').heading, 'AR item A');
  assert.equal(Object.hasOwn(saved.payload, 'contact-b'), false);
  assert.deepEqual(saved.manualPaths, ['contact-b.label']);
});

test('E. published nested contact persists and reopens Fresh', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await editor.saveCmsEntityDraft({
    repository: repo, target: 'guideSections', locale: 'tr', canonicalPayload: canonicalGuide,
    recordId: 'contact-b', fields: { label: 'TR Contact persisted' },
  });
  await editor.publishCmsEntityFields({
    repository: repo, target: 'guideSections', locale: 'tr', canonicalPayload: canonicalGuide,
    recordId: 'contact-b', fields: { label: 'TR Contact persisted' },
  });

  const draft = await repo.getDraft('guideSections', 'tr');
  const published = await repo.getPublished('guideSections', 'tr');
  const reopened = resolveScope({ draftRecord: draft, publishedRecord: published, recordId: 'contact-b', fieldPaths: ['label'] });
  assert.equal(reopened.status, 'fresh');
  assert.equal(reopened.hasDraft, false);
  assert.equal(reopened.values.label, 'TR Contact persisted');
});

test('F. public overlay and editor scope resolve the identical published contact value', () => {
  const published = record('published', [{
    id: 'section-b', contacts: [{ id: 'contact-b', label: 'TR Contact same' }],
  }], ['contact-b.label']);
  const publicPayload = overlayLocalizedCmsPayload(canonicalGuide, published.payload, 'guideSections');
  const editorScope = resolveScope({ draftRecord: null, publishedRecord: published, recordId: 'contact-b', fieldPaths: ['label'] });
  assert.equal(publicPayload[1].contacts[0].label, 'TR Contact same');
  assert.equal(editorScope.values.label, publicPayload[1].contacts[0].label);
});

test('G. recursive lookup preserves existing nested item behavior', () => {
  assert.equal(editor.findCmsEntityById(canonicalGuide, 'item-b').heading, 'AR item B');
});

test('H. recursive lookup preserves nested media and member behavior', () => {
  const payload = [{
    id: 'root',
    media: [{ id: 'media-1', caption: 'Media' }],
    groups: [{ id: 'group-1', members: [{ id: 'member-1', role: 'Member' }] }],
  }];
  assert.equal(editor.findCmsEntityById(payload, 'media-1').caption, 'Media');
  assert.equal(editor.findCmsEntityById(payload, 'member-1').role, 'Member');
});

test('I. draft for about.story.title does not mark about.header.title Draft', () => {
  const published = {
    ...record('published', { header: { title: 'TR Header' }, story: { title: 'TR Story' } }, ['header.title', 'story.title']),
    target: 'about',
  };
  const draft = {
    ...record('draft', { header: { title: 'TR Header' }, story: { title: 'TR Story draft' } }, ['story.title']),
    target: 'about',
  };
  const header = resolveScope({ draftRecord: draft, publishedRecord: published, recordId: null, fieldPaths: ['header.title'] });
  assert.equal(header.status, 'fresh');
  assert.equal(header.hasDraft, false);
  assert.equal(header.values['header.title'], 'TR Header');
});

test('J. persisted-only reload keeps B Fresh while unrelated A draft remains', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await repo.savePublished(record('published', [
    { id: 'section-a', title: 'TR A1' }, { id: 'section-b', title: 'TR B2' },
  ], ['section-a.title', 'section-b.title']));
  await repo.saveDraft(record('draft', [
    { id: 'section-a', title: 'TR A2' }, { id: 'section-b', title: 'TR B2' },
  ], ['section-a.title']));

  const reloaded = resolveScope({
    draftRecord: await repo.getDraft('guideSections', 'tr'),
    publishedRecord: await repo.getPublished('guideSections', 'tr'),
    recordId: 'section-b', fieldPaths: ['title'],
  });
  assert.equal(reloaded.status, 'fresh');
  assert.equal(reloaded.values.title, 'TR B2');
});
