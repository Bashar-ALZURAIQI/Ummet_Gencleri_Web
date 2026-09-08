/**
 * Centralized Locale-Aware Date and Time Presentation Foundation
 *
 * Responsibilities:
 * - Formats dates and times according to active locale ('tr', 'en', 'ar').
 * - Strict digit discipline: enforces Latin digits ('latn') for Turkish and English
 *   so Arabic-Indic numerals never leak into TR/EN interfaces.
 * - Guarantees Turkish month names in Turkish ('13 Haz 2026') and English in English ('13 Jun 2026').
 * - Preserves canonical date parsing across ISO strings, timestamps, and Date objects.
 */

export function resolveIntlLocale(locale: string): { intlLocale: string; numberingSystem: string } {
  const norm = (locale || '').toLowerCase().trim();
  if (norm.startsWith('tr')) {
    return { intlLocale: 'tr-TR', numberingSystem: 'latn' };
  }
  if (norm.startsWith('en')) {
    return { intlLocale: 'en-US', numberingSystem: 'latn' };
  }
  // Default to Arabic
  return { intlLocale: 'ar-EG', numberingSystem: 'arab' };
}

export function parseValidDate(input: string | number | Date | null | undefined): Date | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }
  const date = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date;
}

export function formatPublicDate(
  dateInput: string | number | Date | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseValidDate(dateInput);
  if (!date) return '';

  const { intlLocale, numberingSystem } = resolveIntlLocale(locale);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    numberingSystem,
    ...options,
  };

  try {
    return new Intl.DateTimeFormat(intlLocale, defaultOptions).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

export function formatPublicTime(
  dateInput: string | number | Date | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseValidDate(dateInput);
  if (!date) return '';

  const { intlLocale, numberingSystem } = resolveIntlLocale(locale);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    numberingSystem,
    ...options,
  };

  try {
    return new Intl.DateTimeFormat(intlLocale, defaultOptions).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
}
