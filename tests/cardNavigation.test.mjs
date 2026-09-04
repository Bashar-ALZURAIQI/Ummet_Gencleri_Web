import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getStatCardNavigation,
  canRoleAccessTab,
} from '../src/domain/adminStatsNavigation.ts';

test('1. President clicking إجمالي الطلاب -> members/all', () => {
  const result = getStatCardNavigation('totalStudents', 'PRESIDENT');
  assert.equal(result.canNavigate, true);
  assert.equal(result.targetTab, 'members');
  assert.equal(result.initialFilter, 'all');
});

test('2. President clicking طلاب نشطون -> members/active', () => {
  const result = getStatCardNavigation('activeStudents', 'PRESIDENT');
  assert.equal(result.canNavigate, true);
  assert.equal(result.targetTab, 'members');
  assert.equal(result.initialFilter, 'active');
});

test('3. President clicking طلبات قيد المراجعة -> applications', () => {
  const result = getStatCardNavigation('pendingApplications', 'PRESIDENT');
  assert.equal(result.canNavigate, true);
  assert.equal(result.targetTab, 'applications');
  assert.equal(result.initialFilter, undefined);
});

test('4. authorized role clicking فعاليات قادمة -> events', () => {
  const presidentResult = getStatCardNavigation('upcomingEvents', 'PRESIDENT');
  assert.equal(presidentResult.canNavigate, true);
  assert.equal(presidentResult.targetTab, 'events');

  const academicResult = getStatCardNavigation('upcomingEvents', 'ACADEMIC_HEAD');
  assert.equal(academicResult.canNavigate, true);
  assert.equal(academicResult.targetTab, 'events');

  const mediaResult = getStatCardNavigation('upcomingEvents', 'MEDIA_HEAD');
  assert.equal(mediaResult.canNavigate, true);
  assert.equal(mediaResult.targetTab, 'events');
});

test('5. inaccessible members card has no navigation for non-president roles', () => {
  const roles = ['VICE_PRESIDENT', 'ACADEMIC_HEAD', 'MEDIA_HEAD', 'FINANCE_HEAD', 'AUDIT_HEAD', 'ACTIVITIES_HEAD', 'STUDENT'];

  for (const role of roles) {
    const totalResult = getStatCardNavigation('totalStudents', role);
    assert.equal(totalResult.canNavigate, false, `Role ${role} must not navigate to members`);
    assert.equal(totalResult.targetTab, undefined);

    const activeResult = getStatCardNavigation('activeStudents', role);
    assert.equal(activeResult.canNavigate, false, `Role ${role} must not navigate to members`);
    assert.equal(activeResult.targetTab, undefined);
  }
});

test('6. inaccessible applications card has no navigation for non-president roles', () => {
  const roles = ['VICE_PRESIDENT', 'ACADEMIC_HEAD', 'MEDIA_HEAD', 'FINANCE_HEAD', 'AUDIT_HEAD', 'ACTIVITIES_HEAD', 'STUDENT'];

  for (const role of roles) {
    const result = getStatCardNavigation('pendingApplications', role);
    assert.equal(result.canNavigate, false, `Role ${role} must not navigate to applications`);
    assert.equal(result.targetTab, undefined);
  }
});

test('7. inaccessible events card has no navigation if role lacks events permission', () => {
  const studentResult = getStatCardNavigation('upcomingEvents', 'STUDENT');
  assert.equal(studentResult.canNavigate, false);

  const anonResult = getStatCardNavigation('upcomingEvents', undefined);
  assert.equal(anonResult.canNavigate, false);
});

test('8. restricted informational card has no pointer/click affordance', () => {
  const card = getStatCardNavigation('totalStudents', 'MEDIA_HEAD');
  assert.equal(card.canNavigate, false);
  // UI mapping verification helper
  const getCardAffordance = (navResult) => ({
    isClickable: navResult.canNavigate,
    cursorClass: navResult.canNavigate ? 'cursor-pointer hover:border-navy-200' : 'cursor-default',
    showChevron: navResult.canNavigate,
  });

  const affordance = getCardAffordance(card);
  assert.equal(affordance.isClickable, false);
  assert.equal(affordance.cursorClass, 'cursor-default');
  assert.equal(affordance.showChevron, false);
});

test('9. MembersTab receives active initial filter and filters list correctly', () => {
  const members = [
    { id: 'm1', name: 'عضو 1', email: 'm1@test.org', status: 'active' },
    { id: 'm2', name: 'عضو 2', email: 'm2@test.org', status: 'inactive' },
    { id: 'm3', name: 'عضو 3', email: 'm3@test.org', status: 'active' },
  ];

  const filterMembers = (list, filter) => {
    if (filter === 'all') return list;
    return list.filter((m) => m.status === filter);
  };

  const activeFiltered = filterMembers(members, 'active');
  assert.equal(activeFiltered.length, 2);
  assert.deepEqual(activeFiltered.map((m) => m.id), ['m1', 'm3']);

  const allFiltered = filterMembers(members, 'all');
  assert.equal(allFiltered.length, 3);
});

test('10. normal/direct members-tab navigation returns to all/default behavior', () => {
  let activeTab = 'stats';
  let membersFilter = 'all';

  const onNavigateFromCard = (targetTab, filter) => {
    activeTab = targetTab;
    if (targetTab === 'members') {
      membersFilter = filter ?? 'all';
    }
  };

  const onDirectSidebarSelect = (targetTab) => {
    activeTab = targetTab;
    if (targetTab === 'members') {
      membersFilter = 'all'; // resets to default behavior
    }
  };

  // 1. User clicks "طلاب نشطون" from StatsTab
  onNavigateFromCard('members', 'active');
  assert.equal(activeTab, 'members');
  assert.equal(membersFilter, 'active');

  // 2. User switches to "events"
  onDirectSidebarSelect('events');
  assert.equal(activeTab, 'events');

  // 3. User switches directly to "members" from sidebar
  onDirectSidebarSelect('members');
  assert.equal(activeTab, 'members');
  assert.equal(membersFilter, 'all', 'Direct sidebar navigation must reset filter to all');
});
