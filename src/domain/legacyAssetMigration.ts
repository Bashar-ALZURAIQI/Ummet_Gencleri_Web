import type { ManagedAssetUsage } from './managedAssets.ts';

export interface LegacyImageAsset {
  path: Array<string | number>;
  sourceUrl: string;
  usage: ManagedAssetUsage;
}

const OFFICIAL_STORAGE_PREFIX = 'https://rscunkzvbsdbjzhnuria.supabase.co/storage/v1/object/public/';
const IMAGE_FIELD_NAMES = new Set(['image', 'photo', 'coverImage', 'thumbnail']);

function isExternalHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  return !value.startsWith(OFFICIAL_STORAGE_PREFIX);
}

function usageForPath(path: Array<string | number>, parent: unknown): ManagedAssetUsage {
  const keys = path.map(String);
  const field = keys[keys.length - 1] ?? '';
  if (field === 'photo' || keys.includes('committees') || keys.includes('members')) return 'avatar';
  if (keys.includes('news')) return 'news-image';
  if (keys.includes('events')) return 'event-image';
  if (keys.includes('galleryAlbums') || keys.includes('gallery') || field === 'coverImage' || field === 'thumbnail') return 'gallery-image';
  if (field === 'url' && parent && typeof parent === 'object' && (parent as { type?: unknown }).type === 'photo') return 'gallery-image';
  return 'site-image';
}

function isImageLocation(path: Array<string | number>, parent: unknown): boolean {
  const field = String(path[path.length - 1] ?? '');
  if (IMAGE_FIELD_NAMES.has(field)) return true;
  if (field === 'url' && parent && typeof parent === 'object' && (parent as { type?: unknown }).type === 'photo') return true;
  const parentField = String(path[path.length - 2] ?? '');
  return parentField === 'images';
}

export function collectLegacyImageAssets(value: unknown): LegacyImageAsset[] {
  const assets: LegacyImageAsset[] = [];

  const visit = (current: unknown, path: Array<string | number>, parent: unknown) => {
    if (typeof current === 'string') {
      if (isImageLocation(path, parent) && isExternalHttpUrl(current)) {
        assets.push({ path, sourceUrl: current, usage: usageForPath(path, parent) });
      }
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, [...path, index], current));
      return;
    }
    if (!current || typeof current !== 'object') return;
    Object.entries(current).forEach(([key, child]) => visit(child, [...path, key], current));
  };

  visit(value, [], null);
  return assets;
}

export function replaceLegacyAssetUrls<T>(value: T, replacements: ReadonlyMap<string, string>): T {
  const next = structuredClone(value);
  const assets = collectLegacyImageAssets(next);
  for (const asset of assets) {
    const replacement = replacements.get(asset.sourceUrl);
    if (!replacement) continue;
    let cursor: unknown = next;
    for (let index = 0; index < asset.path.length - 1; index += 1) {
      cursor = (cursor as Record<string | number, unknown>)[asset.path[index]];
    }
    (cursor as Record<string | number, unknown>)[asset.path[asset.path.length - 1]] = replacement;
  }
  return next;
}
