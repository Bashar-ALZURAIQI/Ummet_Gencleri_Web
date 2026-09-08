import i18next, { type i18n as I18nInstance, type InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  type Locale,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_CONFIG,
  isSupportedLocale,
  persistLocalePreference,
  readPersistedLocalePreference,
  resolveInitialLocale,
  applyDocumentLocale,
} from '../domain/locale.ts';
import ar, { type TranslationSchema } from './locales/ar.ts';
import tr from './locales/tr.ts';
import en from './locales/en.ts';

export const resources = {
  ar: { translation: ar },
  tr: { translation: tr },
  en: { translation: en },
} as const;

export interface CreateI18nOptions {
  storage?: Storage;
  document?: Document | { documentElement?: { lang?: string; dir?: string; setAttribute?: (name: string, value: string) => void } } | null;
  navLanguages?: readonly string[];
}

interface ExtendedInitOptions extends InitOptions {
  initImmediate?: boolean;
}

/**
 * Creates and initializes an i18next instance configured with:
 * - Local bundled resources (AR, TR, EN)
 * - Synchronous initialization (initImmediate: false)
 * - Strict fallback to Arabic ('ar')
 * - Synchronization with document.documentElement (lang & dir) without persisting manual preference
 */
export function createI18nInstance(options?: CreateI18nOptions): I18nInstance {
  const instance = i18next.createInstance();

  // Initial locale priority:
  // 1. Manually saved preference (if present in storage)
  // 2. Browser preferred languages
  // 3. Arabic fallback
  const savedLocale = readPersistedLocalePreference(options?.storage);
  const initialLocale: Locale = savedLocale ?? resolveInitialLocale(null, options?.navLanguages);

  const initConfig: ExtendedInitOptions = {
    resources,
    lng: initialLocale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    initImmediate: false,
    interpolation: {
      escapeValue: false, // React protects against XSS
    },
  };

  instance.use(initReactI18next).init(initConfig);

  const targetDoc = options?.document;
  const currentLocale = isSupportedLocale(instance.language) ? instance.language : DEFAULT_LOCALE;
  applyDocumentLocale(currentLocale, targetDoc);

  instance.on('languageChanged', (lng: string) => {
    if (isSupportedLocale(lng)) {
      applyDocumentLocale(lng, targetDoc);
    }
  });

  const originalChangeLanguage = instance.changeLanguage.bind(instance);
  instance.changeLanguage = (lng?: string, callback?: Parameters<typeof originalChangeLanguage>[1]) => {
    if (lng && !isSupportedLocale(lng)) {
      return originalChangeLanguage(DEFAULT_LOCALE, callback);
    }
    return originalChangeLanguage(lng, callback);
  };

  return instance;
}

/**
 * Shared application-wide i18next instance.
 */
export const i18n = createI18nInstance();

export interface LanguageOption {
  locale: Locale;
  nativeName: string;
  name: string;
  isActive: boolean;
}

/**
 * Returns supported language options with native labels and active indicator.
 * Strictly no country flags.
 */
export function getLanguageOptions(currentLocale?: string): LanguageOption[] {
  return SUPPORTED_LOCALES.map((locale) => ({
    locale,
    nativeName: LOCALE_CONFIG[locale].nativeName,
    name: LOCALE_CONFIG[locale].name,
    isActive: locale === currentLocale,
  }));
}

export interface ManualChangeOptions {
  i18nInstance?: I18nInstance;
  storage?: Storage;
  document?: Document | { documentElement?: { lang?: string; dir?: string; setAttribute?: (name: string, value: string) => void } } | null;
  windowObj?: { location?: { href?: string } };
}

/**
 * Executes the manual language change flow:
 * 1. Validates locale is supported
 * 2. Persists user preference to storage under 'ummet_locale'
 * 3. Invokes i18n.changeLanguage(locale)
 * 4. Applies document lang and dir attributes
 * 5. Leaves current view and URL intact
 */
export async function handleManualLanguageChange(
  targetLocale: unknown,
  options?: ManualChangeOptions
): Promise<{ success: boolean; locale?: Locale }> {
  if (!isSupportedLocale(targetLocale)) {
    return { success: false };
  }

  const instance = options?.i18nInstance ?? i18n;
  const targetDoc = options?.document;

  // 1. Persist manual choice
  persistLocalePreference(targetLocale, options?.storage);

  // 2. Change language on i18n instance
  await instance.changeLanguage(targetLocale);

  // 3. Update document attributes
  applyDocumentLocale(targetLocale, targetDoc);

  return { success: true, locale: targetLocale };
}

export default i18n;
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_CONFIG, type Locale, type TranslationSchema };
