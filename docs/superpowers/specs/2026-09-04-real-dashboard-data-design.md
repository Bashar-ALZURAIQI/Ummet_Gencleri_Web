# Real Authoritative Admin Dashboard Data Architecture Design

## 1. Executive Summary & Problem Statement

The Admin Statistics Dashboard (`StatsTab` in `src/pages/AdminDashboard.tsx`) provides high-level executive insight into union membership, activity participation, application pipeline, event distribution, and community suggestions. However, several critical dashboard metrics currently rely on non-authoritative sources:

1. **`students`**: initialized in `AppContext.tsx` from `localStorage` (`'ummet_students'` / `'ummet_students_state'`) falling back to `mockStudents` in `src/data/mockData.ts`.
2. **`suggestions`**: initialized from `localStorage` (`'ummet_suggestions_state'`) falling back to `mockSuggestions`, mutating local state with simulated responses.
3. **Event Registrations**: event registration and cancellation currently mutate in-memory React state (`currentStudent.registeredEvents` and `event.registered`). There is no durable database ledger of event registrations, and the aggregate `registered` counter on `UEvent` is neither tamper-proof nor historical.
4. **6-Month Trend ("نمو التسجيلات والمشاركات")**: combines member joins and event registrations into a single mixed number, computes historical months using an offset bug (`[4, 5, 6, 7, 8, 9]`), ignores calendar year boundaries (comparing `d.getFullYear() === now.getFullYear()`), and fabricates trend data.
5. **Card Navigation**: stat cards render static `<div>` containers with visual chevron icons but have no navigational action to the corresponding admin management sections.

**Product Mandate**:
- The Admin Statistics dashboard must display **REAL, AUTHORITATIVE** data.
- No dashboard metric may appear as real if its source is `mockData`, fallback demo arrays, fabricated historical numbers, `localStorage`-only state, or manually incremented browser counters.
- The existing CMS architecture for published events (`published_site_content`) must be preserved.
- The recently completed dashboard layout and independent scrolling behavior must remain completely intact.
- This is an **architectural data truth and security** initiative, not a visual redesign.

---

## 2. Current-State Findings & Source Analysis

| Dashboard Metric / Component | Current Source in Codebase | Authority Status | Vulnerability / Deficiency |
|---|---|---|---|
| **إجمالي الطلاب** (Total Members) | `students.length` via `useApp()` | **Unauthoritative** | Uses `localStorage` or `mockStudents`. Excludes bootstrapped executive profiles. |
| **طلاب نشطون** (Active Members) | `students.filter(s => s.status === 'active').length` | **Unauthoritative** | Evaluated on mock/local student array. |
| **فعاليات قادمة** (Upcoming Events) | `events.filter(e => e.status === 'upcoming').length` | **Authoritative (CMS)** | Derived from `events` loaded from Supabase `published_site_content` (`id = 'main'`). |
| **طلبات قيد المراجعة** (Pending Applications) | `applications.filter(a => a.status === 'pending' \|\| a.status === 'interview').length` | **Conditionally Authoritative** | Authoritative for `PRESIDENT`, but non-president executives receive an empty list due to RLS (`student_applications_select_president` policy). |
| **نمو التسجيلات والمشاركات** (6-Month Trend) | `monthlyData` in `AdminDashboard.tsx` combining `joiners + registrants` | **Fabricated / Broken** | Combines two unrelated semantics; broken year-boundary arithmetic; uses `joined_at` instead of acceptance time; derives registrations from mutable counter. |
| **توزيع الفعاليات** (Event Distribution) | `catData` based on `events.filter(e => e.category === c).length` | **Authoritative (CMS)** | Dynamically reflects published events from CMS. |
| **المشاركة حسب نوع الفعالية** (Participation by Category) | `events.filter(e => e.category === c).reduce((s, e) => s + e.registered, 0)` | **Unauthoritative** | Relies on mutable aggregate counter `e.registered` rather than verifiable registration records. |
| **آخر الاقتراحات والرسائل** (Recent Suggestions & Messages) | `suggestions.slice(0, 4)` and `visibleContactMessages.slice(0, 2)` | **Mixed** | Messages are authoritative (Supabase `contact_messages`); suggestions are entirely mock/`localStorage`. |

---

## 3. Authoritative Source for Every Dashboard Metric

### A. إجمالي الطلاب (Total Union Members)
- **Authoritative Semantic**:
  - Every profile with `status = 'active'` (including legitimate active members who did not originate through the normal student application flow, such as administratively bootstrapped executive accounts).
  - PLUS profiles with `status = 'inactive'` ONLY when they have a `student_application` with `status = 'accepted'`.
  - Deduplicated logic: an active profile is counted once regardless of whether an application row exists.
- **Strict Exclusions**:
  - `status = 'removed'` (former members whose membership was revoked by President action).
  - `status = 'banned'` (banned accounts).
  - Pending applicants (`student_applications.status IN ('pending', 'interview')` with inactive profile).
  - Rejected applicants (`student_applications.status = 'rejected'` with inactive profile).
  - Anonymous visitors and unaccepted signups.

### B. طلاب نشطون (Active Union Members)
- **Authoritative Semantic**:
  - All member profiles with `profiles.status = 'active'`.
  - Excludes inactive, removed, and banned profiles.

### C. فعاليات قادمة (Upcoming Events)
- **Authoritative Source**: `public.published_site_content` -> `content -> 'events'`.
- **Criteria**: Events in the published CMS bundle with `status = 'upcoming'`.
- **Freshness**: Uses existing Supabase Realtime channel `published-site-content:main`.

### D. طلبات قيد المراجعة (Pending Review Applications)
- **Authoritative Source**: `public.student_applications`.
- **Criteria**: Rows with `status IN ('pending', 'interview')`.
- **Multi-Role Availability**: President retains direct table access via existing RLS; non-president leadership roles access this count strictly through the server-side aggregation RPC `get_admin_dashboard_metrics()`, protecting applicant PII while providing accurate executive situational awareness.

### E. توزيع الفعاليات (Event Distribution by Category)
- **Authoritative Source**: Real published events in `published_site_content`.
- **Dynamism**: Calculated dynamically on published events grouped by `EventCategory`. Automatically updates when Media Head or President edits and publishes site content.

### F. المشاركة حسب نوع الفعالية (Participation by Category)
- **Authoritative Source**: Server-backed `public.event_registrations` active records mapped to currently published CMS events.
- **Computation**: Sum of registrations with `status = 'active'` in `public.event_registrations` grouped by the associated event's current `category`. Events without registrations reflect 0; categories without active registrations reflect 0.

### G. نمو التسجيلات والمشاركات (Six-Month Trend - Two Distinct Series)
- **Series 1: Accepted Member Growth ("نمو الأعضاء المقبولين")**:
  - Source: `public.student_applications` where `status = 'accepted'` and `decided_at IS NOT NULL`, grouped by the calendar month and year of `decided_at`.
  - Do NOT use `profiles.joined_at` or account creation timestamp. `decided_at` is the authoritative moment of membership acceptance.
  - Legacy applications with `decided_at IS NULL`: counted in current total-member metric, but **strictly excluded** from historical monthly growth buckets. No fabricated timestamps or estimated months are ever introduced.
- **Series 2: Event Registrations ("تسجيلات الفعاليات")**:
  - Source: `public.event_registrations` where `status = 'active'`, grouped by the calendar month and year of `registered_at`.
  - Zero Fabrication Guarantee: Historical months prior to the ledger deployment report `0`. We never synthesize fake registration timestamps from `UEvent.registered`.

### H. آخر الاقتراحات (Recent Suggestions)
- **Authoritative Source**: New database table `public.student_suggestions` joined with `public.suggestion_responses`.
- **RBAC Visibility**:
  - `PRESIDENT`: sees all submitted suggestions across all committees.
  - Leadership Roles (`VICE_PRESIDENT`, `FINANCE_HEAD`, `AUDIT_HEAD`, `MEDIA_HEAD`, `ACADEMIC_HEAD`, `ACTIVITIES_HEAD`): see suggestions targeted to their specific `target_role`.
  - Students: see only their own suggestions.

### I. آخر الرسائل (Recent Contact Messages)
- **Authoritative Source**: Existing `public.contact_messages` table via `contactMessagingService.ts`. Unchanged.

---

## 4. Database Architecture & Schema Design

### A. Real Event Registrations Ledger: `public.event_registrations`

Because events live inside the JSON structure of `published_site_content` (`content -> 'events'`) rather than an independent relational table, `public.event_registrations` cannot declare a foreign key to an `events` table. To avoid redundant foreign keys, `user_id` references `public.profiles(id)` directly (which itself uniquely references `auth.users(id)`).

To prevent stale registrations from counting as active participation while cleanly preserving lifecycle history without an over-engineered audit subsystem, each record tracks `status` ('active' | 'cancelled'), `registered_at`, and `cancelled_at`.

```sql
CREATE TABLE IF NOT EXISTS public.event_registrations (
  event_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  registered_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  CONSTRAINT event_registrations_pkey PRIMARY KEY (event_id, user_id),
  CONSTRAINT event_registrations_status_check CHECK (
    status IN ('active', 'cancelled')
  ),
  CONSTRAINT event_registrations_event_id_trimmed CHECK (
    event_id = btrim(event_id) AND char_length(event_id) BETWEEN 1 AND 120
  ),
  CONSTRAINT event_registrations_lifecycle_check CHECK (
    (status = 'active' AND cancelled_at IS NULL) OR
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS event_registrations_user_active_idx
  ON public.event_registrations (user_id, registered_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS event_registrations_event_active_idx
  ON public.event_registrations (event_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS event_registrations_active_date_idx
  ON public.event_registrations (registered_at DESC)
  WHERE status = 'active';
```

#### Registration & Cancellation Server Contracts (RPCs):

1. `public.register_event_participation(p_event_id text)`:
   - **Security**: `SECURITY DEFINER`, `SET search_path = ''`.
   - **Derives Actor**: `v_user_id := (SELECT auth.uid())`. Never trusts client-supplied user IDs.
   - **Validation**:
     - User exists and has active membership:
       `EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND status = 'active')`.
     - User is not banned:
       `NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id AND banned_until > now())`.
     - `p_event_id` is non-empty and trimmed.
     - Event exists in CMS: reads `published_site_content -> content -> 'events'`.
     - Registration deadline: if `registrationDeadline` is set on the event, verifies `now() <= deadline`.
     - Capacity: if `capacity` is configured, verifies `COUNT(*) FROM public.event_registrations WHERE event_id = p_event_id AND status = 'active'` < `capacity`.
   - **State Transition**:
     - If row does not exist: inserts `status = 'active'`, `registered_at = now()`.
     - If row exists with `status = 'cancelled'`: updates `status = 'active'`, `cancelled_at = NULL`, `registered_at = now()`.
     - If row exists with `status = 'active'`: idempotent return (no duplicate active registration).
   - **Returns**: `{ ok: true, is_registered: true, registered_count: integer }`.

2. `public.unregister_event_participation(p_event_id text)`:
   - **Security**: `SECURITY DEFINER`, `SET search_path = ''`.
   - **Derives Actor**: `v_user_id := (SELECT auth.uid())`.
   - **State Transition**:
     - Sets `status = 'cancelled'`, `cancelled_at = now()` where `event_id = p_event_id AND user_id = v_user_id AND status = 'active'`.
     - If already cancelled or not registered: idempotent return.
   - **Returns**: `{ ok: true, is_registered: false, registered_count: integer }`.

---

### B. Persistent Student Suggestions: `public.student_suggestions` & `public.suggestion_responses`

```sql
CREATE TABLE IF NOT EXISTS public.student_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  student_email text,
  student_university text,
  student_major text,
  target_role text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_suggestions_target_role_check CHECK (
    target_role IN (
      'PRESIDENT', 'VICE_PRESIDENT', 'FINANCE_HEAD', 'AUDIT_HEAD',
      'MEDIA_HEAD', 'ACADEMIC_HEAD', 'ACTIVITIES_HEAD'
    )
  ),
  CONSTRAINT student_suggestions_status_check CHECK (
    status IN ('new', 'reviewing', 'implemented', 'closed')
  ),
  CONSTRAINT student_suggestions_title_length CHECK (
    char_length(btrim(title)) BETWEEN 2 AND 250
  ),
  CONSTRAINT student_suggestions_content_length CHECK (
    char_length(btrim(content)) BETWEEN 5 AND 5000
  )
);

CREATE INDEX IF NOT EXISTS student_suggestions_target_created_idx
  ON public.student_suggestions (target_role, created_at DESC);

CREATE INDEX IF NOT EXISTS student_suggestions_student_idx
  ON public.student_suggestions (student_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.suggestion_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL REFERENCES public.student_suggestions(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_role text NOT NULL,
  response_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suggestion_responses_text_length CHECK (
    char_length(btrim(response_text)) BETWEEN 1 AND 5000
  )
);

CREATE INDEX IF NOT EXISTS suggestion_responses_suggestion_created_idx
  ON public.suggestion_responses (suggestion_id, created_at ASC);
```

---

### C. Secure Analytics RPC: `public.get_admin_dashboard_metrics()`

```sql
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS TABLE (
  total_members_count integer,
  active_members_count integer,
  pending_applications_count integer,
  six_month_member_growth jsonb,
  six_month_event_participations jsonb,
  event_participation_by_id jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_is_executive boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.executive_assignments WHERE user_id = v_actor_id
  ) INTO v_is_executive;

  IF NOT v_is_executive THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only executive members may access dashboard analytics';
  END IF;

  -- 1. Total members count:
  -- Every active profile + inactive profiles with accepted application.
  -- Excludes removed, banned, unapproved applicants, and anonymous users.
  SELECT COUNT(*)::integer
  INTO total_members_count
  FROM (
    SELECT p.id FROM public.profiles AS p WHERE p.status = 'active'
    UNION
    SELECT p.id FROM public.profiles AS p
    JOIN public.student_applications AS a ON a.student_user_id = p.id
    WHERE p.status = 'inactive' AND a.status = 'accepted'
  ) AS valid_members;

  -- 2. Active members count:
  SELECT COUNT(*)::integer
  INTO active_members_count
  FROM public.profiles AS p
  WHERE p.status = 'active';

  -- 3. Pending applications count:
  SELECT COUNT(*)::integer
  INTO pending_applications_count
  FROM public.student_applications AS a
  WHERE a.status IN ('pending', 'interview');

  -- 4. Six-month member growth using authoritative student_applications.decided_at:
  -- Legacy accepted applications with NULL decided_at are excluded from historical trend
  -- without fabricating dates.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'year', m.yr,
        'month', m.mon,
        'count', COALESCE(cnt.c, 0)
      ) ORDER BY m.yr ASC, m.mon ASC
    ),
    '[]'::jsonb
  )
  INTO six_month_member_growth
  FROM (
    SELECT
      EXTRACT(YEAR FROM s)::integer AS yr,
      EXTRACT(MONTH FROM s)::integer AS mon
    FROM generate_series(
      date_trunc('month', now()) - interval '5 months',
      date_trunc('month', now()),
      interval '1 month'
    ) AS s
  ) AS m
  LEFT JOIN (
    SELECT
      EXTRACT(YEAR FROM a.decided_at)::integer AS yr,
      EXTRACT(MONTH FROM a.decided_at)::integer AS mon,
      COUNT(*)::integer AS c
    FROM public.student_applications AS a
    WHERE a.status = 'accepted'
      AND a.decided_at IS NOT NULL
    GROUP BY 1, 2
  ) AS cnt ON cnt.yr = m.yr AND cnt.mon = m.mon;

  -- 5. Six-month event registrations:
  -- Only active registrations are counted. Pre-ledger historical months report 0.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'year', m.yr,
        'month', m.mon,
        'count', COALESCE(cnt.c, 0)
      ) ORDER BY m.yr ASC, m.mon ASC
    ),
    '[]'::jsonb
  )
  INTO six_month_event_participations
  FROM (
    SELECT
      EXTRACT(YEAR FROM s)::integer AS yr,
      EXTRACT(MONTH FROM s)::integer AS mon
    FROM generate_series(
      date_trunc('month', now()) - interval '5 months',
      date_trunc('month', now()),
      interval '1 month'
    ) AS s
  ) AS m
  LEFT JOIN (
    SELECT
      EXTRACT(YEAR FROM er.registered_at)::integer AS yr,
      EXTRACT(MONTH FROM er.registered_at)::integer AS mon,
      COUNT(*)::integer AS c
    FROM public.event_registrations AS er
    WHERE er.status = 'active'
    GROUP BY 1, 2
  ) AS cnt ON cnt.yr = m.yr AND cnt.mon = m.mon;

  -- 6. Event registrations grouped by event_id for active registrations:
  SELECT COALESCE(
    jsonb_object_agg(er.event_id, er.reg_count),
    '{}'::jsonb
  )
  INTO event_participation_by_id
  FROM (
    SELECT er.event_id, COUNT(*)::integer AS reg_count
    FROM public.event_registrations AS er
    WHERE er.status = 'active'
    GROUP BY er.event_id
  ) AS er;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;
```

---

## 5. Security & Row Level Security (RLS) Model

| Table | Operation | Role | Permitted Scope / Security Rule |
|---|---|---|---|
| `public.event_registrations` | `SELECT` | `authenticated` | `user_id = (SELECT auth.uid())` (students see own records) OR caller is in `executive_assignments` (executives see active registrations). |
| `public.event_registrations` | `INSERT` / `UPDATE` / `DELETE` | `authenticated` | Direct browser table writes are revoked. All mutations must execute via `register_event_participation` or `unregister_event_participation`. |
| `public.student_suggestions` | `SELECT` | `authenticated` | Author (`student_user_id = auth.uid()`) OR `PRESIDENT` OR assigned `target_role` executive. |
| `public.student_suggestions` | `INSERT` | `authenticated` | Must be an active member: `auth.uid() = student_user_id`, `profiles.status = 'active'`, and initial `status = 'new'`. |
| `public.student_suggestions` | `UPDATE` | `authenticated` | Only `PRESIDENT` or executive holding the assigned `target_role` may update `status`. |
| `public.suggestion_responses` | `SELECT` | `authenticated` | Inherits parent suggestion visibility via `EXISTS (SELECT 1 FROM student_suggestions ...)`. |
| `public.suggestion_responses` | `INSERT` | `authenticated` | Caller must be `PRESIDENT` or executive holding target suggestion's `target_role`. |

---

## 6. Six-Month Trend & Year-Boundary Bucketing Rules

### A. Calendar Bucketing
To properly handle calendar year rollovers (such as December 2025 transitioning to January 2026), bucketing generates exact `(year, month)` keys:

```typescript
export interface MonthBucket {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  key: string;   // "YYYY-MM"
  label: string; // Arabic abbreviation e.g. "ينا", "فبر"
}

export function generateSixMonthBuckets(referenceDate: Date = new Date()): MonthBucket[] {
  const ARABIC_MONTH_LABELS = [
    'ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون',
    'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس',
  ];
  const buckets: MonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    const yr = d.getFullYear();
    const m = d.getMonth();
    buckets.push({
      year: yr,
      month: m,
      key: `${yr}-${String(m + 1).padStart(2, '0')}`,
      label: ARABIC_MONTH_LABELS[m],
    });
  }
  return buckets;
}
```

### B. Chart UI Decision: Single Responsive Dual-Series Chart
- **One chart with two distinct series**:
  1. **نمو الأعضاء المقبولين** (Accepted Member Growth): Navy `#1e3454`
  2. **تسجيلات الفعاليات** (Event Registrations): Gold `#d49a24`
- **Arabic Legend**: Clear, accessible indicator badges above the chart.
- **Mobile/Responsive**:
  - SVG viewBox scaling (`0 0 100 100`, `preserveAspectRatio="none"`).
  - Wrapper style `width: 100%`, flex containers use `min-w-0`.
  - Never forces horizontal page overflow on small screens.

---

## 7. Stat Card Navigation Decision & Interface

### A. Role-Aware Behavior
Each of the 4 stat cards adapts cleanly to caller permissions:

| Stat Card | Action for President | Action for Non-President Leadership Role |
|---|---|---|
| **إجمالي الطلاب** | Navigates to `members` tab (default view). | **Informational only**: `cursor-default`, no click handler, chevron hidden. |
| **طلاب نشطون** | Navigates to `members` tab with active filter (`status = 'active'`). | **Informational only**: `cursor-default`, no click handler, chevron hidden. |
| **فعاليات قادمة** | Navigates to `events` tab. | Navigates to `events` tab (`events` tab is visible to all leadership roles). |
| **طلبات قيد المراجعة** | Navigates to `applications` tab. | **Informational only**: `cursor-default`, no click handler, chevron hidden. |

### B. Minimal Component Interface
1. `AdminDashboard.tsx`:
   ```typescript
   const [memberStatusFilter, setMemberStatusFilter] = useState<'all' | 'active'>('all');

   const handleStatCardNavigate = (targetTab: AdminTab, filter?: { status?: 'all' | 'active' }) => {
     if (filter?.status) setMemberStatusFilter(filter.status);
     setTab(targetTab);
   };
   ```
2. `StatsTab`:
   - Accepts `onNavigate?: (tab: AdminTab, filter?: { status?: 'all' | 'active' }) => void`.
   - Card button checks if target tab is accessible to `currentUser?.role`. If not, renders non-interactive `<div>` with `cursor-default`.
3. `MembersTab`:
   - Accepts `initialStatusFilter?: 'all' | 'active'`.
   - Initializes table filter with `initialStatusFilter`, allowing instant filtering of active members when arriving from "طلاب نشطون".

---

## 8. Realtime & Freshness Strategy

1. **Published Events**: Reuses existing Supabase Realtime channel `'published-site-content:main'`. Event additions, deletions, or category changes update distribution immediately.
2. **Contact Messages**: Reuses existing Realtime channel from `contactMessagingRepository.ts`.
3. **Event Registrations & Suggestions**:
   - Explicit refresh after local mutations (`register`, `unregister`, `submitSuggestion`, `replySuggestion`).
   - Dedicated Realtime subscription for admin analytics: `channel('admin-dashboard-stats')` listening to table changes on `event_registrations`, `student_suggestions`, and `suggestion_responses`.
   - Debounced refresh (300ms) prevents thrashing during multi-registration bursts.

---

## 9. Migration & Backfill Policy

- **No Remote Database Alteration During Planning/Implementation**: Migrations are written locally in `supabase/migrations/` and validated through automated unit and contract tests. Remote application requires explicit human command.
- **Historical Migrations Untouched**: Only new forward migrations are added.
- **Zero Fabrication Backfill Policy**:
  - `event_registrations` starts empty upon migration deployment.
  - Previous months report `0` event participations.
  - `student_applications.decided_at` is used as-is. Applications missing `decided_at` are counted in total members but never retroactively backfilled with fake dates.

---

## 10. Risks and Rollback Strategy

| Risk | Impact | Mitigation Strategy | Rollback Plan |
|---|---|---|---|
| Non-president executive denied stats by table RLS | High | The secure RPC `get_admin_dashboard_metrics()` uses `SECURITY DEFINER` and checks `private.is_current_executive()`. | Fall back to view-based aggregates if RPC execution fails. |
| Event deleted from CMS while registrations exist | Medium | Registrations store `event_id`. Registrations remain safely in the ledger; analytics gracefully maps unknown IDs to an 'other' bucket without crashing. | Retain ledger rows; display as unassigned. |
| Event capacity race condition | Low | Registration RPC performs atomic count check inside PostgreSQL transaction with row-level advisory lock on `event_id`. | Standard retry logic on lock contention. |
