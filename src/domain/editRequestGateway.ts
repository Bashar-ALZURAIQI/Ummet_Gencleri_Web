import {
  normalizeExecutiveContentSnapshot,
  type ExecutiveContentSnapshot,
} from './executiveEditWorkflow.ts';

export type EditRequestStatus = 'pending' | 'approved' | 'rejected';
export type EditRequestDecision = Exclude<EditRequestStatus, 'pending'>;

export interface EditRequest {
  id: string;
  submittedByUserId: string | null;
  submittedRole: string;
  committeeKey: string | null;
  editType: string;
  originalText: string | null;
  proposedText: string;
  status: EditRequestStatus;
  decisionNote: string | null;
  reviewedByUserId: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  siteTarget?: string;
  sitePayload?: unknown;
  siteBaseVersion?: number;
  sitePayloadVersion?: number;
  profileBaseSnapshot?: ExecutiveContentSnapshot;
  profileProposedSnapshot?: ExecutiveContentSnapshot;
  profilePayloadVersion?: number;
}

export interface SubmitEditRequestInput {
  editType: string;
  originalText?: string | null;
  proposedText: string;
}

export interface SubmitSiteEditRequestInput {
  originalText?: string | null;
  proposedText: string;
  target: string;
  payload: unknown;
  baseVersion: number;
}

export interface SubmitProfileEditRequestInput {
  proposedSnapshot: ExecutiveContentSnapshot;
}

export interface CmsPublication {
  target: string;
  payload: unknown;
  version: number;
  updatedAt: string;
}

export interface SiteApprovalResult {
  request: EditRequest;
  publication: CmsPublication;
}

export interface ProfileApprovalResult {
  request: EditRequest;
  publication: CmsPublication;
}

interface ServiceError {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

export interface EditRequestClient {
  from(table: 'edit_requests'): {
    select(columns: string): {
      order(column: 'submitted_at', options: { ascending: false }): Promise<{ data: unknown; error: unknown }>;
    };
  };
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

const EDIT_REQUEST_SELECT_COLUMNS = [
  'id', 'submitted_by', 'submitted_role', 'committee_key', 'edit_type',
  'original_text', 'proposed_text', 'status', 'decision_note', 'reviewed_by',
  'submitted_at', 'reviewed_at',
  'site_target', 'site_payload', 'site_base_version', 'site_payload_version',
  'profile_base_snapshot', 'profile_proposed_snapshot', 'profile_payload_version',
].join(',');

const text = (value: unknown): string =>
  typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);

const nullableText = (value: unknown): string | null => {
  const normalized = text(value);
  return normalized || null;
};

const firstRpcRow = (data: unknown): Record<string, unknown> | null => {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row as Record<string, unknown> : null;
};

const failure = <T>(error: unknown, fallbackCode: string, fallbackMessage: string): ServiceResult<T> => {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  return {
    ok: false,
    error: {
      code: typeof candidate?.code === 'string' && candidate.code ? candidate.code : fallbackCode,
      message: typeof candidate?.message === 'string' && candidate.message ? candidate.message : fallbackMessage,
      ...(typeof candidate?.details === 'string' && candidate.details ? { details: candidate.details } : {}),
      ...(typeof candidate?.hint === 'string' && candidate.hint ? { hint: candidate.hint } : {}),
    },
  };
};

export const mapEditRequest = (row: Record<string, unknown>): EditRequest => {
  const profileBaseSnapshot = normalizeExecutiveContentSnapshot(row.profile_base_snapshot);
  const profileProposedSnapshot = normalizeExecutiveContentSnapshot(row.profile_proposed_snapshot);
  return ({
  id: text(row.id),
  submittedByUserId: nullableText(row.submitted_by),
  submittedRole: text(row.submitted_role),
  committeeKey: nullableText(row.committee_key),
  editType: text(row.edit_type),
  originalText: nullableText(row.original_text),
  proposedText: text(row.proposed_text),
  status: text(row.status) as EditRequestStatus,
  decisionNote: nullableText(row.decision_note),
  reviewedByUserId: nullableText(row.reviewed_by),
  submittedAt: text(row.submitted_at),
  reviewedAt: nullableText(row.reviewed_at),
  ...(typeof row.site_target === 'string' && row.site_target ? { siteTarget: row.site_target } : {}),
  ...(Object.prototype.hasOwnProperty.call(row, 'site_payload') && row.site_payload !== null
    ? { sitePayload: row.site_payload }
    : {}),
  ...(Number.isSafeInteger(row.site_base_version) && Number(row.site_base_version) > 0
    ? { siteBaseVersion: Number(row.site_base_version) }
    : {}),
  ...(Number.isSafeInteger(row.site_payload_version) && Number(row.site_payload_version) > 0
    ? { sitePayloadVersion: Number(row.site_payload_version) }
    : {}),
  ...(profileBaseSnapshot ? { profileBaseSnapshot } : {}),
  ...(profileProposedSnapshot ? { profileProposedSnapshot } : {}),
  ...(Number.isSafeInteger(row.profile_payload_version) && Number(row.profile_payload_version) > 0
    ? { profilePayloadVersion: Number(row.profile_payload_version) }
    : {}),
  });
};

const mapPublication = (value: unknown): CmsPublication | null => {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!row
    || typeof row.target !== 'string'
    || !row.target
    || !Object.prototype.hasOwnProperty.call(row, 'payload')
    || !Number.isSafeInteger(row.version)
    || Number(row.version) < 1
    || typeof row.updated_at !== 'string'
    || !row.updated_at) return null;
  return {
    target: row.target,
    payload: row.payload,
    version: Number(row.version),
    updatedAt: row.updated_at,
  };
};

export function createEditRequestService(client: EditRequestClient) {
  return {
    async list(): Promise<ServiceResult<EditRequest[]>> {
      try {
        const { data, error } = await client
          .from('edit_requests')
          .select(EDIT_REQUEST_SELECT_COLUMNS)
          .order('submitted_at', { ascending: false });
        if (error) return failure(error, 'EDIT_REQUESTS_LOAD_FAILED', 'Unable to load edit requests.');
        const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
        return { ok: true, data: rows.map(mapEditRequest) };
      } catch (error) {
        return failure(error, 'EDIT_REQUESTS_LOAD_FAILED', 'Unable to load edit requests.');
      }
    },

    async submit(input: SubmitEditRequestInput): Promise<ServiceResult<EditRequest>> {
      try {
        const { data, error } = await client.rpc('submit_edit_request', {
          p_edit_type: input.editType,
          p_original_text: input.originalText ?? null,
          p_proposed_text: input.proposedText,
        });
        if (error) return failure(error, 'EDIT_REQUEST_SUBMIT_FAILED', 'Unable to submit the edit request.');
        const row = firstRpcRow(data);
        return row
          ? { ok: true, data: mapEditRequest(row) }
          : failure(null, 'EDIT_REQUEST_SUBMIT_EMPTY', 'The edit request RPC returned no confirmed row.');
      } catch (error) {
        return failure(error, 'EDIT_REQUEST_SUBMIT_FAILED', 'Unable to submit the edit request.');
      }
    },

    async submitSite(input: SubmitSiteEditRequestInput): Promise<ServiceResult<EditRequest>> {
      try {
        const { data, error } = await client.rpc('submit_site_edit_request', {
          p_original_text: input.originalText ?? null,
          p_proposed_text: input.proposedText,
          p_target: input.target,
          p_payload: input.payload,
          p_base_version: input.baseVersion,
          p_payload_version: 1,
        });
        if (error) return failure(error, 'SITE_EDIT_SUBMIT_FAILED', 'Unable to submit the structured site edit.');
        const row = firstRpcRow(data);
        return row
          ? { ok: true, data: mapEditRequest(row) }
          : failure(null, 'SITE_EDIT_SUBMIT_EMPTY', 'The site edit RPC returned no confirmed row.');
      } catch (error) {
        return failure(error, 'SITE_EDIT_SUBMIT_FAILED', 'Unable to submit the structured site edit.');
      }
    },

    async submitProfile(input: SubmitProfileEditRequestInput): Promise<ServiceResult<EditRequest>> {
      try {
        const proposedSnapshot = normalizeExecutiveContentSnapshot(input.proposedSnapshot);
        if (!proposedSnapshot) {
          return failure(null, 'PROFILE_EDIT_INVALID', 'The structured profile edit is invalid.');
        }
        const { data, error } = await client.rpc('submit_profile_edit_request', {
          p_proposed_snapshot: proposedSnapshot,
          p_payload_version: 1,
        });
        if (error) return failure(error, 'PROFILE_EDIT_SUBMIT_FAILED', 'Unable to submit the structured profile edit.');
        const row = firstRpcRow(data);
        const request = row ? mapEditRequest(row) : null;
        if (!request) {
          return failure(null, 'PROFILE_EDIT_SUBMIT_EMPTY', 'The profile edit RPC returned no confirmed row.');
        }
        return request.status === 'pending'
          ? { ok: true, data: request }
          : failure(null, 'PROFILE_EDIT_SUBMIT_INVALID_STATUS', 'The profile edit RPC did not confirm a pending request.');
      } catch (error) {
        return failure(error, 'PROFILE_EDIT_SUBMIT_FAILED', 'Unable to submit the structured profile edit.');
      }
    },

    async approveSite(
      requestId: string,
      approvedPayload?: unknown,
      decisionNote?: string | null,
    ): Promise<ServiceResult<SiteApprovalResult>> {
      try {
        const { data, error } = await client.rpc('approve_site_edit_request', {
          p_request_id: requestId,
          p_approved_payload: approvedPayload ?? null,
          p_decision_note: decisionNote ?? null,
        });
        if (error) return failure(error, 'SITE_EDIT_APPROVAL_FAILED', 'Unable to approve and publish the site edit.');
        const envelope = firstRpcRow(data);
        const request = envelope?.request && typeof envelope.request === 'object' && !Array.isArray(envelope.request)
          ? mapEditRequest(envelope.request as Record<string, unknown>)
          : null;
        const publication = mapPublication(envelope?.publication);
        return request && publication
          ? { ok: true, data: { request, publication } }
          : failure(null, 'SITE_EDIT_APPROVAL_INVALID', 'The approval RPC returned an invalid result.');
      } catch (error) {
        return failure(error, 'SITE_EDIT_APPROVAL_FAILED', 'Unable to approve and publish the site edit.');
      }
    },

    async rejectSite(requestId: string, decisionNote?: string | null): Promise<ServiceResult<EditRequest>> {
      try {
        const { data, error } = await client.rpc('reject_site_edit_request', {
          p_request_id: requestId,
          p_decision_note: decisionNote ?? null,
        });
        if (error) return failure(error, 'SITE_EDIT_REJECTION_FAILED', 'Unable to reject the site edit.');
        const row = firstRpcRow(data);
        return row
          ? { ok: true, data: mapEditRequest(row) }
          : failure(null, 'SITE_EDIT_REJECTION_EMPTY', 'The rejection RPC returned no confirmed row.');
      } catch (error) {
        return failure(error, 'SITE_EDIT_REJECTION_FAILED', 'Unable to reject the site edit.');
      }
    },

    async approveProfile(
      requestId: string,
      revisedSnapshot?: ExecutiveContentSnapshot,
      decisionNote?: string | null,
    ): Promise<ServiceResult<ProfileApprovalResult>> {
      try {
        const normalizedRevision = revisedSnapshot === undefined
          ? null
          : normalizeExecutiveContentSnapshot(revisedSnapshot);
        if (revisedSnapshot !== undefined && !normalizedRevision) {
          return failure(null, 'PROFILE_EDIT_INVALID', 'The revised profile edit is invalid.');
        }
        const { data, error } = await client.rpc('approve_profile_edit_request', {
          p_request_id: requestId,
          p_revised_snapshot: normalizedRevision,
          p_decision_note: decisionNote ?? null,
        });
        if (error) return failure(error, 'PROFILE_EDIT_APPROVAL_FAILED', 'Unable to approve and publish the profile edit.');
        const envelope = firstRpcRow(data);
        const request = envelope?.request && typeof envelope.request === 'object' && !Array.isArray(envelope.request)
          ? mapEditRequest(envelope.request as Record<string, unknown>)
          : null;
        const publication = mapPublication(envelope?.publication);
        return request && request.status === 'approved' && publication?.target === 'committees'
          ? { ok: true, data: { request, publication } }
          : failure(null, 'PROFILE_EDIT_APPROVAL_INVALID', 'The profile approval RPC returned an invalid result.');
      } catch (error) {
        return failure(error, 'PROFILE_EDIT_APPROVAL_FAILED', 'Unable to approve and publish the profile edit.');
      }
    },

    async rejectProfile(requestId: string, decisionNote?: string | null): Promise<ServiceResult<EditRequest>> {
      try {
        const { data, error } = await client.rpc('reject_profile_edit_request', {
          p_request_id: requestId,
          p_decision_note: decisionNote ?? null,
        });
        if (error) return failure(error, 'PROFILE_EDIT_REJECTION_FAILED', 'Unable to reject the profile edit.');
        const row = firstRpcRow(data);
        const request = row ? mapEditRequest(row) : null;
        return request?.status === 'rejected'
          ? { ok: true, data: request }
          : failure(null, 'PROFILE_EDIT_REJECTION_INVALID', 'The profile rejection RPC returned no confirmed decision.');
      } catch (error) {
        return failure(error, 'PROFILE_EDIT_REJECTION_FAILED', 'Unable to reject the profile edit.');
      }
    },

    async review(
      requestId: string,
      decision: EditRequestDecision,
      decisionNote?: string | null,
    ): Promise<ServiceResult<EditRequest>> {
      try {
        const { data, error } = await client.rpc('decide_edit_request', {
          p_request_id: requestId,
          p_decision: decision,
          p_decision_note: decisionNote ?? null,
        });
        if (error) return failure(error, 'EDIT_REQUEST_REVIEW_FAILED', 'Unable to review the edit request.');
        const row = firstRpcRow(data);
        return row
          ? { ok: true, data: mapEditRequest(row) }
          : failure(null, 'EDIT_REQUEST_REVIEW_EMPTY', 'The edit request decision returned no confirmed row.');
      } catch (error) {
        return failure(error, 'EDIT_REQUEST_REVIEW_FAILED', 'Unable to review the edit request.');
      }
    },
  };
}
