import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as coordinator from '../src/domain/executiveEditCoordinator.ts';
import { canManageCouncilContent } from '../src/domain/executiveProfileUpdatePolicy.ts';
import { publishCmsEntityFields } from '../src/domain/cmsLocalizationEditor.ts';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';

const ARABIC = [
  {
    id: 'vice-presidency',
    vision: 'رؤية عربية',
    goals: 'أهداف عربية',
    responsibilities: ['المسؤولية العربية الأصلية', 'شقيق عربي'],
    stats: [{ value: '12', label: 'إحصائية عربية' }],
    members: [{ id: 'member-1', name: 'عضو عربي', position: 'منصب عربي', photo: '' }],
  },
];

const ENGLISH_VIEW = [{
  ...structuredClone(ARABIC[0]),
  responsibilities: ['Original English responsibility', 'English sibling'],
  stats: [{ value: '12', label: 'English statistic' }],
  members: [{ id: 'member-1', name: 'English member', position: 'English position', photo: '' }],
}];

const TURKISH_VIEW = [{
  ...structuredClone(ARABIC[0]),
  responsibilities: ['Orijinal Türkçe sorumluluk', 'Türkçe kardeş'],
  stats: [{ value: '12', label: 'Türkçe istatistik' }],
  members: [{ id: 'member-1', name: 'Türkçe üye', position: 'Türkçe görev', photo: '' }],
}];

function editFirstResponsibility(value) {
  return (committee) => ({
    ...committee,
    responsibilities: committee.responsibilities.map((item, index) => index === 0 ? value : item),
  });
}

test('English displayed committee cannot become the Arabic canonical mutation base', () => {
  assert.equal(typeof coordinator.prepareCanonicalCommitteeEdit, 'function');
  const next = coordinator.prepareCanonicalCommitteeEdit(
    ARABIC,
    'vice-presidency',
    editFirstResponsibility('المسؤولية العربية المعدلة'),
  );

  assert.equal(ENGLISH_VIEW[0].responsibilities[0], 'Original English responsibility');
  assert.equal(next.responsibilities[0], 'المسؤولية العربية المعدلة');
  assert.equal(next.responsibilities[1], 'شقيق عربي');
  assert.equal(next.stats[0].label, 'إحصائية عربية');
  assert.equal(next.members[0].position, 'منصب عربي');
});

test('Turkish displayed committee cannot become the Arabic canonical mutation base', () => {
  assert.equal(typeof coordinator.prepareCanonicalCommitteeEdit, 'function');
  const next = coordinator.prepareCanonicalCommitteeEdit(
    ARABIC,
    'vice-presidency',
    editFirstResponsibility('مسؤولية عربية محدثة'),
  );

  assert.equal(TURKISH_VIEW[0].responsibilities[0], 'Orijinal Türkçe sorumluluk');
  assert.equal(next.responsibilities[1], 'شقيق عربي');
  assert.equal(next.stats[0].label, 'إحصائية عربية');
  assert.equal(next.members[0].name, 'عضو عربي');
});

test('Arabic responsibility edit updates only the intended canonical field', () => {
  const next = coordinator.prepareCanonicalCommitteeEdit(
    ARABIC,
    'vice-presidency',
    editFirstResponsibility('اختبار المصدر العربي 555'),
  );
  assert.equal(next.responsibilities[0], 'اختبار المصدر العربي 555');
  assert.equal(next.responsibilities[1], ARABIC[0].responsibilities[1]);
  assert.notEqual(next, ARABIC[0]);
});

test('English and Turkish publication remain isolated from canonical Arabic and each other', async () => {
  const repository = new InMemoryCmsLocalizationRepository();
  const canonical = structuredClone(ARABIC);

  await publishCmsEntityFields({
    repository,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: canonical,
    recordId: 'vice-presidency',
    fields: { 'responsibilities.0': 'Türkçe kaynak testi 555' },
    committeeId: 'vice-presidency',
  });
  await publishCmsEntityFields({
    repository,
    target: 'committees',
    locale: 'en',
    canonicalPayload: canonical,
    recordId: 'vice-presidency',
    fields: { 'responsibilities.0': 'English source test 555' },
    committeeId: 'vice-presidency',
  });

  const tr = await repository.getPublished('committees', 'tr');
  const en = await repository.getPublished('committees', 'en');
  assert.equal(canonical[0].responsibilities[0], 'المسؤولية العربية الأصلية');
  assert.equal(tr.payload[0].responsibilities[0], 'Türkçe kaynak testi 555');
  assert.equal(en.payload[0].responsibilities[0], 'English source test 555');
  assert.equal(tr.sourceHash, computeSourceHash(canonical));
  assert.equal(en.sourceHash, computeSourceHash(canonical));
});

test('canonical committee edit fails closed when raw Arabic state is unavailable', () => {
  assert.equal(
    coordinator.prepareCanonicalCommitteeEdit(undefined, 'vice-presidency', editFirstResponsibility('unsafe')),
    null,
  );
});

test('cross-committee authorization remains denied', () => {
  assert.equal(
    canManageCouncilContent({ role: 'VICE_PRESIDENT', committee: 'vice-presidency' }, 'academic'),
    false,
  );
});

test('CommitteePage wires canonical saves through the raw-source guard', async () => {
  const source = await readFile(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8');
  assert.match(source, /prepareCanonicalCommitteeEdit\(canonicalCommittees, committeeId, mutate\)/);
  assert.doesNotMatch(source, /const next = mutate\(committee\)/);
});
