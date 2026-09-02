import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL(
  '../supabase/migrations/20260822000000_identity_roles_profiles_history.sql',
  import.meta.url,
);
const migrationPath = fileURLToPath(migrationUrl);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const normalized = sql.toLowerCase().replace(/\s+/g, ' ');

function functionBody(functionName) {
  const match = sql.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public|private)\\.${functionName}\\b[\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`, 'i'),
  );
  assert.ok(match, `missing function ${functionName}`);
  return match[1].toLowerCase().replace(/\s+/g, ' ');
}

function viewDefinition(viewName) {
  const match = sql.match(
    new RegExp(`create\\s+or\\s+replace\\s+view\\s+public\\.${viewName}\\b[\\s\\S]*?;`, 'i'),
  );
  assert.ok(match, `missing view ${viewName}`);
  return match[0].toLowerCase().replace(/\s+/g, ' ');
}

function policyDefinition(policyName) {
  const match = sql.match(
    new RegExp(`create\\s+policy\\s+"${policyName}"[\\s\\S]*?;`, 'i'),
  );
  assert.ok(match, `missing policy ${policyName}`);
  return match[0].toLowerCase().replace(/\s+/g, ' ');
}

test('identity migration artifact exists', () => {
  assert.equal(existsSync(migrationPath), true, `missing migration: ${migrationPath}`);
});

test('profiles gains editable contact fields without storing an executive role', () => {
  for (const column of ['contact_email', 'bio', 'avatar_path', 'updated_at']) {
    assert.match(normalized, new RegExp(`alter table public\\.profiles[\\s\\S]*?add column if not exists ${column}\\b`));
  }

  assert.doesNotMatch(normalized, /(?:add\s+column|create\s+table)[^;]*\bprofiles\b[^;]*\brole\b/);

  const updateGrant = normalized.match(/grant update\s*\(([^)]*)\)\s*on table public\.profiles to authenticated/);
  assert.ok(updateGrant, 'profile writes must use a column-level UPDATE grant');
  assert.doesNotMatch(updateGrant[1], /(?:^|,)\s*email\s*(?:,|$)/, 'login email must remain read-only');
});

test('profile updates always receive a fresh server timestamp for persistent avatar cache busting', () => {
  assert.match(normalized, /create or replace function public\.set_profiles_updated_at\(\)/);
  const body = functionBody('set_profiles_updated_at');
  assert.match(body, /new\.updated_at\s*:=\s*now\(\)/);
  assert.match(body, /return new/);
  assert.match(normalized, /drop trigger if exists profiles_set_updated_at on public\.profiles/);
  assert.match(normalized, /create trigger profiles_set_updated_at before update on public\.profiles for each row execute function public\.set_profiles_updated_at\(\)/);
});

test('Auth signup provisions an idempotent profile from non-authoritative metadata', () => {
  const body = functionBody('handle_new_auth_user_profile');
  assert.match(normalized, /public\.handle_new_auth_user_profile\(\)[^;]*security definer[^;]*set search_path = ''/);
  assert.match(body, /insert into public\.profiles/);
  assert.match(body, /new\.id/);
  assert.match(body, /new\.email/);
  assert.match(body, /new\.raw_user_meta_data/);
  assert.match(body, /on conflict\s*\(\s*id\s*\)\s*do nothing/);
  assert.doesNotMatch(body, /role|position|assignment/);
  assert.match(normalized, /drop trigger if exists auth_user_profile_created on auth\.users/);
  assert.match(normalized, /create trigger auth_user_profile_created after insert on auth\.users for each row execute function public\.handle_new_auth_user_profile\(\)/);
  assert.match(normalized, /revoke execute on function public\.handle_new_auth_user_profile\(\) from public, anon, authenticated, service_role/);
});

test('Auth signup atomically provisions one pending application snapshot without client grants', () => {
  const body = functionBody('handle_new_auth_user_profile');
  assert.match(normalized, /alter table public\.student_applications add column if not exists phone text/);
  assert.match(body, /insert into public\.student_applications/);
  assert.match(body, /'signup_'\s*\|\|\s*new\.id::text/);
  for (const metadataField of ['name', 'contact_email', 'university', 'major', 'year', 'phone', 'motivation']) {
    assert.match(body, new RegExp(`raw_user_meta_data ->> '${metadataField}'`));
  }
  assert.match(body, /current_date/);
  assert.match(body, /'pending'/);
  assert.match(body, /on conflict\s*\(\s*id\s*\)\s*do nothing/);
  assert.doesNotMatch(body, /raw_user_meta_data ->> '(?:role|status|position|assignment|password)'/);
  assert.match(normalized, /drop policy if exists "anon_insert_applications" on public\.student_applications/);
  assert.match(normalized, /revoke insert on table public\.student_applications from anon, authenticated/);
});

test('executive assignments enforce one account per known position with indexed auth references', () => {
  assert.match(normalized, /create table if not exists public\.executive_assignments\b/);
  assert.match(normalized, /unique\s*\(\s*user_id\s*\)/);
  assert.match(normalized, /unique\s*\(\s*position_key\s*\)/);
  assert.match(normalized, /position_key[^;]*check[^;]*'president'[^;]*'vice_president'[^;]*'audit_head'/);
  assert.match(normalized, /user_id uuid[^;]*references auth\.users\s*\(\s*id\s*\)/);
  assert.match(normalized, /assigned_by uuid[^;]*references auth\.users\s*\(\s*id\s*\)/);
  assert.match(normalized, /create index if not exists executive_assignments_assigned_by_idx on public\.executive_assignments\s*\(\s*assigned_by\s*\)/);
});

test('assignment deletes replicate only the unique user identity needed for unfiltered refresh events', () => {
  assert.match(normalized, /alter table public\.executive_assignments replica identity using index executive_assignments_user_id_key/);
  assert.doesNotMatch(normalized, /alter table public\.executive_assignments replica identity full/);
});

test('private authorization helpers are hardened and not directly executable by API roles', () => {
  for (const helper of ['is_current_president', 'is_current_executive']) {
    assert.match(normalized, new RegExp(`create or replace function private\\.${helper}\\b`));
    assert.match(normalized, new RegExp(`private\\.${helper}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`));
    assert.match(normalized, new RegExp(`revoke execute on function private\\.${helper}\\(\\) from public, anon, authenticated, service_role`));
  }

  assert.match(normalized, /create or replace view private\.current_user_authorization\b/);
  assert.match(normalized, /select[^;]*as is_president[^;]*as is_executive/);
  assert.match(normalized, /grant usage on schema private to authenticated/);
  assert.match(normalized, /revoke all on table private\.current_user_authorization from public, anon, authenticated, service_role/);
  assert.match(normalized, /grant select on table private\.current_user_authorization to authenticated/);
  assert.doesNotMatch(normalized, /grant select on table private\.current_user_authorization to (?:public|anon|service_role)/);
});

test('RLS permits profile ownership and scoped history reads but no direct assignment writes', () => {
  for (const table of ['profiles', 'executive_assignments', 'edit_requests']) {
    assert.match(normalized, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(normalized, /create policy "profiles_update_own" on public\.profiles for update to authenticated using \(\(select auth\.uid\(\)\) = id\) with check \(\(select auth\.uid\(\)\) = id\)/);
  const ownEditPolicy = policyDefinition('edit_requests_select_own');
  assert.match(ownEditPolicy, /submitted_by = \(select auth\.uid\(\)\)/);
  assert.match(ownEditPolicy, /private\.current_user_authorization/);
  assert.match(ownEditPolicy, /authz\.is_executive/);
  const presidentEditPolicy = policyDefinition('edit_requests_select_president');
  assert.match(presidentEditPolicy, /private\.current_user_authorization/);
  assert.match(presidentEditPolicy, /authz\.is_president/);
  assert.doesNotMatch(normalized, /create policy [^;]*private\.is_current_(?:president|executive)\s*\(/);
  assert.doesNotMatch(normalized, /create policy "profiles_select_president"/);
  assert.doesNotMatch(normalized, /create policy [^;]+ on public\.executive_assignments for (?:insert|update|delete|all)\b/);
  assert.doesNotMatch(normalized, /grant (?:insert|update|delete|all)[^;]*on table public\.executive_assignments/);
  assert.doesNotMatch(normalized, /grant (?:insert|update|delete|all)[^;]*on table public\.edit_requests/);
});

test('edit requests derive audit ownership and decisions in authenticated RPCs', () => {
  assert.match(normalized, /create table if not exists public\.edit_requests\b/);
  assert.match(normalized, /submitted_by uuid[^;]*references auth\.users\s*\(\s*id\s*\)/);
  assert.match(normalized, /reviewed_by uuid[^;]*references auth\.users\s*\(\s*id\s*\)/);
  assert.match(normalized, /status[^;]*check[^;]*'pending'[^;]*'approved'[^;]*'rejected'/);

  const submitBody = functionBody('submit_edit_request');
  assert.match(submitBody, /auth\.uid\(\)/);
  assert.match(submitBody, /from public\.executive_assignments/);
  assert.match(submitBody, /insert into public\.edit_requests/);
  assert.match(submitBody, /'pending'/);

  const decideBody = functionBody('decide_edit_request');
  assert.match(decideBody, /auth\.uid\(\)/);
  assert.match(decideBody, /private\.is_current_president\(\)/);
  assert.match(decideBody, /reviewed_by/);
  assert.match(decideBody, /status = p_decision/);

  for (const rpc of ['submit_edit_request', 'decide_edit_request']) {
    assert.match(normalized, new RegExp(`revoke execute on function public\\.${rpc}[^;]*from public, anon`));
    assert.match(normalized, new RegExp(`grant execute on function public\\.${rpc}[^;]*to authenticated`));
  }
});

test('public views expose explicit safe fields and cannot be written by API roles', () => {
  for (const viewName of ['public_member_profiles', 'public_executive_directory']) {
    const definition = viewDefinition(viewName);
    assert.doesNotMatch(definition, /select\s+\*/);
    assert.doesNotMatch(definition, /\bp\.phone\b/);
    assert.doesNotMatch(definition, /\bp\.email\b/);
    assert.match(normalized, new RegExp(`revoke all on table public\\.${viewName} from public, anon, authenticated`));
    assert.match(normalized, new RegExp(`grant select on table public\\.${viewName} to anon, authenticated`));
  }

  assert.doesNotMatch(functionBody('list_public_member_profiles'), /\bp\.contact_email\b/);
  assert.match(functionBody('list_public_executive_directory'), /\bp\.contact_email\s+as\s+contact_email\b/);

  const profileSelectGrant = normalized.match(/grant select\s*\(([^)]*)\)\s*on table public\.profiles to authenticated/);
  assert.ok(profileSelectGrant, 'profiles SELECT must use a column-level grant');
  assert.doesNotMatch(profileSelectGrant[1], /(?:^|,)\s*email\s*(?:,|$)/, 'login email must not be exposed through the Data API');
  assert.doesNotMatch(normalized, /grant select on table public\.profiles to authenticated/);
});

test('president-only account directory exposes login email through a hardened RPC only', () => {
  assert.match(normalized, /create or replace function public\.list_president_assignable_members\(\)/);
  assert.match(normalized, /list_president_assignable_members\(\)[^;]*security definer[^;]*set search_path = ''/);
  const body = functionBody('list_president_assignable_members');
  assert.match(body, /private\.is_current_president\(\)/);
  assert.match(body, /from auth\.users as u/);
  assert.match(body, /join public\.profiles as p on p\.id = u\.id/);
  assert.match(body, /left join public\.executive_assignments as ea on ea\.user_id = u\.id/);
  assert.match(body, /u\.email/);
  assert.doesNotMatch(body, /select\s+\*/);
  assert.match(normalized, /revoke execute on function public\.list_president_assignable_members\(\) from public, anon, authenticated, service_role/);
  assert.match(normalized, /grant execute on function public\.list_president_assignable_members\(\) to authenticated/);
  assert.doesNotMatch(normalized, /grant execute on function public\.list_president_assignable_members\(\) to (?:public|anon|service_role)/);

  for (const viewName of ['public_member_profiles', 'public_executive_directory']) {
    assert.doesNotMatch(viewDefinition(viewName), /login_email|u\.email|auth\.users/);
  }
});

test('contact email backfill reaches only the explicit executive contact projection', () => {
  assert.match(normalized, /update public\.profiles set contact_email = email where contact_email is null/);
  assert.doesNotMatch(functionBody('list_public_member_profiles'), /contact_email|\bp\.email\b/);
  assert.match(functionBody('list_public_executive_directory'), /\bp\.contact_email\s+as\s+contact_email\b/);
  assert.doesNotMatch(functionBody('list_public_executive_directory'), /\bp\.email\b|login_email|auth\.users/);
});

test('public directory views execute with invoker security and expose only hardened private projections', () => {
  const memberView = viewDefinition('public_member_profiles');
  const executiveView = viewDefinition('public_executive_directory');

  assert.match(memberView, /security_invoker\s*=\s*true/);
  assert.match(executiveView, /security_invoker\s*=\s*true/);
  assert.match(memberView, /private\.list_public_member_profiles\(\)/);
  assert.match(executiveView, /private\.list_public_executive_directory\(\)/);
  assert.doesNotMatch(memberView, /from public\.profiles/);
  assert.doesNotMatch(executiveView, /from public\.(?:profiles|executive_assignments)/);

  assert.match(normalized, /private\.list_public_member_profiles\(\)[^;]*security definer[^;]*set search_path = ''/);
  assert.match(normalized, /private\.list_public_executive_directory\(\)[^;]*security definer[^;]*set search_path = ''/);
  assert.match(functionBody('list_public_member_profiles'), /where p\.status = 'active'/);
  assert.match(functionBody('list_public_executive_directory'), /where p\.status = 'active'/);
  assert.doesNotMatch(functionBody('list_public_member_profiles'), /contact_email|\bp\.email\b|auth\.users/);
  assert.doesNotMatch(functionBody('list_public_executive_directory'), /\bp\.email\b|login_email|auth\.users/);
});

test('assignment transfer is serialized, re-authorized, account-backed, and returns both holders', () => {
  assert.match(normalized, /create or replace function public\.transfer_executive_assignment\s*\(\s*"position" text\s*,\s*target_user_id uuid\s*\)/);
  const body = functionBody('transfer_executive_assignment');
  assert.match(body, /auth\.uid\(\)/);
  assert.match(body, /pg_advisory_xact_lock/);
  assert.ok((body.match(/private\.is_current_president\(\)/g) ?? []).length >= 2, 'presidency must be checked before and after locking');
  assert.match(body, /from auth\.users/);
  assert.match(body, /deleted_at is null/);
  assert.match(body, /status = 'active'/);
  assert.match(body, /target_user_id\s*=\s*v_actor_id[^;]*"position"\s*<>\s*'president'/);
  assert.match(body, /for update/);
  assert.match(body, /delete from public\.executive_assignments[^;]*user_id = target_user_id/);
  assert.match(body, /delete from public\.executive_assignments[^;]*position_key = "position"/);
  assert.match(body, /insert into public\.executive_assignments/);
  assert.match(body, /previous_user_id/);
  assert.match(body, /new_user_id/);
  assert.match(normalized, /revoke execute on function public\.transfer_executive_assignment[^;]*from public, anon/);
  assert.match(normalized, /grant execute on function public\.transfer_executive_assignment[^;]*to authenticated/);
});

test('decided edit requests preserve their reviewer foreign key', () => {
  assert.match(normalized, /reviewed_by uuid[^;]*references auth\.users\s*\(\s*id\s*\)[^;]*on delete restrict/);
  assert.doesNotMatch(normalized, /reviewed_by uuid[^;]*on delete set null/);
  assert.match(normalized, /edit_requests_review_state_check[^;]*status in \('approved', 'rejected'\)[^;]*reviewed_by is not null/);
});

test('avatars are public-read, owner-folder write-only, MIME-limited, and capped at 5 MiB', () => {
  assert.match(normalized, /insert into storage\.buckets[^;]*'avatars'[^;]*true[^;]*5242880/);
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.match(normalized, new RegExp(`'${mime}'`));
  }
  assert.match(normalized, /create policy "avatars_public_read" on storage\.objects for select to public/);
  for (const operation of ['insert', 'update', 'delete']) {
    assert.match(normalized, new RegExp(`create policy "avatars_owner_${operation}" on storage\\.objects for ${operation} to authenticated`));
  }
  assert.ok((normalized.match(/\(?storage\.foldername\s*\(\s*name\s*\)\s*\)?\s*\[\s*1\s*\][^;]*\(select auth\.uid\(\)\)/g) ?? []).length >= 3);
});

test('legacy migration, Realtime, and Data API exposure are explicit and conservative', () => {
  assert.match(normalized, /create index if not exists profiles_email_normalized_idx on public\.profiles\s*\(\s*lower\s*\(\s*btrim\s*\(\s*email\s*\)\s*\)\s*\)/);
  assert.match(normalized, /create index if not exists board_members_email_normalized_idx on public\.board_members\s*\(\s*lower\s*\(\s*btrim\s*\(\s*email\s*\)\s*\)\s*\)/);
  assert.match(normalized, /left join auth\.users[^;]*lower\s*\(\s*btrim\s*\(\s*u\.email\s*\)\s*\)[^;]*lower\s*\(\s*btrim\s*\(\s*mapped\.legacy_email\s*\)\s*\)/);
  assert.match(normalized, /update public\.profiles set contact_email = email where contact_email is null/);
  assert.doesNotMatch(normalized, /insert into auth\.users|delete from public\.board_members/);
  assert.match(normalized, /create or replace view private\.legacy_board_assignment_candidates\b/);
  assert.match(normalized, /count\s*\([^)]*\)\s*filter[^;]*over\s*\(\s*partition by[^;]*as auth_match_count/);
  assert.match(normalized, /auth_match_count = 1[^;]*user_candidate_count = 1[^;]*position_candidate_count = 1[^;]*normalized_candidate_count = 1/);
  assert.match(normalized, /create or replace view private\.legacy_board_member_migration_review\b/);
  assert.match(normalized, /legacy_board_member_migration_review[^;]*where[^;]*(?:auth_match_count|user_candidate_count|position_candidate_count|normalized_candidate_count) <> 1/);
  assert.match(normalized, /drop policy if exists "public_read_board_members" on public\.board_members/);
  assert.match(normalized, /revoke all on table public\.board_members from anon, authenticated/);
  assert.match(normalized, /pg_publication_tables/);
  assert.match(normalized, /alter publication supabase_realtime add table public\.executive_assignments/);
  assert.match(normalized, /grant select on table public\.executive_assignments to authenticated/);
  assert.match(normalized, /grant select on table public\.edit_requests to authenticated/);
  assert.doesNotMatch(normalized, /grant (?:insert|update|delete|all)[^;]* to anon/);
});

test('legacy migration reports a position occupied by a different user', () => {
  assert.match(normalized, /left join public\.executive_assignments as position_assignment[^;]*position_assignment\.position_key = candidate\.position_key/);
  assert.match(normalized, /position_assignment\.user_id is not null[^;]*position_assignment\.user_id is distinct from candidate\.user_id[^;]*as position_assignment_conflict/);
  assert.match(normalized, /when candidate\.position_assignment_conflict then 'position_occupied_by_different_user'/);
  assert.match(normalized, /legacy_board_member_migration_review[^;]*where[^;]*candidate\.position_assignment_conflict/);
  assert.match(normalized, /from private\.legacy_board_assignment_candidates as candidate[^;]*and not candidate\.position_assignment_conflict[^;]*on conflict do nothing/);
});

test('anonymous Realtime uses a singleton PII-free directory signal instead of private identity tables', () => {
  assert.match(normalized, /create table if not exists public\.public_executive_directory_events\b/);
  assert.match(normalized, /id text primary key[^;]*check\s*\(\s*id\s*=\s*'directory'\s*\)/);
  assert.match(normalized, /version bigint not null default 0/);
  assert.match(normalized, /updated_at timestamptz not null default now\(\)/);
  const tableDefinition = normalized.match(/create table if not exists public\.public_executive_directory_events[\s\S]*?;/)?.[0] ?? '';
  assert.doesNotMatch(tableDefinition, /email|name|phone|user_id|avatar|position|committee/);

  assert.match(normalized, /alter table public\.public_executive_directory_events enable row level security/);
  const publicEventPolicy = policyDefinition('public_executive_directory_events_select');
  assert.match(publicEventPolicy, /for select to anon, authenticated using \(true\)/);
  assert.match(normalized, /revoke all on table public\.public_executive_directory_events from public, anon, authenticated/);
  assert.match(normalized, /grant select on table public\.public_executive_directory_events to anon, authenticated/);
  assert.doesNotMatch(normalized, /grant (?:insert|update|delete|all)[^;]*on table public\.public_executive_directory_events to (?:anon|authenticated)/);

  assert.match(normalized, /create or replace function private\.bump_public_executive_directory_event\(\)/);
  assert.match(normalized, /private\.bump_public_executive_directory_event\(\)[^;]*security definer[^;]*set search_path = ''/);
  const body = functionBody('bump_public_executive_directory_event');
  assert.match(body, /update public\.public_executive_directory_events/);
  assert.match(body, /version = version \+ 1/);
  assert.match(body, /updated_at = now\(\)/);
  assert.doesNotMatch(body, /new\.|old\.|email|name|phone|user_id|avatar/);
  assert.match(normalized, /revoke execute on function private\.bump_public_executive_directory_event\(\) from public, anon, authenticated, service_role/);
  assert.match(normalized, /create trigger profiles_signal_public_executive_directory[^;]*on public\.profiles[^;]*execute function private\.bump_public_executive_directory_event\(\)/);
  assert.match(normalized, /create trigger assignments_signal_public_executive_directory[^;]*on public\.executive_assignments[^;]*execute function private\.bump_public_executive_directory_event\(\)/);
  assert.match(normalized, /alter publication supabase_realtime add table public\.public_executive_directory_events/);
});

test('legacy migration reports a candidate user assigned to a different position', () => {
  assert.match(normalized, /left join public\.executive_assignments as user_assignment[^;]*user_assignment\.user_id = candidate\.user_id/);
  assert.match(normalized, /user_assignment\.position_key is not null[^;]*user_assignment\.position_key is distinct from candidate\.position_key[^;]*as user_assignment_conflict/);
  assert.match(normalized, /when candidate\.user_assignment_conflict then 'user_assigned_to_different_position'/);
  assert.match(normalized, /legacy_board_member_migration_review[^;]*where[^;]*candidate\.user_assignment_conflict/);
  assert.match(normalized, /from private\.legacy_board_assignment_candidates as candidate[^;]*and not candidate\.user_assignment_conflict[^;]*on conflict do nothing/);
});

test('legacy migration treats the exact existing user-position pair as idempotent', () => {
  assert.match(normalized, /position_assignment\.user_id = candidate\.user_id[^;]*user_assignment\.position_key = candidate\.position_key[^;]*as is_exact_existing_assignment/);
  assert.match(normalized, /legacy_board_member_migration_review[^;]*is_exact_existing_assignment/);
  assert.doesNotMatch(normalized, /legacy_board_member_migration_review[^;]*where[^;]*candidate\.is_exact_existing_assignment/);
  assert.match(normalized, /from private\.legacy_board_assignment_candidates as candidate[^;]*and not candidate\.position_assignment_conflict[^;]*and not candidate\.user_assignment_conflict[^;]*on conflict do nothing/);
});
