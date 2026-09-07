/**
 * Translation Monitoring Pure Domain Layer
 *
 * Core architectural principles:
 * - PURE DOMAIN: Zero React dependencies, zero Supabase dependencies, zero UI dependencies.
 * - ALLOWLIST SCHEMA: Only fields designated as translatable in cmsTranslatableFields.ts are monitored.
 * - TECHNICAL EXCLUSIONS: IDs, UUIDs, URLs, images, emails, phone numbers, enums, dates, and canonical person names are excluded.
 * - INDEPENDENCE: Turkish ('tr') and English ('en') are monitored and evaluated independently.
 * - PRECEDENCE:
 *   Draft -> Missing -> Stale -> Fresh.
 *   - Draft: Active pending draft exists for this field (not superseded by a fresh publish).
 *   - Missing: No usable published translation exists (or is empty / whitespace-only).
 *   - Stale: Published translation exists but is marked stale relative to current Arabic source.
 *   - Fresh: Non-empty published translation exists, no pending draft, current with canonical source.
 * - ZERO DIVISION SAFETY: Targets or summaries with zero translatable fields safely default to 100% or 0% without NaN.
 */

import {
  type CmsTarget,
  type LocalizedCmsLocale,
  type CmsLocalizationRecord,
  CMS_TARGETS,
  computeSourceHash,
  isLocalizationPathStale,
} from './cmsLocalization.ts';
import {
  extractTranslatableCmsFields,
  type ExtractedCmsField,
} from './cmsTranslatableFields.ts';
import { extractFieldValue } from './cmsLocalizationEditor.ts';

// ---------------------------------------------------------------------------
// Types & Contracts
// ---------------------------------------------------------------------------

export type TranslationMonitoringStatus = 'fresh' | 'missing' | 'stale' | 'draft';

export interface TranslationFieldHealth {
  target: CmsTarget | string;
  path: string;
  locale: LocalizedCmsLocale;
  status: TranslationMonitoringStatus;
  publishedStatus: 'fresh' | 'missing' | 'stale';
  hasDraft: boolean;
  canonicalValue: string;
  publishedValue?: string;
  draftValue?: string;
  entityId?: string;
  kind?: string;
}

export interface TargetLocaleStats {
  totalFields: number;
  fresh: number;
  missing: number;
  stale: number;
  draft: number;
  freshPercentage: number;
}

export interface TranslationTargetHealth {
  target: CmsTarget | string;
  tr: TargetLocaleStats;
  en: TargetLocaleStats;
  fields: TranslationFieldHealth[];
}

export interface TranslationMonitoringSummary {
  totalFields: number;
  totalSlots: number;
  fresh: number;
  missing: number;
  stale: number;
  draft: number;
  freshPercentage: number;
  missingPercentage: number;
  stalePercentage: number;
  draftPercentage: number;
  tr: TargetLocaleStats;
  en: TargetLocaleStats;
  targets: TranslationTargetHealth[];
}

// ---------------------------------------------------------------------------
// Helpers: Localized Value Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the localized string value from a payload corresponding to a canonical field path.
 * Handles both plain objects, nested dot paths, and entity arrays matched by index or entity ID.
 */
export function extractLocalizedFieldValue(
  canonicalPayload: unknown,
  localizedPayload: unknown,
  path: string,
  entityId?: string,
): string {
  if (typeof localizedPayload === 'string') {
    return localizedPayload;
  }
  if (!localizedPayload || typeof localizedPayload !== 'object') {
    return '';
  }

  const segments = path.split('.');

  // 1. If entityId is provided, try matching the entity by ID first (handles reordered arrays)
  if (entityId) {
    const numericIndexPos = segments.findIndex((seg) => /^\d+$/.test(seg));
    const subPath = numericIndexPos >= 0 ? segments.slice(numericIndexPos + 1).join('.') : path;

    // A. Localized payload itself is an array of entities
    if (Array.isArray(localizedPayload)) {
      const locMatch = (localizedPayload as unknown[]).find(
        (item) =>
          item &&
          typeof item === 'object' &&
          'id' in item &&
          String((item as { id?: unknown }).id) === String(entityId),
      );
      if (locMatch) {
        if (!subPath) {
          return typeof locMatch === 'string' ? locMatch : '';
        }
        return extractFieldValue(locMatch, subPath) || '';
      }
    }

    // B. Localized payload contains a nested array of entities (e.g. items, cards, members)
    if (numericIndexPos > 0) {
      let parentObj: unknown = localizedPayload;
      for (let i = 0; i < numericIndexPos; i++) {
        const seg = segments[i];
        if (parentObj && typeof parentObj === 'object' && seg in (parentObj as Record<string, unknown>)) {
          parentObj = (parentObj as Record<string, unknown>)[seg];
        } else {
          parentObj = undefined;
          break;
        }
      }
      if (Array.isArray(parentObj)) {
        const locMatch = (parentObj as unknown[]).find(
          (item) =>
            item &&
            typeof item === 'object' &&
            'id' in item &&
            String((item as { id?: unknown }).id) === String(entityId),
        );
        if (locMatch) {
          if (!subPath) {
            return typeof locMatch === 'string' ? locMatch : '';
          }
          return extractFieldValue(locMatch, subPath) || '';
        }
      }
    }
  }

  // 2. Direct path lookup in localized object
  const direct = extractFieldValue(localizedPayload, path);
  if (direct && direct.trim().length > 0) {
    return direct;
  }

  // 3. Array index matching fallback
  if (Array.isArray(localizedPayload) && segments.length > 0) {
    const firstSeg = segments[0];
    const index = Number.parseInt(firstSeg, 10);
    const subPath = segments.slice(1).join('.');

    if (!Number.isNaN(index) && index >= 0 && index < localizedPayload.length) {
      const item = localizedPayload[index];
      if (!subPath) {
        return typeof item === 'string' ? item : '';
      }
      return extractFieldValue(item, subPath) || '';
    }
  }

  // 4. Fallback
  return direct || '';
}

/**
 * Derives entity ID for an extracted field if the field belongs to an array of entities with an `id`.
 */
export function deriveEntityIdFromCanonical(canonicalPayload: unknown, path: string): string | undefined {
  if (!canonicalPayload || typeof canonicalPayload !== 'object') return undefined;

  const segments = path.split('.');
  if (Array.isArray(canonicalPayload) && segments.length > 0) {
    const index = Number.parseInt(segments[0], 10);
    if (!Number.isNaN(index) && index >= 0 && index < canonicalPayload.length) {
      const item = canonicalPayload[index];
      if (item && typeof item === 'object' && 'id' in item && item.id !== undefined && item.id !== null) {
        return String(item.id);
      }
    }
  }

  // Check nested array e.g. "items.0.heading"
  let current: unknown = canonicalPayload;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (current && typeof current === 'object' && seg in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[seg];
      if (Array.isArray(current)) {
        const nextIndex = Number.parseInt(segments[i + 1], 10);
        if (!Number.isNaN(nextIndex) && nextIndex >= 0 && nextIndex < current.length) {
          const item = current[nextIndex];
          if (item && typeof item === 'object' && 'id' in item && item.id !== undefined && item.id !== null) {
            return String(item.id);
          }
        }
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Field Health Calculation
// ---------------------------------------------------------------------------

export interface ComputeFieldHealthParams {
  target: CmsTarget | string;
  field: ExtractedCmsField;
  locale: LocalizedCmsLocale;
  canonicalPayload: unknown;
  publishedRecord?: CmsLocalizationRecord<unknown> | null;
  draftRecord?: CmsLocalizationRecord<unknown> | null;
}

export function computeFieldHealth(params: ComputeFieldHealthParams): TranslationFieldHealth {
  const { target, field, locale, canonicalPayload, publishedRecord, draftRecord } = params;
  const path = field.path;
  const canonicalValue = field.value;
  const entityId = deriveEntityIdFromCanonical(canonicalPayload, path);

  // 1. Published Evaluation
  const publishedValue = publishedRecord
    ? extractLocalizedFieldValue(canonicalPayload, publishedRecord.payload, path, entityId)
    : undefined;

  const hasNonEmptyPublished = publishedValue !== undefined && publishedValue.trim().length > 0;

  let publishedStatus: 'fresh' | 'missing' | 'stale';

  if (!hasNonEmptyPublished) {
    publishedStatus = 'missing';
  } else {
    // Check stale indicators:
    // a. Record explicit status === 'stale'
    // b. Path is listed in stalePaths
    // c. Source hash mismatch against canonical payload
    const recordStatus = publishedRecord?.status;
    const stalePaths = publishedRecord?.stalePaths ?? [];
    const isPathMarkedStale = isLocalizationPathStale(path, stalePaths);

    let isHashStale = false;
    if (canonicalPayload !== undefined && canonicalPayload !== null && publishedRecord?.sourceHash) {
      const currentHash = computeSourceHash(canonicalPayload);
      if (publishedRecord.sourceHash !== currentHash) {
        // Source hash mismatch: if stalePaths is empty or includes this path, treat as stale
        isHashStale = stalePaths.length === 0 || isPathMarkedStale;
      }
    }

    if (recordStatus === 'stale' || isPathMarkedStale || isHashStale) {
      publishedStatus = 'stale';
    } else {
      publishedStatus = 'fresh';
    }
  }

  // 2. Draft Evaluation
  const draftValue = draftRecord
    ? extractLocalizedFieldValue(canonicalPayload, draftRecord.payload, path, entityId)
    : undefined;

  // Check if draft is superseded by a later fresh published record
  const isDraftSuperseded = Boolean(
    publishedRecord &&
      publishedStatus === 'fresh' &&
      draftRecord &&
      draftRecord.updatedAt &&
      publishedRecord.updatedAt &&
      new Date(draftRecord.updatedAt) <= new Date(publishedRecord.updatedAt),
  );

  let hasDraft = false;
  if (draftRecord && !isDraftSuperseded) {
    const draftTrimmed = draftValue?.trim() ?? '';
    const pubTrimmed = publishedValue?.trim() ?? '';

    // If draft record has manualPaths, check if path or entityId.subpath is recorded
    const manualPaths = draftRecord.manualPaths ?? [];
    const subPath = path.includes('.') ? path.split('.').slice(1).join('.') : path;
    const isPathInManual =
      manualPaths.includes('*') ||
      manualPaths.includes(path) ||
      (entityId ? manualPaths.includes(`${entityId}.${subPath}`) : false);

    if (isPathInManual) {
      hasDraft = draftTrimmed.length > 0;
    } else if (draftTrimmed.length > 0) {
      if (!hasNonEmptyPublished || draftTrimmed !== pubTrimmed) {
        hasDraft = true;
      } else if (draftRecord.status === 'draft') {
        // Pending draft partition with explicit non-empty value
        hasDraft = true;
      }
    }
  }

  // 3. Precedence: Draft -> Missing -> Stale -> Fresh
  let status: TranslationMonitoringStatus;
  if (hasDraft) {
    status = 'draft';
  } else {
    status = publishedStatus;
  }

  return {
    target,
    path,
    locale,
    status,
    publishedStatus,
    hasDraft,
    canonicalValue,
    publishedValue: hasNonEmptyPublished ? publishedValue : undefined,
    draftValue: hasDraft ? draftValue : undefined,
    entityId,
    kind: field.kind,
  };
}

// ---------------------------------------------------------------------------
// Target Health Calculation
// ---------------------------------------------------------------------------

export function calculateLocaleStats(fields: TranslationFieldHealth[]): TargetLocaleStats {
  const totalFields = fields.length;
  if (totalFields === 0) {
    return {
      totalFields: 0,
      fresh: 0,
      missing: 0,
      stale: 0,
      draft: 0,
      freshPercentage: 100,
    };
  }

  let fresh = 0;
  let missing = 0;
  let stale = 0;
  let draft = 0;

  for (const f of fields) {
    switch (f.status) {
      case 'fresh':
        fresh++;
        break;
      case 'missing':
        missing++;
        break;
      case 'stale':
        stale++;
        break;
      case 'draft':
        draft++;
        break;
    }
  }

  const freshPercentage = Math.round((fresh / totalFields) * 100);

  return {
    totalFields,
    fresh,
    missing,
    stale,
    draft,
    freshPercentage,
  };
}

export interface ComputeTargetHealthParams {
  target: CmsTarget | string;
  canonicalPayload: unknown;
  publishedTr?: CmsLocalizationRecord<unknown> | null;
  draftTr?: CmsLocalizationRecord<unknown> | null;
  publishedEn?: CmsLocalizationRecord<unknown> | null;
  draftEn?: CmsLocalizationRecord<unknown> | null;
}

export function computeTargetHealth(params: ComputeTargetHealthParams): TranslationTargetHealth {
  const { target, canonicalPayload, publishedTr, draftTr, publishedEn, draftEn } = params;

  // Extract only approved human-translatable fields from canonical payload
  const extractedFields = extractTranslatableCmsFields(target, canonicalPayload);

  const trFields: TranslationFieldHealth[] = [];
  const enFields: TranslationFieldHealth[] = [];
  const allFields: TranslationFieldHealth[] = [];

  for (const field of extractedFields) {
    const trHealth = computeFieldHealth({
      target,
      field,
      locale: 'tr',
      canonicalPayload,
      publishedRecord: publishedTr,
      draftRecord: draftTr,
    });
    trFields.push(trHealth);
    allFields.push(trHealth);

    const enHealth = computeFieldHealth({
      target,
      field,
      locale: 'en',
      canonicalPayload,
      publishedRecord: publishedEn,
      draftRecord: draftEn,
    });
    enFields.push(enHealth);
    allFields.push(enHealth);
  }

  const trStats = calculateLocaleStats(trFields);
  const enStats = calculateLocaleStats(enFields);

  return {
    target,
    tr: trStats,
    en: enStats,
    fields: allFields,
  };
}

// ---------------------------------------------------------------------------
// Overall Monitoring Summary Calculation
// ---------------------------------------------------------------------------

export interface MonitoringInputData {
  canonicalMap?: Record<string, unknown>;
  canonicalTargets?: Record<string, unknown>;
  records?: CmsLocalizationRecord<unknown>[];
  localizationRecords?: CmsLocalizationRecord<unknown>[];
  targets?: readonly (CmsTarget | string)[];
}

export function computeOverallMonitoringSummary(input: MonitoringInputData): TranslationMonitoringSummary {
  const targetList = input.targets ?? CMS_TARGETS;
  const records = input.records ?? input.localizationRecords ?? [];
  const canonicalMap = input.canonicalMap ?? input.canonicalTargets ?? {};

  // Index records by `${target}::${locale}::${partition}`
  const recordIndex = new Map<string, CmsLocalizationRecord<unknown>>();
  for (const r of records) {
    const key = `${r.target}::${r.locale}::${r.partition}`;
    recordIndex.set(key, r);
  }

  const targetHealths: TranslationTargetHealth[] = [];

  let totalFieldCount = 0;
  let totalSlots = 0;
  let fresh = 0;
  let missing = 0;
  let stale = 0;
  let draft = 0;

  let trTotal = 0;
  let trFresh = 0;
  let trMissing = 0;
  let trStale = 0;
  let trDraft = 0;

  let enTotal = 0;
  let enFresh = 0;
  let enMissing = 0;
  let enStale = 0;
  let enDraft = 0;

  for (const target of targetList) {
    const canonicalPayload = canonicalMap[target];
    const publishedTr = recordIndex.get(`${target}::tr::published`) ?? null;
    const draftTr = recordIndex.get(`${target}::tr::draft`) ?? null;
    const publishedEn = recordIndex.get(`${target}::en::published`) ?? null;
    const draftEn = recordIndex.get(`${target}::en::draft`) ?? null;

    const health = computeTargetHealth({
      target,
      canonicalPayload,
      publishedTr,
      draftTr,
      publishedEn,
      draftEn,
    });

    targetHealths.push(health);

    totalFieldCount += health.tr.totalFields; // total unique translatable fields
    totalSlots += health.tr.totalFields + health.en.totalFields; // total locale slots (TR + EN)

    fresh += health.tr.fresh + health.en.fresh;
    missing += health.tr.missing + health.en.missing;
    stale += health.tr.stale + health.en.stale;
    draft += health.tr.draft + health.en.draft;

    trTotal += health.tr.totalFields;
    trFresh += health.tr.fresh;
    trMissing += health.tr.missing;
    trStale += health.tr.stale;
    trDraft += health.tr.draft;

    enTotal += health.en.totalFields;
    enFresh += health.en.fresh;
    enMissing += health.en.missing;
    enStale += health.en.stale;
    enDraft += health.en.draft;
  }

  const freshPercentage = totalSlots > 0 ? Math.round((fresh / totalSlots) * 100) : 100;
  const missingPercentage = totalSlots > 0 ? Math.round((missing / totalSlots) * 100) : 0;
  const stalePercentage = totalSlots > 0 ? Math.round((stale / totalSlots) * 100) : 0;
  const draftPercentage = totalSlots > 0 ? Math.round((draft / totalSlots) * 100) : 0;

  const trSummary: TargetLocaleStats = {
    totalFields: trTotal,
    fresh: trFresh,
    missing: trMissing,
    stale: trStale,
    draft: trDraft,
    freshPercentage: trTotal > 0 ? Math.round((trFresh / trTotal) * 100) : 100,
  };

  const enSummary: TargetLocaleStats = {
    totalFields: enTotal,
    fresh: enFresh,
    missing: enMissing,
    stale: enStale,
    draft: enDraft,
    freshPercentage: enTotal > 0 ? Math.round((enFresh / enTotal) * 100) : 100,
  };

  return {
    totalFields: totalFieldCount,
    totalSlots,
    fresh,
    missing,
    stale,
    draft,
    freshPercentage,
    missingPercentage,
    stalePercentage,
    draftPercentage,
    tr: trSummary,
    en: enSummary,
    targets: targetHealths,
  };
}
