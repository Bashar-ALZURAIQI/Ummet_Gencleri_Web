import type { UserRole } from '../data/mockData.ts';

type ExecutiveRole = Exclude<UserRole, 'STUDENT'>;

export interface TransferExecutiveAssignmentResult {
  transferredPosition: ExecutiveRole;
  previousUserId: string | null;
  newUserId: string;
  targetPreviousPosition: ExecutiveRole | null;
  assignedBy: string;
  assignedAt: string;
}

interface TransferOutcomeError {
  code: string;
  message: string;
}

export type ExecutiveTransferServiceOutcome =
  | { kind: 'confirmed'; data: TransferExecutiveAssignmentResult }
  | { kind: 'definitive-failure'; error: TransferOutcomeError }
  | { kind: 'indeterminate'; error: TransferOutcomeError };

interface RpcResponse {
  data: unknown;
  error: unknown;
}

const EXECUTIVE_ROLES = new Set<ExecutiveRole>([
  'PRESIDENT',
  'VICE_PRESIDENT',
  'MEDIA_HEAD',
  'FINANCE_HEAD',
  'AUDIT_HEAD',
  'ACADEMIC_HEAD',
  'ACTIVITIES_HEAD',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeIndeterminate = (): ExecutiveTransferServiceOutcome => ({
  kind: 'indeterminate',
  error: {
    code: 'ASSIGNMENT_TRANSFER_INDETERMINATE',
    message: 'The assignment transfer result could not be confirmed safely.',
  },
});

const errorCode = (error: unknown): string | null => {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code ? code.toUpperCase() : null;
};

// These stable PostgreSQL SQLSTATE responses prove that the database rejected
// and rolled back the RPC. Connection/PostgREST/unknown codes intentionally do
// not qualify; uncertainty must fail closed.
export function isProvenNoCommitTransferError(error: unknown): boolean {
  const code = errorCode(error);
  return code === '42501'
    || code === '22023'
    || (code !== null && /^23[0-9A-Z]{3}$/.test(code));
}

const executiveRole = (value: unknown): ExecutiveRole | null => (
  typeof value === 'string' && EXECUTIVE_ROLES.has(value as ExecutiveRole)
    ? value as ExecutiveRole
    : null
);

const optionalUuid = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
};

const parseConfirmedRow = (data: unknown): TransferExecutiveAssignmentResult | null => {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const row = data[0];
  if (!row || typeof row !== 'object') return null;
  const values = row as Record<string, unknown>;
  const transferredPosition = executiveRole(values.transferred_position);
  const previousUserId = optionalUuid(values.previous_user_id);
  const newUserId = optionalUuid(values.new_user_id);
  const targetPreviousPosition = values.target_previous_position === null
    ? null
    : executiveRole(values.target_previous_position) ?? undefined;
  const assignedBy = optionalUuid(values.assigned_by);
  const assignedAt = values.assigned_at;

  if (!transferredPosition
    || previousUserId === undefined
    || !newUserId
    || targetPreviousPosition === undefined
    || !assignedBy
    || typeof assignedAt !== 'string'
    || !assignedAt
    || !Number.isFinite(Date.parse(assignedAt))) {
    return null;
  }

  return {
    transferredPosition,
    previousUserId,
    newUserId,
    targetPreviousPosition,
    assignedBy,
    assignedAt,
  };
};

export function classifyTransferRpcResult(response: RpcResponse): ExecutiveTransferServiceOutcome {
  if (response.error) {
    if (isProvenNoCommitTransferError(response.error)) {
      return {
        kind: 'definitive-failure',
        error: {
          code: errorCode(response.error) ?? 'ASSIGNMENT_TRANSFER_REJECTED',
          message: 'The database rejected and rolled back the assignment transfer.',
        },
      };
    }
    return safeIndeterminate();
  }

  const confirmed = parseConfirmedRow(response.data);
  return confirmed ? { kind: 'confirmed', data: confirmed } : safeIndeterminate();
}

export async function executeTransferRpcRequest(
  request: () => Promise<RpcResponse>,
): Promise<ExecutiveTransferServiceOutcome> {
  try {
    return classifyTransferRpcResult(await request());
  } catch {
    return safeIndeterminate();
  }
}
