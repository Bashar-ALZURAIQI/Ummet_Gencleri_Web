import type { Locale } from './locale';

export const AUTHORITATIVE_BRAND_NAMES: Record<Locale, string> = {
  ar: 'اتحاد شباب الأمة',
  tr: 'Ümmet Gençleri Birliği',
  en: 'Ummah Youth Union',
} as const;

/**
 * Resolves the public brand name according to active locale and CMS content:
 * - AR: brand?.name || 'اتحاد شباب الأمة'
 * - TR: brand?.nameTr || 'Ümmet Gençleri Birliği'
 * - EN: 'Ummah Youth Union' (temporary locale-aware public fallback until multilingual CMS)
 */
export function resolvePublicBrandName(
  locale: string,
  brand?: { name?: string; nameTr?: string } | null
): string {
  if (locale === 'tr') {
    const custom = brand?.nameTr?.trim();
    if (!custom || custom === 'Ummet Gençleri Birliği') {
      return AUTHORITATIVE_BRAND_NAMES.tr;
    }
    return custom;
  }
  if (locale === 'en') {
    return AUTHORITATIVE_BRAND_NAMES.en;
  }
  return brand?.name?.trim() || AUTHORITATIVE_BRAND_NAMES.ar;
}
