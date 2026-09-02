import type {
  CmsPublication,
  EditRequest,
  ProfileApprovalResult,
} from './editRequestGateway.ts';
import type { ExecutiveContentSnapshot } from './executiveEditWorkflow.ts';

export interface ExecutiveEditError {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

export type ExecutiveEditResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ExecutiveEditError };

interface SubmissionDependencies {
  submit(snapshot: ExecutiveContentSnapshot): Promise<ExecutiveEditResult<EditRequest>>;
  publishRequest(request: EditRequest): void;
}

interface ApprovalDependencies {
  approve(
    requestId: string,
    revisedSnapshot?: ExecutiveContentSnapshot,
    decisionNote?: string | null,
  ): Promise<ExecutiveEditResult<ProfileApprovalResult>>;
  publishCommittees(publication: CmsPublication): void;
  publishRequest(request: EditRequest): void;
}

interface RejectionDependencies {
  reject(requestId: string, decisionNote?: string | null): Promise<ExecutiveEditResult<EditRequest>>;
  publishRequest(request: EditRequest): void;
}

interface PresidentCommitteePersistenceDependencies<TCommittee, TResult> {
  publishCommittees(committees: TCommittee[]): Promise<TResult>;
}

export async function persistPresidentCommitteeEdit<
  TCommittee extends { id: string },
  TResult,
>(
  dependencies: PresidentCommitteePersistenceDependencies<TCommittee, TResult>,
  committees: TCommittee[],
  committeeId: string,
  nextCommittee: TCommittee,
): Promise<TResult> {
  const nextCommittees = committees.map((committee) => (
    committee.id === committeeId ? nextCommittee : committee
  ));
  return dependencies.publishCommittees(nextCommittees);
}

export async function runExecutiveEditSubmission(
  dependencies: SubmissionDependencies,
  proposedSnapshot: ExecutiveContentSnapshot,
): Promise<ExecutiveEditResult<EditRequest>> {
  const result = await dependencies.submit(proposedSnapshot);
  if (!result.ok) return result;
  dependencies.publishRequest(result.data);
  return result;
}

export async function runExecutiveEditApproval(
  dependencies: ApprovalDependencies,
  requestId: string,
  revisedSnapshot?: ExecutiveContentSnapshot,
  decisionNote?: string | null,
): Promise<ExecutiveEditResult<ProfileApprovalResult>> {
  const result = await dependencies.approve(requestId, revisedSnapshot, decisionNote);
  if (!result.ok) return result;
  dependencies.publishCommittees(result.data.publication);
  dependencies.publishRequest(result.data.request);
  return result;
}

export async function runExecutiveEditRejection(
  dependencies: RejectionDependencies,
  requestId: string,
  decisionNote?: string | null,
): Promise<ExecutiveEditResult<EditRequest>> {
  const result = await dependencies.reject(requestId, decisionNote);
  if (!result.ok) return result;
  dependencies.publishRequest(result.data);
  return result;
}
