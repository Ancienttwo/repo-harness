import { execFileSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { constants, closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeSync } from 'fs';
import { tmpdir, userInfo } from 'os';
import { relative, join, resolve, sep } from 'path';
import type { RefactorVerificationRequestV1 } from 'archctx-contracts';

import { canonicalize } from '../../core/evidence/canonical-json';
import { buildRefactorCandidateVerificationReceipt, canonicalRefactorCandidateVerificationReceiptBytes, validateRefactorCandidateVerificationReceipt, type RefactorCandidateVerificationReceiptV1 } from '../../core/refactor/candidate-verification';
import { validateRefactorProgram, type RefactorProgramV1 } from '../../core/refactor/program';
import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import { assertCanonicalSprintTaskIdsUniqueAtCommit } from '../state/coordination-canonical-source';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { runRefactorVerify, type RefactorArchctxProviderOptions } from './archctx-provider';
import { appendRefactorProgramEvent, assertRefactorProgramDigest, readRefactorProgramStatus } from './program-store';
import { assertRefactorVerificationRequest, RefactorProviderError, type RefactorVerifyResultV1 } from '../../core/refactor/provider-contract';
import { evaluateCutoverClosure, type CutoverClosureV1 } from '../../../scripts/cutover-closure';
import { acceptanceReceiptPath, verifyAcceptance, type AcceptanceReceipt } from '../../../scripts/acceptance-receipt';

export class RefactorCandidateVerificationEffectError extends Error {
  constructor(readonly code: 'refactor_candidate_verification_failed' | 'refactor_candidate_verification_conflict', message: string, readonly cause?: unknown) { super(message); this.name = 'RefactorCandidateVerificationEffectError'; }
}
function fail(code: RefactorCandidateVerificationEffectError['code'], message: string, cause?: unknown): never { throw new RefactorCandidateVerificationEffectError(code, message, cause); }
const sha = (bytes: string | Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export interface RefactorCandidateVerificationDependencies {
  readonly verify_contract?: (root: string, contractPath: string) => { readonly reportBytes: Buffer };
  readonly verify_cutover?: (input: { repo: string; contract: string; head: string; locator: string }) => CutoverClosureV1;
  readonly verify_candidate?: (request: RefactorVerificationRequestV1, root: string) => RefactorVerifyResultV1;
  readonly verify_acceptance?: (root: string, authorityHome: string, contractPath: string) => Promise<{ readonly receipt: AcceptanceReceipt; readonly bytes: Buffer }>;
}

function defaultVerifyContract(root: string, contractPath: string): { reportBytes: Buffer } {
  const temp = mkdtempSync(join(tmpdir(), 'repo-harness-refactor-verify-')); const report = join(temp, 'contract.json');
  try {
    const result = spawnSync('bash', ['scripts/verify-contract.sh', '--contract', contractPath, '--strict', '--read-only', '--report-file', report], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) fail('refactor_candidate_verification_failed', result.stderr.trim() || result.stdout.trim() || 'verify-contract failed');
    return { reportBytes: readFileSync(report) };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

async function defaultVerifyAcceptance(root: string, authorityHome: string, contractPath: string) {
  const receipt = await verifyAcceptance({ root, authorityHome, contract: contractPath }); return { receipt, bytes: readFileSync(acceptanceReceiptPath(root, authorityHome)) };
}

function verificationDirectory(root: string, programId: string): string {
  return join(resolveGitCommonDirectory(root), 'repo-harness', 'refactor-programs', 'v1', 'candidate-verifications', Buffer.from(programId).toString('hex'));
}

function persist(root: string, programId: string, receipt: RefactorCandidateVerificationReceiptV1): void {
  const directory = verificationDirectory(root, programId);
  mkdirSync(directory, { recursive: true, mode: 0o700 }); if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) fail('refactor_candidate_verification_conflict', 'candidate verification store is unsafe');
  const path = join(directory, `${receipt.receiptSha256.slice('sha256:'.length)}.json`); const bytes = Buffer.from(`${canonicalRefactorCandidateVerificationReceiptBytes(receipt)}\n`);
  if (existsSync(path)) { if (!readFileSync(path).equals(bytes)) fail('refactor_candidate_verification_conflict', 'candidate verification receipt digest names different bytes'); return; }
  let descriptor: number;
  try { descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); }
  catch (error) { return fail('refactor_candidate_verification_conflict', 'cannot create candidate verification receipt', error); }
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset); } finally { closeSync(descriptor); }
}

export function readRefactorCandidateVerificationReceipt(root: string, programId: string, receiptSha256: string): RefactorCandidateVerificationReceiptV1 {
  const directory = verificationDirectory(root, programId);
  if (!existsSync(directory)) fail('refactor_candidate_verification_conflict', 'stored candidate verification receipt is missing');
  const directoryStat = lstatSync(directory); if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('refactor_candidate_verification_conflict', 'candidate verification store is unsafe');
  if (!/^sha256:[a-f0-9]{64}$/u.test(receiptSha256)) fail('refactor_candidate_verification_conflict', 'candidate verification receipt digest is invalid');
  const path = join(directory, `${receiptSha256.slice('sha256:'.length)}.json`);
  if (!existsSync(path)) fail('refactor_candidate_verification_conflict', 'stored candidate verification receipt is missing');
  const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) fail('refactor_candidate_verification_conflict', 'stored candidate verification receipt is unsafe');
  let bytes: Buffer; let receipt: RefactorCandidateVerificationReceiptV1;
  try { bytes = readFileSync(path); receipt = validateRefactorCandidateVerificationReceipt(JSON.parse(bytes.toString('utf8'))); }
  catch (error) { return fail('refactor_candidate_verification_conflict', 'stored candidate verification receipt is invalid', error); }
  const canonical = Buffer.from(`${canonicalRefactorCandidateVerificationReceiptBytes(receipt)}\n`);
  if (receipt.receiptSha256 !== receiptSha256 || !bytes.equals(canonical)) fail('refactor_candidate_verification_conflict', 'stored candidate verification receipt does not bind immutable bytes');
  return receipt;
}

export async function verifyRefactorCandidate(input: {
  readonly repo_root: string; readonly program: RefactorProgramV1; readonly recommendation_id: string; readonly candidate_head_sha: string; readonly candidate_worktree_digest: string;
  readonly task_id: string; readonly contract_path: string; readonly cutover_locator: string; readonly authority_home?: string;
  readonly expected_current_sha256: string; readonly idempotency_key: string; readonly observed_at: string; readonly env?: NodeJS.ProcessEnv;
  readonly provider_options?: RefactorArchctxProviderOptions;
}, dependencies: RefactorCandidateVerificationDependencies = {}): Promise<RefactorCandidateVerificationReceiptV1> {
  const root = realpathSync(input.repo_root); const program = validateRefactorProgram(input.program); const status = readRefactorProgramStatus(root, program.programId, input.env ?? process.env);
  assertRefactorProgramDigest(status, program.programDigest);
  if (status.current.state === 'executing') appendRefactorProgramEvent({ repo_root: root, program_id: program.programId, expected_current_sha256: input.expected_current_sha256, idempotency_key: `${input.idempotency_key}:verifying`, operation: 'begin_verify', evidence_refs: [input.candidate_head_sha], observed_at: input.observed_at, env: input.env });
  else if (status.current.state !== 'verifying') fail('refactor_candidate_verification_conflict', `program is ${status.current.state}, not executing or verifying`);
  const head = execFileSync('git', ['rev-parse', '--verify', `${input.candidate_head_sha}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  if (head !== input.candidate_head_sha) fail('refactor_candidate_verification_conflict', 'candidate head is not an exact commit');
  const binding = program.bindings.find((entry) => entry.recommendationId === input.recommendation_id); if (!binding) fail('refactor_candidate_verification_conflict', 'recommendation is not bound by the Program');
  const contractPath = realpathSync(resolve(root, input.contract_path)); const contractRelative = relative(root, contractPath).replaceAll('\\', '/');
  if (!contractRelative || contractRelative.startsWith(`..${sep}`) || contractRelative !== input.contract_path || !lstatSync(contractPath).isFile() || lstatSync(contractPath).isSymbolicLink()) fail('refactor_candidate_verification_conflict', 'contract path is not an exact regular repository file');
  const contractBytes = readFileSync(contractPath); const contractSha = sha(contractBytes);
  if (sha(execFileSync('git', ['show', `${head}:${input.contract_path}`], { cwd: root })) !== contractSha) fail('refactor_candidate_verification_conflict', 'candidate contract bytes differ from the verified working file');
  const sprintPath = binding.taskRef.split('#')[0]!; const sprint = execFileSync('git', ['show', `${head}:${sprintPath}`], { cwd: root, encoding: 'utf8' });
  assertCanonicalSprintTaskIdsUniqueAtCommit(root, { commit: head, sprintPath, sprintText: sprint });
  const task = projectCanonicalTasks({ repoIdentity: status.program.repository_id, sprintPath, sprintText: sprint }).find((entry) => entry.task_id === input.task_id);
  if (!task || binding.taskRef !== `${sprintPath}#${task.task_id}`) fail('refactor_candidate_verification_conflict', 'task identity does not match the Program binding');
  const contractResult = (dependencies.verify_contract ?? defaultVerifyContract)(root, input.contract_path);
  const closure = (dependencies.verify_cutover ?? evaluateCutoverClosure)({ repo: root, contract: contractPath, head, locator: input.cutover_locator });
  if (closure.status !== 'closed' || `sha256:${closure.contractSha256}` !== contractSha || closure.headSha !== head) fail('refactor_candidate_verification_failed', 'Cutover Closure did not close the exact candidate and contract');
  const request: RefactorVerificationRequestV1 = { schemaVersion: 'archcontext.refactor-verification-request/v1', recommendationId: binding.recommendationId, expectedHeadSha: head, expectedWorktreeDigest: input.candidate_worktree_digest,
    executionEvidenceRefs: [{ kind: 'cutover_closure', locator: input.cutover_locator, sha256: closure.closureSha256 }] };
  assertRefactorVerificationRequest(request);
  let verifyStatus: 'passed' | 'verify_stage_unavailable' = 'passed'; let verifyDigest: string | null;
  try {
    const result = (dependencies.verify_candidate ?? ((value, repo) => runRefactorVerify(value, repo, { ...input.provider_options, env: input.env })))(request, root);
    if (result.disposition !== 'resolved' || result.evidence === null || result.evidence.recommendationId !== binding.recommendationId || result.evidence.verifiedHeadSha !== head) fail('refactor_candidate_verification_failed', 'candidate refactor verification did not resolve the bound recommendation');
    verifyDigest = sha(canonicalize(result as never));
  } catch (error) {
    if (!(error instanceof RefactorProviderError) || error.code !== 'refactor_provider_version_mismatch') throw error;
    verifyStatus = 'verify_stage_unavailable'; verifyDigest = null;
  }
  const authorityHome = realpathSync(input.authority_home ?? userInfo().homedir); const acceptance = await (dependencies.verify_acceptance ?? defaultVerifyAcceptance)(root, authorityHome, input.contract_path);
  if (acceptance.receipt.contract_sha256 !== contractSha || acceptance.receipt.target_revision !== head || (acceptance.receipt.disposition !== 'external_pass' && acceptance.receipt.disposition !== 'user_waiver')) fail('refactor_candidate_verification_failed', 'AcceptanceReceipt does not pass the exact candidate and contract');
  const receipt = buildRefactorCandidateVerificationReceipt({ recommendationId: binding.recommendationId, recommendationDigest: binding.recommendationDigest, candidateHeadSha: head, candidateWorktreeDigest: input.candidate_worktree_digest,
    taskId: task.task_id, taskRevision: task.task_revision, contractPath: input.contract_path, contractSha256: contractSha, contractVerificationSha256: sha(contractResult.reportBytes),
    cutoverClosureLocator: input.cutover_locator, cutoverClosureSha256: `sha256:${closure.closureSha256}`, candidateVerify: verifyStatus, candidateVerifyResultSha256: verifyDigest, acceptanceReceiptSha256: sha(acceptance.bytes) });
  persist(root, program.programId, receipt); return receipt;
}
