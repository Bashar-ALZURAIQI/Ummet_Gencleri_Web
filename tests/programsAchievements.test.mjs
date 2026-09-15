import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_PROGRAMS_ACHIEVEMENTS,
  interpolateProgramsAchievementsText,
  normalizeProgramsAchievements,
  withProgramsAchievements,
} from '../src/domain/programsAchievements.ts';
import { isCmsPathTranslatable } from '../src/domain/cmsTranslatableFields.ts';
import { overlayLocalizedCmsPayload } from '../src/domain/cmsPublicRead.ts';
import { publishCmsEntityLocales } from '../src/domain/cmsLocalizationEditor.ts';
import { InMemoryCmsLocalizationRepository } from '../src/domain/cmsLocalizationRepository.ts';
import { DEFAULT_PROGRAMS_CONTENT } from '../src/data/mockData.ts';
import ar from '../src/i18n/locales/ar.ts';
import tr from '../src/i18n/locales/tr.ts';
import en from '../src/i18n/locales/en.ts';

const SYNC_STAT_KEYS = ['achievementsStatEvents', 'achievementsStatStudents', 'achievementsStatUniversities'];

// ---------------------------------------------------------------------------
// 1. Safe defaults — legacy stored content must never render blank
// ---------------------------------------------------------------------------

test('1. DEFAULT_PROGRAMS_CONTENT carries the full manual achievements block', () => {
  assert.equal(DEFAULT_PROGRAMS_CONTENT.achievements.eventsCount, 86);
  assert.equal(DEFAULT_PROGRAMS_CONTENT.achievements.studentsCount, 1200);
  assert.equal(DEFAULT_PROGRAMS_CONTENT.achievements.universitiesCount, 24);
  assert.match(DEFAULT_PROGRAMS_CONTENT.achievements.text, /\{events\}/);
  assert.match(DEFAULT_PROGRAMS_CONTENT.achievements.text, /\{students\}/);
  assert.match(DEFAULT_PROGRAMS_CONTENT.achievements.text, /\{universities\}/);
});

test('2. legacy content without achievements is normalized with defaults, preserving header fields', () => {
  const legacy = { badge: 'أنشطتنا', title: 'البرامج والأنشطة', description: 'وصف قديم' };
  const normalized = withProgramsAchievements(legacy);
  assert.equal(normalized.badge, legacy.badge);
  assert.equal(normalized.title, legacy.title);
  assert.equal(normalized.description, legacy.description);
  const ach = normalized.achievements;
  assert.equal(ach.eventsCount, DEFAULT_PROGRAMS_ACHIEVEMENTS.eventsCount);
  assert.equal(ach.studentsCount, DEFAULT_PROGRAMS_ACHIEVEMENTS.studentsCount);
  assert.equal(ach.universitiesCount, DEFAULT_PROGRAMS_ACHIEVEMENTS.universitiesCount);
  assert.equal(ach.title, DEFAULT_PROGRAMS_ACHIEVEMENTS.title);
  assert.equal(ach.text, DEFAULT_PROGRAMS_ACHIEVEMENTS.text);
});

test('3. empty object and partial achievements fall back per-field', () => {
  const normalized = normalizeProgramsAchievements({});
  assert.equal(normalized.eventsCount, 86);
  assert.equal(normalized.title, DEFAULT_PROGRAMS_ACHIEVEMENTS.title);

  const partial = normalizeProgramsAchievements({ title: '', eventsCount: 120, studentsCount: 0, universitiesCount: 31 });
  assert.equal(partial.title, DEFAULT_PROGRAMS_ACHIEVEMENTS.title, 'blank title keeps the safe fallback');
  assert.equal(partial.eventsCount, 120);
  assert.equal(partial.studentsCount, 0, 'explicit zero is a valid manual edit');
  assert.equal(partial.universitiesCount, 31);
});

test('4. missing null/NaN counts fall back instead of becoming 0', () => {
  const normalized = normalizeProgramsAchievements({ eventsCount: null, studentsCount: Number.NaN, universitiesCount: undefined });
  assert.equal(normalized.eventsCount, 86);
  assert.equal(normalized.studentsCount, 1200);
  assert.equal(normalized.universitiesCount, 24);
});

// ---------------------------------------------------------------------------
// 2. Placeholder interpolation keeps manual numbers; TR order may differ
// ---------------------------------------------------------------------------

test('5. interpolation replaces every placeholder with the editor-provided count', () => {
  const text = 'نظّمنا {events} فعالية لـ{students} طالب من {universities} جامعة';
  const out = interpolateProgramsAchievementsText(text, { eventsCount: 120, studentsCount: 1400, universitiesCount: 31 });
  assert.equal(out, 'نظّمنا 120 فعالية لـ1400 طالب من 31 جامعة');
});

test('6. Turkish sentence order works through placeholders without duplicating numbers', () => {
  const trText = '{universities} üniversiteden {students} öğrenciye ulaşan {events} etkinlik düzenledik.';
  const out = interpolateProgramsAchievementsText(trText, { eventsCount: 86, studentsCount: 1200, universitiesCount: 24 });
  assert.equal(out, '24 üniversiteden 1200 öğrenciye ulaşan 86 etkinlik düzenledik.');
});

test('7. text without placeholders is returned unchanged', () => {
  const plain = 'لا شيء هنا';
  assert.equal(interpolateProgramsAchievementsText(plain, { eventsCount: 1, studentsCount: 2, universitiesCount: 3 }), plain);
});

// ---------------------------------------------------------------------------
// 3. Manual counts are the only source — never derived from events again
// ---------------------------------------------------------------------------

test('8. ProgramsPage no longer derives achievements from the events list', async () => {
  const source = await readFile(new URL('../src/pages/ProgramsPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /achievements\s*=\s*useMemo/, 'the event-derived achievements memo must be gone');
  assert.doesNotMatch(source, /totalRegistrations/, 'no derived registration total may survive');
  assert.doesNotMatch(source, /totalCapacity/, 'no derived capacity total may survive');
  assert.doesNotMatch(source, /for\s*\(.*registered/, 'the banner must not be computed from e.registered');
  assert.match(source, /interpolateProgramsAchievementsText/, 'the banner renders only through placeholder interpolation');
});

test('9. counts editing is independent — changing one never touches the others', () => {
  const base = normalizeProgramsAchievements({});
  const editedEvents = normalizeProgramsAchievements({ ...base, eventsCount: 95 });
  assert.equal(editedEvents.eventsCount, 95);
  assert.equal(editedEvents.studentsCount, base.studentsCount);
  assert.equal(editedEvents.universitiesCount, base.universitiesCount);

  const editedUniversities = normalizeProgramsAchievements({ ...editedEvents, universitiesCount: 40 });
  assert.equal(editedUniversities.eventsCount, 95);
  assert.equal(editedUniversities.universitiesCount, 40);
  assert.equal(editedUniversities.studentsCount, base.studentsCount);
});

// ---------------------------------------------------------------------------
// 4. Localization: only title/text are translatable; numbers stay canonical
// ---------------------------------------------------------------------------

test('10. achievements title/text are translatable; counts are never translatable', () => {
  assert.equal(isCmsPathTranslatable('programsContent', 'achievements.title'), true);
  assert.equal(isCmsPathTranslatable('programsContent', 'achievements.text'), true);
  assert.equal(isCmsPathTranslatable('programsContent', 'eventsCount'), false);
  assert.equal(isCmsPathTranslatable('programsContent', 'achievements.eventsCount'), false);
  assert.equal(isCmsPathTranslatable('programsContent', 'achievements.studentsCount'), false);
  assert.equal(isCmsPathTranslatable('programsContent', 'achievements.universitiesCount'), false);
});

test('11. manual counts persist through save + refresh, and localization only overlays text fields', async () => {
  const repo = new InMemoryCmsLocalizationRepository();

  const legacy = { badge: 'أنشطتنا', title: 'البرامج والأنشطة', description: 'وصف', achievements: undefined };
  const normalized = withProgramsAchievements(legacy);
  const edited = {
    ...normalized,
    achievements: {
      ...normalized.achievements,
      title: 'إنجازاتنا الكبرى',
      text: 'وصلنا إلى {events} فعالية وأكثر من {students} طالب من {universities} جامعة.',
      eventsCount: 120,
      studentsCount: 1400,
      universitiesCount: 31,
    },
  };

  await publishCmsEntityLocales({
    repository: repo,
    target: 'programsContent',
    canonicalPayload: edited,
    recordId: 'header',
    translations: {
      tr: {
        'achievements.title': 'Büyük Başarılarımız',
        'achievements.text': '{universities} üniversiteden {students} öğrenciye ulaşan {events} etkinlik düzenledik.',
      },
      en: {
        'achievements.title': 'Our Milestones',
        'achievements.text': 'We organized {events} events reaching {students} students from {universities} universities.',
      },
    },
  });

  const [relatedTr, relatedEn] = await Promise.all([
    repo.getPublished('programsContent', 'tr'),
    repo.getPublished('programsContent', 'en'),
  ]);

  const overlaidTr = overlayLocalizedCmsPayload(edited, relatedTr.payload, 'programsContent');
  assert.equal(overlaidTr.achievements.title, 'Büyük Başarılarımız');
  assert.equal(
    interpolateProgramsAchievementsText(overlaidTr.achievements.text, overlaidTr.achievements),
    '31 üniversiteden 1400 öğrenciye ulaşan 120 etkinlik düzenledik.',
  );
  assert.equal(overlaidTr.achievements.eventsCount, 120, 'localization must never touch the numbers');
  assert.equal(overlaidTr.achievements.studentsCount, 1400);
  assert.equal(overlaidTr.achievements.universitiesCount, 31);

  const overlaidEn = overlayLocalizedCmsPayload(edited, relatedEn.payload, 'programsContent');
  assert.equal(overlaidEn.achievements.title, 'Our Milestones');
  assert.equal(
    interpolateProgramsAchievementsText(overlaidEn.achievements.text, overlaidEn.achievements),
    'We organized 120 events reaching 1400 students from 31 universities.',
  );
});

test('12. reload without locale overrides serves the canonical edited values (persistence of manual edits)', () => {
  const reloaded = {
    badge: 'أنشطتنا',
    title: 'البرامج والأنشطة',
    description: 'وصف',
    achievements: { title: 'إنجازاتنا الكبرى', text: 'وصلنا لـ{events} فعالية', eventsCount: 120, studentsCount: 1400, universitiesCount: 31 },
  };
  const overlay = overlayLocalizedCmsPayload(reloaded, null, 'programsContent');
  assert.equal(overlay.achievements.eventsCount, 120);
  assert.equal(overlay.achievements.title, 'إنجازاتنا الكبرى');
});

// ---------------------------------------------------------------------------
// 5. i18n: the achievements stat labels are in sync across all locales
// ---------------------------------------------------------------------------

test('13. programs achievements stat keys exist identically in ar, tr, en', () => {
  for (const key of SYNC_STAT_KEYS) {
    assert.equal(typeof ar.programs[key], 'string', `ar missing ${key}`);
    assert.equal(typeof tr.programs[key], 'string', `tr missing ${key}`);
    assert.equal(typeof en.programs[key], 'string', `en missing ${key}`);
  }
  const staleKeys = ['achievementsTitle', 'achievementsText', 'achievementsStatRegistrations', 'achievementsStatCapacity'];
  for (const stale of staleKeys) {
    assert.equal(stale in ar.programs, false, `ar must not keep stale key ${stale}`);
    assert.equal(stale in tr.programs, false, `tr must not keep stale key ${stale}`);
    assert.equal(stale in en.programs, false, `en must not keep stale key ${stale}`);
  }
  assert.equal(ar.programs.achievementsStatEvents, 'عدد الفعاليات');
  assert.equal(tr.programs.achievementsStatEvents, 'Toplam Etkinlik');
  assert.equal(en.programs.achievementsStatEvents, 'Total Events');
});

// ---------------------------------------------------------------------------
// 6. AppContext normalizes legacy programs content when it enters the state
// ---------------------------------------------------------------------------

test('14. AppContext normalizes programsContent at every entry point', async () => {
  const source = await readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8');
  const uses = (source.match(/withProgramsAchievements\(/g) ?? []).length;
  assert.ok(uses >= 3, `expected >=3 normalization entry points, found ${uses}`);
  assert.match(source, /withProgramsAchievements\(bundle\?\.programsContent/, 'local-storage bundle init is normalized');
  assert.match(source, /withProgramsAchievements\(bundle\.programsContent\)/, 'published bundle apply is normalized');
  assert.match(source, /withProgramsAchievements\(value as ProgramsContent\)/, 'approved value apply is normalized');
});