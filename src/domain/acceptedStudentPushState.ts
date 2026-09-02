import type { StudentAccessState } from './studentAccess.ts';
import type { PushCapability } from './webPushClient.ts';

export type AcceptedStudentPushState =
  | { kind: 'hidden' }
  | { kind: 'checking' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'ios-install-required'; reason: string }
  | { kind: 'denied'; reason: string }
  | { kind: 'ready' }
  | { kind: 'enabling' }
  | { kind: 'enabled' }
  | { kind: 'disabling' }
  | { kind: 'error'; message: string };

export type AcceptedStudentPushEvent =
  | { type: 'CHECKING' }
  | { type: 'CAPABILITY_RESOLVED'; capability: PushCapability; hasSubscription: boolean }
  | { type: 'ENABLE_STARTED' }
  | { type: 'ENABLE_SUCCEEDED' }
  | { type: 'DISABLE_STARTED' }
  | { type: 'DISABLE_SUCCEEDED' }
  | { type: 'PERMISSION_DENIED'; message: string }
  | { type: 'FAILED'; message: string }
  | { type: 'RETRY' };

export function initialAcceptedStudentPushState(
  access: StudentAccessState,
  capability: PushCapability,
  hasSubscription: boolean,
): AcceptedStudentPushState {
  if (access !== 'accepted') return { kind: 'hidden' };
  if (capability.kind === 'unsupported') return capability;
  if (capability.kind === 'ios-install-required') return capability;
  if (capability.kind === 'denied') return capability;
  return hasSubscription ? { kind: 'enabled' } : { kind: 'ready' };
}

export function reduceAcceptedStudentPushState(
  state: AcceptedStudentPushState,
  event: AcceptedStudentPushEvent,
): AcceptedStudentPushState {
  switch (event.type) {
    case 'CHECKING': return { kind: 'checking' };
    case 'CAPABILITY_RESOLVED':
      return initialAcceptedStudentPushState('accepted', event.capability, event.hasSubscription);
    case 'ENABLE_STARTED': return { kind: 'enabling' };
    case 'ENABLE_SUCCEEDED': return { kind: 'enabled' };
    case 'DISABLE_STARTED': return { kind: 'disabling' };
    case 'DISABLE_SUCCEEDED': return { kind: 'ready' };
    case 'PERMISSION_DENIED': return { kind: 'denied', reason: event.message };
    case 'FAILED': return { kind: 'error', message: event.message };
    case 'RETRY': return state.kind === 'error' ? { kind: 'ready' } : state;
  }
}
