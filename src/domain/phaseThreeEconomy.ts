import type { AttendanceStatus, RecentPointsLedgerEntry, TaskCompletionStatus } from './internalEconomyTypes.ts';

export type MembershipTier = 'BRONZE' | 'SILVER' | 'GOLD';

export interface TierPresentation {
  tier: MembershipTier;
  label: string;
  medal: string;
}

export function tierPresentation(points: number): TierPresentation {
  if (points > 300) return { tier: 'GOLD', label: 'عضو نخبوي', medal: '🥇' };
  if (points > 100) return { tier: 'SILVER', label: 'عضو فعال', medal: '🥈' };
  return { tier: 'BRONZE', label: 'عضو مبادر', medal: '🥉' };
}

export function memberNeedsWarning(points: number): boolean {
  return points <= -50;
}

export function activityDraftComplete(rows: Array<{ attendanceStatus: AttendanceStatus | null }>): boolean {
  return rows.length > 0 && rows.every((row) => row.attendanceStatus !== null);
}

export function taskDraftComplete(rows: Array<{ completionStatus: TaskCompletionStatus }>): boolean {
  return rows.length > 0 && rows.every((row) => row.completionStatus !== 'PENDING');
}

export const canManageExcuses = (role: string | null | undefined): boolean => (
  role === 'PRESIDENT' || role === 'VICE_PRESIDENT'
);

export const canManageOversight = (role: string | null | undefined): boolean => (
  role === 'PRESIDENT' || role === 'AUDIT_HEAD'
);

export const canManageMemberPoints = (role: string | null | undefined): boolean => (
  role === 'PRESIDENT' || role === 'ACADEMIC_HEAD' || role === 'AUDIT_HEAD'
);

export const canMutateMemberPoints = (role: string | null | undefined): boolean => role === 'PRESIDENT';

const TASK_MANAGER_ROLES = new Set([
  'PRESIDENT',
  'VICE_PRESIDENT',
  'MEDIA_HEAD',
  'FINANCE_HEAD',
  'AUDIT_HEAD',
  'ACADEMIC_HEAD',
  'ACTIVITIES_HEAD',
]);

export const canCreateExecutiveContent = (role: string | null | undefined): boolean => (
  typeof role === 'string' && TASK_MANAGER_ROLES.has(role)
);

export const canManageTasks = (role: string | null | undefined): boolean => (
  typeof role === 'string' && TASK_MANAGER_ROLES.has(role)
);

export type StudentPortalTabId = 'activities' | 'tasks' | 'achievements' | 'suggestions' | 'messages' | 'application';

export interface StudentPortalTabOption {
  id: StudentPortalTabId;
  label: string;
}

export function studentPortalTabs(hasApplication: boolean): StudentPortalTabOption[] {
  const tabs: StudentPortalTabOption[] = [
    { id: 'activities', label: 'أنشطتي' },
    { id: 'tasks', label: 'المهام التطوعية' },
    { id: 'achievements', label: 'إنجازاتي ونقاطي' },
    { id: 'suggestions', label: 'الاقتراحات والمشاركات' },
    { id: 'messages', label: 'رسائلي وردود الإدارة' },
  ];
  return hasApplication ? [...tabs, { id: 'application', label: 'حالة الانضمام' }] : tabs;
}

const LEDGER_ROLE_LABELS: Record<string, string> = {
  PRESIDENT: 'رئيس الاتحاد',
  VICE_PRESIDENT: 'نائب الرئيس',
  MEDIA_HEAD: 'المسؤول الإعلامي',
  FINANCE_HEAD: 'المسؤول المالي',
  AUDIT_HEAD: 'مسؤول الرقابة والتفتيش',
  ACADEMIC_HEAD: 'المسؤول الأكاديمي',
  ACTIVITIES_HEAD: 'مسؤول الأنشطة',
};

export function ledgerCreatorPresentation(
  entry: Pick<RecentPointsLedgerEntry, 'createdByName' | 'createdByRole' | 'createdByIsSelf'>,
): string {
  if (entry.createdByIsSelf) return entry.createdByName ? `الطالب نفسه - ${entry.createdByName}` : 'الطالب نفسه';
  if (!entry.createdByName) return 'النظام';
  const role = entry.createdByRole ? LEDGER_ROLE_LABELS[entry.createdByRole] : null;
  return `${role ?? 'عضو الاتحاد'} - ${entry.createdByName}`;
}
