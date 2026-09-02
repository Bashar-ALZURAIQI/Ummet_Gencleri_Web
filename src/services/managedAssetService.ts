import { Upload } from 'tus-js-client';
import {
  buildManagedAssetPath,
  routeForUsage,
  validateManagedFile,
  type ManagedAssetUsage,
} from '../domain/managedAssets.ts';
import type { ServiceResult } from '../lib/supabase.ts';

export interface ManagedAssetReference {
  id: string;
  bucket: 'avatars' | 'gallery' | 'site_assets';
  path: string;
  publicUrl: string;
  kind: 'image' | 'video' | 'document';
  area: 'news' | 'events' | 'gallery' | 'site' | 'plans' | 'reports' | 'avatar';
  mimeType: string;
  sizeBytes: number;
}

export const MANAGED_ASSET_LOOKUP_COLUMNS = 'id,bucket,object_path,public_url,kind,area,mime_type,size_bytes';

interface ManagedAssetLookupError {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

interface ManagedAssetLookupQuery {
  select(columns: string): ManagedAssetLookupQuery;
  eq(column: 'bucket' | 'object_path', value: string): ManagedAssetLookupQuery;
  maybeSingle(): Promise<{ data: unknown; error: ManagedAssetLookupError | null }>;
}

export interface ManagedAssetLookupClient {
  from(table: 'managed_assets'): ManagedAssetLookupQuery;
}

type SupabaseClient = typeof import('../lib/supabase.ts').supabase;

const serviceSuccess = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

function serviceFailure<T>(error: unknown, fallbackCode: string, fallbackMessage: string): ServiceResult<T> {
  const candidate = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown; details?: unknown }
    : undefined;
  return {
    ok: false,
    error: {
      code: typeof candidate?.code === 'string' && candidate.code ? candidate.code : fallbackCode,
      message: typeof candidate?.message === 'string' && candidate.message
        ? candidate.message
        : fallbackMessage,
      ...(typeof candidate?.details === 'string' && candidate.details ? { details: candidate.details } : {}),
    },
  };
}

async function getSupabase(): Promise<SupabaseClient> {
  const { supabase } = await import('../lib/supabase.ts');
  return supabase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isManagedAssetBucket(value: unknown): value is ManagedAssetReference['bucket'] {
  return value === 'avatars' || value === 'gallery' || value === 'site_assets';
}

function isManagedAssetKind(value: unknown): value is ManagedAssetReference['kind'] {
  return value === 'image' || value === 'video' || value === 'document';
}

function isManagedAssetArea(value: unknown): value is ManagedAssetReference['area'] {
  return value === 'news' || value === 'events' || value === 'gallery' || value === 'site'
    || value === 'plans' || value === 'reports' || value === 'avatar';
}

function mapManagedAssetReference(value: unknown): ServiceResult<ManagedAssetReference> {
  if (!isRecord(value)
    || typeof value.id !== 'string' || !value.id
    || !isManagedAssetBucket(value.bucket)
    || typeof value.object_path !== 'string' || !value.object_path
    || typeof value.public_url !== 'string' || !value.public_url
    || !isManagedAssetKind(value.kind)
    || !isManagedAssetArea(value.area)
    || typeof value.mime_type !== 'string' || !value.mime_type
    || typeof value.size_bytes !== 'number'
    || !Number.isSafeInteger(value.size_bytes) || value.size_bytes < 0) {
    return {
      ok: false,
      error: {
        code: 'ASSET_LOOKUP_RESPONSE_INVALID',
        message: 'أعاد الخادم بيانات ملف غير صالحة.',
      },
    };
  }
  return serviceSuccess({
    id: value.id,
    bucket: value.bucket,
    path: value.object_path,
    publicUrl: value.public_url,
    kind: value.kind,
    area: value.area,
    mimeType: value.mime_type,
    sizeBytes: value.size_bytes,
  });
}

export function createManagedAssetRepository(client: ManagedAssetLookupClient) {
  return {
    async findManagedAssetByPath(
      bucket: ManagedAssetReference['bucket'],
      path: string,
    ): Promise<ServiceResult<ManagedAssetReference | null>> {
      const { data, error } = await client
        .from('managed_assets')
        .select(MANAGED_ASSET_LOOKUP_COLUMNS)
        .eq('bucket', bucket)
        .eq('object_path', path)
        .maybeSingle();
      if (error) {
        return {
          ok: false,
          error: {
            code: 'ASSET_LOOKUP_FAILED',
            message: 'تعذر التحقق من الملف المسجل.',
            ...(typeof error.details === 'string' && error.details ? { details: error.details } : {}),
          },
        };
      }
      if (data === null) return serviceSuccess(null);
      return mapManagedAssetReference(data);
    },
  };
}

export async function findManagedAssetByPath(
  bucket: ManagedAssetReference['bucket'],
  path: string,
): Promise<ServiceResult<ManagedAssetReference | null>> {
  const client = await getSupabase();
  return createManagedAssetRepository(client as unknown as ManagedAssetLookupClient)
    .findManagedAssetByPath(bucket, path);
}

export interface UploadManagedAssetInput {
  usage: ManagedAssetUsage;
  ownerId: string;
  file: File;
  assetId?: string;
}

const STANDARD_UPLOAD_LIMIT = 6 * 1024 * 1024;

function resumableEndpoint(): string {
  const apiUrl = String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '');
  const directStorageUrl = apiUrl.replace(/\.supabase\.co$/i, '.storage.supabase.co');
  return `${directStorageUrl}/storage/v1/upload/resumable`;
}

async function uploadResumable(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<ServiceResult<void>> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return serviceFailure(error, 'UPLOAD_SESSION_MISSING', 'انتهت جلسة الدخول قبل رفع الملف.');
  }

  return new Promise((resolve) => {
    const upload = new Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type,
        cacheControl: '3600',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      onError: (uploadError) => {
        resolve(serviceFailure(uploadError, 'ASSET_UPLOAD_FAILED', 'تعذر رفع الملف إلى التخزين.'));
      },
      onProgress: (uploaded, total) => {
        onProgress?.(total > 0 ? Math.round((uploaded / total) * 100) : 0);
      },
      onSuccess: () => {
        onProgress?.(100);
        resolve(serviceSuccess(undefined));
      },
    });

    void upload.findPreviousUploads()
      .then((previous) => {
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch((uploadError) => {
        resolve(serviceFailure(uploadError, 'ASSET_RESUME_FAILED', 'تعذر بدء الرفع القابل للاستئناف.'));
      });
  });
}

export async function uploadManagedAsset(
  input: UploadManagedAssetInput,
  onProgress?: (percentage: number) => void,
): Promise<ServiceResult<ManagedAssetReference>> {
  const route = routeForUsage(input.usage);
  const validation = validateManagedFile(input.file, route.kind, input.usage);
  if (!validation.ok) {
    return serviceFailure(null, validation.code, validation.message);
  }
  const assetId = input.assetId ?? globalThis.crypto?.randomUUID?.();
  if (!assetId) {
    return serviceFailure(null, 'ASSET_ID_UNAVAILABLE', 'تعذر إنشاء معرّف آمن للملف.');
  }
  const pathResult = buildManagedAssetPath({
    usage: input.usage,
    ownerId: input.ownerId,
    assetId,
    mimeType: input.file.type,
  });
  if (!pathResult.ok) {
    return serviceFailure(null, pathResult.code, pathResult.message);
  }

  const supabase = await getSupabase();
  onProgress?.(0);
  const uploadResult = input.file.size > STANDARD_UPLOAD_LIMIT
    ? await uploadResumable(route.bucket, pathResult.path, input.file, onProgress)
    : await (async () => {
      const uploaded = await supabase.storage.from(route.bucket).upload(pathResult.path, input.file, {
        upsert: false,
        contentType: input.file.type,
        cacheControl: '3600',
      });
      if (uploaded.error) {
        return serviceFailure<void>(uploaded.error, 'ASSET_UPLOAD_FAILED', 'تعذر رفع الملف إلى التخزين.');
      }
      onProgress?.(100);
      return serviceSuccess(undefined);
    })();
  if (!uploadResult.ok) return uploadResult;

  const { data } = supabase.storage.from(route.bucket).getPublicUrl(pathResult.path);
  return serviceSuccess({
    id: assetId,
    bucket: route.bucket,
    path: pathResult.path,
    publicUrl: data.publicUrl,
    kind: route.kind,
    area: route.area,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
  });
}

export async function registerManagedAsset(
  asset: ManagedAssetReference,
): Promise<ServiceResult<ManagedAssetReference>> {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc('register_managed_asset', {
    asset_id: asset.id,
    asset_bucket: asset.bucket,
    asset_path: asset.path,
    asset_public_url: asset.publicUrl,
    asset_kind: asset.kind,
    asset_area: asset.area,
    asset_mime_type: asset.mimeType,
    asset_size_bytes: asset.sizeBytes,
  });
  return error
    ? serviceFailure(error, 'ASSET_REGISTER_FAILED', 'رُفع الملف لكن تعذر تسجيله في قاعدة البيانات.')
    : serviceSuccess(asset);
}

export async function setManagedAssetStatus(
  assetId: string,
  status: 'active' | 'replaced' | 'orphaned',
): Promise<ServiceResult<void>> {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc('set_managed_asset_status', {
    asset_id: assetId,
    next_status: status,
  });
  return error
    ? serviceFailure(error, 'ASSET_STATUS_FAILED', 'تعذر تحديث حالة الملف في قاعدة البيانات.')
    : serviceSuccess(undefined);
}

export async function removeManagedAssetObject(
  asset: Pick<ManagedAssetReference, 'bucket' | 'path'>,
): Promise<ServiceResult<void>> {
  const supabase = await getSupabase();
  const { error } = await supabase.storage.from(asset.bucket).remove([asset.path]);
  return error
    ? serviceFailure(error, 'ASSET_REMOVE_FAILED', 'تعذر تنظيف الملف من التخزين.')
    : serviceSuccess(undefined);
}

export async function bindPresidentManagedMemberAvatar(input: {
  targetUserId: string;
  expectedOldPath: string | null;
  asset: ManagedAssetReference;
}): Promise<ServiceResult<{ oldPath: string | null; avatarPath: string }>> {
  if (input.asset.bucket !== 'avatars' || input.asset.area !== 'avatar') {
    return serviceFailure(null, 'MEMBER_AVATAR_ASSET_INVALID', 'الملف المحدد ليس صورة شخصية صالحة.');
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('replace_member_avatar', {
    target_user_id: input.targetUserId,
    expected_old_path: input.expectedOldPath,
    new_path: input.asset.path,
  });
  if (error) return serviceFailure(error, 'MEMBER_AVATAR_BIND_FAILED', 'تعذر ربط الصورة بحساب العضو.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || (row as { avatar_path?: unknown }).avatar_path !== input.asset.path) {
    return serviceFailure(null, 'MEMBER_AVATAR_CONFIRMATION_INVALID', 'لم تؤكد قاعدة البيانات تغيير صورة العضو.');
  }
  const oldPath = typeof (row as { old_path?: unknown }).old_path === 'string'
    ? (row as { old_path: string }).old_path
    : null;
  await setManagedAssetStatus(input.asset.id, 'active');
  if (oldPath && oldPath !== input.asset.path && oldPath.startsWith(`${input.targetUserId}/`)) {
    await supabase.storage.from('avatars').remove([oldPath]);
  }
  return serviceSuccess({ oldPath, avatarPath: input.asset.path });
}
