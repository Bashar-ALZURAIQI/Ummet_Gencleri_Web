import type { EditsHistoryEntry } from '../data/mockData.ts';

export interface EditAuditViewEntry {
  id: string;
  type: EditsHistoryEntry['type'];
  applicantName: string;
  applicantRole: string;
  committee: string;
  editType: string;
  status: 'approved' | 'rejected';
  decision: Exclude<EditsHistoryEntry['decision'], 'PENDING'>;
  decisionNote?: string;
  submittedAt: string;
  reviewedByUserId?: string;
  decisionDate: string;
  diffs: EditsHistoryEntry['diffs'];
  detailsUnavailable: boolean;
  isLegacy: boolean;
  actions: never[];
}

export function buildEditAuditViewModel(entries: EditsHistoryEntry[]) {
  const finalEntries = entries.flatMap((entry): EditAuditViewEntry[] => {
    if (
      (entry.status !== 'approved' && entry.status !== 'rejected')
      || entry.decision === 'PENDING'
    ) return [];
    return [{
      id: entry.id,
      type: entry.type,
      applicantName: entry.applicantName,
      applicantRole: entry.applicantRole,
      committee: entry.committee,
      editType: entry.editType,
      status: entry.status,
      decision: entry.decision,
      ...(entry.decisionNote ? { decisionNote: entry.decisionNote } : {}),
      submittedAt: entry.submittedAt,
      ...(entry.reviewedByUserId ? { reviewedByUserId: entry.reviewedByUserId } : {}),
      decisionDate: entry.decisionDate,
      diffs: entry.diffs,
      detailsUnavailable: entry.detailsUnavailable === true || entry.diffs.length === 0,
      isLegacy: entry.isLegacy === true || entry.legacy === true,
      actions: [],
    }];
  });
  return { entries: finalEntries };
}
