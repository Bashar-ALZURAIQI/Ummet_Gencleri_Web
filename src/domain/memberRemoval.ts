import type { UserRole } from '../data/mockData.ts';
import type { MemberRemovalResult } from './memberRemovalGateway.ts';

export interface MemberRemovalActor {
  epoch: number;
  userId: string;
  role: UserRole;
}

export async function executeMemberRemoval(input: {
  actor: MemberRemovalActor | null;
  targetUserId: string;
  remove: (targetUserId: string) => Promise<MemberRemovalResult>;
  isOwnershipCurrent: () => boolean;
  refreshDirectory: (canPublish: () => boolean) => Promise<{ ok: boolean; error?: string }>;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.actor?.role !== 'PRESIDENT') {
    return { ok: false, error: 'هذه العملية متاحة لرئيس الاتحاد فقط.' };
  }
  if (input.targetUserId === input.actor.userId) {
    return { ok: false, error: 'لا يمكن لرئيس الاتحاد طرد حسابه الحالي.' };
  }

  const removal = await input.remove(input.targetUserId);
  if (!removal.ok) {
    return { ok: false, error: 'تعذر تأكيد طرد العضو من قاعدة البيانات.' };
  }
  if (!input.isOwnershipCurrent()) {
    return { ok: true, error: 'تم طرد العضو، لكن تغيّر الحساب الحالي لذلك لم تُنشر بيانات الدليل القديمة.' };
  }

  const refreshed = await input.refreshDirectory(input.isOwnershipCurrent);
  return refreshed.ok
    ? { ok: true }
    : { ok: true, error: 'تم طرد العضو، لكن تعذر تحديث الدليل فوراً. حدّث الصفحة لرؤية النتيجة.' };
}
