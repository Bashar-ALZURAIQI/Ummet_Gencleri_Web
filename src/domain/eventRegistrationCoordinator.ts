import type { StudentAccessState } from './studentAccess.ts';
import { canUseMemberFeatures } from './studentAccess.ts';
import type { EventRegistrationResult, ServiceResult } from './eventRegistrationGateway.ts';
import type { Student, UEvent, UserRole } from '../data/mockData.ts';

export interface EventRegistrationFlowResult {
  ok: boolean;
  error?: string;
}

export interface RegisterEventDependencies {
  currentStudent: Student | null;
  studentAccess: StudentAccessState;
  isConfirmedOwner: () => boolean;
  registerParticipation: (eventId: string) => Promise<ServiceResult<EventRegistrationResult>>;
  applyRegistrationUpdate: (eventId: string, isRegistered: boolean, registeredCount: number) => void;
}

export interface UnregisterEventDependencies {
  currentStudent: Student | null;
  studentAccess: StudentAccessState;
  isConfirmedOwner: () => boolean;
  unregisterParticipation: (eventId: string) => Promise<ServiceResult<EventRegistrationResult>>;
  applyRegistrationUpdate: (eventId: string, isRegistered: boolean, registeredCount: number) => void;
}

export interface HydrationOwnership {
  epoch: number;
  userId: string;
  role: UserRole;
}

export interface HydrateStudentEventsDependencies {
  target: HydrationOwnership;
  isOwnershipCurrent: (ownership: HydrationOwnership) => boolean;
  listRegisteredEventIds: () => Promise<ServiceResult<string[]>>;
  applyHydratedRegisteredEvents: (userId: string, eventIds: string[]) => void;
  onHydrationFailed?: (error: unknown) => void;
}

/**
 * Authoritative event registration workflow:
 * 1. Requires confirmed student identity.
 * 2. Requires canUseMemberFeatures(studentAccess) — pending/rejected/removed cannot register.
 * 3. Dispatches to server mutation.
 * 4. Verifies ownership is still active (prevents stale publishing).
 * 5. Applies server count directly — never e.registered + 1.
 */
export async function registerForEventWithAuthority(
  eventId: string,
  deps: RegisterEventDependencies,
): Promise<EventRegistrationFlowResult> {
  if (!deps.currentStudent) {
    return {
      ok: false,
      error: 'يجب تسجيل الدخول كطالب لتسجيل الحضور في الفعاليات.',
    };
  }

  if (!canUseMemberFeatures(deps.studentAccess)) {
    return {
      ok: false,
      error: 'التسجيل في الفعاليات متاح فقط للأعضاء المقبولين والنشطين.',
    };
  }

  if (!deps.isConfirmedOwner()) {
    return {
      ok: false,
      error: 'تعذر التحقق من هوية الحساب المعتمدة. سجّل الدخول مجدداً.',
    };
  }

  const result = await deps.registerParticipation(eventId);

  if (!deps.isConfirmedOwner()) {
    return {
      ok: false,
      error: 'تم تغيير الحساب أثناء استكمال عملية التسجيل.',
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      error: result.error.message || 'تعذر استكمال التسجيل في الفعالية.',
    };
  }

  deps.applyRegistrationUpdate(
    eventId,
    result.data.isRegistered,
    result.data.registeredCount,
  );

  return { ok: true };
}

/**
 * Authoritative event cancellation workflow:
 * 1. Requires confirmed student identity and eligible access.
 * 2. Dispatches cancellation to server.
 * 3. Verifies ownership is still active.
 * 4. Applies server count directly — never e.registered - 1.
 */
export async function unregisterFromEventWithAuthority(
  eventId: string,
  deps: UnregisterEventDependencies,
): Promise<EventRegistrationFlowResult> {
  if (!deps.currentStudent) {
    return {
      ok: false,
      error: 'يجب تسجيل الدخول كطالب لإلغاء التسجيل في الفعاليات.',
    };
  }

  if (!canUseMemberFeatures(deps.studentAccess)) {
    return {
      ok: false,
      error: 'إلغاء التسجيل في الفعاليات متاح فقط للأعضاء المقبولين والنشطين.',
    };
  }

  if (!deps.isConfirmedOwner()) {
    return {
      ok: false,
      error: 'تعذر التحقق من هوية الحساب المعتمدة. سجّل الدخول مجدداً.',
    };
  }

  const result = await deps.unregisterParticipation(eventId);

  if (!deps.isConfirmedOwner()) {
    return {
      ok: false,
      error: 'تم تغيير الحساب أثناء استكمال عملية إلغاء التسجيل.',
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      error: result.error.message || 'تعذر إلغاء التسجيل في الفعالية.',
    };
  }

  deps.applyRegistrationUpdate(
    eventId,
    result.data.isRegistered,
    result.data.registeredCount,
  );

  return { ok: true };
}

/**
 * Authoritatively populates confirmed student's registeredEvents from server.
 * Guards against stale publishing across auth epochs, account switches, and non-student roles.
 */
export async function hydrateStudentRegisteredEvents(
  deps: HydrateStudentEventsDependencies,
): Promise<boolean> {
  if (deps.target.role !== 'STUDENT') {
    return false;
  }

  if (!deps.isOwnershipCurrent(deps.target)) {
    return false;
  }

  const result = await deps.listRegisteredEventIds();

  // Re-check ownership after async call
  if (!deps.isOwnershipCurrent(deps.target)) {
    return false;
  }

  if (!result.ok) {
    deps.onHydrationFailed?.(result.error);
    return false;
  }

  deps.applyHydratedRegisteredEvents(deps.target.userId, result.data);
  return true;
}

/**
 * Pure state reducer mapping server event mutation results to UI state.
 * Sets registeredCount exactly to server response, eliminating client increment/decrement math.
 */
export function applyEventRegistrationToState(
  events: UEvent[],
  student: Student | null,
  eventId: string,
  isRegistered: boolean,
  authoritativeRegisteredCount: number,
): { updatedEvents: UEvent[]; updatedStudent: Student | null } {
  const updatedStudent: Student | null = student
    ? {
        ...student,
        registeredEvents: isRegistered
          ? (student.registeredEvents.includes(eventId) ? student.registeredEvents : [...student.registeredEvents, eventId])
          : student.registeredEvents.filter((id) => id !== eventId),
      }
    : null;

  const updatedEvents = events.map((event) =>
    event.id === eventId
      ? { ...event, registered: authoritativeRegisteredCount }
      : event,
  );

  return { updatedEvents, updatedStudent };
}
