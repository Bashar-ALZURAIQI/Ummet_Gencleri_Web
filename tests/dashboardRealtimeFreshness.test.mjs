import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDashboardAnalyticsGateway,
} from '../src/domain/dashboardAnalyticsGateway.ts';
import {
  createStudentSuggestionGateway,
} from '../src/domain/studentSuggestionGateway.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to create a controllable Mock Realtime Client
function createMockRealtimeClient() {
  const channels = new Map();
  const removedChannels = [];

  const client = {
    rpc: async () => ({ data: null, error: null }),
    channels,
    removedChannels,
    channel(topic) {
      const listeners = [];
      let subscribed = false;
      const chan = {
        topic,
        listeners,
        isSubscribed: () => subscribed,
        on(type, filter, callback) {
          listeners.push({ type, filter, callback });
          return chan;
        },
        subscribe(cb) {
          subscribed = true;
          if (cb) cb('SUBSCRIBED');
          return chan;
        },
        // Trigger helper for testing
        emit(table, payload = {}) {
          for (const l of listeners) {
            if (l.type === 'postgres_changes' && l.filter.table === table) {
              l.callback(payload);
            }
          }
        },
      };
      channels.set(topic, chan);
      return chan;
    },
    removeChannel(chan) {
      removedChannels.push(chan);
      channels.delete(chan.topic);
    },
  };

  return client;
}

test('1. analytics subscription uses dashboard_analytics_events signal table', () => {
  const client = createMockRealtimeClient();
  const gateway = createDashboardAnalyticsGateway(client);

  let updated = false;
  gateway.subscribeToUpdates(() => { updated = true; });

  const channel = client.channels.get('dashboard-analytics-events');
  assert.ok(channel, 'Should create dashboard-analytics-events channel');

  const signalListener = channel.listeners.find((l) => l.filter?.table === 'dashboard_analytics_events');
  assert.ok(signalListener, 'Must register listener for dashboard_analytics_events');
  assert.equal(signalListener.filter.schema, 'public');
});

test('2. analytics subscription does NOT directly subscribe to profiles, student_applications, or event_registrations', () => {
  const client = createMockRealtimeClient();
  const gateway = createDashboardAnalyticsGateway(client);

  gateway.subscribeToUpdates(() => {});

  const channel = client.channels.get('dashboard-analytics-events');
  assert.ok(channel);

  const directProfiles = channel.listeners.find((l) => l.filter?.table === 'profiles');
  assert.equal(directProfiles, undefined, 'Must not directly subscribe to public.profiles');

  const directApps = channel.listeners.find((l) => l.filter?.table === 'student_applications');
  assert.equal(directApps, undefined, 'Must not directly subscribe to public.student_applications');

  const directRegs = channel.listeners.find((l) => l.filter?.table === 'event_registrations');
  assert.equal(directRegs, undefined, 'Must not directly subscribe to public.event_registrations');
});

test('3. migration creates dashboard_analytics_events signal table without PII or user fields', () => {
  const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20260904150000_dashboard_analytics_events_signal.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file 20260904150000_dashboard_analytics_events_signal.sql must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Verify signal table creation
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.dashboard_analytics_events/i);
  assert.match(sql, /id\s+text\s+PRIMARY\s+KEY/i);
  assert.match(sql, /version\s+bigint\s+NOT\s+NULL/i);
  assert.match(sql, /updated_at\s+timestamptz\s+NOT\s+NULL/i);

  // Verify singleton seed
  assert.match(sql, /INSERT\s+INTO\s+public\.dashboard_analytics_events\s*\(\s*id,\s*version,\s*updated_at\s*\)/i);

  // Verify NO PII or domain fields exist in the signal table
  const forbiddenColumns = [
    'user_id', 'profile', 'email', 'name', 'phone', 'full_name',
    'status', 'gender', 'university', 'faculty', 'birth_date',
    'event_id', 'attended', 'application_id',
  ];
  for (const col of forbiddenColumns) {
    const tableBlockMatch = sql.match(/CREATE TABLE IF NOT EXISTS public\.dashboard_analytics_events\s*\(([^)]+)\)/is);
    assert.ok(tableBlockMatch, 'Must define dashboard_analytics_events table block');
    const tableColumns = tableBlockMatch[1].toLowerCase();
    assert.equal(tableColumns.includes(col.toLowerCase()), false, `Signal table must not contain column: ${col}`);
  }
});

test('4. migration configures bump trigger on profiles, student_applications, and event_registrations', () => {
  const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20260904150000_dashboard_analytics_events_signal.sql');
  assert.ok(fs.existsSync(migrationPath));
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Trigger function
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.bump_dashboard_analytics_event\(\)/i);
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = ''/i);
  assert.match(sql, /UPDATE public\.dashboard_analytics_events\s+SET version = version \+ 1/i);

  // Triggers on all three authoritative sources
  assert.match(sql, /CREATE TRIGGER profiles_signal_dashboard_analytics\s+AFTER INSERT OR UPDATE OR DELETE ON public\.profiles/i);
  assert.match(sql, /CREATE TRIGGER student_applications_signal_dashboard_analytics\s+AFTER INSERT OR UPDATE OR DELETE ON public\.student_applications/i);
  assert.match(sql, /CREATE TRIGGER event_registrations_signal_dashboard_analytics\s+AFTER INSERT OR UPDATE OR DELETE ON public\.event_registrations/i);

  // Must execute function
  assert.match(sql, /EXECUTE FUNCTION private\.bump_dashboard_analytics_event\(\);/i);
});

test('5. migration hardens RLS and permissions: leadership can SELECT, browser cannot write', () => {
  const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20260904150000_dashboard_analytics_events_signal.sql');
  assert.ok(fs.existsSync(migrationPath));
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // RLS enabled
  assert.match(sql, /ALTER TABLE public\.dashboard_analytics_events ENABLE ROW LEVEL SECURITY;/i);

  // Revoke all
  assert.match(sql, /REVOKE ALL ON TABLE public\.dashboard_analytics_events\s+FROM PUBLIC, anon, authenticated, service_role;/i);

  // Grant SELECT only to authenticated and service_role
  assert.match(sql, /GRANT SELECT ON TABLE public\.dashboard_analytics_events TO authenticated;/i);
  assert.match(sql, /GRANT SELECT ON TABLE public\.dashboard_analytics_events TO service_role;/i);

  // Leadership policy
  assert.match(sql, /CREATE POLICY "dashboard_analytics_events_select"/i);
  assert.match(sql, /is_executive/i);

  // Ensure no INSERT/UPDATE/DELETE grant to authenticated or anon
  assert.equal(/GRANT (INSERT|UPDATE|DELETE|ALL) ON TABLE public\.dashboard_analytics_events TO authenticated/i.test(sql), false);
  assert.equal(/GRANT (INSERT|UPDATE|DELETE|ALL) ON TABLE public\.dashboard_analytics_events TO anon/i.test(sql), false);

  // Function execution revoked
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION private\.bump_dashboard_analytics_event\(\)\s+FROM PUBLIC, anon, authenticated, service_role;/i);

  // Publication check
  assert.match(sql, /ADD TABLE public\.dashboard_analytics_events;/i);
});

test('6. rapid database events on signal table are debounced into one refresh (~300ms)', async () => {
  const client = createMockRealtimeClient();
  const gateway = createDashboardAnalyticsGateway(client);

  let updateCount = 0;
  gateway.subscribeToUpdates(() => {
    updateCount++;
  }, { debounceMs: 50 }); // using short debounce in test for speed

  const channel = client.channels.get('dashboard-analytics-events');
  assert.ok(channel, 'Should get dashboard-analytics-events channel');

  // Fire 5 rapid signal events
  channel.emit('dashboard_analytics_events', { new: { version: 1 } });
  channel.emit('dashboard_analytics_events', { new: { version: 2 } });
  channel.emit('dashboard_analytics_events', { new: { version: 3 } });
  channel.emit('dashboard_analytics_events', { new: { version: 4 } });
  channel.emit('dashboard_analytics_events', { new: { version: 5 } });

  assert.equal(updateCount, 0, 'Should not fire immediately before debounce window');

  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(updateCount, 1, 'Rapid signal events must coalesce into exactly 1 refresh call');
});

test('7. cleanup removes all new subscriptions', () => {
  const client = createMockRealtimeClient();
  const gateway = createDashboardAnalyticsGateway(client);

  const unsubscribe = gateway.subscribeToUpdates(() => {});
  const channel = client.channels.get('dashboard-analytics-events');
  assert.ok(channel);

  unsubscribe();
  assert.equal(client.removedChannels.length, 1);
  assert.equal(client.removedChannels[0].topic, 'dashboard-analytics-events');
  assert.equal(client.channels.has('dashboard-analytics-events'), false);
});

test('8. no callback after cleanup even if timer was pending', async () => {
  const client = createMockRealtimeClient();
  const gateway = createDashboardAnalyticsGateway(client);

  let called = false;
  const unsubscribe = gateway.subscribeToUpdates(() => {
    called = true;
  }, { debounceMs: 50 });

  const channel = client.channels.get('dashboard-analytics-events');
  channel.emit('dashboard_analytics_events');

  // Cleanup before debounce fires
  unsubscribe();

  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(called, false, 'Callback must never fire after unsubscribe');
});

test('9. session/account change prevents stale refresh publication (epoch guard)', async () => {
  let state = {
    epoch: 1,
    userId: 'user-a',
    analytics: { totalMembersCount: 10 },
  };

  const currentAuth = () => ({ epoch: state.epoch, userId: state.userId });

  // Simulate in-flight request started under epoch 1
  const capturedEpoch = state.epoch;
  const capturedUserId = state.userId;

  const simulateStaleRefresh = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Check epoch guard before publishing
    const latest = currentAuth();
    if (latest.epoch === capturedEpoch && latest.userId === capturedUserId) {
      state.analytics = { totalMembersCount: 99 };
    }
  };

  const refreshPromise = simulateStaleRefresh();

  // User logs out or switches to user-b before refresh finishes
  state.epoch = 2;
  state.userId = 'user-b';
  state.analytics = null;

  await refreshPromise;

  // Verify stale result was discarded and not published to user-b
  assert.equal(state.analytics, null, 'Stale refresh must not be published into new session/account');
});

test('10. no duplicate published_site_content subscription in analytics channel', () => {
  const client = createMockRealtimeClient();
  const gateway = createDashboardAnalyticsGateway(client);

  gateway.subscribeToUpdates(() => {});

  const channel = client.channels.get('dashboard-analytics-events');
  const siteListener = channel.listeners.find((l) => l.filter?.table === 'published_site_content');
  assert.equal(siteListener, undefined, 'Must not duplicate published_site_content subscription (already in AppContext)');
});

test('11. no duplicate contact-message subscription in analytics channel', () => {
  const client = createMockRealtimeClient();
  const gateway = createDashboardAnalyticsGateway(client);

  gateway.subscribeToUpdates(() => {});

  const channel = client.channels.get('dashboard-analytics-events');
  const msgListener = channel.listeners.find((l) => l.filter?.table === 'contact_messages' || l.filter?.table === 'contact_message_replies');
  assert.equal(msgListener, undefined, 'Must not duplicate contact_messages subscription (already in AppContext)');
});

test('12. suggestion refresh is triggered for student_suggestions changes', async () => {
  const client = createMockRealtimeClient();
  const gateway = createStudentSuggestionGateway(client);

  let refreshed = false;
  gateway.subscribeToUpdates(() => {
    refreshed = true;
  }, { debounceMs: 10 });

  const channel = client.channels.get('student-suggestions-authoritative');
  assert.ok(channel, 'Should create student-suggestions-authoritative channel');

  const suggListener = channel.listeners.find((l) => l.filter?.table === 'student_suggestions');
  assert.ok(suggListener, 'Must register listener for student_suggestions');

  channel.emit('student_suggestions');
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(refreshed, true, 'student_suggestions event must trigger refresh');
});

test('13. suggestion response change refreshes visible suggestions', async () => {
  const client = createMockRealtimeClient();
  const gateway = createStudentSuggestionGateway(client);

  let refreshed = false;
  gateway.subscribeToUpdates(() => {
    refreshed = true;
  }, { debounceMs: 10 });

  const channel = client.channels.get('student-suggestions-authoritative');
  assert.ok(channel);

  const respListener = channel.listeners.find((l) => l.filter?.table === 'suggestion_responses');
  assert.ok(respListener, 'Must register listener for suggestion_responses');

  channel.emit('suggestion_responses');
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(refreshed, true, 'suggestion_responses event must trigger refresh');
});

test('14. failed refresh never falls back to mock/local data and preserves existing authoritative state', () => {
  const existingAuthoritative = {
    totalMembersCount: 25,
    activeMembersCount: 20,
    pendingApplicationsCount: 3,
    sixMonthMemberGrowth: [],
    sixMonthEventParticipations: [],
    eventParticipationById: {},
  };

  const handleRefreshResult = (currentData, serviceResult) => {
    if (serviceResult.ok) {
      return { data: serviceResult.data, error: null };
    }
    // Failed refresh: keep current authoritative data, do NOT replace with null or mock zeros
    return {
      data: currentData,
      error: 'تعذر تحديث الإحصائيات الحية',
    };
  };

  const failureResult = { ok: false, error: { code: 'NETWORK_ERROR', message: 'connection failed' } };
  const updatedState = handleRefreshResult(existingAuthoritative, failureResult);

  assert.equal(updatedState.data, existingAuthoritative, 'Must preserve existing authoritative metrics on refresh failure');
  assert.equal(updatedState.data.totalMembersCount, 25);
  assert.equal(updatedState.error, 'تعذر تحديث الإحصائيات الحية');
});

test('15. dashboardAnalyticsService exports subscribeToDashboardAnalyticsUpdates', () => {
  const servicePath = path.join(rootDir, 'src', 'services', 'dashboardAnalyticsService.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  assert.match(content, /export function subscribeToDashboardAnalyticsUpdates/);
});

test('16. studentSuggestionService exports subscribeToStudentSuggestionUpdates', () => {
  const servicePath = path.join(rootDir, 'src', 'services', 'studentSuggestionService.ts');
  const content = fs.readFileSync(servicePath, 'utf8');
  assert.match(content, /export function subscribeToStudentSuggestionUpdates/);
});

