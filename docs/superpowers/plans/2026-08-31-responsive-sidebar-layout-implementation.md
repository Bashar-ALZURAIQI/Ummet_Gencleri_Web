# Responsive Sidebar Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** استبدال التبويبات الأفقية في بوابة الطالب ولوحة الإدارة بشريط جانبي RTL متجاوب دون تغيير محتوى الأقسام أو شروط صلاحياتها.

**Architecture:** مكوّن `SidebarLayout` عرضي بالكامل يستقبل عناصر التنقل والحالة النشطة من الصفحة المالكة. يعرض عموداً sticky على سطح المكتب وDrawer من اليمين على الجوال، بينما تبقى مصفوفات التبويبات والحراس والعرض الشرطي الحالي في الصفحتين كمصدر الحقيقة.

**Tech Stack:** React 18، TypeScript، Tailwind CSS، Lucide React، Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-31-brand-identity-sidebar-layout-design.md`

## Global Constraints

- RTL: الشريط على اليمين والـDrawer يفتح من اليمين.
- سطح المكتب يبدأ من breakpoint `lg`؛ الجوال يستخدم زر قائمة وbackdrop.
- لا يمتلك `SidebarLayout` أي معرفة بالأدوار أو Supabase أو بيانات الأقسام.
- تبقى `StudentPortalTabId` و`AdminTab` وشروط `show` والحراس الحالية دون تغيير وظيفي.
- لا يُحذف أو يُعاد بناء أي مكوّن محتوى داخلي.
- يجب دعم Escape، الإغلاق بعد الاختيار، ARIA، ومنع تمرير الخلفية أثناء فتح Drawer.

---

### Task 1: Reusable `SidebarLayout`

**Files:**
- Create: `src/components/SidebarLayout.tsx`
- Create: `src/domain/sidebarNavigation.ts`
- Create: `tests/sidebarNavigation.test.mjs`
- Create: `tests/sidebarLayoutIntegration.test.mjs`

**Interfaces:**
- Consumes: React icon components and page-owned active tab state.
- Produces: `SidebarItem<TId>` and `SidebarLayout<TId>`.

- [ ] **Step 1: Write failing navigation-state tests**

In `tests/sidebarNavigation.test.mjs`, define expected behavior for pure helpers:

```js
assert.deepEqual(sidebar.closeSidebar({ open: true }), { open: false });
assert.deepEqual(sidebar.toggleSidebar({ open: false }), { open: true });
assert.equal(sidebar.shouldCloseSidebarForKey('Escape'), true);
assert.equal(sidebar.shouldCloseSidebarForKey('Enter'), false);
```

In `tests/sidebarLayoutIntegration.test.mjs`, assert the component contains `aria-expanded`, `aria-controls`, `role="dialog"`, an Escape listener, `document.body.style.overflow`, `lg:hidden`, `hidden lg:block`, `sticky`, and invokes `onSelect(item.id)` before closing.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test tests/sidebarNavigation.test.mjs tests/sidebarLayoutIntegration.test.mjs`

Expected: FAIL because the helper and component do not exist.

- [ ] **Step 3: Implement pure navigation helpers**

Create:

```ts
export interface SidebarDrawerState { open: boolean }
export const toggleSidebar = (state: SidebarDrawerState): SidebarDrawerState => ({ open: !state.open });
export const closeSidebar = (): SidebarDrawerState => ({ open: false });
export const shouldCloseSidebarForKey = (key: string): boolean => key === 'Escape';
```

Keep the helpers UI-only and dependency-free.

- [ ] **Step 4: Implement the generic component**

Use these public types:

```ts
export interface SidebarItem<TId extends string> {
  id: TId;
  label: string;
  icon: LucideIcon;
}

export interface SidebarLayoutProps<TId extends string> {
  items: SidebarItem<TId>[];
  activeId: TId;
  onSelect: (id: TId) => void;
  title?: string;
  children: ReactNode;
}
```

Desktop layout uses `lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]`, sidebar `sticky top-24`, and content `min-w-0`. Mobile uses a `Menu` button, right-side fixed drawer, backdrop button, Escape listener, and body overflow restoration in cleanup. Selecting an item calls `onSelect` then closes the drawer.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `node --test tests/sidebarNavigation.test.mjs tests/sidebarLayoutIntegration.test.mjs`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the shared layout**

```bash
git add src/components/SidebarLayout.tsx src/domain/sidebarNavigation.ts tests/sidebarNavigation.test.mjs tests/sidebarLayoutIntegration.test.mjs
git commit -m "feat: add responsive rtl sidebar layout"
```

---

### Task 2: Admin Dashboard Integration and Branding Tab

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`
- Modify: `tests/sidebarLayoutIntegration.test.mjs`
- Modify: `tests/siteBrandingUiIntegration.test.mjs`

**Interfaces:**
- Consumes: `SidebarLayout<AdminTab>`, `SiteBrandingPanel`.
- Produces: admin navigation containing the existing visible tabs plus president-only `branding`.

- [ ] **Step 1: Add failing admin integration assertions**

Assert:

```js
assert.match(admin, /type AdminTab =[\s\S]*'branding'/);
assert.match(admin, /id: 'branding', label: 'هوية المنصة'/);
assert.match(admin, /show: currentUser\?\.role === 'PRESIDENT'/);
assert.match(admin, /<SidebarLayout/);
assert.match(admin, /items=\{visibleTabs\}/);
assert.match(admin, /tab === 'branding'[\s\S]*<SiteBrandingPanel/);
assert.doesNotMatch(admin, /overflow-x-auto[\s\S]{0,300}visibleTabs\.map/);
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test tests/sidebarLayoutIntegration.test.mjs tests/siteBrandingUiIntegration.test.mjs`

Expected: FAIL because AdminDashboard still renders horizontal tabs and has no branding tab.

- [ ] **Step 3: Replace only the admin navigation shell**

Add `'branding'` to `AdminTab` and a tab item using a Lucide image/palette icon with `show: currentUser?.role === 'PRESIDENT'`. Keep `visibleTabs`, the existing invalid-tab effect, and every existing content permission guard.

Wrap the complete current conditional content area:

```tsx
<SidebarLayout
  items={visibleTabs}
  activeId={tab}
  onSelect={setTab}
  title="أقسام الإدارة"
>
  {existingConditionalContent}
  {tab === 'branding' && currentUser?.role === 'PRESIDENT' && <SiteBrandingPanel />}
</SidebarLayout>
```

Remove only the old horizontal tab button block.

- [ ] **Step 4: Run admin integration and existing role tests**

Run: `node --test tests/sidebarLayoutIntegration.test.mjs tests/siteBrandingUiIntegration.test.mjs tests/taskManagementAuthorization.test.mjs tests/phaseThreeEconomy.test.mjs tests/guideSuggestionUiIntegration.test.mjs`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the admin integration**

```bash
git add src/pages/AdminDashboard.tsx tests/sidebarLayoutIntegration.test.mjs tests/siteBrandingUiIntegration.test.mjs
git commit -m "feat: move admin navigation to sidebar"
```

---

### Task 3: Student Dashboard Integration

**Files:**
- Modify: `src/pages/StudentDashboard.tsx`
- Modify: `tests/sidebarLayoutIntegration.test.mjs`
- Modify: `tests/profileSettingsIntegration.test.mjs` only if its source assertions need narrower patterns after wrapping; never weaken behavior assertions.

**Interfaces:**
- Consumes: `SidebarLayout<StudentPortalTabId>`, `studentPortalTabs(...)`, `STUDENT_TAB_ICONS`.
- Produces: student navigation with the exact existing tab availability and content.

- [ ] **Step 1: Add failing student integration assertions**

Assert:

```js
assert.match(student, /<SidebarLayout/);
assert.match(student, /studentPortalTabs\(!!myApplication\)/);
assert.match(student, /STUDENT_TAB_ICONS/);
assert.match(student, /activeId=\{tab\}/);
assert.match(student, /onSelect=\{setTab\}/);
assert.doesNotMatch(student, /overflow-x-auto[\s\S]{0,300}studentPortalTabs/);
```

Also retain source assertions for the six content branches: activities, tasks, achievements, suggestions, messages, and application.

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test tests/sidebarLayoutIntegration.test.mjs`

Expected: FAIL because StudentDashboard still renders its horizontal tab strip.

- [ ] **Step 3: Replace only the accepted-student navigation shell**

Map the existing options once:

```ts
const studentTabs = studentPortalTabs(!!myApplication).map((item) => ({
  ...item,
  icon: STUDENT_TAB_ICONS[item.id],
}));
```

Wrap the current accepted-student content conditionals in `SidebarLayout`. Do not move the early return screens for loading, removed, pending, interview, or rejected users into the sidebar. Preserve profile controls, push notification controls, accepted welcome dismissal, and all current forms.

- [ ] **Step 4: Run student integration and access tests**

Run: `node --test tests/sidebarLayoutIntegration.test.mjs tests/studentAccess.test.mjs tests/profileSettingsIntegration.test.mjs tests/acceptedStudentPushState.test.mjs tests/welcomeMessageDismissal.test.mjs`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the student integration**

```bash
git add src/pages/StudentDashboard.tsx tests/sidebarLayoutIntegration.test.mjs
git commit -m "feat: move student portal navigation to sidebar"
```

---

### Task 4: Full Regression and Responsive Verification

**Files:**
- Modify: `src/components/SidebarLayout.tsx` only for verified accessibility/responsive defects.
- Modify: `tests/sidebarLayoutIntegration.test.mjs` only to capture a reproduced defect before fixing it.

**Interfaces:**
- Consumes: completed branding and sidebar plans.
- Produces: verified production build and responsive behavior.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 2: Verify desktop behavior in the local app**

Run the Vite development server and inspect both dashboards at a desktop viewport. Confirm the sidebar is on the right, remains sticky below Navbar, highlights the active item, preserves every visible role-gated item, and the content column does not overflow.

- [ ] **Step 3: Verify mobile behavior**

At a mobile viewport, confirm the fixed sidebar is absent, the hamburger announces expanded state, the drawer opens from the right, the backdrop and Escape close it, selecting an item closes it, and body scrolling is restored after close/unmount.

- [ ] **Step 4: Verify unchanged data behavior**

Navigate through student activities/tasks/points and admin excuses/oversight/tasks/member points. Confirm the same existing components load, their Supabase calls still run, and changing tabs does not reset or mutate backend state.

- [ ] **Step 5: Record final verification evidence**

Capture the exact passing command outputs and note the tested desktop/mobile viewport widths in the completion report. Do not claim completion if any suite or required manual path is unverified.

- [ ] **Step 6: Commit verified fixes if Step 2–4 exposed any issue**

```bash
git add src/components/SidebarLayout.tsx tests/sidebarLayoutIntegration.test.mjs
git commit -m "fix: harden responsive sidebar behavior"
```
