import type { ManagedAssetReference } from './managedAssetService.ts';

type SiteLogoContent = { brand: { logoUrl?: unknown; logoPath?: unknown } };

export interface AtomicSiteLogoPublication<TContent extends SiteLogoContent> {
  content: TContent;
  version: number;
  updatedAt: string;
  newAsset: ManagedAssetReference;
  oldAsset: ManagedAssetReference | null;
}

export interface ReplaceSiteLogoRequest<TContent extends SiteLogoContent> {
  newContent: TContent;
  expectedVersion: number;
  newAsset: ManagedAssetReference;
}

interface AtomicSiteLogoPublicationError {
  code: string;
  message: string;
}

export type AtomicSiteLogoPublicationOutcome<TContent extends SiteLogoContent> =
  | { kind: 'confirmed'; data: AtomicSiteLogoPublication<TContent> }
  | { kind: 'rolled-back'; error: AtomicSiteLogoPublicationError }
  | { kind: 'indeterminate'; error: AtomicSiteLogoPublicationError };

interface SiteBrandingRpcClient {
  rpc(
    name: 'replace_site_logo',
    args: { p_new_content: unknown; p_expected_version: number; p_new_asset_id: string },
  ): Promise<{ data: unknown; error: { code?: unknown; message?: unknown } | null }>;
}

const rolledBack = <TContent extends SiteLogoContent>(
  code: string,
  message: string,
): AtomicSiteLogoPublicationOutcome<TContent> => ({
  kind: 'rolled-back',
  error: { code, message },
});

const indeterminate = <TContent extends SiteLogoContent>(
  code = 'SITE_LOGO_ATOMIC_RESULT_INDETERMINATE',
): AtomicSiteLogoPublicationOutcome<TContent> => ({
  kind: 'indeterminate',
  error: {
    code,
    message: 'تعذر تأكيد نتيجة تحديث الشعار؛ حدّث الصفحة قبل إعادة المحاولة.',
  },
});

function provenRollbackSqlState(error: unknown): string | null {
  if (!isRecord(error) || typeof error.code !== 'string') return null;
  const code = error.code.toUpperCase();
  return code === '40001'
    || code === '42501'
    || code === '22023'
    || code === 'P0002'
    || /^23[0-9A-Z]{3}$/.test(code)
    ? code
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mapConfirmedAsset(
  value: unknown,
  expectedStatus: 'active' | 'replaced',
): ManagedAssetReference | null {
  if (!isRecord(value)
    || value.status !== expectedStatus
    || typeof value.id !== 'string' || !value.id
    || value.bucket !== 'site_assets'
    || typeof value.object_path !== 'string' || !value.object_path
    || typeof value.public_url !== 'string' || !value.public_url
    || value.kind !== 'image'
    || value.area !== 'site'
    || typeof value.mime_type !== 'string' || !value.mime_type
    || typeof value.size_bytes !== 'number'
    || !Number.isSafeInteger(value.size_bytes) || value.size_bytes < 0) {
    return null;
  }
  return {
    id: value.id,
    bucket: 'site_assets',
    path: value.object_path,
    publicUrl: value.public_url,
    kind: 'image',
    area: 'site',
    mimeType: value.mime_type,
    sizeBytes: value.size_bytes,
  };
}

function mapEnvelope<TContent extends SiteLogoContent>(
  value: unknown,
  input: ReplaceSiteLogoRequest<TContent>,
): AtomicSiteLogoPublicationOutcome<TContent> {
  if (!isRecord(value)
    || value.target !== 'site'
    || !isRecord(value.payload)
    || !isRecord(value.payload.brand)
    || typeof value.version !== 'number'
    || !Number.isSafeInteger(value.version)
    || value.version <= input.expectedVersion
    || typeof value.updated_at !== 'string' || !value.updated_at) {
    return indeterminate('SITE_LOGO_ATOMIC_RESPONSE_INVALID');
  }

  const confirmedNew = mapConfirmedAsset(value.new_asset, 'active');
  const confirmedOld = value.old_asset === null ? null : mapConfirmedAsset(value.old_asset, 'replaced');
  if (!confirmedNew
    || (value.old_asset !== null && !confirmedOld)
    || confirmedNew.id !== input.newAsset.id
    || confirmedNew.path !== input.newAsset.path
    || confirmedNew.publicUrl !== input.newAsset.publicUrl
    || value.payload.brand.logoPath !== confirmedNew.path
    || value.payload.brand.logoUrl !== confirmedNew.publicUrl) {
    return indeterminate('SITE_LOGO_ATOMIC_RESPONSE_INVALID');
  }

  return {
    kind: 'confirmed',
    data: {
      content: value.payload as TContent,
      version: value.version,
      updatedAt: value.updated_at,
      newAsset: confirmedNew,
      oldAsset: confirmedOld,
    },
  };
}

export function createSiteBrandingRepository(client: SiteBrandingRpcClient) {
  return {
    async replace<TContent extends SiteLogoContent>(
      input: ReplaceSiteLogoRequest<TContent>,
    ): Promise<AtomicSiteLogoPublicationOutcome<TContent>> {
      try {
        const { data, error } = await client.rpc('replace_site_logo', {
          p_new_content: input.newContent,
          p_expected_version: input.expectedVersion,
          p_new_asset_id: input.newAsset.id,
        });
        if (error) {
          const sqlState = provenRollbackSqlState(error);
          if (!sqlState) return indeterminate();
          if (sqlState === '40001') {
            return rolledBack('CONTENT_VERSION_CONFLICT', 'نُشر تعديل أحدث. حدّث الصفحة ثم أعد المحاولة.');
          }
          if (sqlState === '42501') {
            return rolledBack('42501', 'ليس لديك صلاحية نشر شعار الموقع.');
          }
          return rolledBack(sqlState, 'رفضت قاعدة البيانات نشر شعار الموقع وتراجعت عن التغيير.');
        }
        return mapEnvelope(data, input);
      } catch {
        return indeterminate();
      }
    },
  };
}

export async function replacePublishedSiteLogo<TContent extends SiteLogoContent>(
  input: ReplaceSiteLogoRequest<TContent>,
): Promise<AtomicSiteLogoPublicationOutcome<TContent>> {
  const { supabase } = await import('../lib/supabase.ts');
  return createSiteBrandingRepository(supabase as unknown as SiteBrandingRpcClient).replace(input);
}
