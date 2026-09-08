-- Migration: 20260906220000_create_cms_localizations.sql
-- Description: Creates the durable cms_localizations table with draft/published partitions,
--              unique logical keys, domain validation constraints, and strict RLS policies.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cms_localizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL CHECK (char_length(btrim(target)) > 0),
  locale text NOT NULL CHECK (locale IN ('tr', 'en')),
  partition text NOT NULL CHECK (partition IN ('draft', 'published')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'fresh' CHECK (status IN ('draft', 'fresh', 'stale', 'missing')),
  source_hash text NULL,
  source_version text NULL,
  stale_paths text[] NOT NULL DEFAULT '{}'::text[],
  manual_paths text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_localizations_target_locale_partition_key UNIQUE (target, locale, partition)
);

CREATE INDEX IF NOT EXISTS idx_cms_localizations_target
  ON public.cms_localizations (target);

CREATE INDEX IF NOT EXISTS idx_cms_localizations_target_locale
  ON public.cms_localizations (target, locale);

CREATE INDEX IF NOT EXISTS idx_cms_localizations_partition
  ON public.cms_localizations (partition);

ALTER TABLE public.cms_localizations ENABLE ROW LEVEL SECURITY;

-- 1. Published Read: Public and authenticated users can read published localizations
DROP POLICY IF EXISTS "cms_localizations_published_read" ON public.cms_localizations;
CREATE POLICY "cms_localizations_published_read"
ON public.cms_localizations
FOR SELECT
TO anon, authenticated
USING (partition = 'published');

-- 2. Draft Read: Only authenticated executives can read draft localizations
DROP POLICY IF EXISTS "cms_localizations_draft_read" ON public.cms_localizations;
CREATE POLICY "cms_localizations_draft_read"
ON public.cms_localizations
FOR SELECT
TO authenticated
USING (
  partition = 'draft'
  AND COALESCE((
    SELECT authz.is_executive
    FROM private.current_user_authorization AS authz
  ), false)
);

-- 3. Draft Writes: Authenticated executives can insert, update, and delete draft records
DROP POLICY IF EXISTS "cms_localizations_draft_insert" ON public.cms_localizations;
CREATE POLICY "cms_localizations_draft_insert"
ON public.cms_localizations
FOR INSERT
TO authenticated
WITH CHECK (
  partition = 'draft'
  AND COALESCE((
    SELECT authz.is_executive
    FROM private.current_user_authorization AS authz
  ), false)
);

DROP POLICY IF EXISTS "cms_localizations_draft_update" ON public.cms_localizations;
CREATE POLICY "cms_localizations_draft_update"
ON public.cms_localizations
FOR UPDATE
TO authenticated
USING (
  partition = 'draft'
  AND COALESCE((
    SELECT authz.is_executive
    FROM private.current_user_authorization AS authz
  ), false)
)
WITH CHECK (
  partition = 'draft'
  AND COALESCE((
    SELECT authz.is_executive
    FROM private.current_user_authorization AS authz
  ), false)
);

DROP POLICY IF EXISTS "cms_localizations_draft_delete" ON public.cms_localizations;
CREATE POLICY "cms_localizations_draft_delete"
ON public.cms_localizations
FOR DELETE
TO authenticated
USING (
  partition = 'draft'
  AND COALESCE((
    SELECT authz.is_executive
    FROM private.current_user_authorization AS authz
  ), false)
);

-- 4. Published Writes: Only the President can insert, update, and delete published localizations
DROP POLICY IF EXISTS "cms_localizations_published_insert" ON public.cms_localizations;
CREATE POLICY "cms_localizations_published_insert"
ON public.cms_localizations
FOR INSERT
TO authenticated
WITH CHECK (
  partition = 'published'
  AND COALESCE((
    SELECT authz.is_president
    FROM private.current_user_authorization AS authz
  ), false)
);

DROP POLICY IF EXISTS "cms_localizations_published_update" ON public.cms_localizations;
CREATE POLICY "cms_localizations_published_update"
ON public.cms_localizations
FOR UPDATE
TO authenticated
USING (
  partition = 'published'
  AND COALESCE((
    SELECT authz.is_president
    FROM private.current_user_authorization AS authz
  ), false)
)
WITH CHECK (
  partition = 'published'
  AND COALESCE((
    SELECT authz.is_president
    FROM private.current_user_authorization AS authz
  ), false)
);

DROP POLICY IF EXISTS "cms_localizations_published_delete" ON public.cms_localizations;
CREATE POLICY "cms_localizations_published_delete"
ON public.cms_localizations
FOR DELETE
TO authenticated
USING (
  partition = 'published'
  AND COALESCE((
    SELECT authz.is_president
    FROM private.current_user_authorization AS authz
  ), false)
);

-- Minimum Data API permissions granted; access gated by RLS
REVOKE ALL ON TABLE public.cms_localizations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.cms_localizations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cms_localizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cms_localizations TO service_role;

COMMIT;
