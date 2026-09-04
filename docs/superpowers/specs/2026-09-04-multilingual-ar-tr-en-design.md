# Multilingual Design Specification: Arabic, Turkish, and English (AR / TR / EN)

- **Document ID**: `2026-09-04-multilingual-ar-tr-en-design`
- **Branch**: `feature-multilingual-ar-tr-en`
- **Supported Locales**: Arabic (`ar` - Canonical / Default), Turkish (`tr`), English (`en`)
- **Status**: Approved Design Specification

---

## 1. Goals

1. Transform the Ummet Gencleri Web platform into a full-fidelity multilingual application supporting **Arabic (AR)**, **Turkish (TR)**, and **English (EN)** across all public pages, authentication pages, student dashboard, admin management panels, and CMS-editable sections.
2. Maintain **one canonical website URL** without language path prefixes (`/ar`, `/tr`, `/en`). Language resolution is dynamic, client-side, and preserved without URL disruption.
3. Establish **Arabic as the canonical editorial source of truth** for all official organization content. Translation flows unidirectionally from Arabic to Turkish and English (`AR -> TR`, `AR -> EN`), followed by mandatory human review and explicit publication.
4. Support **bidirectional presentation**: Arabic renders in `dir="rtl"` with the Cairo/Tajawal typography, while Turkish and English render in `dir="ltr"` using a modern, lightweight Latin font stack with logical layout mirroring.
5. Provide a robust **dual-layer architecture**:
   - **Static UI Text**: Client-side dictionary-based internationalization (`i18next` / `react-i18next`) with zero runtime translator API calls.
   - **Dynamic CMS Content**: Parallel localized database storage (`cms_localizations`), automatic machine translation assistance (via server-side Azure Translator integration behind an extensible provider abstraction), stale translation tracking, manual override preservation, and draft support.
6. Seamlessly integrate with the **existing site edit approval workflow** (`edit_requests`), allowing editors (e.g., Media Head) to submit multilingual content bundles and the President to review and approve all language variants atomically.
7. Preserve all existing application architectures, authentication, real-time identity guards, executive assignment transfers, soft removal, and the bounded role revocation feature without regressions.

---

## 2. Non-Goals

1. **No URL language prefixes**: The application will NOT use route-based prefixes like `/ar/about`, `/tr/about`, or `/en/about`.
2. **No React Router migration**: The application's state-based view navigation (`useApp().view`) in `src/App.tsx` remains intact.
3. **Never translate identity data**: Personal names, login emails, contact emails, phone numbers, user UUIDs, account IDs, raw dates, external URLs, social media handles, technical role keys (e.g., `PRESIDENT`), and status keys (e.g., `active`, `banned`) are never machine-translated.
4. **Never translate user-generated content**: Student suggestions, complaints, responses, and contact message bodies remain in their original submission language.
5. **No direct client-side translation API calls**: Frontend code will never store Azure keys or make direct outbound calls to machine translation APIs.
6. **No auto-publishing upon translation**: Generating a translation is purely an authoring assistance action that populates editor fields; publication remains a separate, explicit user action.
7. **No remote Supabase execution during implementation**: In accordance with project safety constraints regarding remote migration drift, no remote DDL/DML, `db push`, or remote edge function deployments will occur during this development phase.

---

## 3. Current Architecture Findings

Inspection of the codebase revealed several key architectural realities that directly shape this design:

1. **Navigation Architecture (`src/App.tsx`)**:
   Navigation is completely view-state driven (`view.kind`), not URL-pathname driven. The single canonical URL model perfectly matches this existing architecture.
2. **CMS Storage & Versioning (`published_site_content`, `student_guide`, `faq`)**:
   - General site bundles (`siteContent`, `aboutContent`, `programsContent`, `events`, `news`, `galleryAlbums`, `galleryCategories`, `contactCards`, `contactMap`, `plans`, `reports`, `committees`) reside in `public.published_site_content` under `id = 'main'` as JSONB fields, versioned with an integer `version`.
   - `student_guide` has dedicated columns `quick_info` and `sections` with its own `version`.
   - `faq` has `categories` with its own `version`.
   - Publication is atomic and serialized via `private.publish_cms_target_locked` using optimistic locking (`expected_version`).
3. **Approval Flow (`public.edit_requests`)**:
   Editors submit structured requests with `site_target`, `site_payload`, `site_base_version`. The President approves via `public.approve_site_edit_request(request_id, approved_payload)`. A multilingual bundle must travel within `site_payload` to be reviewed and approved atomically.
4. **Directional Styling**:
   Current styling relies heavily on physical direction classes (`text-right`, `text-left`, `pr-*`, `pl-*`, `mr-*`, `ml-*`, `right-*`, `left-*`). These must be audited and systematically adapted to logical Tailwind classes (`text-start`, `text-end`, `ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`) or RTL/LTR conditional variants (`rtl:` / `ltr:`).
5. **Edge Functions (`supabase/functions/`)**:
   The project has established Deno Edge Functions (`send-contact-reply`, `send-web-push`, etc.) that authenticate callers using Supabase Auth JWTs (`userClient.auth.getUser()`) and verify executive roles against `public.executive_assignments`. The translation endpoint will follow this exact pattern.

---

## 4. Locale Architecture

### 4.1 Supported Locales
- `ar`: Arabic (Primary, canonical source of truth, Default Fallback)
- `tr`: Turkish (Primary localization)
- `en`: English (International localization)

### 4.2 Locale Resolution Priority
When an unauthenticated or authenticated user accesses the site, the active locale is resolved in this strict sequence:
1. **Manually Saved User Preference**: `localStorage.getItem('preferredLocale')` if valid (`'ar' | 'tr' | 'en'`).
2. **Browser Preferred Language**: Iterates over `navigator.languages` (or checks `navigator.language`):
   - Matches `'ar'` or any `ar-*` tag -> `'ar'`
   - Matches `'tr'` or any `tr-*` tag -> `'tr'`
   - Matches `'en'` or any `en-*` tag -> `'en'`
3. **Default Fallback**: `'ar'` (Arabic).

Corrupted, invalid, or unrecognized strings in `localStorage` are discarded and safely fallback to `'ar'`.

### 4.3 Zero-FOWL (Flash of Wrong Language) Bootstrap
To eliminate flashing Arabic layout before rendering Turkish or English:
An inline synchronous bootstrap script in `index.html` runs before any React script evaluates:
```javascript
(function() {
  try {
    var stored = localStorage.getItem('preferredLocale');
    var supported = ['ar', 'tr', 'en'];
    var locale = supported.indexOf(stored) !== -1 ? stored : null;
    if (!locale && navigator.languages) {
      for (var i = 0; i < navigator.languages.length; i++) {
        var lang = navigator.languages[i].toLowerCase().split('-')[0];
        if (supported.indexOf(lang) !== -1) { locale = lang; break; }
      }
    }
    if (!locale) { locale = 'ar'; }
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  } catch (e) {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }
})();
```

---

## 5. Static UI i18n Architecture

### 5.1 Library
- `i18next` and `react-i18next`.
- Light weight, high performance, industry standard with zero bundle bloat.

### 5.2 Directory Structure
```text
src/
  i18n/
    index.ts             # i18next initialization, locale switching helpers
    types.ts             # TypeScript definitions for translation schema
    locales/
      ar.ts              # Canonical Arabic static UI dictionary
      tr.ts              # Turkish static UI dictionary
      en.ts              # English static UI dictionary
```

### 5.3 Static UI Namespaces / Domain Segments
Dictionaries are structured hierarchically:
- `common`: Generic actions (`save`, `cancel`, `delete`, `edit`, `back`, `loading`, `confirm`, `retry`, `close`, `search`, `actions`, `status`, `success`, `warning`, `error`).
- `nav`: Main navigation items (`home`, `about`, `programs`, `gallery`, `news`, `guide`, `faq`, `contact`, `board`, `studentPortal`, `adminDashboard`, `login`, `logout`).
- `footer`: Footer links, descriptions, newsletter text, copyright.
- `home`: Homepage static UI labels (e.g., "View All Events", "Latest News", "Our Goals").
- `about`: About page static section headers, badges.
- `programs`: Programs listing labels, filters, registration CTA.
- `events`: Event card labels, capacity badge, registration status, date labels.
- `news`: Article metadata, categories, share CTA.
- `gallery`: Media album filters, photo/video badges.
- `guide`: Student guide search, categories, quick info title.
- `faq`: FAQ accordion labels, categories.
- `contact`: Contact form labels, placeholders, submission messages.
- `board`: Executive board overview labels, committee designations.
- `auth`: Login, register, password reset, update password form labels, validations, and error toasts.
- `studentDashboard`: Student portal navigation, tabs, event registrations, activity feed, profile management.
- `adminDashboard`: Admin dashboard tabs, statistics headers, action buttons, table columns, modals.
- `roles`: Institutional role titles (`PRESIDENT`, `VICE_PRESIDENT`, `MEDIA_HEAD`, `FINANCE_HEAD`, `AUDIT_HEAD`, `ACADEMIC_HEAD`, `ACTIVITIES_HEAD`, `STUDENT`).
- `errors`: System, network, and validation error messages.

### 5.4 Parity Enforcement
An automated unit test (`tests/staticTranslationParity.test.mjs`) will assert that every key present in `ar.ts` exists identically in `tr.ts` and `en.ts`, failing the build if any key is missing.

---

## 6. Dynamic CMS Localization Architecture

### 6.1 Principles
1. **Arabic is Canonical**: The primary content is created and stored in Arabic in the existing tables (`published_site_content`, `student_guide`, `faq`).
2. **Parallel Localization Layer**: Localizations for `tr` and `en` are stored in a dedicated table `cms_localizations`.
3. **Translatable-Only Payloads**: Localized records store only translatable fields. Structural data (dates, IDs, capacities, image URLs, URLs) are omitted from translation storage and inherited from the Arabic canonical record.

### 6.2 Data Model: `public.cms_localizations`
```sql
CREATE TABLE IF NOT EXISTS public.cms_localizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL,                      -- e.g. 'site', 'about', 'events', 'programsContent'
  locale text NOT NULL CHECK (locale IN ('tr', 'en')),
  payload jsonb NOT NULL,                    -- localized text fields
  source_hash text NOT NULL,                 -- SHA-256 hash of Arabic translatable source
  source_version bigint NOT NULL DEFAULT 1,  -- version of Arabic content at translation time
  status text NOT NULL DEFAULT 'published'   -- 'published' | 'stale' | 'draft' | 'missing'
    CHECK (status IN ('published', 'stale', 'draft', 'missing')),
  stale_paths text[] NOT NULL DEFAULT '{}',  -- list of specific field paths that need update
  manual_paths text[] NOT NULL DEFAULT '{}', -- list of field paths manually edited by humans
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_localizations_target_locale_key UNIQUE (target, locale)
);
```

### 6.3 Localized Content Merging Logic
When the frontend requests content for a given `target` and active `locale`:
1. If `locale === 'ar'`: Return canonical Arabic content directly.
2. If `locale === 'tr' | 'en'`:
   - Retrieve canonical Arabic content `A`.
   - Retrieve localized entry `L` from `cms_localizations` for `(target, locale)`.
   - If `L` is missing or `L.status === 'missing'`:
     - Return Arabic content `A` accompanied by metadata `{ isFallback: true, fallbackLocale: 'ar', status: 'missing' }`.
   - If `L` is present:
     - Deep-merge `L.payload` over `A` for translatable fields only.
     - Non-translatable fields (images, capacities, dates, IDs) remain sourced from `A`.
     - Return merged content with `{ isFallback: false, status: L.status, isStale: L.status === 'stale' }`.

---

## 7. Translation Provider Abstraction

### 7.1 Domain Contract
To decouple the system from any single third-party provider, all translation calls conform to a strict interface:
```typescript
export interface TranslationRequest {
  texts: string[];
  sourceLang: 'ar';
  targetLang: 'tr' | 'en';
  context?: string; // Optional domain hint e.g. 'institutional-youth-union'
}

export interface TranslationResult {
  translatedTexts: string[];
  characterCount: number;
  provider: string;
}

export interface TranslationProvider {
  name: string;
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
```

### 7.2 Implementations
1. **`AzureTranslatorProvider`** (Production Default): Connects to Microsoft Azure Translator Cognitive Services REST API.
2. **`MockTranslationProvider`** (Testing & Local Development): Deterministic mock provider that translates simulated Arabic strings into predictable Turkish and English strings without network calls.
3. **Future Extension**: Can swap in Google Cloud Translation or LibreTranslate without altering any domain or UI code.

---

## 8. Server-Side Azure Integration Boundary

### 8.1 Supabase Edge Function: `translate-content`
- **Location**: `supabase/functions/translate-content/index.ts`
- **Security**:
  - Validates `Authorization: Bearer <token>` against Supabase Auth.
  - Queries `public.executive_assignments` to verify caller holds an authorized executive role (`PRESIDENT`, `VICE_PRESIDENT`, `MEDIA_HEAD`, `ACADEMIC_HEAD`, `ACTIVITIES_HEAD`).
  - Rejects unauthorized or anonymous callers with `403 Forbidden`.
- **Azure Call**:
  - Reads `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION` from server environment variables.
  - POSTs to `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=ar&to=tr&to=en`.
  - Applies institutional glossary terms via pre/post-processing or Azure dynamic dictionary markup `<mstrans:dictionary translation="...">`.
- **Response**: Returns clean JSON `{ translations: { tr: string[], en: string[] }, characterCount: number }`.

---

## 9. CMS Editor UX & Multilingual Authoring

### 9.1 Three-Column / Tabbed Editor Layout
In administrative editing panels (inline modal or admin dashboard):
1. **Arabic (Source of Truth)**:
   - Always visible, canonical input fields.
2. **[Auto-Translate / ترجمة تلقائية] Action**:
   - Triggers server-side translation request.
   - Shows spinner: "جارٍ الترجمة عبر Azure...".
   - Automatically populates Turkish and English fields.
   - Does NOT publish.
3. **Turkish & English Review Fields**:
   - Editors can read, inspect, and refine the generated text.
   - Manual edits are visually tagged ("تعديل يدوي").
4. **Action Buttons**:
   - **Cancel / إلغاء**: Discards uncommitted form state.
   - **Save Draft / حفظ مسودة**: Saves current state as draft without updating live site.
   - **Publish / نشر المحتوى**: Submits the coherent bundle for live deployment or president approval.

---

## 10. Stale and Manual Translation Rules

### 10.1 Source Hashing
For any translatable payload, a deterministic SHA-256 hash is computed over the normalized Arabic text:
`source_hash = sha256(normalize(arabicTranslatableFields))`

### 10.2 State Transitions
1. **Fresh (`published`)**:
   `source_hash(current_ar) === L.source_hash`. Translation is up to date.
2. **Stale (`stale`)**:
   `source_hash(current_ar) !== L.source_hash`.
   - The Arabic text was edited and saved.
   - Existing Turkish and English text is **preserved** (never deleted).
   - `L.status` is set to `'stale'`.
   - The UI displays an amber indicator: "تم تعديل النص العربي؛ الترجمة الحالية قديمة".
3. **Manual Overrides (`manual_paths`)**:
   - If an editor types directly into a Turkish or English field, that field's path (e.g., `'hero.title'`) is added to `manual_paths`.
   - When "Auto-Translate" is clicked again, fields in `manual_paths` are protected by default with a prompt: "هل تريد استبدال التعديلات اليدوية أم الاحتفاظ بها؟".

---

## 11. Drafts & Failure Resilience

1. If the Azure translation service fails (e.g., network outage, API quota exceeded):
   - The editor's Arabic content is **never lost**.
   - An alert appears: "تعذر الاتصال بخدمة الترجمة. تم حفظ التعديلات كمسودة".
   - A "Retry Translation / إعادة المحاولة" button allows retrying without retyping.
2. Drafts are stored with `status = 'draft'` and are visible only to editors in the CMS panels.

---

## 12. Emergency Arabic-Only Publication

### 12.1 Justification & Constraint
Under rare, urgent circumstances (e.g., urgent announcement, system outage of translation API), the organization may need to publish content immediately without waiting for translation.

### 12.2 Security & Flow
- **Authority**: Current **PRESIDENT** only.
- **Confirmation**: An explicit modal warning:
  `"تحذير: سيتم نشر هذا المحتوى باللغة العربية فقط مؤقتاً وسيعرض للمستخدمين الأتراك والناطقين بالإنجليزية بالعربية مع إشعار توضيحي. هل تريد المتابعة؟"`
- **Storage**: `cms_localizations` marks `locale = 'tr'` and `locale = 'en'` as `status = 'missing'`.
- **Public Presentation**:
  - Turkish visitors see Arabic content with a banner:
    `"Bu içerik geçici olarak yalnızca Arapça sunulmaktadır."`
  - English visitors see Arabic content with a banner:
    `"This content is temporarily available in Arabic only."`

---

## 13. Approval Workflow Integration (`edit_requests`)

When an editor (such as the Media Head) submits a site edit:
1. The submission bundle in `edit_requests.site_payload` includes:
   ```json
   {
     "canonical": { /* Arabic updated payload */ },
     "localizations": {
       "tr": { "payload": { /* Turkish payload */ }, "status": "published" },
       "en": { "payload": { /* English payload */ }, "status": "published" }
     },
     "source_hash": "a1b2c3d4..."
   }
   ```
2. In `SiteEditsPanel.tsx`, the President sees a multi-tab diff:
   - **العربية (الأصل)**
   - **Türkçe**
   - **English**
3. When the President approves, the transaction executes `private.publish_cms_target_locked` for the canonical Arabic content AND updates `public.cms_localizations` for `tr` and `en` in the same database transaction.
4. This ensures that Arabic version $N$, Turkish version $N$, and English version $N$ are deployed atomically.

---

## 14. Data / Storage Schema & Privileges

```sql
-- Migration: 20260905000000_multilingual_cms_localizations.sql

CREATE TABLE IF NOT EXISTS public.cms_localizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('tr', 'en')),
  payload jsonb NOT NULL,
  source_hash text NOT NULL,
  source_version bigint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'stale', 'draft', 'missing')),
  stale_paths text[] NOT NULL DEFAULT '{}',
  manual_paths text[] NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_localizations_target_locale_key UNIQUE (target, locale)
);

ALTER TABLE public.cms_localizations ENABLE ROW LEVEL SECURITY;

-- Public read access for published/stale localizations
CREATE POLICY "cms_localizations_public_read"
  ON public.cms_localizations FOR SELECT
  TO anon, authenticated
  USING (status IN ('published', 'stale', 'missing'));

-- Executive write access
CREATE POLICY "cms_localizations_executive_write"
  ON public.cms_localizations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.executive_assignments AS ea
      WHERE ea.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.executive_assignments AS ea
      WHERE ea.user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON TABLE public.cms_localizations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.cms_localizations TO authenticated;
```

---

## 15. Legacy Compatibility

1. Existing Arabic CMS payloads in `published_site_content` continue to serve as the ground truth.
2. If `cms_localizations` has no row for a given target, the frontend fallback layer automatically returns the Arabic content without throwing or crashing.
3. During migration, any legacy components expecting untranslated data continue to render without disturbance.

---

## 16. RTL / LTR Strategy

### 16.1 Document Root Attributes
- Arabic: `<html lang="ar" dir="rtl">`
- Turkish: `<html lang="tr" dir="ltr">`
- English: `<html lang="en" dir="ltr">`

### 16.2 Logical Tailwind Class Mapping
Replace physical direction utilities with logical or direction-conditioned utilities:
- `text-right` -> `text-start`
- `text-left` -> `text-end`
- `pr-10` -> `ps-10`
- `pl-10` -> `pe-10`
- `mr-*` -> `me-*`
- `ml-*` -> `ms-*`
- `right-3` -> `start-3` (or `rtl:right-3 ltr:left-3`)
- `left-3` -> `end-3` (or `rtl:left-3 ltr:right-3`)

### 16.3 Icon Flipping Rules
- **Flip**: Progression arrows indicating forward/backward (e.g., `ChevronLeft` / `ChevronRight`, `ArrowLeft` / `ArrowRight` when used as "Next" / "Previous").
- **Do Not Flip**: Informational/brand icons (`Calendar`, `User`, `Mail`, `Lock`, `Shield`, `Trash2`, `Search`, `Image`, `Video`, `Facebook`, `Instagram`, etc.).

---

## 17. Date and Number Formatting

1. **Dates**:
   Rendered exclusively through `formatLocalizedDate(isoString, locale, options)` wrapping `Intl.DateTimeFormat`:
   - AR: `15 أكتوبر 2026`
   - TR: `15 Ekim 2026`
   - EN: `October 15, 2026`
2. **Numbers**:
   Rendered through `formatLocalizedNumber(num, locale)` wrapping `Intl.NumberFormat`:
   - AR: Arabic numerals or Eastern Arabic digits according to platform conventions.
   - TR / EN: Western digits (1, 2, 3...).
3. **Machine Identifiers Protected**:
   Phone numbers, verification codes, UUIDs, student IDs, and technical keys are never passed through `Intl` number formatters.

---

## 18. Language Switcher UX

### 18.1 Desktop Navbar
- Rendered in the header actions bar next to Auth/Profile controls.
- Dropdown trigger displaying an international globe icon and the current language name:
  `🌐 العربية` | `🌐 Türkçe` | `🌐 English`
- Dropdown menu options:
  - `العربية` (Arabic)
  - `Türkçe` (Turkish)
  - `English` (English)

### 18.2 Mobile Drawer
- Prominent segmented control or list inside the mobile hamburger menu.
- Easily reachable with touch targets $\ge 44\text{px}$.

### 18.3 Invariant Behaviors
- **Zero Page Reload**: State is updated in memory via React context and `i18next.changeLanguage()`.
- **Preserved View**: The user remains on the active page/modal/tab.
- **Session Intact**: Supabase session and user identity are completely untouched.
- **No Flags**: Languages are denoted strictly by their native names, not national flags, respecting diverse student backgrounds.

---

## 19. Security Model

1. **Edge Function Secrets**: `AZURE_TRANSLATOR_KEY` is strictly managed via Supabase Vault / Edge Function secrets. Zero client bundle exposure.
2. **Strict Role-Based Invocation**: The translation endpoint checks JWT authentication and verifies the caller's active executive role via `public.executive_assignments`.
3. **No Blind Trust of Client Payload**: Edge Function validates request bounds (max batch count: 50, max total characters: 10,000 per request).
4. **Data API Privileges**: Standard RLS policies on `public.cms_localizations` permit public reading of published items while restricting writes to authenticated executives.

---

## 20. Cost & Abuse Controls

1. **Azure Free Tier (F0) Constraints**: 2,000,000 characters per month.
2. **Hash-Based Translation Caching**: The client and server verify `source_hash`. If text has already been translated and hash matches, translation is skipped.
3. **Delta Retranslation**: Retranslation requests send only field paths that changed, rather than re-transmitting entire documents.
4. **Payload Caps**: Edge Function caps requests at 10,000 characters to prevent accidental exhaustion.

---

## 21. Current-Content Migration & Backfill Strategy

To ensure the public language switcher does not launch on an empty or half-translated website:
1. **Content Extraction**: A local CLI script extracts all current canonical Arabic CMS content across all targets (`site`, `about`, `programsContent`, `events`, `news`, `galleryAlbums`, `galleryCategories`, `guideSections`, `guideQuickInfo`, `faqCategories`, `contactCards`, `contactMap`, `committees`).
2. **Batch Initial Translation**: Generates seed JSON files for Turkish and English.
3. **Review & Seed**: Generates the initial seed migration/data fixture `cms_localizations` rows so all pages have complete, human-verified Turkish and English representations from day one.

---

## 22. Testing Strategy (Strict TDD)

Every component of the multilingual architecture must be verified with automated tests using `node:test`:
1. **Locale Resolution & Detection Tests**:
   - Manually saved preference overrides browser.
   - Browser languages detection for AR, TR, EN.
   - Invalid/unrecognized locale fallback to `ar`.
2. **Language Switcher & Direction Tests**:
   - Switching language changes `document.documentElement.lang` and `dir`.
   - Preserves view state without URL change.
3. **Static UI Dictionary Parity Tests**:
   - `ar.ts`, `tr.ts`, and `en.ts` have identical keys.
   - Raw Arabic string leak audit test across UI components.
4. **CMS Merging & Fallback Tests**:
   - Merging localized TR/EN payload onto Arabic canonical source.
   - Graceful Arabic fallback when localization is missing.
   - Stale status detection when source hash changes.
5. **Translation Provider & Edge Function Contract Tests**:
   - Contract test verifying provider interface and Azure request formulation.
   - Edge Function authorization and input validation checks.
6. **Regression Tests**:
   - Parent branch features (executive role transfers, executive revocation to student, member soft removal, login/signup) pass with 0 regressions.

---

## 23. Deployment Safety Constraints

1. **Remote Supabase Drift Guard**:
   - **DO NOT** run `supabase db push`.
   - **DO NOT** run `supabase migration repair`.
   - **DO NOT** execute remote DDL/DML.
   - All migrations and Edge Functions are authored and tested locally in the workspace.
2. **Atomic Rollout**: The public language switcher will only be enabled after local verification confirms static dictionaries and CMS localizations are fully populated.

---

## 24. Translatable vs. Non-Translatable Data Inventory

| Target / Entity | Translatable Fields (Localizable) | Non-Translatable Fields (Identity / Structural) |
| :--- | :--- | :--- |
| **Site Branding** | `brand.name` (AR), `brand.nameTr` (Latin/TR/EN) | `brand.logoUrl`, `brand.logoPath`, `brand.logoIcon` |
| **Homepage Hero** | `hero.badge`, `hero.title`, `hero.subtitle`, `hero.description`, `hero.primaryBtn`, `hero.secondaryBtn`, `hero.tertiaryBtn`, `badge1.label`, `badge2.label` | `hero.image`, `badge1.value`, `badge1.icon`, `badge2.value`, `badge2.icon` |
| **Homepage Stats** | `stats[].label` | `stats[].value`, `stats[].icon` |
| **About Page** | `hero.badge`, `hero.title`, `hero.description`, `story.title`, `story.paragraphs[]`, `vision.title`, `vision.text`, `message.title`, `message.text`, `goals.title`, `goals.items[]`, `values[].title`, `values[].desc`, `activities.title`, `activities.desc`, `activities.items[]` | `story.image`, `vision.icon`, `message.icon`, `values[].icon` |
| **Programs Content**| `badge`, `title`, `description` | *(None)* |
| **Events (`UEvent`)**| `title`, `description`, `location` (natural text) | `id`, `category`, `date`, `capacity`, `registered`, `image`, `createdBy`, `createdByRole`, `eventUrl`, `activityType`, `pointsValue`, `registrationDeadline` |
| **News (`NewsItem`)**| `title`, `excerpt`, `fullContent`, `category` (label) | `id`, `date`, `image`, `pinnedOnHomepage`, `externalUrl` |
| **Gallery Albums** | `title`, `description` | `id`, `categoryId`, `coverImage`, `mediaCount`, `createdAt` |
| **Gallery Categories**| `name`, `description` | `id`, `icon` |
| **Student Guide** | `quickInfo`, `sections[].title`, `sections[].items[].q`, `sections[].items[].a` | `sections[].id`, `sections[].icon`, `version` |
| **FAQ Categories** | `name`, `questions[].q`, `questions[].a` | `id`, `questions[].id`, `version` |
| **Contact Cards** | `title`, `description`, `linkText` | `id`, `icon`, `linkUrl` |
| **Contact Map** | `title`, `address` | `coordinates`, `googleMapsUrl` |
| **Committees** | `description`, `responsibilities[]`, `vision`, `goals` | `id`, `name` (technical key), `shortName`, `icon`, `color`, `head.id`, `members[].id`, `stats[].value` |
| **Users / Students** | *(None)* | `id`, `userId`, `name`, `email`, `loginEmail`, `contactEmail`, `phone`, `photo`, `university`, `major`, `year`, `role`, `status` |
| **Suggestions** | *(None - User Generated)* | `id`, `studentId`, `studentName`, `title`, `content`, `responses[].text` |
| **Contact Messages**| *(None - User Generated)* | `id`, `sender_name`, `sender_email`, `subject`, `message`, `reply_text` |

---

## 25. Glossary Strategy

To guarantee institutional consistency across all three languages, the translation layer enforces a standardized glossary:

| Arabic (Canonical Source) | Turkish (Standard) | English (Standard) |
| :--- | :--- | :--- |
| **اتحاد شباب الأمة** | Ümmet Gençleri Birliği | Ummah Youth Union |
| **رئيس الاتحاد** | Birlik Başkanı | Union President |
| **نائب الرئيس** | Başkan Yardımcısı | Vice President |
| **مسؤول الإعلام** | Medya Sorumlusu | Media Head |
| **مسؤول المالية** | Maliye Sorumlusu | Finance Head |
| **مسؤول الرقابة** | Denetim Sorumlusu | Audit Head |
| **مسؤول الأكاديمية** | Akademi Sorumlusu | Academic Head |
| **مسؤول الأنشطة** | Etkinlik Sorumlusu | Activities Head |
| **طالب عادي** | Normal Öğrenci | Regular Student |
| **بوابة الطالب** | Öğrenci Portalı | Student Portal |
| **لوحة الإدارة** | Yönetim Paneli | Admin Dashboard |
| **الهيئة التنفيذية** | Yönetim Kurulu | Executive Board |
| **دليل الطالب** | Öğrenci Rehberi | Student Guide |
| **الأسئلة الشائعة** | Sıkça Sorulan Sorular | Frequently Asked Questions |
| **البرامج والأنشطة** | Programlar ve Etkinlikler | Programs & Activities |
| **معرض الصور** | Medya Galerisi | Media Gallery |
| **آخر الأخبار** | Son Haberler | Latest News |
| **اتصل بنا** | İletişim | Contact Us |
| **عن الاتحاد** | Hakkımızda | About Us |

---

## 26. Risks and Mitigations

| Risk | Severity | Mitigation Strategy |
| :--- | :--- | :--- |
| **Flash of Wrong Language (FOWL)** | Medium | Inline synchronous bootstrap script in `index.html` sets `lang` and `dir` on `document.documentElement` before React mounts. |
| **Layout breakage in LTR** | Medium | Comprehensive audit and conversion of hardcoded physical directional classes to logical utilities (`text-start`, `ps-*`, `pe-*`, `ms-*`, `me-*`). |
| **Accidental translation of proper names** | High | Strict field allowlist; student profiles, names, emails, and user-generated text are completely excluded from the translation pipeline. |
| **Azure quota exhaustion / cost spike** | Medium | Server-side character limits (10,000 chars/batch), hash caching, delta updates, and authenticated-only invocation. |
| **Broken approval flow during CMS updates** | High | Atomic multilingual bundles submitted in `edit_requests` and applied in a single database transaction upon approval. |
| **Remote Supabase migration drift** | Critical | Strict prohibition of remote migrations (`db push`); all SQL and functions remain local and are verified locally via contracts. |
