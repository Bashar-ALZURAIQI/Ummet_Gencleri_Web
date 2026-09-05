import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  type CmsLocalizationRepository,
  InMemoryCmsLocalizationRepository,
} from '../domain/cmsLocalizationRepository.ts';

export interface CmsLocalizationContextValue {
  repository: CmsLocalizationRepository;
}

const defaultRepository = new InMemoryCmsLocalizationRepository();

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
    () => repository ?? new InMemoryCmsLocalizationRepository(),
    [repository],
  );

  return (
    <CmsLocalizationContext.Provider value={{ repository: stableRepository }}>
      {children}
    </CmsLocalizationContext.Provider>
  );
}

export function useCmsLocalizationRepository(): CmsLocalizationRepository {
  const ctx = useContext(CmsLocalizationContext);
  return ctx.repository;
}
