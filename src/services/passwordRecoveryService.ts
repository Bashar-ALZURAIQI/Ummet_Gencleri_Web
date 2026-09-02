import { supabase } from '../lib/supabase.ts';
import {
  createPasswordRecoveryGateway,
  type PasswordRecoveryAuthClient,
} from '../domain/passwordRecovery.ts';

const passwordRecoveryGateway = createPasswordRecoveryGateway(
  supabase as unknown as PasswordRecoveryAuthClient,
);

export const requestPasswordReset = (email: string, redirectTo: string) => (
  passwordRecoveryGateway.requestReset(email, redirectTo)
);

export const updateRecoveredPassword = (password: string, recoveryAuthorized: boolean) => (
  passwordRecoveryGateway.updatePassword(password, recoveryAuthorized)
);

