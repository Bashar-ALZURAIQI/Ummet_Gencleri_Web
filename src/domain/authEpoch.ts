export interface AuthTimerScheduler<Handle> {
  schedule(callback: () => void): Handle;
  cancel(handle: Handle): void;
}

export type AuthEventAction = 'clear' | 'refresh' | 'ignore';

export function classifyAuthEvent(event: string, hasSession: boolean): AuthEventAction {
  if (event === 'SIGNED_OUT') return 'clear';
  if (!hasSession) return 'ignore';

  switch (event) {
    case 'INITIAL_SESSION':
    case 'PASSWORD_RECOVERY':
    case 'SIGNED_IN':
    case 'TOKEN_REFRESHED':
    case 'USER_UPDATED':
    case 'MFA_CHALLENGE_VERIFIED':
      return 'refresh';
    default:
      return 'ignore';
  }
}

export function resolveOwnedOperationEpoch<SessionIdentity extends object>(input: {
  controller: { isCurrent(epoch: number): boolean };
  operationEpoch: number;
  operationSession: SessionIdentity | null;
  latestEvent: { epoch: number; session: SessionIdentity | null } | null;
}): number | null {
  if (input.controller.isCurrent(input.operationEpoch)) return input.operationEpoch;

  // Supabase Auth passes the same Session object to its synchronous SIGNED_IN
  // notification and to the completed signIn/signUp response. UUID equality is
  // intentionally insufficient: a later refresh/update for the same user owns
  // its own epoch and session object.
  if (
    input.operationSession !== null
    && input.latestEvent?.session === input.operationSession
    && input.controller.isCurrent(input.latestEvent.epoch)
  ) {
    return input.latestEvent.epoch;
  }

  return null;
}

/**
 * Owns the lifetime of asynchronous Auth work. Replacing an epoch cancels all
 * deferred work, while the epoch check also protects work that has already
 * crossed an async boundary and can no longer be cancelled.
 */
export class AuthEpochController<Handle> {
  private epoch = 0;
  private active = false;
  private eventsSuspended = false;
  private readonly pending = new Set<Handle>();
  private readonly scheduler: AuthTimerScheduler<Handle>;

  constructor(scheduler: AuthTimerScheduler<Handle>) {
    this.scheduler = scheduler;
  }

  activate(): number {
    this.cancelPending();
    this.active = true;
    this.eventsSuspended = false;
    return ++this.epoch;
  }

  beginOperation(): number {
    this.cancelPending();
    this.active = true;
    this.eventsSuspended = false;
    return ++this.epoch;
  }

  beginEvent(): number | null {
    if (!this.active || this.eventsSuspended) return null;
    this.cancelPending();
    return ++this.epoch;
  }

  /**
   * Captures the active Auth owner without advancing it or cancelling any of
   * its scheduled work. Long-running non-Auth operations must retain this
   * exact value and prove it is still current before applying their result.
   */
  capture(): number | null {
    return this.active ? this.epoch : null;
  }

  isCurrent(capturedEpoch: number): boolean {
    return this.active && capturedEpoch === this.epoch;
  }

  schedule(capturedEpoch: number | null, callback: () => void): boolean {
    if (capturedEpoch === null || !this.isCurrent(capturedEpoch)) return false;

    const handle = this.scheduler.schedule(() => {
      this.pending.delete(handle);
      if (this.isCurrent(capturedEpoch)) callback();
    });
    this.pending.add(handle);
    return true;
  }

  cancelScheduled(capturedEpoch: number): boolean {
    if (!this.isCurrent(capturedEpoch)) return false;
    this.cancelPending();
    return true;
  }

  invalidate(): number {
    this.cancelPending();
    return ++this.epoch;
  }

  suspendEvents(): number {
    this.eventsSuspended = true;
    return this.invalidate();
  }

  allowEvents(): void {
    if (this.active) this.eventsSuspended = false;
  }

  dispose(): void {
    this.cancelPending();
    this.active = false;
    this.eventsSuspended = true;
    this.epoch += 1;
  }

  private cancelPending(): void {
    for (const handle of this.pending) this.scheduler.cancel(handle);
    this.pending.clear();
  }
}
