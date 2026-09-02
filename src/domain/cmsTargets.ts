export type CmsAuthority = 'site' | 'guide' | 'faq';

export interface CmsVersions {
  site: number;
  guide: number;
  faq: number;
}

export function cmsAuthorityForTarget(target: string): CmsAuthority {
  if (target === 'guideSections' || target === 'guideQuickInfo') return 'guide';
  if (target === 'faqCategories') return 'faq';
  return 'site';
}

export function selectCmsExpectedVersion(target: string, versions: CmsVersions): number {
  return versions[cmsAuthorityForTarget(target)];
}

export function publishedBundleKeyForTarget(target: string): string {
  if (target === 'site') return 'siteContent';
  if (target === 'about') return 'aboutContent';
  return target;
}
