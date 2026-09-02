import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.resolve('supabase/migrations');
const migrationName = fs.readdirSync(migrationsDir)
  .find((name) => name.endsWith('_persistent_cms_contact_messaging.sql'));

assert.ok(migrationName, 'persistent CMS/contact migration must exist');
const sql = fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8');
const normalized = sql.replace(/\s+/g, ' ');

function functionBody(name) {
  const match = sql.match(new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`,
    'i',
  ));
  assert.ok(match, `${name} function must exist`);
  return match[0].replace(/\s+/g, ' ');
}

test('creates separate versioned guide and FAQ authorities without empty fallback data', () => {
  assert.match(normalized, /create table if not exists public\.student_guide\b/i);
  assert.match(normalized, /create table if not exists public\.faq\b/i);
  assert.match(normalized, /student_guide[^;]*quick_info text not null[^;]*sections jsonb not null[^;]*version bigint not null/i);
  assert.match(normalized, /faq[^;]*categories jsonb not null[^;]*version bigint not null/i);
  assert.match(normalized, /from public\.published_site_content/i);
  assert.match(normalized, /v_content -> 'guideSections'/i);
  assert.match(normalized, /v_content -> 'faqCategories'/i);
  assert.match(normalized, /raise exception[^;]*published guide and faq content is required/i);
});

test('creates private contact messages and one durable reply per message', () => {
  assert.match(normalized, /create table if not exists public\.contact_messages\b/i);
  assert.match(normalized, /status text not null default 'UNREAD'[^;]*status in \('UNREAD', 'READ', 'REPLIED'\)/i);
  assert.match(normalized, /sender_user_id uuid[^;]*references auth\.users\(id\)/i);
  assert.match(normalized, /create table if not exists public\.contact_message_replies\b/i);
  assert.match(normalized, /message_id uuid not null unique/i);
  assert.match(normalized, /delivery_status[^;]*'NOT_REQUIRED'[^;]*'PENDING'[^;]*'SENT'[^;]*'FAILED'/i);
});

test('enables RLS and grants only the minimum Data API surface', () => {
  for (const table of ['student_guide', 'faq', 'contact_messages', 'contact_message_replies']) {
    assert.match(normalized, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(normalized, /grant select on table public\.student_guide to anon, authenticated/i);
  assert.match(normalized, /grant select on table public\.faq to anon, authenticated/i);
  assert.doesNotMatch(normalized, /grant (?:select|insert|update|delete|all)[^;]*on table public\.contact_messages to anon/i);
  assert.doesNotMatch(normalized, /grant (?:insert|update|delete|all)[^;]*on table public\.contact_messages to authenticated/i);
  assert.doesNotMatch(normalized, /grant (?:insert|update|delete|all)[^;]*on table public\.contact_message_replies to authenticated/i);
  assert.match(normalized, /contact_messages_select_own[^;]*sender_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(normalized, /contact_messages_select_contact_admin/i);
  assert.match(normalized, /contact_replies_select_own[^;]*exists[^;]*sender_user_id = \(select auth\.uid\(\)\)/i);
});

test('extends site edit requests with structured payload and indexed pending work', () => {
  assert.match(normalized, /alter table public\.edit_requests add column if not exists site_target text/i);
  assert.match(normalized, /add column if not exists site_payload jsonb/i);
  assert.match(normalized, /add column if not exists site_base_version bigint/i);
  assert.match(normalized, /create index if not exists edit_requests_pending_site_idx/i);
  assert.match(normalized, /create index if not exists contact_messages_status_created_idx/i);
  assert.match(normalized, /create index if not exists contact_replies_delivery_pending_idx/i);
});

test('privileged CMS functions are pinned, role checked, and explicitly granted', () => {
  for (const name of [
    'submit_site_edit_request',
    'publish_cms_target',
    'approve_site_edit_request',
    'reject_site_edit_request',
  ]) {
    const body = functionBody(name);
    assert.match(body, /security definer set search_path = ''/i);
    assert.match(body, /auth\.uid\(\)/i);
    assert.match(normalized, new RegExp(`revoke execute on function public\\.${name}`, 'i'));
    assert.match(normalized, new RegExp(`grant execute on function public\\.${name}[^;]*to authenticated`, 'i'));
  }
  assert.match(functionBody('submit_site_edit_request'), /position_key = 'MEDIA_HEAD'/i);
  assert.match(functionBody('approve_site_edit_request'), /private\.is_current_president\(\)/i);
  assert.match(functionBody('approve_site_edit_request'), /for update/i);
  assert.match(functionBody('approve_site_edit_request'), /CONTENT_VERSION_CONFLICT/i);
});

test('contact RPCs derive identity, serialize replies, and expose no hidden authority input', () => {
  const submit = functionBody('submit_contact_message');
  assert.match(submit, /auth\.uid\(\)/i);
  assert.doesNotMatch(submit, /p_sender_user_id/i);

  const reply = functionBody('reply_to_contact_message');
  assert.match(reply, /position_key in \('PRESIDENT', 'VICE_PRESIDENT'\)/i);
  assert.match(reply, /for update/i);
  assert.match(reply, /insert into public\.contact_message_replies/i);
  assert.match(reply, /update public\.contact_messages/i);

  for (const name of ['submit_contact_message', 'mark_contact_message_read', 'reply_to_contact_message']) {
    const body = functionBody(name);
    assert.match(body, /security definer set search_path = ''/i);
    assert.match(normalized, new RegExp(`revoke execute on function public\\.${name}`, 'i'));
  }
  assert.match(normalized, /grant execute on function public\.submit_contact_message[^;]*to anon, authenticated/i);
  assert.match(normalized, /grant execute on function public\.reply_to_contact_message[^;]*to authenticated/i);
});
