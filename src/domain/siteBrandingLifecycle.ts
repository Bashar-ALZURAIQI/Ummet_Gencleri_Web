import type { ConfirmedAuthOwner } from './confirmedAuthOwner.ts';
import type { ServiceResult } from '../lib/supabase.ts';
import type { ManagedAssetReference } from '../services/managedAssetService.ts';
import type {
  AtomicSiteLogoPublication,
  AtomicSiteLogoPublicationOutcome,
} from '../services/siteBrandingService.ts';

interface SiteBrand {
  logoUrl?: string;
  logoPath?: string;
  [key: string]: unknown;
}

export interface SiteBrandingContent {
  brand: SiteBrand;
}

export type SiteLogoReplacement = ManagedAssetReference & { warnings: string[] };

export type SiteLogoReplacementResult =
  | { ok: true; data: SiteLogoReplacement }
  | {
    ok: false;
    error: { code: string; message: string; details?: string };
    committed: boolean;
    warnings: string[];
  };

export interface AtomicSiteBrandingLifecycleInput<TContent extends SiteBrandingContent> {
  siteContent: TContent;
  expectedVersion: number;
  captureOwner: () => ConfirmedAuthOwner | null;
  upload: (owner: ConfirmedAuthOwner) => Promise<ServiceResult<ManagedAssetReference>>;
  register: (asset: ManagedAssetReference) => Promise<ServiceResult<ManagedAssetReference>>;
  publishAtomically: (input: {
    newContent: TContent;
    expectedVersion: number;
    newAsset: ManagedAssetReference;
  }) => Promise<AtomicSiteLogoPublicationOutcome<TContent>>;
  applyPublication: (publication: AtomicSiteLogoPublication<TContent>) => void;
  removeObject: (
    asset: Pick<ManagedAssetReference, 'bucket' | 'path'> & { id?: string },
  ) => Promise<ServiceResult<void>>;
  markOrphaned: (assetId: string) => Promise<ServiceResult<void>>;
}

const fail = (
  error: { code: string; message: string; details?: string },
  committed = false,
  warnings: string[] = [],
): SiteLogoReplacementResult => ({ ok: false, error, committed, warnings });

const OPERATION_OWNER_CHANGED_ERROR = {
  code: 'OPERATION_OWNER_CHANGED',
  message: 'تغير حساب الرئيس أثناء تحديث الشعار، لذلك لم يُنشر التعديل.',
};

const INDETERMINATE_OUTCOME_ERROR = {
  code: 'SITE_LOGO_ATOMIC_RESULT_INDETERMINATE',
  message: 'تعذر تأكيد نتيجة تحديث الشعار؛ حدّث الصفحة قبل إعادة المحاولة.',
};

function sameOwner(current: ConfirmedAuthOwner | null, original: ConfirmedAuthOwner): boolean {
  return Boolean(current
    && current.userId === original.userId
    && current.epoch === original.epoch
    && current.role === 'PRESIDENT');
}

async function attempt(
  operation: () => Promise<ServiceResult<void>>,
  thrownMessage: string,
): Promise<string | null> {
  try {
    const result = await operation();
    return result.ok ? null : result.error.message;
  } catch {
    return thrownMessage;
  }
}

async function rollbackNewAsset<TContent extends SiteBrandingContent>(
  input: AtomicSiteBrandingLifecycleInput<TContent>,
  asset: ManagedAssetReference,
  registered: boolean,
): Promise<string[]> {
  const warnings: string[] = [];
  if (registered) {
    const orphanWarning = await attempt(
      () => input.markOrphaned(asset.id),
      'تعذر تعليم ملف الشعار الجديد كملف يتيم أثناء التراجع.',
    );
    if (orphanWarning) return [orphanWarning];
  }
  const removalWarning = await attempt(
    () => input.removeObject(asset),
    'تعذر حذف ملف الشعار الجديد من التخزين أثناء التراجع.',
  );
  if (removalWarning) warnings.push(removalWarning);
  return warnings;
}

export async function replaceSiteLogoAtomically<TContent extends SiteBrandingContent>(
  input: AtomicSiteBrandingLifecycleInput<TContent>,
): Promise<SiteLogoReplacementResult> {
  const owner = input.captureOwner();
  if (!owner || owner.role !== 'PRESIDENT') {
    return fail({
      code: 'SITE_LOGO_FORBIDDEN',
      message: 'الرئيس الحالي فقط يمكنه تغيير شعار الاتحاد.',
    });
  }

  const uploaded = await input.upload(owner);
  if (!uploaded.ok) return fail(uploaded.error);
  const uploadedAsset = uploaded.data;

  if (!sameOwner(input.captureOwner(), owner)) {
    const warnings = await rollbackNewAsset(input, uploadedAsset, false);
    return fail(OPERATION_OWNER_CHANGED_ERROR, false, warnings);
  }

  const registered = await input.register(uploadedAsset);
  if (!registered.ok) {
    const warnings = await rollbackNewAsset(input, uploadedAsset, false);
    return fail(registered.error, false, warnings);
  }
  const newAsset = registered.data;

  if (!sameOwner(input.captureOwner(), owner)) {
    const warnings = await rollbackNewAsset(input, newAsset, true);
    return fail(OPERATION_OWNER_CHANGED_ERROR, false, warnings);
  }

  const newContent = {
    ...input.siteContent,
    brand: {
      ...input.siteContent.brand,
      logoUrl: newAsset.publicUrl,
      logoPath: newAsset.path,
    },
  } as TContent;
  const published = await input.publishAtomically({
    newContent,
    expectedVersion: input.expectedVersion,
    newAsset,
  });
  if (published.kind === 'indeterminate') {
    return fail(INDETERMINATE_OUTCOME_ERROR, true);
  }
  if (published.kind === 'rolled-back') {
    const warnings = await rollbackNewAsset(input, newAsset, true);
    return fail(published.error, false, warnings);
  }

  if (!sameOwner(input.captureOwner(), owner)) {
    return fail({
      code: 'SITE_LOGO_COMMITTED_OWNER_CHANGED',
      message: 'تم تحديث الشعار في الخادم، لكن تغيّر الحساب قبل تحديث هذه الجلسة. حدّث الصفحة لرؤية النتيجة.',
    }, true);
  }

  input.applyPublication(published.data);
  const warnings: string[] = [];
  const oldAsset = published.data.oldAsset;
  if (oldAsset && oldAsset.id !== published.data.newAsset.id) {
    const cleanupWarning = await attempt(
      () => input.removeObject(oldAsset),
      'تم تحديث الشعار، لكن تعذر تنظيف الملف السابق.',
    );
    if (cleanupWarning) warnings.push(cleanupWarning);
  }

  return {
    ok: true,
    data: {
      ...published.data.newAsset,
      warnings,
    },
  };
}
