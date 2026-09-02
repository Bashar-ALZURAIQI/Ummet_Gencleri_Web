import { ROLE_LABEL, type UserRole } from '../data/mockData.ts';
import type { ExecutiveTransferServiceOutcome } from './executiveTransferServiceOutcome.ts';

type ExecutiveRole = Exclude<UserRole, 'STUDENT'>;

export interface TransferMember {
  id: string;
  name: string;
}

type RefreshResult = { ok: true } | { ok: false; error?: string };

export interface TransferMemberRoleResult {
  ok: boolean;
  error?: string;
  previousHolder?: TransferMember;
  newHolder?: TransferMember;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLinkedAccountId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function buildTransferConfirmation(input: {
  position: ExecutiveRole;
  previousHolder: TransferMember | null;
  newHolder: TransferMember;
}): string {
  const roleLabel = ROLE_LABEL[input.position];
  const previousName = input.previousHolder?.name || 'لا أحد';

  if (input.position === 'PRESIDENT') {
    return `سيتم نقل منصب ${roleLabel} من ${previousName} إلى ${input.newHolder.name}. `
      + 'عند التأكيد ستفقد أنت، الرئيس الحالي، جميع صلاحيات الرئيس فوراً، '
      + 'وستعود جلستك إلى بوابة الطالب. هل تريد المتابعة؟';
  }

  return `سيتم نقل منصب ${roleLabel} من ${previousName} إلى ${input.newHolder.name}. `
    + 'سيفقد شاغل المنصب الحالي صلاحياته فور تأكيد النقل. هل تريد المتابعة؟';
}

export async function executeExecutiveTransfer(input: {
  actor: { role: UserRole } | null;
  target: TransferMember;
  position: UserRole;
  previousHolder: TransferMember | null;
  transfer: (position: ExecutiveRole, targetUserId: string) => Promise<ExecutiveTransferServiceOutcome>;
  gateAuthority: () => void;
  refreshDirectory: () => Promise<RefreshResult>;
  reloadIdentity: () => Promise<RefreshResult>;
}): Promise<TransferMemberRoleResult> {
  if (input.actor?.role !== 'PRESIDENT') {
    return { ok: false, error: 'نقل المناصب متاح لرئيس الاتحاد الحالي فقط.' };
  }
  if (input.position === 'STUDENT') {
    return { ok: false, error: 'لا يمكن تعيين دور الطالب من شاشة نقل المناصب.' };
  }
  if (!isLinkedAccountId(input.target.id)) {
    return { ok: false, error: 'لا يمكن نقل المنصب: هذا العضو غير مرتبط بحساب دخول موثوق.' };
  }

  let transferResult: ExecutiveTransferServiceOutcome | undefined;
  let transferThrew = false;
  try {
    transferResult = await input.transfer(input.position, input.target.id);
  } catch {
    transferThrew = true;
  }

  // Only a classified database rollback proves there was no commit. Every
  // indeterminate or malformed outcome is fail-closed until Auth is reloaded.
  if (transferResult?.kind === 'definitive-failure') {
    return { ok: false, error: 'تعذر نقل المنصب. لم يتم تغيير أي بيانات.' };
  }

  let gateFailed = false;
  try {
    input.gateAuthority();
  } catch {
    gateFailed = true;
  }

  const confirmed = transferResult?.kind === 'confirmed' ? transferResult.data : undefined;
  const confirmationMatches = confirmed?.transferredPosition === input.position
    && confirmed.newUserId === input.target.id;
  let directoryFailed = false;
  let directoryRefresh: Promise<boolean> | null = null;

  if (confirmationMatches) {
    directoryRefresh = (async () => {
      try {
        return !(await input.refreshDirectory()).ok;
      } catch {
        return true;
      }
    })();
  }

  let identityConfirmed = false;
  try {
    identityConfirmed = (await input.reloadIdentity()).ok;
  } catch {
    identityConfirmed = false;
  }

  if (directoryRefresh) directoryFailed = await directoryRefresh;

  if (!identityConfirmed || gateFailed) {
    return {
      ok: false,
      error: 'تم نقل المنصب أو قد يكون تم نقله، لكن تعذر تأكيد صلاحيات الجلسة. أعد تسجيل الدخول بأمان.',
    };
  }

  if (transferThrew || !transferResult || transferResult.kind === 'indeterminate') {
    return {
      ok: false,
      error: 'تعذر التأكد من نتيجة نقل المنصب. تم تحديث صلاحيات الجلسة احتياطياً؛ تحقق من القائمة قبل المحاولة مجدداً.',
    };
  }

  if (!confirmationMatches) {
    return { ok: false, error: 'لم يعد الخادم تأكيداً مطابقاً لطلب نقل المنصب. تم تحديث صلاحيات الجلسة احتياطياً.' };
  }

  return {
    ok: true,
    ...(directoryFailed ? { error: 'تم نقل المنصب، لكن تعذر تحديث قائمة الأعضاء فوراً.' } : {}),
    ...(input.previousHolder ? { previousHolder: input.previousHolder } : {}),
    newHolder: input.target,
  };
}

export async function runTransferWithBusyState<T>(
  operation: () => Promise<T>,
  setBusy: (busy: boolean) => void,
): Promise<T> {
  setBusy(true);
  try {
    return await operation();
  } finally {
    setBusy(false);
  }
}
