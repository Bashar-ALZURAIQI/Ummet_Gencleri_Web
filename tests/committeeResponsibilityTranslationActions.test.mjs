import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { canManageCouncilContent } from '../src/domain/executiveProfileUpdatePolicy.ts';
import {
  publishCmsEntityFields,
  resolveCmsLocalizationScope,
  saveCmsEntityDraft,
} from '../src/domain/cmsLocalizationEditor.ts';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';
import { overlayLocalizedCmsPayload } from '../src/domain/cmsPublicRead.ts';

const CANONICAL = [
  {
    id: 'vice-presidency',
    vision: 'الرؤية',
    goals: 'الأهداف',
    responsibilities: ['المسؤولية العربية'],
    members: [],
    stats: [],
  },
  {
    id: 'media',
    vision: 'رؤية الإعلام',
    goals: 'أهداف الإعلام',
    responsibilities: ['مسؤولية الإعلام'],
    members: [],
    stats: [],
  },
];

const RESPONSIBILITY_PATH = 'responsibilities.0';

async function seedPublished(repo, locale, value) {
  const payload = structuredClone(CANONICAL);
  payload[0].responsibilities[0] = value;
  await repo.savePublished({
    target: 'committees',
    locale,
    partition: 'published',
    payload,
    status: 'fresh',
    sourceHash: computeSourceHash(CANONICAL),
    manualPaths: [`vice-presidency.${RESPONSIBILITY_PATH}`],
    stalePaths: [],
  });
}

test('own-committee responsibility editor grants both draft and publish actions', async () => {
  const [source, tabsSource] = await Promise.all([
    readFile(new URL('../src/pages/CommitteePage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/cmsLocalization/CmsEntityTranslationTabs.tsx', import.meta.url), 'utf8'),
  ]);
  const responsibilityModal = source.match(/\{\/\* Responsibility modal \*\/\}[\s\S]*?\{\/\* Stat modal \*\/\}/)?.[0] ?? '';

  assert.match(responsibilityModal, /canEdit=\{Boolean\(canEditContent\)\}/);
  assert.match(responsibilityModal, /canPublish=\{Boolean\(canEditContent\)\}/);
  assert.match(tabsSource, /cmsLocalization\.saveDraft/);
  assert.match(tabsSource, /isAuthorizedToPublish\s*&&\s*\([\s\S]*?cmsLocalization\.publishChanges/);
});

test('president and each current executive can publish only an authorized committee responsibility', () => {
  const ownCommittees = {
    VICE_PRESIDENT: 'vice-presidency',
    MEDIA_HEAD: 'media',
    FINANCE_HEAD: 'finance',
    AUDIT_HEAD: 'supervisory',
    ACADEMIC_HEAD: 'academic',
    ACTIVITIES_HEAD: 'activities',
  };
  const allCommittees = ['presidency', 'vice-presidency', 'media', 'finance', 'supervisory', 'academic', 'activities'];

  for (const committeeId of allCommittees) {
    assert.equal(canManageCouncilContent({ role: 'PRESIDENT', committee: 'presidency' }, committeeId), true);
  }
  for (const [role, ownCommittee] of Object.entries(ownCommittees)) {
    assert.equal(canManageCouncilContent({ role, committee: ownCommittee }, ownCommittee), true);
    for (const otherCommittee of allCommittees.filter((id) => id !== ownCommittee)) {
      assert.equal(canManageCouncilContent({ role, committee: ownCommittee }, otherCommittee), false);
    }
  }
});

test('student cannot publish a committee responsibility', () => {
  assert.equal(
    canManageCouncilContent({ role: 'STUDENT' }, 'vice-presidency'),
    false,
  );
});

test('Save Draft preserves the live published responsibility', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await seedPublished(repo, 'tr', 'Yayındaki eski sorumluluk');

  await saveCmsEntityDraft({
    repository: repo,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: CANONICAL,
    recordId: 'vice-presidency',
    fields: { [RESPONSIBILITY_PATH]: 'Taslak yeni sorumluluk' },
    committeeId: 'vice-presidency',
  });

  const published = await repo.getPublished('committees', 'tr');
  const draft = await repo.getDraft('committees', 'tr');
  assert.equal(published.payload[0].responsibilities[0], 'Yayındaki eski sorumluluk');
  assert.equal(draft.payload[0].responsibilities[0], 'Taslak yeni sorumluluk');
  assert.equal(
    overlayLocalizedCmsPayload(CANONICAL, published.payload, 'committees')[0].responsibilities[0],
    'Yayındaki eski sorumluluk',
  );
});

test('saved responsibility draft survives editor close and reopen', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await seedPublished(repo, 'en', 'Old published responsibility');
  await saveCmsEntityDraft({
    repository: repo,
    target: 'committees',
    locale: 'en',
    canonicalPayload: CANONICAL,
    recordId: 'vice-presidency',
    fields: { [RESPONSIBILITY_PATH]: 'Recoverable responsibility draft' },
    committeeId: 'vice-presidency',
  });

  const reopened = resolveCmsLocalizationScope({
    draftRecord: await repo.getDraft('committees', 'en'),
    publishedRecord: await repo.getPublished('committees', 'en'),
    recordId: 'vice-presidency',
    fieldPaths: [RESPONSIBILITY_PATH],
  });
  assert.equal(reopened.status, 'draft');
  assert.equal(reopened.values[RESPONSIBILITY_PATH], 'Recoverable responsibility draft');
});

test('Publish Changes writes the current Turkish responsibility and marks it fresh', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await seedPublished(repo, 'tr', 'Eski sorumluluk');

  const published = await publishCmsEntityFields({
    repository: repo,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: CANONICAL,
    recordId: 'vice-presidency',
    fields: { [RESPONSIBILITY_PATH]: 'Yeni yayımlanan sorumluluk' },
    committeeId: 'vice-presidency',
  });

  assert.equal(published.payload[0].responsibilities[0], 'Yeni yayımlanan sorumluluk');
  assert.equal(published.status, 'fresh');
  assert.equal(published.sourceHash, computeSourceHash(CANONICAL));
  assert.deepEqual(published.stalePaths, []);
});

test('published English responsibility survives a fresh repository read', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await seedPublished(repo, 'en', 'Old responsibility');
  await publishCmsEntityFields({
    repository: repo,
    target: 'committees',
    locale: 'en',
    canonicalPayload: CANONICAL,
    recordId: 'vice-presidency',
    fields: { [RESPONSIBILITY_PATH]: 'New published responsibility' },
    committeeId: 'vice-presidency',
  });

  const reloaded = await repo.getPublished('committees', 'en');
  assert.equal(reloaded.payload[0].responsibilities[0], 'New published responsibility');
  assert.equal(
    overlayLocalizedCmsPayload(CANONICAL, reloaded.payload, 'committees')[0].responsibilities[0],
    'New published responsibility',
  );
});

test('failed publication leaves the typed responsibility draft recoverable', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  await seedPublished(repo, 'tr', 'Yayındaki sorumluluk');
  await saveCmsEntityDraft({
    repository: repo,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: CANONICAL,
    recordId: 'vice-presidency',
    fields: { [RESPONSIBILITY_PATH]: 'Kurtarılabilir taslak' },
    committeeId: 'vice-presidency',
  });
  repo.savePublished = async () => {
    throw new Error('publish unavailable');
  };

  await assert.rejects(
    publishCmsEntityFields({
      repository: repo,
      target: 'committees',
      locale: 'tr',
      canonicalPayload: CANONICAL,
      recordId: 'vice-presidency',
      fields: { [RESPONSIBILITY_PATH]: 'Kurtarılabilir taslak' },
      committeeId: 'vice-presidency',
    }),
    /publish unavailable/,
  );

  const draft = await repo.getDraft('committees', 'tr');
  const published = await repo.getPublished('committees', 'tr');
  assert.equal(draft.payload[0].responsibilities[0], 'Kurtarılabilir taslak');
  assert.equal(published.payload[0].responsibilities[0], 'Yayındaki sorumluluk');
});
