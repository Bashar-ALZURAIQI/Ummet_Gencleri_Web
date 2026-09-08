import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventCategoryLabel } from '../src/domain/eventCategoryPresentation.ts';
import { formatEnrollmentCount } from '../src/domain/internalEconomyInteraction.ts';

// Mock translation function for testing
function createMockTranslator(locale) {
  const dictionary = {
    tr: {
      'events.categories.workshop': 'Atölye Çalışması',
      'events.categories.lecture': 'Seminer & Konferans',
      'events.categories.volunteer': 'Gönüllülük Faaliyeti',
      'events.categories.training': 'Eğitim Programı',
      'events.categories.trip': 'Gezi & Ziyaret',
      'events.categories.entertainment': 'Sosyal & Eğlence',
      'events.categories.visit': 'Kurumsal Ziyaret',
      'events.enrolledCount': '{{count}} kayıtlı',
      'events.enrolledCapacity': '{{count}} / {{capacity}} kayıtlı',
    },
    en: {
      'events.categories.workshop': 'Workshop',
      'events.categories.lecture': 'Lecture',
      'events.categories.volunteer': 'Volunteer Work',
      'events.categories.training': 'Training',
      'events.categories.trip': 'Trip',
      'events.categories.entertainment': 'Entertainment',
      'events.categories.visit': 'Visit',
      'events.enrolledCount': '{{count}} registered',
      'events.enrolledCapacity': '{{count}} / {{capacity}} registered',
    },
    ar: {
      'events.categories.workshop': 'ورشة عمل',
      'events.categories.lecture': 'محاضرة',
      'events.categories.volunteer': 'عمل تطوعي',
      'events.categories.training': 'تدريب',
      'events.categories.trip': 'رحلة',
      'events.categories.entertainment': 'ترفيهي',
      'events.categories.visit': 'زيارات',
      'events.enrolledCount': '{{count}} مسجل',
      'events.enrolledCapacity': '{{count}} / {{capacity}} مسجل',
    },
  };

  return (key, optionsOrDefault) => {
    const locDict = dictionary[locale] || dictionary.ar;
    let template = locDict[key];
    if (!template) {
      return typeof optionsOrDefault === 'string' ? optionsOrDefault : key;
    }
    if (typeof optionsOrDefault === 'object' && optionsOrDefault !== null) {
      for (const [k, v] of Object.entries(optionsOrDefault)) {
        template = template.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
      }
    }
    return template;
  };
}

test('1. getEventCategoryLabel translates canonical enum keys into active locale', () => {
  const tTr = createMockTranslator('tr');
  const tEn = createMockTranslator('en');
  const tAr = createMockTranslator('ar');

  assert.equal(getEventCategoryLabel('workshop', tTr), 'Atölye Çalışması');
  assert.equal(getEventCategoryLabel('workshop', tEn), 'Workshop');
  assert.equal(getEventCategoryLabel('workshop', tAr), 'ورشة عمل');

  assert.equal(getEventCategoryLabel('trip', tTr), 'Gezi & Ziyaret');
  assert.equal(getEventCategoryLabel('trip', tEn), 'Trip');
  assert.equal(getEventCategoryLabel('trip', tAr), 'رحلة');
});

test('2. getEventCategoryLabel translates canonical Arabic category strings', () => {
  const tTr = createMockTranslator('tr');
  const tEn = createMockTranslator('en');

  assert.equal(getEventCategoryLabel('ورشة عمل', tTr), 'Atölye Çalışması');
  assert.equal(getEventCategoryLabel('ورشة عمل', tEn), 'Workshop');
  assert.equal(getEventCategoryLabel('محاضرة', tTr), 'Seminer & Konferans');
  assert.equal(getEventCategoryLabel('محاضرة', tEn), 'Lecture');
});

test('3. getEventCategoryLabel preserves unknown custom categories without error', () => {
  const tTr = createMockTranslator('tr');
  assert.equal(getEventCategoryLabel('SpecialHackathon', tTr), 'SpecialHackathon');
  assert.equal(getEventCategoryLabel('', tTr), '');
  assert.equal(getEventCategoryLabel(null, tTr), '');
  assert.equal(getEventCategoryLabel(undefined, tTr), '');
});

test('4. formatEnrollmentCount formats localized counts when t is provided', () => {
  const tTr = createMockTranslator('tr');
  const tEn = createMockTranslator('en');
  const tAr = createMockTranslator('ar');

  // Without capacity
  assert.equal(formatEnrollmentCount(15, null, tTr), '15 kayıtlı');
  assert.equal(formatEnrollmentCount(15, null, tEn), '15 registered');
  assert.equal(formatEnrollmentCount(15, null, tAr), '15 مسجل');

  // With capacity
  assert.equal(formatEnrollmentCount(15, 30, tTr), '15 / 30 kayıtlı');
  assert.equal(formatEnrollmentCount(15, 30, tEn), '15 / 30 registered');
  assert.equal(formatEnrollmentCount(15, 30, tAr), '15 / 30 مسجل');
});

test('5. formatEnrollmentCount falls back gracefully when t is omitted', () => {
  assert.equal(formatEnrollmentCount(15, null), '15 مسجل');
  assert.equal(formatEnrollmentCount(15, 30), '15 / 30 مسجل');
});
