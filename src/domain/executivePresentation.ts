/**
 * Centralized locale-aware presentation helpers for Executive Board organizational structure,
 * roles, committee sections, fixed hero descriptions, and fixed metric labels.
 * Pure presentation logic: preserves underlying canonical stored data and enums.
 */

export const EXECUTIVE_ROLES_MAP: Record<string, { key: string; fallback: string }> = {
  // President
  'رئيس الاتحاد': { key: 'roles.unionPresident', fallback: 'رئيس الاتحاد' },
  PRESIDENT: { key: 'roles.unionPresident', fallback: 'رئيس الاتحاد' },

  // Vice President
  'نائب الرئيس': { key: 'roles.vicePresident', fallback: 'نائب الرئيس' },
  VICE_PRESIDENT: { key: 'roles.vicePresident', fallback: 'نائب الرئيس' },

  // General & Members
  'طالب': { key: 'roles.student', fallback: 'طالب' },
  STUDENT: { key: 'roles.student', fallback: 'طالب' },
  'عضو': { key: 'roles.member', fallback: 'عضو' },
  MEMBER: { key: 'roles.member', fallback: 'عضو' },

  // Board & Office
  'الهيئة التنفيذية': { key: 'navigation.executiveBoard', fallback: 'الهيئة التنفيذية' },
  'مكتب تنفيذي': { key: 'committee.executiveOffice', fallback: 'مكتب تنفيذي' },
  'مسؤول لجنة': { key: 'roles.committeeHead', fallback: 'مسؤول لجنة' },
  COMMITTEE_HEAD: { key: 'roles.committeeHead', fallback: 'مسؤول لجنة' },

  // Media Officer / Head
  'المسؤول الإعلامي': { key: 'roles.mediaHead', fallback: 'المسؤول الإعلامي' },
  'مسؤول الإعلام': { key: 'roles.mediaHead', fallback: 'المسؤول الإعلامي' },
  'رئيس اللجنة الإعلامية': { key: 'roles.mediaHead', fallback: 'رئيس اللجنة الإعلامية' },
  'رئيسة اللجنة الإعلامية': { key: 'roles.mediaHead', fallback: 'رئيسة اللجنة الإعلامية' },
  MEDIA_HEAD: { key: 'roles.mediaHead', fallback: 'المسؤول الإعلامي' },

  // Academic Officer / Head
  'المسؤول الأكاديمي': { key: 'roles.academicHead', fallback: 'المسؤول الأكاديمي' },
  'مسؤول الأكاديمية': { key: 'roles.academicHead', fallback: 'المسؤول الأكاديمي' },
  'رئيس اللجنة الأكاديمية': { key: 'roles.academicHead', fallback: 'رئيس اللجنة الأكاديمية' },
  'رئيسة اللجنة الأكاديمية': { key: 'roles.academicHead', fallback: 'رئيسة اللجنة الأكاديمية' },
  ACADEMIC_HEAD: { key: 'roles.academicHead', fallback: 'المسؤول الأكاديمي' },

  // Oversight / Supervisory / Audit Officer / Head
  'المسؤول الرقابي': { key: 'roles.supervisoryHead', fallback: 'المسؤول الرقابي' },
  'مسؤول الرقابة والتفتيش': { key: 'roles.supervisoryHead', fallback: 'مسؤول الرقابة والتفتيش' },
  'مسؤول الرقابة': { key: 'roles.supervisoryHead', fallback: 'مسؤول الرقابة' },
  'رئيس اللجنة الرقابية': { key: 'roles.supervisoryHead', fallback: 'رئيس اللجنة الرقابية' },
  'رئيسة اللجنة الرقابية': { key: 'roles.supervisoryHead', fallback: 'رئيسة اللجنة الرقابية' },
  AUDIT_HEAD: { key: 'roles.supervisoryHead', fallback: 'المسؤول الرقابي' },
  SUPERVISORY_HEAD: { key: 'roles.supervisoryHead', fallback: 'المسؤول الرقابي' },

  // Activities Officer / Head
  'مسؤول الأنشطة': { key: 'roles.activitiesHead', fallback: 'مسؤول الأنشطة' },
  'المسؤول عن الأنشطة': { key: 'roles.activitiesHead', fallback: 'مسؤول الأنشطة' },
  'مسؤول الأنشطة والبرامج': { key: 'roles.activitiesHead', fallback: 'مسؤول الأنشطة والبرامج' },
  'رئيس لجنة الأنشطة': { key: 'roles.activitiesHead', fallback: 'رئيس لجنة الأنشطة' },
  'رئيسة لجنة الأنشطة': { key: 'roles.activitiesHead', fallback: 'رئيسة لجنة الأنشطة' },
  ACTIVITIES_HEAD: { key: 'roles.activitiesHead', fallback: 'مسؤول الأنشطة' },

  // Finance Officer / Head
  'المسؤول المالي': { key: 'roles.financeHead', fallback: 'المسؤول المالي' },
  'مسؤول المالية': { key: 'roles.financeHead', fallback: 'المسؤول المالي' },
  'رئيس اللجنة المالية': { key: 'roles.financeHead', fallback: 'رئيس اللجنة المالية' },
  'رئيسة اللجنة المالية': { key: 'roles.financeHead', fallback: 'رئيسة اللجنة المالية' },
  FINANCE_HEAD: { key: 'roles.financeHead', fallback: 'المسؤول المالي' },
};

const PRESIDENCY_SECTION_ENTRY = {
  nameKey: 'executive.sections.presidency.name',
  nameFallback: 'رئاسة الاتحاد',
  shortKey: 'executive.sections.presidency.shortName',
  shortFallback: 'الرئاسة',
  descKey: 'executive.sections.presidency.description',
  descFallback:
    'القيادة العليا للاتحاد، تتولى رسم السياسات العامة وتمثيل الاتحاد داخليًا وخارجيًا، والإشراف على عمل جميع اللجان والمكاتب.',
};

const VICE_PRESIDENCY_SECTION_ENTRY = {
  nameKey: 'executive.sections.vicePresidency.name',
  nameFallback: 'نائب الرئيس',
  shortKey: 'executive.sections.vicePresidency.shortName',
  shortFallback: 'النائب',
  descKey: 'executive.sections.vicePresidency.description',
  descFallback:
    'المكتب التنفيذي لنائب الرئيس، يتولى متابعة تنفيذ القرارات وتنسيق العمل بين اللجان، ويتولى صلاحيات الرئيس في حال غيابه.',
};

const MEDIA_SECTION_ENTRY = {
  nameKey: 'executive.sections.media.name',
  nameFallback: 'اللجنة الإعلامية',
  shortKey: 'executive.sections.media.shortName',
  shortFallback: 'الإعلام',
  descKey: 'executive.sections.media.description',
  descFallback:
    'تتولى اللجنة الإعلامية إدارة صورة الاتحاد وتواصله مع الجمهور عبر المنصات الرقمية والمواد الإعلامية والتغطيات.',
};

const ACADEMIC_SECTION_ENTRY = {
  nameKey: 'executive.sections.academic.name',
  nameFallback: 'اللجنة الأكاديمية',
  shortKey: 'executive.sections.academic.shortName',
  shortFallback: 'الأكاديمية',
  descKey: 'executive.sections.academic.description',
  descFallback:
    'تهتم اللجنة الأكاديمية بالشأن العلمي للطلاب، عبر تنظيم الدورات التدريبية والندوات وورش العمل ودعم المسار الأكاديمي.',
};

const SUPERVISORY_SECTION_ENTRY = {
  nameKey: 'executive.sections.supervisory.name',
  nameFallback: 'اللجنة الرقابية',
  shortKey: 'executive.sections.supervisory.shortName',
  shortFallback: 'الرقابة',
  descKey: 'executive.sections.supervisory.description',
  descFallback:
    'اللجنة الرقابية هي الجهة المستقلة المسؤولة عن مراقبة الالتزام والشفافية داخل الاتحاد، وتقييم الأداء وضمان نزاهة العمل المؤسسي.',
};

const ACTIVITIES_SECTION_ENTRY = {
  nameKey: 'executive.sections.activities.name',
  nameFallback: 'لجنة الأنشطة',
  shortKey: 'executive.sections.activities.shortName',
  shortFallback: 'الأنشطة',
  descKey: 'executive.sections.activities.description',
  descFallback:
    'تنظيم وإدارة الفعاليات والأنشطة الشبابية المتنوعة، من رحلات وندوات وحملات تطوعية، وتفعيل المشاركة الطلابية.',
};

const FINANCE_SECTION_ENTRY = {
  nameKey: 'executive.sections.finance.name',
  nameFallback: 'اللجنة المالية',
  shortKey: 'executive.sections.finance.shortName',
  shortFallback: 'المالية',
  descKey: 'executive.sections.finance.description',
  descFallback:
    'تتولى اللجنة المالية إدارة الموارد المالية للاتحاد، وإعداد الموازنات ومتابعة الإيرادات والمصروفات وضمان الاستدامة المالية.',
};

export const EXECUTIVE_SECTIONS_MAP: Record<
  string,
  {
    nameKey: string;
    nameFallback: string;
    shortKey: string;
    shortFallback: string;
    descKey: string;
    descFallback: string;
  }
> = {
  // Presidency & aliases
  presidency: PRESIDENCY_SECTION_ENTRY,
  'رئاسة الاتحاد': PRESIDENCY_SECTION_ENTRY,
  'رئيس الاتحاد': PRESIDENCY_SECTION_ENTRY,
  PRESIDENT: PRESIDENCY_SECTION_ENTRY,

  // Vice Presidency & aliases
  'vice-presidency': VICE_PRESIDENCY_SECTION_ENTRY,
  'نائب الرئيس': VICE_PRESIDENCY_SECTION_ENTRY,
  'مكتب نائب الرئيس': VICE_PRESIDENCY_SECTION_ENTRY,
  'مكتب النائب': VICE_PRESIDENCY_SECTION_ENTRY,
  VICE_PRESIDENT: VICE_PRESIDENCY_SECTION_ENTRY,

  // Media & aliases
  media: MEDIA_SECTION_ENTRY,
  'اللجنة الإعلامية': MEDIA_SECTION_ENTRY,
  'المكتب الإعلامي': MEDIA_SECTION_ENTRY,
  'الإعلام': MEDIA_SECTION_ENTRY,
  MEDIA_HEAD: MEDIA_SECTION_ENTRY,

  // Academic & aliases
  academic: ACADEMIC_SECTION_ENTRY,
  'اللجنة الأكاديمية': ACADEMIC_SECTION_ENTRY,
  'الأكاديمية': ACADEMIC_SECTION_ENTRY,
  ACADEMIC_HEAD: ACADEMIC_SECTION_ENTRY,

  // Supervisory & aliases
  supervisory: SUPERVISORY_SECTION_ENTRY,
  'اللجنة الرقابية': SUPERVISORY_SECTION_ENTRY,
  'لجنة الرقابة والتفتيش': SUPERVISORY_SECTION_ENTRY,
  'الرقابة': SUPERVISORY_SECTION_ENTRY,
  AUDIT_HEAD: SUPERVISORY_SECTION_ENTRY,
  SUPERVISORY_HEAD: SUPERVISORY_SECTION_ENTRY,

  // Activities & aliases
  activities: ACTIVITIES_SECTION_ENTRY,
  'لجنة الأنشطة': ACTIVITIES_SECTION_ENTRY,
  'لجنة الأنشطة والبرامج': ACTIVITIES_SECTION_ENTRY,
  'الأنشطة': ACTIVITIES_SECTION_ENTRY,
  ACTIVITIES_HEAD: ACTIVITIES_SECTION_ENTRY,

  // Finance & aliases
  finance: FINANCE_SECTION_ENTRY,
  'اللجنة المالية': FINANCE_SECTION_ENTRY,
  'المالية': FINANCE_SECTION_ENTRY,
  FINANCE_HEAD: FINANCE_SECTION_ENTRY,
};

export const EXECUTIVE_METRICS_MAP: Record<string, { key: string; fallback: string }> = {
  'قرارات صادرة': { key: 'executive.metrics.decisionsIssued', fallback: 'قرارات صادرة' },
  'اجتماعات الهيئة': { key: 'executive.metrics.boardMeetings', fallback: 'اجتماعات الهيئة' },
  'شراكات خارجية': { key: 'executive.metrics.externalPartnerships', fallback: 'شراكات خارجية' },

  'متابعات تنفيذية': { key: 'executive.metrics.executiveFollowups', fallback: 'متابعات تنفيذية' },
  'جلسات تنسيق': { key: 'executive.metrics.coordinationSessions', fallback: 'جلسات تنسيق' },
  'تقارير دورية': { key: 'executive.metrics.periodicReports', fallback: 'تقارير دورية' },

  'منشورات سنوية': { key: 'executive.metrics.annualPublications', fallback: 'منشورات سنوية' },
  'متابعون': { key: 'executive.metrics.followers', fallback: 'متابعون' },
  'تغطيات إعلامية': { key: 'executive.metrics.mediaCoverages', fallback: 'تغطيات إعلامية' },

  'دورات منفذة': { key: 'executive.metrics.completedCourses', fallback: 'دورات منفذة' },
  'متدربون': { key: 'executive.metrics.trainees', fallback: 'متدربون' },
  'شراكات جامعية': { key: 'executive.metrics.universityPartnerships', fallback: 'شراكات جامعية' },

  'تدقيقات منجزة': { key: 'executive.metrics.completedAudits', fallback: 'تدقيقات منجزة' },
  'تقارير شفافية': { key: 'executive.metrics.transparencyReports', fallback: 'تقارير شفافية' },
  'شكاوى محلولة': { key: 'executive.metrics.resolvedComplaints', fallback: 'شكاوى محلولة' },

  'فعاليات منفذة': { key: 'executive.metrics.completedEvents', fallback: 'فعاليات منفذة' },
  'متطوعون': { key: 'executive.metrics.volunteers', fallback: 'متطوعون' },
  'مستفيدون': { key: 'executive.metrics.beneficiaries', fallback: 'مستفيدون' },

  'موازنة 2026': { key: 'executive.metrics.budget2026', fallback: 'موازنة 2026' },
  'تمويل مشاريع': { key: 'executive.metrics.projectFunding', fallback: 'تمويل مشاريع' },
  'رعاة': { key: 'executive.metrics.sponsors', fallback: 'رعاة' },
};

import type { TFunction } from 'i18next';

export type TranslationFn = TFunction | ((key: string, fallback?: string) => string);

/**
 * Localizes an executive role title (e.g. "رئيس الاتحاد" -> "Birlik Başkanı").
 * Unknown or custom roles are returned raw unchanged.
 */
export function getExecutiveRoleLabel(
  role: string | undefined | null,
  t: TranslationFn,
): string {
  if (!role) return '';
  const trimmed = role.trim();
  const entry = EXECUTIVE_ROLES_MAP[trimmed];
  if (entry) {
    return t(entry.key, entry.fallback);
  }
  return role;
}

/**
 * Localizes an organizational section name (e.g. "presidency" -> "Birlik Başkanlığı").
 * Supports 'full' and 'short' variants.
 */
export function getExecutiveSectionLabel(
  sectionIdOrName: string | undefined | null,
  t: TranslationFn,
  variant: 'full' | 'short' = 'full',
): string {
  if (!sectionIdOrName) return '';
  const trimmed = sectionIdOrName.trim();
  const entry = EXECUTIVE_SECTIONS_MAP[trimmed];
  if (entry) {
    return variant === 'short'
      ? t(entry.shortKey, entry.shortFallback)
      : t(entry.nameKey, entry.nameFallback);
  }
  return sectionIdOrName;
}

/**
 * Localizes the fixed hero description for a committee section.
 */
export function getExecutiveSectionDescription(
  sectionId: string | undefined | null,
  t: TranslationFn,
  fallback?: string,
): string {
  if (!sectionId) return fallback ?? '';
  const trimmed = sectionId.trim();
  const entry = EXECUTIVE_SECTIONS_MAP[trimmed];
  if (entry) {
    return t(entry.descKey, fallback || entry.descFallback);
  }
  return fallback ?? '';
}

/**
 * Localizes a fixed committee metric label (e.g. "قرارات صادرة" -> "Alınan Kararlar").
 * Unknown or custom metrics are returned raw unchanged.
 */
export function getExecutiveMetricLabel(
  rawLabel: string | undefined | null,
  t: TranslationFn,
): string {
  if (!rawLabel) return '';
  const trimmed = rawLabel.trim();
  const entry = EXECUTIVE_METRICS_MAP[trimmed];
  if (entry) {
    return t(entry.key, entry.fallback);
  }
  return rawLabel;
}
