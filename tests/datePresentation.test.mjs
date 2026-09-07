import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPublicDate,
  formatPublicTime,
  resolveIntlLocale,
  parseValidDate,
} from '../src/domain/datePresentation.ts';

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669]/;

test('1. resolveIntlLocale returns proper locales and numbering systems', () => {
  assert.deepEqual(resolveIntlLocale('tr'), { intlLocale: 'tr-TR', numberingSystem: 'latn' });
  assert.deepEqual(resolveIntlLocale('tr-TR'), { intlLocale: 'tr-TR', numberingSystem: 'latn' });
  assert.deepEqual(resolveIntlLocale('en'), { intlLocale: 'en-US', numberingSystem: 'latn' });
  assert.deepEqual(resolveIntlLocale('en-US'), { intlLocale: 'en-US', numberingSystem: 'latn' });
  assert.deepEqual(resolveIntlLocale('ar'), { intlLocale: 'ar-EG', numberingSystem: 'arab' });
  assert.deepEqual(resolveIntlLocale('unknown'), { intlLocale: 'ar-EG', numberingSystem: 'arab' });
});

test('2. parseValidDate handles valid dates, ISO strings, timestamps, and invalid values', () => {
  assert.equal(parseValidDate(null), null);
  assert.equal(parseValidDate(undefined), null);
  assert.equal(parseValidDate(''), null);
  assert.equal(parseValidDate('invalid-date-string'), null);

  const dateObj = new Date('2026-06-13T14:30:00Z');
  assert.equal(parseValidDate(dateObj)?.getTime(), dateObj.getTime());
  assert.equal(parseValidDate('2026-06-13T14:30:00Z')?.getTime(), dateObj.getTime());
  assert.equal(parseValidDate(dateObj.getTime())?.getTime(), dateObj.getTime());
});

test('3. formatPublicDate in Turkish uses Turkish month and Latin digits', () => {
  const date = '2026-06-13T14:30:00Z';
  const result = formatPublicDate(date, 'tr', { timeZone: 'UTC' });
  assert.equal(ARABIC_INDIC_DIGITS.test(result), false, 'Turkish date must never contain Arabic-Indic digits');
  assert.match(result, /2026/);
  assert.match(result, /Haz/i);
});

test('4. formatPublicDate in English uses English month and Latin digits', () => {
  const date = '2026-06-13T14:30:00Z';
  const result = formatPublicDate(date, 'en', { timeZone: 'UTC' });
  assert.equal(ARABIC_INDIC_DIGITS.test(result), false, 'English date must never contain Arabic-Indic digits');
  assert.match(result, /2026/);
  assert.match(result, /Jun/i);
});

test('5. formatPublicDate in Arabic uses Arabic format and numerals', () => {
  const date = '2026-06-13T14:30:00Z';
  const result = formatPublicDate(date, 'ar', { timeZone: 'UTC' });
  assert.ok(result.length > 0);
  assert.match(result, /يونيو|حزيران/);
});

test('6. formatPublicTime enforces Latin digits for Turkish and English', () => {
  const date = '2026-06-13T14:30:00Z';
  const trTime = formatPublicTime(date, 'tr', { timeZone: 'UTC' });
  const enTime = formatPublicTime(date, 'en', { timeZone: 'UTC' });

  assert.equal(ARABIC_INDIC_DIGITS.test(trTime), false, 'Turkish time must never contain Arabic-Indic digits');
  assert.equal(ARABIC_INDIC_DIGITS.test(enTime), false, 'English time must never contain Arabic-Indic digits');
  assert.match(trTime, /14:30/);
  assert.match(enTime, /14:30/);
});

test('7. Invalid dates return empty string safely', () => {
  assert.equal(formatPublicDate(null, 'tr'), '');
  assert.equal(formatPublicDate(undefined, 'en'), '');
  assert.equal(formatPublicDate('not-a-date', 'ar'), '');
  assert.equal(formatPublicTime(null, 'tr'), '');
  assert.equal(formatPublicTime(undefined, 'en'), '');
  assert.equal(formatPublicTime('not-a-date', 'ar'), '');
});
