import { supabase } from '../lib/supabase.ts';
import {
  createSiteContentRepository,
  type PublishedSiteContent,
  type SiteContentClient,
  type SiteContentResult,
} from '../domain/siteContentRepository.ts';

const repository = createSiteContentRepository(supabase as unknown as SiteContentClient);

export function loadPublishedSiteContent<TContent extends Record<string, unknown>>() {
  return repository.load() as Promise<SiteContentResult<PublishedSiteContent<TContent> | null>>;
}

export function publishSiteContent<TContent extends Record<string, unknown>>(
  content: TContent,
  expectedVersion: number,
) {
  return repository.publish(content, expectedVersion) as Promise<SiteContentResult<PublishedSiteContent<TContent>>>;
}
