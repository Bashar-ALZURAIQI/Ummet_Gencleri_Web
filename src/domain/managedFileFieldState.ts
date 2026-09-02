import type { ManagedFileLike } from './managedAssets.ts';

export type ManagedFileFieldPhase = 'idle' | 'selected' | 'uploading' | 'uploaded' | 'error';

export interface ManagedFileFieldState<TFile extends ManagedFileLike = ManagedFileLike> {
  currentUrl: string;
  file: TFile | null;
  previewUrl: string | null;
  phase: ManagedFileFieldPhase;
  progress: number;
  error: string | null;
}

export interface ManagedFileFieldTransition<TFile extends ManagedFileLike = ManagedFileLike> {
  state: ManagedFileFieldState<TFile>;
  revokePreviewUrl: string | null;
}

export function initialManagedFileFieldState<TFile extends ManagedFileLike = ManagedFileLike>(
  currentUrl = '',
): ManagedFileFieldState<TFile> {
  return { currentUrl, file: null, previewUrl: null, phase: 'idle', progress: 0, error: null };
}

export function selectManagedFile<TFile extends ManagedFileLike>(
  current: ManagedFileFieldState<TFile>,
  file: TFile,
  previewUrl: string | null,
): ManagedFileFieldTransition<TFile> {
  return {
    revokePreviewUrl: current.previewUrl,
    state: {
      ...current,
      file,
      previewUrl,
      phase: 'selected',
      progress: 0,
      error: null,
    },
  };
}

export function beginManagedFileUpload<TFile extends ManagedFileLike>(
  current: ManagedFileFieldState<TFile>,
): ManagedFileFieldState<TFile> {
  return { ...current, phase: 'uploading', progress: 0, error: null };
}

export function updateManagedFileProgress<TFile extends ManagedFileLike>(
  current: ManagedFileFieldState<TFile>,
  progress: number,
): ManagedFileFieldState<TFile> {
  return { ...current, progress: Math.max(0, Math.min(100, Math.round(progress))) };
}

export function failManagedFileUpload<TFile extends ManagedFileLike>(
  current: ManagedFileFieldState<TFile>,
  error: string,
): ManagedFileFieldState<TFile> {
  return { ...current, phase: 'error', error };
}

export function confirmManagedFileUpload<TFile extends ManagedFileLike>(
  current: ManagedFileFieldState<TFile>,
  publicUrl: string,
): ManagedFileFieldTransition<TFile> {
  return {
    revokePreviewUrl: current.previewUrl,
    state: {
      currentUrl: publicUrl,
      file: null,
      previewUrl: null,
      phase: 'uploaded',
      progress: 100,
      error: null,
    },
  };
}

export function clearManagedFileSelection<TFile extends ManagedFileLike>(
  current: ManagedFileFieldState<TFile>,
): ManagedFileFieldTransition<TFile> {
  return {
    revokePreviewUrl: current.previewUrl,
    state: {
      ...current,
      file: null,
      previewUrl: null,
      phase: 'idle',
      progress: 0,
      error: null,
    },
  };
}

export function isManagedFileBusy(current: ManagedFileFieldState): boolean {
  return current.phase === 'uploading';
}
