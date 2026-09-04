import {
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageRequiredString,
} from '../messages/mechanics';

export interface RefactorExecutionBindingV1 {
  readonly recommendationId: string;
  readonly recommendationDigest: string;
  readonly taskId: string;
  readonly taskRevision: string;
  readonly planPath: string;
  readonly planSha256: string;
  readonly contractPath: string;
  readonly contractSha256: string;
  readonly cutoverClosureSha256: string;
  readonly acceptanceReceiptSha256: string;
  readonly pullRequestNumber: number;
  readonly pullRequestHeadSha: string;
  readonly mergeCommitSha: string;
  readonly bindingSha256: string;
}

export class RefactorExecutionBindingError extends Error {
  readonly code = 'refactor_execution_binding_invalid' as const;
  constructor(message: string) { super(message); this.name = 'RefactorExecutionBindingError'; }
}
function invalid(message: string): never { throw new RefactorExecutionBindingError(message); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('execution binding must be an object'); return value as Record<string, unknown>; }
function text(value: unknown, field: string, pattern: RegExp): string { const result = messageRequiredString(value, field, invalid); if (!pattern.test(result)) invalid(`${field} is invalid`); return result; }
function sha(value: unknown, field: string): string { const result = messageRequiredString(value, field, invalid); assertMessageSha256(result, field, invalid); return result; }
function path(value: unknown, field: string): string { const result = text(value, field, /^[^\u0000-\u001f\u007f\\]{1,512}$/u); if (result.startsWith('/') || result.startsWith('-') || result.split('/').some((part) => !part || part === '.' || part === '..')) invalid(`${field} is unsafe`); return result; }
function commit(value: unknown, field: string): string { return text(value, field, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u); }

type BuildInput = Omit<RefactorExecutionBindingV1, 'bindingSha256'>;

export function buildRefactorExecutionBinding(input: BuildInput): RefactorExecutionBindingV1 {
  assertMessageInteger(input.pullRequestNumber, 'pullRequestNumber', 1, invalid);
  const basis = {
    recommendationId: text(input.recommendationId, 'recommendationId', /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u),
    recommendationDigest: sha(input.recommendationDigest, 'recommendationDigest'),
    taskId: text(input.taskId, 'taskId', /^[a-f0-9]{64}$/u), taskRevision: text(input.taskRevision, 'taskRevision', /^[a-f0-9]{64}$/u),
    planPath: path(input.planPath, 'planPath'), planSha256: sha(input.planSha256, 'planSha256'),
    contractPath: path(input.contractPath, 'contractPath'), contractSha256: sha(input.contractSha256, 'contractSha256'),
    cutoverClosureSha256: sha(input.cutoverClosureSha256, 'cutoverClosureSha256'), acceptanceReceiptSha256: sha(input.acceptanceReceiptSha256, 'acceptanceReceiptSha256'),
    pullRequestNumber: input.pullRequestNumber, pullRequestHeadSha: commit(input.pullRequestHeadSha, 'pullRequestHeadSha'), mergeCommitSha: commit(input.mergeCommitSha, 'mergeCommitSha'),
  } as const;
  return Object.freeze({ ...basis, bindingSha256: canonicalMessageDigest(basis) });
}

export function validateRefactorExecutionBinding(value: unknown): RefactorExecutionBindingV1 {
  const input = record(value); assertMessageExactKeys(input, ['recommendationId', 'recommendationDigest', 'taskId', 'taskRevision', 'planPath', 'planSha256', 'contractPath', 'contractSha256', 'cutoverClosureSha256', 'acceptanceReceiptSha256', 'pullRequestNumber', 'pullRequestHeadSha', 'mergeCommitSha', 'bindingSha256'], 'execution binding', invalid);
  const built = buildRefactorExecutionBinding(input as unknown as BuildInput);
  if (input.bindingSha256 !== built.bindingSha256) invalid('bindingSha256 is stale');
  return built;
}

export const canonicalRefactorExecutionBindingBytes = (value: RefactorExecutionBindingV1): string => canonicalMessageBytes(validateRefactorExecutionBinding(value) as unknown as Record<string, unknown>);
