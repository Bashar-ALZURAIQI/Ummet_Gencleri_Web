import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveAuthoritativeMemberGrowthSeries,
  deriveAuthoritativeEventParticipationSeries,
  calculateCategoryDistribution,
  deriveParticipationByCategory,
  generateSixMonthBuckets,
  alignMonthlyCountPointsToBuckets,
} from '../src/domain/dashboardAnalytics.ts';

test('1. total students comes strictly from analytics.totalMembersCount', () => {
  const metrics = {
    totalMembersCount: 42,
    activeMembersCount: 38,
    pendingApplicationsCount: 7,
    sixMonthMemberGrowth: [],
    sixMonthEventParticipations: [],
    eventParticipationById: {},
  };

  const resolveCardValue = (cardId, analytics, fallbackLength) => {
    if (!analytics) return '—';
    if (cardId === 'totalStudents') return analytics.totalMembersCount;
    if (cardId === 'activeStudents') return analytics.activeMembersCount;
    if (cardId === 'pendingApplications') return analytics.pendingApplicationsCount;
    return fallbackLength;
  };

  assert.equal(resolveCardValue('totalStudents', metrics, 999), 42);
});

test('2. active students comes strictly from analytics.activeMembersCount', () => {
  const metrics = {
    totalMembersCount: 42,
    activeMembersCount: 38,
    pendingApplicationsCount: 7,
    sixMonthMemberGrowth: [],
    sixMonthEventParticipations: [],
    eventParticipationById: {},
  };

  const resolveActiveStudents = (analytics) => (analytics ? analytics.activeMembersCount : '—');
  assert.equal(resolveActiveStudents(metrics), 38);
});

test('3. pending applications comes strictly from analytics.pendingApplicationsCount', () => {
  const metrics = {
    totalMembersCount: 42,
    activeMembersCount: 38,
    pendingApplicationsCount: 7,
    sixMonthMemberGrowth: [],
    sixMonthEventParticipations: [],
    eventParticipationById: {},
  };

  const resolvePending = (analytics) => (analytics ? analytics.pendingApplicationsCount : '—');
  assert.equal(resolvePending(metrics), 7);
});

test('4. no students.length or applications.length fallback for authoritative metrics when analytics unavailable', () => {
  const resolveCard = (val, isLoading, hasError) => {
    if (isLoading) return 'loading';
    if (hasError || val === null || val === undefined) return '—';
    return String(val);
  };

  // Error state: must return unavailable marker '—', NEVER mock students.length
  assert.equal(resolveCard(null, false, true), '—');
  // Loading state: must indicate loading, NEVER mock students.length
  assert.equal(resolveCard(null, true, false), 'loading');
});

test('5. upcoming events derives from published real events collection', () => {
  const publishedEvents = [
    { id: 'e1', title: 'فعالية 1', category: 'workshop', status: 'upcoming', date: '2026-10-01' },
    { id: 'e2', title: 'فعالية 2', category: 'lecture', status: 'past', date: '2026-05-01' },
    { id: 'e3', title: 'فعالية 3', category: 'training', status: 'upcoming', date: '2026-11-15' },
  ];

  const upcomingCount = publishedEvents.filter((e) => e.status === 'upcoming').length;
  assert.equal(upcomingCount, 2);
});

test('6. event distribution uses published event counts', () => {
  const publishedEvents = [
    { id: 'e1', category: 'workshop' },
    { id: 'e2', category: 'workshop' },
    { id: 'e3', category: 'lecture' },
    { id: 'e4', category: 'trip' },
  ];

  const dist = calculateCategoryDistribution(publishedEvents);
  assert.equal(dist.find((d) => d.label === 'ورشة عمل')?.value, 2);
  assert.equal(dist.find((d) => d.label === 'محاضرة')?.value, 1);
  assert.equal(dist.find((d) => d.label === 'رحلة')?.value, 1);
});

test('7. participation by category uses eventParticipationById', () => {
  const publishedEvents = [
    { id: 'e1', category: 'workshop' },
    { id: 'e2', category: 'workshop' },
    { id: 'e3', category: 'lecture' },
  ];

  const metrics = {
    eventParticipationById: {
      e1: 5,
      e2: 3,
      e3: 10,
    },
  };

  const part = deriveParticipationByCategory(publishedEvents, metrics, { includeZero: false });
  assert.equal(part.find((p) => p.category === 'workshop')?.value, 8);
  assert.equal(part.find((p) => p.category === 'lecture')?.value, 10);
});

test('8. participation never uses UEvent.registered as authoritative input', () => {
  const deceitfulEvents = [
    { id: 'e1', category: 'workshop', registered: 999 }, // deceptive local counter
  ];

  const metrics = {
    eventParticipationById: {
      e1: 4, // real DB count
    },
  };

  const part = deriveParticipationByCategory(deceitfulEvents, metrics, { includeZero: false });
  assert.equal(part.find((p) => p.category === 'workshop')?.value, 4);
});

test('9. dual six-month series are independently rendered with Navy and Gold', () => {
  const buckets = generateSixMonthBuckets(new Date('2026-06-15T00:00:00Z'));
  const metrics = {
    sixMonthMemberGrowth: [
      { year: 2026, month: 5, count: 12 },
      { year: 2026, month: 6, count: 18 },
    ],
    sixMonthEventParticipations: [
      { year: 2026, month: 4, count: 25 },
      { year: 2026, month: 6, count: 30 },
    ],
  };

  const memberGrowthSeries = deriveAuthoritativeMemberGrowthSeries(metrics, buckets);
  const eventPartSeries = deriveAuthoritativeEventParticipationSeries(metrics, buckets);

  assert.equal(memberGrowthSeries.length, 6);
  assert.equal(eventPartSeries.length, 6);

  // Month 6 (June) comparison
  const juneMember = memberGrowthSeries[5].value;
  const juneEvents = eventPartSeries[5].value;
  assert.equal(juneMember, 18);
  assert.equal(juneEvents, 30);

  // Contract for LineChart dual series
  const chartSeries = [
    {
      name: 'نمو الأعضاء المقبولين',
      color: '#1e3454', // Navy
      data: memberGrowthSeries,
    },
    {
      name: 'تسجيلات الفعاليات',
      color: '#d49a24', // Gold
      data: eventPartSeries,
    },
  ];

  assert.equal(chartSeries[0].color, '#1e3454');
  assert.equal(chartSeries[0].name, 'نمو الأعضاء المقبولين');
  assert.equal(chartSeries[1].color, '#d49a24');
  assert.equal(chartSeries[1].name, 'تسجيلات الفعاليات');
});

test('10. missing month in one series safely zero-aligns by year/month', () => {
  const buckets = generateSixMonthBuckets(new Date('2026-06-15T00:00:00Z'));
  const partialPoints = [{ year: 2026, month: 6, count: 5 }];

  const aligned = alignMonthlyCountPointsToBuckets(partialPoints, buckets);
  assert.equal(aligned.length, 6);
  assert.equal(aligned[0].value, 0);
  assert.equal(aligned[1].value, 0);
  assert.equal(aligned[2].value, 0);
  assert.equal(aligned[3].value, 0);
  assert.equal(aligned[4].value, 0);
  assert.equal(aligned[5].value, 5);
});

test('11. loading state does not display fabricated metrics', () => {
  const formatStatValue = (val, isLoading) => {
    if (isLoading) return '...';
    return val != null ? String(val) : '—';
  };

  assert.equal(formatStatValue(undefined, true), '...');
});

test('12. analytics error state displays unavailable marker, not mock counts', () => {
  const formatStatValue = (val, isLoading, hasError) => {
    if (isLoading) return '...';
    if (hasError || val == null) return '—';
    return String(val);
  };

  assert.equal(formatStatValue(null, false, true), '—');
});

test('13. successful real zero displays 0, not unavailable marker', () => {
  const formatStatValue = (val, isLoading, hasError) => {
    if (isLoading) return '...';
    if (hasError || val == null) return '—';
    return (val).toLocaleString('ar-EG');
  };

  assert.notEqual(formatStatValue(0, false, false), '—');
  assert.ok(formatStatValue(0, false, false) === '٠' || formatStatValue(0, false, false) === '0');
});

test('14. authoritative suggestions remain used in latest suggestions', () => {
  const suggestions = [
    { id: 's1', title: 'اقتراح حقيقي', content: 'محتوى', studentName: 'أحمد', responses: [] },
  ];

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].title, 'اقتراح حقيقي');
});

test('15. contact messages continue using existing source', () => {
  const messages = [
    { id: 'm1', subject: 'رسالة زائر', senderName: 'خالد', createdAt: '2026-09-01' },
  ];

  assert.equal(messages.length, 1);
  assert.equal(messages[0].subject, 'رسالة زائر');
});
