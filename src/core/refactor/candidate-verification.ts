import { assertMessageExactKeys, assertMessageSha256, canonicalMessageBytes, canonicalMessageDigest, messageRequiredString } from '../messages/mechanics';

export interface RefactorCandidateVerificationReceiptV1 {
  readonly recommendationId: string;
  readonly recommendationDigest: string;
  readonly candidateHeadSha: string;
  readonly candidateWorktreeDigest: string;
  readonly taskId: string;
  readonly taskRevision: string;
  readonly contractPath: string;
  readonly contractSha256: string;
  readonly contractVerificationSha256: string;
  readonly cutoverClosureLocator: string;
  readonly cutoverClosureSha256: string;
  readonly candidateVerify: 'passed' | 'verify_stage_unavailable';
  readonly candidateVerifyResultSha256: string | null;
  readonly acceptanceReceiptSha256: string;
  readonly receiptSha256: string;
}

export class RefactorCandidateVerificationError extends Error {
  readonly code = 'refactor_candidate_verification_invalid' as const;
  constructor(message: string) { super(message); this.name = 'RefactorCandidateVerificationError'; }
}
function invalid(message: string): never { throw new RefactorCandidateVerificationError(message); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('candidate verification receipt must be an object'); return value as Record<string, unknown>; }
function text(value: unknown, field: string, pattern: RegExp): string { const result = messageRequiredString(value, field, invalid); if (!pattern.test(result)) invalid(`${field} is invalid`); return result; }
function sha(value: unknown, field: string): string { const result = messageRequiredString(value, field, invalid); assertMessageSha256(result, field, invalid); return result; }
function path(value: unknown, field: string): string { const result = text(value, field, /^[^\u0000-\u001f\u007f\\]{1,512}$/u); if (result.startsWith('/') || result.startsWith('-') || result.split('/').some((part) => !part || part === '.' || part === '..')) invalid(`${field} is unsafe`); return result; }
type BuildInput = Omit<RefactorCandidateVerificationReceiptV1, 'receiptSha256'>;

export function buildRefactorCandidateVerificationReceipt(input: BuildInput): RefactorCandidateVerificationReceiptV1 {
  if (input.candidateVerify !== 'passed' && input.candidateVerify !== 'verify_stage_unavailable') invalid('candidateVerify is invalid');
  if ((input.candidateVerifyResultSha256 === null) !== (input.candidateVerify === 'verify_stage_unavailable')) invalid('candidate verify status and result digest disagree');
  const basis = {
    recommendationId: text(input.recommendationId, 'recommendationId', /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u), recommendationDigest: sha(input.recommendationDigest, 'recommendationDigest'),
    candidateHeadSha: text(input.candidateHeadSha, 'candidateHeadSha', /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u), candidateWorktreeDigest: sha(input.candidateWorktreeDigest, 'candidateWorktreeDigest'), taskId: text(input.taskId, 'taskId', /^[a-f0-9]{64}$/u), taskRevision: text(input.taskRevision, 'taskRevision', /^[a-f0-9]{64}$/u),
    contractPath: path(input.contractPath, 'contractPath'), contractSha256: sha(input.contractSha256, 'contractSha256'), contractVerificationSha256: sha(input.contractVerificationSha256, 'contractVerificationSha256'),
    cutoverClosureLocator: path(input.cutoverClosureLocator, 'cutoverClosureLocator'), cutoverClosureSha256: sha(input.cutoverClosureSha256, 'cutoverClosureSha256'), candidateVerify: input.candidateVerify,
    candidateVerifyResultSha256: input.candidateVerifyResultSha256 === null ? null : sha(input.candidateVerifyResultSha256, 'candidateVerifyResultSha256'), acceptanceReceiptSha256: sha(input.acceptanceReceiptSha256, 'acceptanceReceiptSha256'),
  } as const;
  return Object.freeze({ ...basis, receiptSha256: canonicalMessageDigest(basis) });
}

export function validateRefactorCandidateVerificationReceipt(value: unknown): RefactorCandidateVerificationReceiptV1 {
  const input = record(value); assertMessageExactKeys(input, ['recommendationId', 'recommendationDigest', 'candidateHeadSha', 'candidateWorktreeDigest', 'taskId', 'taskRevision', 'contractPath', 'contractSha256', 'contractVerificationSha256', 'cutoverClosureLocator', 'cutoverClosureSha256', 'candidateVerify', 'candidateVerifyResultSha256', 'acceptanceReceiptSha256', 'receiptSha256'], 'candidate verification receipt', invalid);
  const built = buildRefactorCandidateVerificationReceipt(input as unknown as BuildInput); if (input.receiptSha256 !== built.receiptSha256) invalid('receiptSha256 is stale'); return built;
}
export const canonicalRefactorCandidateVerificationReceiptBytes = (value: RefactorCandidateVerificationReceiptV1): string => canonicalMessageBytes(validateRefactorCandidateVerificationReceipt(value) as unknown as Record<string, unknown>);
