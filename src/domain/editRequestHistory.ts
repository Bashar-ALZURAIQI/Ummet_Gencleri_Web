import {
  COMMITTEE_ROLE,
  ROLE_LABEL,
  type BoardMember,
  type CommitteeId,
  type CommitteeMember,
  type EditsHistoryEntry,
  type PendingProfileEdit,
  type PendingSiteEdit,
  type ProfileEditDiff,
  type SiteEditDiff,
  type SiteEditOp,
  type SiteEditSubmit,
  type SiteEditTarget,
  type UserRole,
} from '../data/mockData.ts';
import {
  canonicalizeSiteEditSubmit,
  isStrictProfileSnapshot,
  isStrictSitePayload,
} from './editApprovalPolicy.ts';
import {
  buildExecutiveEditDiff,
  normalizeExecutiveContentSnapshot,
  type ExecutiveContentSnapshot,
} from './executiveEditWorkflow.ts';

export interface PersistedEditRequestRecord {
  id: string;
  submittedByUserId: string | null;
  submittedRole: string;
  committeeKey: string | null;
  editType: string;
  originalText: string | null;
  proposedText: string;
  status: 'pending' | 'approved' | 'rejected';
  decisionNote: string | null;
  reviewedByUserId: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  profileBaseSnapshot?: ExecutiveContentSnapshot;
  profileProposedSnapshot?: ExecutiveContentSnapshot;
  profilePayloadVersion?: number;
}

interface EnvelopeDisplay {
  applicantName: string;
  applicantEmail?: string;
}

export interface ProfileEditEnvelope {
  version: 1;
  kind: 'profile';
  display: EnvelopeDisplay;
  payload: {
    committeeId: CommitteeId;
    snapshot: PendingProfileEdit['snapshot'];
    summary: ProfileEditDiff[];
  };
}

export interface SiteEditEnvelope {
  version: 1;
  kind: 'site';
  display: EnvelopeDisplay;
  payload: SiteEditSubmit;
}

export type EditRequestEnvelope = ProfileEditEnvelope | SiteEditEnvelope;

export interface EditedApprovalNote {
  version: 1;
  kind: 'edited-approval';
  revisedDiffs: SiteEditDiff[];
}

type ProfileEnvelopeInput = {
  committeeId: CommitteeId;
  snapshot: PendingProfileEdit['snapshot'] & { head?: BoardMember };
  summary: ProfileEditDiff[];
} & EnvelopeDisplay;
type SiteEnvelopeInput = SiteEditSubmit & EnvelopeDisplay;

const COMMITTEE_IDS = new Set<CommitteeId>([
  'presidency',
  'vice-presidency',
  'media',
  'academic',
  'supervisory',
  'activities',
  'finance',
]);
const SITE_TARGETS = new Set<SiteEditTarget>([
  'site',
  'about',
  'programsContent',
  'events',
  'galleryAlbums',
  'galleryCategories',
  'guideSections',
  'guideQuickInfo',
  'faqCategories',
  'contactCards',
  'contactMap',
  'news',
]);
const SITE_OPS = new Set<SiteEditOp>(['add', 'update', 'delete', 'set']);
const USER_ROLES = new Set<UserRole>([
  'PRESIDENT',
  'VICE_PRESIDENT',
  'MEDIA_HEAD',
  'FINANCE_HEAD',
  'AUDIT_HEAD',
  'ACADEMIC_HEAD',
  'ACTIVITIES_HEAD',
  'STUDENT',
]);

const recordOf = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => (
  Object.keys(value).every((key) => keys.includes(key))
);

const stringOf = (value: unknown): string => typeof value === 'string' ? value : '';
const optionalStringOf = (value: unknown): string | undefined => {
  const valueString = stringOf(value).trim();
  return valueString || undefined;
};

const isSafePropertyPath = (value: string): boolean => {
  if (!value) return false;
  const segments = value.split('.');
  return segments.every((segment) => (
    /^[A-Za-z0-9_-]+$/.test(segment)
    && segment !== '__proto__'
    && segment !== 'prototype'
    && segment !== 'constructor'
  ));
};

const parseJsonRecord = (text: string | null | undefined): Record<string, unknown> | null => {
  if (!text) return null;
  try {
    return recordOf(JSON.parse(text));
  } catch {
    return null;
  }
};

const normalizeDiffs = (value: unknown): SiteEditDiff[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const row = recordOf(candidate);
    if (!row) return [];
    const label = stringOf(row.label);
    const oldValue = stringOf(row.oldValue);
    const newValue = stringOf(row.newValue);
    if (!label) return [];
    const path = optionalStringOf(row.path);
    if (path && !isSafePropertyPath(path)) return [];
    return [{
      label,
      oldValue,
      newValue,
      ...(path ? { path } : {}),
      ...(typeof row.editable === 'boolean' ? { editable: row.editable } : {}),
    }];
  });
};

const normalizeProfileDiffs = (value: unknown): ProfileEditDiff[] => (
  normalizeDiffs(value).map(({ label, oldValue, newValue }) => ({ label, oldValue, newValue }))
);

const normalizeHead = (): BoardMember => ({
  id: '',
  name: '',
  role: '',
  bio: '',
  email: '',
  photo: '',
});

const normalizeMembers = (value: unknown): CommitteeMember[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const row = recordOf(candidate);
    if (!row) return [];
    const id = stringOf(row.id);
    const name = stringOf(row.name);
    const position = stringOf(row.position);
    if (!id || !name) return [];
    return [{ id, name, position, photo: stringOf(row.photo) }];
  });
};

const normalizeProfileSnapshot = (value: unknown): PendingProfileEdit['snapshot'] | null => {
  const snapshot = recordOf(value);
  if (!snapshot) return null;
  const responsibilities = Array.isArray(snapshot.responsibilities)
    ? snapshot.responsibilities.filter((item): item is string => typeof item === 'string')
    : [];
  const stats = Array.isArray(snapshot.stats)
    ? snapshot.stats.flatMap((candidate) => {
        const row = recordOf(candidate);
        if (!row) return [];
        const label = stringOf(row.label);
        const valueString = stringOf(row.value);
        return label ? [{ label, value: valueString }] : [];
      })
    : [];
  return {
    // Profile identity is never applied from an approval payload. The authenticated
    // owner updates those fields through the own-profile service instead.
    responsibilities,
    stats,
    members: normalizeMembers(snapshot.members),
  };
};

const normalizeDisplay = (value: unknown): EnvelopeDisplay | null => {
  const display = recordOf(value);
  if (!display) return null;
  const applicantName = stringOf(display.applicantName);
  if (!applicantName) return null;
  const applicantEmail = optionalStringOf(display.applicantEmail);
  return { applicantName, ...(applicantEmail ? { applicantEmail } : {}) };
};

const parseLooseProfileDisplay = (text: string): EnvelopeDisplay | null => {
  const root = parseJsonRecord(text);
  return root?.kind === 'profile' && root.version === 1 ? normalizeDisplay(root.display) : null;
};

const normalizeNested = (value: unknown): SiteEditSubmit['nested'] => {
  const nested = recordOf(value);
  if (!nested) return undefined;
  const parentField = stringOf(nested.parentField);
  const itemId = stringOf(nested.itemId);
  if (!parentField || !itemId || !isSafePropertyPath(parentField) || parentField.includes('.')) return undefined;
  return {
    parentField,
    itemId,
    ...(typeof nested.remove === 'boolean' ? { remove: nested.remove } : {}),
  };
};

const normalizeSitePayload = (value: unknown): SiteEditSubmit | null => {
  if (!isStrictSitePayload(value)) return null;
  const payload = recordOf(value);
  if (!payload) return null;
  const pageId = stringOf(payload.pageId);
  const pageLabel = stringOf(payload.pageLabel);
  const sectionLabel = stringOf(payload.sectionLabel);
  const target = stringOf(payload.target) as SiteEditTarget;
  const op = stringOf(payload.op) as SiteEditOp;
  const diffs = normalizeDiffs(payload.diffs);
  const path = optionalStringOf(payload.path);
  if (
    !pageId
    || !pageLabel
    || !sectionLabel
    || !SITE_TARGETS.has(target)
    || !SITE_OPS.has(op)
    || diffs.length === 0
    || (path !== undefined && !isSafePropertyPath(path))
    || (op === 'set' && (!path || (target !== 'site' && target !== 'about')))
  ) {
    return null;
  }
  const nested = normalizeNested(payload.nested);
  const normalized: SiteEditSubmit = {
    pageId,
    pageLabel,
    sectionLabel,
    target,
    op,
    ...(optionalStringOf(payload.recordId) ? { recordId: optionalStringOf(payload.recordId) } : {}),
    ...(path ? { path } : {}),
    ...(nested ? { nested } : {}),
    diffs,
  };
  const canonical = canonicalizeSiteEditSubmit(normalized);
  return canonical.ok ? canonical.value : null;
};

export function createProfileEditEnvelope(input: ProfileEnvelopeInput): string {
  return JSON.stringify({
    version: 1,
    kind: 'profile',
    display: {
      applicantName: input.applicantName,
      ...(input.applicantEmail ? { applicantEmail: input.applicantEmail } : {}),
    },
    payload: {
      committeeId: input.committeeId,
      snapshot: {
        head: normalizeHead(),
        responsibilities: input.snapshot.responsibilities,
        stats: input.snapshot.stats,
        members: input.snapshot.members,
      },
      summary: input.summary,
    },
  });
}

export function createSiteEditEnvelope(input: SiteEnvelopeInput): string {
  const { applicantName, applicantEmail } = input;
  const visiblePayload: SiteEditSubmit = {
    pageId: input.pageId,
    pageLabel: input.pageLabel,
    sectionLabel: input.sectionLabel,
    target: input.target,
    op: input.op,
    ...(input.recordId ? { recordId: input.recordId } : {}),
    ...(input.path ? { path: input.path } : {}),
    ...(input.nested ? { nested: input.nested } : {}),
    diffs: input.diffs,
  };
  const canonical = canonicalizeSiteEditSubmit(visiblePayload);
  if (!canonical.ok) throw new Error(canonical.error);
  return JSON.stringify({
    version: 1,
    kind: 'site',
    display: {
      applicantName,
      ...(applicantEmail ? { applicantEmail } : {}),
    },
    payload: canonical.value,
  } satisfies SiteEditEnvelope);
}

export function parseEditRequestEnvelope(text: string): EditRequestEnvelope | null {
  const root = parseJsonRecord(text);
  if (!root || root.version !== 1) return null;
  const display = normalizeDisplay(root.display);
  if (!display) return null;

  if (root.kind === 'site') {
    const payload = normalizeSitePayload(root.payload);
    return payload ? { version: 1, kind: 'site', display, payload } : null;
  }
  if (root.kind === 'profile') {
    const payload = recordOf(root.payload);
    const committeeId = stringOf(payload?.committeeId) as CommitteeId;
    if (!payload || !hasOnlyKeys(payload, ['committeeId', 'snapshot', 'summary']) || !isStrictProfileSnapshot(payload.snapshot)) return null;
    const snapshot = normalizeProfileSnapshot(payload?.snapshot);
    const summary = normalizeProfileDiffs(payload?.summary);
    if (!COMMITTEE_IDS.has(committeeId) || !snapshot || summary.length === 0) return null;
    return {
      version: 1,
      kind: 'profile',
      display,
      payload: { committeeId, snapshot, summary },
    };
  }
  return null;
}

export function createEditedApprovalNote(revisedDiffs: SiteEditDiff[]): string {
  return JSON.stringify({ version: 1, kind: 'edited-approval', revisedDiffs } satisfies EditedApprovalNote);
}

export function parseEditedApprovalNote(text: string | null | undefined): EditedApprovalNote | null {
  const root = parseJsonRecord(text);
  if (!root || root.version !== 1 || root.kind !== 'edited-approval') return null;
  const revisedDiffs = normalizeDiffs(root.revisedDiffs);
  return revisedDiffs.length > 0 ? { version: 1, kind: 'edited-approval', revisedDiffs } : null;
}

const profileStatus = (status: PersistedEditRequestRecord['status']): PendingProfileEdit['status'] => (
  status === 'pending' ? 'PENDING_APPROVAL' : status === 'approved' ? 'APPROVED' : 'REJECTED'
);

const siteStatus = (status: PersistedEditRequestRecord['status']): PendingSiteEdit['status'] => (
  status === 'pending' ? 'PENDING_PRESIDENT_APPROVAL' : status === 'approved' ? 'APPROVED' : 'REJECTED'
);

const roleLabel = (role: string): string => (
  USER_ROLES.has(role as UserRole) ? ROLE_LABEL[role as UserRole] : role
);

export function mapEditRequestToProfileEdit(request: PersistedEditRequestRecord): PendingProfileEdit | null {
  const envelope = parseEditRequestEnvelope(request.proposedText);
  const looseDisplay = parseLooseProfileDisplay(request.proposedText);
  const committeeId = request.committeeKey as CommitteeId;
  if (!COMMITTEE_IDS.has(committeeId) || COMMITTEE_ROLE[committeeId] !== request.submittedRole) {
    return null;
  }
  const structuredBase = normalizeExecutiveContentSnapshot(request.profileBaseSnapshot);
  const structuredProposed = normalizeExecutiveContentSnapshot(request.profileProposedSnapshot);
  const hasStructuredRequest = request.profilePayloadVersion === 1 && structuredBase && structuredProposed;
  const hasLegacyRequest = envelope?.kind === 'profile';
  const display = looseDisplay ?? (hasLegacyRequest ? envelope.display : null);
  const snapshot = hasStructuredRequest
    ? structuredProposed
    : hasLegacyRequest
      ? envelope.payload.snapshot
      : { responsibilities: [], stats: [], members: [] };
  const summary = hasStructuredRequest
    ? buildExecutiveEditDiff(structuredBase, structuredProposed)
    : hasLegacyRequest
      ? envelope.payload.summary
      : [];
  return {
    id: request.id,
    committeeId,
    submittedBy: display?.applicantName ?? request.submittedByUserId ?? 'طلب قديم',
    submittedByUserId: request.submittedByUserId ?? undefined,
    submittedByEmail: display?.applicantEmail ?? '',
    submittedByRole: roleLabel(request.submittedRole),
    status: profileStatus(request.status),
    createdAt: request.submittedAt,
    reviewedAt: request.reviewedAt ?? undefined,
    reviewedByUserId: request.reviewedByUserId ?? undefined,
    decisionNote: request.decisionNote ?? undefined,
    snapshot,
    summary,
    ...(!hasStructuredRequest && !hasLegacyRequest ? { detailsUnavailable: true } : {}),
  };
}

export function mapEditRequestToSiteEdit(request: PersistedEditRequestRecord): PendingSiteEdit | null {
  const envelope = parseEditRequestEnvelope(request.proposedText);
  if (
    envelope?.kind !== 'site'
    || request.submittedRole !== 'MEDIA_HEAD'
    || request.committeeKey !== 'media'
  ) {
    return null;
  }
  return {
    id: request.id,
    ...envelope.payload,
    submittedBy: envelope.display.applicantName,
    submittedByUserId: request.submittedByUserId ?? undefined,
    submittedByRole: roleLabel(request.submittedRole),
    status: siteStatus(request.status),
    createdAt: request.submittedAt,
    reviewedAt: request.reviewedAt ?? undefined,
    reviewedByUserId: request.reviewedByUserId ?? undefined,
    decisionNote: request.decisionNote ?? undefined,
  };
}

const humanText = (diffs: Array<{ label: string; oldValue: string; newValue: string }>, side: 'oldValue' | 'newValue') => (
  diffs.map((diff) => `${diff.label}: ${diff[side] || '—'}`).join(' | ')
);

export function mapEditRequestToHistory(request: PersistedEditRequestRecord): EditsHistoryEntry {
  const envelope = parseEditRequestEnvelope(request.proposedText);
  const editedApproval = parseEditedApprovalNote(request.decisionNote);
  const kind = envelope?.kind ?? (request.editType === 'profile' ? 'profile' : 'site');
  const canonicalEditedSite = envelope?.kind === 'site' && editedApproval
    ? canonicalizeSiteEditSubmit({ ...envelope.payload, diffs: editedApproval.revisedDiffs })
    : null;
  const structuredBase = normalizeExecutiveContentSnapshot(request.profileBaseSnapshot);
  const structuredProposed = normalizeExecutiveContentSnapshot(request.profileProposedSnapshot);
  const structuredProfileDiffs = request.editType === 'profile'
    && request.profilePayloadVersion === 1
    && structuredBase
    && structuredProposed
      ? buildExecutiveEditDiff(structuredBase, structuredProposed)
      : null;
  const diffs = structuredProfileDiffs
    ?? (envelope?.kind === 'profile'
    ? envelope.payload.summary
    : envelope?.kind === 'site'
      ? (canonicalEditedSite?.ok ? canonicalEditedSite.value.diffs : envelope.payload.diffs)
      : []);
  const looseProfileDisplay = request.editType === 'profile' ? parseLooseProfileDisplay(request.proposedText) : null;
  const applicantName = envelope?.display.applicantName || looseProfileDisplay?.applicantName || request.submittedByUserId || 'طلب قديم';
  const committee = envelope?.kind === 'site'
    ? `${envelope.payload.pageLabel} — ${envelope.payload.sectionLabel}`
    : request.committeeKey ?? 'غير محدد';
  const decision = request.status === 'pending'
    ? 'PENDING'
    : request.status === 'rejected'
      ? 'REJECTED'
      : editedApproval
        ? 'EDITED_APPROVED'
        : 'APPROVED';
  const detailsUnavailable = diffs.length === 0 && !envelope && !structuredProfileDiffs;
  return {
    id: request.id,
    type: kind,
    applicantName,
    submittedByUserId: request.submittedByUserId ?? undefined,
    applicantRole: roleLabel(request.submittedRole),
    committee,
    editType: kind === 'profile' ? 'تعديل بيانات الهيئة' : 'تعديل محتوى الموقع',
    originalText: diffs.length > 0 ? humanText(diffs, 'oldValue') : '—',
    proposedText: diffs.length > 0 ? humanText(diffs, 'newValue') : 'تعذر قراءة تفاصيل هذا الطلب القديم',
    diffs,
    ...(detailsUnavailable ? { detailsUnavailable: true } : {}),
    status: request.status,
    decision,
    decisionNote: request.decisionNote ?? undefined,
    submittedAt: request.submittedAt,
    reviewedByUserId: request.reviewedByUserId ?? undefined,
    reviewedAt: request.reviewedAt ?? undefined,
    decisionDate: request.reviewedAt ?? request.submittedAt,
  };
}

export function mapDecidedEditRequestsToHistory(
  requests: PersistedEditRequestRecord[],
): EditsHistoryEntry[] {
  return requests
    .filter((request) => request.status === 'approved' || request.status === 'rejected')
    .map(mapEditRequestToHistory);
}

export function normalizeLegacyHistory(value: unknown): EditsHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    const row = recordOf(candidate);
    if (!row) return [];
    const decision = row.decision === 'REJECTED'
      ? 'REJECTED'
      : row.decision === 'EDITED_APPROVED'
        ? 'EDITED_APPROVED'
        : 'APPROVED';
    const decisionDate = stringOf(row.decisionDate) || stringOf(row.reviewedAt) || stringOf(row.submittedAt);
    return [{
      id: stringOf(row.id) || `legacy-${index}`,
      type: row.type === 'profile' ? 'profile' : 'site',
      applicantName: stringOf(row.applicantName) || 'سجل قديم',
      applicantRole: stringOf(row.applicantRole),
      committee: stringOf(row.committee),
      editType: stringOf(row.editType) || 'تعديل قديم',
      originalText: stringOf(row.originalText),
      proposedText: stringOf(row.proposedText),
      diffs: [],
      detailsUnavailable: true,
      status: decision === 'REJECTED' ? 'rejected' : 'approved',
      decision,
      ...(optionalStringOf(row.decisionNote) ? { decisionNote: optionalStringOf(row.decisionNote) } : {}),
      submittedAt: stringOf(row.submittedAt) || decisionDate,
      reviewedAt: stringOf(row.reviewedAt) || decisionDate,
      decisionDate,
      legacy: true,
      isLegacy: true,
      isUnverified: true,
    }];
  });
}
