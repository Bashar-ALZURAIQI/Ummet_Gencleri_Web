import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  type CmsLocalizationRepository,
} from '../domain/cmsLocalizationRepository.ts';
import { SupabaseCmsLocalizationRepository } from '../services/localization/SupabaseCmsLocalizationRepository.ts';

export interface CmsLocalizationContextValue {
  repository: CmsLocalizationRepository;
}

// Default runtime repository is SupabaseCmsLocalizationRepository; InMemoryCmsLocalizationRepository can be injected for testing.
const defaultRepository = new SupabaseCmsLocalizationRepository();

const CmsLocalizationContext = createContext<CmsLocalizationContextValue>({
  repository: defaultRepository,
});

export function CmsLocalizationProvider({
  repository,
  children,
}: {
  repository?: CmsLocalizationRepository;
  children: ReactNode;
}): JSX.Element {
  const stableRepository = useMemo(
    () => repository ?? new SupabaseCmsLocalizationRepository(),
    [repository],
  );

  return (
    <CmsLocalizationContext.Provider
      value={{
        repository: stableRepository,
      }}
    >
      {children}
    </CmsLocalizationContext.Provider>
  );
}

// Co-locates context provider and consumer hooks as unified context API.
// eslint-disable-next-line react-refresh/only-export-components
export function useCmsLocalizationRepository(): CmsLocalizationRepository {
  const ctx = useContext(CmsLocalizationContext);
  return ctx.repository;
}
