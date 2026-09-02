import { validateAvatarFile, type AvatarFileLike } from './accountIdentity.ts';

export interface LifecycleError {
  code: string;
  message: string;
  details?: string;
}

export type LifecycleResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: LifecycleError };

export type AvatarWarning = LifecycleError;

export interface AvatarMutation<TProfile> {
  path: string | null;
  profile: TProfile;
  warnings: AvatarWarning[];
}

export interface AvatarUploadOptions {
  upsert: false;
  contentType: string;
  cacheControl: '3600';
}

type WriteProfilePath<TProfile> = (
  path: string | null,
) => Promise<LifecycleResult<TProfile>>;
type RemoveObject = (path: string) => Promise<LifecycleResult<void>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const failure = <T>(code: string, message: string, details?: string): LifecycleResult<T> => ({
  ok: false,
  error: { code, message, ...(details ? { details } : {}) },
});

function appendCleanupFailure(
  primary: LifecycleError,
  cleanup: LifecycleError,
): LifecycleResult<never> {
  return {
    ok: false,
    error: {
      ...primary,
      details: [primary.details, `New avatar cleanup failed: ${cleanup.message}`, cleanup.details]
        .filter(Boolean)
        .join(' '),
    },
  };
}

export function buildVersionedAvatarPath(
  userId: string,
  mimeType: string,
  versionId: string,
): LifecycleResult<string> {
  if (!UUID_PATTERN.test(userId)) {
    return failure('USER_ID_INVALID', 'A valid account UUID is required for the avatar path.');
  }
  if (!UUID_PATTERN.test(versionId)) {
    return failure('AVATAR_VERSION_INVALID', 'A generated UUID is required for the avatar version.');
  }
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension) {
    return failure('UNSUPPORTED_TYPE', 'The avatar file type is not allowed.');
  }
  return { ok: true, data: `${userId}/avatar-${versionId}.${extension}` };
}

export function isOwnedAvatarPath(userId: string, path: string): boolean {
  if (!UUID_PATTERN.test(userId)) return false;
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^${escapedUserId}/avatar(?:-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\\.(?:jpg|png|webp)$`,
    'i',
  ).test(path);
}

export async function replaceAvatar<TProfile>(input: {
  userId: string;
  file: AvatarFileLike;
  previousPath?: string | null;
  versionId: string;
  upload: (
    path: string,
    file: AvatarFileLike,
    options: AvatarUploadOptions,
  ) => Promise<LifecycleResult<void>>;
  writeProfilePath: WriteProfilePath<TProfile>;
  removeObject: RemoveObject;
}): Promise<LifecycleResult<AvatarMutation<TProfile>>> {
  const validation = validateAvatarFile(input.file);
  if (!validation.valid) {
    return failure(validation.error.toUpperCase(), 'The avatar file is not allowed.');
  }

  const pathResult = buildVersionedAvatarPath(input.userId, String(input.file.type), input.versionId);
  if (!pathResult.ok) return pathResult;
  const path = pathResult.data;

  const upload = await input.upload(path, input.file, {
    upsert: false,
    contentType: String(input.file.type),
    cacheControl: '3600',
  });
  if (!upload.ok) return upload;

  const profileUpdate = await input.writeProfilePath(path);
  if (!profileUpdate.ok) {
    const rollback = await input.removeObject(path);
    return rollback.ok ? profileUpdate : appendCleanupFailure(profileUpdate.error, rollback.error);
  }

  const warnings: AvatarWarning[] = [];
  if (input.previousPath && input.previousPath !== path) {
    if (!isOwnedAvatarPath(input.userId, input.previousPath)) {
      warnings.push({
        code: 'PREVIOUS_AVATAR_PATH_INVALID',
        message: 'The profile was updated, but the previous avatar path was not safe to remove.',
      });
    } else {
      const cleanup = await input.removeObject(input.previousPath);
      if (!cleanup.ok) {
        warnings.push({
          code: 'PREVIOUS_AVATAR_CLEANUP_FAILED',
          message: 'The profile was updated, but the previous avatar object could not be removed.',
          details: cleanup.error.details ?? cleanup.error.message,
        });
      }
    }
  }

  return { ok: true, data: { path, profile: profileUpdate.data, warnings } };
}

export async function deleteAvatar<TProfile>(input: {
  userId: string;
  currentPath?: string | null;
  writeProfilePath: WriteProfilePath<TProfile>;
  removeObject: RemoveObject;
}): Promise<LifecycleResult<AvatarMutation<TProfile>>> {
  if (!UUID_PATTERN.test(input.userId)) {
    return failure('USER_ID_INVALID', 'A valid account UUID is required for the avatar path.');
  }
  if (input.currentPath && !isOwnedAvatarPath(input.userId, input.currentPath)) {
    return failure('AVATAR_PATH_INVALID', 'The stored avatar path does not belong to this account.');
  }

  const profileUpdate = await input.writeProfilePath(null);
  if (!profileUpdate.ok) return profileUpdate;

  const warnings: AvatarWarning[] = [];
  if (input.currentPath) {
    const cleanup = await input.removeObject(input.currentPath);
    if (!cleanup.ok) {
      warnings.push({
        code: 'AVATAR_OBJECT_CLEANUP_FAILED',
        message: 'The profile was cleared, but the avatar object could not be removed.',
        details: cleanup.error.details ?? cleanup.error.message,
      });
    }
  }

  return { ok: true, data: { path: null, profile: profileUpdate.data, warnings } };
}
