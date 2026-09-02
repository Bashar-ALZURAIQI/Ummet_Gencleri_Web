-- Structured, president-approved executive committee content edits.

ALTER TABLE public.edit_requests
  ADD COLUMN IF NOT EXISTS profile_base_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS profile_proposed_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS profile_payload_version integer;

CREATE INDEX IF NOT EXISTS edit_requests_pending_profile_owner_idx
  ON public.edit_requests (submitted_by, committee_key, submitted_at DESC)
  WHERE edit_type = 'profile' AND status = 'pending';

CREATE OR REPLACE FUNCTION private.try_parse_jsonb(p_value text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
BEGIN
  RETURN p_value::jsonb;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION private.normalize_executive_profile_snapshot(
  p_snapshot jsonb,
  p_identity_source jsonb DEFAULT NULL,
  p_allow_new_members boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_responsibilities jsonb := '[]'::jsonb;
  v_stats jsonb := '[]'::jsonb;
  v_members jsonb := '[]'::jsonb;
  v_item jsonb;
  v_text text;
  v_id text;
  v_name text;
  v_position text;
  v_photo text;
  v_source_member jsonb;
  v_source_count integer := 0;
  v_proposed_count integer := 0;
  v_unknown_count integer := 0;
  v_missing_source_count integer := 0;
BEGIN
  IF p_snapshot IS NULL
     OR jsonb_typeof(p_snapshot) <> 'object'
     OR octet_length(p_snapshot::text) > 131072
     OR (SELECT count(*) FROM jsonb_object_keys(p_snapshot)) <> 3
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_snapshot) AS key_name
       WHERE key_name NOT IN ('responsibilities', 'stats', 'members')
     )
     OR jsonb_typeof(p_snapshot -> 'responsibilities') <> 'array'
     OR jsonb_typeof(p_snapshot -> 'stats') <> 'array'
     OR jsonb_typeof(p_snapshot -> 'members') <> 'array'
     OR jsonb_array_length(p_snapshot -> 'responsibilities') > 50
     OR jsonb_array_length(p_snapshot -> 'stats') > 30
     OR jsonb_array_length(p_snapshot -> 'members') > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_INVALID_SNAPSHOT';
  END IF;

  FOR v_item IN
    SELECT item FROM jsonb_array_elements(p_snapshot -> 'responsibilities') WITH ORDINALITY AS rows(item, position)
    ORDER BY position
  LOOP
    IF jsonb_typeof(v_item) <> 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_INVALID_RESPONSIBILITY';
    END IF;
    v_text := btrim(v_item #>> '{}');
    IF char_length(v_text) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_INVALID_RESPONSIBILITY';
    END IF;
    v_responsibilities := v_responsibilities || jsonb_build_array(v_text);
  END LOOP;

  FOR v_item IN
    SELECT item FROM jsonb_array_elements(p_snapshot -> 'stats') WITH ORDINALITY AS rows(item, position)
    ORDER BY position
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_item)) <> 2
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(v_item) AS key_name
         WHERE key_name NOT IN ('label', 'value')
       )
       OR jsonb_typeof(v_item -> 'label') <> 'string'
       OR jsonb_typeof(v_item -> 'value') <> 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_INVALID_STAT';
    END IF;
    v_name := btrim(v_item ->> 'label');
    v_text := btrim(v_item ->> 'value');
    IF char_length(v_name) NOT BETWEEN 1 AND 500
       OR char_length(v_text) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_INVALID_STAT';
    END IF;
    v_stats := v_stats || jsonb_build_array(jsonb_build_object('label', v_name, 'value', v_text));
  END LOOP;

  IF p_identity_source IS NOT NULL THEN
    IF jsonb_typeof(p_identity_source) <> 'object'
       OR jsonb_typeof(p_identity_source -> 'members') <> 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_INVALID_IDENTITY_SOURCE';
    END IF;
    v_source_count := jsonb_array_length(p_identity_source -> 'members');
  END IF;
  v_proposed_count := jsonb_array_length(p_snapshot -> 'members');

  FOR v_item IN
    SELECT item FROM jsonb_array_elements(p_snapshot -> 'members') WITH ORDINALITY AS rows(item, position)
    ORDER BY position
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_item)) <> 4
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(v_item) AS key_name
         WHERE key_name NOT IN ('id', 'name', 'position', 'photo')
       )
       OR jsonb_typeof(v_item -> 'id') <> 'string'
       OR jsonb_typeof(v_item -> 'name') <> 'string'
       OR jsonb_typeof(v_item -> 'position') <> 'string'
       OR jsonb_typeof(v_item -> 'photo') <> 'string' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_INVALID_MEMBER';
    END IF;

    v_id := btrim(v_item ->> 'id');
    v_name := btrim(v_item ->> 'name');
    v_position := btrim(v_item ->> 'position');
    v_photo := btrim(v_item ->> 'photo');
    IF char_length(v_id) NOT BETWEEN 1 AND 500
       OR char_length(v_name) NOT BETWEEN 1 AND 500
       OR char_length(v_position) NOT BETWEEN 1 AND 500
       OR char_length(v_photo) > 2048 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_INVALID_MEMBER';
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_members) AS existing
      WHERE existing ->> 'id' = v_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_DUPLICATE_MEMBER';
    END IF;

    v_source_member := NULL;
    IF p_identity_source IS NOT NULL THEN
      SELECT source_member INTO v_source_member
      FROM jsonb_array_elements(p_identity_source -> 'members') AS source_member
      WHERE source_member ->> 'id' = v_id
      LIMIT 1;

      IF v_source_member IS NULL THEN
        IF NOT p_allow_new_members THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_MEMBER_ID_CHANGED';
        END IF;
        v_unknown_count := v_unknown_count + 1;
        v_id := gen_random_uuid()::text;
        v_photo := '';
      ELSE
        v_id := v_source_member ->> 'id';
        v_photo := v_source_member ->> 'photo';
      END IF;
    END IF;

    v_members := v_members || jsonb_build_array(jsonb_build_object(
      'id', v_id,
      'name', v_name,
      'position', v_position,
      'photo', v_photo
    ));
  END LOOP;

  IF p_identity_source IS NOT NULL THEN
    SELECT count(*) INTO v_missing_source_count
    FROM jsonb_array_elements(p_identity_source -> 'members') AS source_member
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_snapshot -> 'members') AS proposed_member
      WHERE proposed_member ->> 'id' = source_member ->> 'id'
    );
    IF v_unknown_count > 0 AND (
      v_proposed_count <= v_source_count
      OR v_missing_source_count > 0
      OR v_unknown_count <> v_proposed_count - v_source_count
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_MEMBER_SET_CHANGED';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'responsibilities', v_responsibilities,
    'stats', v_stats,
    'members', v_members
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.executive_profile_snapshot_from_committee(p_committee jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF p_committee IS NULL OR jsonb_typeof(p_committee) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_COMMITTEE_NOT_FOUND';
  END IF;
  RETURN private.normalize_executive_profile_snapshot(jsonb_build_object(
    'responsibilities', COALESCE(p_committee -> 'responsibilities', '[]'::jsonb),
    'stats', COALESCE(p_committee -> 'stats', '[]'::jsonb),
    'members', COALESCE(p_committee -> 'members', '[]'::jsonb)
  ));
END
$function$;

REVOKE EXECUTE ON FUNCTION private.try_parse_jsonb(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.normalize_executive_profile_snapshot(jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.executive_profile_snapshot_from_committee(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

DO $legacy_backfill$
DECLARE
  v_row record;
  v_envelope jsonb;
  v_committees jsonb;
  v_committee jsonb;
  v_base jsonb;
  v_proposed jsonb;
BEGIN
  SELECT content -> 'committees'
  INTO v_committees
  FROM public.published_site_content
  WHERE id = 'main';

  IF jsonb_typeof(v_committees) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT id, committee_key, proposed_text
    FROM public.edit_requests
    WHERE edit_type = 'profile'
      AND status = 'pending'
      AND profile_proposed_snapshot IS NULL
  LOOP
    v_envelope := private.try_parse_jsonb(v_row.proposed_text);
    IF v_envelope ->> 'kind' IS DISTINCT FROM 'profile'
       OR v_envelope ->> 'version' IS DISTINCT FROM '1'
       OR jsonb_typeof(v_envelope #> '{payload,snapshot}') <> 'object' THEN
      CONTINUE;
    END IF;

    SELECT committee_item INTO v_committee
    FROM jsonb_array_elements(v_committees) AS committee_item
    WHERE committee_item ->> 'id' = v_row.committee_key
    LIMIT 1;
    IF v_committee IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_base := private.executive_profile_snapshot_from_committee(v_committee);
      v_proposed := private.normalize_executive_profile_snapshot(jsonb_build_object(
        'responsibilities', v_envelope #> '{payload,snapshot,responsibilities}',
        'stats', v_envelope #> '{payload,snapshot,stats}',
        'members', v_envelope #> '{payload,snapshot,members}'
      ), v_base, true);
      UPDATE public.edit_requests
      SET profile_base_snapshot = v_base,
          profile_proposed_snapshot = v_proposed,
          profile_payload_version = 1
      WHERE id = v_row.id;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END LOOP;
END
$legacy_backfill$;

CREATE OR REPLACE FUNCTION public.submit_edit_request(
  p_edit_type text,
  p_original_text text,
  p_proposed_text text
)
RETURNS public.edit_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_assignment public.executive_assignments%ROWTYPE;
  v_request public.edit_requests%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  IF btrim(COALESCE(p_edit_type, '')) = 'profile' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_REQUIRES_STRUCTURED_RPC';
  END IF;

  SELECT ea.* INTO v_assignment
  FROM public.executive_assignments AS ea
  WHERE ea.user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a current executive may submit an edit request';
  END IF;
  IF NULLIF(btrim(p_edit_type), '') IS NULL OR NULLIF(btrim(p_proposed_text), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Edit type and proposed text are required';
  END IF;

  INSERT INTO public.edit_requests (
    submitted_by, submitted_role, committee_key, edit_type, original_text,
    proposed_text, status, decision_note, reviewed_by, reviewed_at
  ) VALUES (
    v_actor_id, v_assignment.position_key, v_assignment.committee_key,
    btrim(p_edit_type), p_original_text, p_proposed_text, 'pending', NULL, NULL, NULL
  ) RETURNING * INTO v_request;
  RETURN v_request;
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_profile_edit_request(
  p_proposed_snapshot jsonb,
  p_payload_version integer DEFAULT 1
)
RETURNS public.edit_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_assignment public.executive_assignments%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_committees jsonb;
  v_committee jsonb;
  v_base jsonb;
  v_proposed jsonb;
  v_request public.edit_requests%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;
  SELECT * INTO v_assignment
  FROM public.executive_assignments
  WHERE user_id = v_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a current executive may submit profile edits';
  END IF;
  IF v_assignment.position_key = 'PRESIDENT' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_PRESIDENT_DIRECT';
  END IF;
  IF p_payload_version <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_PAYLOAD_VERSION_UNSUPPORTED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor_id::text || ':' || v_assignment.committee_key, 0));
  IF EXISTS (
    SELECT 1 FROM public.edit_requests
    WHERE submitted_by = v_actor_id
      AND committee_key = v_assignment.committee_key
      AND edit_type = 'profile'
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROFILE_EDIT_ALREADY_PENDING';
  END IF;

  SELECT content -> 'committees' INTO v_committees
  FROM public.published_site_content
  WHERE id = 'main';
  IF jsonb_typeof(v_committees) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PROFILE_EDIT_COMMITTEES_NOT_FOUND';
  END IF;
  SELECT committee_item INTO v_committee
  FROM jsonb_array_elements(v_committees) AS committee_item
  WHERE committee_item ->> 'id' = v_assignment.committee_key
  LIMIT 1;
  v_base := private.executive_profile_snapshot_from_committee(v_committee);
  v_proposed := private.normalize_executive_profile_snapshot(p_proposed_snapshot, v_base, true);
  IF v_proposed = v_base THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_NO_CHANGES';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_actor_id;
  INSERT INTO public.edit_requests (
    submitted_by, submitted_role, committee_key, edit_type, original_text,
    proposed_text, status, profile_base_snapshot, profile_proposed_snapshot,
    profile_payload_version
  ) VALUES (
    v_actor_id, v_assignment.position_key, v_assignment.committee_key, 'profile',
    'Structured executive committee content',
    jsonb_build_object(
      'version', 1,
      'kind', 'profile',
      'display', jsonb_build_object(
        'applicantName', COALESCE(NULLIF(btrim(v_profile.name), ''), v_assignment.position_key),
        'applicantEmail', COALESCE(v_profile.contact_email, '')
      ),
      'payload', jsonb_build_object('committeeId', v_assignment.committee_key)
    )::text,
    'pending', v_base, v_proposed, 1
  ) RETURNING * INTO v_request;
  RETURN v_request;
END
$function$;

CREATE OR REPLACE FUNCTION public.approve_profile_edit_request(
  p_request_id uuid,
  p_revised_snapshot jsonb DEFAULT NULL,
  p_decision_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_request public.edit_requests%ROWTYPE;
  v_site public.published_site_content%ROWTYPE;
  v_committees jsonb;
  v_committee jsonb;
  v_current jsonb;
  v_final jsonb;
  v_next_committees jsonb;
  v_publication jsonb;
  v_source_member_count integer;
  v_final_member_count integer;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may approve profile edits';
  END IF;

  SELECT * INTO v_request
  FROM public.edit_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' OR v_request.edit_type <> 'profile'
     OR v_request.profile_base_snapshot IS NULL
     OR v_request.profile_proposed_snapshot IS NULL
     OR v_request.profile_payload_version <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending structured profile edit not found';
  END IF;

  SELECT * INTO v_site
  FROM public.published_site_content
  WHERE id = 'main'
  FOR UPDATE;
  IF NOT FOUND OR jsonb_typeof(v_site.content -> 'committees') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PROFILE_EDIT_COMMITTEES_NOT_FOUND';
  END IF;
  v_committees := v_site.content -> 'committees';
  SELECT committee_item INTO v_committee
  FROM jsonb_array_elements(v_committees) AS committee_item
  WHERE committee_item ->> 'id' = v_request.committee_key
  LIMIT 1;
  v_current := private.executive_profile_snapshot_from_committee(v_committee);
  IF v_current IS DISTINCT FROM v_request.profile_base_snapshot THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'PROFILE_EDIT_STALE';
  END IF;

  IF p_revised_snapshot IS NULL THEN
    v_final := private.normalize_executive_profile_snapshot(
      v_request.profile_proposed_snapshot,
      v_request.profile_proposed_snapshot,
      false
    );
  ELSE
    v_final := private.normalize_executive_profile_snapshot(
      p_revised_snapshot,
      v_request.profile_proposed_snapshot,
      false
    );
    v_source_member_count := jsonb_array_length(v_request.profile_proposed_snapshot -> 'members');
    v_final_member_count := jsonb_array_length(v_final -> 'members');
    IF v_source_member_count <> v_final_member_count OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_request.profile_proposed_snapshot -> 'members') AS source_member
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_final -> 'members') AS final_member
        WHERE final_member ->> 'id' = source_member ->> 'id'
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_REVISION_MEMBER_SET_CHANGED';
    END IF;
  END IF;
  IF v_final = v_current THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROFILE_EDIT_NO_CHANGES';
  END IF;

  SELECT jsonb_agg(
    CASE
      WHEN committee_item ->> 'id' = v_request.committee_key THEN committee_item || v_final
      ELSE committee_item
    END
    ORDER BY position
  ) INTO v_next_committees
  FROM jsonb_array_elements(v_committees) WITH ORDINALITY AS rows(committee_item, position);

  v_publication := private.publish_cms_target_locked(
    v_actor_id,
    'committees',
    v_next_committees,
    v_site.version
  );
  IF v_actor_id IS DISTINCT FROM (SELECT auth.uid())
     OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Approval authority changed';
  END IF;

  UPDATE public.edit_requests
  SET status = 'approved',
      profile_proposed_snapshot = v_final,
      decision_note = NULLIF(btrim(p_decision_note), ''),
      reviewed_by = v_actor_id,
      reviewed_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN jsonb_build_object('request', to_jsonb(v_request), 'publication', v_publication);
EXCEPTION
  WHEN serialization_failure THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'PROFILE_EDIT_STALE';
END
$function$;

CREATE OR REPLACE FUNCTION public.reject_profile_edit_request(
  p_request_id uuid,
  p_decision_note text DEFAULT NULL
)
RETURNS public.edit_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_request public.edit_requests%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL OR NOT (SELECT private.is_current_president()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the current president may reject profile edits';
  END IF;
  UPDATE public.edit_requests
  SET status = 'rejected',
      decision_note = NULLIF(btrim(p_decision_note), ''),
      reviewed_by = v_actor_id,
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending' AND edit_type = 'profile'
  RETURNING * INTO v_request;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Pending profile edit not found';
  END IF;
  RETURN v_request;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_profile_edit_request(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.approve_profile_edit_request(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reject_profile_edit_request(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.submit_profile_edit_request(jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_profile_edit_request(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_profile_edit_request(uuid, text) TO authenticated;
