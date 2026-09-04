import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createDashboardAnalyticsGateway,
  mapDashboardAnalyticsMetrics,
} from '../src/domain/dashboardAnalyticsGateway.ts';

const migrationUrl = new URL(
  '../supabase/migrations/20260904130000_admin_dashboard_authoritative_analytics.sql',
  import.meta.url,
);

test('admin dashboard analytics migration defines secure executive-only aggregate RPC', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  // Must not duplicate or own event_registrations table (owned by 20260904120000)
  assert.doesNotMatch(sql, /CREATE TABLE.*event_registrations/i);

  // Function signature and security
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_admin_dashboard_metrics\(\)/i);
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = ''/i);

  // Authorization check: must verify executive assignment
  assert.match(sql, /FROM public\.executive_assignments/i);
  assert.match(sql, /RAISE EXCEPTION.*42501/i);

  // Total members: active profiles UNION accepted inactive profiles
  assert.match(sql, /SELECT p\.id FROM public\.profiles AS p WHERE p\.status = 'active'/i);
  assert.match(sql, /UNION/i);
  assert.match(sql, /WHERE p\.status = 'inactive' AND a\.status = 'accepted'/i);

  // Active members: profiles.status = 'active'
  assert.match(sql, /FROM public\.profiles AS p\s+WHERE p\.status = 'active'/i);

  // Pending applications: status IN ('pending', 'interview')
  assert.match(sql, /FROM public\.student_applications AS a\s+WHERE a\.status IN \('pending', 'interview'\)/i);

  // Six-month member growth: decided_at IS NOT NULL
  assert.match(sql, /a\.decided_at IS NOT NULL/i);
  assert.match(sql, /EXTRACT\(MONTH FROM a\.decided_at\)/i);
  assert.match(sql, /EXTRACT\(YEAR FROM a\.decided_at\)/i);

  // A. Historical event participations series: groups by registered_at WITHOUT status = 'active' filter
  assert.match(sql, /EXTRACT\(MONTH FROM er\.registered_at\)/i);
  assert.match(sql, /EXTRACT\(YEAR FROM er\.registered_at\)/i);
  const regCountsCteMatch = sql.match(/reg_counts\s+AS\s+\([\s\S]*?FROM\s+public\.event_registrations\s+AS\s+er[\s\S]*?\)/i);
  assert.ok(regCountsCteMatch, 'reg_counts CTE must exist');
  assert.doesNotMatch(
    regCountsCteMatch[0],
    /status\s*=\s*'active'/i,
    'Historical series CTE must not filter out cancelled registration cycles',
  );

  // B. Current active event participation by id map: DOES filter status = 'active'
  assert.match(sql, /event_participation_by_id\s+jsonb/i);
  const activePartCteMatch = sql.match(/active_part\s+AS\s+\([\s\S]*?FROM\s+public\.event_registrations[\s\S]*?\)/i);
  assert.ok(activePartCteMatch, 'active_part CTE must exist');
  assert.match(
    activePartCteMatch[0],
    /status\s*=\s*'active'/i,
    'event_participation_by_id must filter status = active',
  );
  assert.match(sql, /jsonb_object_agg/i);

  // C. Exact RPC return names match dashboardAnalyticsGateway.ts
  assert.match(sql, /total_members_count\s+integer/i);
  assert.match(sql, /active_members_count\s+integer/i);
  assert.match(sql, /pending_applications_count\s+integer/i);
  assert.match(sql, /six_month_member_growth\s+jsonb/i);
  assert.match(sql, /six_month_event_participations\s+jsonb/i);
  assert.match(sql, /event_participation_by_id\s+jsonb/i);

  // D. Obsolete competing field names are removed from the return contract
  assert.doesNotMatch(sql, /member_growth_series/i);
  assert.doesNotMatch(sql, /event_registrations_series/i);
  assert.doesNotMatch(sql, /category_distribution/i);
  assert.doesNotMatch(sql, /participation_by_category/i);

  // Permissions: revoke from public/anon and grant to authenticated
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_admin_dashboard_metrics\(\) FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_admin_dashboard_metrics\(\) TO authenticated/i);

  // Never expose private applicant or profile fields
  assert.doesNotMatch(sql, /login_email|contact_email|password|phone|motivation/i);
});

test('mapDashboardAnalyticsMetrics maps server response into typed dashboard metrics', () => {
  const serverRow = {
    total_members_count: 42,
    active_members_count: 38,
    pending_applications_count: 7,
    six_month_member_growth: [
      { year: 2025, month: 11, count: 5 },
      { year: 2025, month: 12, count: 8 },
      { year: 2026, month: 1, count: 12 },
      { year: 2026, month: 2, count: 6 },
      { year: 2026, month: 3, count: 11 },
    ],
    six_month_event_participations: [
      { year: 2026, month: 2, count: 25 },
      { year: 2026, month: 3, count: 30 },
    ],
    event_participation_by_id: {
      e1: 15,
      e2: 40,
    },
  };

  const metrics = mapDashboardAnalyticsMetrics(serverRow);

  assert.deepEqual(metrics, {
    totalMembersCount: 42,
    activeMembersCount: 38,
    pendingApplicationsCount: 7,
    sixMonthMemberGrowth: [
      { year: 2025, month: 11, count: 5 },
      { year: 2025, month: 12, count: 8 },
      { year: 2026, month: 1, count: 12 },
      { year: 2026, month: 2, count: 6 },
      { year: 2026, month: 3, count: 11 },
    ],
    sixMonthEventParticipations: [
      { year: 2026, month: 2, count: 25 },
      { year: 2026, month: 3, count: 30 },
    ],
    eventParticipationById: {
      e1: 15,
      e2: 40,
    },
  });
});

test('mapDashboardAnalyticsMetrics handles null or empty server response safely', () => {
  const metrics = mapDashboardAnalyticsMetrics(null);

  assert.deepEqual(metrics, {
    totalMembersCount: 0,
    activeMembersCount: 0,
    pendingApplicationsCount: 0,
    sixMonthMemberGrowth: [],
    sixMonthEventParticipations: [],
    eventParticipationById: {},
  });
});

test('createDashboardAnalyticsGateway queries RPC and returns service result', async () => {
  const mockClient = {
    rpc: async (name) => {
      assert.equal(name, 'get_admin_dashboard_metrics');
      return {
        data: [{
          total_members_count: 10,
          active_members_count: 8,
          pending_applications_count: 2,
          six_month_member_growth: [],
          six_month_event_participations: [],
          event_participation_by_id: {},
        }],
        error: null,
      };
    },
  };

  const gateway = createDashboardAnalyticsGateway(mockClient);
  const result = await gateway.loadMetrics();

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.totalMembersCount, 10);
    assert.equal(result.data.activeMembersCount, 8);
    assert.equal(result.data.pendingApplicationsCount, 2);
  }
});

test('createDashboardAnalyticsGateway handles RPC error safely', async () => {
  const mockClient = {
    rpc: async () => ({
      data: null,
      error: { code: '42501', message: 'Only executive members may access dashboard analytics' },
    }),
  };

  const gateway = createDashboardAnalyticsGateway(mockClient);
  const result = await gateway.loadMetrics();

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, '42501');
  }
});
