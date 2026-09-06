/**
 * Core Translation Provider types and contract (Task 7D).
 *
 * Responsibilities:
 * - Define language boundaries ('ar' source, 'tr' | 'en' targets).
 * - Provider abstraction for machine translation services.
 * - Completely pure: zero React dependencies, zero Supabase imports, zero CMS repository mutations.
 */

export type TranslationLocale = 'tr' | 'en';

export interface TranslationRequest {
  sourceLocale: 'ar';
  targetLocale: TranslationLocale;
  fields: Record<string, string>;
}

export interface TranslationResult {
  targetLocale: TranslationLocale;
  translations: Record<string, string>;
}

export interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
