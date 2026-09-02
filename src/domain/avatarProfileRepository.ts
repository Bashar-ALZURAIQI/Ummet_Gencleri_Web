import type { ServiceResult } from '../lib/supabase.ts';
import type { ProfileRow } from './supabaseMappers.ts';

export const AVATAR_PROFILE_SELECT_COLUMNS = [
  'id',
  'name',
  'contact_email',
  'university',
  'major',
  'year',
  'phone',
  'status',
  'joined_at',
  'created_at',
  'bio',
  'avatar_path',
  'updated_at',
].join(',');

interface QueryError {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

interface QueryResponse {
  data: Record<string, unknown> | null;
  error: QueryError | null;
}

interface AvatarProfileQuery {
  update(values: { avatar_path: string | null }): AvatarProfileQuery;
  select(columns: string): AvatarProfileQuery;
  eq(column: string, value: string): AvatarProfileQuery;
  is(column: string, value: null): AvatarProfileQuery;
  single(): Promise<QueryResponse>;
  maybeSingle(): Promise<QueryResponse>;
}

export interface AvatarProfileClient {
  from(table: 'profiles'): AvatarProfileQuery;
}

const success = <T>(data: T): ServiceResult<T> => ({ ok: true, data });

function failure<T>(
  error: QueryError | null,
  fallbackCode: string,
  fallbackMessage: string,
): ServiceResult<T> {
  return {
    ok: false,
    error: {
      code: typeof error?.code === 'string' && error.code ? error.code : fallbackCode,
      message: typeof error?.message === 'string' && error.message ? error.message : fallbackMessage,
      ...(typeof error?.details === 'string' && error.details
        ? { details: error.details }
        : {}),
    },
  };
}

export function createAvatarProfileRepository(client: AvatarProfileClient) {
  return {
    async loadAvatarPath(userId: string): Promise<ServiceResult<string | null>> {
      const { data, error } = await client
        .from('profiles')
        .select('avatar_path')
        .eq('id', userId)
        .single();
      if (error) {
        return failure(error, 'AVATAR_PROFILE_LOAD_FAILED', 'Unable to load the current avatar path.');
      }
      const avatarPath = data?.avatar_path;
      return success(typeof avatarPath === 'string' && avatarPath ? avatarPath : null);
    },

    async compareAndSetAvatarPath(
      userId: string,
      expectedPath: string | null,
      nextPath: string | null,
    ): Promise<ServiceResult<ProfileRow>> {
      let update = client
        .from('profiles')
        .update({ avatar_path: nextPath })
        .eq('id', userId);
      update = expectedPath === null
        ? update.is('avatar_path', null)
        : update.eq('avatar_path', expectedPath);

      const { data, error } = await update
        .select(AVATAR_PROFILE_SELECT_COLUMNS)
        .maybeSingle();
      if (error) {
        return failure(error, 'AVATAR_PROFILE_UPDATE_FAILED', 'Unable to confirm the avatar profile update.');
      }
      if (!data) {
        return failure(
          null,
          'AVATAR_CONFLICT',
          'The avatar changed before this operation could be confirmed.',
        );
      }
      return success(data as ProfileRow);
    },
  };
}
