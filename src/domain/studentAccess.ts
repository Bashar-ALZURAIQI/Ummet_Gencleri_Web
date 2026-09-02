import type { ApplicationStatus } from '../data/mockData.ts';

export type StudentAccessState =
  | 'loading'
  | 'pending'
  | 'interview'
  | 'accepted'
  | 'rejected'
  | 'removed';

export interface StudentAccessInput {
  profileStatus: 'active' | 'inactive' | 'removed' | 'banned' | null | undefined;
  applicationStatus: ApplicationStatus | null | undefined;
  applicationsLoading: boolean;
}

export function resolveStudentAccess(input: StudentAccessInput): StudentAccessState {
  if (input.profileStatus === 'removed' || input.profileStatus === 'banned') return 'removed';
  if (input.applicationsLoading) return 'loading';
  if (input.profileStatus === 'active' && input.applicationStatus === 'accepted') return 'accepted';
  if (input.applicationStatus === 'interview') return 'interview';
  if (input.applicationStatus === 'rejected') return 'rejected';
  return 'pending';
}

export const canUseMemberFeatures = (state: StudentAccessState): boolean => state === 'accepted';

export type EventRegistrationAction = 'login' | 'locked' | 'unregister' | 'full' | 'register';

export function resolveEventRegistrationAction(input: {
  hasStudent: boolean;
  access: StudentAccessState;
  isRegistered: boolean;
  isFull: boolean;
}): EventRegistrationAction {
  if (!input.hasStudent) return 'login';
  if (!canUseMemberFeatures(input.access)) return 'locked';
  if (input.isRegistered) return 'unregister';
  if (input.isFull) return 'full';
  return 'register';
}
