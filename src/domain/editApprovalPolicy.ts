import type {
  PendingProfileEdit,
  PendingSiteEdit,
  ProfileEditDiff,
  SiteEditDiff,
  SiteEditOp,
  SiteEditSubmit,
  SiteEditTarget,
} from '../data/mockData.ts';
import {
  normalizeExecutiveContentSnapshot,
  type ExecutiveContentSnapshot,
} from './executiveEditWorkflow.ts';

type JsonRecord = Record<string, unknown>;
type ValueKind =
  | 'string' | 'number' | 'boolean' | 'string-array'
  | 'stats-array' | 'feature-array' | 'mission-cards' | 'goal-cards' | 'guide-items';

export type ApprovalResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type ProfilePatchResult =
  | { ok: true; patch: Partial<Pick<PendingProfileEdit['snapshot'], 'responsibilities' | 'stats' | 'members'>> }
  | { ok: false; error: string };

const fail = <T>(error = 'الطلب غير صالح أو يحتوي حقولًا غير مسموح بها.'): ApprovalResult<T> => ({ ok: false, error });
const profileFail = (error = 'طلب تعديل الهيئة غير صالح أو لا يطابق الملخص المعروض.'): ProfilePatchResult => ({ ok: false, error });
const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value: JsonRecord, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));

const scalarSchemas: Record<Exclude<SiteEditTarget, 'site' | 'about'>, Record<string, ValueKind>> = {
  programsContent: { badge: 'string', title: 'string', description: 'string' },
  events: {
    title: 'string', category: 'string', date: 'string', location: 'string', description: 'string',
    status: 'string', capacity: 'number', registered: 'number', image: 'string', showOnHomepage: 'boolean', eventUrl: 'string',
  },
  galleryAlbums: {
    title: 'string', categoryId: 'string', date: 'string', location: 'string', coverImage: 'string',
    photoCount: 'number', videoCount: 'number', description: 'string',
  },
  galleryCategories: { label: 'string' },
  guideSections: { label: 'string', icon: 'string', color: 'string', bg: 'string', title: 'string', intro: 'string', items: 'guide-items' },
  guideQuickInfo: { value: 'string' },
  faqCategories: { title: 'string', icon: 'string', color: 'string', bg: 'string' },
  contactCards: { title: 'string', value: 'string', sub: 'string' },
  contactMap: { title: 'string', embedUrl: 'string', openUrl: 'string' },
  news: {
    title: 'string', category: 'string', date: 'string', excerpt: 'string', fullContent: 'string',
    pinnedOnHomepage: 'boolean', image: 'string', externalUrl: 'string',
  },
};

const nestedSchemas: Partial<Record<SiteEditTarget, Record<string, Record<string, ValueKind>>>> = {
  guideSections: {
    items: { heading: 'string', body: 'string', tips: 'string-array' },
    contacts: { label: 'string', value: 'string', type: 'string' },
  },
  faqCategories: { items: { question: 'string', answer: 'string' } },
  galleryAlbums: {
    media: { type: 'string', url: 'string', thumbnail: 'string', caption: 'string', photoUrl: 'string' },
  },
};

const allowedOps: Record<SiteEditTarget, readonly SiteEditOp[]> = {
  site: ['set'],
  about: ['set'],
  programsContent: ['update'],
  events: ['add', 'update', 'delete'],
  galleryAlbums: ['add', 'update', 'delete'],
  galleryCategories: ['add', 'update', 'delete'],
  guideSections: ['add', 'update', 'delete'],
  guideQuickInfo: ['update'],
  faqCategories: ['add', 'update', 'delete'],
  contactCards: ['update'],
  contactMap: ['update'],
  news: ['add', 'update', 'delete'],
};

const exactContentPaths: Record<'site' | 'about', Record<string, ValueKind>> = {
  site: {
    'brand.name': 'string', 'brand.nameTr': 'string', 'brand.logoIcon': 'string',
    'footer.phone': 'string', 'footer.email': 'string', 'footer.address': 'string', 'footer.copyright': 'string',
    'footer.social.facebook': 'string', 'footer.social.twitter': 'string', 'footer.social.instagram': 'string', 'footer.social.youtube': 'string',
    'hero.badge': 'string', 'hero.title': 'string', 'hero.subtitle': 'string', 'hero.description': 'string',
    'hero.primaryBtn': 'string', 'hero.secondaryBtn': 'string', 'hero.tertiaryBtn': 'string', 'hero.image': 'string',
    'hero.badge1.value': 'string', 'hero.badge1.label': 'string', 'hero.badge1.icon': 'string',
    'hero.badge2.value': 'string', 'hero.badge2.label': 'string', 'hero.badge2.icon': 'string',
    stats: 'stats-array',
    'about.badge': 'string', 'about.title': 'string', 'about.description': 'string', 'about.image': 'string',
    'about.imageBadge.value': 'string', 'about.imageBadge.label': 'string', 'about.features': 'feature-array',
    'boardPreview.title': 'string', 'boardPreview.subtitle': 'string', 'boardPreview.description': 'string', 'boardPreview.memberIds': 'string-array',
  },
  about: {
    'header.badge': 'string', 'header.title': 'string', 'header.description': 'string',
    'story.badge': 'string', 'story.title': 'string', 'story.paragraphs': 'string-array', 'story.images': 'string-array',
    'mission.badge': 'string', 'mission.title': 'string', 'mission.cards': 'mission-cards',
    'goals.badge': 'string', 'goals.title': 'string', 'goals.cards': 'goal-cards',
    'cta.icon': 'string', 'cta.title': 'string', 'cta.description': 'string', 'cta.buttonText': 'string',
  },
};

const dynamicContentKind = (target: 'site' | 'about', path: string): ValueKind | null => {
  const exact = exactContentPaths[target][path];
  if (exact) return exact;
  if (target === 'site') {
    if (/^stats\.\d+\.value$/.test(path)) return 'number';
    if (/^stats\.\d+\.(label|icon)$/.test(path)) return 'string';
    if (/^about\.features\.\d+\.(icon|title|desc)$/.test(path)) return 'string';
  } else {
    if (/^story\.(paragraphs|images)\.\d+$/.test(path)) return 'string';
    if (/^mission\.cards\.\d+\.(icon|title|text)$/.test(path)) return 'string';
    if (/^goals\.cards\.\d+\.(icon|title|desc)$/.test(path)) return 'string';
  }
  return null;
};

const formatValue = (value: unknown): string => {
  if (Array.isArray(value) || isRecord(value)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  return value === null || value === undefined ? '' : String(value);
};

const decodeValue = (kind: ValueKind, text: string): ApprovalResult<unknown> => {
  if (kind === 'string') return { ok: true, value: text };
  if (kind === 'number') {
    const value = Number(text);
    return Number.isFinite(value) ? { ok: true, value } : fail('القيمة الرقمية في الطلب غير صالحة.');
  }
  if (kind === 'boolean') {
    if (text === 'نعم' || text === 'true' || text === '1' || text === '✓') return { ok: true, value: true };
    if (text === 'لا' || text === 'false' || text === '0' || text === '') return { ok: true, value: false };
    return fail('القيمة المنطقية في الطلب غير صالحة.');
  }
  if (kind === 'string-array') {
    try {
      const parsed = text.trim().startsWith('[') ? JSON.parse(text) : text.split(' • ').filter(Boolean);
      return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
        ? { ok: true, value: parsed }
        : fail('قائمة النصوص في الطلب غير صالحة.');
    } catch {
      return fail('قائمة النصوص في الطلب غير صالحة.');
    }
  }
  const recordArraySchemas: Partial<Record<ValueKind, readonly string[]>> = {
    'stats-array': ['value', 'label', 'icon'],
    'feature-array': ['icon', 'title', 'desc'],
    'mission-cards': ['icon', 'title', 'text'],
    'goal-cards': ['icon', 'title', 'desc'],
    'guide-items': ['id', 'heading', 'body', 'tips'],
  };
  try {
    const parsed = JSON.parse(text);
    const keys = recordArraySchemas[kind];
    if (!keys || !Array.isArray(parsed)) return fail('بنية الطلب غير صالحة.');
    const valid = parsed.every((item) => (
      isRecord(item)
      && hasOnlyKeys(item, keys)
      && keys.every((key) => (
        key === 'tips'
          ? Array.isArray(item[key]) && item[key].every((tip) => typeof tip === 'string')
          : typeof item[key] === (key === 'value' && kind === 'stats-array' ? 'number' : 'string')
      ))
    ));
    return valid ? { ok: true, value: parsed } : fail('بنية الطلب تحتوي حقولًا غير مسموح بها.');
  } catch {
    return fail('بنية الطلب غير صالحة.');
  }
};

const getByPath = (root: unknown, path: string): unknown => {
  let current = root;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    } else if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
};

const setByPath = (root: unknown, path: string, value: unknown): unknown => {
  const segments = path.split('.');
  const clone = structuredClone(root);
  let current: unknown = clone;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    current = Array.isArray(current) ? current[Number(segment)] : (current as JsonRecord)[segment];
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(current)) current[Number(last)] = value;
  else (current as JsonRecord)[last] = value;
  return clone;
};

const sameDiffContract = (original: SiteEditDiff[], revised: SiteEditDiff[]): boolean => (
  original.length === revised.length
  && original.every((row, index) => {
    const next = revised[index];
    return !!next
      && row.label === next.label
      && row.path === next.path
      && row.oldValue === next.oldValue
      && row.editable === next.editable
      && (row.editable !== false || row.newValue === next.newValue);
  })
);

const generatedOpaqueId = (prefix: string) => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
};

const generatedId = (target: SiteEditTarget) => generatedOpaqueId(target);

const defaultsFor = (target: Exclude<SiteEditTarget, 'site' | 'about' | 'programsContent' | 'guideQuickInfo'>): JsonRecord => {
  const id = generatedId(target);
  switch (target) {
    case 'events': return { id, title: '', category: 'workshop', date: '', location: '', description: '', status: 'upcoming', capacity: 0, registered: 0, image: '', showOnHomepage: false };
    case 'galleryAlbums': return { id, title: '', categoryId: '', date: '', location: '', coverImage: '', photoCount: 0, videoCount: 0, description: '', media: [] };
    case 'galleryCategories': return { id, label: '' };
    case 'guideSections': return { id, label: '', icon: '', color: '', bg: '', title: '', intro: '', items: [], contacts: [] };
    case 'faqCategories': return { id, title: '', icon: '', color: '', bg: '', items: [] };
    case 'contactCards': return { id, title: '', value: '', sub: '' };
    case 'contactMap': return { title: '', embedUrl: '', openUrl: '' };
    case 'news': return { id, title: '', category: '', date: '', excerpt: '', fullContent: '', pinnedOnHomepage: false, image: '', externalUrl: '' };
  }
};

const identityFieldFor = (target: SiteEditTarget, nestedField?: string): string => {
  if (nestedField === 'items') return target === 'faqCategories' ? 'question' : 'heading';
  if (nestedField === 'contacts') return 'label';
  if (nestedField === 'media') return 'url';
  return target === 'galleryCategories' || target === 'guideSections' ? 'label' : 'title';
};

const withDerivedNestedFields = (parent: JsonRecord, parentField: string, items: unknown[]): JsonRecord => {
  if (parentField !== 'media') return { ...parent, [parentField]: items };
  return {
    ...parent,
    media: items,
    photoCount: items.filter((item) => isRecord(item) && item.type === 'photo').length,
    videoCount: items.filter((item) => isRecord(item) && item.type === 'video').length,
  };
};

const validatePayloadSurface = (edit: SiteEditSubmit | PendingSiteEdit): ApprovalResult<true> => {
  if (!allowedOps[edit.target]?.includes(edit.op)) return fail('نوع العملية غير مسموح لهذا القسم.');
  if (Object.prototype.hasOwnProperty.call(edit, 'fieldValue') || Object.prototype.hasOwnProperty.call(edit, 'recordValue')) {
    return fail('الطلب يحتوي بيانات مخفية غير مسموح بتطبيقها.');
  }
  if (!Array.isArray(edit.diffs) || edit.diffs.length === 0) return fail();
  const seen = new Set<string>();
  for (const diff of edit.diffs) {
    if (!diff || typeof diff.label !== 'string' || typeof diff.oldValue !== 'string' || typeof diff.newValue !== 'string') return fail();
    if (diff.path) {
      if (seen.has(diff.path)) return fail('الطلب يكرر الحقل نفسه.');
      seen.add(diff.path);
    }
  }
  return { ok: true, value: true };
};

const targetPageMeta: Record<SiteEditTarget, { pageId: string; pageLabel: string }> = {
  site: { pageId: 'home', pageLabel: 'الصفحة الرئيسية' },
  about: { pageId: 'about', pageLabel: 'من نحن' },
  programsContent: { pageId: 'programs', pageLabel: 'البرامج والأنشطة' },
  events: { pageId: 'programs', pageLabel: 'البرامج والأنشطة' },
  galleryAlbums: { pageId: 'gallery', pageLabel: 'معرض الصور' },
  galleryCategories: { pageId: 'gallery', pageLabel: 'معرض الصور' },
  guideSections: { pageId: 'guide', pageLabel: 'دليل الطالب' },
  guideQuickInfo: { pageId: 'guide', pageLabel: 'دليل الطالب' },
  faqCategories: { pageId: 'faq', pageLabel: 'الأسئلة الشائعة' },
  contactCards: { pageId: 'contact', pageLabel: 'اتصل بنا' },
  contactMap: { pageId: 'contact', pageLabel: 'اتصل بنا' },
  news: { pageId: 'news', pageLabel: 'الأخبار' },
};

const targetFieldLabels: Partial<Record<SiteEditTarget, Record<string, string>>> = {
  news: {
    title: 'عنوان الخبر', category: 'تصنيف الخبر', date: 'تاريخ الخبر', excerpt: 'ملخص الخبر',
    fullContent: 'محتوى الخبر', pinnedOnHomepage: 'التثبيت في الرئيسية', image: 'صورة الخبر', externalUrl: 'رابط الخبر الخارجي',
  },
  events: {
    title: 'عنوان الفعالية', category: 'تصنيف الفعالية', date: 'تاريخ الفعالية', location: 'مكان الفعالية',
    description: 'وصف الفعالية', status: 'حالة الفعالية', capacity: 'السعة', registered: 'عدد المسجلين',
    image: 'صورة الفعالية', showOnHomepage: 'العرض في الرئيسية', eventUrl: 'رابط الفعالية',
  },
  galleryAlbums: {
    title: 'عنوان الألبوم', categoryId: 'تصنيف الألبوم', date: 'تاريخ الألبوم', location: 'مكان الألبوم',
    coverImage: 'صورة الغلاف', photoCount: 'عدد الصور', videoCount: 'عدد الفيديوهات', description: 'وصف الألبوم',
  },
  galleryCategories: { label: 'اسم التصنيف' },
  guideSections: {
    label: 'اسم القسم', icon: 'أيقونة القسم', color: 'لون القسم', bg: 'خلفية القسم', title: 'عنوان القسم',
    intro: 'مقدمة القسم', items: 'معلومات القسم', heading: 'عنوان المعلومة', body: 'نص المعلومة', tips: 'النصائح',
    value: 'قيمة جهة الاتصال', type: 'نوع جهة الاتصال', url: 'الرابط', caption: 'الوصف',
  },
  guideQuickInfo: { value: 'المعلومة السريعة' },
  faqCategories: {
    title: 'عنوان التصنيف', icon: 'أيقونة التصنيف', color: 'لون التصنيف', bg: 'خلفية التصنيف',
    question: 'السؤال', answer: 'الإجابة',
  },
  contactCards: { title: 'عنوان وسيلة التواصل', value: 'بيانات التواصل', sub: 'الوصف الإضافي' },
  contactMap: { title: 'عنوان الخريطة', embedUrl: 'رابط تضمين الخريطة', openUrl: 'رابط فتح الخريطة' },
  programsContent: { badge: 'شارة الصفحة', title: 'عنوان الصفحة', description: 'وصف الصفحة' },
};

const nestedFieldLabels: Partial<Record<SiteEditTarget, Record<string, Record<string, string>>>> = {
  guideSections: {
    items: { heading: 'عنوان المعلومة', body: 'نص المعلومة', tips: 'النصائح' },
    contacts: { label: 'اسم جهة الاتصال', value: 'بيانات جهة الاتصال', type: 'نوع جهة الاتصال' },
  },
  faqCategories: {
    items: { question: 'السؤال', answer: 'الإجابة' },
  },
  galleryAlbums: {
    media: {
      type: 'نوع الوسائط', url: 'رابط الوسائط', thumbnail: 'الصورة المصغرة',
      caption: 'وصف الوسائط', photoUrl: 'رابط المنشور الخارجي',
    },
  },
};

const nestedSectionLabels: Partial<Record<SiteEditTarget, Record<string, string>>> = {
  guideSections: { items: 'معلومة دليل الطالب', contacts: 'جهة اتصال' },
  faqCategories: { items: 'سؤال شائع' },
  galleryAlbums: { media: 'وسائط الألبوم' },
};

const commonFieldLabels: Record<string, string> = {
  name: 'الاسم', nameTr: 'الاسم بالتركية', logoIcon: 'أيقونة الشعار', phone: 'رقم الهاتف', email: 'البريد الإلكتروني',
  address: 'العنوان', copyright: 'حقوق النشر', facebook: 'فيسبوك', twitter: 'تويتر', instagram: 'إنستغرام', youtube: 'يوتيوب',
  badge: 'الشارة', title: 'العنوان', subtitle: 'العنوان الفرعي', description: 'الوصف', image: 'الصورة',
  value: 'القيمة', label: 'التسمية', icon: 'الأيقونة', text: 'النص', desc: 'الوصف', primaryBtn: 'نص الزر الأساسي',
  secondaryBtn: 'نص الزر الثانوي', tertiaryBtn: 'نص الزر الثالث', paragraphs: 'الفقرات', images: 'الصور', cards: 'البطاقات',
  memberIds: 'أعضاء الهيئة', features: 'المميزات', stats: 'الإحصائيات',
};

const contentSectionLabels: Record<string, string> = {
  brand: 'هوية الموقع', footer: 'تذييل الموقع', hero: 'القسم الترحيبي', stats: 'الإحصائيات',
  about: 'الرؤية والرسالة', boardPreview: 'عرض الهيئة التنفيذية', header: 'ترويسة الصفحة',
  story: 'قصتنا', mission: 'الرسالة والرؤية', goals: 'الأهداف', cta: 'دعوة التسجيل',
};

const canonicalFieldLabel = (edit: SiteEditSubmit | PendingSiteEdit, diff: SiteEditDiff): string => {
  if (!diff.path) {
    if (edit.nested?.remove) return 'حذف العنصر الفرعي';
    if (edit.op === 'delete') return 'حذف السجل';
    return 'السجل';
  }
  const nestedLabel = edit.nested
    ? nestedFieldLabels[edit.target]?.[edit.nested.parentField]?.[diff.path]
    : undefined;
  if (nestedLabel) return nestedLabel;
  const targetLabel = targetFieldLabels[edit.target]?.[diff.path];
  if (targetLabel) return targetLabel;
  const pathSegments = diff.path.split('.');
  const leaf = pathSegments[pathSegments.length - 1] ?? diff.path;
  return targetFieldLabels[edit.target]?.[leaf] ?? commonFieldLabels[leaf] ?? `الحقل: ${diff.path}`;
};

const canonicalSectionLabel = (edit: SiteEditSubmit | PendingSiteEdit): string => {
  if (edit.op === 'add') return edit.nested ? 'إضافة عنصر فرعي' : 'إضافة سجل';
  if (edit.op === 'delete') return 'حذف سجل';
  if (edit.nested) {
    const nestedSubject = nestedSectionLabels[edit.target]?.[edit.nested.parentField] ?? 'عنصر فرعي';
    return edit.nested.remove ? `حذف ${nestedSubject}` : `تعديل ${nestedSubject}`;
  }
  if (edit.op === 'update') return 'تعديل سجل';
  const section = edit.path?.split('.')[0] ?? '';
  return contentSectionLabels[section] ?? 'تعديل محتوى الصفحة';
};

const validateCanonicalPaths = (edit: SiteEditSubmit | PendingSiteEdit): ApprovalResult<true> => {
  if (edit.target === 'site' || edit.target === 'about') {
    const contentTarget = edit.target;
    if (edit.op !== 'set') return fail();
    if (edit.path && (edit.diffs.length !== 1 || edit.diffs[0].path !== edit.path)) return fail();
    if (!edit.diffs.every((diff) => !!diff.path && !!dynamicContentKind(contentTarget, diff.path))) return fail();
    return { ok: true, value: true };
  }
  if (edit.target === 'guideQuickInfo') {
    return edit.op === 'update' && edit.diffs.length === 1 && edit.diffs[0].path === 'value'
      ? { ok: true, value: true }
      : fail();
  }
  if (edit.target === 'programsContent' || edit.target === 'contactMap') {
    const allowedSchema = edit.target === 'programsContent'
      ? scalarSchemas.programsContent
      : scalarSchemas.contactMap;
    return edit.op === 'update' && edit.diffs.every((diff) => !!diff.path && !!allowedSchema[diff.path])
      ? { ok: true, value: true }
      : fail();
  }
  if (edit.nested) {
    const schema = nestedSchemas[edit.target]?.[edit.nested.parentField];
    if (edit.op !== 'update' || !edit.recordId || !schema) return fail();
    if (edit.nested.remove) {
      return edit.diffs.length === 1 && !edit.diffs[0].path ? { ok: true, value: true } : fail();
    }
    return edit.diffs.every((diff) => !!diff.path && !!schema[diff.path]) ? { ok: true, value: true } : fail();
  }
  if (edit.op === 'delete') {
    return !!edit.recordId && edit.diffs.length === 1 && !edit.diffs[0].path ? { ok: true, value: true } : fail();
  }
  if (edit.op === 'update' && !edit.recordId) return fail();
  const schema = scalarSchemas[edit.target];
  return edit.diffs.every((diff) => !!diff.path && !!schema?.[diff.path]) ? { ok: true, value: true } : fail();
};

export type CanonicalSiteEditResult =
  | { ok: true; value: SiteEditSubmit; technicalIdentity: string }
  | { ok: false; error: string };

type CanonicalSiteEdit = Extract<CanonicalSiteEditResult, { ok: true }>;

const sameCanonicalDecisionContract = (original: CanonicalSiteEdit, revised: CanonicalSiteEdit): boolean => (
  original.technicalIdentity === revised.technicalIdentity
  && sameDiffContract(original.value.diffs, revised.value.diffs)
);

export function canonicalizeSiteEditSubmit(edit: SiteEditSubmit | PendingSiteEdit): CanonicalSiteEditResult {
  const surface = validatePayloadSurface(edit);
  if (!surface.ok) return surface;
  const paths = validateCanonicalPaths(edit);
  if (!paths.ok) return paths;
  const meta = targetPageMeta[edit.target];
  if (!meta) return { ok: false, error: 'القسم المطلوب غير معروف.' };
  const canonicalDiffs = edit.diffs.map((diff) => ({ ...diff, label: canonicalFieldLabel(edit, diff) }));
  const pathIdentity = canonicalDiffs.map((diff) => diff.path ?? '-').join(',');
  const value: SiteEditSubmit = {
    pageId: meta.pageId,
    pageLabel: meta.pageLabel,
    sectionLabel: canonicalSectionLabel(edit),
    target: edit.target,
    op: edit.op,
    ...(edit.recordId ? { recordId: edit.recordId } : {}),
    ...(edit.path ? { path: edit.path } : {}),
    ...(edit.nested ? { nested: { ...edit.nested } } : {}),
    diffs: canonicalDiffs,
  };
  return {
    ok: true,
    value,
    technicalIdentity: `target=${edit.target} | path=${pathIdentity} | recordId=${edit.recordId ?? '-'} | parentField=${edit.nested?.parentField ?? '-'} | itemId=${edit.nested?.itemId ?? '-'}`,
  };
}

export function deriveApprovedSiteValue(
  edit: SiteEditSubmit | PendingSiteEdit,
  revisedDiffs: SiteEditDiff[],
  currentTarget: unknown,
): ApprovalResult<unknown> {
  const surface = validatePayloadSurface(edit);
  if (!surface.ok) return surface;
  const canonical = canonicalizeSiteEditSubmit(edit);
  if (!canonical.ok) return canonical;
  const canonicalRevised = canonicalizeSiteEditSubmit({ ...canonical.value, diffs: revisedDiffs });
  if (!canonicalRevised.ok) return canonicalRevised;
  edit = canonical.value;
  revisedDiffs = canonicalRevised.value.diffs;
  if (!sameCanonicalDecisionContract(canonical, canonicalRevised)) return fail('النسخة المعتمدة لا تطابق الحقول التي راجعها الرئيس.');

  if (edit.target === 'site' || edit.target === 'about') {
    if (edit.op !== 'set') return fail();
    let next = currentTarget;
    for (const row of revisedDiffs) {
      if (!row.path) return fail();
      const kind = dynamicContentKind(edit.target, row.path);
      const current = getByPath(currentTarget, row.path);
      if (!kind || current === undefined || formatValue(current) !== row.oldValue) {
        return fail('الحالة الحالية لا تطابق النسخة التي راجعها الرئيس.');
      }
      const decoded = decodeValue(kind, row.newValue);
      if (!decoded.ok) return decoded;
      next = setByPath(next, row.path, decoded.value);
    }
    return { ok: true, value: next };
  }

  if (edit.target === 'guideQuickInfo') {
    const row = revisedDiffs[0];
    if (edit.op !== 'update' || revisedDiffs.length !== 1 || row.path !== 'value' || row.oldValue !== formatValue(currentTarget)) return fail();
    return { ok: true, value: row.newValue };
  }

  const schema = scalarSchemas[edit.target];
  if (edit.target === 'programsContent' || edit.target === 'contactMap') {
    if (!isRecord(currentTarget) || edit.op !== 'update') return fail();
    let next: unknown = currentTarget;
    for (const row of revisedDiffs) {
      const kind = row.path ? schema[row.path] : null;
      const current = row.path ? getByPath(currentTarget, row.path) : undefined;
      if (!row.path || !kind || current === undefined || formatValue(current) !== row.oldValue) return fail();
      const decoded = decodeValue(kind, row.newValue);
      if (!decoded.ok) return decoded;
      next = setByPath(next, row.path, decoded.value);
    }
    return { ok: true, value: next };
  }

  if (!Array.isArray(currentTarget)) return fail();
  const list = currentTarget as JsonRecord[];
  const recordIndex = edit.recordId ? list.findIndex((row) => row?.id === edit.recordId) : -1;

  if (edit.op === 'delete') {
    if (recordIndex < 0 || revisedDiffs.length !== 1 || revisedDiffs[0].path) return fail();
    const identity = formatValue(list[recordIndex][identityFieldFor(edit.target)]);
    if (identity !== revisedDiffs[0].oldValue) return fail('السجل الحالي لا يطابق السجل الذي راجعه الرئيس.');
    return { ok: true, value: list.filter((_, index) => index !== recordIndex) };
  }

  if (edit.nested) {
    if (edit.op !== 'update' || recordIndex < 0) return fail();
    const nestedSchema = nestedSchemas[edit.target]?.[edit.nested.parentField];
    const parent = list[recordIndex];
    const items = parent[edit.nested.parentField];
    if (!nestedSchema || !Array.isArray(items)) return fail();
    const itemIndex = items.findIndex((item) => isRecord(item) && item.id === edit.nested!.itemId);
    if (edit.nested.remove) {
      if (itemIndex < 0 || revisedDiffs.length !== 1 || revisedDiffs[0].path) return fail();
      const item = items[itemIndex] as JsonRecord;
      if (formatValue(item[identityFieldFor(edit.target, edit.nested.parentField)]) !== revisedDiffs[0].oldValue) return fail();
      const nextItems = items.filter((_, index) => index !== itemIndex);
      return { ok: true, value: list.map((row, index) => index === recordIndex ? withDerivedNestedFields(row, edit.nested!.parentField, nextItems) : row) };
    }
    let nextItem: unknown = itemIndex >= 0 ? items[itemIndex] : { id: generatedId(edit.target) };
    for (const row of revisedDiffs) {
      const kind = row.path ? nestedSchema[row.path] : null;
      if (!row.path || !kind) return fail();
      const current = itemIndex >= 0 ? getByPath(items[itemIndex], row.path) : undefined;
      if (itemIndex >= 0 && (current === undefined || formatValue(current) !== row.oldValue)) return fail();
      if (itemIndex < 0 && row.oldValue !== '' && row.oldValue !== '—') return fail();
      const decoded = decodeValue(kind, row.newValue);
      if (!decoded.ok) return decoded;
      nextItem = setByPath(nextItem, row.path, decoded.value);
    }
    const nextItems = itemIndex >= 0 ? items.map((item, index) => index === itemIndex ? nextItem : item) : [...items, nextItem];
    return { ok: true, value: list.map((row, index) => index === recordIndex ? withDerivedNestedFields(row, edit.nested!.parentField, nextItems) : row) };
  }

  if (edit.op !== 'add' && (recordIndex < 0 || !edit.recordId)) return fail();
  let nextRecord: unknown = edit.op === 'add' ? defaultsFor(edit.target) : list[recordIndex];
  for (const row of revisedDiffs) {
    const kind = row.path ? schema[row.path] : null;
    if (!row.path || !kind) return fail();
    const current = edit.op === 'add' ? undefined : getByPath(list[recordIndex], row.path);
    if (edit.op === 'add') {
      if (row.oldValue !== '' && row.oldValue !== '—') return fail();
    } else if (current === undefined || formatValue(current) !== row.oldValue) {
      return fail('الحالة الحالية لا تطابق النسخة التي راجعها الرئيس.');
    }
    const decoded = decodeValue(kind, row.newValue);
    if (!decoded.ok) return decoded;
    nextRecord = setByPath(nextRecord, row.path, decoded.value);
  }
  return edit.op === 'add'
    ? { ok: true, value: [...list, nextRecord] }
    : { ok: true, value: list.map((row, index) => index === recordIndex ? nextRecord : row) };
}

const profileSnapshotKeys = ['head', 'responsibilities', 'stats', 'members'] as const;
const headKeys = ['id', 'name', 'role', 'bio', 'email', 'photo'] as const;
const statKeys = ['label', 'value'] as const;
const memberKeys = ['id', 'name', 'position', 'photo'] as const;

export function isStrictProfileSnapshot(value: unknown): value is PendingProfileEdit['snapshot'] {
  if (!isRecord(value) || !hasOnlyKeys(value, profileSnapshotKeys)) return false;
  const head = value.head;
  if (!isRecord(head) || !hasOnlyKeys(head, headKeys) || headKeys.some((key) => head[key] !== '')) return false;
  if (!Array.isArray(value.responsibilities) || !value.responsibilities.every((item) => typeof item === 'string')) return false;
  if (!Array.isArray(value.stats) || !value.stats.every((item) => isRecord(item) && hasOnlyKeys(item, statKeys) && typeof item.label === 'string' && typeof item.value === 'string')) return false;
  return Array.isArray(value.members) && value.members.every((item) => (
    isRecord(item) && hasOnlyKeys(item, memberKeys)
    && memberKeys.every((key) => typeof item[key] === 'string')
  ));
}

const normalizeProfileSnapshotForApproval = (value: unknown): ExecutiveContentSnapshot | null => {
  const structured = normalizeExecutiveContentSnapshot(value);
  if (structured) return structured;
  if (!isStrictProfileSnapshot(value)) return null;
  return normalizeExecutiveContentSnapshot({
    responsibilities: value.responsibilities,
    stats: value.stats,
    members: value.members,
  });
};

const profileFormats = {
  responsibilities: (value: unknown) => Array.isArray(value) ? value.join(' • ') : '',
  stats: (value: unknown) => Array.isArray(value) ? value.map((item) => isRecord(item) ? `${String(item.value ?? '')} ${String(item.label ?? '')}` : '').join(' • ') : '',
  members: (value: unknown) => Array.isArray(value) ? value.map((item) => {
    if (!isRecord(item)) return '';
    const position = String(item.position ?? '');
    return position ? `${String(item.name ?? '')} (${position})` : String(item.name ?? '');
  }).join(' • ') : '',
};

const profileLabels = {
  responsibilities: 'المهام والمسؤوليات',
  stats: 'الإحصائيات',
  members: 'أعضاء اللجنة',
} as const;

type ProfileMember = PendingProfileEdit['snapshot']['members'][number];

const sanitizeProfileMembers = (
  currentMembers: ProfileMember[],
  submittedMembers: ProfileMember[],
): ApprovalResult<ProfileMember[]> => {
  const currentById = new Map<string, ProfileMember>();
  for (const member of currentMembers) {
    if (!member.id || currentById.has(member.id)) return fail('بيانات أعضاء اللجنة الحالية غير صالحة.');
    currentById.set(member.id, member);
  }
  const submittedIds = new Set<string>();
  for (const member of submittedMembers) {
    if (!member.id || submittedIds.has(member.id)) return fail('طلب الأعضاء يحتوي معرفًا مكررًا أو مفقودًا.');
    submittedIds.add(member.id);
  }

  const unknownMembers = submittedMembers.filter((member) => !currentById.has(member.id));
  if (submittedMembers.length <= currentMembers.length && unknownMembers.length > 0) {
    return fail('لا يمكن استبدال معرف عضو مخفي أثناء التعديل أو الحذف.');
  }
  if (submittedMembers.length > currentMembers.length) {
    const removedExistingMember = currentMembers.some((member) => !submittedIds.has(member.id));
    if (removedExistingMember || unknownMembers.length !== submittedMembers.length - currentMembers.length) {
      return fail('إضافة الأعضاء لا تطابق القائمة الحالية.');
    }
  }

  return {
    ok: true,
    value: submittedMembers.map((submitted) => {
      const current = currentById.get(submitted.id);
      if (current) {
        return {
          ...current,
          name: submitted.name,
          position: submitted.position,
          id: current.id,
          photo: current.photo,
        };
      }
      return {
        id: generatedOpaqueId('committee-member'),
        name: submitted.name,
        position: submitted.position,
        photo: '',
      };
    }),
  };
};

export function buildStrictProfileSummary(
  current: ExecutiveContentSnapshot,
  snapshot: ExecutiveContentSnapshot,
): ProfileEditDiff[] {
  return (Object.keys(profileLabels) as Array<keyof typeof profileLabels>).flatMap((key) => {
    const oldValue = profileFormats[key](current[key]);
    const newValue = profileFormats[key](snapshot[key]);
    return oldValue === newValue ? [] : [{ label: profileLabels[key], oldValue, newValue }];
  });
}

export function deriveApprovedProfilePatch(
  edit: { snapshot: unknown; summary: ProfileEditDiff[] },
  current: Pick<PendingProfileEdit['snapshot'], 'responsibilities' | 'stats' | 'members'> & { head?: unknown },
): ProfilePatchResult {
  const snapshot = normalizeProfileSnapshotForApproval(edit.snapshot);
  const normalizedCurrent = normalizeExecutiveContentSnapshot({
    responsibilities: current.responsibilities,
    stats: current.stats,
    members: current.members,
  });
  if (!snapshot || !normalizedCurrent) return profileFail();
  const expected = buildStrictProfileSummary(normalizedCurrent, snapshot);
  if (JSON.stringify(expected) !== JSON.stringify(edit.summary) || expected.length === 0) return profileFail();
  const patch: Partial<Pick<PendingProfileEdit['snapshot'], 'responsibilities' | 'stats' | 'members'>> = {};
  for (const key of Object.keys(profileLabels) as Array<keyof typeof profileLabels>) {
    if (profileFormats[key](normalizedCurrent[key]) !== profileFormats[key](snapshot[key])) {
      if (key === 'members') {
        const members = sanitizeProfileMembers(normalizedCurrent.members, snapshot.members);
        if (!members.ok) return profileFail(members.error);
        patch.members = members.value;
      } else {
        patch[key] = structuredClone(snapshot[key]) as never;
      }
    }
  }
  return { ok: true, patch };
}

export function isStrictSitePayload(value: unknown): value is SiteEditSubmit {
  if (!isRecord(value)) return false;
  const allowedKeys = ['pageId', 'pageLabel', 'sectionLabel', 'target', 'op', 'recordId', 'path', 'nested', 'diffs'];
  if (!hasOnlyKeys(value, allowedKeys)) return false;
  if (value.nested !== undefined && (
    !isRecord(value.nested)
    || !hasOnlyKeys(value.nested, ['parentField', 'itemId', 'remove'])
  )) return false;
  if (!Array.isArray(value.diffs) || value.diffs.some((diff) => (
    !isRecord(diff)
    || !hasOnlyKeys(diff, ['label', 'oldValue', 'newValue', 'path', 'editable'])
  ))) return false;
  const surface = validatePayloadSurface(value as unknown as SiteEditSubmit);
  return surface.ok && validateCanonicalPaths(value as unknown as SiteEditSubmit).ok;
}
