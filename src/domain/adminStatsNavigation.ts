import { isLeadershipRole, type UserRole } from '../data/mockData.ts';

export type AdminTab =
  | 'stats'
  | 'board'
  | 'pending-edits'
  | 'site-pending'
  | 'branding'
  | 'history'
  | 'events'
  | 'gallery'
  | 'news'
  | 'members'
  | 'applications'
  | 'inbox'
  | 'plans'
  | 'suggestions'
  | 'guide-suggestions'
  | 'excuses'
  | 'oversight'
  | 'task-management'
  | 'member-points'
  | 'profile';

export type StatCardId =
  | 'totalStudents'
  | 'activeStudents'
  | 'upcomingEvents'
  | 'pendingApplications';

export interface StatCardNavigationResult {
  canNavigate: boolean;
  targetTab?: AdminTab;
  initialFilter?: 'all' | 'active';
}

export interface StatCardAffordance {
  isClickable: boolean;
  cursorClass: string;
  showChevron: boolean;
}

/**
 * Evaluates whether a given user role can access the specified admin tab.
 * Strictly enforces current AdminDashboard tab-access RBAC.
 */
export function canRoleAccessTab(tab: AdminTab, role: UserRole | undefined | null): boolean {
  if (!role) return false;

  switch (tab) {
    case 'members':
    case 'applications':
    case 'pending-edits':
    case 'site-pending':
    case 'branding':
      return role === 'PRESIDENT';

    case 'stats':
    case 'history':
    case 'events':
    case 'gallery':
    case 'suggestions':
    case 'profile':
      return isLeadershipRole(role);

    default:
      // For tabs governed by special section guards, fall back to leadership check
      return isLeadershipRole(role);
  }
}

/**
 * Returns role-aware navigation configuration for top statistics cards.
 * If the role lacks permissions for the target tab, returns canNavigate = false,
 * rendering the card strictly informational without click handlers or pointer affordance.
 */
export function getStatCardNavigation(
  cardId: StatCardId,
  role: UserRole | undefined | null,
): StatCardNavigationResult {
  switch (cardId) {
    case 'totalStudents': {
      if (canRoleAccessTab('members', role)) {
        return {
          canNavigate: true,
          targetTab: 'members',
          initialFilter: 'all',
        };
      }
      return { canNavigate: false };
    }

    case 'activeStudents': {
      if (canRoleAccessTab('members', role)) {
        return {
          canNavigate: true,
          targetTab: 'members',
          initialFilter: 'active',
        };
      }
      return { canNavigate: false };
    }

    case 'upcomingEvents': {
      if (canRoleAccessTab('events', role)) {
        return {
          canNavigate: true,
          targetTab: 'events',
        };
      }
      return { canNavigate: false };
    }

    case 'pendingApplications': {
      if (canRoleAccessTab('applications', role)) {
        return {
          canNavigate: true,
          targetTab: 'applications',
        };
      }
      return { canNavigate: false };
    }

    default:
      return { canNavigate: false };
  }
}

/**
 * Derives UI affordance attributes for a stat card based on navigation eligibility.
 */
export function getStatCardAffordance(navResult: StatCardNavigationResult): StatCardAffordance {
  return {
    isClickable: navResult.canNavigate,
    cursorClass: navResult.canNavigate
      ? 'cursor-pointer hover:border-navy-200 transition-colors'
      : 'cursor-default',
    showChevron: navResult.canNavigate,
  };
}
