import { ROLE_LABEL, type UserRole } from '../data/mockData.ts';

export type ExecutiveRole = Exclude<UserRole, 'STUDENT'>;

export interface RevokeExecutiveAssignmentResult {
  revokedPosition: ExecutiveRole;
  revokedUserId: string;
  revokedBy: string;
  revokedAt: string;
}

interface RevocationOutcomeError {
  code: string;
  message: string;
}

export type ExecutiveRevocationOutcome =
  | { kind: 'confirmed'; data: RevokeExecutiveAssignmentResult }
  | { kind: 'definitive-failure'; error: RevocationOutcomeError }
  | { kind: 'indeterminate'; error: RevocationOutcomeError };

export interface RevocationMember {
  id: string;
  name: string;
  role: UserRole;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLinkedAccountId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const OFFICE_NAMES: Partial<Record<ExecutiveRole, string>> = {
  AUDIT_HEAD: 'الرقابة',
  ACADEMIC_HEAD: 'الأكاديمية',
  MEDIA_HEAD: 'الإعلام',
  FINANCE_HEAD: 'المالية',
  ACTIVITIES_HEAD: 'الأنشطة',
  VICE_PRESIDENT: 'نائب الرئيس',
};

export function getOfficeName(position: ExecutiveRole): string {
  return OFFICE_NAMES[position] || ROLE_LABEL[position] || position;
}

export function buildRevocationConfirmation(input: {
  targetName: string;
  position: ExecutiveRole;
}): string {
  const office = getOfficeName(input.position);
  return `سيتم إنهاء منصب ${office} لـ ${input.targetName} وإعادته إلى طالب عادي. `
    + `سيصبح منصب ${office} شاغراً. هل تريد المتابعة؟`;
}

const safeIndeterminate = (): ExecutiveRevocationOutcome => ({
  kind: 'indeterminate',
  error: {
    code: 'ASSIGNMENT_REVOCATION_INDETERMINATE',
    message: 'The assignment revocation result could not be confirmed safely.',
  },
});

const errorCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code ? code.toUpperCase() : null;
};

export function isProvenNoCommitRevocationError(error: unknown): boolean {
  const code = errorCode(error);
  return code === '42501'
    || code === '22023'
    || code === 'P0002'
    || (code !== null && /^23[0-9A-Z]{3}$/.test(code));
}

const EXECUTIVE_ROLES = new Set<ExecutiveRole>([
  'PRESIDENT',
  'VICE_PRESIDENT',
  'MEDIA_HEAD',
  'FINANCE_HEAD',
  'AUDIT_HEAD',
  'ACADEMIC_HEAD',
  'ACTIVITIES_HEAD',
]);

const executiveRole = (value: unknown): ExecutiveRole | null => (
  typeof value === 'string' && EXECUTIVE_ROLES.has(value as ExecutiveRole)
    ? value as ExecutiveRole
    : null
);

export function classifyRevocationRpcResult(response: {
  data: unknown;
  error: unknown;
}): ExecutiveRevocationOutcome {
  if (response.error) {
    if (isProvenNoCommitRevocationError(response.error)) {
      return {
        kind: 'definitive-failure',
        error: {
          code: errorCode(response.error) ?? 'ASSIGNMENT_REVOCATION_REJECTED',
          message: 'The database rejected and rolled back the assignment revocation.',
        },
      };
    }
    return safeIndeterminate();
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    return safeIndeterminate();
  }

  const row = response.data[0];
  if (!row || typeof row !== 'object') return safeIndeterminate();
  const values = row as Record<string, unknown>;

  const revokedPosition = executiveRole(values.revoked_position);
  const revokedUserId = typeof values.revoked_user_id === 'string' && UUID_PATTERN.test(values.revoked_user_id)
    ? values.revoked_user_id
    : null;
  const revokedBy = typeof values.revoked_by === 'string' && UUID_PATTERN.test(values.revoked_by)
    ? values.revoked_by
    : null;
  const revokedAt = typeof values.revoked_at === 'string' ? values.revoked_at : null;

  if (!revokedPosition || !revokedUserId || !revokedBy || !revokedAt || !Number.isFinite(Date.parse(revokedAt))) {
    return safeIndeterminate();
  }

  return {
    kind: 'confirmed',
    data: {
      revokedPosition,
      revokedUserId,
      revokedBy,
      revokedAt,
    },
  };
}

export async function executeExecutiveRevocation(input: {
  actor: { role: UserRole; userId?: string } | null;
  target: RevocationMember;
  revoke: (targetUserId: string) => Promise<ExecutiveRevocationOutcome>;
  refreshDirectory: () => Promise<{ ok: boolean; error?: string }>;
}): Promise<{
  ok: boolean;
  error?: string;
  revokedMember?: { id: string; name: string };
}> {
  if (input.actor?.role !== 'PRESIDENT') {
    return { ok: false, error: 'إنهاء المناصب متاح لرئيس الاتحاد الحالي فقط.' };
  }

  if (input.target.role === 'PRESIDENT' || (input.actor.userId && input.target.id === input.actor.userId)) {
    return {
      ok: false,
      error: 'لا يمكن إنهاء منصب الرئيس وإعادته إلى طالب مباشرة. يجب نقل الرئاسة إلى عضو آخر أولاً.',
    };
  }

  if (input.target.role === 'STUDENT') {
    return { ok: false, error: 'هذا العضو مسجل كـ طالب بالفعل.' };
  }

  if (!isLinkedAccountId(input.target.id)) {
    return { ok: false, error: 'لا يمكن إنهاء المنصب: هذا العضو غير مرتبط بحساب دخول موثوق.' };
  }

  let revocationResult: ExecutiveRevocationOutcome | undefined;
  let revocationThrew = false;
  try {
    revocationResult = await input.revoke(input.target.id);
  } catch {
    revocationThrew = true;
  }

  if (revocationResult?.kind === 'definitive-failure') {
    return { ok: false, error: 'تعذر إنهاء المنصب. لم يتم تغيير أي بيانات.' };
  }

  if (revocationThrew || !revocationResult || revocationResult.kind === 'indeterminate') {
    return {
      ok: false,
      error: 'تعذر التأكد من نتيجة إنهاء المنصب. تم حجب الإجراء احتياطياً؛ تحقق من القائمة قبل المحاولة مجدداً.',
    };
  }

  const confirmed = revocationResult.data;
  if (confirmed.revokedUserId !== input.target.id) {
    return { ok: false, error: 'لم يعد الخادم تأكيداً مطابقاً لطلب إنهاء المنصب.' };
  }

  let directoryFailed = false;
  try {
    const dirResult = await input.refreshDirectory();
    if (!dirResult.ok) directoryFailed = true;
  } catch {
    directoryFailed = true;
  }

  return {
    ok: true,
    ...(directoryFailed ? { error: 'تم إنهاء المنصب، لكن تعذر تحديث قائمة الأعضاء فوراً.' } : {}),
    revokedMember: { id: input.target.id, name: input.target.name },
  };
}
