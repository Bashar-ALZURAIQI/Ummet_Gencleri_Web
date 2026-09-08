import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFieldHealth,
  computeTargetHealth,
  computeOverallMonitoringSummary,
  calculateLocaleStats,
} from '../src/domain/translationMonitoring.ts';
import {
  extractTranslatableCmsFields,
} from '../src/domain/cmsTranslatableFields.ts';
import { computeSourceHash } from '../src/domain/cmsLocalization.ts';

test('1. Fully translated fresh field -> Fresh', () => {
  const canonical = { title: 'عنوان الفعالية' };
  const extracted = extractTranslatableCmsFields('events', canonical);
  assert.equal(extracted.length, 1);

  const health = computeFieldHealth({
    target: 'events',
    field: extracted[0],
    locale: 'tr',
    canonicalPayload: canonical,
    publishedRecord: {
      id: 'pub-1',
      target: 'events',
      locale: 'tr',
      partition: 'published',
      status: 'fresh',
      payload: { title: 'Etkinlik Başlığı' },
      sourceHash: computeSourceHash(canonical),
      stalePaths: [],
      manualPaths: ['title'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  });

  assert.equal(health.status, 'fresh');
  assert.equal(health.publishedStatus, 'fresh');
  assert.equal(health.hasDraft, false);
  assert.equal(health.publishedValue, 'Etkinlik Başlığı');
});

test('2. No published value -> Missing', () => {
  const canonical = { title: 'عنوان الفعالية' };
  const extracted = extractTranslatableCmsFields('events', canonical);

  const health = computeFieldHealth({
    target: 'events',
    field: extracted[0],
    locale: 'tr',
    canonicalPayload: canonical,
    publishedRecord: null,
  });

  assert.equal(health.status, 'missing');
  assert.equal(health.publishedStatus, 'missing');
  assert.equal(health.hasDraft, false);
  assert.equal(health.publishedValue, undefined);
});

test('3. whitespace-only published value -> Missing', () => {
  const canonical = { title: 'عنوان الفعالية' };
  const extracted = extractTranslatableCmsFields('events', canonical);

  const health = computeFieldHealth({
    target: 'events',
    field: extracted[0],
    locale: 'tr',
    canonicalPayload: canonical,
    publishedRecord: {
      id: 'pub-1',
      target: 'events',
      locale: 'tr',
      partition: 'published',
      status: 'fresh',
      payload: { title: '   ' },
      sourceHash: computeSourceHash(canonical),
      stalePaths: [],
      manualPaths: ['title'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  });

  assert.equal(health.status, 'missing');
  assert.equal(health.publishedStatus, 'missing');
  assert.equal(health.publishedValue, undefined);
});

test('4. stalePaths field -> Stale', () => {
  const canonical = { title: 'عنوان الفعالية' };
  const extracted = extractTranslatableCmsFields('events', canonical);

  const health = computeFieldHealth({
    target: 'events',
    field: extracted[0],
    locale: 'tr',
    canonicalPayload: canonical,
    publishedRecord: {
      id: 'pub-1',
      target: 'events',
      locale: 'tr',
      partition: 'published',
      status: 'fresh',
      payload: { title: 'Eski Başlık' },
      sourceHash: computeSourceHash(canonical),
      stalePaths: ['title'],
      manualPaths: ['title'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  });

  assert.equal(health.status, 'stale');
  assert.equal(health.publishedStatus, 'stale');
  assert.equal(health.hasDraft, false);
});

test('5. stale sourceHash fallback -> Stale', () => {
  const canonical = { title: 'عنوان الفعالية الجديد' };
  const extracted = extractTranslatableCmsFields('events', canonical);

  const health = computeFieldHealth({
    target: 'events',
    field: extracted[0],
    locale: 'tr',
    canonicalPayload: canonical,
    publishedRecord: {
      id: 'pub-1',
      target: 'events',
      locale: 'tr',
      partition: 'published',
      status: 'fresh',
      payload: { title: 'Etkinlik Başlığı' },
      sourceHash: 'outdated_hash_123',
      stalePaths: [],
      manualPaths: ['title'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  });

  assert.equal(health.status, 'stale');
  assert.equal(health.publishedStatus, 'stale');
});

test('6. pending draft -> Draft', () => {
  const canonical = { title: 'عنوان الفعالية' };
  const extracted = extractTranslatableCmsFields('events', canonical);

  const health = computeFieldHealth({
    target: 'events',
    field: extracted[0],
    locale: 'tr',
    canonicalPayload: canonical,
    publishedRecord: {
      id: 'pub-1',
      target: 'events',
      locale: 'tr',
      partition: 'published',
      status: 'fresh',
      payload: { title: 'Eski Başlık' },
      sourceHash: computeSourceHash(canonical),
      stalePaths: [],
      manualPaths: ['title'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    draftRecord: {
      id: 'draft-1',
      target: 'events',
      locale: 'tr',
      partition: 'draft',
      status: 'draft',
      payload: { title: 'Taslak Yeni Başlık' },
      sourceHash: computeSourceHash(canonical),
      stalePaths: [],
      manualPaths: ['title'],
      createdAt: '2026-09-02T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z',
    },
  });

  assert.equal(health.status, 'draft');
  assert.equal(health.hasDraft, true);
  assert.equal(health.draftValue, 'Taslak Yeni Başlık');
  assert.equal(health.publishedValue, 'Eski Başlık');
});

test('7. Draft does not make public published value Fresh', () => {
  const canonical = { title: 'عنوان الفعالية' };
  const extracted = extractTranslatableCmsFields('events', canonical);

  const health = computeFieldHealth({
    target: 'events',
    field: extracted[0],
    locale: 'tr',
    canonicalPayload: canonical,
    publishedRecord: null, // No published value!
    draftRecord: {
      id: 'draft-1',
      target: 'events',
      locale: 'tr',
      partition: 'draft',
      status: 'draft',
      payload: { title: 'Taslak Başlık' },
      sourceHash: computeSourceHash(canonical),
      stalePaths: [],
      manualPaths: ['title'],
      createdAt: '2026-09-02T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z',
    },
  });

  assert.equal(health.status, 'draft');
  assert.equal(health.publishedStatus, 'missing');
  assert.equal(health.publishedValue, undefined);
});

test('8. TR and EN calculated independently', () => {
  const canonical = { title: 'عنوان الفعالية' };
  const targetHealth = computeTargetHealth({
    target: 'events',
    canonicalPayload: canonical,
    publishedTr: {
      id: 'pub-tr',
      target: 'events',
      locale: 'tr',
      partition: 'published',
      status: 'fresh',
      payload: { title: 'Etkinlik Başlığı' },
      sourceHash: computeSourceHash(canonical),
      stalePaths: [],
      manualPaths: ['title'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    publishedEn: null, // Missing for English!
  });

  assert.equal(targetHealth.tr.fresh, 1);
  assert.equal(targetHealth.tr.missing, 0);
  assert.equal(targetHealth.tr.freshPercentage, 100);

  assert.equal(targetHealth.en.fresh, 0);
  assert.equal(targetHealth.en.missing, 1);
  assert.equal(targetHealth.en.freshPercentage, 0);
});

test('9. primitive string arrays handled', () => {
  const canonical = {
    story: {
      badge: 'من نحن',
      title: 'قصتنا',
      paragraphs: [
        'الفقرة الأولى من القصة.',
        'الفقرة الثانية من القصة.',
      ],
    },
  };

  const targetHealth = computeTargetHealth({
    target: 'about',
    canonicalPayload: canonical,
    publishedTr: {
      id: 'pub-tr',
      target: 'about',
      locale: 'tr',
      partition: 'published',
      status: 'fresh',
      payload: {
        story: {
          badge: 'Hakkımızda',
          title: 'Hikayemiz',
          paragraphs: [
            'Hikayenin birinci paragrafı.',
            'Hikayenin ikinci paragrafı.',
          ],
        },
      },
      sourceHash: computeSourceHash(canonical),
      stalePaths: [],
      manualPaths: ['*'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  });

  const p0 = targetHealth.fields.find((f) => f.locale === 'tr' && f.path === 'story.paragraphs.0');
  const p1 = targetHealth.fields.find((f) => f.locale === 'tr' && f.path === 'story.paragraphs.1');

  assert.ok(p0);
  assert.ok(p1);
  assert.equal(p0.status, 'fresh');
  assert.equal(p0.publishedValue, 'Hikayenin birinci paragrafı.');
  assert.equal(p1.status, 'fresh');
  assert.equal(p1.publishedValue, 'Hikayenin ikinci paragrafı.');
});

test('10. entity arrays matched safely', () => {
  const canonical = [
    { id: 'ev-1', title: 'الفعالية الأولى', description: 'وصف الفعالية' },
    { id: 'ev-2', title: 'الفعالية الثانية', description: 'وصف الفعالية 2' },
  ];

  const targetHealth = computeTargetHealth({
    target: 'events',
    canonicalPayload: canonical,
    publishedTr: {
      id: 'pub-tr',
      target: 'events',
      locale: 'tr',
      partition: 'published',
      status: 'fresh',
      // Reversed order in localization payload to prove entity ID matching
      payload: [
        { id: 'ev-2', title: 'İkinci Etkinlik', description: 'İkinci Açıklama' },
        { id: 'ev-1', title: 'Birinci Etkinlik', description: 'Birinci Açıklama' },
      ],
      sourceHash: computeSourceHash(canonical),
      stalePaths: [],
      manualPaths: ['*'],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  });

  const ev1Title = targetHealth.fields.find((f) => f.locale === 'tr' && f.path === '0.title');
  assert.ok(ev1Title);
  assert.equal(ev1Title.entityId, 'ev-1');
  assert.equal(ev1Title.publishedValue, 'Birinci Etkinlik');
});

test('11. technical IDs ignored', () => {
  const canonical = [
    { id: 'uuid-1234-5678', title: 'العنوان' },
  ];
  const fields = extractTranslatableCmsFields('events', canonical);
  const paths = fields.map((f) => f.path);
  assert.ok(!paths.includes('0.id'));
  assert.ok(!paths.includes('id'));
  assert.ok(paths.includes('0.title'));
});

test('12. URLs ignored', () => {
  const canonical = {
    hero: {
      title: 'عنوان',
      image: 'https://example.com/hero.jpg',
    },
    footer: {
      social: {
        twitter: 'https://twitter.com/ummet',
      },
    },
  };
  const fields = extractTranslatableCmsFields('site', canonical);
  const paths = fields.map((f) => f.path);
  assert.ok(!paths.includes('hero.image'));
  assert.ok(!paths.includes('footer.social.twitter'));
});

test('13. image fields ignored', () => {
  const canonical = {
    hero: {
      title: 'العنوان',
      image: '/images/hero.jpg',
    },
    about: {
      image: '/images/about.jpg',
    },
  };
  const fields = extractTranslatableCmsFields('site', canonical);
  const paths = fields.map((f) => f.path);
  assert.ok(!paths.includes('hero.image'));
  assert.ok(!paths.includes('about.image'));
});

test('14. emails/phones ignored', () => {
  const canonical = {
    footer: {
      email: 'info@ummet.org',
      phone: '00905375922478',
      address: 'أرضروم، تركيا',
    },
  };
  const fields = extractTranslatableCmsFields('site', canonical);
  const paths = fields.map((f) => f.path);
  assert.ok(!paths.includes('footer.email'));
  assert.ok(!paths.includes('footer.phone'));
  assert.ok(paths.includes('footer.address'));
});

test('15. contact address/hours counted', () => {
  const canonical = [
    { id: 'address', title: 'العنوان', value: 'أرضروم، تركيا', sub: 'المقر' },
    { id: 'hours', title: 'أوقات العمل', value: 'الاثنين - الجمعة', sub: '09:00 - 18:00' },
  ];
  const fields = extractTranslatableCmsFields('contactCards', canonical);
  const paths = fields.map((f) => f.path);
  assert.ok(paths.includes('0.value'));
  assert.ok(paths.includes('1.value'));
});

test('16. contact email/phone not counted', () => {
  const canonical = [
    { id: 'email', title: 'البريد', value: 'info@ummet.org', sub: 'للاستفسارات' },
    { id: 'phone', title: 'الهاتف', value: '+90 442 231 0000', sub: 'أيام العمل' },
  ];
  const fields = extractTranslatableCmsFields('contactCards', canonical);
  const paths = fields.map((f) => f.path);
  assert.ok(!paths.includes('0.value')); // email value is excluded!
  assert.ok(!paths.includes('1.value')); // phone value is excluded!
  assert.ok(paths.includes('0.title')); // titles are translatable
  assert.ok(paths.includes('1.title'));
});

test('17. person names excluded where schema says canonical', () => {
  const canonical = [
    {
      id: 'presidency',
      head: {
        name: 'م. بشار الزريقي',
        role: 'رئيس الاتحاد',
        bio: 'عضو الهيئة الإدارية',
      },
      members: [
        { name: 'م. سلمى أردوغان', position: 'مستشار أول' },
      ],
    },
  ];
  const fields = extractTranslatableCmsFields('committees', canonical);
  const paths = fields.map((f) => f.path);
  assert.ok(!paths.includes('0.head.name'));
  assert.ok(!paths.includes('0.members.0.name'));
  assert.ok(paths.includes('0.head.bio'));
  assert.ok(paths.includes('0.members.0.position'));
});

test('18. summary totals equal field detail totals', () => {
  const canonicalMap = {
    events: [
      { id: 'e1', title: 'فعالية 1', description: 'وصف 1' },
    ],
    news: [
      { id: 'n1', title: 'خبر 1', description: 'وصف 1' },
    ],
  };

  const summary = computeOverallMonitoringSummary({
    canonicalMap,
    records: [],
    targets: ['events', 'news'],
  });

  const totalSum = summary.fresh + summary.missing + summary.stale + summary.draft;
  assert.equal(totalSum, summary.totalSlots);
  assert.equal(summary.totalSlots, summary.totalFields * 2);
  assert.equal(summary.missing, summary.totalSlots); // All missing since records is empty
});

test('19. percentages are correct', () => {
  const stats = calculateLocaleStats([
    { status: 'fresh' },
    { status: 'fresh' },
    { status: 'missing' },
    { status: 'stale' },
  ]);

  assert.equal(stats.totalFields, 4);
  assert.equal(stats.fresh, 2);
  assert.equal(stats.freshPercentage, 50);
  assert.equal(stats.missing, 1);
  assert.equal(stats.stale, 1);
});

test('20. zero translatable fields does not divide by zero', () => {
  const stats = calculateLocaleStats([]);
  assert.equal(stats.totalFields, 0);
  assert.equal(stats.freshPercentage, 100);
  assert.ok(!Number.isNaN(stats.freshPercentage));

  const summary = computeOverallMonitoringSummary({
    canonicalMap: {},
    records: [],
    targets: [],
  });

  assert.equal(summary.totalFields, 0);
  assert.equal(summary.totalSlots, 0);
  assert.equal(summary.freshPercentage, 100);
  assert.equal(summary.missingPercentage, 0);
  assert.ok(!Number.isNaN(summary.freshPercentage));
});
