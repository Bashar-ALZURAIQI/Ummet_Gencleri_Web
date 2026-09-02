import type { UserRole } from '../data/mockData.ts';

export interface AccountProfile {
  userId: string;
  name: string;
  loginEmail: string;
  contactEmail: string;
  university: string;
  major: string;
  year: string;
  phone: string;
  bio: string;
  photo: string;
}

export interface ExecutiveAssignment {
  userId: string;
  role: Exclude<UserRole, 'STUDENT'>;
}

/** A UI-safe view of an authenticated account, independent of AppContext. */
export interface HistoryViewer {
  userId?: string;
  role: UserRole;
}

export interface HistoryEntryOwner {
  submittedByUserId?: string;
}

export interface AvatarFileLike {
  type: unknown;
  size: unknown;
}

export type AvatarValidationResult =
  | { valid: true }
  | { valid: false; error: 'unsupported-type' | 'file-too-large' };

export type ProfileUpdatePayload = Partial<Pick<
  AccountProfile,
  'name' | 'contactEmail' | 'university' | 'major' | 'year' | 'phone' | 'bio' | 'photo'
>>;

const PROFILE_UPDATE_FIELDS = [
  'name',
  'contactEmail',
  'university',
  'major',
  'year',
  'phone',
  'bio',
  'photo',
] as const;

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function resolveAssignedRole(assignment: ExecutiveAssignment | null | undefined): UserRole {
  return assignment?.role ?? 'STUDENT';
}

export function visibleHistoryFor<T extends HistoryEntryOwner>(entries: T[], viewer: HistoryViewer): T[] {
  if (viewer.role === 'PRESIDENT') return entries;
  if (viewer.role === 'STUDENT' || !viewer.userId) return [];

  return entries.filter((entry) => entry.submittedByUserId === viewer.userId);
}

export function sanitizeProfileUpdates(input: Record<string, unknown>): ProfileUpdatePayload {
  const updates: ProfileUpdatePayload = {};

  for (const field of PROFILE_UPDATE_FIELDS) {
    const value = input[field];
    if (typeof value === 'string') updates[field] = value;
  }

  return updates;
}

export function validateAvatarFile(fileLike: AvatarFileLike): AvatarValidationResult {
  if (!ALLOWED_AVATAR_TYPES.has(String(fileLike.type))) {
    return { valid: false, error: 'unsupported-type' };
  }
  if (typeof fileLike.size !== 'number' || !Number.isFinite(fileLike.size) || fileLike.size < 0 || fileLike.size > MAX_AVATAR_BYTES) {
    return { valid: false, error: 'file-too-large' };
  }

  return { valid: true };
}
