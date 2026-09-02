import { supabase } from '../lib/supabase.ts';
import {
  createSectionContentRepository,
  type SectionContentClient,
} from '../domain/sectionContentRepository.ts';

export type {
  CmsPublication,
  FaqContent,
  RepositoryError,
  RepositoryResult,
  StudentGuideContent,
} from '../domain/sectionContentRepository.ts';

const repository = createSectionContentRepository(supabase as unknown as SectionContentClient);

export const loadStudentGuideContent = () => repository.loadGuide();
export const loadFaqContent = () => repository.loadFaq();
export const publishCmsTarget = (target: string, payload: unknown, expectedVersion: number) => (
  repository.publish(target, payload, expectedVersion)
);
export const createPublishedEvent = (event: unknown, expectedVersion: number) => (
  repository.createEvent(event, expectedVersion)
);
