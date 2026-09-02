export type SignupResultInput = {
  user: {
    id?: string | null;
    identities?: readonly unknown[] | null;
  } | null;
  session: unknown | null;
  error: unknown | null;
};

export type SignupResult =
  | { kind: 'failure' }
  | { kind: 'existing-or-disguised' }
  | { kind: 'confirmation-required'; userId: string }
  | { kind: 'signed-in'; userId: string };

/**
 * Supabase can deliberately return an obfuscated User with no identities when
 * email confirmation is enabled and an email is already registered. Such a
 * response is not evidence that a new Auth row (and its trigger data) exists.
 */
export function classifySignupResult(input: SignupResultInput): SignupResult {
  if (input.error || !input.user?.id) return { kind: 'failure' };
  if (Array.isArray(input.user.identities) && input.user.identities.length === 0) {
    return { kind: 'existing-or-disguised' };
  }
  return input.session
    ? { kind: 'signed-in', userId: input.user.id }
    : { kind: 'confirmation-required', userId: input.user.id };
}
