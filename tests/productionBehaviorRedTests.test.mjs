import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  publishCmsEntityLocales,
  saveCmsEntityDraft,
} from '../src/domain/cmsLocalizationEditor.ts';
import {
  InMemoryCmsLocalizationRepository,
  resolveCmsTargetForLocale,
} from '../src/domain/cmsLocalizationRepository.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';
import {
  computeFieldHealth,
  extractLocalizedFieldValue,
} from '../src/domain/translationMonitoring.ts';
import { extractTranslatableCmsFields } from '../src/domain/cmsTranslatableFields.ts';
import { mapRowsToCurrentUser } from '../src/domain/supabaseMappers.ts';
import {
  buildManagedAssetPath,
  isOwnedManagedPath,
  routeForUsage,
  validateManagedFile,
} from '../src/domain/managedAssets.ts';
import { createManagedAssetRepository } from '../src/services/managedAssetService.ts';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';

const COMMITTEES = [
  {
    id: 'academic',
    name: 'اللجنة الأكاديمية',
    description: 'الوصف الرسمي للجنة الأكاديمية',
    vision: 'رؤيتنا الأكاديمية',
    goals: 'أهدافنا الأكاديمية',
    responsibilities: ['تنظيم الأنشطة الأكاديمية', 'الإشراف على المناهج'],
    head: { name: 'د. أحمد', role: 'ACADEMIC_HEAD', bio: 'نبذة عن رئيس اللجنة الأكاديمية' },
    stats: [
      { label: 'فعالية', value: 42 },
      { label: 'ورشة', value: 7 },
    ],
    members: [
      { id: 'm1', name: 'عضو أول', position: 'منسق البرامج الأكاديمية', photo: null },
      { id: 'm2', name: 'عضو ثان', position: 'منسق الإعلام الأكاديمي', photo: null },
    ],
  },
  {
    id: 'media',
    name: 'اللجنة الإعلامية',
    description: 'الوصف الرسمي للجنة الإعلامية',
    responsibilities: ['التغطية الإعلامية'],
    head: { name: 'م. سارة', role: 'MEDIA_HEAD', bio: 'نبذة' },
    stats: [{ label: 'تقرير', value: 12 }],
    members: [{ id: 'mm1', name: 'مصمم', position: 'مصمم جرافيك', photo: null }],
  },
];

const clone = (value) => JSON.parse(JSON.stringify(value));

const academicMemberRows = (payload) =>
  payload.find((committee) => committee.id === 'academic').members;

const findMember = (payload, memberId) =>
  academicMemberRows(payload).find((member) => member.id === memberId);

// ===========================================================================
// Part A — Unified member add/edit identity (production bug #5 domain behavior)
// ===========================================================================

test('A1. member ADD publishes the entered TR/EN position under the exact newMemberId, single row, Arabic intact', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);
  const newMemberId = 'cm-1740000000000';
  canonical[0].members.push({
    id: newMemberId,
    name: 'عضو جديد',
    position: 'منسق روابط الجامعات',
    photo: null,
  });

  await publishCmsEntityLocales({
    repository: repo,
    target: 'committees',
    canonicalPayload: canonical,
    recordId: newMemberId,
    translations: {
      tr: { position: 'TR Üniversite İlişkileri Sorumlusu' },
      en: { position: 'EN University Liaison Officer' },
    },
    committeeId: 'academic',
  });

  const tr = await repo.getPublished('committees', 'tr');
  const en = await repo.getPublished('committees', 'en');

  assert.equal(academicMemberRows(tr.payload).filter((m) => m.id === newMemberId).length, 1);
  assert.equal(academicMemberRows(en.payload).filter((m) => m.id === newMemberId).length, 1);
  assert.equal(findMember(tr.payload, newMemberId).position, 'TR Üniversite İlişkileri Sorumlusu');
  assert.equal(findMember(en.payload, newMemberId).position, 'EN University Liaison Officer');

  // The canonical Arabic name is an identity invariant and is never translated.
  assert.equal(findMember(tr.payload, newMemberId).name, 'عضو جديد');
  assert.equal(findMember(tr.payload, newMemberId).id, newMemberId);

  // The canonical payload itself is never mutated by a publish.
  assert.equal(canonical[0].members.at(-1).position, 'منسق روابط الجامعات');
});

test('A2. member EDIT replaces at the edited member id: one row, sibling untouched, no duplicate', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);
  canonical[0].members = canonical[0].members.map((member) =>
    member.id === 'm1' ? { ...member, position: 'منسق البرامج (محدث)' } : member,
  );

  await publishCmsEntityLocales({
    repository: repo,
    target: 'committees',
    canonicalPayload: canonical,
    recordId: 'm1',
    translations: {
      tr: { position: 'TR Güncellenmiş Program Sorumlusu' },
      en: { position: 'EN Updated Program Coordinator' },
    },
    committeeId: 'academic',
  });

  const tr = await repo.getPublished('committees', 'tr');
  const rows = academicMemberRows(tr.payload);

  assert.equal(rows.filter((m) => m.id === 'm1').length, 1, 'edit must never append a duplicate row');
  assert.equal(findMember(tr.payload, 'm1').position, 'TR Güncellenmiş Program Sorumlusu');
  assert.equal(rows.length, 2, 'exactly the canonical rows must remain');
  assert.equal(
    findMember(tr.payload, 'm2').position,
    'منسق الإعلام الأكاديمي',
    'a sibling member with no translation keeps its canonical Arabic position',
  );
});

test('A3. draft-path member saves REPLACE by member id, never accumulate duplicate translation rows', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);

  await saveCmsEntityDraft({
    repository: repo,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: canonical,
    recordId: 'm1',
    fields: { position: 'TR taslak v1' },
    committeeId: 'academic',
  });
  await saveCmsEntityDraft({
    repository: repo,
    target: 'committees',
    locale: 'tr',
    canonicalPayload: canonical,
    recordId: 'm1',
    fields: { position: 'TR taslak v2' },
    committeeId: 'academic',
  });

  const draft = await repo.getDraft('committees', 'tr');
  const rows = academicMemberRows(draft.payload);
  assert.equal(rows.filter((m) => m.id === 'm1').length, 1, 're-saving a draft must replace in place');
  assert.equal(findMember(draft.payload, 'm1').position, 'TR taslak v2');
});

// ===========================================================================
// Part B — Main-save publish orchestration for head bio, responsibilities, stats
// ===========================================================================

test('B1. head MAIN-save publishes head.bio TR/EN; canonical name and role stay Arabic identity', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);
  canonical[0].head.bio = 'نبذة محدثة عن رئيس اللجنة الأكاديمية';

  await publishCmsEntityLocales({
    repository: repo,
    target: 'committees',
    canonicalPayload: canonical,
    recordId: 'academic',
    translations: {
      tr: { 'head.bio': 'TR Akademik Komite Başkanı Biyografisi' },
      en: { 'head.bio': 'EN Academic Committee Head Biography' },
    },
    committeeId: 'academic',
  });

  const tr = await repo.getPublished('committees', 'tr');
  assert.equal(
    extractLocalizedFieldValue(canonical, tr.payload, '0.head.bio', 'academic'),
    'TR Akademik Komite Başkanı Biyografisi',
  );
  assert.equal(
    extractLocalizedFieldValue(canonical, (await repo.getPublished('committees', 'en')).payload, '0.head.bio', 'academic'),
    'EN Academic Committee Head Biography',
  );
  assert.equal(
    tr.payload.find((c) => c.id === 'academic').head.name,
    'د. أحمد',
    'person names are identity and must never be translated',
  );
});

test('B2. responsibility MAIN-save publishes responsibilities.0 TR/EN and leaves sibling responsibilities Arabic', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);
  canonical[0].responsibilities = ['مسؤولية معادلة جديدة', 'الإشراف على المناهج'];

  await publishCmsEntityLocales({
    repository: repo,
    target: 'committees',
    canonicalPayload: canonical,
    recordId: 'academic',
    translations: {
      tr: { 'responsibilities.0': 'TR Akademik Etkinlik Düzenleme' },
      en: { 'responsibilities.0': 'EN Organize Academic Activities' },
    },
    committeeId: 'academic',
  });

  const tr = await repo.getPublished('committees', 'tr');
  assert.equal(
    extractLocalizedFieldValue(canonical, tr.payload, '0.responsibilities.0', 'academic'),
    'TR Akademik Etkinlik Düzenleme',
  );
  assert.equal(
    tr.payload.find((c) => c.id === 'academic').responsibilities[1],
    'الإشراف على المناهج',
    'a responsibility without a translation keeps canonical Arabic',
  );
});

test('B3. statistic MAIN-save publishes stats.1 TR/EN label but never the numeric value', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);
  canonical[0].stats[1] = { ...canonical[0].stats[1], label: 'ورشة عمل محدثة' };

  await publishCmsEntityLocales({
    repository: repo,
    target: 'committees',
    canonicalPayload: canonical,
    recordId: 'academic.stats.1',
    translations: {
      tr: { label: 'TR Atölye' },
      en: { label: 'EN Workshop' },
    },
    committeeId: 'academic',
  });

  const tr = await repo.getPublished('committees', 'tr');
  const stat = tr.payload.find((c) => c.id === 'academic').stats[1];
  assert.equal(stat.label, 'TR Atölye');
  assert.equal(stat.value, 7, 'statistic numbers stay canonical');
  const enStat = (await repo.getPublished('committees', 'en')).payload.find((c) => c.id === 'academic').stats[1];
  assert.equal(enStat.label, 'EN Workshop');
});

test('B4. an Arabic request resolves canonical content with zero repository writes', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);

  const resolution = await resolveCmsTargetForLocale({
    repository: repo,
    target: 'committees',
    requestedLocale: 'ar',
    canonicalPayload: canonical,
  });

  assert.equal(resolution.actualLocale, 'ar');
  assert.equal(resolution.didFallback, false);
  assert.equal(resolution.repositoryError, null);
  assert.deepEqual(resolution.payload, canonical);
  assert.equal(await repo.getPublished('committees', 'tr'), null, 'Arabic reads must not create records');
});

// ===========================================================================
// Part C — Translation status / source-hash relay stays fresh after MAIN save
// ===========================================================================

test('C1. MAIN-save publish stores status fresh with the computed source hash and no stale paths', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);

  await publishCmsEntityLocales({
    repository: repo,
    target: 'committees',
    canonicalPayload: canonical,
    recordId: 'academic',
    translations: { tr: { description: 'TR komite açıklaması' } },
    committeeId: 'academic',
  });

  const tr = await repo.getPublished('committees', 'tr');
  assert.equal(tr.status, 'fresh');
  assert.equal(tr.sourceHash, computeSourceHash(canonical));
  assert.deepEqual(tr.stalePaths, []);

  const field = extractTranslatableCmsFields('committees', canonical)
    .find((f) => f.path === '0.description');
  const health = computeFieldHealth({
    target: 'committees',
    field,
    locale: 'tr',
    canonicalPayload: canonical,
    publishedRecord: tr,
  });
  assert.equal(health.publishedStatus, 'fresh');
  assert.equal(health.status, 'fresh');
});

test('C2. a stale production archive record with an old source hash is detected as stale', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);
  const stalePayload = clone(COMMITTEES);
  stalePayload[0].description = 'TR eski yayın';

  await repo.savePublished({
    target: 'committees',
    locale: 'tr',
    payload: stalePayload,
    status: 'stale',
    stalePaths: ['academic.description'],
    sourceHash: '000000000000deadbeef',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, { committeeId: 'academic' });

  const published = await repo.getPublished('committees', 'tr');
  const field = extractTranslatableCmsFields('committees', canonical)
    .find((f) => f.path === '0.description');
  const health = computeFieldHealth({
    target: 'committees',
    field,
    locale: 'tr',
    canonicalPayload: canonical,
    publishedRecord: published,
  });
  assert.equal(health.publishedStatus, 'stale');
  assert.equal(health.status, 'stale');
});

test('C3. re-publishing the description on MAIN save clears stale and restores fresh health', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonical = clone(COMMITTEES);
  const stalePayload = clone(COMMITTEES);
  stalePayload[0].description = 'TR eski yayın';

  await repo.savePublished({
    target: 'committees',
    locale: 'tr',
    payload: stalePayload,
    status: 'stale',
    stalePaths: ['academic.description'],
    sourceHash: '000000000000deadbeef',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, { committeeId: 'academic' });

  const canonicalNext = clone(COMMITTEES);
  canonicalNext[0].description = 'وصف أكاديمي محدث';

  await publishCmsEntityLocales({
    repository: repo,
    target: 'committees',
    canonicalPayload: canonicalNext,
    recordId: 'academic',
    translations: { tr: { description: 'TR güncel komite açıklaması' } },
    committeeId: 'academic',
  });

  const published = await repo.getPublished('committees', 'tr');
  assert.equal(published.status, 'fresh', 'a MAIN-save re-publish must clear the stale status');
  assert.deepEqual(published.stalePaths, [], 'stalePaths must be cleared by the publish executor');
  assert.equal(published.sourceHash, computeSourceHash(canonicalNext));

  const field = extractTranslatableCmsFields('committees', canonicalNext)
    .find((f) => f.path === '0.description');
  const health = computeFieldHealth({
    target: 'committees',
    field,
    locale: 'tr',
    canonicalPayload: canonicalNext,
    publishedRecord: published,
  });
  assert.equal(health.status, 'fresh', 'the monitoring view must not remain archived/stale after MAIN save');
});

// ===========================================================================
// Part D — Old-holder / identity-thief rows are never surfaced as the actor
// ===========================================================================

const AUTH_USER = { id: 'u-1', email: 'o1@ug.org' };
const PROFILE = {
  name: 'أول',
  contact_email: 'o1@ug.org',
  university: 'جامعة',
  major: 'تخصص',
  year: '3',
  phone: '+90',
  bio: 'نبذة',
  avatar_path: 'avatar.webp',
  status: 'active',
  joined_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

test('D1. the current executive assignment maps to the actor with role and committee', () => {
  const me = mapRowsToCurrentUser(AUTH_USER, PROFILE, {
    user_id: 'u-1',
    position_key: 'ACADEMIC_HEAD',
    committee_key: 'academic',
  });
  assert.equal(me.role, 'ACADEMIC_HEAD');
  assert.equal(me.committee, 'academic');
});

test('D2. a row belonging to another user (old holder or stolen identity) demotes the actor to STUDENT', () => {
  const stolen = mapRowsToCurrentUser(AUTH_USER, PROFILE, {
    user_id: 'u-other',
    position_key: 'ACADEMIC_HEAD',
    committee_key: 'academic',
  });
  assert.equal(stolen.role, 'STUDENT');

  const mismatched = mapRowsToCurrentUser(AUTH_USER, PROFILE, {
    user_id: 'u-1',
    position_key: 'ACADEMIC_HEAD',
    committee_key: 'media',
  });
  assert.equal(mismatched.role, 'STUDENT');
  assert.equal(mapRowsToCurrentUser(AUTH_USER, PROFILE, null).role, 'STUDENT');
});

// ===========================================================================
// Part E — Guide document managed-asset area accepted end to end
// ===========================================================================

test('E1. guide-document stays on the gallery/documents/document route with the guide area and maps registered rows', async () => {
  assert.deepEqual(routeForUsage('guide-document'), {
    bucket: 'gallery',
    folder: 'documents',
    kind: 'document',
    area: 'guide',
  });

  const pathResult = buildManagedAssetPath({
    usage: 'guide-document',
    ownerId: OWNER_ID,
    assetId: ASSET_ID,
    mimeType: 'application/pdf',
  });
  assert.ok(pathResult.ok);
  assert.equal(pathResult.path, `documents/${OWNER_ID}/guide/${ASSET_ID}.pdf`);
  assert.equal(isOwnedManagedPath(pathResult.path, OWNER_ID), true);

  const operations = [];
  const query = {
    select(columns) { operations.push(['select', columns]); return this; },
    eq(column, value) { operations.push(['eq', column, value]); return this; },
    maybeSingle() {
      operations.push(['maybeSingle']);
      return Promise.resolve({
        data: {
          id: ASSET_ID,
          bucket: 'gallery',
          object_path: pathResult.path,
          public_url: 'https://example.test/rehber.pdf',
          kind: 'document',
          area: 'guide',
          mime_type: 'application/pdf',
          size_bytes: 4096,
        },
        error: null,
      });
    },
  };
  const client = {
    from(table) { operations.push(['from', table]); return query; },
  };

  const result = await createManagedAssetRepository(client).findManagedAssetByPath('gallery', pathResult.path);
  assert.equal(result.ok, true);
  assert.equal(result.data.area, 'guide');
  assert.equal(result.data.path, pathResult.path);
  assert.deepEqual(operations, [
    ['from', 'managed_assets'],
    ['select', 'id,bucket,object_path,public_url,kind,area,mime_type,size_bytes'],
    ['eq', 'bucket', 'gallery'],
    ['eq', 'object_path', pathResult.path],
    ['maybeSingle'],
  ]);
});

test('E2. guide document upload validation accepts office/pdf types and rejects non-document content', () => {
  const cases = [
    ['rehber.pdf', 'application/pdf', 'pdf'],
    ['rehber.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
    ['veri.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ];
  for (const [name, type, extension] of cases) {
    const ok = validateManagedFile({ name, type, size: 2048 }, 'document', 'guide-document');
    assert.deepEqual(ok, { ok: true, extension, maxBytes: 20 * 1024 * 1024 });
  }

  const image = validateManagedFile({ name: 'foto.png', type: 'image/png', size: 2048 }, 'document', 'guide-document');
  assert.equal(image.ok, false);
  assert.equal(image.code, 'FILE_TYPE_UNSUPPORTED');

  const mismatch = validateManagedFile({ name: 'rehber.pdf', type: 'application/msword', size: 2048 }, 'document', 'guide-document');
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, 'FILE_EXTENSION_MISMATCH');
});

test('E3. the base managed_assets table allows the guide area only through the forward area CHECK', async () => {
  const sql = await readFile(
    new URL('../supabase/migrations/20260824143201_site_wide_managed_assets.sql', import.meta.url),
    'utf8',
  );
  assert.match(
    sql,
    /area text NOT NULL CHECK \(area IN \('news', 'events', 'gallery', 'site', 'plans', 'reports', 'avatar'\)\)/,
    'the base column CHECK auto-names managed_assets_area_check, which the forward migration must relax with guide',
  );
});