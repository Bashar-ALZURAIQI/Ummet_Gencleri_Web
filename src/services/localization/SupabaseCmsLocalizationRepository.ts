import {
  type CmsLocalizationRepository,
  CmsLocalizationRepositoryError,
  type SaveLocalizationOptions,
} from '../../domain/cmsLocalizationRepository.ts';
import {
  type CmsTarget,
  type LocalizedCmsLocale,
  type CmsLocalizationRecord,
  type JsonValue,
  isLocalizedCmsLocale,
} from '../../domain/cmsLocalization.ts';
import {
  mapRowToRecord,
  mapRecordToRow,
  type CmsLocalizationRow,
} from '../../domain/cmsLocalizationMapping.ts';

// Minimal duck-typed query client interface for testing and dependency injection
export interface CmsLocalizationQueryClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

export class SupabaseCmsLocalizationRepository implements CmsLocalizationRepository {
  private client: CmsLocalizationQueryClient | null;

  constructor(client?: CmsLocalizationQueryClient) {
    this.client = client ?? null;
  }

  private async getClient(): Promise<CmsLocalizationQueryClient> {
    if (this.client) return this.client;
    const mod = await import('../../lib/supabase.ts');
    this.client = mod.supabase;
    return this.client;
  }

  private assertSupportedLocalizedLocale(
    locale: unknown,
  ): asserts locale is LocalizedCmsLocale {
    if (locale === 'ar') {
      throw new CmsLocalizationRepositoryError(
        'INVALID_LOCALE',
        'Arabic ("ar") is canonical source content and cannot be stored or queried in the localization overlay repository.',
      );
    }
    if (!isLocalizedCmsLocale(locale)) {
      throw new CmsLocalizationRepositoryError(
        'INVALID_LOCALE',
        `Locale "${String(locale)}" is not a supported target locale. Only "tr" and "en" are supported.`,
      );
    }
  }

  private verifyConcurrency(
    existing: CmsLocalizationRecord<unknown> | null,
    options?: SaveLocalizationOptions,
  ): void {
    if (!options || !existing) return;

    if (
      options.expectedSourceHash !== undefined &&
      existing.sourceHash !== options.expectedSourceHash
    ) {
      throw new CmsLocalizationRepositoryError(
        'CONFLICT',
        `Optimistic concurrency failure: expected sourceHash "${options.expectedSourceHash}", found "${existing.sourceHash}".`,
      );
    }

    if (
      options.expectedVersion !== undefined &&
      String(existing.sourceVersion) !== String(options.expectedVersion)
    ) {
      throw new CmsLocalizationRepositoryError(
        'CONFLICT',
        `Optimistic concurrency failure: expected sourceVersion "${options.expectedVersion}", found "${existing.sourceVersion}".`,
      );
    }
  }

  // --- Published Operations ---

  public async getPublished<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null> {
    this.assertSupportedLocalizedLocale(locale);
    const targetKey = target.trim();
    const client = await this.getClient();

    try {
      const { data, error } = await client
        .from('cms_localizations')
        .select('*')
        .eq('target', targetKey)
        .eq('locale', locale)
        .eq('partition', 'published')
        .maybeSingle();

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to get published localization: ${error.message}`,
        );
      }

      if (!data) return null;
      return mapRowToRecord<T>(data as CmsLocalizationRow);
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  public async getLocalization<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null> {
    return this.getPublished<T>(target, locale);
  }

  public async savePublished<T = JsonValue>(
    record: CmsLocalizationRecord<T>,
    options?: SaveLocalizationOptions,
  ): Promise<CmsLocalizationRecord<T>> {
    this.assertSupportedLocalizedLocale(record.locale);
    const client = await this.getClient();

    try {
      if (options) {
        const existing = await this.getPublished<T>(record.target, record.locale);
        this.verifyConcurrency(existing, options);
      }

      const row = mapRecordToRow(record, 'published');
      const { data, error } = await client
        .from('cms_localizations')
        .upsert(row, { onConflict: 'target,locale,partition' })
        .select()
        .single();

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to save published localization: ${error.message}`,
        );
      }

      return mapRowToRecord<T>(data as CmsLocalizationRow);
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  public async deletePublished(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<boolean> {
    this.assertSupportedLocalizedLocale(locale);
    const client = await this.getClient();

    try {
      const { error } = await client
        .from('cms_localizations')
        .delete()
        .eq('target', target.trim())
        .eq('locale', locale)
        .eq('partition', 'published');

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to delete published localization: ${error.message}`,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // --- Draft Operations ---

  public async getDraft<T = JsonValue>(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<CmsLocalizationRecord<T> | null> {
    this.assertSupportedLocalizedLocale(locale);
    const targetKey = target.trim();
    const client = await this.getClient();

    try {
      const { data, error } = await client
        .from('cms_localizations')
        .select('*')
        .eq('target', targetKey)
        .eq('locale', locale)
        .eq('partition', 'draft')
        .maybeSingle();

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to get draft localization: ${error.message}`,
        );
      }

      if (!data) return null;
      return mapRowToRecord<T>(data as CmsLocalizationRow);
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  public async saveDraft<T = JsonValue>(
    record: CmsLocalizationRecord<T>,
    options?: SaveLocalizationOptions,
  ): Promise<CmsLocalizationRecord<T>> {
    this.assertSupportedLocalizedLocale(record.locale);
    const client = await this.getClient();

    try {
      if (options) {
        const existing = await this.getDraft<T>(record.target, record.locale);
        this.verifyConcurrency(existing, options);
      }

      const row = mapRecordToRow(record, 'draft');
      const { data, error } = await client
        .from('cms_localizations')
        .upsert(row, { onConflict: 'target,locale,partition' })
        .select()
        .single();

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to save draft localization: ${error.message}`,
        );
      }

      return mapRowToRecord<T>(data as CmsLocalizationRow);
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  public async deleteDraft(
    target: CmsTarget | string,
    locale: LocalizedCmsLocale,
  ): Promise<boolean> {
    this.assertSupportedLocalizedLocale(locale);
    const client = await this.getClient();

    try {
      const { error } = await client
        .from('cms_localizations')
        .delete()
        .eq('target', target.trim())
        .eq('locale', locale)
        .eq('partition', 'draft');

      if (error) {
        throw new CmsLocalizationRepositoryError(
          'UNKNOWN',
          `Failed to delete draft localization: ${error.message}`,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof CmsLocalizationRepositoryError) throw err;
      throw new CmsLocalizationRepositoryError(
        'UNKNOWN',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
