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
export function getAcademicYearPresentation(
  rawYear: string | undefined | null,
  t: (key: string, fallback?: string) => string,
): string {
  if (!rawYear) return '';
  const key = ACADEMIC_YEAR_KEY_MAP[rawYear];
  if (key) {
    return t(key, rawYear);
  }
  return rawYear;
}
