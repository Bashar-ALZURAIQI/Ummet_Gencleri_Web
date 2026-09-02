export type WebPushCmsTarget = 'news' | 'events' | 'galleryAlbums';
export type WebPushContentKind = 'NEWS' | 'EVENT' | 'GALLERY_ALBUM';

export interface CmsPushNotificationDraft {
  kind: WebPushContentKind;
  sourceEventKey: string;
  title: string;
  body: string;
  destination: string;
}

interface CmsItem {
  id: string;
  title: string;
}

const TARGET_META: Record<WebPushCmsTarget, {
  kind: WebPushContentKind;
  body: string;
  destination: string;
}> = {
  news: {
    kind: 'NEWS',
    body: 'تم نشر خبر جديد في موقع الاتحاد.',
    destination: '/?push=news',
  },
  events: {
    kind: 'EVENT',
    body: 'تمت إضافة فعالية أو برنامج جديد.',
    destination: '/?push=programs',
  },
  galleryAlbums: {
    kind: 'GALLERY_ALBUM',
    body: 'تم نشر ألبوم صور جديد.',
    destination: '/?push=gallery',
  },
};

const validItem = (value: unknown): CmsItem | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.title !== 'string') return null;
  const id = record.id.trim();
  const title = record.title.trim();
  return id && title ? { id, title } : null;
};

const normalizedItems = (values: unknown[]): CmsItem[] => {
  const items = values.map(validItem).filter((item): item is CmsItem => item !== null);
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new Error('CMS_CONTENT_DUPLICATE_ID');
    seen.add(item.id);
  }
  return items;
};

export function deriveNewCmsPushNotifications(
  previousValue: unknown[],
  currentValue: unknown[],
  targetValue: string,
): CmsPushNotificationDraft[] {
  if (!(targetValue in TARGET_META)) throw new Error('CMS_PUSH_TARGET_INVALID');
  const target = targetValue as WebPushCmsTarget;
  const previousIds = new Set(normalizedItems(previousValue).map((item) => item.id));
  const current = normalizedItems(currentValue);
  const meta = TARGET_META[target];
  return current
    .filter((item) => !previousIds.has(item.id))
    .map((item) => ({
      kind: meta.kind,
      sourceEventKey: `cms:${target}:${item.id}`,
      title: `جديد اتحاد شباب الأمة: ${item.title}`,
      body: meta.body,
      destination: meta.destination,
    }));
}
