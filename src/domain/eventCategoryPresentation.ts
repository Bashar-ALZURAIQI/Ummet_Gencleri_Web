/**
 * Locale-aware presentation helper for canonical event categories.
 * Maps canonical enum keys and Arabic strings to localized labels,
 * while safely preserving unknown historical or custom categories raw.
 */

export const EVENT_CATEGORY_MAP: Record<string, { key: string; fallback: string }> = {
  workshop: { key: 'events.categories.workshop', fallback: 'ورشة عمل' },
  lecture: { key: 'events.categories.lecture', fallback: 'محاضرة' },
  volunteer: { key: 'events.categories.volunteer', fallback: 'عمل تطوعي' },
  training: { key: 'events.categories.training', fallback: 'تدريب' },
  trip: { key: 'events.categories.trip', fallback: 'رحلة' },
  entertainment: { key: 'events.categories.entertainment', fallback: 'ترفيهي' },
  visit: { key: 'events.categories.visit', fallback: 'زيارات' },

  'ورشة عمل': { key: 'events.categories.workshop', fallback: 'ورشة عمل' },
  'محاضرة': { key: 'events.categories.lecture', fallback: 'محاضرة' },
  'عمل تطوعي': { key: 'events.categories.volunteer', fallback: 'عمل تطوعي' },
  'تدريب': { key: 'events.categories.training', fallback: 'تدريب' },
  'رحلة': { key: 'events.categories.trip', fallback: 'رحلة' },
  'ترفيهي': { key: 'events.categories.entertainment', fallback: 'ترفيهي' },
  'زيارات': { key: 'events.categories.visit', fallback: 'زيارات' },
};

/**
 * Returns the localized presentation label for an event category.
 * If the category is not recognized as a known system category,
 * returns the raw category string unchanged.
 */
import type { TFunction } from 'i18next';

export type TranslationFn = TFunction | ((key: string, fallback?: string) => string);

export function getEventCategoryLabel(
  category: string | undefined | null,
  t: TranslationFn,
): string {
  if (!category) return '';
  const trimmed = category.trim();
  const entry = EVENT_CATEGORY_MAP[trimmed] || EVENT_CATEGORY_MAP[trimmed.toLowerCase()];
  if (entry) {
    return t(entry.key, entry.fallback);
  }
  return category;
}
