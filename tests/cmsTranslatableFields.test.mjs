import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  isCmsPathTranslatable,
  getTranslatableCmsPaths,
  extractTranslatableCmsFields,
  CMS_TRANSLATABLE_SCHEMA,
  EXCLUDED_FIELD_CATEGORIES,
} from '../src/domain/cmsTranslatableFields.ts';

test('1. Unknown target or unknown path is never translatable (fail-closed)', () => {
  assert.equal(isCmsPathTranslatable('unknown_target', 'title'), false);
  assert.equal(isCmsPathTranslatable('site', 'unknown_field'), false);
  assert.equal(isCmsPathTranslatable('events', 'arbitrary.random.path'), false);
  assert.equal(isCmsPathTranslatable('', 'title'), false);
  assert.equal(isCmsPathTranslatable('events', ''), false);
});

test('2. Unknown field inside known target is not translatable', () => {
  assert.equal(isCmsPathTranslatable('about', 'header.secretApiKey'), false);
  assert.equal(isCmsPathTranslatable('news', 'metadata.trackingPixel'), false);
  assert.equal(isCmsPathTranslatable('committees', 'extraField'), false);
});

test('3. Extraction returns only allowlisted string paths', () => {
  const payload = {
    badge: 'برامجنا',
    title: 'أنشطة الاتحاد',
    description: 'تفاصيل البرامج',
    extraUnallowed: 'هذا الحقل غير مسموح',
  };

  const fields = extractTranslatableCmsFields('programsContent', payload);
  const extractedPaths = fields.map((f) => f.path);

  assert.deepEqual(extractedPaths.sort(), ['badge', 'description', 'title']);
  assert.equal(extractedPaths.includes('extraUnallowed'), false);
});

test('4. Extraction skips empty strings', () => {
  const payload = {
    badge: '',
    title: 'عنوان الفعالية',
    description: '',
  };

  const fields = extractTranslatableCmsFields('programsContent', payload);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].path, 'title');
  assert.equal(fields[0].value, 'عنوان الفعالية');
});

test('5. Extraction skips whitespace-only strings', () => {
  const payload = {
    badge: '   ',
    title: '  \t  \n  ',
    description: 'وصف صالح',
  };

  const fields = extractTranslatableCmsFields('programsContent', payload);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].path, 'description');
});

test('6. Extraction skips numbers', () => {
  const payload = {
    hero: {
      badge1: { value: 1234, label: 'أعضاء الاتحاد' },
    },
    stats: [
      { label: 'عدد الفعاليات', value: 86 },
    ],
  };

  const fields = extractTranslatableCmsFields('site', payload);
  const values = fields.map((f) => f.value);

  assert.ok(values.includes('أعضاء الاتحاد'));
  assert.ok(values.includes('عدد الفعاليات'));
  assert.equal(values.some((v) => typeof v === 'number' || v === '1234' || v === '86'), false);
});

test('7. Extraction skips booleans', () => {
  const payload = {
    title: 'خبر مهم',
    excerpt: 'ملخص الخبر',
    pinnedOnHomepage: true,
  };

  const fields = extractTranslatableCmsFields('news', payload);
  assert.equal(fields.some((f) => typeof f.value === 'boolean'), false);
});

test('8. Extraction skips null and undefined', () => {
  const payload = {
    badge: null,
    title: 'عنوان صالح',
    description: undefined,
  };

  const fields = extractTranslatableCmsFields('programsContent', payload);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].path, 'title');
});

test('9. Technical fields (IDs, UUIDs, dates, status, counts) are excluded', () => {
  assert.equal(isCmsPathTranslatable('events', 'id'), false);
  assert.equal(isCmsPathTranslatable('events', '0.id'), false);
  assert.equal(isCmsPathTranslatable('events', 'uuid'), false);
  assert.equal(isCmsPathTranslatable('events', 'date'), false);
  assert.equal(isCmsPathTranslatable('events', '0.date'), false);
  assert.equal(isCmsPathTranslatable('events', 'capacity'), false);
  assert.equal(isCmsPathTranslatable('events', 'registered'), false);
  assert.equal(isCmsPathTranslatable('events', 'status'), false);
});

test('10. Technical URLs (web, image, file, map, social) are excluded', () => {
  assert.equal(isCmsPathTranslatable('events', 'image'), false);
  assert.equal(isCmsPathTranslatable('events', 'eventUrl'), false);
  assert.equal(isCmsPathTranslatable('news', 'image'), false);
  assert.equal(isCmsPathTranslatable('news', 'externalUrl'), false);
  assert.equal(isCmsPathTranslatable('contactMap', 'embedUrl'), false);
  assert.equal(isCmsPathTranslatable('contactMap', 'openUrl'), false);
  assert.equal(isCmsPathTranslatable('site', 'footer.social.facebook'), false);
  assert.equal(isCmsPathTranslatable('site', 'hero.image'), false);
  assert.equal(isCmsPathTranslatable('reports', 'fileUrl'), false);
});

test('11. Emails and phone numbers are excluded', () => {
  assert.equal(isCmsPathTranslatable('site', 'footer.email'), false);
  assert.equal(isCmsPathTranslatable('site', 'footer.phone'), false);
  assert.equal(isCmsPathTranslatable('contactCards', 'value'), false);
  assert.equal(isCmsPathTranslatable('contactCards', '0.value'), false);
  assert.equal(isCmsPathTranslatable('committees', 'head.email'), false);
  assert.equal(isCmsPathTranslatable('committees', 'head.phone'), false);
  assert.equal(isCmsPathTranslatable('committees', 'members.0.phone'), false);
});

test('12. Person and member names are strictly excluded', () => {
  assert.equal(isCmsPathTranslatable('committees', 'head.name'), false);
  assert.equal(isCmsPathTranslatable('committees', '0.head.name'), false);
  assert.equal(isCmsPathTranslatable('committees', 'members.0.name'), false);
  assert.equal(isCmsPathTranslatable('committees', '0.members.0.name'), false);
  assert.equal(isCmsPathTranslatable('plans', 'owner'), false);
  assert.equal(isCmsPathTranslatable('plans', '0.owner'), false);
});

test('13. Committee fixed role values and committee IDs are excluded', () => {
  assert.equal(isCmsPathTranslatable('committees', 'id'), false);
  assert.equal(isCmsPathTranslatable('committees', '0.id'), false);
  assert.equal(isCmsPathTranslatable('committees', 'name'), false);
  assert.equal(isCmsPathTranslatable('committees', 'shortName'), false);
  assert.equal(isCmsPathTranslatable('committees', 'head.role'), false);
  assert.equal(isCmsPathTranslatable('committees', '0.head.role'), false);
});

test('14. Ordinary editable committee member position/responsibility is translatable', () => {
  assert.equal(isCmsPathTranslatable('committees', 'members.0.position'), true);
  assert.equal(isCmsPathTranslatable('committees', '0.members.0.position'), true);
  assert.equal(isCmsPathTranslatable('committees', 'members.1.position'), true);
});

test('15. Committee editorial fields (description, vision, goals, responsibilities, head bio) are included', () => {
  assert.equal(isCmsPathTranslatable('committees', 'description'), true);
  assert.equal(isCmsPathTranslatable('committees', '0.description'), true);
  assert.equal(isCmsPathTranslatable('committees', 'responsibilities.0'), true);
  assert.equal(isCmsPathTranslatable('committees', '0.responsibilities.1'), true);
  assert.equal(isCmsPathTranslatable('committees', 'vision'), true);
  assert.equal(isCmsPathTranslatable('committees', 'goals'), true);
  assert.equal(isCmsPathTranslatable('committees', 'head.bio'), true);
  assert.equal(isCmsPathTranslatable('committees', '0.head.bio'), true);
  assert.equal(isCmsPathTranslatable('committees', 'stats.0.label'), true);
});

test('16. Event editorial content included, system category enum excluded', () => {
  assert.equal(isCmsPathTranslatable('events', 'title'), true);
  assert.equal(isCmsPathTranslatable('events', '0.title'), true);
  assert.equal(isCmsPathTranslatable('events', 'description'), true);
  assert.equal(isCmsPathTranslatable('events', '0.description'), true);
  assert.equal(isCmsPathTranslatable('events', 'location'), true);
  assert.equal(isCmsPathTranslatable('events', '0.location'), true);

  // Category enum handled by eventCategoryPresentation, NOT translated via CMS
  assert.equal(isCmsPathTranslatable('events', 'category'), false);
  assert.equal(isCmsPathTranslatable('events', '0.category'), false);
});

test('17. News editorial fields included, technical metadata excluded', () => {
  assert.equal(isCmsPathTranslatable('news', 'title'), true);
  assert.equal(isCmsPathTranslatable('news', '0.title'), true);
  assert.equal(isCmsPathTranslatable('news', 'excerpt'), true);
  assert.equal(isCmsPathTranslatable('news', '0.excerpt'), true);
  assert.equal(isCmsPathTranslatable('news', 'fullContent'), true);
  assert.equal(isCmsPathTranslatable('news', '0.fullContent'), true);

  assert.equal(isCmsPathTranslatable('news', 'image'), false);
  assert.equal(isCmsPathTranslatable('news', 'externalUrl'), false);
  assert.equal(isCmsPathTranslatable('news', 'date'), false);
  assert.equal(isCmsPathTranslatable('news', 'category'), true);
  assert.equal(isCmsPathTranslatable('news', '0.category'), true);
});

test('18. FAQ question/answer included, technical category fields excluded', () => {
  assert.equal(isCmsPathTranslatable('faqCategories', 'title'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', '0.title'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', 'items.0.question'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', '0.items.0.question'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', 'items.0.answer'), true);
  assert.equal(isCmsPathTranslatable('faqCategories', '0.items.0.answer'), true);

  assert.equal(isCmsPathTranslatable('faqCategories', 'icon'), false);
  assert.equal(isCmsPathTranslatable('faqCategories', 'color'), false);
  assert.equal(isCmsPathTranslatable('faqCategories', 'bg'), false);
});

test('19. Student Guide editorial content included, technical styles/contacts excluded', () => {
  assert.equal(isCmsPathTranslatable('guideSections', 'label'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'title'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'intro'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'items.0.heading'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'items.0.body'), true);
  assert.equal(isCmsPathTranslatable('guideSections', 'items.0.tips.0'), true);

  assert.equal(isCmsPathTranslatable('guideSections', 'icon'), false);
  assert.equal(isCmsPathTranslatable('guideSections', 'color'), false);
  assert.equal(isCmsPathTranslatable('guideSections', 'bg'), false);
  assert.equal(isCmsPathTranslatable('guideSections', 'contacts.0.value'), false);
});

test('20. Gallery album editorial text included, media URLs excluded', () => {
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'title'), true);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'description'), true);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'location'), true);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'media.0.caption'), true);

  assert.equal(isCmsPathTranslatable('galleryAlbums', 'coverImage'), false);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'media.0.url'), false);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'media.0.thumbnail'), false);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'media.0.type'), false);
  assert.equal(isCmsPathTranslatable('galleryAlbums', 'photoCount'), false);
});

test('21. Contact cards editorial label/sub included, values (phone/email) excluded', () => {
  assert.equal(isCmsPathTranslatable('contactCards', 'title'), true);
  assert.equal(isCmsPathTranslatable('contactCards', '0.title'), true);
  assert.equal(isCmsPathTranslatable('contactCards', 'sub'), true);
  assert.equal(isCmsPathTranslatable('contactCards', '0.sub'), true);

  assert.equal(isCmsPathTranslatable('contactCards', 'value'), false);
  assert.equal(isCmsPathTranslatable('contactCards', '0.value'), false);
});

test('22. Plans and Reports: title, summary, description, and free-form period included; select type and quarter excluded', () => {
  assert.equal(isCmsPathTranslatable('plans', 'title'), true);
  assert.equal(isCmsPathTranslatable('plans', '0.title'), true);
  assert.equal(isCmsPathTranslatable('plans', 'description'), true);
  assert.equal(isCmsPathTranslatable('plans', '0.description'), true);

  // quarter is a fixed select dropdown (system option enum), NOT generic CMS text
  assert.equal(isCmsPathTranslatable('plans', 'quarter'), false);
  assert.equal(isCmsPathTranslatable('plans', '0.quarter'), false);

  assert.equal(isCmsPathTranslatable('plans', 'status'), false);
  assert.equal(isCmsPathTranslatable('plans', 'committee'), false);
  assert.equal(isCmsPathTranslatable('plans', 'authorRole'), false);

  assert.equal(isCmsPathTranslatable('reports', 'title'), true);
  assert.equal(isCmsPathTranslatable('reports', '0.title'), true);
  assert.equal(isCmsPathTranslatable('reports', 'summary'), true);
  assert.equal(isCmsPathTranslatable('reports', '0.summary'), true);

  // period is free-form editable text and translatable
  assert.equal(isCmsPathTranslatable('reports', 'period'), true);
  assert.equal(isCmsPathTranslatable('reports', '0.period'), true);

  // type is a fixed select value (system option enum), NOT generic CMS text
  assert.equal(isCmsPathTranslatable('reports', 'type'), false);
  assert.equal(isCmsPathTranslatable('reports', '0.type'), false);

  // Technical metadata excluded
  assert.equal(isCmsPathTranslatable('reports', 'date'), false);
  assert.equal(isCmsPathTranslatable('reports', '0.date'), false);
  assert.equal(isCmsPathTranslatable('reports', 'fileUrl'), false);
  assert.equal(isCmsPathTranslatable('reports', 'isGeneral'), false);
});

test('23. Reports extraction includes custom free-form period, title, summary, but excludes type and date', () => {
  const reportPayload = [
    {
      id: 'r10',
      title: 'تقرير إنجازات الربع الأول',
      period: 'الفترة من يناير إلى مارس',
      type: 'تقرير ربع سنوي',
      date: '2026-04-01',
      summary: 'ملخص شامل للأنشطة والفعاليات المنفذة خلال الربع الأول.',
      fileUrl: 'https://example.com/report.pdf',
      isGeneral: true,
    },
  ];

  const fields = extractTranslatableCmsFields('reports', reportPayload);
  const paths = fields.map((f) => f.path);
  const values = fields.map((f) => f.value);

  // Free-form editorial text extracted
  assert.ok(paths.includes('0.title'));
  assert.ok(paths.includes('0.summary'));
  assert.ok(paths.includes('0.period'));
  assert.ok(values.includes('الفترة من يناير إلى مارس'));
  assert.ok(values.includes('تقرير إنجازات الربع الأول'));

  // Fixed system type, date, IDs, and URLs excluded
  assert.equal(paths.includes('0.type'), false);
  assert.equal(paths.includes('0.date'), false);
  assert.equal(paths.includes('0.fileUrl'), false);
  assert.equal(values.includes('تقرير ربع سنوي'), false, 'Fixed type select value must be excluded');
  assert.equal(values.includes('2026-04-01'), false, 'Date must be excluded');
});

test('24. Brand names (brand.name, brand.nameTr) are explicitly excluded from generic extraction', () => {
  assert.equal(isCmsPathTranslatable('site', 'brand.name'), false);
  assert.equal(isCmsPathTranslatable('site', 'brand.nameTr'), false);
  assert.equal(isCmsPathTranslatable('site', 'brand.logoIcon'), false);
});

test('25. Real-world shaped payload extraction test (About page)', () => {
  const aboutPayload = {
    header: {
      badge: 'عن الاتحاد',
      title: 'اتحاد طلاب أمة واحدة',
      description: 'منظمة شبابية تجمع الطلاب المسلمين.',
    },
    story: {
      badge: 'قصتنا',
      title: 'البداية والتأسيس',
      paragraphs: [
        'تأسس الاتحاد في عام 2024 ليكون مظلة شبابية جامعة.',
        'نهدف إلى تعزيز التواصل والتعاون الثقافي والأكاديمي.',
      ],
      images: [
        'https://example.com/story1.jpg',
        'https://example.com/story2.jpg',
      ],
    },
    mission: {
      badge: 'رسالتنا',
      title: 'بناء جيل قائد',
      cards: [
        { icon: 'Target', title: 'الريادة', text: 'تمكين الشباب من القيادة.' },
      ],
    },
    cta: {
      icon: 'Heart',
      title: 'انضم إلينا اليوم',
      description: 'كن جزءاً من رحلتنا في خدمة الأمة.',
      buttonText: 'سجل الآن',
    },
  };

  const fields = extractTranslatableCmsFields('about', aboutPayload);
  const paths = fields.map((f) => f.path);

  assert.ok(paths.includes('header.badge'));
  assert.ok(paths.includes('header.title'));
  assert.ok(paths.includes('header.description'));
  assert.ok(paths.includes('story.paragraphs.0'));
  assert.ok(paths.includes('story.paragraphs.1'));
  assert.ok(paths.includes('mission.cards.0.title'));
  assert.ok(paths.includes('mission.cards.0.text'));
  assert.ok(paths.includes('cta.buttonText'));

  // Ensure images and icon keys are strictly excluded
  assert.equal(paths.some((p) => p.includes('images')), false);
  assert.equal(paths.some((p) => p.includes('icon')), false);
});

test('26. Real-world shaped payload extraction test (Committees: ordinary position extracted, fixed role excluded)', () => {
  const committeePayload = [
    {
      id: 'academic',
      name: 'اللجنة الأكاديمية',
      shortName: 'الأكاديمية',
      icon: 'GraduationCap',
      description: 'تهتم اللجنة بالشأن العلمي للطلاب وتنظيم الدورات.',
      responsibilities: [
        'تنظيم الدورات التدريبية وورش العمل',
        'عقد الندوات والمحاضرات',
      ],
      head: {
        id: 'b1',
        name: 'د. عبد الله قوني',
        role: 'رئيس الاتحاد',
        bio: 'أكاديمي وقائد شبابي يحمل دكتوراه في العلوم السياسية.',
        photo: 'https://example.com/photo.jpg',
        email: 'head@example.com',
        phone: '05312345678',
      },
      members: [
        { id: 'm1', name: 'م. سلمى أردوغان', position: 'مستشار أول', photo: 'https://example.com/m1.jpg' },
        { id: 'm2', name: 'خالد أرسلان', position: 'محاسب', photo: 'https://example.com/m2.jpg' },
      ],
      stats: [
        { label: 'دورات منجزة', value: '14' },
      ],
    },
  ];

  const fields = extractTranslatableCmsFields('committees', committeePayload);
  const paths = fields.map((f) => f.path);
  const values = fields.map((f) => f.value);

  // Editorial content extracted
  assert.ok(paths.includes('0.description'));
  assert.ok(paths.includes('0.responsibilities.0'));
  assert.ok(paths.includes('0.responsibilities.1'));
  assert.ok(paths.includes('0.head.bio'));
  assert.ok(paths.includes('0.stats.0.label'));

  // Ordinary member positions ARE extracted
  assert.ok(paths.includes('0.members.0.position'));
  assert.ok(paths.includes('0.members.1.position'));
  assert.ok(values.includes('مستشار أول'));
  assert.ok(values.includes('محاسب'));

  // Identity and system values NOT extracted
  assert.equal(values.includes('د. عبد الله قوني'), false, 'Head name must not be extracted');
  assert.equal(values.includes('م. سلمى أردوغان'), false, 'Member name must not be extracted');
  assert.equal(values.includes('خالد أرسلان'), false, 'Member name must not be extracted');
  assert.equal(values.includes('رئيس الاتحاد'), false, 'Fixed head role must not be extracted');
  assert.equal(values.includes('academic'), false, 'Committee ID must not be extracted');
  assert.equal(values.includes('head@example.com'), false, 'Email must not be extracted');
  assert.equal(values.includes('05312345678'), false, 'Phone must not be extracted');
});

test('27. Source payload is never mutated during extraction', () => {
  const original = {
    title: 'عنوان أصلي',
    description: 'وصف أصلي',
    nested: {
      tags: ['أ', 'ب'],
    },
  };

  const frozenClone = JSON.parse(JSON.stringify(original));
  extractTranslatableCmsFields('news', original);
  getTranslatableCmsPaths('news', original);

  assert.deepEqual(original, frozenClone);
});

test('28. Domain module contains no Supabase, React, or UI dependencies', () => {
  const code = fs.readFileSync(
    path.join(process.cwd(), 'src/domain/cmsTranslatableFields.ts'),
    'utf-8'
  );

  assert.doesNotMatch(code, /from ['"]@supabase/);
  assert.doesNotMatch(code, /from ['"]react/);
  assert.doesNotMatch(code, /from ['"]\.\.\/components/);
  assert.doesNotMatch(code, /from ['"]\.\.\/pages/);
});

test('29. Schema coverage report exposes all CmsTarget configurations and excluded categories', () => {
  assert.ok(CMS_TRANSLATABLE_SCHEMA.site);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.about);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.programsContent);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.events);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.galleryAlbums);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.galleryCategories);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.contactCards);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.contactMap);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.news);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.plans);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.reports);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.committees);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.guideSections);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.guideQuickInfo);
  assert.ok(CMS_TRANSLATABLE_SCHEMA.faqCategories);

  assert.ok(Array.isArray(EXCLUDED_FIELD_CATEGORIES));
  assert.ok(EXCLUDED_FIELD_CATEGORIES.includes('person_names'));
  assert.ok(EXCLUDED_FIELD_CATEGORIES.includes('urls_and_media'));
  assert.ok(EXCLUDED_FIELD_CATEGORIES.includes('system_roles_and_enums'));
});
