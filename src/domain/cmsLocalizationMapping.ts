import type {
  CmsLocalizationRecord,
  LocalizedCmsLocale,
  LocalizationStatus,
  JsonValue,
} from './cmsLocalization.ts';

export type CmsLocalizationPartition = 'draft' | 'published';

export interface CmsLocalizationRow {
  id?: string;
  target: string;
  locale: string;
  partition: CmsLocalizationPartition;
  payload: JsonValue;
  status: LocalizationStatus;
  source_hash: string | null;
  source_version: string | null;
  stale_paths: string[];
  manual_paths: string[];
  updated_at: string;
  updated_by: string | null;
  created_at?: string;
}

export function mapRowToRecord<T = JsonValue>(
  row: CmsLocalizationRow,
): CmsLocalizationRecord<T> {
  return {
    target: row.target,
    locale: row.locale as LocalizedCmsLocale,
    payload: (row.payload ?? {}) as T,
    sourceVersion: row.source_version ?? undefined,
    sourceHash: row.source_hash ?? undefined,
    status: row.status ?? (row.partition === 'draft' ? 'draft' : 'fresh'),
    stalePaths: Array.isArray(row.stale_paths) ? [...row.stale_paths] : [],
    manualPaths: Array.isArray(row.manual_paths) ? [...row.manual_paths] : [],
    updatedAt: row.updated_at ?? undefined,
    updatedBy: row.updated_by ?? undefined,
  };
}

export function mapRecordToRow<T = JsonValue>(
  record: CmsLocalizationRecord<T>,
  partition: CmsLocalizationPartition,
): Omit<CmsLocalizationRow, 'id' | 'created_at'> {
  return {
    target: record.target.trim(),
    locale: record.locale,
    partition,
    payload: (record.payload ?? {}) as JsonValue,
    status: record.status ?? (partition === 'draft' ? 'draft' : 'fresh'),
    source_hash: record.sourceHash ?? null,
    source_version:
      record.sourceVersion !== undefined ? String(record.sourceVersion) : null,
    stale_paths: Array.isArray(record.stalePaths) ? [...record.stalePaths] : [],
    manual_paths: Array.isArray(record.manualPaths)
      ? [...record.manualPaths]
      : [],
    updated_at: record.updatedAt ?? new Date().toISOString(),
    updated_by: record.updatedBy ?? null,
  };
}
