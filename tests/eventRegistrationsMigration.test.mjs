import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createEventRegistrationGateway,
} from '../src/domain/eventRegistrationGateway.ts';

const migrationUrl = new URL(
  '../supabase/migrations/20260904120000_create_event_registrations.sql',
  import.meta.url,
);

test('event registrations migration creates ledger referencing profiles and enforces lifecycle', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  // Table creation and column checks
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.event_registrations/i);
  assert.match(sql, /event_id\s+text\s+NOT NULL/i);
  assert.match(sql, /user_id\s+uuid\s+NOT NULL REFERENCES public\.profiles\(id\)\s+ON DELETE CASCADE/i);
  // Avoid redundant FK to auth.users
  assert.doesNotMatch(sql, /REFERENCES auth\.users/i);
  // Do NOT invent a fake FK to events table
  assert.doesNotMatch(sql, /REFERENCES.*events\(/i);

  // Schema uses UUID row id
  assert.match(sql, /id\s+uuid\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);
  // Must NOT use compound primary key (event_id, user_id)
  assert.doesNotMatch(sql, /PRIMARY KEY\s*\(\s*event_id\s*,\s*user_id\s*\)/i);

  // Partial unique index enforces ONLY ONE active registration per user per event
  assert.match(
    sql,
    /CREATE UNIQUE INDEX[\s\S]*?ON public\.event_registrations\s*\(event_id,\s*user_id\)\s+WHERE status = 'active'/i,
  );

  // Lifecycle check
  assert.match(sql, /status\s+text\s+NOT NULL\s+DEFAULT\s+'active'/i);
  assert.match(sql, /status IN \('active',\s*'cancelled'\)/i);
  assert.match(sql, /cancelled_at timestamptz/i);

  // Indexes for active registrations
  assert.match(sql, /CREATE INDEX IF NOT EXISTS event_registrations_user_active_idx/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS event_registrations_event_active_idx/i);

  // RLS is enabled and direct mutations are revoked
  assert.match(sql, /ALTER TABLE public\.event_registrations ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE INSERT,\s*UPDATE,\s*DELETE ON TABLE public\.event_registrations FROM PUBLIC,\s*anon,\s*authenticated/i);
  assert.match(sql, /GRANT SELECT ON TABLE public\.event_registrations TO authenticated/i);

  // RLS policy: strictly own registrations or current PRESIDENT only (least privilege)
  assert.match(sql, /CREATE POLICY "event_registrations_select"/i);
  assert.match(sql, /user_id = \(SELECT auth\.uid\(\)\)/i);
  assert.match(sql, /ea\.position_key = 'PRESIDENT'/i);
  // Must NOT grant raw SELECT to other executive positions
  assert.doesNotMatch(
    sql,
    /USING\s*\(\s*user_id = \(SELECT auth\.uid\(\)\)\s*OR EXISTS\s*\(\s*SELECT 1\s+FROM public\.executive_assignments AS ea\s+WHERE ea\.user_id = \(SELECT auth\.uid\(\)\)\s*\)\s*\)/i,
  );
});

test('event registrations migration creates hardened registration and cancellation RPCs with concurrency locking', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  // Registration RPC
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.register_event_participation\s*\(\s*p_event_id text\s*\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.unregister_event_participation\s*\(\s*p_event_id text\s*\)/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.list_my_event_registrations\(\)/i);

  // Security definer and pinned search path
  for (const fn of ['register_event_participation', 'unregister_event_participation', 'list_my_event_registrations']) {
    const rx = new RegExp(`FUNCTION public\\.${fn}[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = ''`, 'i');
    assert.match(sql, rx);
  }

  // Derive actor from auth.uid()
  assert.match(sql, /\(SELECT auth\.uid\(\)\)/i);

  // Validate active membership
  assert.match(sql, /profiles[\s\S]*?status = 'active'/i);

  // Validate ban status using exact predicate: banned_until IS NOT NULL AND banned_until > now()
  assert.match(sql, /auth\.users[\s\S]*?banned_until IS NOT NULL[\s\S]*?banned_until > now\(\)/i);

  // Transaction-scoped advisory lock for capacity serialization
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(sql, /hashtextextended\('event_registration:'\s*\|\|\s*p_event_id,\s*0\)/i);

  // Verify advisory lock is acquired BEFORE capacity count check
  const lockIndex = sql.indexOf('pg_catalog.pg_advisory_xact_lock');
  const capacityIndex = sql.indexOf('v_active_count >= v_capacity');
  assert.ok(lockIndex !== -1, 'Advisory lock must be present in SQL');
  assert.ok(capacityIndex !== -1, 'Capacity check must be present in SQL');
  assert.ok(lockIndex < capacityIndex, 'Advisory lock must be acquired before capacity check');

  // Validate published CMS event catalog
  assert.match(sql, /published_site_content/i);

  // Validate deadline and capacity
  assert.match(sql, /registrationDeadline/i);
  assert.match(sql, /capacity/i);

  // Duplicate active registration is idempotent without inserting a duplicate row
  assert.match(
    sql,
    /IF EXISTS\s*\(\s*SELECT 1\s+FROM public\.event_registrations\s+WHERE event_id = p_event_id\s+AND user_id = v_user_id\s+AND status = 'active'\s*\)/i,
  );

  // First registration and re-registration after cancellation inserts a NEW active row
  assert.match(
    sql,
    /INSERT INTO public\.event_registrations\s*\(\s*event_id,\s*user_id,\s*registered_at,\s*cancelled_at,\s*status\s*\)\s*VALUES\s*\(\s*p_event_id,\s*v_user_id,\s*now\(\),\s*NULL,\s*'active'\s*\)/i,
  );

  // Re-registration does NOT mutate historical cancelled rows
  assert.doesNotMatch(sql, /ON CONFLICT.*DO UPDATE SET/i);

  // Cancellation updates only the active row and preserves original registered_at
  assert.match(
    sql,
    /UPDATE public\.event_registrations\s+SET status = 'cancelled',\s*cancelled_at = now\(\)\s+WHERE event_id = p_event_id\s+AND user_id = v_user_id\s+AND status = 'active'/i,
  );
  assert.doesNotMatch(sql, /UPDATE public\.event_registrations\s+SET[^;]*?registered_at\s*=/i);

  // Capacity check excludes cancelled rows (counts only active status)
  assert.match(sql, /SELECT COUNT\(\*\)::integer INTO v_active_count\s+FROM public\.event_registrations\s+WHERE event_id = p_event_id AND status = 'active'/i);

  // list_my_event_registrations returns active rows only
  assert.match(sql, /WHERE er\.user_id = \(SELECT auth\.uid\(\)\)\s+AND er\.status = 'active'/i);

  // Permissions
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.register_event_participation/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.register_event_participation\(text\) TO authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.unregister_event_participation\(text\) TO authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.list_my_event_registrations\(\) TO authenticated/i);
});

test('createEventRegistrationGateway handles successful registration and cancellation', async () => {
  const mockClient = {
    rpc: async (name, args) => {
      if (name === 'register_event_participation') {
        assert.equal(args.p_event_id, 'e1');
        return {
          data: [{ ok: true, is_registered: true, registered_count: 12 }],
          error: null,
        };
      }
      if (name === 'unregister_event_participation') {
        assert.equal(args.p_event_id, 'e1');
        return {
          data: [{ ok: true, is_registered: false, registered_count: 11 }],
          error: null,
        };
      }
      if (name === 'list_my_event_registrations') {
        return {
          data: [
            { event_id: 'e1', registered_at: '2026-03-01T10:00:00Z' },
            { event_id: 'e2', registered_at: '2026-03-02T12:00:00Z' },
          ],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };

  const gateway = createEventRegistrationGateway(mockClient);

  const regResult = await gateway.register('e1');
  assert.equal(regResult.ok, true);
  if (regResult.ok) {
    assert.equal(regResult.data.eventId, 'e1');
    assert.equal(regResult.data.isRegistered, true);
    assert.equal(regResult.data.registeredCount, 12);
  }

  const unregResult = await gateway.unregister('e1');
  assert.equal(unregResult.ok, true);
  if (unregResult.ok) {
    assert.equal(unregResult.data.eventId, 'e1');
    assert.equal(unregResult.data.isRegistered, false);
    assert.equal(unregResult.data.registeredCount, 11);
  }

  const listResult = await gateway.listMyRegisteredEventIds();
  assert.equal(listResult.ok, true);
  if (listResult.ok) {
    assert.deepEqual(listResult.data, ['e1', 'e2']);
  }
});

test('createEventRegistrationGateway maps capacity and deadline errors cleanly', async () => {
  const mockClient = {
    rpc: async (name) => {
      if (name === 'register_event_participation') {
        return {
          data: null,
          error: { code: '23514', message: 'Event is at full capacity' },
        };
      }
      return { data: null, error: null };
    },
  };

  const gateway = createEventRegistrationGateway(mockClient);
  const result = await gateway.register('e1');

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'EVENT_FULL');
    assert.equal(result.error.message, 'اكتمل العدد المحدد للفعالية.');
  }
});

test('createEventRegistrationGateway maps membership, deadline, and not found errors', async () => {
  const cases = [
    {
      error: { code: '22023', message: 'Registration deadline has passed' },
      expectedCode: 'DEADLINE_PASSED',
      expectedMsg: 'انتهت مهلة التسجيل في هذه الفعالية.',
    },
    {
      error: { code: '42501', message: 'Active union membership is required to register for events' },
      expectedCode: 'UNAUTHORIZED_MEMBER',
      expectedMsg: 'التسجيل في الفعاليات متاح فقط للأعضاء المقبولين والنشطين.',
    },
    {
      error: { code: 'P0002', message: 'Event was not found in published events catalog' },
      expectedCode: 'EVENT_NOT_FOUND',
      expectedMsg: 'تعذر العثور على الفعالية في دليل الفعاليات.',
    },
  ];

  for (const tc of cases) {
    const mockClient = {
      rpc: async () => ({ data: null, error: tc.error }),
    };
    const gateway = createEventRegistrationGateway(mockClient);
    const result = await gateway.register('e-any');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, tc.expectedCode);
      assert.equal(result.error.message, tc.expectedMsg);
    }
  }
});

test('ban evaluation semantics correctly classify null, past, and future banned_until', () => {
  // Mirror SQL predicate: u.banned_until IS NOT NULL AND u.banned_until > now()
  const isBanned = (bannedUntil, now = new Date('2026-09-04T12:00:00Z')) => {
    if (!bannedUntil) return false;
    return new Date(bannedUntil).getTime() > now.getTime();
  };

  // Case 1: No ban (null or undefined) -> allowed
  assert.equal(isBanned(null), false, 'null banned_until should allow registration');
  assert.equal(isBanned(undefined), false, 'undefined banned_until should allow registration');

  // Case 2: Expired ban (past timestamp) -> allowed
  assert.equal(isBanned('2026-08-01T00:00:00Z'), false, 'expired ban should allow registration');
  assert.equal(isBanned('2026-09-04T11:59:59Z'), false, 'just expired ban should allow registration');

  // Case 3: Active ban (future timestamp) -> rejected
  assert.equal(isBanned('2026-09-04T12:00:01Z'), true, 'active ban should reject registration');
  assert.equal(isBanned('2026-10-01T00:00:00Z'), true, 'future ban should reject registration');
});

test('createEventRegistrationGateway maps suspended account error cleanly', async () => {
  const mockClient = {
    rpc: async (name) => {
      if (name === 'register_event_participation') {
        return {
          data: null,
          error: { code: '42501', message: 'Account is currently suspended' },
        };
      }
      return { data: null, error: null };
    },
  };

  const gateway = createEventRegistrationGateway(mockClient);
  const result = await gateway.register('e1');

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'ACCOUNT_SUSPENDED');
    assert.equal(result.error.message, 'الحساب موقوف حالياً.');
  }
});

test('event registration ledger lifecycle models non-mutating history and idempotent active state', () => {
  const ledger = [];
  let nextId = 1;

  const register = (eventId, userId, now) => {
    // 1. Check if active row already exists -> idempotent return without insert
    const active = ledger.find((r) => r.eventId === eventId && r.userId === userId && r.status === 'active');
    if (active) {
      return { ok: true, isRegistered: true, row: active, inserted: false };
    }
    // 2. Insert a new active row (even if historical cancelled rows exist)
    const newRow = {
      id: `row-${nextId++}`,
      eventId,
      userId,
      registeredAt: now,
      cancelledAt: null,
      status: 'active',
    };
    ledger.push(newRow);
    return { ok: true, isRegistered: true, row: newRow, inserted: true };
  };

  const cancel = (eventId, userId, now) => {
    const active = ledger.find((r) => r.eventId === eventId && r.userId === userId && r.status === 'active');
    if (active) {
      active.status = 'cancelled';
      active.cancelledAt = now;
      return { ok: true, isRegistered: false, row: active };
    }
    return { ok: true, isRegistered: false, row: null };
  };

  // Step 1: Initial registration in January
  const janDate = new Date('2026-01-10T10:00:00Z');
  const res1 = register('e1', 'u1', janDate);
  assert.equal(res1.inserted, true);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].registeredAt.toISOString(), '2026-01-10T10:00:00.000Z');
  assert.equal(ledger[0].status, 'active');

  // Step 2: Duplicate registration in January (idempotent, no new row inserted)
  const res2 = register('e1', 'u1', new Date('2026-01-11T10:00:00Z'));
  assert.equal(res2.inserted, false);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].registeredAt.toISOString(), '2026-01-10T10:00:00.000Z');

  // Step 3: Cancellation in February preserves January registeredAt
  const febDate = new Date('2026-02-15T12:00:00Z');
  const res3 = cancel('e1', 'u1', febDate);
  assert.equal(res3.ok, true);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].status, 'cancelled');
  assert.equal(ledger[0].cancelledAt?.toISOString(), '2026-02-15T12:00:00.000Z');
  assert.equal(ledger[0].registeredAt.toISOString(), '2026-01-10T10:00:00.000Z');

  // Step 4: Re-registration in April inserts a NEW active row without mutating January record
  const aprDate = new Date('2026-04-05T09:00:00Z');
  const res4 = register('e1', 'u1', aprDate);
  assert.equal(res4.inserted, true);
  assert.equal(ledger.length, 2);

  // Old cancelled row retains January registration timestamp
  assert.equal(ledger[0].status, 'cancelled');
  assert.equal(ledger[0].registeredAt.toISOString(), '2026-01-10T10:00:00.000Z');
  assert.equal(ledger[0].cancelledAt?.toISOString(), '2026-02-15T12:00:00.000Z');

  // New active row has April registration timestamp
  assert.equal(ledger[1].status, 'active');
  assert.equal(ledger[1].registeredAt.toISOString(), '2026-04-05T09:00:00.000Z');
  assert.equal(ledger[1].cancelledAt, null);
});



