/**
 * Frontend AzureTranslator Client (Task 7D).
 *
 * Security Invariant:
 * - This frontend service NEVER holds Azure credentials or endpoints.
 * - All translation requests are forwarded to the secure Supabase Edge Function:
 *   `translate-cms-content`.
 * - Zero direct calls to Azure Cognitive Services from the browser.
 */

import { supabase } from '../../lib/supabase.ts';
import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
} from './types.ts';

interface SupabaseFunctionsClient {
  functions: {
    invoke: (
      functionName: string,
      options?: { body?: unknown; headers?: Record<string, string> },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
}

export class AzureTranslator implements TranslationProvider {
  private client: SupabaseFunctionsClient;

  constructor(client: SupabaseFunctionsClient = supabase as unknown as SupabaseFunctionsClient) {
    this.client = client;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!request.fields || Object.keys(request.fields).length === 0) {
      return {
        targetLocale: request.targetLocale,
        translations: {},
      };
    }

    const { data, error } = await this.client.functions.invoke('translate-cms-content', {
      body: {
        sourceLocale: request.sourceLocale,
        targetLocale: request.targetLocale,
        fields: request.fields,
      },
    });

    if (error || !data || typeof data !== 'object') {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'TRANSLATION_FAILED';
      throw new Error(message);
    }

    const response = data as {
      targetLocale?: string;
      translations?: Record<string, string>;
      error?: string;
    };

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.translations || typeof response.translations !== 'object') {
      throw new Error('MALFORMED_TRANSLATION_RESPONSE');
    }

    return {
      targetLocale: request.targetLocale,
      translations: response.translations,
    };
  }
}

export const defaultAzureTranslator = new AzureTranslator();
