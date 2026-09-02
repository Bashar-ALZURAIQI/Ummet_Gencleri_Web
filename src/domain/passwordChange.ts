interface UserLike {
  id: string;
  email?: string;
}

interface SessionLike {
  user: UserLike;
}

interface AuthErrorLike {
  code?: string;
}

interface MainPasswordClient {
  auth: {
    getSession(): Promise<{
      data: { session: SessionLike | null };
      error: AuthErrorLike | null;
    }>;
  };
}

interface VerificationClient {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Promise<{
      data: { user: UserLike | null; session: SessionLike | null };
      error: AuthErrorLike | null;
    }>;
    updateUser(attributes: { password: string }): Promise<{
      data: { user: UserLike | null };
      error: AuthErrorLike | null;
    }>;
    signOut(options: { scope: 'local' }): Promise<{ error: AuthErrorLike | null }>;
  };
}

export type PasswordChangeExecutionResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      code:
        | 'PASSWORD_REQUIRED'
        | 'SESSION_LOAD_FAILED'
        | 'SESSION_OWNER_MISMATCH'
        | 'SESSION_EMAIL_MISMATCH'
        | 'CURRENT_PASSWORD_INVALID'
        | 'REAUTHENTICATED_USER_MISMATCH'
        | 'PASSWORD_UPDATE_FAILED';
    };

export async function executePasswordChange(input: {
  loginEmail: string;
  expectedUserId: string;
  currentPassword: string;
  newPassword: string;
  mainClient: MainPasswordClient;
  createVerificationClient: () => VerificationClient;
}): Promise<PasswordChangeExecutionResult> {
  if (!input.currentPassword || !input.newPassword) {
    return { ok: false, code: 'PASSWORD_REQUIRED' };
  }

  let mainSession: SessionLike | null;
  try {
    const sessionResponse = await input.mainClient.auth.getSession();
    if (sessionResponse.error || !sessionResponse.data.session) {
      return { ok: false, code: 'SESSION_LOAD_FAILED' };
    }
    mainSession = sessionResponse.data.session;
  } catch {
    return { ok: false, code: 'SESSION_LOAD_FAILED' };
  }

  const sessionUser = mainSession.user;
  const sessionEmail = sessionUser.email;
  if (!sessionUser.id || sessionUser.id !== input.expectedUserId) {
    return { ok: false, code: 'SESSION_OWNER_MISMATCH' };
  }
  if (!sessionEmail || sessionEmail.toLowerCase() !== input.loginEmail.trim().toLowerCase()) {
    return { ok: false, code: 'SESSION_EMAIL_MISMATCH' };
  }

  let verificationClient: VerificationClient;
  try {
    verificationClient = input.createVerificationClient();
  } catch {
    return { ok: false, code: 'CURRENT_PASSWORD_INVALID' };
  }

  try {
    let verification;
    try {
      verification = await verificationClient.auth.signInWithPassword({
        email: sessionEmail,
        password: input.currentPassword,
      });
    } catch {
      return { ok: false, code: 'CURRENT_PASSWORD_INVALID' };
    }
    if (verification.error || !verification.data.user || !verification.data.session) {
      return { ok: false, code: 'CURRENT_PASSWORD_INVALID' };
    }
    if (
      verification.data.user.id !== input.expectedUserId
      || verification.data.session.user.id !== input.expectedUserId
    ) {
      return { ok: false, code: 'REAUTHENTICATED_USER_MISMATCH' };
    }

    try {
      const update = await verificationClient.auth.updateUser({ password: input.newPassword });
      if (update.error || update.data.user?.id !== input.expectedUserId) {
        return { ok: false, code: 'PASSWORD_UPDATE_FAILED' };
      }
      return { ok: true, userId: input.expectedUserId };
    } catch {
      return { ok: false, code: 'PASSWORD_UPDATE_FAILED' };
    }
  } finally {
    try {
      await verificationClient.auth.signOut({ scope: 'local' });
    } catch {
      // The isolated client does not persist and has no auto-refresh. Cleanup
      // failure must not change the already-confirmed main-client outcome.
    }
  }
}
