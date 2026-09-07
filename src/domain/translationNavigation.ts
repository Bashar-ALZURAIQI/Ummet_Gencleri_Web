/**
 * Translation Navigation Mapping Helper
 *
 * Resolves any CMS target (and optional entity ID / field path) to its existing
 * authoritative editing surface/view in the application.
 *
 * Reuses the existing AppView and navigate architecture without introducing React Router.
 */

import { type AppView, isValidCommitteeId } from './appNavigation.ts';
import { type CmsTarget } from './cmsLocalization.ts';

export function resolveCmsEditDestination(
  target: CmsTarget | string,
  _fieldPath?: string,
  entityId?: string,
): AppView {
  switch (target) {
    case 'site':
      return { kind: 'home' };

    case 'about':
      return { kind: 'about' };

    case 'programsContent':
      return { kind: 'programs' };

    case 'events':
      return { kind: 'admin', tab: 'events' };

    case 'galleryAlbums':
    case 'galleryCategories':
    case 'gallery':
      return { kind: 'admin', tab: 'gallery' };

    case 'news':
      return { kind: 'admin', tab: 'news' };

    case 'plans':
    case 'reports':
      return { kind: 'admin', tab: 'plans' };

    case 'committees':
      if (entityId && isValidCommitteeId(entityId)) {
        return { kind: 'committee', committeeId: entityId };
      }
      return { kind: 'admin', tab: 'board' };

    case 'guideSections':
    case 'guideQuickInfo':
    case 'guide':
    case 'studentGuide':
      return { kind: 'guide' };

    case 'faqCategories':
    case 'faq':
      return { kind: 'faq' };

    case 'contactCards':
    case 'contactMap':
    case 'contact':
      return { kind: 'contact' };

    default:
      return { kind: 'home' };
  }
}
