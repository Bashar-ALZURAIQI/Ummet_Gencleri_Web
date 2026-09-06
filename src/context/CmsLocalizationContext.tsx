import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  type CmsLocalizationRepository,
} from '../domain/cmsLocalizationRepository.ts';
import {
  type TranslationProvider,
} from '../services/translation/types.ts';
import { defaultAzureTranslator } from '../services/translation/AzureTranslator.ts';
import { SupabaseCmsLocalizationRepository } from '../services/localization/SupabaseCmsLocalizationRepository.ts';

export interface CmsLocalizationContextValue {
  repository: CmsLocalizationRepository;
  translationProvider: TranslationProvider;
}

// Default runtime repository is SupabaseCmsLocalizationRepository; InMemoryCmsLocalizationRepository can be injected for testing.
const defaultRepository = new SupabaseCmsLocalizationRepository();

const CmsLocalizationContext = createContext<CmsLocalizationContextValue>({
  repository: defaultRepository,
  translationProvider: defaultAzureTranslator,
});

export function CmsLocalizationProvider({
  repository,
  translationProvider,
  children,
}: {
  repository?: CmsLocalizationRepository;
  translationProvider?: TranslationProvider;
  children: ReactNode;
}): JSX.Element {
  const stableRepository = useMemo(
    () => repository ?? new SupabaseCmsLocalizationRepository(),
    [repository],
  );

  const stableProvider = useMemo(
    () => translationProvider ?? defaultAzureTranslator,
    [translationProvider],
  );

  return (
    <CmsLocalizationContext.Provider
      value={{
        repository: stableRepository,
        translationProvider: stableProvider,
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

// eslint-disable-next-line react-refresh/only-export-components
export function useCmsTranslationProvider(): TranslationProvider {
  const ctx = useContext(CmsLocalizationContext);
  return ctx.translationProvider;
}
