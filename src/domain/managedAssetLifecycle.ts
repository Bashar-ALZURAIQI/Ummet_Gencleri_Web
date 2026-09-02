export interface ManagedLifecycleError {
  code: string;
  message: string;
  details?: string;
}

export type ManagedLifecycleResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ManagedLifecycleError };

export interface UploadedManagedAsset {
  id: string;
  bucket: string;
  path: string;
  publicUrl: string;
}

export interface ExistingManagedAsset {
  id: string;
  publicUrl: string;
}

export interface ManagedAssetMutation {
  asset: UploadedManagedAsset;
  publishedUrl: string;
  warnings: ManagedLifecycleError[];
}

export interface ManagedAssetLifecycleInput {
  oldAsset?: ExistingManagedAsset;
  upload: () => Promise<ManagedLifecycleResult<UploadedManagedAsset>>;
  register: (asset: UploadedManagedAsset) => Promise<ManagedLifecycleResult<UploadedManagedAsset>>;
  commitReference: (asset: UploadedManagedAsset) => Promise<ManagedLifecycleResult<void>>;
  activate: (assetId: string) => Promise<ManagedLifecycleResult<void>>;
  removeObject: (asset: UploadedManagedAsset) => Promise<ManagedLifecycleResult<void>>;
  markOrphaned: (assetId: string) => Promise<ManagedLifecycleResult<void>>;
  markReplaced: (assetId: string) => Promise<ManagedLifecycleResult<void>>;
  isOperationCurrent: () => boolean;
}

export type ManagedAssetLifecycleOutcome =
  | { ok: true; data: ManagedAssetMutation }
  | { ok: false; error: ManagedLifecycleError; publishedUrl: string | null };

const failure = (
  error: ManagedLifecycleError,
  publishedUrl: string | null,
): ManagedAssetLifecycleOutcome => ({ ok: false, error, publishedUrl });

const ownerChanged = (): ManagedLifecycleError => ({
  code: 'OPERATION_OWNER_CHANGED',
  message: 'تغير الحساب أثناء رفع الملف، لذلك لم يُنشر التعديل.',
});

async function rollbackNewAsset(
  input: ManagedAssetLifecycleInput,
  asset: UploadedManagedAsset,
  registered: boolean,
): Promise<ManagedLifecycleError[]> {
  const warnings: ManagedLifecycleError[] = [];
  const removal = await input.removeObject(asset);
  if (!removal.ok) warnings.push(removal.error);
  if (registered) {
    const orphaned = await input.markOrphaned(asset.id);
    if (!orphaned.ok) warnings.push(orphaned.error);
  }
  return warnings;
}

export async function replaceManagedAsset(
  input: ManagedAssetLifecycleInput,
): Promise<ManagedAssetLifecycleOutcome> {
  const oldUrl = input.oldAsset?.publicUrl ?? null;
  const upload = await input.upload();
  if (!upload.ok) return failure(upload.error, oldUrl);
  const asset = upload.data;

  if (!input.isOperationCurrent()) {
    await rollbackNewAsset(input, asset, false);
    return failure(ownerChanged(), oldUrl);
  }

  const registration = await input.register(asset);
  if (!registration.ok) {
    await rollbackNewAsset(input, asset, false);
    return failure(registration.error, oldUrl);
  }

  if (!input.isOperationCurrent()) {
    await rollbackNewAsset(input, asset, true);
    return failure(ownerChanged(), oldUrl);
  }

  const committed = await input.commitReference(registration.data);
  if (!committed.ok) {
    await rollbackNewAsset(input, asset, true);
    return failure(committed.error, oldUrl);
  }

  const warnings: ManagedLifecycleError[] = [];
  const activation = await input.activate(asset.id);
  if (!activation.ok) warnings.push(activation.error);

  if (input.oldAsset && input.oldAsset.id !== asset.id) {
    const replaced = await input.markReplaced(input.oldAsset.id);
    if (!replaced.ok) warnings.push(replaced.error);
  }

  return {
    ok: true,
    data: { asset, publishedUrl: asset.publicUrl, warnings },
  };
}

export async function createManagedAsset(
  input: Omit<ManagedAssetLifecycleInput, 'oldAsset'> & { oldAsset?: never },
): Promise<ManagedAssetLifecycleOutcome> {
  return replaceManagedAsset(input);
}

export async function discardPendingAsset(input: {
  asset: UploadedManagedAsset;
  removeObject: ManagedAssetLifecycleInput['removeObject'];
  markOrphaned: ManagedAssetLifecycleInput['markOrphaned'];
}): Promise<ManagedLifecycleResult<{ warnings: ManagedLifecycleError[] }>> {
  const warnings: ManagedLifecycleError[] = [];
  const removal = await input.removeObject(input.asset);
  if (!removal.ok) warnings.push(removal.error);
  const orphaned = await input.markOrphaned(input.asset.id);
  if (!orphaned.ok) warnings.push(orphaned.error);
  return { ok: true, data: { warnings } };
}
