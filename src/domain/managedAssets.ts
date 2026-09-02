export type ManagedAssetKind = 'image' | 'video' | 'document';
export type ManagedAssetArea = 'news' | 'events' | 'gallery' | 'site' | 'plans' | 'reports' | 'avatar';
export type ManagedAssetUsage =
  | 'avatar'
  | 'news-image'
  | 'event-image'
  | 'gallery-image'
  | 'site-image'
  | 'site-logo'
  | 'plan-document'
  | 'report-document'
  | 'video-file';

export interface ManagedFileLike {
  name: string;
  type: string;
  size: number;
}

export interface ManagedAssetRoute {
  bucket: 'avatars' | 'gallery' | 'site_assets';
  folder: 'news' | 'events' | 'albums' | 'site' | 'documents' | 'videos' | 'branding' | null;
  kind: ManagedAssetKind;
  area: ManagedAssetArea;
}

export type ManagedFileValidation =
  | { ok: true; extension: string; maxBytes: number }
  | { ok: false; code: string; message: string };

export type ManagedPathResult =
  | { ok: true; path: string }
  | { ok: false; code: string; message: string };

const MB = 1024 * 1024;
export const MANAGED_FILE_LIMITS: Readonly<Record<ManagedAssetKind, number>> = {
  image: 5 * MB,
  video: 50 * MB,
  document: 20 * MB,
};

interface MimeRule {
  extension: string;
  acceptedExtensions: readonly string[];
}

const MIME_RULES: Readonly<Record<ManagedAssetKind, Readonly<Record<string, MimeRule>>>> = {
  image: {
    'image/jpeg': { extension: 'jpg', acceptedExtensions: ['jpg', 'jpeg'] },
    'image/png': { extension: 'png', acceptedExtensions: ['png'] },
    'image/webp': { extension: 'webp', acceptedExtensions: ['webp'] },
    'image/gif': { extension: 'gif', acceptedExtensions: ['gif'] },
  },
  video: {
    'video/mp4': { extension: 'mp4', acceptedExtensions: ['mp4'] },
    'video/webm': { extension: 'webm', acceptedExtensions: ['webm'] },
    'video/quicktime': { extension: 'mov', acceptedExtensions: ['mov'] },
  },
  document: {
    'application/pdf': { extension: 'pdf', acceptedExtensions: ['pdf'] },
    'application/msword': { extension: 'doc', acceptedExtensions: ['doc'] },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: 'docx', acceptedExtensions: ['docx'] },
    'application/vnd.ms-excel': { extension: 'xls', acceptedExtensions: ['xls'] },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extension: 'xlsx', acceptedExtensions: ['xlsx'] },
    'application/vnd.ms-powerpoint': { extension: 'ppt', acceptedExtensions: ['ppt'] },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { extension: 'pptx', acceptedExtensions: ['pptx'] },
    'text/plain': { extension: 'txt', acceptedExtensions: ['txt'] },
  },
};

const SITE_LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

function acceptsMimeForUsage(usage: ManagedAssetUsage | undefined, mimeType: string): boolean {
  return usage !== 'site-logo' || SITE_LOGO_MIME_TYPES.includes(mimeType as typeof SITE_LOGO_MIME_TYPES[number]);
}

const ROUTES: Readonly<Record<ManagedAssetUsage, ManagedAssetRoute>> = {
  avatar: { bucket: 'avatars', folder: null, kind: 'image', area: 'avatar' },
  'news-image': { bucket: 'gallery', folder: 'news', kind: 'image', area: 'news' },
  'event-image': { bucket: 'gallery', folder: 'events', kind: 'image', area: 'events' },
  'gallery-image': { bucket: 'gallery', folder: 'albums', kind: 'image', area: 'gallery' },
  'site-image': { bucket: 'gallery', folder: 'site', kind: 'image', area: 'site' },
  'site-logo': { bucket: 'site_assets', folder: 'branding', kind: 'image', area: 'site' },
  'plan-document': { bucket: 'gallery', folder: 'documents', kind: 'document', area: 'plans' },
  'report-document': { bucket: 'gallery', folder: 'documents', kind: 'document', area: 'reports' },
  'video-file': { bucket: 'gallery', folder: 'videos', kind: 'video', area: 'gallery' },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function routeForUsage(usage: ManagedAssetUsage): ManagedAssetRoute {
  return ROUTES[usage];
}

function fileExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match?.[1]?.toLowerCase() ?? '';
}

export function validateManagedFile(
  file: ManagedFileLike,
  kind: ManagedAssetKind,
  usage?: ManagedAssetUsage,
): ManagedFileValidation {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, code: 'FILE_EMPTY', message: 'الملف فارغ أو حجمه غير صالح.' };
  }
  const maxBytes = MANAGED_FILE_LIMITS[kind];
  if (file.size > maxBytes) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: 'حجم الملف أكبر من الحد المسموح.' };
  }
  const mimeType = String(file.type).toLowerCase();
  const rule = MIME_RULES[kind][mimeType];
  if (!rule || !acceptsMimeForUsage(usage, mimeType)) {
    return { ok: false, code: 'FILE_TYPE_UNSUPPORTED', message: 'نوع الملف غير مسموح.' };
  }
  const extension = fileExtension(file.name);
  if (extension && !rule.acceptedExtensions.includes(extension)) {
    return { ok: false, code: 'FILE_EXTENSION_MISMATCH', message: 'امتداد الملف لا يطابق نوعه الحقيقي.' };
  }
  return { ok: true, extension: rule.extension, maxBytes };
}

export function buildManagedAssetPath(input: {
  usage: ManagedAssetUsage;
  ownerId: string;
  assetId: string;
  mimeType: string;
}): ManagedPathResult {
  if (!UUID_PATTERN.test(input.ownerId) || !UUID_PATTERN.test(input.assetId)) {
    return { ok: false, code: 'ASSET_UUID_INVALID', message: 'تعذر إنشاء مسار آمن للملف.' };
  }
  const route = routeForUsage(input.usage);
  const mimeType = input.mimeType.toLowerCase();
  const rule = MIME_RULES[route.kind][mimeType];
  if (!rule || !acceptsMimeForUsage(input.usage, mimeType)) {
    return { ok: false, code: 'FILE_TYPE_UNSUPPORTED', message: 'نوع الملف غير مسموح.' };
  }
  const path = route.bucket === 'avatars'
    ? `${input.ownerId}/avatar-${input.assetId}.${rule.extension}`
    : `${route.folder}/${input.ownerId}/${input.assetId}.${rule.extension}`;
  return { ok: true, path };
}

export function isOwnedManagedPath(path: string, ownerId: string): boolean {
  if (!UUID_PATTERN.test(ownerId)) return false;
  const escapedOwner = ownerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  const gallery = new RegExp(`^(?:news|events|albums|site|documents|videos)/${escapedOwner}/${uuid}\\.(?:jpg|png|webp|gif|mp4|webm|mov|pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$`, 'i');
  const branding = new RegExp(`^branding/${escapedOwner}/${uuid}\\.(?:jpg|png|webp)$`, 'i');
  const avatar = new RegExp(`^${escapedOwner}/avatar-${uuid}\\.(?:jpg|png|webp)$`, 'i');
  return gallery.test(path) || branding.test(path) || avatar.test(path);
}

export function acceptForUsage(usage: ManagedAssetUsage): string {
  if (usage === 'site-logo') return SITE_LOGO_MIME_TYPES.join(',');
  const route = routeForUsage(usage);
  return Object.keys(MIME_RULES[route.kind]).join(',');
}
