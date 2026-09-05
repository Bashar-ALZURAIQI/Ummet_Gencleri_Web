/**
 * Canonical stored values for academic years from the student registration form
 * mapped to their existing auth.years.* translation key paths.
 */
export const ACADEMIC_YEAR_KEY_MAP: Record<string, string> = {
  'السنة الأولى': 'auth.years.first',
  'السنة الثانية': 'auth.years.second',
  'السنة الثالثة': 'auth.years.third',
  'السنة الرابعة': 'auth.years.fourth',
  'دراسات عليا': 'auth.years.postgraduate',
};

/**
 * Translates a canonical stored academic_year string to its localized presentation label.
 * If an old or unknown historical value is encountered, it falls back to displaying
 * the raw value unchanged.
 */
import type { TFunction } from 'i18next';

export type TranslationFn = TFunction | ((key: string, fallback?: string) => string);

export function getAcademicYearPresentation(
  rawYear: string | undefined | null,
  t: TranslationFn,
): string {
  if (!rawYear) return '';
  const key = ACADEMIC_YEAR_KEY_MAP[rawYear];
  if (key) {
    return t(key, rawYear);
  }
  return rawYear;
}
