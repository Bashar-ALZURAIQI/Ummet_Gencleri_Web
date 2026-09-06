/**
 * CMS Translatable Field Schema and Safe Extraction Foundation (Task 7C1)
 *
 * Core architectural principles:
 * - ALLOWLIST ONLY: A CMS field is translatable ONLY if its path explicitly matches an approved schema rule.
 * - FAIL-CLOSED: Any unknown target or unlisted path is non-translatable by default.
 * - HUMAN TEXT ONLY: Only non-empty, non-whitespace string values are extracted for translation.
 * - IDENTITY & TECHNICAL EXCLUSION:
 *   - IDs, UUIDs, numbers, booleans, dates, timestamps, status/enum keys are excluded.
 *   - URLs, image URLs, file URLs, map links, and social links are excluded.
 *   - Emails and phone numbers are excluded.
 *   - Person/member names are strictly excluded (identity invariant).
 *   - Fixed organizational/executive roles are excluded (handled by executivePresentation.ts).
 *   - Event category keys are excluded (handled by eventCategoryPresentation.ts).
 *   - Brand names (brand.name / brand.nameTr) use dedicated presentation architecture and
 *     are explicitly excluded from generic automatic CMS extraction.
 *
 * This module is completely pure and database-independent.
 */

import { type CmsTarget } from './cmsLocalization.ts';

// ---------------------------------------------------------------------------
// Field Kinds & Schemas
// ---------------------------------------------------------------------------

export type CmsFieldKind = 'title' | 'description' | 'richText' | 'text';

export interface CmsTranslatableFieldRule {
  pathPattern: string;
  kind: CmsFieldKind;
  notes?: string;
}

export interface ExtractedCmsField {
  target: CmsTarget | string;
  path: string;
  value: string;
  kind: CmsFieldKind;
}

// ---------------------------------------------------------------------------
// Explicit Excluded Categories Documentation
// ---------------------------------------------------------------------------

export const EXCLUDED_FIELD_CATEGORIES = [
  'ids_and_uuids',
  'urls_and_media',
  'emails_and_phones',
  'dates_and_counts',
  'system_roles_and_enums',
  'person_names',
  'brand_special_architecture',
] as const;

export type ExcludedFieldCategory = (typeof EXCLUDED_FIELD_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Target Translatable Field Schema
// ---------------------------------------------------------------------------

export const CMS_TRANSLATABLE_SCHEMA: Record<string, readonly CmsTranslatableFieldRule[]> = {
  // 1. Site
  site: [
    { pathPattern: 'hero.badge', kind: 'title' },
    { pathPattern: 'hero.title', kind: 'title' },
    { pathPattern: 'hero.subtitle', kind: 'description' },
    { pathPattern: 'hero.description', kind: 'description' },
    { pathPattern: 'hero.primaryBtn', kind: 'text' },
    { pathPattern: 'hero.secondaryBtn', kind: 'text' },
    { pathPattern: 'hero.tertiaryBtn', kind: 'text' },
    { pathPattern: 'hero.badge1.label', kind: 'text' },
    { pathPattern: 'hero.badge2.label', kind: 'text' },
    { pathPattern: 'stats.*.label', kind: 'text' },
    { pathPattern: 'about.badge', kind: 'title' },
    { pathPattern: 'about.title', kind: 'title' },
    { pathPattern: 'about.description', kind: 'description' },
    { pathPattern: 'about.imageBadge.label', kind: 'text' },
    { pathPattern: 'about.features.*.title', kind: 'title' },
    { pathPattern: 'about.features.*.desc', kind: 'description' },
    { pathPattern: 'boardPreview.title', kind: 'title' },
    { pathPattern: 'boardPreview.subtitle', kind: 'description' },
    { pathPattern: 'boardPreview.description', kind: 'description' },
    { pathPattern: 'footer.address', kind: 'text' },
    { pathPattern: 'footer.copyright', kind: 'text' },
  ],

  // 2. About
  about: [
    { pathPattern: 'header.badge', kind: 'title' },
    { pathPattern: 'header.title', kind: 'title' },
    { pathPattern: 'header.description', kind: 'description' },
    { pathPattern: 'story.badge', kind: 'title' },
    { pathPattern: 'story.title', kind: 'title' },
    { pathPattern: 'story.paragraphs.*', kind: 'richText' },
    { pathPattern: 'mission.badge', kind: 'title' },
    { pathPattern: 'mission.title', kind: 'title' },
    { pathPattern: 'mission.cards.*.title', kind: 'title' },
    { pathPattern: 'mission.cards.*.text', kind: 'description' },
    { pathPattern: 'goals.badge', kind: 'title' },
    { pathPattern: 'goals.title', kind: 'title' },
    { pathPattern: 'goals.cards.*.title', kind: 'title' },
    { pathPattern: 'goals.cards.*.desc', kind: 'description' },
    { pathPattern: 'cta.title', kind: 'title' },
    { pathPattern: 'cta.description', kind: 'description' },
    { pathPattern: 'cta.buttonText', kind: 'text' },
  ],

  // 3. Programs Content
  programsContent: [
    { pathPattern: 'badge', kind: 'title' },
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: 'description', kind: 'description' },
  ],

  // 4. Events
  events: [
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'description', kind: 'description' },
    { pathPattern: '*.description', kind: 'description' },
    { pathPattern: 'location', kind: 'text' },
    { pathPattern: '*.location', kind: 'text' },
  ],

  // 5. Gallery Albums
  galleryAlbums: [
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'description', kind: 'description' },
    { pathPattern: '*.description', kind: 'description' },
    { pathPattern: 'location', kind: 'text' },
    { pathPattern: '*.location', kind: 'text' },
    { pathPattern: 'media.*.caption', kind: 'description' },
    { pathPattern: '*.media.*.caption', kind: 'description' },
  ],

  // 6. Gallery Categories
  galleryCategories: [
    { pathPattern: 'label', kind: 'title' },
    { pathPattern: '*.label', kind: 'title' },
  ],

  // 7. Student Guide Sections
  guideSections: [
    { pathPattern: 'label', kind: 'title' },
    { pathPattern: '*.label', kind: 'title' },
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'intro', kind: 'description' },
    { pathPattern: '*.intro', kind: 'description' },
    { pathPattern: 'items.*.heading', kind: 'title' },
    { pathPattern: '*.items.*.heading', kind: 'title' },
    { pathPattern: 'items.*.body', kind: 'richText' },
    { pathPattern: '*.items.*.body', kind: 'richText' },
    { pathPattern: 'items.*.tips.*', kind: 'text' },
    { pathPattern: '*.items.*.tips.*', kind: 'text' },
  ],

  // 8. Student Guide Quick Info
  guideQuickInfo: [
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: 'items.*.title', kind: 'title' },
    { pathPattern: 'items.*.description', kind: 'description' },
  ],

  // Alias umbrella for Student Guide
  studentGuide: [
    { pathPattern: 'label', kind: 'title' },
    { pathPattern: '*.label', kind: 'title' },
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'intro', kind: 'description' },
    { pathPattern: '*.intro', kind: 'description' },
    { pathPattern: 'items.*.heading', kind: 'title' },
    { pathPattern: '*.items.*.heading', kind: 'title' },
    { pathPattern: 'items.*.body', kind: 'richText' },
    { pathPattern: '*.items.*.body', kind: 'richText' },
    { pathPattern: 'items.*.tips.*', kind: 'text' },
    { pathPattern: '*.items.*.tips.*', kind: 'text' },
    { pathPattern: 'items.*.title', kind: 'title' },
    { pathPattern: 'items.*.description', kind: 'description' },
  ],

  // 9. FAQ Categories
  faqCategories: [
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'items.*.question', kind: 'title' },
    { pathPattern: '*.items.*.question', kind: 'title' },
    { pathPattern: 'items.*.answer', kind: 'richText' },
    { pathPattern: '*.items.*.answer', kind: 'richText' },
  ],

  // Alias for FAQ
  faq: [
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'items.*.question', kind: 'title' },
    { pathPattern: '*.items.*.question', kind: 'title' },
    { pathPattern: 'items.*.answer', kind: 'richText' },
    { pathPattern: '*.items.*.answer', kind: 'richText' },
  ],

  // 10. Contact Cards
  contactCards: [
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'sub', kind: 'description' },
    { pathPattern: '*.sub', kind: 'description' },
  ],

  // 11. Contact Map
  contactMap: [
    { pathPattern: 'title', kind: 'title' },
  ],

  // 12. News
  news: [
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'category', kind: 'title' },
    { pathPattern: '*.category', kind: 'title' },
    { pathPattern: 'excerpt', kind: 'description' },
    { pathPattern: '*.excerpt', kind: 'description' },
    { pathPattern: 'fullContent', kind: 'richText' },
    { pathPattern: '*.fullContent', kind: 'richText' },
  ],

  // 13. Plans (quarter is a system select value, excluded)
  plans: [
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'description', kind: 'description' },
    { pathPattern: '*.description', kind: 'description' },
  ],

  // 14. Reports (type is a fixed select value and excluded; period is free-form text and translatable)
  reports: [
    { pathPattern: 'title', kind: 'title' },
    { pathPattern: '*.title', kind: 'title' },
    { pathPattern: 'summary', kind: 'description' },
    { pathPattern: '*.summary', kind: 'description' },
    { pathPattern: 'period', kind: 'text' },
    { pathPattern: '*.period', kind: 'text' },
  ],

  // 15. Committees
  // Note: head.role is a fixed system role and remains strictly excluded.
  // members.*.position is an editable, free-form member responsibility and is translatable.
  committees: [
    { pathPattern: 'description', kind: 'description' },
    { pathPattern: '*.description', kind: 'description' },
    { pathPattern: 'responsibilities.*', kind: 'text' },
    { pathPattern: '*.responsibilities.*', kind: 'text' },
    { pathPattern: 'vision', kind: 'description' },
    { pathPattern: '*.vision', kind: 'description' },
    { pathPattern: 'goals', kind: 'description' },
    { pathPattern: '*.goals', kind: 'description' },
    { pathPattern: 'head.bio', kind: 'richText' },
    { pathPattern: '*.head.bio', kind: 'richText' },
    { pathPattern: 'members.*.position', kind: 'text' },
    { pathPattern: '*.members.*.position', kind: 'text' },
    { pathPattern: 'stats.*.label', kind: 'text' },
    { pathPattern: '*.stats.*.label', kind: 'text' },
  ],
};

// ---------------------------------------------------------------------------
// Path Matching & Extraction Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a concrete dot-path matches a wildcard pattern.
 * Wildcard '*' matches any single path segment (such as array indices '0', '1').
 * e.g., 'items.*.title' matches 'items.0.title'
 */
export function matchPathPattern(pattern: string, path: string): boolean {
  if (!pattern || !path) return false;
  const patternSegments = pattern.split('.');
  const pathSegments = path.split('.');

  if (patternSegments.length !== pathSegments.length) {
    return false;
  }

  for (let i = 0; i < patternSegments.length; i++) {
    const pSeg = patternSegments[i];
    const aSeg = pathSegments[i];

    if (pSeg === '*') {
      continue;
    }

    if (pSeg !== aSeg) {
      return false;
    }
  }

  return true;
}

/**
 * Pure allowlist checker. Returns true only if the given target has an explicitly
 * allowlisted pattern matching the requested path. Unknown targets/paths fail closed.
 */
export function isCmsPathTranslatable(target: CmsTarget | string, path: string): boolean {
  if (!target || !path) return false;
  const rules = CMS_TRANSLATABLE_SCHEMA[target];
  if (!rules || rules.length === 0) return false;

  const cleanPath = path.trim();
  if (!cleanPath) return false;

  return rules.some((rule) => matchPathPattern(rule.pathPattern, cleanPath));
}

/**
 * Safely extracts all translatable human-language text fields from a CMS payload
 * according to the target's approved allowlist schema.
 *
 * - Non-strings, numbers, booleans, and nulls are strictly skipped.
 * - Empty or whitespace-only strings are skipped.
 * - The original payload is never mutated.
 */
export function extractTranslatableCmsFields(
  target: CmsTarget | string,
  payload: unknown,
): ExtractedCmsField[] {
  const result: ExtractedCmsField[] = [];
  if (!target || payload === null || payload === undefined) return result;

  const rules = CMS_TRANSLATABLE_SCHEMA[target];
  if (!rules || rules.length === 0) return result;

  function traverse(value: unknown, currentPath: string): void {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const nextPath = currentPath ? `${currentPath}.${i}` : `${i}`;
        traverse(value[i], nextPath);
      }
      return;
    }

    if (typeof value === 'object') {
      for (const key of Object.keys(value)) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        traverse((value as Record<string, unknown>)[key], nextPath);
      }
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) return;

      const cleanPath = currentPath.trim();
      const matchingRule = rules.find((r) => matchPathPattern(r.pathPattern, cleanPath));
      if (matchingRule) {
        result.push({
          target: target as CmsTarget,
          path: cleanPath,
          value,
          kind: matchingRule.kind,
        });
      }
    }
  }

  traverse(payload, '');
  return result;
}

/**
 * Returns a sorted list of concrete dot-paths representing all translatable
 * fields found in the given CMS payload.
 */
export function getTranslatableCmsPaths(
  target: CmsTarget | string,
  payload: unknown,
): string[] {
  return extractTranslatableCmsFields(target, payload).map((f) => f.path);
}
