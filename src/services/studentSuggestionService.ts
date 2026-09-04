import { supabase } from '../lib/supabase.ts';
import {
  createStudentSuggestionGateway,
  type StudentSuggestionClient,
  type ServiceResult,
  type SubmitSuggestionParams,
  type RespondToSuggestionParams,
} from '../domain/studentSuggestionGateway.ts';
import type { Suggestion } from '../data/mockData.ts';

const gateway = createStudentSuggestionGateway(supabase as unknown as StudentSuggestionClient);

export type {
  ServiceResult,
  SubmitSuggestionParams,
  RespondToSuggestionParams,
} from '../domain/studentSuggestionGateway.ts';

export function loadVisibleStudentSuggestions(): Promise<ServiceResult<Suggestion[]>> {
  return gateway.listSuggestions();
}

export function submitStudentSuggestion(
  params: SubmitSuggestionParams,
): Promise<ServiceResult<{ id: string; message: string }>> {
  return gateway.submitSuggestion(params);
}

export function respondToStudentSuggestion(
  params: RespondToSuggestionParams,
): Promise<ServiceResult<{ message: string }>> {
  return gateway.respondToSuggestion(params);
}

export function subscribeToStudentSuggestionUpdates(
  onUpdate: () => void,
  options?: { debounceMs?: number },
): () => void {
  return gateway.subscribeToUpdates(onUpdate, options);
}
