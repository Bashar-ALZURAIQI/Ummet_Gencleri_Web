import type { UserRole } from '../data/mockData.ts';
import type { AvatarFileLike } from './accountIdentity.ts';
import { sanitizeProfileUpdates, type ProfileUpdatePayload } from './accountIdentity.ts';

interface OperationError {
  code: string;
  message: string;
  details?: string;
}

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: OperationError };

export type OwnProfileOperationResult =
  | { ok: true; message: string; warning?: string }
  | { ok: false; error: string };

export type OwnProfileOperationKind = 'profile' | 'avatar' | 'password';
export type OwnProfileOperationResults = Record<OwnProfileOperationKind, OwnProfileOperationResult | null>;

export interface OwnProfileIdentity {
  userId: string;
  loginEmail: string;
  role: UserRole;
  ownership: OwnProfileOperationOwnership;
}

export interface OwnProfileOperationOwnership {
  authEpoch: number;
  userId: string;
}

export function canPublishOwnProfileOperationResult(input: {
  ownership: OwnProfileOperationOwnership | null;
  activeUserId: string | null;
  isAuthEpochCurrent: (authEpoch: number) => boolean;
}): boolean {
  return input.ownership !== null
    && input.activeUserId === input.ownership.userId
    && input.isAuthEpochCurrent(input.ownership.authEpoch);
}

interface AvatarMutationLike {
  warnings: Array<{ code: string }>;
}

export interface OwnProfileOperationDependencies<TFile extends AvatarFileLike = AvatarFileLike> {
  getIdentity: () => OwnProfileIdentity | null;
  updateProfile: (userId: string, updates: ProfileUpdatePayload) => Promise<ServiceResult<unknown>>;
  uploadAvatar: (userId: string, file: TFile) => Promise<ServiceResult<AvatarMutationLike>>;
  deleteAvatar: (userId: string) => Promise<ServiceResult<AvatarMutationLike>>;
  changePassword: (
    loginEmail: string,
    currentPassword: string,
    newPassword: string,
    ownership: OwnProfileOperationOwnership,
  ) => Promise<ServiceResult<{ userId: string }>>;
  isOwnershipCurrent: (ownership: OwnProfileOperationOwnership, userId: string) => boolean;
  refreshIdentity: (
    userId: string,
    previousRole: UserRole,
    ownership: OwnProfileOperationOwnership,
  ) => Promise<{ ok: boolean; error?: string }>;
}

const NO_IDENTITY = 'تعذر تنفيذ العملية لأن هوية الحساب غير مؤكدة. سجّل الدخول مجدداً.';
const SYNC_FAILED = 'تم الحفظ، لكن تعذر تأكيد مزامنة الملف. حدّث الصفحة قبل المتابعة.';

function identityOrFailure(getIdentity: () => OwnProfileIdentity | null):
  | { ok: true; identity: OwnProfileIdentity }
  | { ok: false; result: OwnProfileOperationResult } {
  const identity = getIdentity();
  if (!identity?.userId || !identity.loginEmail) {
    return { ok: false, result: { ok: false, error: NO_IDENTITY } };
  }
  return { ok: true, identity };
}

function trimmedEditablePayload(input: Record<string, unknown>): ProfileUpdatePayload {
  const sanitized = sanitizeProfileUpdates(input);
  const payload: ProfileUpdatePayload = {};
  for (const [key, value] of Object.entries(sanitized)) {
    if (key === 'photo') continue;
    if (typeof value === 'string') {
      payload[key as keyof ProfileUpdatePayload] = value.trim();
    }
  }
  return payload;
}

async function safeServiceCall<T>(call: () => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
  try {
    return await call();
  } catch {
    return {
      ok: false,
      error: { code: 'UNEXPECTED_SERVICE_FAILURE', message: 'The account service request failed.' },
    };
  }
}

async function confirmRefresh<TFile extends AvatarFileLike>(
  dependencies: OwnProfileOperationDependencies<TFile>,
  identity: OwnProfileIdentity,
): Promise<OwnProfileOperationResult | null> {
  if (!dependencies.isOwnershipCurrent(identity.ownership, identity.userId)) {
    return { ok: false, error: SYNC_FAILED };
  }
  try {
    const refresh = await dependencies.refreshIdentity(identity.userId, identity.role, identity.ownership);
    return refresh.ok ? null : { ok: false, error: SYNC_FAILED };
  } catch {
    return { ok: false, error: SYNC_FAILED };
  }
}

export function createOwnProfileOperations<TFile extends AvatarFileLike>(
  dependencies: OwnProfileOperationDependencies<TFile>,
) {
  return {
    async updateProfile(input: Record<string, unknown>): Promise<OwnProfileOperationResult> {
      const confirmed = identityOrFailure(dependencies.getIdentity);
      if (!confirmed.ok) return confirmed.result;

      const update = await safeServiceCall(() => dependencies.updateProfile(
        confirmed.identity.userId,
        trimmedEditablePayload(input),
      ));
      if (!update.ok) {
        return { ok: false, error: 'تعذر حفظ بيانات الملف الشخصي. حاول مرة أخرى.' };
      }

      const refreshFailure = await confirmRefresh(dependencies, confirmed.identity);
      return refreshFailure ?? { ok: true, message: 'تم حفظ بيانات الملف الشخصي ومزامنتها.' };
    },

    async uploadAvatar(file: TFile): Promise<OwnProfileOperationResult> {
      const confirmed = identityOrFailure(dependencies.getIdentity);
      if (!confirmed.ok) return confirmed.result;

      const upload = await safeServiceCall(() => dependencies.uploadAvatar(confirmed.identity.userId, file));
      if (!upload.ok) return { ok: false, error: 'تعذر رفع الصورة الشخصية. حاول مرة أخرى.' };

      const refreshFailure = await confirmRefresh(dependencies, confirmed.identity);
      if (refreshFailure) return refreshFailure;
      return upload.data.warnings.length > 0
        ? {
            ok: true,
            message: 'تم تحديث الصورة الشخصية ومزامنتها.',
            warning: 'تم تحديث الصورة، لكن تعذر تنظيف ملف صورة قديم. لن يؤثر ذلك في الصورة الحالية.',
          }
        : { ok: true, message: 'تم تحديث الصورة الشخصية ومزامنتها.' };
    },

    async deleteAvatar(): Promise<OwnProfileOperationResult> {
      const confirmed = identityOrFailure(dependencies.getIdentity);
      if (!confirmed.ok) return confirmed.result;

      const deletion = await safeServiceCall(() => dependencies.deleteAvatar(confirmed.identity.userId));
      if (!deletion.ok) return { ok: false, error: 'تعذر حذف الصورة الشخصية. حاول مرة أخرى.' };

      const refreshFailure = await confirmRefresh(dependencies, confirmed.identity);
      if (refreshFailure) return refreshFailure;
      return deletion.data.warnings.length > 0
        ? {
            ok: true,
            message: 'تم حذف الصورة الشخصية ومزامنة الملف.',
            warning: 'حُذفت الصورة من الملف، لكن تعذر تنظيف ملف التخزين القديم.',
          }
        : { ok: true, message: 'تم حذف الصورة الشخصية ومزامنة الملف.' };
    },

    async changePassword(
      currentPassword: string,
      newPassword: string,
    ): Promise<OwnProfileOperationResult> {
      const confirmed = identityOrFailure(dependencies.getIdentity);
      if (!confirmed.ok) return confirmed.result;

      const changed = await safeServiceCall(() => dependencies.changePassword(
        confirmed.identity.loginEmail,
        currentPassword,
        newPassword,
        confirmed.identity.ownership,
      ));
      if (!changed.ok || changed.data.userId !== confirmed.identity.userId) {
        return { ok: false, error: 'تعذر تغيير كلمة المرور. تحقق من كلمة المرور الحالية وحاول مجدداً.' };
      }

      const refreshFailure = await confirmRefresh(dependencies, confirmed.identity);
      return refreshFailure ?? { ok: true, message: 'تم تغيير كلمة المرور بنجاح.' };
    },
  };
}
