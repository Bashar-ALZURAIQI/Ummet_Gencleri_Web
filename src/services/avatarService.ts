import {
  deleteAvatar,
  replaceAvatar,
  type AvatarMutation,
} from '../domain/avatarLifecycle.ts';
import {
  createAvatarProfileRepository,
  type AvatarProfileClient,
} from '../domain/avatarProfileRepository.ts';
import type { ProfileRow } from '../domain/supabaseMappers.ts';
import {
  serviceFailure,
  serviceSuccess,
  supabase,
  type ServiceResult,
} from '../lib/supabase.ts';

const AVATAR_BUCKET = 'avatars';
const avatarProfiles = createAvatarProfileRepository(
  supabase as unknown as AvatarProfileClient,
);

export async function uploadOwnAvatar(
  userId: string,
  file: File,
): Promise<ServiceResult<AvatarMutation<ProfileRow>>> {
  const versionId = globalThis.crypto?.randomUUID?.();
  if (!versionId) {
    return serviceFailure(null, 'AVATAR_VERSION_UNAVAILABLE', 'Unable to generate a secure avatar version.');
  }

  const currentAvatar = await avatarProfiles.loadAvatarPath(userId);
  if (!currentAvatar.ok) return currentAvatar;

  return replaceAvatar({
    userId,
    file,
    previousPath: currentAvatar.data,
    versionId,
    upload: async (path, _file, options) => {
      const upload = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, options);
      return upload.error
        ? serviceFailure(upload.error, 'AVATAR_UPLOAD_FAILED', 'Unable to upload the avatar.')
        : serviceSuccess(undefined);
    },
    writeProfilePath: (path) => avatarProfiles.compareAndSetAvatarPath(
      userId,
      currentAvatar.data,
      path,
    ),
    removeObject: async (path) => {
      const removal = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      return removal.error
        ? serviceFailure(removal.error, 'AVATAR_REMOVE_FAILED', 'Unable to remove the avatar object.')
        : serviceSuccess(undefined);
    },
  });
}

export async function removeOwnAvatar(
  userId: string,
): Promise<ServiceResult<AvatarMutation<ProfileRow>>> {
  const currentAvatar = await avatarProfiles.loadAvatarPath(userId);
  if (!currentAvatar.ok) return currentAvatar;

  return deleteAvatar({
    userId,
    currentPath: currentAvatar.data,
    writeProfilePath: (path) => avatarProfiles.compareAndSetAvatarPath(
      userId,
      currentAvatar.data,
      path,
    ),
    removeObject: async (path) => {
      const removal = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
      return removal.error
        ? serviceFailure(removal.error, 'AVATAR_REMOVE_FAILED', 'Unable to remove the avatar object.')
        : serviceSuccess(undefined);
    },
  });
}

export function getAvatarPublicUrl(
  avatarPath: string | null | undefined,
  updatedAt: string | null | undefined,
): string | null {
  if (!avatarPath) return null;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath);
  const separator = data.publicUrl.includes('?') ? '&' : '?';
  return `${data.publicUrl}${separator}v=${encodeURIComponent(updatedAt ?? '0')}`;
}
