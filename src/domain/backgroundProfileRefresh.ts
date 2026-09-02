import type { UserRole } from '../data/mockData.ts';

export interface BackgroundProfileOwnership {
  authEpoch: number;
  userId: string;
}

interface BackgroundSession {
  user: { id: string };
}

interface BackgroundIdentity {
  currentUser: { userId: string; role: UserRole };
}

type LoadSessionResult<TSession extends BackgroundSession> =
  | { ok: true; session: TSession }
  | { ok: false };

type LoadIdentityResult<TIdentity extends BackgroundIdentity> =
  | { ok: true; identity: TIdentity }
  | { ok: false };

export type BackgroundProfileRefreshResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'stale' | 'session-failed' | 'account-mismatch' | 'identity-failed' | 'role-changed';
    };

export function createBackgroundProfileRefreshCoordinator() {
  let latestRequest = 0;

  return {
    invalidate(): void {
      latestRequest += 1;
    },

    async refresh<
      TSession extends BackgroundSession,
      TIdentity extends BackgroundIdentity,
    >(input: {
      ownership: BackgroundProfileOwnership;
      expectedRole: UserRole;
      isOwnershipCurrent: (ownership: BackgroundProfileOwnership) => boolean;
      loadSession: () => Promise<LoadSessionResult<TSession>>;
      loadIdentity: (session: TSession) => Promise<LoadIdentityResult<TIdentity>>;
      applyIdentity: (identity: TIdentity) => void;
    }): Promise<BackgroundProfileRefreshResult> {
      if (!input.isOwnershipCurrent(input.ownership)) {
        return { ok: false, reason: 'stale' };
      }

      const request = ++latestRequest;
      const isCurrent = () => request === latestRequest
        && input.isOwnershipCurrent(input.ownership);

      const sessionResult = await input.loadSession();
      if (!isCurrent()) return { ok: false, reason: 'stale' };
      if (!sessionResult.ok) return { ok: false, reason: 'session-failed' };
      if (sessionResult.session.user.id !== input.ownership.userId) {
        return { ok: false, reason: 'account-mismatch' };
      }

      const identityResult = await input.loadIdentity(sessionResult.session);
      if (!isCurrent()) return { ok: false, reason: 'stale' };
      if (!identityResult.ok) return { ok: false, reason: 'identity-failed' };
      if (identityResult.identity.currentUser.userId !== input.ownership.userId) {
        return { ok: false, reason: 'account-mismatch' };
      }
      if (identityResult.identity.currentUser.role !== input.expectedRole) {
        return { ok: false, reason: 'role-changed' };
      }

      input.applyIdentity(identityResult.identity);
      return { ok: true };
    },
  };
}
