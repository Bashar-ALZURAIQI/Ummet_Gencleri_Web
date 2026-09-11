import { isLeadershipRole, type CommitteeId, type UserRole } from '../data/mockData.ts';

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

/**
 * Institutional content authority for a committee. The president governs every
 * committee; any other leadership role governs only their own assigned one.
 * Students and assignment-less actors can never manage committee content.
 */
export function canManageCouncilContent(
  owner: { role: UserRole; committee?: CommitteeId },
  committeeId: CommitteeId,
): boolean {
  return owner.role === 'PRESIDENT'
    || (isLeadershipRole(owner.role) && owner.committee === committeeId);
}

export function resolveOwnExecutiveProfileTarget(
  owner: { userId: string; role: UserRole; committee?: CommitteeId },
  committeeId: CommitteeId,
): string | null {
  return owner.userId
    && isLeadershipRole(owner.role)
    && owner.committee === committeeId
    ? owner.userId
    : null;
}

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
