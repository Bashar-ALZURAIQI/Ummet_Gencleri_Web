import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { canManageCouncilContent } from '../src/domain/executiveProfileUpdatePolicy.ts';
import * as coordinator from '../src/domain/executiveEditCoordinator.ts';
import { publishCmsEntityFields } from '../src/domain/cmsLocalizationEditor.ts';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';

const COMMITTEE_ID = 'vice-presidency';
const NEW_MEMBER_ID = 'cm-new-stable-id';
const CANONICAL_COMMITTEES = [{
  id: COMMITTEE_ID,
  vision: 'رؤية',
  goals: 'أهداف',
  responsibilities: [],
  stats: [{ value: '12', label: 'المستفيدون' }],
  members: [],
}];

test('statistics translations give publish authority only to a president or the current committee executive', async () => {
  const actors = [
    [{ role: 'PRESIDENT', committee: 'presidency' }, true],
    [{ role: 'VICE_PRESIDENT', committee: COMMITTEE_ID }, true],
    [{ role: 'ACADEMIC_HEAD', committee: 'academic' }, false],
    [{ role: 'STUDENT' }, false],
  ];

  for (const [actor, allowed] of actors) {
    assert.equal(canManageCouncilContent(actor, COMMITTEE_ID), allowed);
  }

  const page = await readFile(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  const statisticModal = page.match(/\{\/\* Stat modal \*\/\}[\s\S]*?\{\/\* Member modal \*\/\}/)?.[0] ?? '';
  assert.match(
    statisticModal,
    /canPublish=\{Boolean\(canEditContent\)\}/,
    'an authorized own-committee executive must receive the same publish authority as responsibility translations',
  );
});

test('an authorized executive can publish a statistic translation through the existing committee localization boundary', async () => {
  const repository = new InMemoryCmsLocalizationRepository();
  const published = await publishCmsEntityFields({
    repository,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: CANONICAL_COMMITTEES,
    recordId: `${COMMITTEE_ID}.stats.0`,
    fields: { label: 'Yararlananlar' },
    committeeId: COMMITTEE_ID,
  });

  assert.equal(published.payload[0].stats[0].label, 'Yararlananlar');
  assert.equal(CANONICAL_COMMITTEES[0].stats[0].label, 'المستفيدون');
});

test('creating a member yields a stable translation binding that keeps the modal publishable', async () => {
  assert.equal(typeof coordinator.createNewCommitteeMemberTranslationBinding, 'function');
  const binding = coordinator.createNewCommitteeMemberTranslationBinding({
    committeeId: COMMITTEE_ID,
    member: {
      id: NEW_MEMBER_ID,
      name: 'عضو جديد',
      position: 'منسق',
      photo: 'https://example.test/avatar.webp',
    },
  });

  assert.deepEqual(binding, {
    committeeId: COMMITTEE_ID,
    recordId: NEW_MEMBER_ID,
    member: {
      id: NEW_MEMBER_ID,
      name: 'عضو جديد',
      position: 'منسق',
      photo: 'https://example.test/avatar.webp',
    },
  });

  const canonical = structuredClone(CANONICAL_COMMITTEES);
  canonical[0].members.push(binding.member);
  const repository = new InMemoryCmsLocalizationRepository();
  await publishCmsEntityFields({
    repository,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: canonical,
    recordId: binding.recordId,
    fields: { name: 'Yeni üye', position: 'Türkçe koordinatör' },
    committeeId: binding.committeeId,
  });
  await publishCmsEntityFields({
    repository,
    target: 'committees',
    locale: 'en',
    canonicalPayload: canonical,
    recordId: binding.recordId,
    fields: { name: 'New member', position: 'English coordinator' },
    committeeId: binding.committeeId,
  });

  assert.equal((await repository.getPublished('committees', 'tr')).payload[0].members[0].position, 'Türkçe koordinatör');
  assert.equal((await repository.getPublished('committees', 'en')).payload[0].members[0].position, 'English coordinator');
  assert.equal((await repository.getPublished('committees', 'tr')).payload[0].members[0].name, 'Yeni üye');
  assert.equal((await repository.getPublished('committees', 'en')).payload[0].members[0].name, 'New member');
  assert.equal(canonical[0].members[0].name, 'عضو جديد');
  assert.equal(canonical[0].members[0].position, 'منسق');
});

test('the member modal uses the generated member binding after Arabic creation instead of closing with a null record id', async () => {
  const page = await readFile(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /createNewCommitteeMemberTranslationBinding/);
  assert.doesNotMatch(page, /recordId=\{editingMember\?\.id \?\? null\}/);
});
