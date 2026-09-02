import { supabase } from '../lib/supabase.ts';
import {
  createEditRequestService,
  type EditRequestClient,
  type EditRequestDecision,
  type SubmitEditRequestInput,
  type SubmitSiteEditRequestInput,
  type SubmitProfileEditRequestInput,
} from '../domain/editRequestGateway.ts';
import type { ExecutiveContentSnapshot } from '../domain/executiveEditWorkflow.ts';

export type {
  EditRequest,
  EditRequestDecision,
  EditRequestStatus,
  SubmitEditRequestInput,
  SubmitSiteEditRequestInput,
  SiteApprovalResult,
  SubmitProfileEditRequestInput,
  ProfileApprovalResult,
} from '../domain/editRequestGateway.ts';
export { createEditRequestService, mapEditRequest } from '../domain/editRequestGateway.ts';

const editRequestService = createEditRequestService(supabase as unknown as EditRequestClient);

export const listEditRequests = () => editRequestService.list();
export const submitEditRequest = (input: SubmitEditRequestInput) => editRequestService.submit(input);
export const submitStructuredSiteEditRequest = (input: SubmitSiteEditRequestInput) => editRequestService.submitSite(input);
export const submitStructuredProfileEditRequest = (input: SubmitProfileEditRequestInput) => editRequestService.submitProfile(input);
export const approveStructuredSiteEditRequest = (
  requestId: string,
  approvedPayload?: unknown,
  decisionNote?: string | null,
) => editRequestService.approveSite(requestId, approvedPayload, decisionNote);
export const rejectStructuredSiteEditRequest = (requestId: string, decisionNote?: string | null) => (
  editRequestService.rejectSite(requestId, decisionNote)
);
export const approveStructuredProfileEditRequest = (
  requestId: string,
  revisedSnapshot?: ExecutiveContentSnapshot,
  decisionNote?: string | null,
) => editRequestService.approveProfile(requestId, revisedSnapshot, decisionNote);
export const rejectStructuredProfileEditRequest = (requestId: string, decisionNote?: string | null) => (
  editRequestService.rejectProfile(requestId, decisionNote)
);
export const reviewEditRequest = (
  requestId: string,
  decision: EditRequestDecision,
  decisionNote?: string | null,
) => editRequestService.review(requestId, decision, decisionNote);
