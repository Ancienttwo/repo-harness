/** The PM can select an operation, never a host command or permission. */
export const PM_OPERATIONS = ['capabilities', 'status', 'dispatch', 'follow-up', 'collect'] as const;
export type PmOperation = typeof PM_OPERATIONS[number];
export const PM_WORKER_ROLE = 'deep-worker' as const;
export const PM_MAX_INPUT_BYTES = 64 * 1024;

export interface PmTaskScope {
  repo_id: string;
  task_id: string;
  task_revision: string;
  authorization_revision: number;
  claim_id: string;
  generation: number;
}
export type PmRequest =
  | { protocol: 1; operation: 'capabilities' }
  | { protocol: 1; operation: 'status'; repo_id: string }
  | ({ protocol: 1; operation: 'dispatch'; offer_revision: string } & PmTaskScope)
  | ({ protocol: 1; operation: 'follow-up'; round: number; request_id: string; message: string } & PmTaskScope)
  | ({ protocol: 1; operation: 'collect'; round: number; request_id: string } & PmTaskScope);

interface FieldSchema {
  type?: 'string' | 'integer';
  const?: string | number;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}
const scope: Record<string, FieldSchema> = {
  repo_id: { type: 'string', pattern: '^repo_[0-9a-f]{16}$' },
  task_id: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  task_revision: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  authorization_revision: { type: 'integer', minimum: 0 },
  claim_id: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' },
  generation: { type: 'integer', minimum: 1 },
};
const requestIdentity: Record<string, FieldSchema> = {
  round: { type: 'integer', minimum: 1, maximum: 100 },
  request_id: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' },
};
function schema(operation: PmOperation, fields: Record<string, FieldSchema>) {
  const properties = { protocol: { const: 1 }, operation: { const: operation }, ...fields };
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) } as const;
}
/** Adapters project their tool inputs from this inventory. */
export const PM_OPERATION_SCHEMAS = {
  capabilities: schema('capabilities', {}),
  status: schema('status', { repo_id: scope.repo_id! }),
  dispatch: schema('dispatch', { ...scope, offer_revision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' } }),
  'follow-up': schema('follow-up', { ...scope, ...requestIdentity, message: { type: 'string', minLength: 1, maxLength: 16384 } }),
  collect: schema('collect', { ...scope, ...requestIdentity }),
};

export class PmError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = 'PmError'; }
}
export function parsePmRequest(value: unknown): PmRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PmError('pm_request_invalid');
  const record = value as Record<string, unknown>;
  if (typeof record.operation !== 'string' || !Object.hasOwn(PM_OPERATION_SCHEMAS, record.operation)) {
    throw new PmError('pm_operation_unsupported');
  }
  const selected = PM_OPERATION_SCHEMAS[record.operation as PmOperation];
  if (Object.keys(record).sort().join(',') !== [...selected.required].sort().join(',')) throw new PmError('pm_request_fields_invalid');
  for (const [name, field] of Object.entries(selected.properties) as [string, FieldSchema][]) {
    const actual = record[name];
    if (field.const !== undefined && actual !== field.const) throw new PmError('pm_request_invalid', `Invalid ${name}`);
    if (field.type === 'integer' && (!Number.isSafeInteger(actual) || (actual as number) < (field.minimum ?? 0)
      || (actual as number) > (field.maximum ?? Number.MAX_SAFE_INTEGER))) throw new PmError('pm_request_invalid', `Invalid ${name}`);
    if (field.type === 'string' && (typeof actual !== 'string' || actual.length < (field.minLength ?? 1)
      || actual.length > (field.maxLength ?? 256) || actual.includes('\0')
      || (field.pattern !== undefined && !new RegExp(field.pattern).test(actual)))) throw new PmError('pm_request_invalid', `Invalid ${name}`);
  }
  return record as unknown as PmRequest;
}
export type PmResponse = { protocol: 1; kind: 'repo-harness-pm-response'; operation: string | null } & (
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } }
);
