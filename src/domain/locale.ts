export type Locale = 'ar' | 'tr' | 'en';

export type Direction = 'rtl' | 'ltr';

export interface LocaleMetadata {
  locale: Locale;
  direction: Direction;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LOCALES: readonly Locale[] = ['ar', 'tr', 'en'] as const;

export const DEFAULT_LOCALE: Locale = 'ar';

export const LOCALE_STORAGE_KEY = 'ummet_locale';

export const LOCALE_CONFIG: Record<Locale, LocaleMetadata> = {
  ar: {
    locale: 'ar',
    direction: 'rtl',
    name: 'Arabic',
    nativeName: 'العربية',
  },
  tr: {
    locale: 'tr',
    direction: 'ltr',
    name: 'Turkish',
    nativeName: 'Türkçe',
  },
  en: {
    locale: 'en',
    direction: 'ltr',
    name: 'English',
    nativeName: 'English',
  },
};

/**
 * Type guard to check if a value is a supported locale ('ar' | 'tr' | 'en').
 */
export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolves the active locale in priority order:
 * 1. Valid manually saved preference
 * 2. Browser preferred languages (first supported locale matching primary subtag)
 * 3. Default fallback ('ar')
 */
export function resolveInitialLocale(
  savedPreference?: string | null,
  navLanguages?: readonly string[]
): Locale {
  if (isSupportedLocale(savedPreference)) {
    return savedPreference;
  }

  const languages = navLanguages ?? (
    typeof navigator !== 'undefined'
      ? (navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language])
      : []
  );

  if (Array.isArray(languages)) {
    for (const rawLang of languages) {
      if (typeof rawLang !== 'string') continue;
      const primaryTag = rawLang.trim().toLowerCase().split(/[-_]/)[0];
      if (isSupportedLocale(primaryTag)) {
        return primaryTag;
      }
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * Persists user locale choice safely to storage.
 * Silently catches quota/storage exceptions without crashing.
 */
export function persistLocalePreference(
  locale: Locale,
  storage?: Storage
): void {
  if (!isSupportedLocale(locale)) {
    return;
  }

  try {
    const targetStorage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (targetStorage && typeof targetStorage.setItem === 'function') {
      targetStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    // Fail safely if storage write fails (quota, security restrictions, etc.)
  }
}

/**
 * Reads user locale choice safely from storage.
 * Returns valid Locale or null if missing, invalid, or upon error.
 */
export function readPersistedLocalePreference(
  storage?: Storage
): Locale | null {
  try {
    const targetStorage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (targetStorage && typeof targetStorage.getItem === 'function') {
      const stored = targetStorage.getItem(LOCALE_STORAGE_KEY);
      return isSupportedLocale(stored) ? stored : null;
    }
  } catch {
    // Fail safely if storage read fails
  }
  return null;
}

/**
 * Gets layout direction ('rtl' | 'ltr') for a given locale.
 */
export function getLocaleDirection(locale: Locale): Direction {
  return LOCALE_CONFIG[locale]?.direction ?? (locale === 'ar' ? 'rtl' : 'ltr');
}

/**
 * Updates document.documentElement lang and dir attributes synchronously.
 */
export function applyDocumentLocale(
  locale: Locale,
  doc?: Document | { documentElement?: { lang?: string; dir?: string; setAttribute?: (name: string, value: string) => void } } | null
): void {
  try {
    const targetDoc = doc !== undefined ? doc : (typeof document !== 'undefined' ? document : null);
    if (!targetDoc || !targetDoc.documentElement) {
      return;
    }

    const direction = getLocaleDirection(locale);
    const element = targetDoc.documentElement;

    if (typeof element.setAttribute === 'function') {
      element.setAttribute('lang', locale);
      element.setAttribute('dir', direction);
    } else {
      element.lang = locale;
      element.dir = direction;
    }
  } catch {
    // Fail safely if DOM manipulation fails
  }
}
