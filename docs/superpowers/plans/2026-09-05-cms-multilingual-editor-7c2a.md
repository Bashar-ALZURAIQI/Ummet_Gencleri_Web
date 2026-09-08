# CMS Multilingual Editor 7C2A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable same-place multilingual editing foundation, integrate it with existing inline CMS editing, and correct fixed Event category localization without adding a real translation provider or production persistence.

**Architecture:** Arabic remains canonical. Turkish and English are localization overlays accessed through `CmsLocalizationRepository`. Reusable translation UI components consume the existing translatable-field schema and localization domain; fixed system enums remain canonical and use localized presentation helpers.

**Tech Stack:** React 18, TypeScript, i18next/react-i18next, existing CmsLocalization domain/repository abstractions, Vite, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-05-cms-multilingual-editor-design.md`

---

## Scope & Boundaries for Task 7C2A

### In Scope (Task 7C2A)
1. **Pure Localization Editor Domain Helpers (`src/domain/cmsLocalizationEditor.ts`)**:
   - `isTranslatableLocationValue(value)`: Value-aware guard differentiating human editorial text from URLs or map coordinates.
   - `deriveFieldLocalizationState(...)`: Pure state derivation for field-level staleness, manual flags, and resolution.
   - `recordManualPath(...)`: Tracks touched paths in `manualPaths` array using `normalizeLocalizationPaths`.
2. **Reusable Multilingual Presentation Components (`src/components/cmsLocalization/`)**:
   - `TranslationStatusBadge.tsx`: Color-coded, localized pill (`طازجة ✓`, `بحاجة لتحديث ⚠`, `مسودة ✎`, `غير مترجمة ✕`).
   - `LocalizedFieldEditor.tsx`: Directional text input or textarea enforcing content locale direction (`dir="rtl"` for AR, `dir="ltr"` for TR/EN).
   - `CmsTranslationSection.tsx`: Collapsible accordion for inline editors managing TR/EN draft and publish state.
3. **Repository Context Injection (`src/context/CmsLocalizationContext.tsx`)**:
   - React context providing `CmsLocalizationRepository` (defaults to `InMemoryCmsLocalizationRepository`).
   - Zero Supabase dependencies in UI components.
4. **`InlineEditOverlay.tsx` Integration**:
   - `EditableField` and `EditableCard` integration: Displays canonical Arabic editor at top and collapsible `CmsTranslationSection` for allowlisted paths.
   - Guarded by `isCmsPathTranslatable(target, path)`.
   - Canonical save isolation: Failures in TR/EN saves do not cancel or discard successful Arabic canonical saves.
5. **Event Category Fixed Enum Presentation Fix**:
   - `src/pages/AdminDashboard.tsx`: Fixes category select options and table badge from raw `categoryLabels` to `getEventCategoryLabel(..., t)`.
   - Preserves canonical `EventCategory` option values and table keys.
   - Verifies `activityType` retains canonical `MANDATORY`, `OPTIONAL`, `PAID` with localized labels.
6. **I18n Dictionary Additions**:
   - Updates `src/i18n/locales/ar.ts`, `tr.ts`, `en.ts` with `cmsLocalization` dictionary keys.
7. **Comprehensive Automated Test Suite**:
   - 26 mandatory automated test scenarios in `tests/cmsMultilingualEditor7c2a.test.mjs`.

### Strictly Out of Scope (Deferred to Future Tasks)
- **NO Real Translation Provider / Azure Translator**: Belongs to Task 7D.
- **NO Large Admin Content Modals (Events, News, Gallery, FAQ, Guide, Plans, Reports, Committees)**: Belongs to Task 7C2B.
- **NO Supabase Tables, Migrations, RLS, or Production Persistence**: Belongs to Persistence Phase.
- **NO Initial Backfill of Existing Arabic Content**: Belongs to Backfill Phase (after 7D & Persistence).
- **NO Translation Debt Monitoring Dashboard**: Belongs to Dashboard Phase (after Persistence).
- **NO Public Read Hook Rewrites**: Belongs to Phase 7C2B public rollout.
- **NO Route or URL Language Prefixes**: Strictly forbidden.

---

## File Structure & Touch Points

```
src/
├── domain/
│   └── cmsLocalizationEditor.ts       [NEW] Pure state helpers & location value guard
├── context/
│   └── CmsLocalizationContext.tsx     [NEW] Repository context & provider
├── components/
│   ├── cmsLocalization/
│   │   ├── TranslationStatusBadge.tsx [NEW] Localized status pill
│   │   ├── LocalizedFieldEditor.tsx   [NEW] Directional text input/textarea
│   │   └── CmsTranslationSection.tsx  [NEW] Collapsible TR/EN inline section
│   └── InlineEditOverlay.tsx          [MODIFY] Integrate CmsTranslationSection
├── pages/
│   └── AdminDashboard.tsx             [MODIFY] Event category display bugfix
├── i18n/
│   └── locales/
│       ├── ar.ts                      [MODIFY] Add cmsLocalization keys
│       ├── tr.ts                      [MODIFY] Add cmsLocalization keys
│       └── en.ts                      [MODIFY] Add cmsLocalization keys
tests/
└── cmsMultilingualEditor7c2a.test.mjs [NEW] 26 mandatory TDD scenarios
```

---

## Tasks Breakdown

### Task 1: I18n Dictionaries & Localization Editor Domain Helpers

**Goal:** Establish dictionary keys in AR, TR, EN and create pure helper functions for location value-awareness, field localization state derivation, and manual path tracking.

**Files:**
- `src/i18n/locales/ar.ts`
- `src/i18n/locales/tr.ts`
- `src/i18n/locales/en.ts`
- `src/domain/cmsLocalizationEditor.ts`
- `tests/cmsMultilingualEditor7c2a.test.mjs`

**Interfaces:**
```typescript
// src/domain/cmsLocalizationEditor.ts
export function isTranslatableLocationValue(value: unknown): boolean;

export interface FieldLocalizationState {
  status: LocalizationStatus;
  isStale: boolean;
  isManual: boolean;
  value: string;
}

export function deriveFieldLocalizationState(
  path: string,
  record: CmsLocalizationRecord | null | undefined,
): FieldLocalizationState;

export function recordManualPath(
  currentManualPaths: readonly string[] | undefined,
  editedPath: string,
): string[];
```

- [ ] **Step 1.1: Write failing tests for dictionary keys and domain helpers**
  Create `tests/cmsMultilingualEditor7c2a.test.mjs` with tests covering:
  - `isTranslatableLocationValue` returns `true` for `"قاعة المؤتمرات"`, `"Main Hall"`, `"Atatürk Kültür Merkezi"`.
  - `isTranslatableLocationValue` returns `false` for `"https://maps.google.com/?q=..."`, `"http://example.com"`, `"geo:41.0082,28.9784"`, `"-41.2, 28.9"`, `""`, whitespace, and non-strings.
  - `recordManualPath` adds new path, normalizes dot-syntax, deduplicates, and preserves existing manual paths.
  - `deriveFieldLocalizationState` accurately derives `isStale`, `isManual`, `status`, and field value.
  - `ar.ts`, `tr.ts`, and `en.ts` contain required `cmsLocalization` keys (`status.fresh`, `status.stale`, `status.draft`, `status.missing`, `translations`, `canonicalSource`, `saveDraft`, `saving`, `publishChanges`, `needsUpdateNotice`, `unsavedChangesWarning`).

- [ ] **Step 1.2: Run test to observe failure (RED)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`
  Verify tests fail because `src/domain/cmsLocalizationEditor.ts` does not yet exist.

- [ ] **Step 1.3: Update i18n locale files**
  Add `cmsLocalization` namespace to:
  - `src/i18n/locales/ar.ts`:
    ```typescript
    cmsLocalization: {
      status: {
        fresh: 'طازجة ✓',
        stale: 'بحاجة لتحديث ⚠',
        draft: 'مسودة ✎',
        missing: 'غير مترجمة ✕',
      },
      translations: 'الترجمات',
      canonicalSource: 'العربية — المصدر الأساسي',
      saveDraft: 'حفظ كمسودة',
      saving: 'جارٍ الحفظ...',
      publishChanges: 'نشر التغييرات',
      needsUpdateNotice: 'تم تعديل النص العربي الأصلي، يرجى مراجعة وتحديث الترجمة.',
      unsavedChangesWarning: 'لديك تعديلات غير محفوظة في هذا النموذج. هل أنت متأكد من الإغلاق وفقدان التغييرات؟',
      continueEditing: 'متابعة التعديل',
      discardChanges: 'إغلاق وتجاهل التعديلات',
      manualEditBadge: 'تعديل يدوي محفوظ',
      saveFailed: 'فشل حفظ الترجمة، النص العربي محفوظ بأمان.',
    }
    ```
  - `src/i18n/locales/tr.ts`: Localized Turkish equivalents (`Güncel ✓`, `Güncelleme Gerekli ⚠`, `Taslak ✎`, `Çevrilmedi ✕`, `Çeviriler`, etc.).
  - `src/i18n/locales/en.ts`: Localized English equivalents (`Up to date ✓`, `Needs Update ⚠`, `Draft ✎`, `Missing ✕`, `Translations`, etc.).

- [ ] **Step 1.4: Implement `src/domain/cmsLocalizationEditor.ts`**
  Implement `isTranslatableLocationValue`, `deriveFieldLocalizationState`, and `recordManualPath` using pure functions and existing domain helpers (`normalizeLocalizationPaths`, `isLocalizationPathStale`, `isLocalizationPathManual`).

- [ ] **Step 1.5: Run test to verify success (GREEN)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`
  Verify all Task 1 tests pass.

- [ ] **Step 1.6: Commit Task 1**
  Stage and commit Task 1 files:
  `git add src/domain/cmsLocalizationEditor.ts src/i18n/locales/ tests/cmsMultilingualEditor7c2a.test.mjs`
  `git commit -m "feat(i18n): add localization editor domain helpers and translations"`

---

### Task 2: `TranslationStatusBadge` and `LocalizedFieldEditor` Components

**Goal:** Create presentation components for localized status badges and content-directional inputs (`dir="rtl"` for Arabic, `dir="ltr"` for Turkish/English).

**Files:**
- `src/components/cmsLocalization/TranslationStatusBadge.tsx`
- `src/components/cmsLocalization/LocalizedFieldEditor.tsx`
- `tests/cmsMultilingualEditor7c2a.test.mjs`

**Interfaces:**
```typescript
// TranslationStatusBadge.tsx
export interface TranslationStatusBadgeProps {
  status: LocalizationStatus;
  size?: 'sm' | 'md';
  className?: string;
}

// LocalizedFieldEditor.tsx
export interface LocalizedFieldEditorProps {
  target: CmsTarget | string;
  locale: LocalizedCmsLocale | CanonicalCmsLocale;
  path: string;
  label: string;
  value: string;
  kind?: CmsFieldKind;
  isStale?: boolean;
  isManual?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onChange: (newValue: string) => void;
}
```

- [ ] **Step 2.1: Write failing tests for components**
  Add tests to `tests/cmsMultilingualEditor7c2a.test.mjs` asserting:
  - `TranslationStatusBadge` renders emerald for `fresh`, amber for `stale`, sky for `draft`, and slate for `missing`.
  - `TranslationStatusBadge` displays localized label from `t('cmsLocalization.status.*')`.
  - `LocalizedFieldEditor` with `locale="ar"` renders with `dir="rtl"` and Arabic font styles.
  - `LocalizedFieldEditor` with `locale="tr"` and `locale="en"` renders with `dir="ltr"`.
  - `LocalizedFieldEditor` with `isStale={true}` adds amber warning border and shows `needsUpdateNotice`.
  - `LocalizedFieldEditor` with `isManual={true}` displays manual edit indicator.
  - `LocalizedFieldEditor` renders `<textarea>` when `kind="description"` or `kind="richText"`, and `<input type="text">` otherwise.

- [ ] **Step 2.2: Run test to observe failure (RED)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`

- [ ] **Step 2.3: Implement `TranslationStatusBadge.tsx`**
  Build component using `react-i18next`'s `useTranslation`:
  ```tsx
  export function TranslationStatusBadge({ status, size = 'sm', className = '' }: TranslationStatusBadgeProps) {
    const { t } = useTranslation();
    const styleMap = {
      fresh: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      stale: 'bg-amber-100 text-amber-800 border-amber-300',
      draft: 'bg-sky-100 text-sky-800 border-sky-300',
      missing: 'bg-gray-100 text-gray-700 border-gray-300',
    };
    const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
    return (
      <span className={`inline-flex items-center rounded-full border font-medium ${styleMap[status]} ${sizeClasses} ${className}`}>
        {t(`cmsLocalization.status.${status}`)}
      </span>
    );
  }
  ```

- [ ] **Step 2.4: Implement `LocalizedFieldEditor.tsx`**
  Build component:
  - Enforce `dir={locale === 'ar' ? 'rtl' : 'ltr'}` on input/textarea.
  - Apply amber highlight styling if `isStale` is true.
  - Render manual badge if `isManual` is true.
  - Connect `onChange` to notify parent of field edits.

- [ ] **Step 2.5: Run test to verify success (GREEN)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`

- [ ] **Step 2.6: Commit Task 2**
  Stage and commit Task 2 files:
  `git add src/components/cmsLocalization/TranslationStatusBadge.tsx src/components/cmsLocalization/LocalizedFieldEditor.tsx tests/cmsMultilingualEditor7c2a.test.mjs`
  `git commit -m "feat(i18n): implement TranslationStatusBadge and LocalizedFieldEditor"`

---

### Task 3: `CmsLocalizationContext` and `CmsTranslationSection` Component

**Goal:** Create the repository context injection and the collapsible translation accordion component managing TR and EN draft and publish actions.

**Files:**
- `src/context/CmsLocalizationContext.tsx`
- `src/components/cmsLocalization/CmsTranslationSection.tsx`
- `tests/cmsMultilingualEditor7c2a.test.mjs`

**Interfaces:**
```typescript
// CmsLocalizationContext.tsx
export interface CmsLocalizationContextValue {
  repository: CmsLocalizationRepository;
}
export function CmsLocalizationProvider({ repository, children }: { repository?: CmsLocalizationRepository; children: ReactNode }): JSX.Element;
export function useCmsLocalizationRepository(): CmsLocalizationRepository;

// CmsTranslationSection.tsx
export interface CmsTranslationSectionProps {
  target: CmsTarget | string;
  path: string;
  label: string;
  kind?: CmsFieldKind;
  canonicalValue: string;
  canEdit: boolean;
  onDraftSaved?: (locale: LocalizedCmsLocale) => void;
  onPublished?: (locale: LocalizedCmsLocale) => void;
}
```

- [ ] **Step 3.1: Write failing tests for context and section component**
  Add tests asserting:
  - `CmsLocalizationProvider` injects `InMemoryCmsLocalizationRepository` by default.
  - `CmsTranslationSection` initially renders in collapsed state displaying compact status badges for `TR` and `EN`.
  - Clicking accordion header expands section, revealing editable fields for Turkish and English.
  - Turkish field renders `dir="ltr"`, English field renders `dir="ltr"`.
  - Modifying Turkish field and clicking "حفظ كمسودة" writes strictly to `repository.saveDraft(...)`, leaving published record untouched.
  - Modifying Turkish field records `path` in `manualPaths`.
  - If repository write fails, error message is rendered without throwing unhandled exceptions.
  - No records with `locale === 'ar'` are ever passed to `repository.saveDraft` or `repository.savePublished`.

- [ ] **Step 3.2: Run test to observe failure (RED)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`

- [ ] **Step 3.3: Implement `src/context/CmsLocalizationContext.tsx`**
  Implement provider and `useCmsLocalizationRepository` hook. Default instance initializes `new InMemoryCmsLocalizationRepository()`.

- [ ] **Step 3.4: Implement `src/components/cmsLocalization/CmsTranslationSection.tsx`**
  Implement accordion layout:
  - Header: `"الترجمات (Translations)"` + compact status summary (`TR [badge]`, `EN [badge]`).
  - Body (collapsible):
    - Turkish subcard: `TranslationStatusBadge`, `LocalizedFieldEditor` (LTR), `Save Draft` button.
    - English subcard: `TranslationStatusBadge`, `LocalizedFieldEditor` (LTR), `Save Draft` button.
  - Load existing drafts and published records asynchronously on mount via `repository.getDraft` and `repository.getPublished`.
  - Track `manualPaths` updates when user types into TR or EN inputs.

- [ ] **Step 3.5: Run test to verify success (GREEN)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`

- [ ] **Step 3.6: Commit Task 3**
  Stage and commit Task 3 files:
  `git add src/context/CmsLocalizationContext.tsx src/components/cmsLocalization/CmsTranslationSection.tsx tests/cmsMultilingualEditor7c2a.test.mjs`
  `git commit -m "feat(i18n): implement CmsLocalizationContext and CmsTranslationSection"`

---

### Task 4: `InlineEditOverlay.tsx` Integration for Homepage & About

**Goal:** Integrate `CmsTranslationSection` into `EditableField` and `EditableCard` so that allowlisted CMS paths display inline translation editing in the exact same modal dialog.

**Files:**
- `src/components/InlineEditOverlay.tsx`
- `src/App.tsx`
- `tests/cmsMultilingualEditor7c2a.test.mjs`

- [ ] **Step 4.1: Write failing tests for `InlineEditOverlay` integration**
  Add tests asserting:
  - Opening `EditableField` for allowlisted path (`site` / `hero.title`) renders canonical Arabic field at top with label `"العربية — المصدر الأساسي"` and `dir="rtl"`.
  - The modal embeds `CmsTranslationSection` beneath the Arabic field.
  - Non-allowlisted paths (e.g., random path or image URL) do NOT render `CmsTranslationSection`.
  - Saving canonical Arabic field still calls `updateSiteField` or `updateAboutField` as before (zero regressions on canonical editing).
  - If TR/EN translation save fails, canonical Arabic edit is NOT lost or rolled back.
  - Public pencil buttons remain visually identical on the homepage.
  - Multi-field `EditableCard` renders translation sections only for its translatable text fields.

- [ ] **Step 4.2: Run test to observe failure (RED)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`

- [ ] **Step 4.3: Wrap `App.tsx` with `CmsLocalizationProvider`**
  In `src/App.tsx`, wrap the tree with `<CmsLocalizationProvider>` so `useCmsLocalizationRepository()` is available to all inline modals.

- [ ] **Step 4.4: Update `EditableField` in `src/components/InlineEditOverlay.tsx`**
  - Check `const isTranslatable = isCmsPathTranslatable(config.target, config.path);`
  - In the modal body:
    - Render canonical Arabic field clearly labeled with `dir="rtl"`.
    - If `isTranslatable`, render `<CmsTranslationSection target={config.target} path={config.path} label={config.label} kind={config.type === 'textarea' ? 'description' : 'title'} canonicalValue={draft} canEdit={canEdit} />`.
  - Preserve all existing save, validation, and file-upload logic intact.

- [ ] **Step 4.5: Update `EditableCard` in `src/components/InlineEditOverlay.tsx`**
  For each field in `config.fields`:
  - If `isCmsPathTranslatable(config.target, field.path)`, render `CmsTranslationSection` for that field beneath its canonical input.

- [ ] **Step 4.6: Run test to verify success (GREEN)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`

- [ ] **Step 4.7: Commit Task 4**
  Stage and commit Task 4 files:
  `git add src/components/InlineEditOverlay.tsx src/App.tsx tests/cmsMultilingualEditor7c2a.test.mjs`
  `git commit -m "feat(i18n): integrate same-place translation editing into InlineEditOverlay"`

---

### Task 5: Event Category Fixed-Presentation Bugfix

**Goal:** Correct the raw Arabic category display bug in the Admin Events table and modal dropdown, ensuring options and badges render localized labels via `getEventCategoryLabel` while preserving canonical `EventCategory` tokens.

**Files:**
- `src/pages/AdminDashboard.tsx`
- `tests/cmsMultilingualEditor7c2a.test.mjs`

- [ ] **Step 5.1: Write failing tests for Event category presentation**
  Add tests asserting:
  - In `src/pages/AdminDashboard.tsx`, the event category select options render:
    `<option key={c} value={c}>{getEventCategoryLabel(c, t)}</option>`
  - In the event table row, the category badge renders:
    `{getEventCategoryLabel(e.category, t)}`
  - Canonical values submitted by the form remain canonical keys (`workshop`, `lecture`, etc.).
  - `activityType` select retains canonical values (`MANDATORY`, `OPTIONAL`, `PAID`) with localized `t(...)` labels.
  - Event category is NOT translatable via CMS localization schema.

- [ ] **Step 5.2: Run test to observe failure (RED)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`
  Confirm that lines 1938 and 1978 in `AdminDashboard.tsx` fail the test because they still use `categoryLabels[e.category]` and `categoryLabels[c]`.

- [ ] **Step 5.3: Update `AdminDashboard.tsx`**
  In `src/pages/AdminDashboard.tsx`:
  - Line 1938: Change `categoryLabels[e.category]` to `getEventCategoryLabel(e.category, t)`.
  - Line 1978: Change `categoryLabels[c]` to `getEventCategoryLabel(c, t)`.
  - Check for any other raw `categoryLabels` presentation leak in the Events tab.

- [ ] **Step 5.4: Run test to verify success (GREEN)**
  Run: `node --test tests/cmsMultilingualEditor7c2a.test.mjs`
  Verify tests pass.

- [ ] **Step 5.5: Commit Task 5**
  Stage and commit Task 5 files:
  `git add src/pages/AdminDashboard.tsx tests/cmsMultilingualEditor7c2a.test.mjs`
  `git commit -m "fix(i18n): localize Event category display labels in Admin table and modal"`

---

### Task 6: Global Quality Verification & Static Auditing

**Goal:** Verify all 26 mandatory scenarios, run static typechecking, linting, build, and git check to guarantee zero regressions.

**Files:**
- Entire repository

- [ ] **Step 6.1: Run all automated tests**
  Run: `npm test`
  Confirm all tests pass without errors across the entire test suite.

- [ ] **Step 6.2: Run TypeScript typecheck**
  Run: `npm run typecheck`
  Confirm zero TypeScript errors.

- [ ] **Step 6.3: Run ESLint**
  Run: `npm run lint`
  Confirm zero lint errors.

- [ ] **Step 6.4: Run Production Build**
  Run: `npm run build`
  Confirm clean Vite build bundle with no missing imports or syntax errors.

- [ ] **Step 6.5: Verify Git Status and Diff**
  Run: `git diff --check`
  Run: `git status`
  Confirm clean working tree with only expected commits.

- [ ] **Step 6.6: Commit Task 6 verification artifacts if applicable**
  Stage and commit any test or documentation adjustments:
  `git commit -m "chore(i18n): verify 7C2A test coverage, types, and build integrity"`

---

## 26 Mandatory Test Scenarios Matrix

| Test ID | Test Name | Assertion | Target Component / File |
| :--- | :--- | :--- | :--- |
| **T01** | `test_badge_renders_missing_state` | Renders `t('cmsLocalization.status.missing')` with slate pill | `TranslationStatusBadge.tsx` |
| **T02** | `test_badge_renders_draft_state` | Renders `t('cmsLocalization.status.draft')` with sky pill | `TranslationStatusBadge.tsx` |
| **T03** | `test_badge_renders_fresh_state` | Renders `t('cmsLocalization.status.fresh')` with emerald pill | `TranslationStatusBadge.tsx` |
| **T04** | `test_badge_renders_stale_state` | Renders `t('cmsLocalization.status.stale')` with amber pill | `TranslationStatusBadge.tsx` |
| **T05** | `test_arabic_content_field_uses_rtl` | Field with `locale="ar"` strictly has `dir="rtl"` | `LocalizedFieldEditor.tsx` |
| **T06** | `test_turkish_content_field_uses_ltr` | Field with `locale="tr"` strictly has `dir="ltr"` | `LocalizedFieldEditor.tsx` |
| **T07** | `test_english_content_field_uses_ltr` | Field with `locale="en"` strictly has `dir="ltr"` | `LocalizedFieldEditor.tsx` |
| **T08** | `test_collapsed_section_shows_tr_en_status` | Collapsed header renders TR and EN status badges | `CmsTranslationSection.tsx` |
| **T09** | `test_expanded_section_exposes_tr_editor` | Clicking accordion toggles expanded view with TR input | `CmsTranslationSection.tsx` |
| **T10** | `test_expanded_section_exposes_en_editor` | Expanded view contains EN input | `CmsTranslationSection.tsx` |
| **T11** | `test_manual_edit_records_path_in_manual_paths` | Typing in TR input appends path to `record.manualPaths` | `CmsTranslationSection.tsx` |
| **T12** | `test_unknown_path_has_no_translation_editor` | Non-allowlisted path omits `CmsTranslationSection` | `InlineEditOverlay.tsx` |
| **T13** | `test_url_shaped_value_has_no_translation_editor` | URL in `location` evaluates `false` in `isTranslatableLocationValue` | `cmsLocalizationEditor.ts` |
| **T14** | `test_identity_field_has_no_translation_editor` | Person name or username never receives translation UI | `InlineEditOverlay.tsx` |
| **T15** | `test_homepage_hero_receives_translation_ui` | `hero.title` renders Arabic input + translation section | `InlineEditOverlay.tsx` |
| **T16** | `test_canonical_arabic_save_still_works` | `updateSiteField` called successfully on canonical save | `InlineEditOverlay.tsx` |
| **T17** | `test_translation_save_failure_does_not_discard_canonical` | TR draft error leaves canonical save intact | `InlineEditOverlay.tsx` |
| **T18** | `test_no_arabic_record_in_localization_repository` | Repository rejects `ar` writes with `INVALID_LOCALE` | `cmsLocalizationRepository.ts` |
| **T19** | `test_event_select_displays_localized_labels` | Category dropdown renders `getEventCategoryLabel(c, t)` | `AdminDashboard.tsx` |
| **T20** | `test_event_select_values_remain_canonical` | Dropdown option `value` attributes match canonical keys | `AdminDashboard.tsx` |
| **T21** | `test_event_table_badge_localized` | Table row category badge uses `getEventCategoryLabel` | `AdminDashboard.tsx` |
| **T22** | `test_event_category_never_enters_cms_translation` | `events.category` omitted from `CMS_TRANSLATABLE_SCHEMA` | `cmsTranslatableFields.ts` |
| **T23** | `test_activity_type_values_remain_canonical` | Activity type options retain `MANDATORY`, `OPTIONAL`, `PAID` | `AdminDashboard.tsx` |
| **T24** | `test_home_pencil_behavior_remains_functional` | Public pencil buttons render and open modal on click | `InlineEditOverlay.tsx` |
| **T25** | `test_existing_admin_permissions_unchanged` | `canEdit` false prevents editing and omits edit pencil | `InlineEditOverlay.tsx` |
| **T26** | `test_no_supabase_imports_in_new_localization_ui` | New UI files contain zero imports from `@supabase` | Static import audit |
