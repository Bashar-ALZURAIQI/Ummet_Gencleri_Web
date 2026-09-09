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
  type CmsTarget,
  type LocalizedCmsLocale,
  type JsonValue,
  computeSourceHash,
  normalizeLocalizationPaths,
  isLocalizationPathStale,
  isLocalizationPathManual,
} from './cmsLocalization.ts';
import type { CmsLocalizationRepository } from './cmsLocalizationRepository.ts';

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
export function extractFieldValue(payload: unknown, path: string): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const obj = payload as Record<string, unknown>;
  if (path in obj && typeof obj[path] === 'string') {
    return obj[path] as string;
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

  const isArrayIndex = (segment: string) => /^\d+$/.test(segment);
  const base: Record<string, unknown> | unknown[] =
    existingPayload && typeof existingPayload === 'object'
      ? JSON.parse(JSON.stringify(existingPayload))
      : isArrayIndex(segments[0]) ? [] : {};

  let current: Record<string, unknown> | unknown[] = base;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const key = Array.isArray(current) && isArrayIndex(seg) ? Number(seg) : seg;
    const existing = current[key as keyof typeof current];
    if (!existing || typeof existing !== 'object') {
      current[key as keyof typeof current] = (isArrayIndex(segments[i + 1]) ? [] : {}) as never;
    }
    current = current[key as keyof typeof current] as Record<string, unknown> | unknown[];
  }

  const finalSegment = segments[segments.length - 1];
  const finalKey = Array.isArray(current) && isArrayIndex(finalSegment)
    ? Number(finalSegment)
    : finalSegment;
  current[finalKey as keyof typeof current] = newValue as never;
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

// ---------------------------------------------------------------------------
// 6. Shared Publish Execution
// ---------------------------------------------------------------------------

export interface ExecuteCmsPublishParams {
  repository: Pick<CmsLocalizationRepository, 'savePublished' | 'deleteDraft'>;
  target: CmsTarget | string;
  locale: LocalizedCmsLocale;
  canonicalPayload: unknown;
  payload: JsonValue;
  manualPaths: readonly string[];
  sourceVersion?: string | number;
  preserveDraft?: boolean;
}

/**
 * Shared publish execution behavior used across both entity tabs (CmsEntityTranslationTabs)
 * and inline field editors (CmsTranslationSection).
 *
 * Rules:
 * - Persists record to published partition with status = 'fresh'.
 * - Sets current canonical sourceHash = computeSourceHash(canonicalPayload).
 * - Normalizes and preserves manualPaths.
 * - Clears stalePaths.
 * - Deletes the consumed draft via repository.deleteDraft(target, locale).
 * - Returns the saved published record.
 */
export async function executeCmsPublish(
  params: ExecuteCmsPublishParams,
): Promise<CmsLocalizationRecord> {
  const {
    repository,
    target,
    locale,
    canonicalPayload,
    payload,
    manualPaths,
    sourceVersion,
    preserveDraft = false,
  } = params;

  const recordToSave: CmsLocalizationRecord = {
    target,
    locale,
    payload,
    status: 'fresh',
    manualPaths: normalizeLocalizationPaths(manualPaths),
    stalePaths: [],
    sourceHash: computeSourceHash(canonicalPayload),
    sourceVersion,
    updatedAt: new Date().toISOString(),
  };

  const saved = await repository.savePublished(recordToSave);

  // Consume/delete draft so it never overrides fresh published record
  if (!preserveDraft) {
    try {
      await repository.deleteDraft(target, locale);
    } catch {
      // Safe fallback if draft does not exist or delete is not permitted
    }
  }

  return saved;
}

export type DirtyLocalizedFields = Partial<
  Record<LocalizedCmsLocale, Readonly<Record<string, string>>>
>;

export interface PendingLocalizedFieldParams {
  path: string;
  value: string;
  publishedRecord: CmsLocalizationRecord | null | undefined;
  isDirty: boolean;
  hasDraft: boolean;
}

export function getPendingLocalizedFieldChange(
  params: PendingLocalizedFieldParams,
): { path: string; value: string } | null {
  const { path, value, publishedRecord, isDirty, hasDraft } = params;
  if (!isDirty && !hasDraft) return null;
  const publishedValue = publishedRecord
    ? deriveFieldLocalizationState(path, publishedRecord).value
    : '';
  return value === publishedValue ? null : { path, value };
}

export interface PublishDirtyLocalizedFieldsParams {
  repository: Pick<
    CmsLocalizationRepository,
    'getDraft' | 'getPublished' | 'savePublished' | 'saveDraft' | 'deleteDraft'
  >;
  target: CmsTarget | string;
  canonicalPayload: unknown;
  changes: DirtyLocalizedFields;
}

/**
 * Publishes an inline modal's pending localized fields once per locale.
 * Each locale starts from its latest full draft/published payload so edited
 * fields and already-published siblings cannot overwrite one another.
 */
export async function publishDirtyLocalizedFields(
  params: PublishDirtyLocalizedFieldsParams,
): Promise<Partial<Record<LocalizedCmsLocale, CmsLocalizationRecord>>> {
  const { repository, target, canonicalPayload, changes } = params;
  const published: Partial<Record<LocalizedCmsLocale, CmsLocalizationRecord>> = {};

  for (const locale of ['tr', 'en'] as const) {
    const localeChanges = Object.entries(changes[locale] ?? {});
    if (localeChanges.length === 0) continue;

    const [latestDraft, latestPublished] = await Promise.all([
      repository.getDraft(target, locale),
      repository.getPublished(target, locale),
    ]);
    const pendingChanges = localeChanges.filter(([path, value]) => {
      const publishedValue = latestPublished
        ? deriveFieldLocalizationState(path, latestPublished).value
        : '';
      return value !== publishedValue;
    });
    if (pendingChanges.length === 0) {
      if (latestDraft && latestPublished) {
        await reconcileConsumedDraft(
          repository,
          latestDraft,
          latestPublished,
          localeChanges.map(([path]) => path),
        );
      }
      continue;
    }

    published[locale] = await publishCmsLocalizationPatch({
      repository,
      target,
      locale,
      canonicalPayload,
      changes: Object.fromEntries(pendingChanges),
    });
  }

  return published;
}

type PatchRepository = Pick<
  CmsLocalizationRepository,
  'getDraft' | 'getPublished' | 'savePublished' | 'saveDraft' | 'deleteDraft'
>;

function cloneJson<T>(value: T): T {
  return value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value)) as T
    : value;
}

function isNumericKeyObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
}

/** Rejects the production-corrupt shape where a canonical array became an object. */
export function assertLocalizationShapeCompatible(
  canonicalPayload: unknown,
  localizedPayload: unknown,
  path = 'root',
): void {
  if (localizedPayload === undefined || localizedPayload === null) return;
  if (Array.isArray(canonicalPayload)) {
    if (!Array.isArray(localizedPayload)) {
      if (isNumericKeyObject(localizedPayload)) {
        throw new Error(`Localization array shape mismatch at ${path}`);
      }
      throw new Error(`Localization array shape mismatch at ${path}`);
    }
    const localizedItems = localizedPayload as unknown[];
    for (let index = 0; index < localizedItems.length; index += 1) {
      const localizedItem = localizedItems[index];
      const localizedId = localizedItem && typeof localizedItem === 'object'
        ? (localizedItem as { id?: unknown }).id
        : undefined;
      const canonicalItem = localizedId !== undefined
        ? canonicalPayload.find((item) => item && typeof item === 'object' && String((item as { id?: unknown }).id) === String(localizedId))
        : canonicalPayload[index];
      if (canonicalItem !== undefined) {
        assertLocalizationShapeCompatible(canonicalItem, localizedItem, `${path}.${index}`);
      }
    }
    return;
  }
  if (!canonicalPayload || typeof canonicalPayload !== 'object' || Array.isArray(localizedPayload)) return;
  if (!localizedPayload || typeof localizedPayload !== 'object') return;
  for (const [key, localizedValue] of Object.entries(localizedPayload as Record<string, unknown>)) {
    if (key in (canonicalPayload as Record<string, unknown>)) {
      assertLocalizationShapeCompatible(
        (canonicalPayload as Record<string, unknown>)[key],
        localizedValue,
        `${path}.${key}`,
      );
    }
  }
}

/** Fills missing canonical structure while preserving every existing localized value. */
export function hydrateLocalizedPayload(canonicalPayload: unknown, localizedPayload: unknown): JsonValue {
  if (localizedPayload === undefined || localizedPayload === null) return cloneJson(canonicalPayload) as JsonValue;
  assertLocalizationShapeCompatible(canonicalPayload, localizedPayload);
  if (Array.isArray(canonicalPayload)) {
    const localizedItems = localizedPayload as unknown[];
    return canonicalPayload.map((canonicalItem, index) => {
      const canonicalId = canonicalItem && typeof canonicalItem === 'object'
        ? (canonicalItem as { id?: unknown }).id
        : undefined;
      const localizedItem = canonicalId !== undefined
        ? localizedItems.find((item) => item && typeof item === 'object' && String((item as { id?: unknown }).id) === String(canonicalId))
        : localizedItems[index];
      return hydrateLocalizedPayload(canonicalItem, localizedItem);
    }) as JsonValue;
  }
  if (canonicalPayload && typeof canonicalPayload === 'object' && !Array.isArray(localizedPayload)) {
    const canonicalObject = canonicalPayload as Record<string, unknown>;
    const localizedObject = localizedPayload as Record<string, unknown>;
    const result: Record<string, JsonValue> = {};
    for (const [key, canonicalValue] of Object.entries(canonicalObject)) {
      result[key] = hydrateLocalizedPayload(canonicalValue, localizedObject[key]);
    }
    for (const [key, localizedValue] of Object.entries(localizedObject)) {
      if (!(key in result)) result[key] = cloneJson(localizedValue) as JsonValue;
    }
    return result;
  }
  return cloneJson(localizedPayload) as JsonValue;
}

function findEntityById(payload: unknown, recordId: string): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  if (!Array.isArray(payload) && String((payload as { id?: unknown }).id) === recordId) {
    return payload as Record<string, unknown>;
  }
  const values = Array.isArray(payload) ? payload : Object.values(payload as Record<string, unknown>);
  for (const value of values) {
    const found = findEntityById(value, recordId);
    if (found) return found;
  }
  return null;
}

function getLogicalPathValue(payload: unknown, path: string): unknown {
  const direct = path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, payload);
  if (direct !== undefined) return direct;
  const [recordId, ...rest] = path.split('.');
  const entity = findEntityById(payload, recordId);
  if (!entity) return undefined;
  return rest.reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, entity);
}

function updateLogicalPath(payload: JsonValue, path: string, value: unknown): JsonValue {
  const [recordId, ...rest] = path.split('.');
  const cloned = cloneJson(payload);
  const entity = rest.length > 0 ? findEntityById(cloned, recordId) : null;
  if (entity) {
    const updatedEntity = updateNestedPayload(entity, rest.join('.'), value);
    Object.keys(entity).forEach((key) => delete entity[key]);
    Object.assign(entity, updatedEntity);
    return cloned;
  }
  return updateNestedPayload(cloned, path, value);
}

async function reconcileConsumedDraft(
  repository: PatchRepository,
  draft: CmsLocalizationRecord | null,
  published: CmsLocalizationRecord,
  consumedPaths: readonly string[],
): Promise<void> {
  if (!draft) return;
  const consumed = new Set(normalizeLocalizationPaths(consumedPaths));
  const remainingPaths = normalizeLocalizationPaths(draft.manualPaths ?? [])
    .filter((path) => !consumed.has(path));
  if (remainingPaths.length === 0) {
    await repository.deleteDraft(published.target, published.locale);
    return;
  }
  let reconciledPayload = cloneJson(published.payload);
  for (const path of remainingPaths) {
    const value = getLogicalPathValue(draft.payload, path);
    if (value !== undefined) reconciledPayload = updateLogicalPath(reconciledPayload, path, value);
  }
  assertLocalizationShapeCompatible(published.payload, reconciledPayload);
  await repository.saveDraft({
    ...draft,
    payload: reconciledPayload,
    partition: 'draft',
    status: 'draft',
    manualPaths: remainingPaths,
    updatedAt: new Date().toISOString(),
  });
}

export interface PublishCmsLocalizationPatchParams {
  repository: PatchRepository;
  target: CmsTarget | string;
  locale: LocalizedCmsLocale;
  canonicalPayload: unknown;
  changes: Readonly<Record<string, string>>;
}

/** Publishes only explicit paths over latest published state; drafts are never a publish base. */
export async function publishCmsLocalizationPatch(
  params: PublishCmsLocalizationPatchParams,
): Promise<CmsLocalizationRecord> {
  const { repository, target, locale, canonicalPayload, changes } = params;
  const [draft, latestPublished] = await Promise.all([
    repository.getDraft(target, locale),
    repository.getPublished(target, locale),
  ]);
  let payload = hydrateLocalizedPayload(canonicalPayload, latestPublished?.payload);
  let manualPaths = [...(latestPublished?.manualPaths ?? [])];
  for (const [path, value] of Object.entries(changes)) {
    payload = updateNestedPayload(payload, path, value);
    manualPaths = recordManualPath(manualPaths, path);
  }
  assertLocalizationShapeCompatible(canonicalPayload, payload);
  const saved = await executeCmsPublish({
    repository, target, locale, canonicalPayload, payload, manualPaths,
    sourceVersion: latestPublished?.sourceVersion ?? draft?.sourceVersion,
    preserveDraft: true,
  });
  await reconcileConsumedDraft(repository, draft, saved, Object.keys(changes));
  return saved;
}

export interface PublishCmsEntityFieldsParams {
  repository: PatchRepository;
  target: CmsTarget | string;
  locale: LocalizedCmsLocale;
  canonicalPayload: unknown;
  recordId: string | null;
  fields: Readonly<Record<string, string>>;
}

export interface PublishCmsEntityLocalesParams extends Omit<PublishCmsEntityFieldsParams, 'locale' | 'fields'> {
  translations: Partial<Record<LocalizedCmsLocale, Readonly<Record<string, string | undefined>>>>;
}

/** Publishes entered TR/EN values independently, once per locale, in deterministic order. */
export async function publishCmsEntityLocales(
  params: PublishCmsEntityLocalesParams,
): Promise<Partial<Record<LocalizedCmsLocale, CmsLocalizationRecord>>> {
  const { translations, ...shared } = params;
  const results: Partial<Record<LocalizedCmsLocale, CmsLocalizationRecord>> = {};
  for (const locale of ['tr', 'en'] as const) {
    const fields = Object.fromEntries(
      Object.entries(translations[locale] ?? {}).filter((entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim().length > 0,
      ),
    );
    if (Object.keys(fields).length === 0) continue;
    results[locale] = await publishCmsEntityFields({ ...shared, locale, fields });
  }
  return results;
}

/** Stable-ID entity patch publication preserving every unrelated entity and nested sibling. */
export async function publishCmsEntityFields(
  params: PublishCmsEntityFieldsParams,
): Promise<CmsLocalizationRecord> {
  const { repository, target, locale, canonicalPayload, recordId, fields } = params;
  const patchesRootObject = !recordId || (
    canonicalPayload !== null &&
    typeof canonicalPayload === 'object' &&
    !Array.isArray(canonicalPayload) &&
    ['header', 'map', 'contactMap', 'generalInfo'].includes(recordId)
  );
  if (patchesRootObject) {
    return publishCmsLocalizationPatch({ repository, target, locale, canonicalPayload, changes: fields });
  }
  const [draft, latestPublished] = await Promise.all([
    repository.getDraft(target, locale),
    repository.getPublished(target, locale),
  ]);
  const payload = hydrateLocalizedPayload(canonicalPayload, latestPublished?.payload);
  let entity = findEntityById(payload, recordId);
  if (!entity && recordId.includes('.stats.')) {
    const [parentId, , indexText] = recordId.split('.');
    const parent = findEntityById(payload, parentId);
    const stats = parent?.stats;
    if (Array.isArray(stats)) entity = stats[Number(indexText)] as Record<string, unknown> | undefined ?? null;
  }
  if (!entity) throw new Error(`Localization entity ${recordId} not found in canonical target ${target}`);
  const consumedPaths: string[] = [];
  let manualPaths = [...(latestPublished?.manualPaths ?? [])];
  for (const [field, value] of Object.entries(fields)) {
    const nextEntity = updateNestedPayload(entity, field, value);
    Object.keys(entity).forEach((key) => delete entity[key]);
    Object.assign(entity, nextEntity);
    const logicalPath = `${recordId}.${field}`;
    consumedPaths.push(logicalPath);
    manualPaths = recordManualPath(manualPaths, logicalPath);
  }
  assertLocalizationShapeCompatible(canonicalPayload, payload);
  const saved = await executeCmsPublish({
    repository, target, locale, canonicalPayload, payload, manualPaths,
    sourceVersion: latestPublished?.sourceVersion ?? draft?.sourceVersion,
    preserveDraft: true,
  });
  await reconcileConsumedDraft(repository, draft, saved, consumedPaths);
  return saved;
}
