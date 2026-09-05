import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Image as ImageIcon, Loader2, UploadCloud, Video, X } from 'lucide-react';
import {
  acceptForUsage,
  routeForUsage,
  validateManagedFile,
  type ManagedAssetUsage,
} from '../domain/managedAssets.ts';
import {
  beginManagedFileUpload,
  clearManagedFileSelection,
  confirmManagedFileUpload,
  failManagedFileUpload,
  initialManagedFileFieldState,
  selectManagedFile,
  updateManagedFileProgress,
} from '../domain/managedFileFieldState.ts';
import type { ManagedAssetReference } from '../services/managedAssetService.ts';
import type { ServiceResult } from '../lib/supabase.ts';

interface ManagedFileFieldProps {
  usage: ManagedAssetUsage;
  label: string;
  currentUrl?: string;
  successMessage?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  onUpload: (
    file: File,
    onProgress: (percentage: number) => void,
  ) => Promise<ServiceResult<ManagedAssetReference>>;
  onUploaded: (asset: ManagedAssetReference) => void;
}

function revoke(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

function formatSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ManagedFileField({
  usage,
  label,
  currentUrl = '',
  successMessage,
  required = false,
  disabled = false,
  error,
  onUpload,
  onUploaded,
}: ManagedFileFieldProps) {
  const { t } = useTranslation();
  const route = routeForUsage(usage);
  const [field, setField] = useState(() => initialManagedFileFieldState<File>(currentUrl));
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    setField((current) => current.file || current.phase === 'uploading'
      ? current
      : { ...current, currentUrl });
  }, [currentUrl]);

  useEffect(() => () => revoke(previewRef.current), []);

  const visibleUrl = field.previewUrl || field.currentUrl;
  const icon = route.kind === 'image'
    ? <ImageIcon className="h-5 w-5" />
    : route.kind === 'video'
      ? <Video className="h-5 w-5" />
      : <FileText className="h-5 w-5" />;
  const helper = useMemo(() => {
    if (usage === 'site-logo') return t('managedFiles.helperLogo', 'JPEG أو PNG أو WebP، بحد أقصى 5 MB.');
    if (route.kind === 'image') return t('managedFiles.helperImage', 'JPEG أو PNG أو WebP أو GIF، بحد أقصى 5 MB.');
    if (route.kind === 'video') return t('managedFiles.helperVideo', 'MP4 أو WebM أو MOV، بحد أقصى 50 MB.');
    return t('managedFiles.helperDoc', 'PDF أو Word أو Excel أو PowerPoint أو TXT، بحد أقصى 20 MB.');
  }, [route.kind, t, usage]);

  const choose = (file: File | null) => {
    if (!file) return;
    const validation = validateManagedFile(file, route.kind, usage);
    if (!validation.ok) {
      setField((current) => failManagedFileUpload(current, validation.message));
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    const preview = route.kind === 'document' ? null : URL.createObjectURL(file);
    const transition = selectManagedFile(field, file, preview);
    revoke(transition.revokePreviewUrl);
    previewRef.current = preview;
    setField(transition.state);
  };

  const clear = () => {
    const transition = clearManagedFileSelection(field);
    revoke(transition.revokePreviewUrl);
    previewRef.current = null;
    setField(transition.state);
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async () => {
    if (!field.file || field.phase === 'uploading') return;
    const file = field.file;
    setField((current) => beginManagedFileUpload(current));
    const result = await onUpload(file, (progress) => {
      setField((current) => updateManagedFileProgress(current, progress));
    });
    if (!result.ok) {
      setField((current) => failManagedFileUpload(current, result.error.message));
      return;
    }
    const transition = confirmManagedFileUpload(field, result.data.publicUrl);
    revoke(transition.revokePreviewUrl);
    previewRef.current = null;
    setField(transition.state);
    if (inputRef.current) inputRef.current.value = '';
    onUploaded(result.data);
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-navy-900">
        {icon}
        <span>{label}{required ? ' *' : ''}</span>
      </div>

      {visibleUrl && route.kind === 'image' && (
        <img src={visibleUrl} alt={t('managedFiles.previewAlt', { label, defaultValue: `معاينة ${label}` })} className="max-h-56 w-full rounded-xl object-cover ring-1 ring-gray-200" />
      )}
      {visibleUrl && route.kind === 'video' && (
        <video src={visibleUrl} controls className="max-h-64 w-full rounded-xl bg-black" />
      )}
      {field.file && route.kind === 'document' && (
        <div className="flex items-center gap-3 rounded-lg bg-white p-3 text-sm text-gray-700 ring-1 ring-gray-200">
          <FileText className="h-5 w-5 text-navy-600" />
          <span className="min-w-0 flex-1 truncate" dir="ltr">{field.file.name}</span>
          <span className="text-xs text-gray-400">{formatSize(field.file.size)}</span>
        </div>
      )}
      {!field.file && field.currentUrl && route.kind === 'document' && (
        <a href={field.currentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-navy-700 underline">
          <FileText className="h-4 w-4" /> {t('managedFiles.viewCurrentFile', 'عرض الملف الحالي')}
        </a>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={acceptForUsage(usage)}
        required={required && !field.currentUrl}
        disabled={disabled || field.phase === 'uploading'}
        onChange={(event) => choose(event.target.files?.[0] ?? null)}
        className="block w-full text-sm text-gray-600 file:ml-3 file:rounded-lg file:border-0 file:bg-navy-100 file:px-4 file:py-2 file:font-bold file:text-navy-800"
      />
      <p className="text-xs text-gray-500">{helper}</p>

      {field.phase === 'uploading' && (
        <div role="status" className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-navy-700">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('managedFiles.uploadingProgress', { progress: field.progress, defaultValue: `جاري الرفع... ${field.progress}%` })}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full bg-navy-700 transition-all" style={{ width: `${field.progress}%` }} />
          </div>
        </div>
      )}
      {(field.error || error) && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {field.error || error}
        </div>
      )}
      {field.phase === 'uploaded' && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          {successMessage ?? t('managedFiles.uploadedSuccess', 'تم رفع الملف، ويمكنك الآن حفظ النموذج.')}
        </div>
      )}

      {field.file && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void upload()} disabled={disabled || field.phase === 'uploading'} className="btn-primary disabled:opacity-50">
            {field.phase === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {field.phase === 'uploading' ? t('common.saving', 'جاري الرفع...') : t('managedFiles.uploadSelected', 'رفع الملف المختار')}
          </button>
          <button type="button" onClick={clear} disabled={field.phase === 'uploading'} className="btn-ghost disabled:opacity-50">
            <X className="h-4 w-4" /> {t('managedFiles.cancelSelection', 'إلغاء الاختيار')}
          </button>
        </div>
      )}
    </div>
  );
}
