export interface ExecutiveContentSnapshot {
  responsibilities: string[];
  stats: Array<{ label: string; value: string }>;
  members: Array<{ id: string; name: string; position: string; photo: string }>;
}

export interface ExecutiveEditDiffRow {
  key: 'responsibilities' | 'stats' | 'members';
  label: string;
  oldValue: string;
  newValue: string;
}

export const PROFILE_EDIT_SUBMITTED_MESSAGE =
  'تم إرسال طلب التعديل بنجاح وهو قيد انتظار موافقة رئيس الاتحاد';

const SNAPSHOT_KEYS = ['responsibilities', 'stats', 'members'] as const;
const STAT_KEYS = ['label', 'value'] as const;
const MEMBER_KEYS = ['id', 'name', 'position', 'photo'] as const;
const MAX_RESPONSIBILITIES = 50;
const MAX_STATS = 30;
const MAX_MEMBERS = 100;
const MAX_TEXT_LENGTH = 500;
const MAX_PHOTO_LENGTH = 2_048;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const normalizedText = (value: unknown, maxLength = MAX_TEXT_LENGTH): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
};

export function normalizeExecutiveContentSnapshot(value: unknown): ExecutiveContentSnapshot | null {
  if (!isRecord(value) || !hasExactKeys(value, SNAPSHOT_KEYS)) return null;
  if (!Array.isArray(value.responsibilities) || value.responsibilities.length > MAX_RESPONSIBILITIES) return null;
  if (!Array.isArray(value.stats) || value.stats.length > MAX_STATS) return null;
  if (!Array.isArray(value.members) || value.members.length > MAX_MEMBERS) return null;

  const responsibilities = value.responsibilities.map((item) => normalizedText(item));
  if (responsibilities.some((item) => item === null)) return null;

  const stats = value.stats.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, STAT_KEYS)) return null;
    const label = normalizedText(item.label);
    const statValue = normalizedText(item.value);
    return label && statValue ? { label, value: statValue } : null;
  });
  if (stats.some((item) => item === null)) return null;

  const members = value.members.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, MEMBER_KEYS)) return null;
    const id = normalizedText(item.id);
    const name = normalizedText(item.name);
    const position = normalizedText(item.position);
    if (typeof item.photo !== 'string' || item.photo.length > MAX_PHOTO_LENGTH) return null;
    return id && name && position ? { id, name, position, photo: item.photo.trim() } : null;
  });
  if (members.some((item) => item === null)) return null;

  const normalizedMembers = members as ExecutiveContentSnapshot['members'];
  if (new Set(normalizedMembers.map((member) => member.id)).size !== normalizedMembers.length) return null;

  return {
    responsibilities: responsibilities as string[],
    stats: stats as ExecutiveContentSnapshot['stats'],
    members: normalizedMembers,
  };
}

/**
 * Builds the edit-request DTO from the richer committee UI model. Personal
 * profile fields are discarded before strict validation and before upload.
 */
export function projectExecutiveContentSnapshot(value: unknown): ExecutiveContentSnapshot | null {
  if (!isRecord(value)
    || !Array.isArray(value.responsibilities)
    || !Array.isArray(value.stats)
    || !Array.isArray(value.members)) return null;

  return normalizeExecutiveContentSnapshot({
    responsibilities: value.responsibilities,
    stats: value.stats.map((item) => {
      const stat = isRecord(item) ? item : {};
      return { label: stat.label, value: stat.value };
    }),
    members: value.members.map((item) => {
      const member = isRecord(item) ? item : {};
      return {
        id: member.id,
        name: member.name,
        position: member.position,
        photo: member.photo,
      };
    }),
  });
}

const formatResponsibilities = (value: ExecutiveContentSnapshot['responsibilities']) => value.join('\n');
const formatStats = (value: ExecutiveContentSnapshot['stats']) => (
  value.map((item) => `${item.value} — ${item.label}`).join('\n')
);
const formatMembers = (value: ExecutiveContentSnapshot['members']) => (
  value.map((item) => `${item.name} — ${item.position}`).join('\n')
);

export function buildExecutiveEditDiff(
  baseValue: unknown,
  proposedValue: unknown,
): ExecutiveEditDiffRow[] {
  const base = normalizeExecutiveContentSnapshot(baseValue);
  const proposed = normalizeExecutiveContentSnapshot(proposedValue);
  if (!base || !proposed) return [];

  const candidates: ExecutiveEditDiffRow[] = [
    {
      key: 'responsibilities',
      label: 'المهام والمسؤوليات',
      oldValue: formatResponsibilities(base.responsibilities),
      newValue: formatResponsibilities(proposed.responsibilities),
    },
    {
      key: 'stats',
      label: 'الإحصائيات',
      oldValue: formatStats(base.stats),
      newValue: formatStats(proposed.stats),
    },
    {
      key: 'members',
      label: 'أعضاء اللجنة',
      oldValue: formatMembers(base.members),
      newValue: formatMembers(proposed.members),
    },
  ];
  return candidates.filter((row) => row.oldValue !== row.newValue);
}

export type ExecutiveRevisionResult =
  | { ok: true; value: ExecutiveContentSnapshot }
  | { ok: false; error: string };

export function applyExecutiveTextRevision(
  snapshotValue: unknown,
  revisionValue: unknown,
): ExecutiveRevisionResult {
  const snapshot = normalizeExecutiveContentSnapshot(snapshotValue);
  const revision = normalizeExecutiveContentSnapshot(revisionValue);
  if (!snapshot || !revision || snapshot.members.length !== revision.members.length) {
    return { ok: false, error: 'تعذر حفظ التعديل لأن بنية الطلب غير صالحة.' };
  }
  return {
    ok: true,
    value: {
      responsibilities: revision.responsibilities,
      stats: revision.stats,
      members: revision.members.map((member, index) => ({
        id: snapshot.members[index].id,
        name: member.name,
        position: member.position,
        photo: snapshot.members[index].photo,
      })),
    },
  };
}

export const buildEditDiffTableModel = (
  rows: Array<Pick<ExecutiveEditDiffRow, 'label' | 'oldValue' | 'newValue'> & { key?: string }>,
) => ({
  rows: rows.map((row) => ({
    key: row.key ?? row.label,
    label: row.label,
    oldValue: row.oldValue || '—',
    newValue: row.newValue || '—',
  })),
});

export const resolveExecutiveContentEditState = (
  input: { isPresident: boolean; hasPendingRequest: boolean },
) => input.isPresident || !input.hasPendingRequest
  ? { canEditContent: true as const, reason: null }
  : { canEditContent: false as const, reason: 'PENDING_APPROVAL' as const };
