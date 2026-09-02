import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL(
  '../supabase/migrations/20260831120000_site_assets_branding.sql',
  import.meta.url,
);

test('site_assets branding migration keeps the storage and registration contracts', () => {
  const sql = readFileSync(fileURLToPath(migrationUrl), 'utf8');

  assert.match(sql, /'site_assets'[\s\S]*true[\s\S]*5242880/);
  assert.match(sql, /image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/);
  assert.match(sql, /site_assets_public_read/);
  assert.match(sql, /site_assets_president_insert/);
  assert.match(sql, /site_assets_president_delete/);
  assert.match(sql, /position_key\s*=\s*'PRESIDENT'/);
  assert.match(sql, /\(storage\.foldername\(name\)\)\[1\]\s*=\s*'branding'/);
  assert.match(sql, /name\s*~\*[\s\S]*\^branding\//);
  assert.match(sql, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}/);
  assert.match(sql, /metadata\s*->>\s*'mimetype'/);
  assert.match(sql, /asset_bucket\s*=\s*'site_assets'/);
  assert.match(sql, /asset_area\s*<>\s*'site'/);
  assert.match(sql, /asset_mime_type\s+NOT IN\s*\('image\/jpeg',\s*'image\/png',\s*'image\/webp'\)/);
  assert.match(sql, /cardinality\(string_to_array\(asset_path, '\/'\)\)\s*<>\s*3/);
  assert.match(sql, /split_part\(asset_path, '\/', 3\)\s*!~\*[\s\S]*asset_id::text/);
  assert.match(sql, /image\/jpeg[\s\S]*\[.]\(jpg\|jpeg\)[\s\S]*image\/png[\s\S]*\[.]png[\s\S]*image\/webp[\s\S]*\[.]webp/);
  assert.doesNotMatch(sql, /CREATE POLICY site_assets_[^;]*FOR UPDATE/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.register_managed_asset[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.register_managed_asset[\s\S]*TO authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.register_managed_asset[\s\S]*TO (?:anon|service_role)/);
});

test('site logo replacement RPC atomically locks, validates, publishes, and transitions both assets', () => {
  const sql = readFileSync(fileURLToPath(migrationUrl), 'utf8');

  assert.match(sql, /FUNCTION public\.replace_site_logo\(\s*p_new_content jsonb,\s*p_expected_version bigint,\s*p_new_asset_id uuid/);
  assert.match(sql, /FROM public\.published_site_content[\s\S]*FOR UPDATE/);
  assert.match(sql, /FROM public\.managed_assets[\s\S]*ORDER BY asset\.id[\s\S]*FOR UPDATE/);
  assert.match(sql, /v_new_asset\.status\s+IS DISTINCT FROM\s+'pending'/);
  assert.match(sql, /v_new_asset\.owner_id\s+IS DISTINCT FROM\s+v_actor_id/);
  assert.match(sql, /p_new_content\s*#>>\s*'\{brand,logoUrl\}'[\s\S]*v_new_asset\.public_url/);
  assert.match(sql, /p_new_content\s*#>>\s*'\{brand,logoPath\}'[\s\S]*v_new_asset\.object_path/);
  assert.match(sql, /v_old_asset\.status\s+IS DISTINCT FROM\s+'active'/);
  assert.match(sql, /SET status = 'active'[\s\S]*SET status = 'replaced'/);
  assert.match(sql, /jsonb_build_object\([\s\S]*'new_asset'[\s\S]*'old_asset'/);
  assert.match(sql, /SECURITY DEFINER\s*SET search_path = ''/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.replace_site_logo\(jsonb, bigint, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.replace_site_logo\(jsonb, bigint, uuid\)[\s\S]*TO authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.replace_site_logo\(jsonb, bigint, uuid\)[\s\S]*TO (?:anon|service_role)/);
});
