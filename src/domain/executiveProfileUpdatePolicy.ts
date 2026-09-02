export interface ExecutiveProfileChanges {
  name?: unknown;
  email?: unknown;
  bio?: unknown;
  phone?: unknown;
  university?: unknown;
  major?: unknown;
  year?: unknown;
  role?: unknown;
  photo?: unknown;
}

export type OwnExecutiveProfileUpdate =
  | { ok: true; data: Record<string, string> }
  | { ok: false; code: 'OWN_PROFILE_ONLY' | 'NO_EDITABLE_FIELDS' };

const PROFILE_FIELDS: Array<[
  keyof ExecutiveProfileChanges,
  'name' | 'contactEmail' | 'bio' | 'phone' | 'university' | 'major' | 'year',
]> = [
  ['name', 'name'],
  ['email', 'contactEmail'],
  ['bio', 'bio'],
  ['phone', 'phone'],
  ['university', 'university'],
  ['major', 'major'],
  ['year', 'year'],
];

/**
 * Converts the old board form shape into the unified own-profile payload.
 * Authorization is UUID-only; office labels and avatar URLs are never profile writes.
 */
export function prepareOwnExecutiveProfileUpdate(input: {
  actorUserId: string;
  targetUserId: string;
  changes: ExecutiveProfileChanges;
}): OwnExecutiveProfileUpdate {
  if (!input.actorUserId || input.actorUserId !== input.targetUserId) {
    return { ok: false, code: 'OWN_PROFILE_ONLY' };
  }

  const data: Record<string, string> = {};
  for (const [source, target] of PROFILE_FIELDS) {
    const value = input.changes[source];
    if (typeof value === 'string') data[target] = value.trim();
  }
  return Object.keys(data).length > 0
    ? { ok: true, data }
    : { ok: false, code: 'NO_EDITABLE_FIELDS' };
}
