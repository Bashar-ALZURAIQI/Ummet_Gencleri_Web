export type ManagedAssetRole =
  | 'PRESIDENT'
  | 'VICE_PRESIDENT'
  | 'MEDIA_HEAD'
  | 'ACADEMIC_HEAD'
  | 'FINANCE_HEAD'
  | 'AUDIT_HEAD'
  | 'ACTIVITIES_HEAD'
  | 'STUDENT';

export type ManagedAssetFolder =
  | 'news'
  | 'events'
  | 'albums'
  | 'site'
  | 'documents'
  | 'videos';

const ALLOWED_FOLDERS_BY_ROLE: Readonly<Record<ManagedAssetRole, readonly ManagedAssetFolder[]>> = {
  PRESIDENT: ['news', 'events', 'albums', 'site', 'documents', 'videos'],
  VICE_PRESIDENT: ['documents'],
  MEDIA_HEAD: ['news', 'albums', 'site', 'documents', 'videos'],
  ACADEMIC_HEAD: ['events', 'documents'],
  FINANCE_HEAD: ['documents'],
  AUDIT_HEAD: ['documents'],
  ACTIVITIES_HEAD: ['events', 'documents'],
  STUDENT: [],
};

export function canUploadManagedFolder(role: string, folder: string): boolean {
  const allowed = ALLOWED_FOLDERS_BY_ROLE[role as ManagedAssetRole];
  return Boolean(allowed?.includes(folder as ManagedAssetFolder));
}

export type ContentVersionResult =
  | { ok: true; nextVersion: number }
  | { ok: false; code: 'CONTENT_VERSION_CONFLICT' | 'CONTENT_VERSION_INVALID' };

export function validateExpectedContentVersion(input: {
  storedVersion: number;
  expectedVersion: number;
}): ContentVersionResult {
  if (!Number.isSafeInteger(input.storedVersion) || input.storedVersion < 1
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return { ok: false, code: 'CONTENT_VERSION_INVALID' };
  }
  if (input.storedVersion !== input.expectedVersion) {
    return { ok: false, code: 'CONTENT_VERSION_CONFLICT' };
  }
  return { ok: true, nextVersion: input.storedVersion + 1 };
}

export const managedAssetFolderForRole = ALLOWED_FOLDERS_BY_ROLE;
