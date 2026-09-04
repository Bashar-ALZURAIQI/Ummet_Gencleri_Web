import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type Locale, isSupportedLocale } from '../domain/locale.ts';
import {
  getLanguageOptions,
  handleManualLanguageChange,
} from '../i18n/config.ts';

export interface LanguageSwitcherProps {
  variant?: 'desktop' | 'mobile';
  onSelect?: (locale: Locale) => void;
  className?: string;
}

export function LanguageSwitcher({
  variant = 'desktop',
  onSelect,
  className = '',
}: LanguageSwitcherProps) {
  const { i18n: i18nInstance, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentLocale: Locale = isSupportedLocale(i18nInstance.language)
    ? i18nInstance.language
    : 'ar';

  const options = getLanguageOptions(currentLocale);
  const currentOption = options.find((o) => o.locale === currentLocale) || options[0];

  const handleSelect = async (locale: Locale) => {
    await handleManualLanguageChange(locale, { i18nInstance });
    setIsOpen(false);
    onSelect?.(locale);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  if (variant === 'mobile') {
    return (
      <div className={`py-2 ${className}`}>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">
          {t('common.language', 'اللغة')}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {options.map((opt) => (
            <button
              key={opt.locale}
              type="button"
              onClick={() => handleSelect(opt.locale)}
              aria-current={opt.isActive ? 'true' : undefined}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all min-h-[44px] ${
                opt.isActive
                  ? 'bg-navy-800 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-navy-800'
              }`}
            >
              {opt.nativeName}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative inline-block text-start ${className}`} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('common.language', 'اللغة')}
        className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:text-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-600/20"
      >
        <Globe className="h-4 w-4 text-navy-600 shrink-0" aria-hidden="true" />
        <span>{currentOption.nativeName}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={t('common.language', 'اللغة')}
          className="absolute end-0 top-full mt-1.5 z-50 min-w-[140px] animate-scale-in rounded-2xl border border-gray-100 bg-white p-1.5 shadow-xl"
        >
          {options.map((opt) => (
            <button
              key={opt.locale}
              type="button"
              role="option"
              aria-selected={opt.isActive}
              onClick={() => handleSelect(opt.locale)}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start text-sm font-medium transition-colors ${
                opt.isActive
                  ? 'bg-navy-50 font-bold text-navy-800'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-navy-800'
              }`}
            >
              <span>{opt.nativeName}</span>
              {opt.isActive && <Check className="h-4 w-4 text-navy-600 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LanguageSwitcher;
