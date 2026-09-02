import { supabase } from '../lib/supabase.ts';
import {
  createGuideSuggestionRepository,
  type GuideSuggestionClient,
} from '../domain/guideSuggestionRepository.ts';

export type { GuideSuggestion } from '../domain/guideSuggestionRepository.ts';
export type { GuideSuggestionInput, GuideSuggestionStatus } from '../domain/guideSuggestionPolicy.ts';

const repository = createGuideSuggestionRepository(supabase as unknown as GuideSuggestionClient);

export const submitGuideSuggestion = (input: Parameters<typeof repository.submit>[0]) => repository.submit(input);
export const listGuideSuggestions = () => repository.list();
export const updateGuideSuggestionStatus = (
  id: string,
  status: Parameters<typeof repository.updateStatus>[1],
) => repository.updateStatus(id, status);
export const deleteGuideSuggestion = (id: string) => repository.remove(id);
