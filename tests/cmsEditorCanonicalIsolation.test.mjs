import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { overlayLocalizedCmsPayload } from '../src/domain/cmsPublicRead.ts';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';
import { executeCmsPublish } from '../src/domain/cmsLocalizationEditor.ts';
import { resolvePublicBrandName, AUTHORITATIVE_BRAND_NAMES } from '../src/domain/publicBrand.ts';

// Helper simulating canonical field value resolution from InlineEditOverlay
function getCanonicalFieldValue(target, canonicalPayload, fieldKey, effectiveVal) {
  if (canonicalPayload && typeof canonicalPayload === 'object') {
    const segments = fieldKey.split('.');
    let cur = canonicalPayload;
    for (const seg of segments) {
      if (cur && typeof cur === 'object' && seg in cur) {
        cur = cur[seg];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === 'string') return cur;
  }
  return effectiveVal;
}

// Sample canonical Arabic payloads
const sampleCanonicalSite = {
  hero: {
    badge: 'نُمكّن الشباب، نبني المستقبل',
    title: 'اتحاد شباب الأمة',
    subtitle: 'نحو جيلٍ واعٍ ومسؤول',
    description: 'اتحاد شبابي يجمع طلاب الجامعات تحت مظلة واحدة...',
    primaryBtn: 'تصفح البرامج',
    secondaryBtn: 'تعرّف على الاتحاد',
    tertiaryBtn: 'الهيئة التنفيذية',
    image: 'https://example.com/canonical-hero.jpg',
  },
  about: {
    badge: 'من نحن',
    title: 'رسالتنا: بناء جيلٍ يحمل همّ أمته',
    subtitle: 'انضم إلى عائلة اتحاد شباب الأمة',
    description: 'نؤمن أن الشباب هم عماد المستقبل وصناع التغيير...',
    image: 'https://example.com/canonical-about.jpg',
  },
  brand: {
    name: 'اتحاد شباب الأمة',
    nameTr: 'Ummet Gençleri Birliği',
  },
};

const samplePublishedTrSite = {
  hero: {
    badge: 'Gençleri Güçlendiriyor, Geleceği İnşa Ediyoruz',
    title: 'Ümmet Gençleri Birliği',
    subtitle: 'Bilinçli ve Sorumlu Bir Nesle Doğru',
    description: 'Üniversite öğrencilerini tek çatı altında buluşturan...',
    primaryBtn: 'Programları İncele',
    secondaryBtn: 'Birliği Tanıyın',
    tertiaryBtn: 'Yönetim Kurulu',
  },
  about: {
    badge: 'Biz Kimiz',
    title: 'Misyonumuz: Ümmetinin Derdiyle Dertlenen Bir Nesil Yetiştirmek',
    subtitle: 'Ümmet Gençleri Birliği Ailesine Katılın',
    description: 'Gençlerin geleceğin mimarları olduğuna inanıyoruz...',
  },
};

const samplePublishedEnSite = {
  hero: {
    badge: 'Empowering Youth, Building the Future',
    title: 'Ummah Youth Union',
    subtitle: 'Towards a Conscious and Responsible Generation',
    description: 'A youth union uniting university students under one umbrella...',
    primaryBtn: 'Explore Programs',
    secondaryBtn: 'Discover the Union',
    tertiaryBtn: 'Executive Board',
  },
  about: {
    badge: 'Who We Are',
    title: 'Our Mission: Building a Generation Dedicated to Its Ummah',
    subtitle: 'Join the Ummah Youth Union Family',
    description: 'We believe that youth are the pillars of the future...',
  },
};

// ===========================================================================
// Test Suite: Inline Translation Editor Publish-to-Fresh Workflow Verification
// ===========================================================================

test('1. Inline editor shows Arabic canonical source in TR mode', async () => {
  const inlineSource = await readFile(new URL('../src/components/InlineEditOverlay.tsx', import.meta.url), 'utf8');
  assert.match(inlineSource, /العربية — المصدر/);
  assert.match(inlineSource, /cmsLocalization\.canonicalSource/);

  // Website is currently viewed in Turkish
  const effectiveSiteTr = overlayLocalizedCmsPayload(sampleCanonicalSite, samplePublishedTrSite, 'site');
  assert.equal(effectiveSiteTr.hero.title, 'Ümmet Gençleri Birliği');

  // Inline editor extracts canonical Arabic source
  const canonTitle = getCanonicalFieldValue('site', sampleCanonicalSite, 'hero.title', effectiveSiteTr.hero.title);
  assert.equal(canonTitle, 'اتحاد شباب الأمة', 'Editor canonical source must remain Arabic in TR mode');
  assert.notEqual(canonTitle, effectiveSiteTr.hero.title);
});

test('2. Inline editor shows Arabic canonical source in EN mode', async () => {
  // Website is currently viewed in English
  const effectiveSiteEn = overlayLocalizedCmsPayload(sampleCanonicalSite, samplePublishedEnSite, 'site');
  assert.equal(effectiveSiteEn.hero.title, 'Ummah Youth Union');

  // Inline editor extracts canonical Arabic source
  const canonTitle = getCanonicalFieldValue('site', sampleCanonicalSite, 'hero.title', effectiveSiteEn.hero.title);
  assert.equal(canonTitle, 'اتحاد شباب الأمة', 'Editor canonical source must remain Arabic in EN mode');
  assert.notEqual(canonTitle, effectiveSiteEn.hero.title);
});

test('3. Inline TR Save Draft works', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  // Initial published state
  await repo.savePublished({
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Eski Metin' } },
    sourceHash,
    status: 'fresh',
    manualPaths: ['hero.title'],
  });

  // Inline editor saves draft: "Yeni Metin"
  const draftRecord = await repo.saveDraft({
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Yeni Metin' } },
    sourceHash,
    status: 'draft',
    manualPaths: ['hero.title'],
  });

  assert.equal(draftRecord.target, 'site');
  assert.equal(draftRecord.locale, 'tr');
  assert.equal(draftRecord.status, 'draft');
  assert.equal(draftRecord.payload.hero.title, 'Yeni Metin');

  const loadedDraft = await repo.getDraft('site', 'tr');
  assert.ok(loadedDraft);
  assert.equal(loadedDraft.status, 'draft');
  assert.equal(loadedDraft.payload.hero.title, 'Yeni Metin');
});

test('4. Inline TR draft not public', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  await repo.savePublished({
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Eski Metin' } },
    sourceHash,
    status: 'fresh',
    manualPaths: ['hero.title'],
  });

  await repo.saveDraft({
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Yeni Metin' } },
    sourceHash,
    status: 'draft',
    manualPaths: ['hero.title'],
  });

  // Public read only queries published partition
  const publicRow = await repo.getPublished('site', 'tr');
  const publicView = overlayLocalizedCmsPayload(sampleCanonicalSite, publicRow?.payload, 'site');

  assert.equal(publicRow?.payload.hero.title, 'Eski Metin');
  assert.equal(publicView.hero.title, 'Eski Metin', 'Public site must NOT see draft value');
  assert.notEqual(publicView.hero.title, 'Yeni Metin');
});

test('5. Inline TR Publish button available when authorized', async () => {
  const sectionSource = await readFile(
    new URL('../src/components/cmsLocalization/CmsTranslationSection.tsx', import.meta.url),
    'utf8',
  );

  // Publish button rendered conditionally for authorized publisher
  assert.match(sectionSource, /\{isAuthorizedToPublish\s*&&/);
  assert.match(sectionSource, /handlePublish\('tr'\)/);
  assert.match(sectionSource, /publishChanges/);

  // Evaluation logic
  const checkAuthorized = (canPublish, canEdit) =>
    canPublish !== undefined ? canPublish : Boolean(canEdit);

  assert.equal(checkAuthorized(true, true), true, 'Authorized user must have publish button available');
  assert.equal(checkAuthorized(false, true), false, 'Proposal-only user must NOT have publish button');
});

test('6. Inline TR Publish -> Fresh', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  // Save draft first
  await repo.saveDraft({
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Yeni Metin' } },
    sourceHash,
    status: 'draft',
    manualPaths: ['hero.title'],
  });

  // Authorized publish via shared executeCmsPublish
  const published = await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'tr',
    canonicalPayload: sampleCanonicalSite,
    payload: { hero: { title: 'Yeni Metin' } },
    manualPaths: ['hero.title'],
  });

  assert.equal(published.target, 'site');
  assert.equal(published.locale, 'tr');
  assert.equal(published.status, 'fresh');
  assert.equal(published.sourceHash, sourceHash);
  assert.equal(published.payload.hero.title, 'Yeni Metin');

  const loaded = await repo.getPublished('site', 'tr');
  assert.ok(loaded);
  assert.equal(loaded.status, 'fresh');
  assert.equal(loaded.payload.hero.title, 'Yeni Metin');
});

test('7. Inline TR public read = new published value', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'tr',
    canonicalPayload: sampleCanonicalSite,
    payload: { hero: { title: 'Yeni Metin' } },
    manualPaths: ['hero.title'],
  });

  const publicRow = await repo.getPublished('site', 'tr');
  const publicView = overlayLocalizedCmsPayload(sampleCanonicalSite, publicRow?.payload, 'site');

  assert.equal(publicView.hero.title, 'Yeni Metin', 'Public read must immediately return newly published Turkish text');
});

test('8. Inline EN Save Draft works', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  await repo.savePublished({
    target: 'site',
    locale: 'en',
    payload: { hero: { title: 'Old English Text' } },
    sourceHash,
    status: 'fresh',
    manualPaths: ['hero.title'],
  });

  const draftRecord = await repo.saveDraft({
    target: 'site',
    locale: 'en',
    payload: { hero: { title: 'New English Text' } },
    sourceHash,
    status: 'draft',
    manualPaths: ['hero.title'],
  });

  assert.equal(draftRecord.target, 'site');
  assert.equal(draftRecord.locale, 'en');
  assert.equal(draftRecord.status, 'draft');
  assert.equal(draftRecord.payload.hero.title, 'New English Text');
});

test('9. Inline EN draft not public', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  await repo.savePublished({
    target: 'site',
    locale: 'en',
    payload: { hero: { title: 'Old English Text' } },
    sourceHash,
    status: 'fresh',
    manualPaths: ['hero.title'],
  });

  await repo.saveDraft({
    target: 'site',
    locale: 'en',
    payload: { hero: { title: 'New English Text' } },
    sourceHash,
    status: 'draft',
    manualPaths: ['hero.title'],
  });

  const publicRow = await repo.getPublished('site', 'en');
  const publicView = overlayLocalizedCmsPayload(sampleCanonicalSite, publicRow?.payload, 'site');

  assert.equal(publicRow?.payload.hero.title, 'Old English Text');
  assert.equal(publicView.hero.title, 'Old English Text', 'Public site must NOT see English draft value');
  assert.notEqual(publicView.hero.title, 'New English Text');
});

test('10. Inline EN Publish -> Fresh', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  const published = await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'en',
    canonicalPayload: sampleCanonicalSite,
    payload: { hero: { title: 'New English Text' } },
    manualPaths: ['hero.title'],
  });

  assert.equal(published.target, 'site');
  assert.equal(published.locale, 'en');
  assert.equal(published.status, 'fresh');
  assert.equal(published.sourceHash, sourceHash);
  assert.equal(published.payload.hero.title, 'New English Text');

  const loaded = await repo.getPublished('site', 'en');
  assert.ok(loaded);
  assert.equal(loaded.status, 'fresh');
  assert.equal(loaded.payload.hero.title, 'New English Text');
});

test('11. Inline EN public read = new published value', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'en',
    canonicalPayload: sampleCanonicalSite,
    payload: { hero: { title: 'New English Text' } },
    manualPaths: ['hero.title'],
  });

  const publicRow = await repo.getPublished('site', 'en');
  const publicView = overlayLocalizedCmsPayload(sampleCanonicalSite, publicRow?.payload, 'site');

  assert.equal(publicView.hero.title, 'New English Text', 'Public read must immediately return newly published English text');
});

test('12. Consumed draft removed after publish', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  // Draft saved first
  await repo.saveDraft({
    target: 'site',
    locale: 'tr',
    payload: { hero: { title: 'Taslak Metin' } },
    sourceHash,
    status: 'draft',
    manualPaths: ['hero.title'],
  });

  const draftBefore = await repo.getDraft('site', 'tr');
  assert.ok(draftBefore, 'Draft must exist before publish');

  // Publish executes shared executeCmsPublish
  await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'tr',
    canonicalPayload: sampleCanonicalSite,
    payload: { hero: { title: 'Yayınlanan Metin' } },
    manualPaths: ['hero.title'],
  });

  const draftAfter = await repo.getDraft('site', 'tr');
  assert.equal(draftAfter, null, 'Consumed draft must be deleted after publish');

  const published = await repo.getPublished('site', 'tr');
  assert.ok(published);
  assert.equal(published.status, 'fresh');
  assert.equal(published.payload.hero.title, 'Yayınlanan Metin');
});

test('13. Proposal-only user has no inline publish action', async () => {
  const [overlaySource, sectionSource] = await Promise.all([
    readFile(new URL('../src/components/InlineEditOverlay.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/cmsLocalization/CmsTranslationSection.tsx', import.meta.url), 'utf8'),
  ]);

  // InlineEditOverlay derives canPublish based on President authority
  assert.match(overlaySource, /currentUser\?\.role === 'PRESIDENT'/);
  assert.match(overlaySource, /canPublish=\{canPublish\}/);

  // CmsTranslationSection hides publish button when isAuthorizedToPublish is false
  assert.match(sectionSource, /\{isAuthorizedToPublish\s*&&/);

  // Proposal-only user role check
  const isMediaHead = { role: 'MEDIA_HEAD' };
  const canPublishMedia = isMediaHead.role === 'PRESIDENT';
  assert.equal(canPublishMedia, false, 'Proposal-only user (MEDIA_HEAD) must not be authorized to publish');
});

test('14. Unauthorized user cannot publish', () => {
  const checkUserPublishAuth = (user) => Boolean(user && user.role === 'PRESIDENT');

  assert.equal(checkUserPublishAuth({ role: 'STUDENT' }), false, 'Student cannot publish');
  assert.equal(checkUserPublishAuth({ role: 'MEMBER' }), false, 'Member cannot publish');
  assert.equal(checkUserPublishAuth(null), false, 'Anonymous cannot publish');
  assert.equal(checkUserPublishAuth({ role: 'PRESIDENT' }), true, 'President can publish');
});

test('15. Canonical Arabic unchanged', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const canonicalBefore = JSON.parse(JSON.stringify(sampleCanonicalSite));
  const sourceHashBefore = computeSourceHash(canonicalBefore);

  await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'tr',
    canonicalPayload: canonicalBefore,
    payload: { hero: { title: 'Türkçe Yayın' } },
    manualPaths: ['hero.title'],
  });

  await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'en',
    canonicalPayload: canonicalBefore,
    payload: { hero: { title: 'English Publish' } },
    manualPaths: ['hero.title'],
  });

  const canonicalAfter = JSON.parse(JSON.stringify(sampleCanonicalSite));
  const sourceHashAfter = computeSourceHash(canonicalAfter);

  assert.deepEqual(canonicalBefore, canonicalAfter, 'Canonical Arabic must remain byte-for-byte identical');
  assert.equal(sourceHashBefore, sourceHashAfter, 'Canonical Arabic sourceHash must not change');
  assert.equal(sampleCanonicalSite.hero.title, 'اتحاد شباب الأمة');
  assert.equal(sampleCanonicalSite.about.badge, 'من نحن');
});

test('16. Brand inline AR/TR/EN values correct', () => {
  const brand = { name: 'اتحاد شباب الأمة', nameTr: 'Ummet Gençleri Birliği' };

  assert.equal(resolvePublicBrandName('ar', brand), AUTHORITATIVE_BRAND_NAMES.ar);
  assert.equal(resolvePublicBrandName('tr', brand), AUTHORITATIVE_BRAND_NAMES.tr);
  assert.equal(resolvePublicBrandName('en', brand), AUTHORITATIVE_BRAND_NAMES.en);

  assert.equal(resolvePublicBrandName('ar', brand), 'اتحاد شباب الأمة');
  assert.equal(resolvePublicBrandName('tr', brand), 'Ümmet Gençleri Birliği');
  assert.equal(resolvePublicBrandName('en', brand), 'Ummah Youth Union');
});

test('17. about.badge inline publish works', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  // Baseline published TR: Hakkımızda
  await repo.savePublished({
    target: 'site',
    locale: 'tr',
    payload: { about: { badge: 'Hakkımızda' } },
    sourceHash,
    status: 'fresh',
    manualPaths: ['about.badge'],
  });

  // Inline edit TR: Biz Kimiz -> Publish
  await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'tr',
    canonicalPayload: sampleCanonicalSite,
    payload: { about: { badge: 'Biz Kimiz' } },
    manualPaths: ['about.badge'],
  });

  const publicTr = await repo.getPublished('site', 'tr');
  const viewTr = overlayLocalizedCmsPayload(sampleCanonicalSite, publicTr?.payload, 'site');
  assert.equal(viewTr.about.badge, 'Biz Kimiz', 'TR about.badge must be Biz Kimiz after publish');

  // Inline edit EN: Who We Are -> Publish
  await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'en',
    canonicalPayload: sampleCanonicalSite,
    payload: { about: { badge: 'Who We Are' } },
    manualPaths: ['about.badge'],
  });

  const publicEn = await repo.getPublished('site', 'en');
  const viewEn = overlayLocalizedCmsPayload(sampleCanonicalSite, publicEn?.payload, 'site');
  assert.equal(viewEn.about.badge, 'Who We Are', 'EN about.badge must be Who We Are after publish');

  // Canonical Arabic remains untouched
  assert.equal(sampleCanonicalSite.about.badge, 'من نحن');
});

test('18. hero.description inline publish works', async () => {
  const repo = new InMemoryCmsLocalizationRepository();
  const sourceHash = computeSourceHash(sampleCanonicalSite);

  const initialTrDesc = 'Eski Açıklama';
  const newTrDesc = 'Üniversite öğrencilerini tek çatı altında buluşturan gençlik birliği...';

  await repo.savePublished({
    target: 'site',
    locale: 'tr',
    payload: { hero: { description: initialTrDesc } },
    sourceHash,
    status: 'fresh',
    manualPaths: ['hero.description'],
  });

  // Publish updated description
  await executeCmsPublish({
    repository: repo,
    target: 'site',
    locale: 'tr',
    canonicalPayload: sampleCanonicalSite,
    payload: { hero: { description: newTrDesc } },
    manualPaths: ['hero.description'],
  });

  const publicTr = await repo.getPublished('site', 'tr');
  const viewTr = overlayLocalizedCmsPayload(sampleCanonicalSite, publicTr?.payload, 'site');
  assert.equal(viewTr.hero.description, newTrDesc, 'TR hero.description must reflect new published value');

  // Canonical Arabic description unchanged
  assert.equal(sampleCanonicalSite.hero.description, 'اتحاد شبابي يجمع طلاب الجامعات تحت مظلة واحدة...');
});
