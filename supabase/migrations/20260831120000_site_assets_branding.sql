-- Public, versioned brand assets. Writes are restricted to the current president.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'site_assets',
  'site_assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.managed_assets
  DROP CONSTRAINT IF EXISTS managed_assets_bucket_check;
ALTER TABLE public.managed_assets
  ADD CONSTRAINT managed_assets_bucket_check
  CHECK (bucket IN ('avatars', 'gallery', 'site_assets'));

ALTER TABLE public.managed_assets
  DROP CONSTRAINT IF EXISTS managed_assets_bucket_area_check;
ALTER TABLE public.managed_assets
  ADD CONSTRAINT managed_assets_bucket_area_check CHECK (
    (bucket = 'avatars' AND area = 'avatar' AND kind = 'image') OR
    (bucket = 'gallery' AND area <> 'avatar') OR
    (bucket = 'site_assets' AND area = 'site' AND kind = 'image')
  );

DROP POLICY IF EXISTS site_assets_public_read ON storage.objects;
DROP POLICY IF EXISTS site_assets_president_insert ON storage.objects;
DROP POLICY IF EXISTS site_assets_president_delete ON storage.objects;

CREATE POLICY site_assets_public_read
ON storage.objects
FOR SELECT
TO PUBLIC
USING (bucket_id = 'site_assets');

CREATE POLICY site_assets_president_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site_assets'
  AND owner_id = (SELECT auth.uid())::text
  AND (storage.foldername(name))[1] = 'branding'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND name ~* (
    '^branding/' || (SELECT auth.uid())::text || '/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
  )
  AND (
    (name ~* '[.](jpg|jpeg)$' AND metadata ->> 'mimetype' = 'image/jpeg')
    OR (name ~* '[.]png$' AND metadata ->> 'mimetype' = 'image/png')
    OR (name ~* '[.]webp$' AND metadata ->> 'mimetype' = 'image/webp')
  )
  AND EXISTS (
    SELECT 1
    FROM private.current_managed_asset_authorization AS authz
    WHERE authz.position_key = 'PRESIDENT'
  )
);

CREATE POLICY site_assets_president_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'site_assets'
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
  ELSIF asset_bucket = 'site_assets' THEN
    IF v_position IS DISTINCT FROM 'PRESIDENT' THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may register site assets';
    END IF;
    IF v_folder <> 'branding' OR split_part(asset_path, '/', 2) <> v_actor_id::text THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The site asset path is not owned by the caller';
    END IF;
    IF cardinality(string_to_array(asset_path, '/')) <> 3
       OR split_part(asset_path, '/', 3) !~* (
         '^' || asset_id::text || '[.](jpg|jpeg|png|webp)$'
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset path must use the versioned branding filename';
    END IF;
    IF asset_area <> 'site' OR asset_kind <> 'image' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset metadata is invalid';
    END IF;
    IF asset_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset MIME type is invalid';
    END IF;
    IF NOT (
      (asset_mime_type = 'image/jpeg' AND split_part(asset_path, '/', 3) ~* '[.](jpg|jpeg)$')
      OR (asset_mime_type = 'image/png' AND split_part(asset_path, '/', 3) ~* '[.]png$')
      OR (asset_mime_type = 'image/webp' AND split_part(asset_path, '/', 3) ~* '[.]webp$')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset filename extension does not match its MIME type';
    END IF;
    IF asset_size_bytes IS NULL OR asset_size_bytes <= 0 OR asset_size_bytes > 5242880 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Site asset size is invalid';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unknown asset bucket';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
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

REVOKE EXECUTE ON FUNCTION public.register_managed_asset(uuid, text, text, text, text, text, text, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_managed_asset(uuid, text, text, text, text, text, text, bigint)
  TO authenticated;

-- Publish the new site logo and transition both managed assets as one transaction.
CREATE OR REPLACE FUNCTION public.replace_site_logo(
  p_new_content jsonb,
  p_expected_version bigint,
  p_new_asset_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_position text;
  v_site public.published_site_content;
  v_new_asset public.managed_assets;
  v_old_asset public.managed_assets;
  v_old_asset_id uuid;
  v_previous_logo_path text;
  v_previous_logo_url text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF p_new_asset_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_new_content IS NULL OR jsonb_typeof(p_new_content) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Complete site logo publication input is required';
  END IF;

  SELECT assignment.position_key
  INTO v_position
  FROM public.executive_assignments AS assignment
  WHERE assignment.user_id = v_actor_id
  FOR UPDATE;
  IF v_position IS DISTINCT FROM 'PRESIDENT' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may publish the site logo';
  END IF;

  SELECT content.*
  INTO v_site
  FROM public.published_site_content AS content
  WHERE content.id = 'main'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Published site content was not found';
  END IF;
  IF v_site.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'CONTENT_VERSION_CONFLICT';
  END IF;

  v_previous_logo_path := v_site.content #>> '{siteContent,brand,logoPath}';
  v_previous_logo_url := v_site.content #>> '{siteContent,brand,logoUrl}';
  IF v_previous_logo_path IS NOT NULL AND btrim(v_previous_logo_path) <> '' THEN
    SELECT asset.id
    INTO v_old_asset_id
    FROM public.managed_assets AS asset
    WHERE asset.bucket = 'site_assets'
      AND asset.object_path = v_previous_logo_path;
  END IF;

  -- Asset locks are always acquired in UUID order to avoid opposite-order deadlocks.
  PERFORM 1
  FROM public.managed_assets AS asset
  WHERE asset.id = p_new_asset_id OR asset.id = v_old_asset_id
  ORDER BY asset.id
  FOR UPDATE;

  SELECT asset.*
  INTO v_new_asset
  FROM public.managed_assets AS asset
  WHERE asset.id = p_new_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The pending site logo asset was not found';
  END IF;
  IF v_new_asset.status IS DISTINCT FROM 'pending'
     OR v_new_asset.bucket IS DISTINCT FROM 'site_assets'
     OR v_new_asset.area IS DISTINCT FROM 'site'
     OR v_new_asset.kind IS DISTINCT FROM 'image'
     OR v_new_asset.owner_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The new site logo asset is not an owned pending image';
  END IF;
  IF p_new_content #>> '{brand,logoUrl}' IS DISTINCT FROM v_new_asset.public_url
     OR p_new_content #>> '{brand,logoPath}' IS DISTINCT FROM v_new_asset.object_path THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The published brand does not match the new site logo asset';
  END IF;

  IF v_old_asset_id IS NOT NULL THEN
    SELECT asset.*
    INTO v_old_asset
    FROM public.managed_assets AS asset
    WHERE asset.id = v_old_asset_id;
    IF v_old_asset.id = v_new_asset.id
       OR v_old_asset.status IS DISTINCT FROM 'active'
       OR v_old_asset.bucket IS DISTINCT FROM 'site_assets'
       OR v_old_asset.area IS DISTINCT FROM 'site'
       OR v_old_asset.kind IS DISTINCT FROM 'image'
       OR v_old_asset.object_path IS DISTINCT FROM v_previous_logo_path
       OR v_old_asset.public_url IS DISTINCT FROM v_previous_logo_url THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The previous brand does not match its active site logo asset';
    END IF;
  END IF;

  UPDATE public.published_site_content AS content
  SET content = jsonb_set(content.content, '{siteContent}', p_new_content, true),
      version = content.version + 1,
      updated_by = v_actor_id,
      updated_at = now()
  WHERE content.id = 'main'
  RETURNING content.* INTO v_site;

  UPDATE public.managed_assets AS asset
  SET status = 'active',
      activated_at = now(),
      replaced_at = NULL
  WHERE asset.id = p_new_asset_id
  RETURNING asset.* INTO v_new_asset;

  IF v_old_asset_id IS NOT NULL THEN
    UPDATE public.managed_assets AS asset
    SET status = 'replaced',
        replaced_at = now()
    WHERE asset.id = v_old_asset_id
    RETURNING asset.* INTO v_old_asset;
  END IF;

  RETURN jsonb_build_object(
    'target', 'site',
    'payload', v_site.content -> 'siteContent',
    'version', v_site.version,
    'updated_at', v_site.updated_at,
    'new_asset', to_jsonb(v_new_asset),
    'old_asset', CASE
      WHEN v_old_asset_id IS NULL THEN 'null'::jsonb
      ELSE to_jsonb(v_old_asset)
    END
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.replace_site_logo(jsonb, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_site_logo(jsonb, bigint, uuid)
  TO authenticated;
