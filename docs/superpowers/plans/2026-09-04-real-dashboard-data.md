# Real Authoritative Admin Dashboard Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver authoritative, database-backed metrics for the Admin Statistics Dashboard (`StatsTab`) by eliminating all mock data, `localStorage` fallbacks, and fabricated numbers, introducing a database-backed event-registration ledger with explicit lifecycle states, persisting general student suggestions with targeted RBAC, repairing 6-month calendar arithmetic across year boundaries using authoritative `decided_at`, and enabling accessible, role-aware card navigation without visual redesign.

**Architecture:** A Supabase-authoritative analytics pattern where executive analytics are queried via an executive-only security definer RPC (`get_admin_dashboard_metrics()`), event registrations are tracked in an idempotent ledger table (`public.event_registrations`) referencing `public.profiles(id)`, student suggestions and replies are persisted in relational tables with RBAC (`public.student_suggestions`, `public.suggestion_responses`), published events remain in CMS (`published_site_content`), and calculations are strictly isolated in pure domain modules.

**Tech Stack:** React 18, TypeScript, Supabase JS & PostgreSQL RLS/RPCs, Node.js built-in test runner (`node:test`, `node:assert/strict`), Tailwind CSS, Lucide icons, Vite.

**Spec:** `docs/superpowers/specs/2026-09-04-real-dashboard-data-design.md`

---

## Global Constraints & Principles

- **NO Mock / LocalStorage Authority**: No admin metric may use `mockStudents`, `mockSuggestions`, `localStorage`, or client-side incrementation as truth.
- **NO Direct Migration Application**: Author migrations in `supabase/migrations/` locally. Test them with unit/regex contracts. Do **NOT** apply migrations to remote Supabase without explicit human approval.
- **NO Modification of Historical Migrations**: All existing migrations prior to this feature remain immutable.
- **Preserve Existing Layout & Scrolling**: Do not redesign cards, layout, or sidebar scrolling.
- **Preserve CMS Event Flow**: Events remain stored in `published_site_content` (`content -> 'events'`). Do not create a relational `events` table or fake foreign key.
- **Strict Role-Based Security**: Never expose applicant PII to non-president roles. Derive authorization from `auth.uid()` and `executive_assignments`.
- **Zero Historical Fabrication**: Historical months prior to the event ledger deployment must report `0` participations.
- **Baseline Test Preservation**: All 521 existing tests must continue to pass at every checkpoint.

---

### Task 1: Pure Dashboard Analytics Domain Calculations & Tests

**Files:**
- Create: `src/domain/dashboardAnalytics.ts`
- Create: `tests/dashboardAnalytics.test.mjs`

**Interfaces & Contracts:**
- `MonthBucket`: `{ year: number; month: number; key: string; label: string }`
- `generateSixMonthBuckets(referenceDate?: Date): MonthBucket[]`
- `calculateMemberGrowthSeries(applications: { status: string; decidedAt?: string | null }[], buckets: MonthBucket[]): { label: string; value: number }[]`
- `calculateEventParticipationSeries(registrations: { status: 'active' | 'cancelled'; registeredAt: string }[], buckets: MonthBucket[]): { label: string; value: number }[]`
- `calculateCategoryDistribution(events: UEvent[]): { label: string; value: number; color: string }[]`
- `calculateParticipationByCategory(events: UEvent[], activeRegistrationsByEventId: Record<string, number>): { label: string; value: number; color: string }[]`

- [ ] **Step 1: Write failing domain analytics unit tests**
  Create `tests/dashboardAnalytics.test.mjs`:
  - Test year-boundary bucket calculation (e.g. crossing Dec 2025 to Jan 2026).
  - Test Arabic month labels formatting.
  - Test member growth series: verifies accepted applications grouped by authoritative `decidedAt`.
  - Test that legacy accepted applications with `decidedAt: null` are excluded from the historical series (no date invention).
  - Test event participation series: verifies active registrations grouped by `registeredAt`.
  - Test that cancelled registrations (`status === 'cancelled'`) are excluded from active event participation.
  - Test zero-filling for historical months without records (no fabrication).
  - Test event category distribution filtering out empty categories.
  - Test participation calculation mapping active registration counts by event ID to categories.

- [ ] **Step 2: Run test to confirm RED**
  Run: `node --test tests/dashboardAnalytics.test.mjs`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/domain/dashboardAnalytics.ts`**
  Implement pure domain functions adhering to the spec:
  - Generate 6 sequential calendar buckets backwards from `referenceDate`.
  - Filter and group accepted applications by `decidedAt`. Exclude null `decidedAt` from monthly trend.
  - Filter active registrations (`status === 'active'`) and group by `registeredAt`.
  - Sum active registrations by category based on current published events.
  - Ensure zero fallbacks when data is missing or empty.

- [ ] **Step 4: Verify test passes (GREEN)**
  Run: `node --test tests/dashboardAnalytics.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Typecheck & review checkpoint**
  Run: `npm run typecheck`
  Confirm all pure calculations are typed and test-covered.

---

### Task 2: Secure Authoritative Member & Application Analytics SQL Migration & Repository

**Files:**
- Create: `supabase/migrations/20260904120000_admin_dashboard_authoritative_analytics.sql`
- Create: `tests/adminDashboardAnalyticsMigration.test.mjs`
- Create: `src/domain/dashboardAnalyticsGateway.ts`
- Create: `src/services/dashboardAnalyticsService.ts`

**Interfaces & Contracts:**
- SQL RPC: `public.get_admin_dashboard_metrics()`
  - Returns: `total_members_count`, `active_members_count`, `pending_applications_count`, `six_month_member_growth` (jsonb), `six_month_event_participations` (jsonb), `event_participation_by_id` (jsonb).
  - Security: `SECURITY DEFINER`, `SET search_path = ''`, restricted to `private.is_current_executive()`.
- Semantics:
  - `total_members_count`: all profiles with `status = 'active'` (including bootstrapped executive accounts) PLUS profiles with `status = 'inactive'` that have an application with `status = 'accepted'`. Deduplicated using `UNION`. Excludes removed, banned, pending, and rejected.
  - `active_members_count`: profiles with `status = 'active'`.
  - `six_month_member_growth`: grouped by `student_applications.decided_at` for `status = 'accepted'`. Excludes applications where `decided_at IS NULL`.
- TypeScript Gateway: `loadDashboardAnalyticsMetrics(client: DashboardAnalyticsClient): Promise<ServiceResult<DashboardAnalyticsMetrics>>`

- [ ] **Step 1: Write migration and gateway contract tests**
  Create `tests/adminDashboardAnalyticsMigration.test.mjs`:
  - Assert SQL contains `CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()`.
  - Assert `SECURITY DEFINER` and `SET search_path = ''`.
  - Assert verification of `private.is_current_executive()`.
  - Assert total members query: verifies `status = 'active'` profiles are counted AND `status = 'inactive'` requires accepted application, deduplicating with `UNION`.
  - Assert active members query filters on `profiles.status = 'active'`.
  - Assert member growth uses `student_applications.decided_at` and checks `decided_at IS NOT NULL`.
  - Assert revocation from `PUBLIC, anon` and grant only to `authenticated`.
  - Test gateway maps returned rows into typed `DashboardAnalyticsMetrics`.

- [ ] **Step 2: Run test to confirm RED**
  Run: `node --test tests/adminDashboardAnalyticsMigration.test.mjs`
  Expected: FAIL (migration file does not exist).

- [ ] **Step 3: Create migration `20260904120000_admin_dashboard_authoritative_analytics.sql`**
  Implement the exact SQL function specified in Section 4.C of the design doc.

- [ ] **Step 4: Implement gateway and service wrappers**
  Implement `src/domain/dashboardAnalyticsGateway.ts` and `src/services/dashboardAnalyticsService.ts`.

- [ ] **Step 5: Verify test passes (GREEN)**
  Run: `node --test tests/adminDashboardAnalyticsMigration.test.mjs`
  Expected: PASS.

- [ ] **Step 6: Run full test baseline**
  Run: `npm test`
  Expected: 521 baseline + new tests pass.

---

### Task 3: Event Registrations Migration & Server Contracts

**Files:**
- Create: `supabase/migrations/20260904130000_create_event_registrations.sql`
- Create: `tests/eventRegistrationsMigration.test.mjs`
- Create: `src/domain/eventRegistrationGateway.ts`
- Create: `src/services/eventRegistrationService.ts`

**Interfaces & Contracts:**
- SQL Table: `public.event_registrations`:
  - `event_id text NOT NULL`
  - `user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`
  - `registered_at timestamptz NOT NULL DEFAULT now()`
  - `cancelled_at timestamptz`
  - `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled'))`
  - `PRIMARY KEY (event_id, user_id)`
  - No redundant foreign key to `auth.users(id)`.
  - No fake foreign key to `events`.
- SQL RPC: `public.register_event_participation(p_event_id text)`:
  - Validates authenticated user exists (`auth.uid()`).
  - Validates active membership (`profiles.status = 'active'` and not banned).
  - Validates non-empty event_id.
  - Validates event exists in CMS published JSON (`published_site_content`).
  - Validates registration deadline if present.
  - Validates capacity against active registrations.
  - Idempotently transitions row to `status = 'active'`, `cancelled_at = NULL`.
- SQL RPC: `public.unregister_event_participation(p_event_id text)`:
  - Transitions row to `status = 'cancelled'`, `cancelled_at = now()`.
- SQL RPC: `public.list_my_event_registrations()`:
  - Returns active registered event IDs for the caller.
- TypeScript Service:
  - `registerForEvent(eventId: string): Promise<ServiceResult<{ eventId: string; registeredCount: number }>>`
  - `unregisterFromEvent(eventId: string): Promise<ServiceResult<{ eventId: string; registeredCount: number }>>`
  - `listMyRegisteredEventIds(): Promise<ServiceResult<string[]>>`

- [ ] **Step 1: Write migration and registration gateway unit tests**
  Create `tests/eventRegistrationsMigration.test.mjs`:
  - Verify table schema: `event_id text NOT NULL`, `user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE`.
  - Verify lifecycle columns: `status`, `registered_at`, `cancelled_at`.
  - Verify compound primary key: `PRIMARY KEY (event_id, user_id)` guaranteeing uniqueness and idempotency.
  - Verify indexes for active records: `user_id` where `status = 'active'`, `event_id` where `status = 'active'`.
  - Verify RLS enabled on `event_registrations`.
  - Verify `register_event_participation` verifies active member status, CMS event existence, registration deadline, and capacity.
  - Verify `unregister_event_participation` sets `status = 'cancelled'`.
  - Test gateway maps responses and error codes (`EVENT_FULL`, `DEADLINE_PASSED`, `UNAUTHORIZED_MEMBER`, `EVENT_NOT_FOUND`).

- [ ] **Step 2: Run test to confirm RED**
  Run: `node --test tests/eventRegistrationsMigration.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Create migration `20260904130000_create_event_registrations.sql`**
  Implement table, indexes, RLS policies, and RPCs `register_event_participation`, `unregister_event_participation`, and `list_my_event_registrations`.

- [ ] **Step 4: Implement gateway and service**
  Implement `src/domain/eventRegistrationGateway.ts` and `src/services/eventRegistrationService.ts`.

- [ ] **Step 5: Verify test passes (GREEN)**
  Run: `node --test tests/eventRegistrationsMigration.test.mjs`
  Expected: PASS.

---

### Task 4: Replace Local Event Mutations with Server Authority in AppContext

**Files:**
- Modify: `src/context/AppContext.tsx`
- Create: `tests/eventRegistrationFlow.test.mjs`

**Interfaces & Contracts:**
- `registerForEvent(eventId: string): Promise<{ ok: boolean; error?: string }>`
- `unregisterFromEvent(eventId: string): Promise<{ ok: boolean; error?: string }>`
- Session initialization: load registered events from `listMyRegisteredEventIds()`, populating `currentStudent.registeredEvents` from server state.

- [ ] **Step 1: Write event registration flow unit tests**
  Create `tests/eventRegistrationFlow.test.mjs`:
  - Test that calling `registerForEvent` dispatches to server service.
  - Test rejection when student access is not accepted (`pending`, `rejected`, `removed`).
  - Test that state is updated from server returned counts, not browser increment `e.registered + 1`.
  - Test that failure rolls back or leaves local state unmodified.
  - Test session initialization populates registered events from server query rather than mockData.

- [ ] **Step 2: Run test to confirm RED**
  Run: `node --test tests/eventRegistrationFlow.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Update `AppContext.tsx`**
  - Import `registerForEventParticipation`, `unregisterFromEventParticipation`, and `listMyRegisteredEventIds` from `eventRegistrationService.ts`.
  - Load student's registered events on auth login.
  - Replace in-memory `registerForEvent` and `unregisterFromEvent` with server calls.
  - Update `currentStudent.registeredEvents` and `events[i].registered` based on server response.

- [ ] **Step 4: Verify test passes (GREEN)**
  Run: `node --test tests/eventRegistrationFlow.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Run typecheck**
  Run: `npm run typecheck`
  Expected: PASS.

---

### Task 5: Event Participation and Category Analytics Integration

**Files:**
- Create: `src/domain/eventParticipationAnalytics.ts`
- Create: `tests/eventParticipationAnalytics.test.mjs`
- Modify: `src/services/dashboardAnalyticsService.ts`

**Interfaces & Contracts:**
- `mapEventParticipationToCategories(events: UEvent[], activeRegistrationsByEventId: Record<string, number>): { category: EventCategory; label: string; count: number; color: string }[]`

- [ ] **Step 1: Write participation analytics unit tests**
  Create `tests/eventParticipationAnalytics.test.mjs`:
  - Test mapping active registration counts to current published event categories.
  - Verify that categories with multiple events sum registrations correctly.
  - Verify that events with 0 registrations contribute 0 to the category sum.
  - Verify that cancelled registrations are excluded.
  - Verify that deleted/unmatched event registrations are handled gracefully.

- [ ] **Step 2: Run test to confirm RED**
  Run: `node --test tests/eventParticipationAnalytics.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Implement `src/domain/eventParticipationAnalytics.ts`**
  Implement category aggregation mapping and integrate into `dashboardAnalyticsService.ts`.

- [ ] **Step 4: Verify test passes (GREEN)**
  Run: `node --test tests/eventParticipationAnalytics.test.mjs`
  Expected: PASS.

---

### Task 6: Real Student Suggestion Persistence & RBAC

**Files:**
- Create: `supabase/migrations/20260904140000_create_student_suggestions.sql`
- Create: `tests/studentSuggestionsMigration.test.mjs`
- Create: `src/domain/studentSuggestionGateway.ts`
- Create: `src/services/studentSuggestionService.ts`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/pages/StudentDashboard.tsx`
- Create: `tests/studentSuggestionRepository.test.mjs`

**Interfaces & Contracts:**
- SQL Tables: `public.student_suggestions`, `public.suggestion_responses`.
- SQL RPCs:
  - `submit_student_suggestion(p_target_role, p_category, p_title, p_content)`
  - `list_visible_student_suggestions()`
  - `respond_to_student_suggestion(p_suggestion_id, p_response_text, p_new_status)`
- TypeScript Service:
  - `submitSuggestion(input: SuggestionInput): Promise<ServiceResult<Suggestion>>`
  - `listSuggestions(): Promise<ServiceResult<Suggestion[]>>`
  - `replyToSuggestion(id: string, reply: string, status: SuggestionStatus): Promise<ServiceResult<Suggestion>>`

- [ ] **Step 1: Write suggestion migration and RBAC tests**
  Create `tests/studentSuggestionsMigration.test.mjs` & `tests/studentSuggestionRepository.test.mjs`:
  - Test schema constraints: `target_role` enum check, `status` enum check, content lengths.
  - Test RLS policies:
    - President can view and reply to all suggestions.
    - Committee heads can view and reply only to suggestions matching their `target_role`.
    - Students can view only their own suggestions.
    - Submissions restricted to active members.
  - Test gateway maps database rows and responses to frontend `Suggestion` interface.

- [ ] **Step 2: Run tests to confirm RED**
  Run: `node --test tests/studentSuggestionsMigration.test.mjs tests/studentSuggestionRepository.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Create migration `20260904140000_create_student_suggestions.sql`**
  Implement tables, indexes, RLS policies, and RPCs.

- [ ] **Step 4: Implement gateway and service**
  Implement `src/domain/studentSuggestionGateway.ts` and `src/services/studentSuggestionService.ts`.

- [ ] **Step 5: Connect `AppContext.tsx` and `StudentDashboard.tsx`**
  - Replace `localStorage` / `mockSuggestions` state in `AppContext.tsx` with calls to `studentSuggestionService.listSuggestions()`.
  - Update `respondToSuggestion` to invoke `studentSuggestionService.replyToSuggestion()`.
  - Update `StudentDashboard.tsx` `submitSuggestion` to call `submitSuggestion()` through context/service.

- [ ] **Step 6: Verify tests pass (GREEN)**
  Run: `node --test tests/studentSuggestionsMigration.test.mjs tests/studentSuggestionRepository.test.mjs`
  Expected: PASS.

---

### Task 7: StatsTab Integration & Role-Aware Stat Card Navigation

**Files:**
- Modify: `src/components/Charts.tsx`
- Modify: `src/pages/AdminDashboard.tsx`
- Create: `tests/statsTabIntegration.test.mjs`
- Create: `tests/cardNavigation.test.mjs`

**Interfaces & Contracts:**
- `LineChart`: Extended to render two real series:
  - Series 1: "نمو الأعضاء المقبولين" (Navy `#1e3454`)
  - Series 2: "تسجيلات الفعاليات" (Gold `#d49a24`)
  - Accessible Arabic legend.
  - Responsive SVG scaling (`width: 100%`, `min-w-0`).
- `StatsTab` Props:
  - `analytics: DashboardAnalyticsMetrics | null`
  - `analyticsLoading: boolean`
  - `onNavigate?: (tab: AdminTab, filter?: { status?: 'all' | 'active' }) => void`
- Navigation Accessibility:
  - For President:
    - "إجمالي الطلاب" -> `onNavigate('members')`
    - "طلاب نشطون" -> `onNavigate('members', { status: 'active' })`
    - "فعاليات قادمة" -> `onNavigate('events')`
    - "طلبات قيد المراجعة" -> `onNavigate('applications')`
  - For non-president roles:
    - Cards targeting inaccessible tabs (`members`, `applications`) render as informational only: `cursor-default`, no click handler, chevron hidden.
    - "فعاليات قادمة" navigates to `events`.
- `MembersTab`: Supports `initialStatusFilter?: 'all' | 'active'`.

- [ ] **Step 1: Write StatsTab integration and card navigation tests**
  Create `tests/statsTabIntegration.test.mjs` & `tests/cardNavigation.test.mjs`:
  - Test that `StatsTab` uses authoritative `analytics` data when loaded and never falls back to `mockStudents`.
  - Test that clicking "إجمالي الطلاب" invokes `onNavigate('members')` for President.
  - Test that clicking "طلاب نشطون" invokes `onNavigate('members', { status: 'active' })` for President.
  - Test that clicking "فعاليات قادمة" invokes `onNavigate('events')` for all roles.
  - Test that clicking "طلبات قيد المراجعة" invokes `onNavigate('applications')` for President.
  - Test that for non-president roles, cards targeting restricted tabs (`members`, `applications`) do not attach click handlers and render informational cards.
  - Test that `MembersTab` filters by active status when `initialStatusFilter = 'active'`.
  - Test dual-series line chart rendering with correct Arabic legend.

- [ ] **Step 2: Run tests to confirm RED**
  Run: `node --test tests/statsTabIntegration.test.mjs tests/cardNavigation.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Enhance `LineChart` in `src/components/Charts.tsx`**
  Add dual-series support with Navy and Gold polylines, legend badges, and responsive SVG scaling.

- [ ] **Step 4: Update `StatsTab` and `MembersTab` in `src/pages/AdminDashboard.tsx`**
  - Pass `analytics` data into `StatsTab`.
  - Render role-aware interactive buttons or informational cards based on tab visibility.
  - Add status filter support to `MembersTab`.
  - Display dual-series trend chart and real participation by category.

- [ ] **Step 5: Verify tests pass (GREEN)**
  Run: `node --test tests/statsTabIntegration.test.mjs tests/cardNavigation.test.mjs`
  Expected: PASS.

---

### Task 8: Realtime & Freshness Implementation

**Files:**
- Modify: `src/services/dashboardAnalyticsService.ts`
- Modify: `src/context/AppContext.tsx`
- Create: `tests/dashboardRealtimeFreshness.test.mjs`

**Interfaces & Contracts:**
- `subscribeToDashboardAnalyticsUpdates(onUpdate: () => void): () => Promise<ServiceResult<void>>`
- Debounced refresh (300ms) on `event_registrations`, `student_suggestions`, and `student_applications`.

- [ ] **Step 1: Write Realtime subscription unit tests**
  Create `tests/dashboardRealtimeFreshness.test.mjs`:
  - Test channel subscription to `event_registrations` and `student_suggestions`.
  - Test debounced callback invocation.
  - Test clean unsubscribe on teardown.

- [ ] **Step 2: Run test to confirm RED**
  Run: `node --test tests/dashboardRealtimeFreshness.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Implement subscription in `dashboardAnalyticsService.ts` and wire to `AppContext.tsx`**
  Set up channel subscription when admin dashboard is active; trigger `refreshDashboardAnalytics()` on change events.

- [ ] **Step 4: Verify test passes (GREEN)**
  Run: `node --test tests/dashboardRealtimeFreshness.test.mjs`
  Expected: PASS.

---

### Task 9: Responsive Analytics & Mobile Regression Protection

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`
- Create: `tests/dashboardResponsiveRegression.test.mjs`

**Interfaces & Contracts:**
- Ensure all chart cards, grid containers, and table wrappers have `min-w-0`, `w-full`, and no horizontal overflow on mobile viewports.

- [ ] **Step 1: Write responsive regression tests**
  Create `tests/dashboardResponsiveRegression.test.mjs`:
  - Inspect `StatsTab` DOM / JSX structure for proper overflow guards.
  - Assert chart containers use `w-full` and `min-w-0`.
  - Assert card grid uses responsive breakpoint classes (`grid gap-4 sm:grid-cols-2 lg:grid-cols-4`).
  - Assert labels allow truncation (`truncate`) where needed without horizontal overflow.

- [ ] **Step 2: Run test to confirm PASS or identify adjustments**
  Run: `node --test tests/dashboardResponsiveRegression.test.mjs`

- [ ] **Step 3: Polish responsive wrappers in `AdminDashboard.tsx`**
  Verify and apply `min-w-0` to chart and card flex parents.

- [ ] **Step 4: Verify test passes (GREEN)**
  Run: `node --test tests/dashboardResponsiveRegression.test.mjs`
  Expected: PASS.

---

### Task 10: Full Regression, Security, & Typecheck Verification

**Files:**
- Audit all modified and created files across the repository.

- [ ] **Step 1: Run full unit test suite**
  Run: `npm test`
  Expected: All baseline 521 tests + all new tests pass (0 failures, 0 skipped).

- [ ] **Step 2: Run TypeScript compiler check**
  Run: `npm run typecheck`
  Expected: Exit code 0, no type errors.

- [ ] **Step 3: Run ESLint**
  Run: `npm run lint`
  Expected: Exit code 0, no lint warnings or errors.

- [ ] **Step 4: Run production build validation**
  Run: `npm run build`
  Expected: Clean build without bundler errors.

- [ ] **Step 5: Final security audit**
  - Confirm no secrets or `.env` files were touched.
  - Confirm new migrations are local-only and pending human approval.
  - Confirm no mock data or `localStorage` fallbacks remain in admin stats paths.
