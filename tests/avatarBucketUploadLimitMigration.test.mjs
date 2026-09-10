import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION_FILE = '20260910120000_raise_avatar_upload_limit.sql';
const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const migrations = readdirSync(fileURLToPath(migrationsUrl)).sort();
const fileName = migrations.find((name) => name.endsWith(MIGRATION_FILE) || name === MIGRATION_FILE);
assert.ok(fileName, 'missing avatar upload limit migration');

const sql = readFileSync(fileURLToPath(new URL(fileName, migrationsUrl)), 'utf8');
const normalized = sql.toLowerCase();

test('avatars bucket limit migration is applied after every existing migration', () => {
  assert.ok(migrations.indexOf(fileName) === migrations.length - 1, 'avatar limit migration must be the newest migration');
});

test('raises only the avatars bucket file_size_limit to 10 MB while keeping MIME types', () => {
  assert.match(normalized, /insert into storage\.buckets[\s\S]*'avatars'[\s\S]*10485760/);
  assert.match(normalized, /'avatars'[\s\S]*'avatars'[\s\S]*true[\s\S]*10485760/);
  assert.match(normalized, /'image\/jpeg'[\s\S]*'image\/png'[\s\S]*'image\/webp'/);
  assert.match(normalized, /on conflict \(id\) do update[\s\S]*file_size_limit = excluded\.file_size_limit/);
  assert.match(normalized, /allowed_mime_types = excluded\.allowed_mime_types/);
});

test('avatar limit migration never mutates gallery or site_assets buckets', () => {
  assert.doesNotMatch(normalized, /'gallery'/);
  assert.doesNotMatch(normalized, /'site_assets'/);
});