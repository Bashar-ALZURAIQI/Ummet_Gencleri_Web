import { supabase } from '../lib/supabase.ts';

export interface GuideLinkResolvedMetadata {
  ok: boolean;
  title: string | null;
  host: string;
  finalUrl: string;
  blocked: boolean;
}

/**
 * Resolves a human-readable title for a guide contact link via the local
 * `resolve-guide-link-title` Edge Function. The SSRF guard lives on the
 * function side (DNS + per-redirect validation), so the caller never gets an
 * error for an unsafe link — it simply falls back to the hostname.
 */
export async function resolveGuideLinkTitle(url: string): Promise<GuideLinkResolvedMetadata> {
  const { data, error } = await supabase.functions.invoke('resolve-guide-link-title', {
    body: { url },
  });
  if (error) {
    return { ok: false, title: null, host: '', finalUrl: '', blocked: false };
  }
  return {
    ok: Boolean(data?.ok),
    title: typeof data?.title === 'string' && data.title ? data.title : null,
    host: typeof data?.host === 'string' ? data.host : '',
    finalUrl: typeof data?.finalUrl === 'string' ? data.finalUrl : '',
    blocked: Boolean(data?.blocked),
  };
}