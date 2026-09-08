# Multilingual Implementation Plan: Arabic, Turkish, and English (AR / TR / EN)

- **Document ID**: `2026-09-04-multilingual-ar-tr-en-plan`
- **Design Spec**: [docs/superpowers/specs/2026-09-04-multilingual-ar-tr-en-design.md](file:///c:/Users/msi/Downloads/my_Github/Ummet_Gencleri_Web/docs/superpowers/specs/2026-09-04-multilingual-ar-tr-en-design.md)
- **Branch**: `feature-multilingual-ar-tr-en` (branched from `feature-member-role-management`)
- **Supported Locales**: Arabic (`ar` - Canonical / Default), Turkish (`tr`), English (`en`)
- **Execution Methodology**: Test-Driven Development (TDD) — RED -> Verify Failure -> GREEN -> Refactor -> Regressions

---

## Global Constraints & Architectural Rules

1. **One Canonical Website URL**: No `/ar`, `/tr`, or `/en` route prefixes. Locale is resolved in-memory and persisted to `localStorage`. Page view state (`AppContext.view`) is completely preserved when switching language.
2. **Arabic is the Canonical Source of Truth**: All official organization content originates in Arabic (`AR -> TR`, `AR -> EN`). Unidirectional machine translation assistance; no reverse or circular translation chains.
3. **Static UI Text vs Dynamic CMS Content**:
   - Static UI strings (buttons, badges, labels, errors, modals, tooltips) are managed in localized TypeScript dictionaries via `i18next` / `react-i18next`. Never call Azure Translator at runtime for static strings.
   - Dynamic CMS content (titles, bodies, descriptions, guides, FAQs, announcements) is stored in the database with Arabic in canonical tables and Turkish/English in `public.cms_localizations`.
4. **Translation Never Auto-Publishes**: Machine translation populates form fields for human editorial review. Publication is an explicit, separate action.
5. **Preserve Existing Approval Flow**: Editorial changes submitted by authorized editors (e.g. Media Head) travel as a unified multilingual bundle (`site_payload`) inside `edit_requests`. The President reviews all language variants atomically prior to approval.
6. **Zero Translation Secrets in Frontend**: Translator credentials (such as Azure Translator keys) remain strictly server-side inside Supabase Edge Functions (`translate-content`). No `VITE_AZURE_*` variables in browser bundles.
7. **Provider Abstraction**: Frontend and backend interact with a generic `TranslationProvider` contract. Azure Translator is the initial implementation behind this boundary.
8. **Identity Data & User-Generated Content Excluded**: Never translate names, emails, phone numbers, raw IDs, UUIDs, URLs, system roles (`PRESIDENT`), status keys, student suggestions, or contact inquiries.
9. **Emergency Arabic-Only Publish is Exceptional**: Used only during urgent situations when translation service is unavailable. Requires President-level confirmation, marks TR/EN as stale, and displays a localized fallback disclaimer banner.
10. **Zero Remote Supabase Operations During Implementation**: Remote database migration drift is present. Do NOT run `supabase db push`, `supabase migration repair`, or remote DDL/DML. Local migration files are authored on disk only.
11. **Parent Branch Integrity**: All executive role assignment, revocation, and transfer capabilities from `feature-member-role-management` must remain intact with zero regressions.

---

## Task 1: Locale Core, Detection, Persistence, and Test Foundation

### Objective
Create the core domain types, locale detection algorithm, persistence layer, and DOM synchronization helpers with full unit test coverage.

### Files
- **Create**:
  - `src/domain/locale.ts`
  - `tests/localeCore.test.mjs`

### Interfaces
- **Consumed**: Browser `localStorage`, `navigator.languages`, `navigator.language`, `document.documentElement`.
- **Produced**:
  - Types: `Locale` (`'ar' | 'tr' | 'en'`), `Direction` (`'rtl' | 'ltr'`), `LocaleMetadata`.
  - Constants: `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LOCALE_STORAGE_KEY`, `LOCALE_CONFIG`.
  - Functions:
    - `isSupportedLocale(val: unknown): val is Locale`
    - `resolveInitialLocale(savedPreference?: string | null, navLanguages?: readonly string[]): Locale`
    - `persistLocalePreference(locale: Locale, storage?: Storage): void`
    - `readPersistedLocalePreference(storage?: Storage): Locale | null`
    - `getLocaleDirection(locale: Locale): Direction`
    - `applyDocumentLocale(locale: Locale, doc?: Document): void`

### TDD Execution Steps

- [ ] **Step 1.1: RED — Write Unit Test Suite**
  - File: `tests/localeCore.test.mjs`
  - Test Cases:
    1. `resolveInitialLocale` returns saved preference when valid (`'tr'`, `'en'`, `'ar'`).
    2. `resolveInitialLocale` ignores corrupted/invalid saved strings (e.g., `'fr'`, `'123'`, `null`, `undefined`) and falls through to browser preferences.
    3. `resolveInitialLocale` matches primary tag in `navigator.languages` (e.g. `['tr-TR', 'en-US']` -> `'tr'`).
    4. `resolveInitialLocale` falls back to Arabic (`'ar'`) when browser languages are unsupported or empty.
    5. `persistLocalePreference` writes valid locale to `localStorage` under key `ummet_locale`.
    6. `getLocaleDirection` returns `'rtl'` for `'ar'` and `'ltr'` for `'tr'` and `'en'`.
    7. `applyDocumentLocale` sets `doc.documentElement.lang` and `doc.documentElement.dir` synchronously.
  - Command: `node --test tests/localeCore.test.mjs`
  - Expected Failure: `Cannot find module '../src/domain/locale.ts'`.

- [ ] **Step 1.2: GREEN — Implement Locale Core**
  - File: `src/domain/locale.ts`
  - Implement validation, priority resolution ladder, persistence helpers, and document attribute mutator.
  - Command: `node --test tests/localeCore.test.mjs`
  - Expected Result: All 7 tests pass.

- [ ] **Step 1.3: Refactor & Typecheck**
  - Run: `npm run typecheck`
  - Ensure strict type safety and pure functional isolation.

- [ ] **Step 1.4: Regressions**
  - Run: `npm test`
  - Verify existing 97 tests remain unaffected.

### Recommended Commit Boundary
`git add src/domain/locale.ts tests/localeCore.test.mjs`
*Message*: `feat(i18n): implement core locale resolution, persistence, and DOM sync`

---

## Task 2: i18next Integration and AR/TR/EN Static Dictionary Skeleton

### Objective
Install `i18next` and `react-i18next`, configure the client-side i18n instance, establish typed translation schemas, and create the baseline dictionary skeleton for Arabic, Turkish, and English.

### Files
- **Modify**:
  - `package.json` (add `i18next`, `react-i18next`)
- **Create**:
  - `src/i18n/config.ts`
  - `src/i18n/locales/ar.ts`
  - `src/i18n/locales/tr.ts`
  - `src/i18n/locales/en.ts`
  - `tests/i18nConfig.test.mjs`

### Interfaces
- **Consumed**: `src/domain/locale.ts` (`Locale`, `resolveInitialLocale`, `applyDocumentLocale`).
- **Produced**:
  - `i18n` instance initialized synchronously with React bindings.
  - Translation namespaces: `common`, `navigation`, `auth`, `dashboard`, `admin`, `cms`, `errors`.
  - Type `TranslationSchema` matching `ar.ts` as canonical baseline.

### TDD Execution Steps

- [ ] **Step 2.1: RED — Write Configuration and Key Parity Test**
  - File: `tests/i18nConfig.test.mjs`
  - Test Cases:
    1. Initializes with correct default locale resolved from `resolveInitialLocale`.
    2. Synchronously exposes translation function `t()`.
    3. Verifies `ar.ts`, `tr.ts`, and `en.ts` export identical top-level namespace structures (`common`, `navigation`, `auth`, etc.).
    4. Language change via `i18n.changeLanguage(locale)` synchronously triggers `applyDocumentLocale`.
  - Command: `node --test tests/i18nConfig.test.mjs`
  - Expected Failure: Missing dependencies and missing module `src/i18n/config.ts`.

- [ ] **Step 2.2: GREEN — Install Dependencies & Implement i18n Configuration**
  - Add `i18next` and `react-i18next` to `package.json`.
  - Implement `src/i18n/locales/ar.ts`, `tr.ts`, `en.ts` with foundational dictionary skeleton.
  - Implement `src/i18n/config.ts` with synchronous initialization, `initImmediate: true`, and change event hook.
  - Command: `node --test tests/i18nConfig.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 2.3: Verification**
  - Run: `npm run typecheck`
  - Verify zero bundle errors.

### Recommended Commit Boundary
`git add package.json package-lock.json src/i18n/ tests/i18nConfig.test.mjs`
*Message*: `feat(i18n): initialize i18next instance and baseline AR/TR/EN translation namespaces`

---

## Task 3: Navbar and Mobile Language Selectors with Lang/Dir Updates

### Objective
Integrate the language switcher into desktop `Navbar.tsx` and mobile navigation. Support instant switching without URL changes, update `document.documentElement` attributes, and persist user preference.

### Files
- **Modify**:
  - `src/components/Navbar.tsx`
  - `src/context/AppContext.tsx`
  - `index.html` (early bootstrap script for zero-FOWL)
- **Create**:
  - `src/components/LanguageSwitcher.tsx`
  - `tests/languageSwitcher.test.mjs`

### Interfaces
- **Consumed**: `useTranslation()`, `persistLocalePreference()`, `applyDocumentLocale()`, `LOCALE_CONFIG`.
- **Produced**:
  - `<LanguageSwitcher variant="desktop" | "mobile" />`
  - Contextual active locale state in `AppContext`.

### TDD Execution Steps

- [ ] **Step 3.1: RED — Write Language Switcher Component Contract Test**
  - File: `tests/languageSwitcher.test.mjs`
  - Test Cases:
    1. Renders active language name without flags (e.g., `🌐 العربية`, `Türkçe`, `English`).
    2. Renders accessible dropdown/sheet with all supported locales.
    3. Selecting a new locale calls `i18n.changeLanguage`, `persistLocalePreference`, and updates document `dir` and `lang`.
    4. View state (`currentView`) remains unchanged upon language switch.
  - Command: `node --test tests/languageSwitcher.test.mjs`
  - Expected Failure: `Cannot find module '../src/components/LanguageSwitcher.tsx'`.

- [ ] **Step 3.2: GREEN — Implement LanguageSwitcher and Navbar Integration**
  - Build `src/components/LanguageSwitcher.tsx` with accessible keyboard navigation (ESC to close, arrow keys, focus trap).
  - Add inline head script to `index.html` to set initial `lang` and `dir` prior to bundle parsing (zero-FOWL).
  - Mount `<LanguageSwitcher variant="desktop" />` in desktop header actions and `<LanguageSwitcher variant="mobile" />` in mobile drawer.
  - Command: `node --test tests/languageSwitcher.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 3.3: Regressions**
  - Run: `node --test tests/sidebarNavigation.test.mjs`
  - Run: `npm run typecheck`

### Recommended Commit Boundary
`git add index.html src/components/LanguageSwitcher.tsx src/components/Navbar.tsx src/context/AppContext.tsx tests/languageSwitcher.test.mjs`
*Message*: `feat(ui): add desktop and mobile language selectors with instant document sync`

---

## Task 4: RTL/LTR Layout Audit and Logical-Direction Cleanup

### Objective
Audit and convert directional CSS utility classes across the application to CSS Logical Properties and direction-aware Tailwind classes (`start`/`end`, logical margins, paddings, text alignments, and directional icons).

### Files
- **Modify**:
  - `src/index.css` (add logical helper utilities and font stack declarations)
  - `tailwind.config.js` (enable logical utilities / RTL plugin if needed)
  - `src/components/Navbar.tsx`
  - `src/components/Footer.tsx`
  - `src/components/Sidebar.tsx`
  - `src/components/ConfirmationModal.tsx`
  - `src/components/SiteEditsPanel.tsx`
- **Create**:
  - `tests/directionalLayoutAudit.test.mjs`

### Interfaces
- **Consumed**: `dir="rtl"` vs `dir="ltr"` on `document.documentElement`.
- **Produced**: Direction-agnostic layout rules using `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`, `rtl:rotate-180`.

### TDD Execution Steps

- [ ] **Step 4.1: RED — Write Directional Class Audit Test**
  - File: `tests/directionalLayoutAudit.test.mjs`
  - Test Cases:
    1. Scans navigation and shell components for hardcoded `text-right` without corresponding LTR handling.
    2. Verifies directional chevron icons in breadcrumbs/pagination include `rtl:rotate-180` or directional abstraction.
    3. Asserts Latin typography (`system-ui`, Inter) is applied under `[dir="ltr"]` while Cairo/Tajawal is applied under `[dir="rtl"]`.
  - Command: `node --test tests/directionalLayoutAudit.test.mjs`
  - Expected Failure: Unmigrated physical alignment classes detected.

- [ ] **Step 4.2: GREEN — Refactor Shell Styles to Logical Properties**
  - Replace `left-0`/`right-0` overlays with logical positioning or explicit RTL/LTR variant classes.
  - Update `src/index.css` with font families:
    ```css
    [dir="rtl"] { font-family: 'Cairo', 'Tajawal', sans-serif; }
    [dir="ltr"] { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    ```
  - Refactor sidebar drawer animations and modal alignments.
  - Command: `node --test tests/directionalLayoutAudit.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 4.3: Regressions**
  - Run: `node --test tests/sidebarLayoutIntegration.test.mjs`
  - Verify layout integrity on both RTL and LTR.

### Recommended Commit Boundary
`git add src/index.css tailwind.config.js src/components/ tests/directionalLayoutAudit.test.mjs`
*Message*: `style(layout): convert UI layout to CSS logical properties and font switching`

---

## Task 5: Static UI Translation Inventory and Full Conversion

### Objective
Systematically extract all static, user-facing UI strings across public pages, dashboards, auth pages, and admin tools into the translation dictionary namespaces (`ar.ts`, `tr.ts`, `en.ts`) and replace them with `useTranslation()` calls.

### Files
- **Modify**:
  - `src/i18n/locales/ar.ts`
  - `src/i18n/locales/tr.ts`
  - `src/i18n/locales/en.ts`
  - `src/pages/HomePage.tsx`
  - `src/pages/AboutPage.tsx`
  - `src/pages/ProgramsPage.tsx`
  - `src/pages/EventsPage.tsx`
  - `src/pages/NewsPage.tsx`
  - `src/pages/GalleryPage.tsx`
  - `src/pages/StudentGuidePage.tsx`
  - `src/pages/FaqPage.tsx`
  - `src/pages/ContactPage.tsx`
  - `src/pages/ExecutiveBoardPage.tsx`
  - `src/pages/CommitteeDetailsPage.tsx`
  - `src/pages/AuthPage.tsx`
  - `src/pages/StudentDashboard.tsx`
  - `src/pages/AdminDashboard.tsx`
  - `src/components/Footer.tsx`
- **Create**:
  - `tests/staticTranslationInventory.test.mjs`

### Interfaces
- **Consumed**: `useTranslation()` hook from `react-i18next`.
- **Produced**: Fully internationalized static presentation components with institutional Turkish and English translations.

### TDD Execution Steps

- [ ] **Step 5.1: RED — Write Static String Coverage and Completeness Test**
  - File: `tests/staticTranslationInventory.test.mjs`
  - Test Cases:
    1. Validates all required static UI keys exist across all 3 locale dictionaries.
    2. Asserts rendered pages use `t('key')` instead of hardcoded strings for common actions (`save`, `cancel`, `delete`, `login`, `logout`, `search`, etc.).
    3. Confirms institutional glossary mappings are applied in TR and EN (e.g. `رئيس الاتحاد` -> `Birlik Başkanı` / `Union President`).
  - Command: `node --test tests/staticTranslationInventory.test.mjs`
  - Expected Failure: Missing translation keys and unextracted UI strings.

- [ ] **Step 5.2: GREEN — Populate Locales and Replace Component Strings**
  - Extract and populate all namespaces in `ar.ts`, `tr.ts`, `en.ts`.
  - Update all public and authenticated pages with `const { t } = useTranslation()`.
  - Command: `node --test tests/staticTranslationInventory.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 5.3: Typecheck and Regressions**
  - Run: `npm run typecheck`
  - Run: `npm test`

### Recommended Commit Boundary
`git add src/i18n/locales/ src/pages/ src/components/Footer.tsx tests/staticTranslationInventory.test.mjs`
*Message*: `feat(i18n): extract static UI strings to AR/TR/EN dictionaries across all pages`

---

## Task 6: Raw Arabic UI Audit and Translation-Key Parity Tests

### Objective
Create an automated static analysis test to ensure no raw Arabic string literals remain in user-facing JSX/TSX files outside an explicit, minimal allowlist (e.g. Arabic brand name, canonical fallback strings).

### Files
- **Create**:
  - `tests/rawArabicUiAudit.test.mjs`
  - `tests/translationParity.test.mjs`

### Interfaces
- **Consumed**: AST parsing of `src/pages/**/*.tsx` and `src/components/**/*.tsx`, locale files.
- **Produced**: Automated CI guard ensuring 100% key parity and absence of unextracted UI strings.

### TDD Execution Steps

- [ ] **Step 6.1: RED — Write Parity and Scanner Tests**
  - File: `tests/translationParity.test.mjs`
    - Recursively compares nested keys of `ar.ts`, `tr.ts`, `en.ts`. Asserts 0 missing keys, 0 extra keys.
  - File: `tests/rawArabicUiAudit.test.mjs`
    - Scans JSX text nodes and string props (`placeholder`, `title`, `aria-label`) for Arabic Unicode regex `[\u0600-\u06FF]`.
    - Fails if raw Arabic is found outside the allowlist (`ALLOWLIST_RAW_ARABIC` in test).
  - Command: `node --test tests/translationParity.test.mjs tests/rawArabicUiAudit.test.mjs`
  - Expected Failure: Any dangling hardcoded Arabic or mismatched translation keys trigger immediate failure.

- [ ] **Step 6.2: GREEN — Resolve Any Discrepancies**
  - Align any missing keys in `tr.ts` or `en.ts`.
  - Extract any lingering raw strings identified by the scanner.
  - Command: `node --test tests/translationParity.test.mjs tests/rawArabicUiAudit.test.mjs`
  - Expected Result: All parity and audit tests pass cleanly.

### Recommended Commit Boundary
`git add tests/rawArabicUiAudit.test.mjs tests/translationParity.test.mjs src/i18n/`
*Message*: `test(i18n): enforce translation key parity and raw Arabic string scanner`

---

## Task 7: Dynamic CMS Localization Domain Model and Compatibility Adapters

### Objective
Define the data structures, types, content hash algorithms, translatable path extractors, and legacy compatibility adapters for localized dynamic CMS content.

### Files
- **Create**:
  - `src/domain/cmsLocalization.ts`
  - `tests/cmsLocalizationDomain.test.mjs`

### Interfaces
- **Consumed**: `CmsTarget` from `src/domain/cmsTargets.ts`.
- **Produced**:
  - Types: `CmsLocalizationRecord`, `MultilingualCmsBundle<T>`, `LocalizationStatus`, `TranslatableFieldDescriptor`.
  - Constants: `TRANSLATABLE_CMS_FIELDS: Record<CmsTarget, string[]>`.
  - Functions:
    - `computeSourceContentHash(payload: Record<string, unknown>, paths: string[]): string`
    - `extractTranslatablePaths(target: CmsTarget, payload: Record<string, unknown>): Record<string, string>`
    - `applyTranslationsToPayload<T>(canonicalArabic: T, translatedValues: Record<string, string>): T`
    - `isTranslatableField(target: CmsTarget, path: string): boolean`
    - `adaptLegacyCmsContent<T>(rawContent: unknown, target: CmsTarget): { canonical: T; localizations: Record<'tr' | 'en', Partial<T>> }`

### TDD Execution Steps

- [ ] **Step 7.1: RED — Write Domain Model Unit Tests**
  - File: `tests/cmsLocalizationDomain.test.mjs`
  - Test Cases:
    1. `extractTranslatablePaths` extracts only natural language fields (e.g. `title`, `description`, `body`) and excludes IDs, dates, URLs, capacities, UUIDs.
    2. `computeSourceContentHash` produces deterministic SHA-256 / FNV-1a hash based solely on translatable values.
    3. `applyTranslationsToPayload` deep-merges translated strings into payload clone without altering non-translatable fields.
    4. `adaptLegacyCmsContent` safely normalizes legacy string-shaped rows into canonical Arabic and empty TR/EN structures without exceptions.
  - Command: `node --test tests/cmsLocalizationDomain.test.mjs`
  - Expected Failure: `Cannot find module '../src/domain/cmsLocalization.ts'`.

- [ ] **Step 7.2: GREEN — Implement Domain Model & Adapters**
  - File: `src/domain/cmsLocalization.ts`
  - Implement hash computation, path extraction, field descriptors, and legacy content normalization.
  - Command: `node --test tests/cmsLocalizationDomain.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 7.3: Regressions**
  - Run: `node --test tests/sectionContentRepository.test.mjs`
  - Run: `npm run typecheck`

### Recommended Commit Boundary
`git add src/domain/cmsLocalization.ts tests/cmsLocalizationDomain.test.mjs`
*Message*: `feat(cms): define CMS localization domain model, field descriptors, and legacy adapters`

---

## Task 8: Localized CMS Read, Selection, and Fallback Behavior

### Objective
Update content repositories (`sectionContentRepository.ts`, `siteContentRepository.ts`) and view rendering hooks to read from the parallel `cms_localizations` layer and provide safe fallback to canonical Arabic when translations are pending or missing.

### Files
- **Modify**:
  - `src/domain/sectionContentRepository.ts`
  - `src/services/sectionContentService.ts`
  - `src/services/siteContentService.ts`
- **Create**:
  - `src/components/LocalizedFallbackNotice.tsx`
  - `tests/localizedCmsResolution.test.mjs`

### Interfaces
- **Consumed**: `CmsLocalizationRecord`, `Locale`, `resolveLocalizedContent`.
- **Produced**:
  - Localized section content fetchers returning `{ data: T; isFallback: boolean; isStale: boolean }`.
  - Component `<LocalizedFallbackNotice locale={currentLocale} />`.

### TDD Execution Steps

- [ ] **Step 8.1: RED — Write CMS Content Resolution Test**
  - File: `tests/localizedCmsResolution.test.mjs`
  - Test Cases:
    1. Resolves canonical Arabic when active locale is `'ar'`.
    2. Resolves Turkish payload when active locale is `'tr'` and published localization exists.
    3. Resolves English payload when active locale is `'en'` and published localization exists.
    4. When Turkish localization is missing or empty, safely returns canonical Arabic with `isFallback: true`.
    5. When localization is stale (`status: 'stale'`), returns existing translation with `isStale: true`.
  - Command: `node --test tests/localizedCmsResolution.test.mjs`
  - Expected Failure: Localized query resolution methods missing.

- [ ] **Step 8.2: GREEN — Implement Parallel Fetching and Fallback Resolver**
  - Augment repository queries to join or batch-fetch `cms_localizations` matching active locale.
  - Implement `resolveLocalizedContent` logic.
  - Create `<LocalizedFallbackNotice />` displaying localized notice ("This content is temporarily available in Arabic only.").
  - Command: `node --test tests/localizedCmsResolution.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 8.3: Regressions**
  - Run: `npm test`
  - Ensure all existing CMS persistence tests pass.

### Recommended Commit Boundary
`git add src/domain/sectionContentRepository.ts src/services/ src/components/LocalizedFallbackNotice.tsx tests/localizedCmsResolution.test.mjs`
*Message*: `feat(cms): add parallel localization query resolution and Arabic fallback banner`

---

## Task 9: Multilingual Editing UI (AR Source + TR/EN Review Fields)

### Objective
Update the inline CMS edit overlays and editor panels to display the 3-column / tabbed multilingual editor layout: Arabic (canonical source), Turkish, and English fields with translation action buttons.

### Files
- **Modify**:
  - `src/components/InlineEditOverlay.tsx`
- **Create**:
  - `src/components/MultilingualFieldEditor.tsx`
  - `tests/multilingualEditingUi.test.mjs`

### Interfaces
- **Consumed**: `MultilingualCmsBundle`, `TranslatableFieldDescriptor`.
- **Produced**:
  - `<MultilingualFieldEditor label={...} sourceArabic={...} turkishValue={...} englishValue={...} onChange={...} />`.
  - Auto Translate trigger button (invoking translation callback, populating review fields without auto-publishing).

### TDD Execution Steps

- [ ] **Step 9.1: RED — Write Multilingual Field Editor Component Test**
  - File: `tests/multilingualEditingUi.test.mjs`
  - Test Cases:
    1. Renders Arabic source as canonical field.
    2. Renders Turkish and English review fields.
    3. Clicking "Auto Translate" calls translation handler and updates TR & EN form fields.
    4. Auto Translate does NOT submit or publish the form.
    5. Allows manual keyboard edits to Turkish and English fields independently.
  - Command: `node --test tests/multilingualEditingUi.test.mjs`
  - Expected Failure: `Cannot find module '../src/components/MultilingualFieldEditor.tsx'`.

- [ ] **Step 9.2: GREEN — Implement MultilingualFieldEditor and Integrate Overlay**
  - Implement `src/components/MultilingualFieldEditor.tsx` with responsive layout (tabs on mobile, side-by-side on desktop).
  - Integrate into `InlineEditOverlay.tsx`.
  - Command: `node --test tests/multilingualEditingUi.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 9.3: Verification**
  - Run: `npm run typecheck`

### Recommended Commit Boundary
`git add src/components/MultilingualFieldEditor.tsx src/components/InlineEditOverlay.tsx tests/multilingualEditingUi.test.mjs`
*Message*: `feat(cms-ui): build multilingual field editor with side-by-side review inputs`

---

## Task 10: Stale and Manual Translation Metadata with Source-Hash Tracking

### Objective
Implement deterministic field-level and payload-level hash tracking to detect source modifications, mark translations as stale, and preserve manual human corrections.

### Files
- **Modify**:
  - `src/domain/cmsLocalization.ts`
- **Create**:
  - `tests/staleTranslationTracking.test.mjs`

### Interfaces
- **Consumed**: `computeSourceContentHash`, `CmsLocalizationRecord`.
- **Produced**:
  - `evaluateLocalizationFreshness(canonicalArabic: Record<string, unknown>, localization: CmsLocalizationRecord, translatablePaths: string[]): LocalizationFreshnessResult`
  - `markManualFieldEdit(localization: CmsLocalizationRecord, path: string): CmsLocalizationRecord`

### TDD Execution Steps

- [ ] **Step 10.1: RED — Write Stale Detection and Manual Override Test**
  - File: `tests/staleTranslationTracking.test.mjs`
  - Test Cases:
    1. When Arabic source text at `title` changes, `evaluateLocalizationFreshness` detects hash mismatch and marks `stale_paths: ['title']` and `status: 'stale'`.
    2. Does NOT delete existing Turkish or English translations when marked stale.
    3. When user manually edits Turkish `description`, path is added to `manual_paths`.
    4. Subsequent re-translation of `title` does NOT overwrite `description` in `manual_paths`.
    5. If only `title` changed, re-translation diff only requests translation for `title`.
  - Command: `node --test tests/staleTranslationTracking.test.mjs`
  - Expected Failure: Functions not implemented.

- [ ] **Step 10.2: GREEN — Implement Stale Tracking Logic**
  - Implement path-level hashing, diff comparison, and manual path preservation in `src/domain/cmsLocalization.ts`.
  - Command: `node --test tests/staleTranslationTracking.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 10.3: Regressions**
  - Run: `npm test`

### Recommended Commit Boundary
`git add src/domain/cmsLocalization.ts tests/staleTranslationTracking.test.mjs`
*Message*: `feat(cms): implement source-hash freshness check and manual translation preservation`

---

## Task 11: TranslationProvider Abstraction and Request Domain Contract

### Objective
Create the provider interface contract and domain services so the application interacts with a decoupled translation layer rather than direct Azure SDK calls.

### Files
- **Create**:
  - `src/domain/translationProvider.ts`
  - `src/services/translationService.ts`
  - `tests/translationProviderContract.test.mjs`

### Interfaces
- **Consumed**: `supabase.functions.invoke`.
- **Produced**:
  - Interface `TranslationProvider`:
    `translate(request: TranslationRequest): Promise<TranslationResponse>`
  - Class `EdgeFunctionTranslationProvider implements TranslationProvider`
  - Function `createTranslationService(provider: TranslationProvider): TranslationService`

### TDD Execution Steps

- [ ] **Step 11.1: RED — Write Provider Contract and Mock Provider Tests**
  - File: `tests/translationProviderContract.test.mjs`
  - Test Cases:
    1. Mock provider satisfies `TranslationProvider` contract.
    2. Enforces valid source language (`'ar'`) and targets (`'tr'`, `'en'`).
    3. Rejects empty text arrays or texts exceeding maximum character budget.
    4. Normalizes whitespace and preserves institutional glossary matches.
    5. Handles network or provider errors gracefully with structured error codes (`PROVIDER_UNAVAILABLE`, `RATE_LIMITED`).
  - Command: `node --test tests/translationProviderContract.test.mjs`
  - Expected Failure: `Cannot find module '../src/domain/translationProvider.ts'`.

- [ ] **Step 11.2: GREEN — Implement TranslationProvider & Service**
  - Implement contract, request validation, batch chunking, and edge function adapter.
  - Command: `node --test tests/translationProviderContract.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 11.3: Typecheck**
  - Run: `npm run typecheck`

### Recommended Commit Boundary
`git add src/domain/translationProvider.ts src/services/translationService.ts tests/translationProviderContract.test.mjs`
*Message*: `feat(translation): establish TranslationProvider abstraction and translation service`

---

## Task 12: Server-Side Translation Edge Function with Azure Provider (Local Only)

### Objective
Author the local Supabase Edge Function `translate-content` that integrates with Microsoft Azure Translator F0 API using server-side credentials and institutional glossary mapping. *Local development files only; zero remote deployment.*

### Files
- **Create**:
  - `supabase/functions/translate-content/index.ts`
  - `supabase/functions/translate-content/azureTranslator.ts`
  - `supabase/functions/translate-content/glossary.ts`
  - `tests/translateContentEdgeFunction.test.mjs`

### Interfaces
- **Consumed**: `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`, `AZURE_TRANSLATOR_ENDPOINT`.
- **Produced**: Local Deno HTTP handler responding to `POST /functions/v1/translate-content`.

### TDD Execution Steps

- [ ] **Step 12.1: RED — Write Edge Function Contract and Mock Azure Tests**
  - File: `tests/translateContentEdgeFunction.test.mjs`
  - Test Cases:
    1. Rejects requests without `Authorization` bearer token (401).
    2. Validates request body schema (`texts`, `sourceLocale`, `targetLocales`).
    3. Formats Azure Translator API payload with query params `from=ar&to=tr&to=en`.
    4. Applies institutional glossary overrides post-translation (e.g. `Ümmet Gençleri Birliği`).
    5. Returns 200 with structured translations object `{ translations: { tr: [...], en: [...] } }`.
  - Command: `node --test tests/translateContentEdgeFunction.test.mjs`
  - Expected Failure: Edge function files do not exist.

- [ ] **Step 12.2: GREEN — Implement Local Edge Function and Azure Client**
  - Write `glossary.ts` with institutional dictionary.
  - Write `azureTranslator.ts` with Azure REST request formatting.
  - Write `index.ts` Deno handler with CORS and error handling.
  - Command: `node --test tests/translateContentEdgeFunction.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 12.3: Verification**
  - Verify zero secrets in frontend files:
    Search repository: ensure no `VITE_AZURE_*` strings exist.

### Recommended Commit Boundary
`git add supabase/functions/translate-content/ tests/translateContentEdgeFunction.test.mjs`
*Message*: `feat(functions): author server-side translate-content Edge Function with Azure adapter`

---

## Task 13: Translation Endpoint Authorization and Abuse Controls

### Objective
Enforce strict security in the Edge Function: verify caller JWT identity, check active executive board membership in `public.executive_assignments`, enforce batch size limits, and rate-limit calls.

### Files
- **Modify**:
  - `supabase/functions/translate-content/index.ts`
- **Create**:
  - `tests/translateAuthorizationAbuse.test.mjs`

### Interfaces
- **Consumed**: Supabase Auth client, `public.executive_assignments` table check.
- **Produced**: Enforced authorization gate: HTTP 403 Forbidden for non-executive callers.

### TDD Execution Steps

- [ ] **Step 13.1: RED — Write Security and Abuse Control Tests**
  - File: `tests/translateAuthorizationAbuse.test.mjs`
  - Test Cases:
    1. Anonymous request returns 401 Unauthorized.
    2. Authenticated user who is a regular student (`STUDENT`) returns 403 Forbidden ("Executive role required").
    3. Authenticated user with valid executive assignment (`MEDIA_HEAD`, `PRESIDENT`, etc.) is permitted.
    4. Request containing more than 50 text items returns 400 Bad Request.
    5. Request with total character count exceeding 10,000 returns 400 Bad Request.
    6. Rejects unsupported target language codes (e.g. `'fr'`, `'es'`).
  - Command: `node --test tests/translateAuthorizationAbuse.test.mjs`
  - Expected Failure: Security assertions fail on unhardened handler.

- [ ] **Step 13.2: GREEN — Implement Executive Verification & Input Guards**
  - Query Supabase DB using caller's JWT to verify executive membership.
  - Add text count, character length, and language validation guards.
  - Command: `node --test tests/translateAuthorizationAbuse.test.mjs`
  - Expected Result: Pass.

### Recommended Commit Boundary
`git add supabase/functions/translate-content/index.ts tests/translateAuthorizationAbuse.test.mjs`
*Message*: `feat(security): enforce executive role verification and payload guards on translation endpoint`

---

## Task 14: Draft Workflow and Translation Retry

### Objective
Allow editors to save Arabic content as a draft if translation fails or is deferred, preserving Arabic text, partial translations, author metadata, and target information with a one-click "Retry Translation" action.

### Files
- **Modify**:
  - `src/components/InlineEditOverlay.tsx`
  - `src/services/sectionContentService.ts`
- **Create**:
  - `src/domain/cmsDraft.ts`
  - `tests/cmsDraftWorkflow.test.mjs`

### Interfaces
- **Consumed**: `MultilingualCmsBundle`, `localStorage` (client draft backup) / draft table.
- **Produced**:
  - Functions: `saveCmsDraft`, `loadCmsDraft`, `discardCmsDraft`, `retryTranslationForDraft`.

### TDD Execution Steps

- [ ] **Step 14.1: RED — Write Draft Workflow Test**
  - File: `tests/cmsDraftWorkflow.test.mjs`
  - Test Cases:
    1. Saving a draft retains Arabic source when translation fails due to network outage.
    2. Draft includes `target`, `baseVersion`, `authorId`, `updatedAt`, and partial TR/EN fields.
    3. "Retry Translation" resumes translation of the draft without losing existing manual edits.
    4. Discarding draft clears saved draft state cleanly.
  - Command: `node --test tests/cmsDraftWorkflow.test.mjs`
  - Expected Failure: `Cannot find module '../src/domain/cmsDraft.ts'`.

- [ ] **Step 14.2: GREEN — Implement Draft Helpers and UI Integration**
  - Implement draft persistence and recovery in `src/domain/cmsDraft.ts`.
  - Add "Save Draft" and "Retry Translation" actions to `InlineEditOverlay.tsx`.
  - Command: `node --test tests/cmsDraftWorkflow.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 14.3: Regressions**
  - Run: `npm test`

### Recommended Commit Boundary
`git add src/domain/cmsDraft.ts src/components/InlineEditOverlay.tsx tests/cmsDraftWorkflow.test.mjs`
*Message*: `feat(cms): add draft persistence and translation retry mechanism`

---

## Task 15: Emergency Arabic-Only Publication Policy and UI

### Objective
Implement the approved emergency exception: allow the President to publish urgent Arabic content immediately when translation is down, requiring strong confirmation, flagging TR/EN as stale, and rendering localized fallback notices to public visitors.

### Files
- **Modify**:
  - `src/components/InlineEditOverlay.tsx`
  - `src/components/SiteEditsPanel.tsx`
  - `src/domain/cmsLocalization.ts`
- **Create**:
  - `tests/emergencyArabicPublish.test.mjs`

### Interfaces
- **Consumed**: `currentUserRole === 'PRESIDENT'`, `MultilingualCmsBundle`.
- **Produced**: Emergency publish toggle with warning confirmation dialog and fallback flag generator.

### TDD Execution Steps

- [ ] **Step 15.1: RED — Write Emergency Publish Test**
  - File: `tests/emergencyArabicPublish.test.mjs`
  - Test Cases:
    1. Emergency publish option is hidden or disabled for non-President roles.
    2. Attempting emergency publish requires explicit confirmation of warning dialog.
    3. Emergency publication payload records Arabic content to published table and marks `cms_localizations` status as `'stale'` with `stale_paths: ['*']`.
    4. Content remains flagged in Admin/SiteEditsPanel as "Pending Translation".
    5. Public Turkish and English views render canonical Arabic alongside `<LocalizedFallbackNotice />`.
  - Command: `node --test tests/emergencyArabicPublish.test.mjs`
  - Expected Failure: Emergency publish logic not implemented.

- [ ] **Step 15.2: GREEN — Implement Emergency Publish Handler & UI**
  - Add President-gated emergency publish workflow and confirmation modal.
  - Set stale localization metadata flags on emergency publish.
  - Command: `node --test tests/emergencyArabicPublish.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 15.3: Regressions**
  - Run: `node --test tests/editApprovalPolicy.test.mjs`

### Recommended Commit Boundary
`git add src/components/InlineEditOverlay.tsx src/components/SiteEditsPanel.tsx src/domain/cmsLocalization.ts tests/emergencyArabicPublish.test.mjs`
*Message*: `feat(cms): add President emergency Arabic-only publish override with fallback flags`

---

## Task 16: Integrate Multilingual Payload with Existing Approval Flow

### Objective
Integrate multilingual content bundles (`Arabic`, `Turkish`, `English`, translation metadata) into the existing `edit_requests` architecture. Ensure the President reviews all language variants side-by-side in `SiteEditsPanel.tsx` and approves them atomically.

### Files
- **Modify**:
  - `src/components/SiteEditsPanel.tsx`
  - `src/domain/sectionContentRepository.ts`
  - `src/services/siteContentService.ts`
- **Create**:
  - `tests/multilingualEditApproval.test.mjs`

### Interfaces
- **Consumed**: `public.edit_requests` table, `edit_request_service.ts`.
- **Produced**: Unified multilingual approval submission and atomic publication handling.

### TDD Execution Steps

- [ ] **Step 16.1: RED — Write Multilingual Approval Integration Test**
  - File: `tests/multilingualEditApproval.test.mjs`
  - Test Cases:
    1. Submitting a site edit wraps AR, TR, EN, and source hash in `edit_requests.site_payload`.
    2. `SiteEditsPanel` displays language tabs/columns for Arabic, Turkish, and English versions in the review diff.
    3. Highlights stale fields or missing translations visually to the President.
    4. Approving the request executes an atomic transaction writing Arabic to `published_site_content` and localizations to `cms_localizations`.
    5. Rejecting the request updates status to `rejected` with reasons preserved.
  - Command: `node --test tests/multilingualEditApproval.test.mjs`
  - Expected Failure: Approval handlers do not process multilingual payloads.

- [ ] **Step 16.2: GREEN — Implement Multilingual Review and Atomic Approval**
  - Update `SiteEditsPanel.tsx` to render side-by-side language review diffs.
  - Update approval RPC call to update both canonical content and `cms_localizations`.
  - Command: `node --test tests/multilingualEditApproval.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 16.3: Regressions**
  - Run: `node --test tests/executiveEditApprovalFlow.test.mjs`
  - Run: `node --test tests/editApprovalPolicy.test.mjs`

### Recommended Commit Boundary
`git add src/components/SiteEditsPanel.tsx src/domain/sectionContentRepository.ts src/services/siteContentService.ts tests/multilingualEditApproval.test.mjs`
*Message*: `feat(approval): integrate multilingual bundle review and atomic approval in SiteEditsPanel`

---

## Task 17: Storage Migration SQL Locally for Localization Persistence (Local Only)

### Objective
Author the local PostgreSQL migration file defining `public.cms_localizations`, indexes, foreign keys, and RLS policies. *Local file creation only — do NOT push to remote Supabase.*

### Files
- **Create**:
  - `supabase/migrations/20260905000000_cms_localizations.sql`
  - `tests/cmsLocalizationsMigration.test.mjs`

### Interfaces
- **Consumed**: Local migration runner / SQL parser.
- **Produced**: Local DDL migration with idempotent structure (`CREATE TABLE IF NOT EXISTS`, RLS policies, indexes).

### TDD Execution Steps

- [ ] **Step 17.1: RED — Write Migration Verification Test**
  - File: `tests/cmsLocalizationsMigration.test.mjs`
  - Test Cases:
    1. Verifies migration file exists and adheres to version naming convention.
    2. Asserts table schema contains: `id`, `target`, `locale`, `payload`, `source_hash`, `source_version`, `status`, `stale_paths`, `manual_paths`, `updated_by`, `updated_at`.
    3. Verifies unique constraint on `(target, locale)`.
    4. Verifies check constraint on `locale IN ('tr', 'en')`.
    5. Verifies RLS is enabled with public SELECT for published records and executive-only INSERT/UPDATE.
  - Command: `node --test tests/cmsLocalizationsMigration.test.mjs`
  - Expected Failure: Migration file missing.

- [ ] **Step 17.2: GREEN — Author Migration File**
  - Write `supabase/migrations/20260905000000_cms_localizations.sql`.
  - Command: `node --test tests/cmsLocalizationsMigration.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 17.3: Strict Safety Check**
  - Verify NO `supabase db push` was executed.
  - Verify remote Supabase project ref `rscunkzvbsdbjzhnuria` was not contacted.

### Recommended Commit Boundary
`git add supabase/migrations/20260905000000_cms_localizations.sql tests/cmsLocalizationsMigration.test.mjs`
*Message*: `feat(db): author local migration for public.cms_localizations table`

---

## Task 18: Existing CMS Content Inventory and Backfill Generation Strategy

### Objective
Create an automated audit script that inspects all existing production/mock CMS content (hero, about, programs, events, guide, FAQ, contact) and produces an exact inventory of fields requiring translation backfill.

### Files
- **Create**:
  - `scripts/auditCmsTranslationInventory.mjs`
  - `tests/cmsInventoryAudit.test.mjs`

### Interfaces
- **Consumed**: `src/data/mockData.ts`, CMS targets.
- **Produced**: Structured JSON report of all translatable fields and character count estimates for Azure budget planning.

### TDD Execution Steps

- [ ] **Step 18.1: RED — Write Inventory Audit Test**
  - File: `tests/cmsInventoryAudit.test.mjs`
  - Test Cases:
    1. Discovers all translatable content across mock and seed datasets.
    2. Identifies 0 untracked CMS targets.
    3. Computes exact character budget (verifying it fits within free Azure F0 2,000,000 chars/month limit).
    4. Confirms non-translatable fields (IDs, dates, URLs) are strictly excluded from the count.
  - Command: `node --test tests/cmsInventoryAudit.test.mjs`
  - Expected Failure: Script missing.

- [ ] **Step 18.2: GREEN — Implement Inventory Script**
  - Author `scripts/auditCmsTranslationInventory.mjs`.
  - Command: `node --test tests/cmsInventoryAudit.test.mjs`
  - Expected Result: Pass.

### Recommended Commit Boundary
`git add scripts/auditCmsTranslationInventory.mjs tests/cmsInventoryAudit.test.mjs`
*Message*: `chore(cms): implement CMS content inventory and character budget audit script`

---

## Task 19: Initial Turkish and English Content Population Workflow

### Objective
Generate the initial high-quality Turkish and English localizations for existing site content using the institutional glossary, and package them as baseline seed records for `cms_localizations`.

### Files
- **Create**:
  - `src/data/initialLocalizations/tr.json`
  - `src/data/initialLocalizations/en.json`
  - `tests/initialContentLocalizations.test.mjs`

### Interfaces
- **Consumed**: `src/data/mockData.ts`, `TRANSLATABLE_CMS_FIELDS`.
- **Produced**: Seed localizations for all public CMS sections in Turkish and English.

### TDD Execution Steps

- [ ] **Step 19.1: RED — Write Initial Localizations Parity Test**
  - File: `tests/initialContentLocalizations.test.mjs`
  - Test Cases:
    1. Asserts `tr.json` and `en.json` provide translations for 100% of existing canonical Arabic CMS targets.
    2. Verifies institutional terms match glossary (`Ümmet Gençleri Birliği`, `Birlik Başkanı`).
    3. Verifies zero placeholders or machine artifacts (`[object Object]`, `undefined`, `TODO`).
  - Command: `node --test tests/initialContentLocalizations.test.mjs`
  - Expected Failure: Files missing.

- [ ] **Step 19.2: GREEN — Populate Initial Localizations**
  - Author `tr.json` and `en.json` with natural, high-fidelity translations.
  - Command: `node --test tests/initialContentLocalizations.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 19.3: Regressions**
  - Run: `npm test`

### Recommended Commit Boundary
`git add src/data/initialLocalizations/ tests/initialContentLocalizations.test.mjs`
*Message*: `feat(data): add initial seed localizations for Turkish and English CMS content`

---

## Task 20: Date, Number, and Locale Formatting Helpers

### Objective
Implement locale-aware date, time, and number formatting utilities using `Intl.DateTimeFormat` and `Intl.NumberFormat`, with strict guards preventing the formatting of phone numbers, IDs, UUIDs, or verification codes.

### Files
- **Create**:
  - `src/domain/formatters.ts`
  - `tests/localizedFormatters.test.mjs`

### Interfaces
- **Consumed**: Standard `Intl` API, `Locale`.
- **Produced**:
  - `formatLocalizedDate(date: string | Date, locale: Locale, options?: Intl.DateTimeFormatOptions): string`
  - `formatLocalizedNumber(num: number, locale: Locale, options?: Intl.NumberFormatOptions): string`
  - `formatLocalizedRelativeTime(timestamp: string | Date, locale: Locale): string`

### TDD Execution Steps

- [ ] **Step 20.1: RED — Write Formatter Test Suite**
  - File: `tests/localizedFormatters.test.mjs`
  - Test Cases:
    1. Formats date in Arabic (`15 أكتوبر 2026`).
    2. Formats date in Turkish (`15 Ekim 2026`).
    3. Formats date in English (`October 15, 2026`).
    4. Formats numbers using locale conventions.
    5. Explicitly rejects phone numbers, UUIDs, and system IDs from locale numeral conversion.
  - Command: `node --test tests/localizedFormatters.test.mjs`
  - Expected Failure: `Cannot find module '../src/domain/formatters.ts'`.

- [ ] **Step 20.2: GREEN — Implement Formatters**
  - File: `src/domain/formatters.ts`.
  - Command: `node --test tests/localizedFormatters.test.mjs`
  - Expected Result: Pass.

- [ ] **Step 20.3: Replace Ad-Hoc Date Strings in Components**
  - Integrate `formatLocalizedDate` into `EventsPage.tsx`, `NewsPage.tsx`, `SiteEditsPanel.tsx`.
  - Run: `npm run typecheck`

### Recommended Commit Boundary
`git add src/domain/formatters.ts tests/localizedFormatters.test.mjs src/pages/`
*Message*: `feat(i18n): implement locale-aware date and number formatters`

---

## Task 21: Full Regression, Accessibility, Mobile, and RTL/LTR Verification

### Objective
Perform end-to-end regression testing across the entire application: test all user roles (Guest, Student, Media Head, Academic Head, President), verify mobile navigation, check screen reader accessibility attributes, and validate RTL/LTR visual stability.

### Files
- **Create**:
  - `tests/multilingualEndToEnd.test.mjs`

### Interfaces
- **Consumed**: All application components, routes, auth flows.
- **Produced**: Complete verification report.

### TDD Execution Steps

- [ ] **Step 21.1: RED — Write Comprehensive Regression Test Suite**
  - File: `tests/multilingualEndToEnd.test.mjs`
  - Test Cases:
    1. Guest navigation across all public views in AR, TR, EN.
    2. Student login, dashboard view, achievements, points in all 3 languages.
    3. Executive role actions: Media Head submits CMS edit bundle; President reviews and approves.
    4. Executive revocation feature from parent branch (`feature-member-role-management`) remains operational.
    5. Zero console errors or unhandled rejections during locale switching.
  - Command: `node --test tests/multilingualEndToEnd.test.mjs`
  - Expected Failure: Uncovered edge cases trigger failure.

- [ ] **Step 21.2: GREEN — Fix Any Edge Cases & Verify**
  - Resolve any lingering issues.
  - Command: `node --test tests/multilingualEndToEnd.test.mjs`
  - Expected Result: All pass.

- [ ] **Step 21.3: Full Test Suite Run**
  - Command: `npm test`
  - Expected Result: 100% of test files pass.

- [ ] **Step 21.4: Production Build Check**
  - Command: `npm run build`
  - Expected Result: Clean build with zero TypeScript or Vite bundle errors.

### Recommended Commit Boundary
`git add tests/multilingualEndToEnd.test.mjs`
*Message*: `test(e2e): verify full multilingual user flows, accessibility, and role regressions`

---

## Task 22: Pre-Deployment Audit and Supabase Deployment-Readiness Report

### Objective
Prepare a comprehensive, read-only deployment-readiness report detailing migration requirements, Edge Function environment variable specifications, and rollback procedures. *No remote deployment will be executed.*

### Files
- **Create**:
  - `docs/superpowers/reports/2026-09-04-multilingual-deployment-readiness.md`

### Interfaces
- **Consumed**: Local migration files, Edge Function manifests.
- **Produced**: Authoritative deployment guide for future staging/production application.

### Verification Steps

- [ ] **Step 22.1: Verify Zero Remote Drift Interactions**
  - Ensure no unapproved remote SQL or schema changes occurred.
- [ ] **Step 22.2: Document Required Supabase Secrets**
  - `AZURE_TRANSLATOR_KEY`
  - `AZURE_TRANSLATOR_REGION`
  - `AZURE_TRANSLATOR_ENDPOINT`
- [ ] **Step 22.3: Document Staging Migration Procedure**
  - Outline safe migration application steps after remote history resolution.
- [ ] **Step 22.4: Write Report**
  - Author `docs/superpowers/reports/2026-09-04-multilingual-deployment-readiness.md`.

### Recommended Commit Boundary
`git add docs/superpowers/reports/2026-09-04-multilingual-deployment-readiness.md`
*Message*: `docs(deployment): create pre-deployment audit and readiness report`

---

## Verification & Completion Checklist

- [ ] All 22 tasks have explicit files, consumed/produced interfaces, failing tests, commands, green tests, and commit boundaries.
- [ ] One canonical URL preserved throughout; zero language prefixes.
- [ ] Arabic is the canonical editorial source of truth (`AR -> TR`, `AR -> EN`).
- [ ] Static UI text and dynamic CMS content strictly separated.
- [ ] Azure Translator sits behind `TranslationProvider` abstraction on the server side.
- [ ] No translator credentials or secrets exposed to browser bundles.
- [ ] Identity data and user-generated content strictly excluded from translation.
- [ ] Existing approval workflow (`SiteEditsPanel`, `edit_requests`) preserved.
- [ ] Emergency Arabic-only publish available as an exceptional, President-confirmed path.
- [ ] Zero remote Supabase execution during implementation.
- [ ] Role revocation from parent branch verified intact.
