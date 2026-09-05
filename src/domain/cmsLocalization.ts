/**
 * CMS Localization Domain Foundation (Task 7A)
 *
 * Core architectural principles:
 * - Arabic ('ar') is the canonical editorial source and authority.
 * - Turkish ('tr') and English ('en') are localized overlays.
 * - Arabic content is always served directly from canonical source data.
 * - Stale translations remain visible to the public so readers see a translated version,
 *   while the stale flag and stalePaths expose translation debt to editors.
 * - Draft translations are private to editorial workflows and never exposed publicly;
 *   public reads fall back to canonical Arabic until published.
 * - Missing translations fall back cleanly to canonical Arabic and expose fallback metadata.
 *
 * This module is completely pure and has zero dependencies on Supabase, React,
 * UI components, or external machine translation providers.
 */

import { type Locale, isSupportedLocale, DEFAULT_LOCALE } from './locale.ts';
import type { SiteEditTarget } from '../data/mockData.ts';

// ---------------------------------------------------------------------------
// Locales
// ---------------------------------------------------------------------------

export type CmsLocale = Locale;

export const CANONICAL_CMS_LOCALE: CanonicalCmsLocale = 'ar';
export type CanonicalCmsLocale = 'ar';

export const LOCALIZED_CMS_LOCALES: readonly LocalizedCmsLocale[] = ['tr', 'en'] as const;
export type LocalizedCmsLocale = 'tr' | 'en';

export function isLocalizedCmsLocale(value: unknown): value is LocalizedCmsLocale {
  return typeof value === 'string' && (LOCALIZED_CMS_LOCALES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// CMS Targets
// ---------------------------------------------------------------------------

export const CMS_TARGETS = [
  'site',
  'about',
  'programsContent',
  'events',
  'galleryAlbums',
  'galleryCategories',
  'guideSections',
  'guideQuickInfo',
  'faqCategories',
  'contactCards',
  'contactMap',
  'news',
  'plans',
  'reports',
  'committees',
] as const;

export type CmsTarget =
  | SiteEditTarget
  | 'plans'
  | 'reports'
  | 'committees';

export function isCmsTarget(value: unknown): value is CmsTarget {
  return typeof value === 'string' && (CMS_TARGETS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Localization Status
// ---------------------------------------------------------------------------

/**
 * Lifecycle state of a localized translation record:
 * - missing: No localization exists; UI falls back to canonical Arabic.
 * - fresh:   Translation is up-to-date with current canonical Arabic.
 * - stale:   Canonical Arabic has been updated since translation; translation
 *            remains visible publicly while flagged for editorial revision.
 * - draft:   Work-in-progress translation; hidden from public read resolution.
 */
export type LocalizationStatus = 'missing' | 'fresh' | 'stale' | 'draft';

// ---------------------------------------------------------------------------
// JSON Payloads
// ---------------------------------------------------------------------------

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

// ---------------------------------------------------------------------------
// Localization Record Contract
// ---------------------------------------------------------------------------

export interface CmsLocalizationMetadata {
  sourceVersion?: string | number;
  sourceHash?: string;
  status: LocalizationStatus;
  stalePaths?: readonly string[];
  manualPaths?: readonly string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface CmsLocalizationRecord<T = JsonValue> {
  target: CmsTarget | string;
  locale: LocalizedCmsLocale;
  payload: T;
  sourceVersion?: string | number;
  sourceHash?: string;
  status: LocalizationStatus;
  stalePaths?: readonly string[];
  manualPaths?: readonly string[];
  updatedAt?: string;
  updatedBy?: string;
}

// ---------------------------------------------------------------------------
// Resolution Output
// ---------------------------------------------------------------------------

export interface LocalizationResolution<T = JsonValue> {
  payload: T;
  requestedLocale: Locale;
  actualLocale: Locale;
  didFallback: boolean;
  status: LocalizationStatus;
  stalePaths: readonly string[];
  manualPaths: readonly string[];
}

export interface ResolveCmsLocalizationOptions<T = JsonValue> {
  requestedLocale: Locale | string;
  canonicalPayload: T;
  localization?:
    | CmsLocalizationRecord<T>
    | Record<string, CmsLocalizationRecord<T> | undefined>
    | readonly CmsLocalizationRecord<T>[]
    | null;
}

// ---------------------------------------------------------------------------
// Helper: Deep Clone
// ---------------------------------------------------------------------------

function safeClone<V>(val: V): V {
  if (val === null || typeof val !== 'object') return val;
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val));
}

// ---------------------------------------------------------------------------
// Path Utilities
// ---------------------------------------------------------------------------

/**
 * Normalizes dot-notation and bracket-notation paths into a deduplicated,
 * sorted array of standard dot-notation strings.
 * e.g. [" items[0].title ", "items.0.title", ""] -> ["items.0.title"]
 */
export function normalizeLocalizationPaths(paths: unknown): string[] {
  if (!paths || typeof paths !== 'object' || typeof (paths as Record<symbol, unknown>)[Symbol.iterator] !== 'function') {
    return [];
  }

  const set = new Set<string>();

  for (const raw of paths as Iterable<unknown>) {
    if (typeof raw !== 'string') continue;
    // Replace bracket notation like `[0]` with `.0.`
    const dotSyntax = raw.replace(/\[(\d+)\]/g, '.$1.');
    // Collapse consecutive dots and trim whitespace
    const clean = dotSyntax
      .split('.')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join('.');

    if (clean.length > 0) {
      set.add(clean);
    }
  }

  return Array.from(set).sort();
}

/**
 * Checks whether a given field path (or any of its parent ancestors) is marked stale.
 */
export function isLocalizationPathStale(path: string, stalePaths: readonly string[]): boolean {
  if (!path || !stalePaths || stalePaths.length === 0) return false;
  const cleanPath = path.trim();
  if (!cleanPath) return false;

  const normalized = normalizeLocalizationPaths(stalePaths);
  if (normalized.includes(cleanPath)) return true;

  // Check if an ancestor path is marked stale (e.g. 'hero' makes 'hero.title' stale)
  return normalized.some((stale) => cleanPath.startsWith(`${stale}.`));
}

/**
 * Checks whether a given field path (or any of its parent ancestors) was manually edited.
 */
export function isLocalizationPathManual(path: string, manualPaths: readonly string[]): boolean {
  if (!path || !manualPaths || manualPaths.length === 0) return false;
  const cleanPath = path.trim();
  if (!cleanPath) return false;

  const normalized = normalizeLocalizationPaths(manualPaths);
  if (normalized.includes(cleanPath)) return true;

  return normalized.some((manual) => cleanPath.startsWith(`${manual}.`));
}

/**
 * Pure helper to mark a localization record as stale with additional stale paths.
 * Returns a new object without mutating input.
 */
export function markLocalizationStale<T = JsonValue>(
  record: CmsLocalizationRecord<T>,
  newStalePaths: readonly string[],
): CmsLocalizationRecord<T> {
  const mergedStalePaths = normalizeLocalizationPaths([
    ...(record.stalePaths ?? []),
    ...newStalePaths,
  ]);

  return {
    ...record,
    status: 'stale',
    stalePaths: mergedStalePaths,
    manualPaths: normalizeLocalizationPaths(record.manualPaths ?? []),
  };
}

// ---------------------------------------------------------------------------
// Deterministic Source Hashing
// ---------------------------------------------------------------------------

function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonStringify).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify((value as Record<string, unknown>)[k])}`);
  return `{${pairs.join(',')}}`;
}

/**
 * Computes a deterministic, dependency-free 32-bit FNV-1a hex fingerprint
 * of any JSON-compatible content payload.
 */
export function computeSourceHash(payload: unknown): string {
  const canonical = canonicalJsonStringify(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Pure Public Read Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves CMS content for public viewing according to approved localization rules:
 *
 * 1. AR request: Always returns canonical Arabic payload.
 * 2. TR / EN fresh: Returns localized payload with didFallback = false.
 * 3. TR / EN stale: Keeps existing localized payload visible with status = 'stale'
 *    and didFallback = false, preserving stalePaths for editorial awareness.
 * 4. TR / EN draft: Falls back to canonical Arabic; draft translations are not public.
 * 5. TR / EN missing: Falls back to canonical Arabic with didFallback = true.
 * 6. Unknown locale: Falls back to canonical Arabic.
 */
export function resolveCmsLocalization<T = JsonValue>(
  requestedLocaleOrOptions: Locale | string | ResolveCmsLocalizationOptions<T>,
  canonicalPayloadArg?: T,
  localizationArg?:
    | CmsLocalizationRecord<T>
    | Record<string, CmsLocalizationRecord<T> | undefined>
    | readonly CmsLocalizationRecord<T>[]
    | null,
): LocalizationResolution<T> {
  // Unpack arguments supporting both options-object and positional style
  let rawLocale: string;
  let canonicalPayload: T;
  let localizationSource:
    | CmsLocalizationRecord<T>
    | Record<string, CmsLocalizationRecord<T> | undefined>
    | readonly CmsLocalizationRecord<T>[]
    | null
    | undefined;

  if (
    typeof requestedLocaleOrOptions === 'object' &&
    requestedLocaleOrOptions !== null &&
    'canonicalPayload' in requestedLocaleOrOptions
  ) {
    rawLocale = requestedLocaleOrOptions.requestedLocale;
    canonicalPayload = requestedLocaleOrOptions.canonicalPayload;
    localizationSource = requestedLocaleOrOptions.localization;
  } else {
    rawLocale = requestedLocaleOrOptions as string;
    canonicalPayload = canonicalPayloadArg as T;
    localizationSource = localizationArg;
  }

  // Handle unsupported/unknown locale
  if (!isSupportedLocale(rawLocale)) {
    return {
      payload: safeClone(canonicalPayload),
      requestedLocale: DEFAULT_LOCALE,
      actualLocale: 'ar',
      didFallback: true,
      status: 'missing',
      stalePaths: [],
      manualPaths: [],
    };
  }

  const requestedLocale: Locale = rawLocale;

  // Rule 1: Arabic request always resolves directly from canonical source
  if (requestedLocale === 'ar') {
    return {
      payload: safeClone(canonicalPayload),
      requestedLocale: 'ar',
      actualLocale: 'ar',
      didFallback: false,
      status: 'fresh',
      stalePaths: [],
      manualPaths: [],
    };
  }

  // Find matching localization record for the requested localized target
  let record: CmsLocalizationRecord<T> | null = null;

  if (Array.isArray(localizationSource)) {
    record = localizationSource.find((item) => item?.locale === requestedLocale) ?? null;
  } else if (localizationSource && typeof localizationSource === 'object') {
    if ('locale' in localizationSource && typeof localizationSource.locale === 'string') {
      record = localizationSource.locale === requestedLocale ? (localizationSource as CmsLocalizationRecord<T>) : null;
    } else {
      record = (localizationSource as Record<string, CmsLocalizationRecord<T> | undefined>)[requestedLocale] ?? null;
    }
  }

  // Rule 5: Missing localization falls back to canonical Arabic
  if (!record || record.status === 'missing') {
    return {
      payload: safeClone(canonicalPayload),
      requestedLocale,
      actualLocale: 'ar',
      didFallback: true,
      status: 'missing',
      stalePaths: [],
      manualPaths: [],
    };
  }

  // Rule 4: Draft localization is hidden from public read resolver and falls back to Arabic
  if (record.status === 'draft') {
    return {
      payload: safeClone(canonicalPayload),
      requestedLocale,
      actualLocale: 'ar',
      didFallback: true,
      status: 'draft',
      stalePaths: normalizeLocalizationPaths(record.stalePaths),
      manualPaths: normalizeLocalizationPaths(record.manualPaths),
    };
  }

  // Rule 2 & 3: Fresh or Stale localized content is displayed to readers
  // Stale translations remain visible publicly to prevent jarring fallback to Arabic
  return {
    payload: safeClone(record.payload),
    requestedLocale,
    actualLocale: requestedLocale,
    didFallback: false,
    status: record.status,
    stalePaths: normalizeLocalizationPaths(record.stalePaths),
    manualPaths: normalizeLocalizationPaths(record.manualPaths),
  };
}
