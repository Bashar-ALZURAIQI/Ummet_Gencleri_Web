-- Behavioural verification for president-only site branding assets.
-- The fixtures and Storage objects are created through real RLS roles and rolled back.
BEGIN;

SELECT set_config('site_assets_branding.president_id', (
  SELECT user_id::text FROM public.executive_assignments WHERE position_key = 'PRESIDENT'
), true);
SELECT set_config('site_assets_branding.media_id', (
  SELECT user_id::text FROM public.executive_assignments WHERE position_key = 'MEDIA_HEAD'
), true);
SELECT set_config('site_assets_branding.student_id', (
  SELECT profile.id::text
  FROM public.profiles AS profile
  JOIN public.student_applications AS application
    ON application.student_user_id = profile.id AND application.status = 'accepted'
  WHERE profile.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.executive_assignments AS assignment
      WHERE assignment.user_id = profile.id
    )
  ORDER BY profile.created_at, profile.id
  LIMIT 1
), true);

DO $fixtures$
DECLARE
  v_president uuid := current_setting('site_assets_branding.president_id')::uuid;
  v_media uuid := current_setting('site_assets_branding.media_id')::uuid;
  v_student uuid := current_setting('site_assets_branding.student_id')::uuid;
BEGIN
  IF v_president IS NULL OR v_media IS NULL OR v_student IS NULL THEN
    RAISE EXCEPTION 'SITE_ASSETS_BRANDING_FIXTURE_ID_MISSING';
  END IF;
  PERFORM set_config('site_assets_branding.asset_id', gen_random_uuid()::text, true);
  PERFORM set_config('site_assets_branding.old_asset_id', gen_random_uuid()::text, true);
  PERFORM set_config('site_assets_branding.invalid_atomic_asset_id', gen_random_uuid()::text, true);
  PERFORM set_config('site_assets_branding.delete_asset_id', gen_random_uuid()::text, true);
  PERFORM set_config('site_assets_branding.wrong_owner_asset_id', gen_random_uuid()::text, true);
  PERFORM set_config('site_assets_branding.wrong_path_asset_id', gen_random_uuid()::text, true);
  PERFORM set_config('site_assets_branding.media_asset_id', gen_random_uuid()::text, true);
  PERFORM set_config('site_assets_branding.student_asset_id', gen_random_uuid()::text, true);
END;
$fixtures$;

DO $atomic_fixture$
DECLARE
  v_president uuid := current_setting('site_assets_branding.president_id')::uuid;
  v_old_asset_id uuid := current_setting('site_assets_branding.old_asset_id')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.published_site_content WHERE id = 'main') THEN
    RAISE EXCEPTION 'SITE_ASSETS_PUBLISHED_MAIN_FIXTURE_MISSING';
  END IF;
  IF has_function_privilege('anon', 'public.replace_site_logo(jsonb,bigint,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.replace_site_logo(jsonb,bigint,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.replace_site_logo(jsonb,bigint,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SITE_LOGO_ATOMIC_RPC_PRIVILEGES_INVALID';
  END IF;

  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'site_assets',
    'branding/' || v_president::text || '/' || v_old_asset_id::text || '.webp',
    v_president::text,
    jsonb_build_object('mimetype', 'image/webp', 'size', 2048)
  );
  INSERT INTO public.managed_assets (
    id, bucket, object_path, public_url, kind, area, owner_id,
    status, mime_type, size_bytes, activated_at
  ) VALUES (
    v_old_asset_id, 'site_assets',
    'branding/' || v_president::text || '/' || v_old_asset_id::text || '.webp',
    'https://example.test/old-site-logo.webp', 'image', 'site', v_president,
    'active', 'image/webp', 2048, now()
  );
  UPDATE public.published_site_content
  SET content = jsonb_set(
    content,
    ARRAY['siteContent'],
    COALESCE(content -> 'siteContent', '{}'::jsonb)
      || jsonb_build_object(
        'brand',
        COALESCE(content #> '{siteContent,brand}', '{}'::jsonb)
          || jsonb_build_object(
            'logoUrl', 'https://example.test/old-site-logo.webp',
            'logoPath', 'branding/' || v_president::text || '/' || v_old_asset_id::text || '.webp'
          )
      ),
    true
  )
  WHERE id = 'main';
END;
$atomic_fixture$;

-- The president exercises the actual Storage INSERT and DELETE policies before
-- registering the uploaded object, and UPDATE remains unavailable.
SELECT set_config('request.jwt.claim.sub', current_setting('site_assets_branding.president_id'), true);
SET LOCAL ROLE authenticated;
DO $president_storage_and_registration$
DECLARE
  v_president uuid := current_setting('site_assets_branding.president_id')::uuid;
  v_student uuid := current_setting('site_assets_branding.student_id')::uuid;
  v_asset_id uuid := current_setting('site_assets_branding.asset_id')::uuid;
  v_old_asset_id uuid := current_setting('site_assets_branding.old_asset_id')::uuid;
  v_invalid_atomic_asset_id uuid := current_setting('site_assets_branding.invalid_atomic_asset_id')::uuid;
  v_delete_asset_id uuid := current_setting('site_assets_branding.delete_asset_id')::uuid;
  v_wrong_owner_asset_id uuid := current_setting('site_assets_branding.wrong_owner_asset_id')::uuid;
  v_wrong_path_asset_id uuid := current_setting('site_assets_branding.wrong_path_asset_id')::uuid;
  v_registered public.managed_assets;
  v_envelope jsonb;
  v_next_content jsonb;
  v_before_version bigint;
  v_after_version bigint;
  v_status text;
  v_count integer;
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'site_assets',
    'branding/' || v_president::text || '/' || v_asset_id::text || '.png',
    v_president::text,
    jsonb_build_object('mimetype', 'image/png', 'size', 1024)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'PRESIDENT_STORAGE_INSERT_FAILED'; END IF;

  SELECT * INTO v_registered
  FROM public.register_managed_asset(
    v_asset_id, 'site_assets',
    'branding/' || v_president::text || '/' || v_asset_id::text || '.png',
    'https://example.test/site-logo.png', 'image', 'site', 'image/png', 1024
  );
  IF v_registered.id <> v_asset_id
     OR v_registered.bucket <> 'site_assets'
     OR v_registered.object_path <> ('branding/' || v_president::text || '/' || v_asset_id::text || '.png')
     OR v_registered.public_url <> 'https://example.test/site-logo.png'
     OR v_registered.kind <> 'image'
     OR v_registered.area <> 'site'
     OR v_registered.owner_id <> v_president
     OR v_registered.mime_type <> 'image/png'
     OR v_registered.size_bytes <> 1024
     OR v_registered.status <> 'pending' THEN
    RAISE EXCEPTION 'PRESIDENT_MANAGED_ASSET_REGISTRATION_FIELDS_INVALID';
  END IF;

  SELECT content -> 'siteContent', version
  INTO v_next_content, v_before_version
  FROM public.published_site_content
  WHERE id = 'main';
  v_next_content := v_next_content || jsonb_build_object(
    'brand',
    COALESCE(v_next_content -> 'brand', '{}'::jsonb)
      || jsonb_build_object(
        'logoUrl', 'https://example.test/site-logo.png',
        'logoPath', 'branding/' || v_president::text || '/' || v_asset_id::text || '.png'
      )
  );

  v_envelope := public.replace_site_logo(v_next_content, v_before_version, v_asset_id);
  IF v_envelope ->> 'target' <> 'site'
     OR (v_envelope ->> 'version')::bigint <> v_before_version + 1
     OR v_envelope #>> '{payload,brand,logoPath}'
        <> ('branding/' || v_president::text || '/' || v_asset_id::text || '.png')
     OR v_envelope #>> '{new_asset,status}' <> 'active'
     OR v_envelope #>> '{old_asset,status}' <> 'replaced'
     OR v_envelope #>> '{old_asset,id}' <> v_old_asset_id::text THEN
    RAISE EXCEPTION 'SITE_LOGO_ATOMIC_ENVELOPE_INVALID';
  END IF;
  SELECT version INTO v_after_version FROM public.published_site_content WHERE id = 'main';
  IF v_after_version <> v_before_version + 1 THEN
    RAISE EXCEPTION 'SITE_LOGO_ATOMIC_VERSION_NOT_INCREMENTED';
  END IF;
  SELECT status INTO v_status FROM public.managed_assets WHERE id = v_asset_id;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'SITE_LOGO_NEW_ASSET_NOT_ACTIVE'; END IF;
  SELECT status INTO v_status FROM public.managed_assets WHERE id = v_old_asset_id;
  IF v_status <> 'replaced' THEN RAISE EXCEPTION 'SITE_LOGO_OLD_ASSET_NOT_REPLACED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'site_assets'
      AND name = 'branding/' || v_president::text || '/' || v_old_asset_id::text || '.webp'
  ) THEN
    RAISE EXCEPTION 'SITE_LOGO_RPC_DELETED_OLD_STORAGE_OBJECT';
  END IF;

  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'site_assets',
    'branding/' || v_president::text || '/' || v_invalid_atomic_asset_id::text || '.png',
    v_president::text,
    jsonb_build_object('mimetype', 'image/png', 'size', 1024)
  );
  PERFORM public.register_managed_asset(
    v_invalid_atomic_asset_id, 'site_assets',
    'branding/' || v_president::text || '/' || v_invalid_atomic_asset_id::text || '.png',
    'https://example.test/invalid-atomic.png', 'image', 'site', 'image/png', 1024
  );
  SELECT version INTO v_before_version FROM public.published_site_content WHERE id = 'main';
  BEGIN
    PERFORM public.replace_site_logo(
      jsonb_set(
        v_next_content,
        '{brand}',
        (v_next_content -> 'brand') || jsonb_build_object(
          'logoUrl', 'https://example.test/wrong-envelope.png',
          'logoPath', 'branding/' || v_president::text || '/' || v_invalid_atomic_asset_id::text || '.png'
        )
      ),
      v_before_version,
      v_invalid_atomic_asset_id
    );
    RAISE EXCEPTION 'MISMATCHED_ATOMIC_BRAND_UNEXPECTEDLY_COMMITTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  SELECT version INTO v_after_version FROM public.published_site_content WHERE id = 'main';
  SELECT status INTO v_status FROM public.managed_assets WHERE id = v_invalid_atomic_asset_id;
  IF v_after_version <> v_before_version OR v_status <> 'pending' THEN
    RAISE EXCEPTION 'FAILED_SITE_LOGO_ATOMIC_CALL_DID_NOT_ROLL_BACK';
  END IF;

  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'site_assets',
    'branding/' || v_president::text || '/' || v_delete_asset_id::text || '.webp',
    v_president::text,
    jsonb_build_object('mimetype', 'image/webp', 'size', 1024)
  );
  DELETE FROM storage.objects
  WHERE bucket_id = 'site_assets'
    AND name = 'branding/' || v_president::text || '/' || v_delete_asset_id::text || '.webp';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'PRESIDENT_STORAGE_DELETE_FAILED'; END IF;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'site_assets',
      'branding/' || v_president::text || '/' || v_wrong_owner_asset_id::text || '.png',
      v_student::text,
      jsonb_build_object('mimetype', 'image/png', 'size', 1024)
    );
    RAISE EXCEPTION 'WRONG_STORAGE_OWNER_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'site_assets',
      'branding/' || v_president::text || '/' || v_wrong_path_asset_id::text || '/nested.png',
      v_president::text,
      jsonb_build_object('mimetype', 'image/png', 'size', 1024)
    );
    RAISE EXCEPTION 'NESTED_STORAGE_PATH_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE storage.objects
    SET metadata = jsonb_build_object('mimetype', 'image/webp', 'size', 1)
    WHERE bucket_id = 'site_assets'
      AND name = 'branding/' || v_president::text || '/' || v_asset_id::text || '.png';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 0 THEN RAISE EXCEPTION 'SITE_ASSETS_UPDATE_UNEXPECTEDLY_ALLOWED'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.register_managed_asset(
      gen_random_uuid(), 'site_assets',
      'branding/' || v_president::text || '/' || v_asset_id::text || '.png',
      'https://example.test/mismatched-id.png', 'image', 'site', 'image/png', 1024
    );
    RAISE EXCEPTION 'MISMATCHED_RPC_ASSET_ID_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END;
$president_storage_and_registration$;
RESET ROLE;

-- Public read must expose the same object without an authenticated claim.
SET LOCAL ROLE anon;
DO $public_read$
DECLARE
  v_president uuid := current_setting('site_assets_branding.president_id')::uuid;
  v_asset_id uuid := current_setting('site_assets_branding.asset_id')::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'site_assets'
      AND name = 'branding/' || v_president::text || '/' || v_asset_id::text || '.png'
  ) THEN
    RAISE EXCEPTION 'PUBLIC_SITE_ASSET_READ_FAILED';
  END IF;
  BEGIN
    PERFORM public.replace_site_logo('{}'::jsonb, 1, v_asset_id);
    RAISE EXCEPTION 'ANON_SITE_LOGO_RPC_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$public_read$;
RESET ROLE;

-- MEDIA_HEAD and STUDENT cannot insert valid paths or register an asset.
SELECT set_config('request.jwt.claim.sub', current_setting('site_assets_branding.media_id'), true);
SET LOCAL ROLE authenticated;
DO $media_denied$
DECLARE
  v_media uuid := current_setting('site_assets_branding.media_id')::uuid;
  v_asset_id uuid := current_setting('site_assets_branding.media_asset_id')::uuid;
  v_president uuid := current_setting('site_assets_branding.president_id')::uuid;
  v_president_asset_id uuid := current_setting('site_assets_branding.asset_id')::uuid;
  v_count integer;
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'site_assets', 'branding/' || v_media::text || '/' || v_asset_id::text || '.png',
      v_media::text, jsonb_build_object('mimetype', 'image/png', 'size', 1024)
    );
    RAISE EXCEPTION 'MEDIA_HEAD_STORAGE_INSERT_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.register_managed_asset(
      v_asset_id, 'site_assets', 'branding/' || v_media::text || '/' || v_asset_id::text || '.png',
      'https://example.test/media-denied.png', 'image', 'site', 'image/png', 1024
    );
    RAISE EXCEPTION 'MEDIA_HEAD_SITE_ASSET_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'site_assets'
      AND name = ('branding/' || v_president::text || '/' || v_president_asset_id::text || '.png');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 0 THEN RAISE EXCEPTION 'MEDIA_HEAD_STORAGE_DELETE_UNEXPECTEDLY_ALLOWED'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.replace_site_logo('{}'::jsonb, 1, v_president_asset_id);
    RAISE EXCEPTION 'MEDIA_HEAD_SITE_LOGO_RPC_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$media_denied$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', current_setting('site_assets_branding.student_id'), true);
SET LOCAL ROLE authenticated;
DO $student_denied$
DECLARE
  v_student uuid := current_setting('site_assets_branding.student_id')::uuid;
  v_asset_id uuid := current_setting('site_assets_branding.student_asset_id')::uuid;
  v_president uuid := current_setting('site_assets_branding.president_id')::uuid;
  v_president_asset_id uuid := current_setting('site_assets_branding.asset_id')::uuid;
  v_count integer;
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'site_assets', 'branding/' || v_student::text || '/' || v_asset_id::text || '.png',
      v_student::text, jsonb_build_object('mimetype', 'image/png', 'size', 1024)
    );
    RAISE EXCEPTION 'STUDENT_STORAGE_INSERT_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.register_managed_asset(
      v_asset_id, 'site_assets', 'branding/' || v_student::text || '/' || v_asset_id::text || '.png',
      'https://example.test/student-denied.png', 'image', 'site', 'image/png', 1024
    );
    RAISE EXCEPTION 'STUDENT_SITE_ASSET_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = 'site_assets'
      AND name = ('branding/' || v_president::text || '/' || v_president_asset_id::text || '.png');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 0 THEN RAISE EXCEPTION 'STUDENT_STORAGE_DELETE_UNEXPECTEDLY_ALLOWED'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$student_denied$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', current_setting('site_assets_branding.president_id'), true);
SET LOCAL ROLE authenticated;
DO $invalid_rpc_metadata$
DECLARE
  v_president uuid := current_setting('site_assets_branding.president_id')::uuid;
  v_svg_asset_id uuid := gen_random_uuid();
  v_large_asset_id uuid := gen_random_uuid();
BEGIN
  BEGIN
    PERFORM public.register_managed_asset(
      gen_random_uuid(), 'site_assets', 'wrong/' || v_president::text || '/logo.png',
      'https://example.test/wrong-folder.png', 'image', 'site', 'image/png', 1024
    );
    RAISE EXCEPTION 'WRONG_SITE_ASSET_FOLDER_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.register_managed_asset(
      gen_random_uuid(), 'site_assets',
      'branding/00000000-0000-0000-0000-000000000000/logo.png',
      'https://example.test/wrong-owner.png', 'image', 'site', 'image/png', 1024
    );
    RAISE EXCEPTION 'WRONG_SITE_ASSET_OWNER_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.register_managed_asset(
      v_svg_asset_id, 'site_assets',
      'branding/' || v_president::text || '/' || v_svg_asset_id::text || '.svg',
      'https://example.test/logo.svg', 'image', 'site', 'image/svg+xml', 1024
    );
    RAISE EXCEPTION 'SVG_SITE_ASSET_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.register_managed_asset(
      v_large_asset_id, 'site_assets',
      'branding/' || v_president::text || '/' || v_large_asset_id::text || '.png',
      'https://example.test/large.png', 'image', 'site', 'image/png', 5242881
    );
    RAISE EXCEPTION 'OVERSIZED_SITE_ASSET_UNEXPECTEDLY_ALLOWED';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END;
$invalid_rpc_metadata$;
RESET ROLE;

ROLLBACK;
SELECT 'SITE_ASSETS_BRANDING_OK' AS result;
