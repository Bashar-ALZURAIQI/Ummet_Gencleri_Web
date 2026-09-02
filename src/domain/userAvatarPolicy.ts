export interface UserAvatarInput {
  photo?: string | null;
  avatarPath?: string | null;
  updatedAt?: string | null;
}

export type AvatarPathResolver = (
  avatarPath: string,
  updatedAt: string | null | undefined,
) => string | null;

const VERSIONED_AVATAR_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar(?:-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?\.(?:jpg|png|webp)$/i;

function isSafeDirectUrl(value: string): boolean {
  return /^(?:https?:|blob:|data:image\/(?:jpeg|png|webp);)/i.test(value);
}

export function resolveUserAvatarSource(
  input: UserAvatarInput,
  resolvePath: AvatarPathResolver,
): string | null {
  const photo = input.photo?.trim() ?? '';
  if (photo && isSafeDirectUrl(photo)) return photo;

  const path = input.avatarPath?.trim() ?? '';
  if (path && isSafeDirectUrl(path)) return path;
  if (!VERSIONED_AVATAR_PATH.test(path)) return null;
  return resolvePath(path, input.updatedAt);
}

export function avatarFallbackInitial(name: string | null | undefined): string {
  return Array.from(name?.trim() ?? '')[0] ?? '؟';
}

export function avatarAltText(name: string | null | undefined): string {
  return `صورة ${name?.trim() || 'المستخدم'}`;
}
