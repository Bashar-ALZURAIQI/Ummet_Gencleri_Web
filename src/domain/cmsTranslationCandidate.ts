/**
 * Pure CMS Translation Candidate & Protection Logic (Task 7D).
 *
 * Responsibilities:
 * - Allowlist-based extraction of machine-translatable fields.
 * - Missing vs. Stale vs. Fresh candidate filtering.
 * - Strict protection of human edits (manualPaths are never overwritten).
 * - Safe merging of machine translations into full CMS payloads.
 *
 * Completely pure, database-independent, React-independent, and MT-vendor-independent.
 */

import {
  type CmsTarget,
  type CmsLocalizationRecord,
  isLocalizationPathStale,
  isLocalizationPathManual,
  type JsonValue,
} from './cmsLocalization.ts';
import { extractTranslatableCmsFields } from './cmsTranslatableFields.ts';
import {
  isTranslatableLocationValue,
  extractFieldValue,
  updateNestedPayload,
} from './cmsLocalizationEditor.ts';
import type { TranslationLocale } from '../services/translation/types.ts';

export interface DetermineCandidatesOptions {
  target: CmsTarget | string;
  canonicalPayload: unknown;
  activeRecord?: CmsLocalizationRecord | null;
  locale: TranslationLocale;
  mode: 'missing' | 'stale' | 'all';
}

/**
 * Pure helper determining candidate fields for automatic machine translation.
 *
 * Rules:
 * 1. Only allowlisted schema fields can ever be candidates (fail-closed).
 * 2. Technical fields, IDs, coordinates, URLs, emails, and fixed enums are excluded.
 * 3. Any field whose path is present in activeRecord.manualPaths is strictly protected
 *    and NEVER included in candidates.
 * 4. In 'missing' mode: Only eligible fields with no existing localized text are candidates.
 * 5. In 'stale' mode: Only stale eligible fields are candidates. Fresh fields are skipped.
 * 6. If activeRecord.status is 'fresh' and mode is 'stale', returns {} (zero character waste).
 */
export function determineTranslationCandidates({
  target,
  canonicalPayload,
  activeRecord,
  mode,
}: DetermineCandidatesOptions): Record<string, string> {
  const candidates: Record<string, string> = {};

  if (!canonicalPayload || typeof canonicalPayload !== 'object') {
    return candidates;
  }

  // If already fresh, stale translation mode has nothing to refresh
  if (mode === 'stale' && activeRecord?.status === 'fresh') {
    return candidates;
  }

  const manualPaths = activeRecord?.manualPaths ?? [];
  const stalePaths = activeRecord?.stalePaths ?? [];
  const extracted = extractTranslatableCmsFields(target, canonicalPayload);

  for (const field of extracted) {
    const cleanPath = field.path.trim();

    // 1. Guard human-readable location text vs URLs/coordinates
    if (cleanPath.toLowerCase().includes('location') && !isTranslatableLocationValue(field.value)) {
      continue;
    }

    // 2. Protect manual edits: if path or ancestor is in manualPaths, never overwrite!
    if (isLocalizationPathManual(cleanPath, manualPaths)) {
      continue;
    }

    // 3. Filter based on requested translation mode
    if (mode === 'missing') {
      const existingValue = activeRecord ? extractFieldValue(activeRecord.payload, cleanPath) : '';
      if (!existingValue || existingValue.trim().length === 0) {
        candidates[cleanPath] = field.value;
      }
    } else if (mode === 'stale') {
      const isStale =
        stalePaths.length > 0
          ? isLocalizationPathStale(cleanPath, stalePaths)
          : activeRecord?.status === 'stale';
      if (isStale) {
        candidates[cleanPath] = field.value;
      }
    } else {
      // mode === 'all'
      candidates[cleanPath] = field.value;
    }
  }

  return candidates;
}

/**
 * Pure helper to merge a map of translated fields into an existing base payload,
 * preserving all sibling entities, nested lists, and unrelated fields.
 */
export function mergeTranslationIntoPayload(
  basePayload: unknown,
  translations: Record<string, string>,
  recordId?: string | null,
): JsonValue {
  if (!basePayload) {
    let emptyObj: Record<string, unknown> = {};
    for (const [path, val] of Object.entries(translations)) {
      emptyObj = updateNestedPayload(emptyObj, path, val) as Record<string, unknown>;
    }
    return emptyObj as JsonValue;
  }

  // Clone payload to guarantee purity
  let cloned = JSON.parse(JSON.stringify(basePayload));

  if (Array.isArray(cloned)) {
    if (recordId) {
      const idx = cloned.findIndex((item) => item && typeof item === 'object' && item.id === recordId);
      if (idx >= 0) {
        let item = cloned[idx];
        for (const [path, val] of Object.entries(translations)) {
          item = updateNestedPayload(item, path, val) as Record<string, unknown>;
        }
        cloned[idx] = item;
      } else {
        let newItem: Record<string, unknown> = { id: recordId };
        for (const [path, val] of Object.entries(translations)) {
          newItem = updateNestedPayload(newItem, path, val) as Record<string, unknown>;
        }
        cloned.push(newItem);
      }
    } else {
      for (const [path, val] of Object.entries(translations)) {
        cloned = updateNestedPayload(cloned, path, val);
      }
    }
    return cloned as JsonValue;
  }

  if (typeof cloned === 'object' && cloned !== null) {
    if (recordId && cloned.id === recordId) {
      for (const [path, val] of Object.entries(translations)) {
        cloned = updateNestedPayload(cloned, path, val) as Record<string, unknown>;
      }
    } else if (recordId && recordId in cloned && typeof cloned[recordId] === 'object') {
      let sub = cloned[recordId];
      for (const [path, val] of Object.entries(translations)) {
        sub = updateNestedPayload(sub, path, val) as Record<string, unknown>;
      }
      cloned[recordId] = sub;
    } else {
      for (const [path, val] of Object.entries(translations)) {
        cloned = updateNestedPayload(cloned, path, val) as Record<string, unknown>;
      }
    }
    return cloned as JsonValue;
  }

  return cloned as JsonValue;
}
