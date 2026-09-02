-- Shared published content and auditable Storage assets.
CREATE TABLE IF NOT EXISTS public.managed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL CHECK (bucket IN ('avatars', 'gallery')),
  object_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'video', 'document')),
  area text NOT NULL CHECK (area IN ('news', 'events', 'gallery', 'site', 'plans', 'reports', 'avatar')),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'replaced', 'orphaned')),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  activated_at timestamptz,
  replaced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT managed_assets_bucket_area_check CHECK (
    (bucket = 'avatars' AND area = 'avatar' AND kind = 'image') OR
    (bucket = 'gallery' AND area <> 'avatar')
  )
);

CREATE INDEX IF NOT EXISTS managed_assets_owner_status_idx
  ON public.managed_assets (owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS managed_assets_status_created_idx
  ON public.managed_assets (status, created_at)
  WHERE status IN ('pending', 'orphaned');

CREATE TABLE IF NOT EXISTS public.published_site_content (
  id text PRIMARY KEY CHECK (id = 'main'),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.managed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managed_assets_read_own_or_president" ON public.managed_assets;
CREATE POLICY "managed_assets_read_own_or_president"
ON public.managed_assets
FOR SELECT
TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM private.current_user_authorization AS authz
    WHERE authz.is_president
  )
);

DROP POLICY IF EXISTS "published_site_content_public_read" ON public.published_site_content;
CREATE POLICY "published_site_content_public_read"
ON public.published_site_content
FOR SELECT
TO anon, authenticated
USING (id = 'main');

REVOKE ALL ON TABLE public.managed_assets FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.published_site_content FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.managed_assets TO authenticated;
GRANT SELECT ON TABLE public.published_site_content TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.managed_assets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.published_site_content TO service_role;

-- Exposes only the current caller's trusted assignment for Storage RLS.
CREATE OR REPLACE VIEW private.current_managed_asset_authorization
WITH (security_barrier = true)
AS
SELECT ea.position_key
FROM public.executive_assignments AS ea
WHERE ea.user_id = (SELECT auth.uid());

REVOKE ALL ON TABLE private.current_managed_asset_authorization FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.current_managed_asset_authorization TO authenticated;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'gallery',
  'gallery',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "gallery_public_read" ON storage.objects;
DROP POLICY IF EXISTS "gallery_authorized_insert" ON storage.objects;
DROP POLICY IF EXISTS "gallery_owner_or_president_delete" ON storage.objects;
-- Remove the earlier broad editor policies. PostgreSQL combines permissive
-- policies with OR, so leaving them in place would bypass folder ownership.
DROP POLICY IF EXISTS "gallery_objects_public_read" ON storage.objects;
DROP POLICY IF EXISTS "gallery_objects_editor_insert" ON storage.objects;
DROP POLICY IF EXISTS "gallery_objects_editor_update" ON storage.objects;
DROP POLICY IF EXISTS "gallery_objects_editor_delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars_president_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_president_delete" ON storage.objects;

CREATE POLICY "gallery_public_read"
ON storage.objects
FOR SELECT
TO PUBLIC
USING (bucket_id = 'gallery');

CREATE POLICY "gallery_authorized_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'gallery'
  AND owner_id = (SELECT auth.uid())::text
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1
    FROM private.current_managed_asset_authorization AS authz
    WHERE
      authz.position_key = 'PRESIDENT'
      OR (
        authz.position_key = 'MEDIA_HEAD'
        AND (storage.foldername(name))[1] IN ('news', 'albums', 'site', 'documents', 'videos')
      )
      OR (
        authz.position_key IN ('ACADEMIC_HEAD', 'ACTIVITIES_HEAD')
        AND (storage.foldername(name))[1] IN ('events', 'documents')
      )
      OR (
        authz.position_key IN ('VICE_PRESIDENT', 'FINANCE_HEAD', 'AUDIT_HEAD')
        AND (storage.foldername(name))[1] = 'documents'
      )
  )
);

CREATE POLICY "gallery_owner_or_president_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'gallery'
  AND (
    owner_id = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM private.current_managed_asset_authorization AS authz
      WHERE authz.position_key = 'PRESIDENT'
    )
  )
);

-- A president may upload a versioned avatar for another real account. The RPC
-- below remains the only path that can bind that object to the target profile.
CREATE POLICY "avatars_president_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND owner_id = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM private.current_managed_asset_authorization AS authz
    WHERE authz.position_key = 'PRESIDENT'
  )
);

CREATE POLICY "avatars_president_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND EXISTS (
    SELECT 1
    FROM private.current_managed_asset_authorization AS authz
    WHERE authz.position_key = 'PRESIDENT'
  )
);

CREATE OR REPLACE FUNCTION public.register_managed_asset(
  asset_id uuid,
  asset_bucket text,
  asset_path text,
  asset_public_url text,
  asset_kind text,
  asset_area text,
  asset_mime_type text,
  asset_size_bytes bigint
)
RETURNS public.managed_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_row public.managed_assets;
  v_folder text := split_part(asset_path, '/', 1);
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF asset_id IS NULL OR asset_path IS NULL OR btrim(asset_path) = ''
     OR asset_public_url IS NULL OR btrim(asset_public_url) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Complete asset metadata is required';
  END IF;

  SELECT ea.position_key INTO v_position
  FROM public.executive_assignments AS ea
  WHERE ea.user_id = v_actor_id;

  IF asset_bucket = 'avatars' THEN
    IF asset_area <> 'avatar' OR asset_kind <> 'image' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Avatar metadata is invalid';
    END IF;
    IF split_part(asset_path, '/', 1) <> v_actor_id::text AND v_position <> 'PRESIDENT' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The avatar path is not authorized';
    END IF;
  ELSIF asset_bucket = 'gallery' THEN
    IF split_part(asset_path, '/', 2) <> v_actor_id::text THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The gallery path is not owned by the caller';
    END IF;
    IF NOT (
      v_position = 'PRESIDENT'
      OR (v_position = 'MEDIA_HEAD' AND v_folder IN ('news', 'albums', 'site', 'documents', 'videos'))
      OR (v_position IN ('ACADEMIC_HEAD', 'ACTIVITIES_HEAD') AND v_folder IN ('events', 'documents'))
      OR (v_position IN ('VICE_PRESIDENT', 'FINANCE_HEAD', 'AUDIT_HEAD') AND v_folder = 'documents')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The gallery folder is not authorized';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown asset bucket';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects AS object
    WHERE object.bucket_id = asset_bucket AND object.name = asset_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The uploaded Storage object was not found';
  END IF;

  INSERT INTO public.managed_assets (
    id, bucket, object_path, public_url, kind, area, owner_id, mime_type, size_bytes
  ) VALUES (
    asset_id, asset_bucket, asset_path, asset_public_url, asset_kind, asset_area,
    v_actor_id, asset_mime_type, asset_size_bytes
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END
$function$;

CREATE OR REPLACE FUNCTION public.set_managed_asset_status(
  asset_id uuid,
  next_status text
)
RETURNS public.managed_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_is_president boolean := false;
  v_row public.managed_assets;
BEGIN
  IF v_actor_id IS NULL OR next_status NOT IN ('active', 'replaced', 'orphaned') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid managed asset status change is required';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.executive_assignments AS ea
    WHERE ea.user_id = v_actor_id AND ea.position_key = 'PRESIDENT'
  ) INTO v_is_president;

  UPDATE public.managed_assets AS asset
  SET status = next_status,
      activated_at = CASE WHEN next_status = 'active' THEN COALESCE(asset.activated_at, now()) ELSE asset.activated_at END,
      replaced_at = CASE WHEN next_status = 'replaced' THEN COALESCE(asset.replaced_at, now()) ELSE asset.replaced_at END
  WHERE asset.id = asset_id
    AND (asset.owner_id = v_actor_id OR v_is_president)
    AND (
      (asset.status = 'pending' AND next_status IN ('active', 'orphaned'))
      OR (asset.status = 'active' AND next_status = 'replaced')
    )
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Managed asset was not found or transition is invalid';
  END IF;
  RETURN v_row;
END
$function$;

CREATE OR REPLACE FUNCTION public.publish_site_content(
  new_content jsonb,
  expected_version bigint
)
RETURNS public.published_site_content
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_stored public.published_site_content;
  v_result public.published_site_content;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may publish site content';
  END IF;
  IF new_content IS NULL OR jsonb_typeof(new_content) <> 'object' OR expected_version < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Valid content and expected version are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('published_site_content.main', 0));
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Publishing authority changed before content was locked';
  END IF;

  SELECT * INTO v_stored
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;

  IF NOT FOUND THEN
    IF expected_version <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
    END IF;
    INSERT INTO public.published_site_content (id, content, version, updated_by, updated_at)
    VALUES ('main', new_content, 1, v_actor_id, now())
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  IF v_stored.version <> expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
  END IF;

  UPDATE public.published_site_content
  SET content = new_content,
      version = v_stored.version + 1,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE id = 'main'
  RETURNING * INTO v_result;
  RETURN v_result;
END
$function$;

CREATE OR REPLACE FUNCTION public.replace_member_avatar(
  target_user_id uuid,
  expected_old_path text,
  new_path text
)
RETURNS TABLE (old_path text, avatar_path text, profile_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_profile public.profiles;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may replace another member avatar';
  END IF;
  IF target_user_id IS NULL OR new_path IS NULL
     OR new_path !~* ('^' || target_user_id::text || '/avatar-[0-9a-f-]{36}\.(jpg|png|webp)$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The new avatar path is invalid';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = target_user_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The active member profile was not found';
  END IF;
  IF v_profile.avatar_path IS DISTINCT FROM expected_old_path THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'AVATAR_CONFLICT';
  END IF;

  UPDATE public.profiles
  SET avatar_path = new_path,
      updated_at = now()
  WHERE id = target_user_id;

  old_path := v_profile.avatar_path;
  avatar_path := new_path;
  SELECT p.updated_at INTO profile_updated_at FROM public.profiles AS p WHERE p.id = target_user_id;
  RETURN NEXT;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.register_managed_asset(uuid, text, text, text, text, text, text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_managed_asset_status(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.publish_site_content(jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.replace_member_avatar(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.register_managed_asset(uuid, text, text, text, text, text, text, bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_managed_asset_status(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_site_content(jsonb, bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_member_avatar(uuid, text, text)
  TO authenticated;

DO $realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'published_site_content'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.published_site_content;
  END IF;
END
$realtime$;
