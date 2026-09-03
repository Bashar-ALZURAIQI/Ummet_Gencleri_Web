import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateSixMonthBuckets,
  calculateMemberGrowthSeries,
  calculateEventParticipationSeries,
  calculateTotalMembersCount,
  calculateActiveMembersCount,
  calculateCategoryDistribution,
  calculateParticipationByCategory,
} from '../src/domain/dashboardAnalytics.ts';

test('generateSixMonthBuckets creates 6 sequential calendar buckets across year boundaries', () => {
  // Reference date: March 15, 2026 -> months should be Oct 2025, Nov 2025, Dec 2025, Jan 2026, Feb 2026, Mar 2026
  const refDate = new Date(2026, 2, 15); // Note: month index 2 is March
  const buckets = generateSixMonthBuckets(refDate);

  assert.equal(buckets.length, 6);
  assert.deepEqual(buckets.map((b) => b.key), [
    '2025-10',
    '2025-11',
    '2025-12',
    '2026-01',
    '2026-02',
    '2026-03',
  ]);
  assert.deepEqual(buckets.map((b) => b.label), [
    'أكت',
    'نوف',
    'ديس',
    'ينا',
    'فبر',
    'مار',
  ]);
  assert.deepEqual(buckets.map((b) => ({ year: b.year, month: b.month })), [
    { year: 2025, month: 9 },
    { year: 2025, month: 10 },
    { year: 2025, month: 11 },
    { year: 2026, month: 0 },
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
  ]);
});

test('calculateMemberGrowthSeries groups accepted applications by decided_at and excludes null dates without fabrication', () => {
  const buckets = generateSixMonthBuckets(new Date(2026, 2, 15));

  const applications = [
    // Dec 2025 accepted
    { id: 'a1', status: 'accepted', decidedAt: '2025-12-10T10:00:00Z' },
    { id: 'a2', status: 'accepted', decidedAt: '2025-12-28' },
    // Jan 2026 accepted
    { id: 'a3', status: 'accepted', decidedAt: '2026-01-05T12:00:00Z' },
    // Mar 2026 accepted
    { id: 'a4', status: 'accepted', decidedAt: '2026-03-01' },
    // Rejected or pending should NOT count
    { id: 'a5', status: 'rejected', decidedAt: '2026-03-02' },
    { id: 'a6', status: 'pending', decidedAt: null },
    { id: 'a7', status: 'interview', decidedAt: null },
    // Accepted application with null decidedAt must NOT be assigned a fake month
    { id: 'a8', status: 'accepted', decidedAt: null },
    { id: 'a9', status: 'accepted', decidedAt: undefined },
    // Outside 6-month window (Aug 2025)
    { id: 'a10', status: 'accepted', decidedAt: '2025-08-15' },
  ];

  const series = calculateMemberGrowthSeries(applications, buckets);

  assert.deepEqual(series, [
    { label: 'أكت', value: 0 },
    { label: 'نوف', value: 0 },
    { label: 'ديس', value: 2 },
    { label: 'ينا', value: 1 },
    { label: 'فبر', value: 0 },
    { label: 'مار', value: 1 },
  ]);
});

test('calculateEventParticipationSeries counts genuine registration cycles by registered_at and preserves history if cancelled', () => {
  const buckets = generateSixMonthBuckets(new Date(2026, 2, 15));

  const registrations = [
    // Oct 2025 active
    { eventId: 'e1', userId: 'u1', status: 'active', registeredAt: '2025-10-12T08:00:00Z' },
    // Dec 2025 active
    { eventId: 'e1', userId: 'u2', status: 'active', registeredAt: '2025-12-15T09:00:00Z' },
    { eventId: 'e2', userId: 'u3', status: 'active', registeredAt: '2025-12-20T10:00:00Z' },
    // Jan 2026 active
    { eventId: 'e3', userId: 'u1', status: 'active', registeredAt: '2026-01-14T11:00:00Z' },
    // Jan 2026 registration cycle that was later cancelled in Feb/March (MUST still count as a Jan registration event)
    { eventId: 'e3', userId: 'u2', status: 'cancelled', registeredAt: '2026-01-15T12:00:00Z' },
    // Pre-ledger historical months (e.g. empty Nov, Feb) stay 0 without fabrication
  ];

  const series = calculateEventParticipationSeries(registrations, buckets);

  assert.deepEqual(series, [
    { label: 'أكت', value: 1 },
    { label: 'نوف', value: 0 },
    { label: 'ديس', value: 2 },
    { label: 'ينا', value: 2 }, // u1 + u2 genuine registration cycles
    { label: 'فبر', value: 0 },
    { label: 'مار', value: 0 },
  ]);
});

test('calculateTotalMembersCount enforces deduplicated active profiles plus accepted inactive profiles, excluding unapproved/removed/banned', () => {
  const profiles = [
    // Active profiles with accepted application
    { id: 'p1', status: 'active' },
    { id: 'p2', status: 'active' },
    // Active profile WITHOUT an application (e.g. bootstrapped executive)
    { id: 'p3', status: 'active' },
    // Inactive profile WITH accepted application (e.g. dormant admitted member)
    { id: 'p4', status: 'inactive' },
    // Inactive profile with pending application (MUST be excluded)
    { id: 'p5', status: 'inactive' },
    // Inactive profile with rejected application (MUST be excluded)
    { id: 'p6', status: 'inactive' },
    // Inactive profile with NO application (MUST be excluded)
    { id: 'p7', status: 'inactive' },
    // Removed profile with accepted application (MUST be excluded)
    { id: 'p8', status: 'removed' },
    // Banned profile (MUST be excluded)
    { id: 'p9', status: 'banned' },
  ];

  const applications = [
    { studentUserId: 'p1', status: 'accepted' },
    { studentUserId: 'p2', status: 'accepted' },
    // p3 has no application
    { studentUserId: 'p4', status: 'accepted' },
    { studentUserId: 'p5', status: 'pending' },
    { studentUserId: 'p6', status: 'rejected' },
    { studentUserId: 'p8', status: 'accepted' },
    { studentUserId: 'p9', status: 'accepted' },
  ];

  // Total members: p1, p2, p3 (active) + p4 (inactive accepted) = 4
  const total = calculateTotalMembersCount(profiles, applications);
  assert.equal(total, 4);

  // Active members: p1, p2, p3 = 3
  const active = calculateActiveMembersCount(profiles);
  assert.equal(active, 3);
});

test('calculateTotalMembersCount prevents duplicate counting when an active profile also matches accepted application', () => {
  const profiles = [
    { id: 'p1', status: 'active' },
  ];
  const applications = [
    { studentUserId: 'p1', status: 'accepted' },
    { studentUserId: 'p1', status: 'accepted' }, // duplicate application records
  ];

  assert.equal(calculateTotalMembersCount(profiles, applications), 1);
});

test('calculateCategoryDistribution counts published events by category and drops empty categories', () => {
  const events = [
    { id: 'e1', title: 'ورشة عمل 1', category: 'workshop', status: 'upcoming' },
    { id: 'e2', title: 'ورشة عمل 2', category: 'workshop', status: 'past' },
    { id: 'e3', title: 'محاضرة ثقافية', category: 'lecture', status: 'upcoming' },
    { id: 'e4', title: 'نشاط ترفيهي', category: 'entertainment', status: 'upcoming' },
  ];

  const dist = calculateCategoryDistribution(events);

  assert.deepEqual(dist, [
    { label: 'ورشة عمل', value: 2, color: '#1e3454' },
    { label: 'محاضرة', value: 1, color: '#d49a24' },
    { label: 'ترفيهي', value: 1, color: '#8b5cf6' },
  ]);
  // Empty categories like 'volunteer', 'training', 'trip', 'visit' are not in the list
  assert.equal(dist.some((d) => d.label === 'عمل تطوعي'), false);
});

test('calculateParticipationByCategory sums active event registrations by current published event category', () => {
  const events = [
    { id: 'e1', title: 'ورشة 1', category: 'workshop' },
    { id: 'e2', title: 'ورشة 2', category: 'workshop' },
    { id: 'e3', title: 'محاضرة 1', category: 'lecture' },
    { id: 'e4', title: 'نشاط تطوعي', category: 'volunteer' },
  ];

  // Active registrations counts by event ID
  const activeRegistrationsByEventId = {
    e1: 15,
    e2: 5,
    e3: 40,
    // e4 has 0 registrations
    // e99 is a deleted/stale event registration ID
    e99: 10,
  };

  const participation = calculateParticipationByCategory(events, activeRegistrationsByEventId);

  // Workshop: 15 + 5 = 20
  // Lecture: 40
  // Volunteer: 0 (filtered out because sum is 0)
  assert.deepEqual(participation, [
    { category: 'workshop', label: 'ورشة عمل', value: 20, color: '#1e3454' },
    { category: 'lecture', label: 'محاضرة', value: 40, color: '#d49a24' },
  ]);
});
