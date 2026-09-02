import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  initialGalleryAlbums,
  mockCommittees,
  mockEvents,
  mockNews,
} from '../src/data/mockData.ts';
import {
  buildManagedAssetPath,
  routeForUsage,
  validateManagedFile,
} from '../src/domain/managedAssets.ts';
import {
  collectLegacyImageAssets,
  replaceLegacyAssetUrls,
} from '../src/domain/legacyAssetMigration.ts';

const root = process.cwd();
const rewriteSource = process.argv.includes('--rewrite-source');

async function readEnvFile() {
  const text = await readFile(path.join(root, '.env'), 'utf8');
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const separator = trimmed.indexOf('=');
    if (separator < 1) return [];
    return [[trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')]];
  }));
}

async function listFiles(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry);
    const info = await stat(absolute);
    if (info.isDirectory()) files.push(...await listFiles(absolute));
    else if (/\.(?:ts|tsx)$/i.test(entry)) files.push(absolute);
  }
  return files;
}

function sourceImageUrls(source) {
  return [...source.matchAll(/https:\/\/images\.pexels\.com\/[^'"\s)]+/g)].map((match) => match[0]);
}

function extensionForMime(mime) {
  return mime === 'image/png' ? 'png'
    : mime === 'image/webp' ? 'webp'
      : mime === 'image/gif' ? 'gif'
        : 'jpg';
}

async function main() {
  const env = await readEnvFile();
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.MIGRATION_SUPABASE_EMAIL;
  const password = process.env.MIGRATION_SUPABASE_PASSWORD;
  if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in .env.');
  if (!email || !password) throw new Error('Set MIGRATION_SUPABASE_EMAIL and MIGRATION_SUPABASE_PASSWORD for the current president.');

  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: login, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
  if (loginError || !login.user) throw loginError ?? new Error('President login failed.');
  const ownerId = login.user.id;

  const { data: rows, error: loadError } = await supabase
    .from('published_site_content')
    .select('content,version')
    .eq('id', 'main')
    .limit(1);
  if (loadError) throw loadError;
  const row = rows?.[0] ?? null;
  const content = row?.content && typeof row.content === 'object'
    ? row.content
    : { events: mockEvents, news: mockNews, galleryAlbums: initialGalleryAlbums, committees: mockCommittees };

  const sources = await listFiles(path.join(root, 'src'));
  const sourceText = new Map();
  const extraUrls = new Set();
  for (const file of sources) {
    const text = await readFile(file, 'utf8');
    sourceText.set(file, text);
    sourceImageUrls(text).forEach((item) => extraUrls.add(item));
  }

  const discovered = collectLegacyImageAssets(content);
  const items = new Map(discovered.map((asset) => [`${asset.usage}\n${asset.sourceUrl}`, asset]));
  for (const sourceUrl of extraUrls) {
    if (![...items.values()].some((item) => item.sourceUrl === sourceUrl)) {
      items.set(`site-image\n${sourceUrl}`, { path: [], sourceUrl, usage: 'site-image' });
    }
  }

  const replacements = new Map();
  let completed = 0;
  for (const asset of items.values()) {
    const response = await fetch(asset.sourceUrl);
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${asset.sourceUrl}`);
    const bytes = await response.arrayBuffer();
    const mimeType = (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0].toLowerCase();
    const file = new File([bytes], `legacy.${extensionForMime(mimeType)}`, { type: mimeType });
    const route = routeForUsage(asset.usage);
    const validation = validateManagedFile(file, route.kind);
    if (!validation.ok) throw new Error(`${validation.code}: ${asset.sourceUrl}`);
    const assetId = crypto.randomUUID();
    const built = buildManagedAssetPath({ usage: asset.usage, ownerId, assetId, mimeType });
    if (!built.ok) throw new Error(`${built.code}: ${asset.sourceUrl}`);
    const { error: uploadError } = await supabase.storage.from(route.bucket).upload(built.path, file, {
      upsert: false,
      contentType: mimeType,
      cacheControl: '31536000',
    });
    if (uploadError) throw uploadError;
    const publicUrl = supabase.storage.from(route.bucket).getPublicUrl(built.path).data.publicUrl;
    const { error: registerError } = await supabase.rpc('register_managed_asset', {
      asset_id: assetId,
      asset_bucket: route.bucket,
      asset_path: built.path,
      asset_public_url: publicUrl,
      asset_kind: route.kind,
      asset_area: route.area,
      asset_mime_type: mimeType,
      asset_size_bytes: file.size,
    });
    if (registerError) {
      await supabase.storage.from(route.bucket).remove([built.path]);
      throw registerError;
    }
    const { error: activateError } = await supabase.rpc('set_managed_asset_status', { asset_id: assetId, next_status: 'active' });
    if (activateError) throw activateError;
    if (!replacements.has(asset.sourceUrl)) replacements.set(asset.sourceUrl, publicUrl);
    completed += 1;
    process.stdout.write(`Migrated ${completed}/${items.size}\r`);
  }

  const nextContent = replaceLegacyAssetUrls(content, replacements);
  const { error: publishError } = await supabase.rpc('publish_site_content', {
    new_content: nextContent,
    expected_version: Number(row?.version ?? 0),
  });
  if (publishError) throw publishError;

  const artifact = Object.fromEntries([...replacements.entries()].sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(path.join(root, 'managed-asset-url-map.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  if (rewriteSource) {
    for (const [file, text] of sourceText) {
      let next = text;
      for (const [before, after] of replacements) next = next.split(before).join(after);
      if (next !== text) await writeFile(file, next, 'utf8');
    }
  }
  await supabase.auth.signOut();
  process.stdout.write(`\nMigrated ${completed} managed images and published version ${Number(row?.version ?? 0) + 1}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
