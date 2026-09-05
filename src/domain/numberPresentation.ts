/**
 * Locale-aware number and date presentation helpers for human-facing statistics.
 * Preserves underlying numeric and date values while formatting them for display.
 */

const ARABIC_MONTH_MAP: Record<string, number> = {
  'ينا': 0, 'فبر': 1, 'مار': 2, 'أبر': 3, 'ماي': 4, 'يون': 5,
  'يول': 6, 'أغس': 7, 'سبت': 8, 'أكت': 9, 'نوف': 10, 'ديس': 11,
  'يناير': 0, 'فبراير': 1, 'مارس': 2, 'أبريل': 3, 'مايو': 4, 'يونيو': 5,
  'يوليو': 6, 'أغسطس': 7, 'سبتمبر': 8, 'أكتوبر': 9, 'نوفمبر': 10, 'ديسمبر': 11,
};

const ARABIC_SHORT_MONTHS = [
  'ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون',
  'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس',
];

/**
 * Formats a human-facing count or statistic value according to the active locale.
 * - Arabic (ar): Arabic-Indic digits (e.g. ٨٬٧٦٠) via ar-EG
 * - Turkish (tr): Standard digits with Turkish separators (e.g. 8.760) via tr-TR
 * - English (en): Standard digits with English commas (e.g. 8,760) via en-US
 */
export function formatStatisticNumber(
  value: number | string | undefined | null,
  locale?: string,
): string {
  if (value === undefined || value === null || value === '') return '';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return String(value);

  const lang = (locale || 'ar').slice(0, 2).toLowerCase();
  const targetLocale = lang === 'tr' ? 'tr-TR' : lang === 'en' ? 'en-US' : 'ar-EG';
  return new Intl.NumberFormat(targetLocale).format(num);
}

/**
 * Formats a month label for statistics charts according to the active locale.
 * Accepts a month index (0-11) or a legacy Arabic month string abbreviation.
 * - Arabic (ar): ينا, فبر, مار, ...
 * - Turkish (tr): Oca, Şub, Mar, ...
 * - English (en): Jan, Feb, Mar, ...
 */
export function formatStatisticMonth(
  monthIndexOrKey: number | string,
  locale?: string,
): string {
  let monthIndex: number | undefined;

  if (typeof monthIndexOrKey === 'number') {
    monthIndex = monthIndexOrKey;
  } else if (typeof monthIndexOrKey === 'string') {
    const trimmed = monthIndexOrKey.trim();
    if (trimmed in ARABIC_MONTH_MAP) {
      monthIndex = ARABIC_MONTH_MAP[trimmed];
    } else {
      const parsed = Number(trimmed);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 11) {
        monthIndex = parsed;
      }
    }
  }

  if (monthIndex === undefined || monthIndex < 0 || monthIndex > 11) {
    return String(monthIndexOrKey ?? '');
  }

  const lang = (locale || 'ar').slice(0, 2).toLowerCase();
  if (lang === 'ar') {
    return ARABIC_SHORT_MONTHS[monthIndex];
  }

  const targetLocale = lang === 'tr' ? 'tr-TR' : 'en-US';
  return new Intl.DateTimeFormat(targetLocale, { month: 'short' }).format(
    new Date(2026, monthIndex, 15),
  );
}
