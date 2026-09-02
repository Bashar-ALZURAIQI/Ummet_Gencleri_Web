/**
 * Shared defensive helpers for the profile / committee-edit screens.
 *
 * The app persists data to LocalStorage through `stripBlankValues`, which
 * DELETES empty-string fields. That means reloaded records can be missing
 * keys like `email`, `phone`, `major`, ... and naive `.toLowerCase()` /
 * `.map()` / `.join()` calls on them crash the UI (ErrorBoundary).
 *
 * Every helper below guarantees a string / array / object exists, so the
 * profile, board and committee screens can render safely even with
 * partial or corrupt persisted data.
 */

/** Unified fallback shape used by the profile editors. */
export interface SafeProfile {
  name: string;
  /** Legacy display alias. Never use for authorization or profile writes. */
  email: string;
  /** Immutable Supabase Auth login email. */
  loginEmail: string;
  /** Editable public/contact address. */
  contactEmail: string;
  phone: string;
  university: string;
  /** Maps to `major` in the members/board data model. */
  department: string;
  /** Maps to `year` in the members/board data model. */
  academicYear: string;
  role: string;
  bio: string;
  /** A legacy/public image URL used for display only. */
  photo: string;
  /** Supabase Storage object path, kept separate from its public URL. */
  avatarPath: string;
  updatedAt: string;
  vision: string;
  goals: string;
}

export const EMPTY_PROFILE: SafeProfile = {
  name: '',
  email: '',
  loginEmail: '',
  contactEmail: '',
  phone: '',
  university: '',
  department: '',
  academicYear: '',
  role: '',
  bio: '',
  photo: '',
  avatarPath: '',
  updatedAt: '',
  vision: '',
  goals: '',
};

/** Coerce anything (string, number, null, missing) into a safe string. */
export const safeStr = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

/** Coerce any value into a lowercased comparison key without throwing. */
export const emailKey = (value: unknown): string => safeStr(value).trim().toLowerCase();

/**
 * Resolve the president's editable display name from persisted application data.
 * The executive-board record is authoritative, the unified member is its
 * fallback, and the bundled demo name is used only for a brand-new install.
 */
export const resolvePresidentName = (
  executiveName: unknown,
  memberName: unknown,
  defaultName: unknown,
): string =>
  safeStr(executiveName).trim()
  || safeStr(memberName).trim()
  || safeStr(defaultName).trim();

export interface PresidentIdentityInput {
  executiveName: unknown;
  memberName: unknown;
  defaultName: unknown;
  masterEmail: string;
  presidentRole: string;
  presidentRoleLabel: string;
  committee: string;
}

/** Build the canonical identity mirrored into board, member, and session stores. */
export const resolvePresidentIdentity = (input: PresidentIdentityInput) => {
  const name = resolvePresidentName(input.executiveName, input.memberName, input.defaultName);
  return {
    name,
    executive: { name, email: input.masterEmail, role: input.presidentRoleLabel },
    member: {
      name,
      email: input.masterEmail,
      role: input.presidentRole,
      committee: input.committee,
      status: 'active' as const,
    },
    session: { name, email: input.masterEmail, role: input.presidentRole, committee: input.committee },
  };
};

/** Coerce any value into an array (guards `.map()` / `.find()` / `.some()`). */
export const safeArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Coerce any value into a plain object (guards field reads). */
export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Read a field from an arbitrary object-like value without throwing. */
export const getField = (value: unknown, key: string): unknown => asRecord(value)[key];

/**
 * Merge a raw user record (from currentUser / app_members / committeeData)
 * with the unified fallback object, guaranteeing every field exists.
 * Both the app's `major`/`year` and the external `department`/`academicYear`
 * naming conventions are accepted.
 */
export function normalizeProfile(raw: object | null | undefined): SafeProfile {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    name: safeStr(r.name),
    email: safeStr(r.email),
    loginEmail: safeStr(r.loginEmail) || safeStr(r.email),
    contactEmail: safeStr(r.contactEmail),
    phone: safeStr(r.phone),
    university: safeStr(r.university),
    department: safeStr(r.department) || safeStr(r.major),
    academicYear: safeStr(r.academicYear) || safeStr(r.year),
    role: safeStr(r.role),
    bio: safeStr(r.bio),
    photo: safeStr(r.photo),
    avatarPath: safeStr(r.avatarPath),
    updatedAt: safeStr(r.updatedAt),
    vision: safeStr(r.vision),
    goals: safeStr(r.goals),
  };
}

/** try-catch JSON.parse wrapper — never throws on corrupt LocalStorage. */
export function safeParse<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
