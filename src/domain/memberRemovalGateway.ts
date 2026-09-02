export interface MemberRemovalRpcClient {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { code?: unknown; message?: unknown } | null;
  }>;
}

export type MemberRemovalResult =
  | { ok: true; data: { userId: string; status: 'removed' } }
  | { ok: false; error: { code: string; message: string } };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeFailure = (code = 'MEMBER_REMOVAL_FAILED'): MemberRemovalResult => ({
  ok: false,
  error: { code, message: 'تعذر تأكيد طرد العضو. لم يتم تغيير الواجهة محلياً.' },
});

export function createMemberRemovalService(client: MemberRemovalRpcClient) {
  return {
    async remove(targetUserId: string): Promise<MemberRemovalResult> {
      if (!UUID_PATTERN.test(targetUserId)) return safeFailure('MEMBER_REMOVAL_TARGET_INVALID');

      let response: Awaited<ReturnType<MemberRemovalRpcClient['rpc']>>;
      try {
        response = await client.rpc('remove_member_membership', { target_user_id: targetUserId });
      } catch {
        return safeFailure('MEMBER_REMOVAL_REQUEST_FAILED');
      }
      if (response.error) {
        const code = typeof response.error.code === 'string' && response.error.code
          ? response.error.code
          : 'MEMBER_REMOVAL_FAILED';
        return safeFailure(code);
      }

      const row = Array.isArray(response.data) && response.data.length === 1
        ? response.data[0] as Record<string, unknown>
        : null;
      if (row?.removed_user_id !== targetUserId || row?.membership_status !== 'removed') {
        return safeFailure('MEMBER_REMOVAL_INVALID');
      }

      return { ok: true, data: { userId: targetUserId, status: 'removed' } };
    },
  };
}
