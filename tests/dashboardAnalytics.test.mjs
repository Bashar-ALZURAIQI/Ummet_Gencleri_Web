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
  deriveParticipationByCategory,
  alignMonthlyCountPointsToBuckets,
  deriveAuthoritativeMemberGrowthSeries,
  deriveAuthoritativeEventParticipationSeries,
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

test('Task 5: two events in same category sum correctly', () => {
  const events = [
    { id: 'E1', category: 'workshop' },
    { id: 'E2', category: 'workshop' },
  ];
  const map = { E1: 4, E2: 3 };
  const res = calculateParticipationByCategory(events, map);
  assert.equal(res.length, 1);
  assert.equal(res[0].category, 'workshop');
  assert.equal(res[0].value, 7);
});

test('Task 5: multiple categories remain separate', () => {
  const events = [
    { id: 'E1', category: 'workshop' },
    { id: 'E2', category: 'workshop' },
    { id: 'E3', category: 'lecture' },
  ];
  const map = { E1: 4, E2: 3, E3: 5 };
  const res = calculateParticipationByCategory(events, map);
  const byCat = Object.fromEntries(res.map((r) => [r.category, r.value]));
  assert.equal(byCat.workshop, 7);
  assert.equal(byCat.lecture, 5);
  assert.equal(res.length, 2);
});

test('Task 5: event with zero registrations contributes zero', () => {
  const events = [
    { id: 'E1', category: 'workshop' },
    { id: 'E2', category: 'workshop' },
  ];
  const map = { E1: 4, E2: 0 };
  const res = calculateParticipationByCategory(events, map);
  assert.equal(res.length, 1);
  assert.equal(res[0].value, 4);
});

test('Task 5: missing event ID in eventParticipationById behaves as zero', () => {
  const events = [
    { id: 'E1', category: 'workshop' },
    { id: 'E2', category: 'workshop' }, // not in map
  ];
  const map = { E1: 4 };
  const res = calculateParticipationByCategory(events, map);
  assert.equal(res.length, 1);
  assert.equal(res[0].value, 4);
});

test('Task 5: unknown/deleted registration event IDs are ignored and do not leak into categories', () => {
  const events = [
    { id: 'E1', category: 'workshop' },
  ];
  const map = {
    E1: 4,
    deleted_event_123: 9,
    unknown_event_456: 99,
  };
  const res = calculateParticipationByCategory(events, map);
  assert.equal(res.length, 1);
  assert.equal(res[0].category, 'workshop');
  assert.equal(res[0].value, 4);
});

test('Task 5: no use of UEvent.registered as authoritative input', () => {
  const events = [
    { id: 'E1', category: 'workshop', registered: 999 }, // deceptive local registered count
  ];
  const map = { E1: 4 };
  const res = calculateParticipationByCategory(events, map);
  assert.equal(res[0].value, 4);
  assert.notEqual(res[0].value, 999);
});

test('Task 5: event distribution remains event-count based and is not accidentally replaced by registration counts', () => {
  const events = [
    { id: 'E1', category: 'workshop', registered: 100 },
    { id: 'E2', category: 'workshop', registered: 200 },
  ];
  const dist = calculateCategoryDistribution(events);
  assert.equal(dist.length, 1);
  assert.equal(dist[0].label, 'ورشة عمل');
  assert.equal(dist[0].value, 2); // 2 events, NOT 300
});

test('Task 5: participation calculation does not mutate input data', () => {
  const events = Object.freeze([
    Object.freeze({ id: 'E1', category: 'workshop' }),
    Object.freeze({ id: 'E2', category: 'lecture' }),
  ]);
  const map = Object.freeze({ E1: 4, E2: 5 });
  const res = calculateParticipationByCategory(events, map);
  assert.equal(res.length, 2);
});

test('Task 5: empty events produces safe empty/zero result', () => {
  const events = [];
  const map = { E1: 4 };
  const res = calculateParticipationByCategory(events, map);
  assert.deepEqual(res, []);

  const resWithZero = calculateParticipationByCategory(events, map, { includeZero: true });
  assert.equal(resWithZero.length, 7);
  assert.ok(resWithZero.every((r) => r.value === 0));
});

test('Task 5: empty participation map produces safe result', () => {
  const events = [
    { id: 'E1', category: 'workshop' },
    { id: 'E2', category: 'lecture' },
  ];
  const res = calculateParticipationByCategory(events, {});
  assert.deepEqual(res, []);

  const resWithZero = calculateParticipationByCategory(events, {}, { includeZero: true });
  assert.equal(resWithZero.length, 7);
  assert.ok(resWithZero.every((r) => r.value === 0));
});

test('Task 5: zero participation preserves existing category structure when includeZero is requested', () => {
  const events = [
    { id: 'E1', category: 'workshop' },
  ];
  const map = { E1: 10 };
  const res = calculateParticipationByCategory(events, map, { includeZero: true });
  assert.equal(res.length, 7);
  const byCat = Object.fromEntries(res.map((r) => [r.category, r.value]));
  assert.equal(byCat.workshop, 10);
  assert.equal(byCat.lecture, 0);
  assert.equal(byCat.volunteer, 0);
  assert.equal(byCat.training, 0);
  assert.equal(byCat.trip, 0);
  assert.equal(byCat.entertainment, 0);
  assert.equal(byCat.visit, 0);
});

test('Task 5: deriveParticipationByCategory adapts metrics gateway payload with safe fallback for null/undefined', () => {
  const events = [
    { id: 'E1', category: 'workshop' },
    { id: 'E2', category: 'lecture' },
  ];
  const metrics = {
    totalMembersCount: 100,
    activeMembersCount: 90,
    pendingApplicationsCount: 5,
    sixMonthMemberGrowth: [],
    sixMonthEventParticipations: [],
    eventParticipationById: { E1: 12, E2: 8 },
  };

  const res = deriveParticipationByCategory(events, metrics, { includeZero: false });
  assert.deepEqual(res.map((r) => ({ cat: r.category, val: r.value })), [
    { cat: 'workshop', val: 12 },
    { cat: 'lecture', val: 8 },
  ]);

  // Safe fallback when metrics is null or undefined
  const nullRes = deriveParticipationByCategory(events, null, { includeZero: false });
  assert.deepEqual(nullRes, []);
});

test('Task 5: alignMonthlyCountPointsToBuckets aligns RPC monthly points to six month buckets', () => {
  const buckets = generateSixMonthBuckets(new Date(2026, 2, 15)); // Oct 2025 .. Mar 2026
  const points = [
    { year: 2025, month: 12, count: 5 },
    { year: 2026, month: 1, count: 12 },
  ];

  const series = alignMonthlyCountPointsToBuckets(points, buckets);
  assert.deepEqual(series, [
    { label: 'أكت', value: 0 },
    { label: 'نوف', value: 0 },
    { label: 'ديس', value: 5 },
    { label: 'ينا', value: 12 },
    { label: 'فبر', value: 0 },
    { label: 'مار', value: 0 },
  ]);

  const memberGrowth = deriveAuthoritativeMemberGrowthSeries({ sixMonthMemberGrowth: points }, buckets);
  assert.deepEqual(memberGrowth, series);

  const eventParticipation = deriveAuthoritativeEventParticipationSeries({ sixMonthEventParticipations: points }, buckets);
  assert.deepEqual(eventParticipation, series);
});
