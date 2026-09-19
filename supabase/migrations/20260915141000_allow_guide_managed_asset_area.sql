-- Forward-only migration. The managed_assets.area column CHECK predates the
-- guide-document feature: it allows only the legacy areas, so register_managed_asset
-- can never insert a guide asset row even though the storage policy and the
-- register RPC already authorize PRESIDENT / MEDIA_HEAD guide documents behind the
-- 'documents/<owner>/guide/...' path marker. The area value is only ever written
-- by that RPC after the guide path marker is verified, so widening the column
-- CHECK to include 'guide' adds no new write surface.
--
-- The column CHECK was declared inline (area text NOT NULL CHECK (area IN (...))),
-- so PostgreSQL auto-named it managed_assets_area_check. Recreating the constraint
-- under the same explicit name keeps the allowed set exactly the seven legacy areas
-- plus guide and rejects every unknown area.

ALTER TABLE public.managed_assets
  DROP CONSTRAINT IF EXISTS managed_assets_area_check;
ALTER TABLE public.managed_assets
  ADD CONSTRAINT managed_assets_area_check
  CHECK (area IN ('news', 'events', 'gallery', 'site', 'plans', 'reports', 'avatar', 'guide'));

COMMIT;