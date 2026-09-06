/**
 * Pure localization-editor domain helpers (Task 7C2A).
 *
 * Core responsibilities:
 * - Value-aware classification of location fields (human text vs. technical URLs/coordinates).
 * - Field-level localization state derivation (staleness, manual edit flags, value extraction).
 * - Safe, immutable manual path recording.
 *
 * Completely pure, database-independent, React-independent, and MT-independent.
 */

import {
  type LocalizationStatus,
  type CmsLocalizationRecord,
  type JsonValue,
  normalizeLocalizationPaths,
  isLocalizationPathStale,
  isLocalizationPathManual,
} from './cmsLocalization.ts';

// ---------------------------------------------------------------------------
// 1. Location Value Safety Guard
// ---------------------------------------------------------------------------

/**
 * Distinguishes human editorial location text (translatable) from technical links,
 * map URLs, custom schemes, and raw geographic coordinates (non-translatable).
 *
 * Human text examples (returns true):
 * - "قاعة المؤتمرات - جامعة أتاتورك"
 * - "Main Conference Hall, Floor 2"
 * - "قاعة د. أحمد زويل" (contains abbreviations/periods)
 *
 * Technical examples (returns false):
 * - "https://maps.google.com/?q=..."
 * - "http://example.com/map"
 * - "www.google.com/maps"
 * - "geo:41.0082,28.9784"
 * - "mailto:info@ummet.org"
 * - "tel:+905551234567"
 * - "41.0082, 28.9784" (pure coordinates)
 */
export function isTranslatableLocationValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  // Exclude URLs, web links, custom app schemes, and communications URIs
  if (/^(https?:\/\/|www\.|geo:|maps:|mailto:|tel:|ftp:\/\/)/i.test(trimmed)) {
    return false;
  }

  // Exclude raw email addresses
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return false;
  }

  // Exclude phone numbers (e.g. "+90 555 123 4567", "+905551234567")
  if (/^\+?[\d\s\-().]{7,}$/.test(trimmed) && (trimmed.startsWith('+') || /^\d/.test(trimmed))) {
    return false;
  }

  // Exclude raw numeric coordinate pairs (e.g. "41.0082, 28.9784" or "-41.2, 28.9")
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(trimmed)) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// 2. Field Localization State Derivation
// ---------------------------------------------------------------------------

export interface FieldLocalizationState {
  status: LocalizationStatus;
  isStale: boolean;
  isManual: boolean;
  value: string;
}

/**
 * Safely extracts a string value from a nested JSON payload using dot-notation path.
 * Supports direct string payloads as well as nested objects.
 */
function extractFieldValue(payload: unknown, path: string): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const cleanPath = path.replace(/\[(\d+)\]/g, '.$1.');
  const segments = cleanPath.split('.').map((s) => s.trim()).filter(Boolean);

  let current: unknown = payload;
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return '';
    }
    current = (current as Record<string, unknown>)[seg];
  }

  return typeof current === 'string' ? current : '';
}

/**
 * Derives UI-safe field localization state for a specific path given an optional record.
 */
export function deriveFieldLocalizationState(
  path: string,
  record: CmsLocalizationRecord | null | undefined,
): FieldLocalizationState {
  if (!record || record.status === 'missing') {
    return {
      status: 'missing',
      isStale: false,
      isManual: false,
      value: '',
    };
  }

  const cleanPath = path.trim();
  const rawStatus = record.status;
  const stalePaths = record.stalePaths ?? [];
  const manualPaths = record.manualPaths ?? [];

  // Path is stale if the record itself is stale OR if its path/ancestor is in stalePaths
  const isStale = rawStatus === 'stale' || isLocalizationPathStale(cleanPath, stalePaths);
  const isManual = isLocalizationPathManual(cleanPath, manualPaths);
  const value = extractFieldValue(record.payload, cleanPath);

  return {
    status: rawStatus,
    isStale,
    isManual,
    value,
  };
}

// ---------------------------------------------------------------------------
// 3. Manual Path Tracking
// ---------------------------------------------------------------------------

/**
 * Pure, immutable helper to append an edited dot-path to a record's manualPaths array.
 * Deduplicates and normalizes paths; never mutates the original array.
 */
export function recordManualPath(
  currentManualPaths: readonly string[] | undefined,
  editedPath: string,
): string[] {
  const cleanPath = editedPath.trim();
  const base = currentManualPaths ? [...currentManualPaths] : [];
  if (cleanPath.length > 0) {
    base.push(cleanPath);
  }
  return normalizeLocalizationPaths(base);
}

// ---------------------------------------------------------------------------
// 4. Safe Payload Updating (Preserves Unrelated Fields)
// ---------------------------------------------------------------------------

/**
 * Pure, immutable helper to update a single nested path inside a CMS localization payload.
 * Preserves all unrelated sibling fields and objects.
 * If existingPayload is null or undefined, creates intermediate objects to satisfy the path.
 * If existingPayload is a direct string and path has no dot separators, updates the string directly.
 */
export function updateNestedPayload(
  existingPayload: unknown,
  path: string,
  newValue: unknown,
): JsonValue {
  const cleanPath = path.replace(/\[(\d+)\]/g, '.$1.');
  const segments = cleanPath.split('.').map((s) => s.trim()).filter(Boolean);

  if (segments.length === 0) {
    return newValue as JsonValue;
  }

  // If existing payload is a direct string and path is a simple non-nested key
  if (typeof existingPayload === 'string' && segments.length === 1) {
    return newValue as JsonValue;
  }

  // Clone or initialize base object
  const base: Record<string, unknown> =
    existingPayload && typeof existingPayload === 'object' && !Array.isArray(existingPayload)
      ? JSON.parse(JSON.stringify(existingPayload))
      : {};

  let current: Record<string, unknown> = base;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (!current[seg] || typeof current[seg] !== 'object' || Array.isArray(current[seg])) {
      current[seg] = {};
    }
    current = current[seg] as Record<string, unknown>;
  }

  current[segments[segments.length - 1]] = newValue;
  return base as JsonValue;
}

// ---------------------------------------------------------------------------
// 5. Draft Base Payload Precedence Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the base payload for saving a draft localization record according to
 * approved precedence:
 *
 * 1. Existing draft payload (if present)
 * 2. Existing published payload (if present)
 * 3. Full canonicalPayload clone (if present)
 * 4. Empty object fallback ({})
 *
 * Always returns a cloned value; never mutates draft, published, or canonical payloads.
 */
export function resolveDraftBasePayload(
  draftRecord: CmsLocalizationRecord | null | undefined,
  publishedRecord: CmsLocalizationRecord | null | undefined,
  canonicalPayload: unknown,
): JsonValue {
  const candidate = draftRecord?.payload ?? publishedRecord?.payload ?? canonicalPayload;
  if (candidate && typeof candidate === 'object') {
    return JSON.parse(JSON.stringify(candidate)) as JsonValue;
  }
  if (typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'boolean') {
    return candidate as JsonValue;
  }
  return {};
}
