import { assertObservationPath, currentReadonlyObservation, rejectObservation, observationReadFileSync as readFileSync, observationSpawnSync as spawnSync } from '../state/readonly-observation';
import { createHash } from 'crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { userInfo } from 'os';
import { createRequire } from 'module';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  ACCEPTANCE_VALIDATOR_RULE_IDS,
  ACCEPTANCE_VERIFICATION_OBSERVATION_KIND,
  ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL,
  CONSUMED_RECEIPT_KEYS,
  GENERIC_REVIEW_ROLE,
  acceptanceBenchmarkRequirement,
  acceptanceContractField,
  acceptancePolicySource,
  acceptanceReviewContextDigest,
  acceptanceVerificationObservationSubjectKey,
  assertReviewFields,
  authorityFingerprint,
  buildAcceptanceVerificationObservation,
  contractCarriesArchiveProjection,
  fail,
  isRecord,
  parseAcceptancePolicy,
  renderAcceptanceProjection,
  sha256,
  stableJson,
  validateDisposition,
  validateDomainReview,
  validateFindings,
  waiverGrantFingerprint,
  type AcceptanceDisposition,
  type AcceptanceEvidence,
  type AcceptanceFinding,
  type AcceptancePolicy,
  type AcceptanceReceipt,
  type AcceptanceReceiptPolicyInput,
  type AcceptanceReceiptPolicyVerdict,
  type AcceptanceReviewResult,
  type AcceptanceValidatorRuleId,
  type AcceptanceVerificationObservationV1,
  type ReviewSubject,
  type UserWaiverGrant,
} from '../../core/review/acceptance-receipt';

export {
  ACCEPTANCE_VALIDATOR_RULE_IDS,
  ACCEPTANCE_VERIFICATION_OBSERVATION_KIND,
  ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL,
  CONSUMED_RECEIPT_KEYS,
  GENERIC_REVIEW_ROLE,
  acceptanceBenchmarkRequirement,
  acceptancePolicySource,
  acceptanceReviewContextDigest,
  acceptanceVerificationObservationSubjectKey,
  authorityFingerprint,
  contractCarriesArchiveProjection,
  parseAcceptancePolicy,
  renderAcceptanceProjection,
} from '../../core/review/acceptance-receipt';

export type {
  AcceptanceDisposition,
  AcceptanceEvidence,
  AcceptanceFinding,
  AcceptancePolicy,
  AcceptancePolicyV1,
  AcceptancePolicyV2,
  AcceptanceReceipt,
  AcceptanceReceiptPolicyInput,
  AcceptanceReceiptPolicyVerdict,
  AcceptanceReviewResult,
  AcceptanceValidatorRuleId,
  AcceptanceVerificationObservationV1,
  ReviewSubject,
  UserWaiverGrant,
} from '../../core/review/acceptance-receipt';


function reviewResultPath(root: string, authorityHome: string): string {
  return acceptanceReceiptPath(root, authorityHome).replace('acceptance.latest.json', 'acceptance.review-result.json');
}


function verifyReviewResult(root: string, authorityHome: string, receipt: AcceptanceReceipt, contextDigest: string): void {
  assertReviewFields(receipt); if (receipt.disposition === 'user_waiver') return;
  const path = reviewResultPath(root, authorityHome);
  const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) fail('generic-review result authority is unsafe');
  const review = validateDomainReview(JSON.parse(readFileSync(path,'utf8')));
  for (const field of ['request_id','context_sha256','actual_harness','actual_role','actual_model'] as const) {
    if (receipt[field] !== review[field]) fail(`AcceptanceReceipt generic-review ${field} mismatch`);
  }
  if (receipt.context_sha256 !== contextDigest || review.subject_sha256 !== receipt.subject_sha256) fail('AcceptanceReceipt generic-review context/subject mismatch');
  if (receipt.result_sha256 !== authorityFingerprint(stableJson(review))) fail('AcceptanceReceipt generic-review result_sha256 mismatch');
  if (review.verdict !== (receipt.disposition === 'external_pass' ? 'PASS' : 'FAIL')
    || review.summary !== receipt.summary || stableJson(review.findings) !== stableJson(receipt.findings)) fail('AcceptanceReceipt generic-review verdict/findings mismatch');
}


type Options = {
  authorityHome?: string;
  now?: () => Date;
};

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(MODULE_DIR, '../../..');
type ProtectedRuntime = {
  platform: NodeJS.Platform;
  accountHome: string;
  accountUsername: string;
  gitBin: string;
  bashBin: string;
  bunExecutable: string;
  pathEntries: readonly string[];
  pathDelimiter: ':' | ';';
  tempDir: string;
  systemRoot?: string;
};
type ProtectedPlatformModule = {
  resolveProtectedHelperPlatform: () => ProtectedRuntime;
  protectedHelperRuntimeEnv: (runtime: ProtectedRuntime) => NodeJS.ProcessEnv;
};
type ProtectedGitRuntime = {
  readonly gitBin: string;
  readonly env: NodeJS.ProcessEnv;
};
const requireFromHelper = createRequire(import.meta.url);
type ProfileBenchmarkValidator = {
  validateHarnessBenchmarkReport(reportPath: string, requireAuthoritative?: boolean): { authoritative: boolean };
  reportByteBindingPath(reportPath: string): string;
};

let protectedGitRuntimeCache: ProtectedGitRuntime | null = null;

function fixedPosixExecutable(label: string, candidates: readonly string[]): string {
  for (const candidate of candidates) {
    if (!isAbsolute(candidate) || !existsSync(candidate)) continue;
    const source = lstatSync(candidate);
    if (source.isSymbolicLink() || !source.isFile()) continue;
    const actual = realpathSync(candidate);
    const target = lstatSync(actual);
    if (target.isSymbolicLink() || !target.isFile() || (target.mode & 0o111) === 0) continue;
    return actual;
  }
  throw new Error(`required system executable is unavailable: ${label}`);
}

export function resolveProtectedGitRuntime(): ProtectedGitRuntime {
  if (protectedGitRuntimeCache) return protectedGitRuntimeCache;
  if (process.platform !== 'win32') {
    const account = userInfo();
    const gitBin = fixedPosixExecutable('git', ['/usr/bin/git', '/bin/git']);
    const bashBin = fixedPosixExecutable('bash', ['/bin/bash']);
    const protectedPath = `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`;
    protectedGitRuntimeCache = {
      gitBin,
      env: {
        HOME: account.homedir,
        USER: account.username,
        LOGNAME: account.username,
        PATH: protectedPath,
        TMPDIR: '/tmp',
        REPO_HARNESS_BASH_BIN: bashBin,
        REPO_HARNESS_GIT_BIN: gitBin,
        REPO_HARNESS_BUN_BIN: process.execPath,
        REPO_HARNESS_PROTECTED_PATH: protectedPath,
        REPO_HARNESS_PROTECTED_TMPDIR: '/tmp',
      },
    };
    return protectedGitRuntimeCache;
  }
  const protectedPlatform = requireFromHelper(
    join(PACKAGE_ROOT, 'src', 'effects', 'runtime', 'protected-helper-platform.ts'),
  ) as ProtectedPlatformModule;
  const runtime = protectedPlatform.resolveProtectedHelperPlatform();
  protectedGitRuntimeCache = {
    gitBin: runtime.gitBin,
    env: protectedPlatform.protectedHelperRuntimeEnv(runtime),
  };
  return protectedGitRuntimeCache;
}


function gitText(root: string, args: string[]): string {
  const runtime = resolveProtectedGitRuntime();
  const result = spawnSync(runtime.gitBin, ['-C', root, ...args], { encoding: 'utf-8', env: runtime.env });
  if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${result.stderr.trim() || 'unknown error'}`);
  return result.stdout.trim();
}

function repositoryRoot(cwd = process.cwd()): string {
  return realpathSync(gitText(cwd, ['rev-parse', '--show-toplevel']));
}

function repoRelative(root: string, path: string): string {
  const absolute = realpathSync(resolve(root, path));
  const value = relative(root, absolute).replaceAll('\\', '/');
  if (!value || value.startsWith('../') || isAbsolute(value)) fail(`path escapes repository: ${path}`);
  return value;
}

function readRegular(root: string, requested: string, label: string): { path: string; content: string } {
  assertObservationPath(resolve(root, requested));
  const absolute = resolve(root, requested);
  if (!existsSync(absolute)) fail(`${label} is missing: ${requested}`);
  const actual = realpathSync(absolute);
  const path = repoRelative(root, actual);
  if (!lstatSync(actual).isFile()) fail(`${label} must be a regular file: ${path}`);
  return { path, content: readFileSync(actual, 'utf-8') };
}


function currentSubject(root: string, targetRef?: string, targetRevision?: string): ReviewSubject {
  const module = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/review/diff-fingerprint.ts')) as typeof import('./diff-fingerprint');
  const reviewBase = module.resolvePolicyReviewBase(root);
  if (!reviewBase.ok) fail('policy review base is unavailable: ' + reviewBase.reason);
  if (targetRef !== undefined && targetRef !== reviewBase.targetRef) fail('AcceptanceReceipt target ref is stale against workflow policy');
  const subject = module.buildReviewSubject(root, { targetRef: targetRef ?? reviewBase.targetRef, targetRevision });
  if (subject.status !== 'ok' || !/^sha256:[0-9a-f]{64}$/.test(subject.review_subject_sha256)) fail('current normalized review subject is unavailable');
  return subject;
}


function verificationReportFile(root: string, requested: string): { path: string; content: string } {
  if (isAbsolute(requested) || requested.includes('\\') || requested.split('/').some(part => part === '..' || part === '.')
    || !requested.startsWith('.ai/harness/runs/')) fail('AcceptanceReceipt verification_file is unsafe: use an explicit repository-relative report under .ai/harness/runs/');
  const absolute = resolve(root, requested);
  if (!existsSync(absolute)) fail('verification evidence is missing: ' + requested);
  if (lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isFile()
    || realpathSync(absolute) !== absolute) fail('verification evidence must be a regular non-symlink report');
  return readRegular(root, requested, 'verification evidence');
}

/** Validate owner facts supplied by a current evaluator, without another tree capture. */
export function inspectAcceptanceEvidence(args: {
  root: string;
  contract: string;
  contractContent?: string;
  report: unknown;
  subject: ReviewSubject;
  env?: NodeJS.ProcessEnv;
  current?: boolean;
  assessmentContract?: string;
}): AcceptanceEvidence {
  const root = realpathSync(args.root);
  const contractContent = args.contractContent ?? readCurrentContract(root, args.contract).content;
  if (isRecord(args.report) && args.report.kind === 'verification_unavailable') fail('verification evidence is unavailable: ' + args.report.reason);
  const execution = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/evidence/verification-execution.ts')) as typeof import('../evidence/verification-execution');
  let report: import('../evidence/verification-execution').VerificationExecutionReport;
  try {
    report = execution.validateMaterializedVerificationExecutionReport({ repoRoot: root, contractPath: args.contract,
      contractText: contractContent,
      report: args.current && isRecord(args.report) && args.report.kind === 'verification_execution_report'
        ? execution.materializeVerificationExecutionReport(args.report as unknown as import('../evidence/verification-execution').VerificationExecutionReport)
        : args.report,
      env: args.env, current: args.current }).report;
  } catch (error) { fail('verification execution evidence is invalid: ' + (error as Error).message); }
  const subject = args.subject;
  const parsers = requireFromHelper(join(PACKAGE_ROOT, 'src/core/state/artifact-parsers.ts')) as typeof import('../../core/state/artifact-parsers');
  const allowed = parsers.parseAllowedPaths(contractContent);
  if (!allowed.length) fail('contract Allowed Paths are missing or malformed');
  if (subject.status !== 'ok') fail('current normalized review subject is unavailable');
  for (const path of subject.paths) if (!parsers.contractAllowsPath(args.contract, allowed, path)) fail('contract Allowed Paths refuse reviewed path: ' + path);
  if (currentReadonlyObservation()) rejectObservation('Bounded acceptance assessment and benchmark adapters are not available');
  const assessmentFile = readRegular(root, '.ai/harness/checks/change-assessment.latest.json', 'Change Assessment');
  let assessment: unknown;
  try { assessment = JSON.parse(assessmentFile.content); } catch { fail('verification evidence Change Assessment is invalid JSON'); }
  if (!isRecord(assessment) || assessment.schema !== 'repo-harness-change-assessment-evidence.v1' || assessment.status !== 'pass') fail('verification evidence change assessment is not passing');
  const assessmentBasis = { schema: assessment.schema, status: assessment.status, assessment: assessment.assessment, selection_packet: assessment.selection_packet };
  if (assessment.evidence_sha256 !== sha256(stableJson(assessmentBasis))) fail('verification evidence change assessment fingerprint is stale');
  const core = requireFromHelper(join(PACKAGE_ROOT, 'src/core/review/change-assessment.ts')) as typeof import('../../core/review/change-assessment');
  const effects = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/review/change-assessment.ts')) as typeof import('./change-assessment');
  let packet: ReturnType<typeof core.validateReviewSelectionPacketAgainstAssessment>;
  try {
    const declared = core.validateChangeAssessment(assessment.assessment);
    const selfBoundPacket = core.validateReviewSelectionPacket(assessment.selection_packet);
    if (selfBoundPacket.review_subject_sha256 !== subject.review_subject_sha256 || selfBoundPacket.target_ref !== subject.target_ref
      || selfBoundPacket.target_revision !== subject.target_rev) fail('verification evidence change assessment packet is stale for the current subject');
    const recomputed = effects.prepareChangeAssessment({ repoRoot: root, contractPath: args.assessmentContract ?? args.contract, targetRevision: subject.target_rev });
    if (recomputed.assessment.status === 'degraded') fail('verification evidence Change Assessment base is unavailable');
    if (declared.assessment_sha256 !== recomputed.assessment.assessment_sha256) fail('verification evidence Change Assessment does not match current base assessment');
    packet = core.validateReviewSelectionPacketAgainstAssessment(assessment.selection_packet, recomputed.assessment);
  } catch (error) { fail('verification evidence change assessment is invalid: ' + (error as Error).message); }
  if (packet.status !== 'ready') fail('verification evidence change assessment packet is blocked');
  let benchmark = 'not-applicable';
  if (acceptanceBenchmarkRequirement(contractContent) === 'required') {
    const validator = requireFromHelper(join(PACKAGE_ROOT, 'scripts/run-harness-profile-benchmark.ts')) as ProfileBenchmarkValidator;
    const reportPath = readRegular(root, 'evals/harness/reports/profile-comparison.json', 'required benchmark report').path;
    const validated = validator.validateHarnessBenchmarkReport(join(root, reportPath), true);
    const binding = readRegular(root, relative(root, validator.reportByteBindingPath(join(root, reportPath))), 'benchmark byte binding');
    benchmark = sha256(binding.content);
    if (!validated.authoritative) fail('required benchmark report is not authoritative');
  }
  const results = report.results.map(result => ({ ...result, execution: result.execution === 'reused' ? 'executed' : result.execution }));
  const target = { contract: report.target.contract, plan_hash: report.target.plan_hash, snapshot_hash: report.target.snapshot_hash, tree_hash: report.target.tree_hash };
  return { fingerprint: sha256(stableJson({ execution: { ...report, target, results }, change_assessment: assessmentBasis, benchmark })), benchmark };
}

function normalizedVerificationEvidence(content: string, subject: ReviewSubject, root: string, contractPath: string,
  contractContent: string): AcceptanceEvidence {
  let report: unknown;
  try { report = JSON.parse(content); } catch (error) { fail('verification evidence is invalid JSON: ' + (error as Error).message); }
  const execution = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/evidence/verification-execution.ts')) as typeof import('../evidence/verification-execution');
  if (!isRecord(report) || !isRecord(report.target) || report.target.contract !== contractPath) fail('verification evidence contract is stale for the active acceptance contract');
  const current = execution.evaluateVerificationContract({ repoRoot: root, contractPath });
  if (current.kind === 'verification_unavailable') fail('verification evidence is unavailable: ' + current.reason);
  if (!current.passed) fail('verification evidence is stale: current passing evaluation is unavailable');
  if (!isRecord(report) || !isRecord(report.target) || report.target.snapshot_hash !== current.target.snapshot_hash
    || report.target.plan_hash !== current.target.plan_hash) fail('verification evidence is stale for the current source snapshot');
  return inspectAcceptanceEvidence({ root, contract: contractPath, contractContent, report, subject, current: true, assessmentContract: contractPath });
}

function stateRoot(authorityHome: string): string {
  const home = realpathSync(authorityHome);
  if (!isAbsolute(home)) fail('authority home must be absolute');
  return join(home, '.repo-harness');
}

export function acceptanceReceiptPath(root: string, authorityHome: string, createParent = false): string {
  const repoId = createHash('sha256').update(realpathSync(root)).digest('hex');
  const parent = join(stateRoot(authorityHome), 'gates', repoId);
  if (createParent) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
  }
  return join(parent, 'acceptance.latest.json');
}




export function userWaiverGrantPath(root: string, authorityHome: string, createParent = false): string {
  const repoId = createHash('sha256').update(realpathSync(root)).digest('hex');
  const parent = join(stateRoot(authorityHome), 'gates', repoId);
  if (createParent) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
  }
  return join(parent, 'user-waiver-grant.latest.json');
}


export function acceptanceVerificationObservationPath(
  root: string,
  authorityHome: string,
  contractFile: string,
  contractSha256: string,
  createParent = false,
): string {
  const repoId = createHash('sha256').update(realpathSync(root)).digest('hex');
  const parent = join(stateRoot(authorityHome), 'gates', repoId, 'acceptance-observations');
  if (createParent) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
  }
  const key = acceptanceVerificationObservationSubjectKey(contractFile, contractSha256);
  return join(parent, `${key.slice('sha256:'.length)}.json`);
}


/** Thin read-only wrapper so other modules can refuse an archive-projected contract without a second parser. */

export function writeAcceptanceVerificationObservation(args: {
  root: string;
  authorityHome: string;
  receipt: AcceptanceReceipt;
}): AcceptanceVerificationObservationV1 {
  const root = realpathSync(args.root);
  const acceptancePath = acceptanceReceiptPath(root, args.authorityHome);
  const observation = buildAcceptanceVerificationObservation({
    repository_root: root,
    acceptance_receipt_sha256: sha256(readFileSync(acceptancePath)),
    contract_file: args.receipt.contract_file,
    contract_sha256: args.receipt.contract_sha256,
    goal_file: args.receipt.goal_file,
    goal_sha256: args.receipt.goal_sha256,
    target_ref: args.receipt.target_ref,
    target_revision: args.receipt.target_revision,
    subject_sha256: args.receipt.subject_sha256,
    verification_evidence_sha256: args.receipt.verification_evidence_sha256,
    disposition: args.receipt.disposition,
    archive_projection_sha256: null,
    verified_at: args.receipt.issued_at,
  });
  const path = acceptanceVerificationObservationPath(
    root,
    args.authorityHome,
    observation.contract_file,
    observation.contract_sha256,
    true,
  );
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${stableJson(observation)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  return observation;
}

export function readAcceptanceVerificationObservation(
  root: string,
  authorityHome: string,
  contractFile: string,
  contractSha256: string,
): AcceptanceVerificationObservationV1 | null {
  const repositoryRoot = realpathSync(root);
  const path = acceptanceVerificationObservationPath(repositoryRoot, authorityHome, contractFile, contractSha256);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    fail(`AcceptanceVerificationObservation is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value)
    || value.protocol !== ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL
    || value.kind !== ACCEPTANCE_VERIFICATION_OBSERVATION_KIND) {
    fail('AcceptanceVerificationObservation kind/protocol is invalid');
  }
  const record = value as unknown as AcceptanceVerificationObservationV1;
  if (record.repository_root !== repositoryRoot) fail('AcceptanceVerificationObservation repository root is stale');
  if (record.contract_file !== contractFile || record.contract_sha256 !== contractSha256) {
    fail('AcceptanceVerificationObservation subject is stale');
  }
  if (unsafeRepoRelativePath(record.goal_file)) fail('AcceptanceVerificationObservation goal_file is unsafe');
  if (!['external_pass', 'user_waiver', 'reject'].includes(String(record.disposition))) {
    fail('AcceptanceVerificationObservation disposition is invalid');
  }
  const rebuilt = buildAcceptanceVerificationObservation({
    repository_root: record.repository_root,
    acceptance_receipt_sha256: record.acceptance_receipt_sha256,
    contract_file: record.contract_file,
    contract_sha256: record.contract_sha256,
    goal_file: record.goal_file,
    goal_sha256: record.goal_sha256,
    target_ref: record.target_ref,
    target_revision: record.target_revision,
    subject_sha256: record.subject_sha256,
    verification_evidence_sha256: record.verification_evidence_sha256,
    disposition: record.disposition,
    archive_projection_sha256: record.archive_projection_sha256,
    verified_at: record.verified_at,
  });
  if (record.observation_id !== rebuilt.observation_id) fail('AcceptanceVerificationObservation id is stale');
  if (`${stableJson(rebuilt)}\n` !== raw) fail('AcceptanceVerificationObservation bytes are not canonical');
  const key = acceptanceVerificationObservationSubjectKey(rebuilt.contract_file, rebuilt.contract_sha256);
  if (basename(path) !== `${key.slice('sha256:'.length)}.json`) {
    fail('AcceptanceVerificationObservation is misfiled');
  }
  return rebuilt;
}



const SHA256_FIELD = /^sha256:[0-9a-f]{64}$/;
const GIT_OID_FIELD = /^[0-9a-f]{40,64}$/;

function unsafeRepoRelativePath(value: string): boolean {
  return value.length === 0
    || isAbsolute(value)
    || value.startsWith('-')
    || value.includes('\\')
    || value.split('/').some((part) => part.length === 0 || part === '.' || part === '..');
}

/**
 * The single synchronous acceptance rule set, composed by `verifyAcceptance`
 * with the live subject and verification-evidence reads. It is the acceptance
 * gate's own rule set and has exactly one caller: readers outside this module
 * do not run it, they read the record-time
 * `AcceptanceVerificationObservationV1` this authority publishes instead.
 */
export function validateAcceptanceReceiptAgainstPolicy(
  input: AcceptanceReceiptPolicyInput,
): AcceptanceReceiptPolicyVerdict {
  const no = (rule: AcceptanceValidatorRuleId, reason: string): AcceptanceReceiptPolicyVerdict => ({ ok: false, rule, reason });
  const receipt = input.receipt;
  try {
    if (receipt.protocol !== 2 || receipt.kind !== 'repo-harness-acceptance-receipt') {
      return no('receipt_protocol_kind', 'AcceptanceReceipt kind/protocol is invalid');
    }
    if (receipt.repository_root !== input.repositoryRoot) return no('repository_root', 'AcceptanceReceipt repository root is stale');
    if (receipt.contract_file !== input.expectedContractFile) return no('contract_file', 'AcceptanceReceipt contract file is stale');
    if (authorityFingerprint(input.contractContent) !== receipt.contract_sha256) return no('contract_fingerprint', 'AcceptanceReceipt contract is stale');
    const policy = parseAcceptancePolicy(input.contractContent);
    if (policy.reviewer !== receipt.expected_reviewer) return no('reviewer_policy', 'AcceptanceReceipt reviewer policy is stale');
    if (unsafeRepoRelativePath(receipt.goal_file)) return no('goal_file_shape', 'AcceptanceReceipt goal_file is unsafe');
    if (authorityFingerprint(input.goalContent) !== receipt.goal_sha256) return no('goal_fingerprint', 'AcceptanceReceipt goal is stale');
    if (unsafeRepoRelativePath(receipt.verification_file)) return no('verification_file_shape', 'AcceptanceReceipt verification_file is unsafe');
    if (!SHA256_FIELD.test(receipt.verification_evidence_sha256)) return no('verification_evidence_shape', 'AcceptanceReceipt verification_evidence_sha256 is invalid');
    if (receipt.benchmark_evidence_sha256.trim() === '') return no('benchmark_evidence_present', 'AcceptanceReceipt benchmark_evidence_sha256 is required');
    if (!SHA256_FIELD.test(receipt.subject_sha256)) return no('subject_sha256_shape', 'AcceptanceReceipt subject_sha256 is invalid');
    if (receipt.subject_scope !== 'normalized-final-content') return no('subject_scope', 'AcceptanceReceipt subject scope is invalid');
    if (receipt.target_ref.trim() === '') return no('target_ref_present', 'AcceptanceReceipt target_ref is required');
    if (!GIT_OID_FIELD.test(receipt.target_revision)) return no('target_revision_shape', 'AcceptanceReceipt target_revision is invalid');
    // Emptiness is legal: a subject can review zero paths. Shape is not.
    if (receipt.reviewed_paths.some(unsafeRepoRelativePath)) return no('reviewed_paths_shape', 'AcceptanceReceipt reviewed_paths are invalid');
    if (receipt.summary.trim() === '') return no('summary_present', 'AcceptanceReceipt summary is required');
    if (receipt.issued_at.trim() === '' || Number.isNaN(Date.parse(receipt.issued_at))) {
      return no('issued_at_shape', 'AcceptanceReceipt issued_at is invalid');
    }
    if (receipt.disposition === 'reject') return no('disposition_not_reject', 'AcceptanceReceipt disposition is reject');
    const owner = acceptanceContractField(input.contractContent, 'Owner');
    if (receipt.disposition === 'user_waiver') {
      const grant = input.waiverGrant;
      if (grant === null) return no('waiver_grant_present', 'AcceptanceReceipt user_waiver requires a UserWaiverGrant');
      if (policy.user_waiver !== 'allowed') return no('waiver_policy_allowed', 'contract forbids user waiver');
      if (grant.repository_root !== input.repositoryRoot) return no('waiver_grant_repository', 'UserWaiverGrant repository root is stale');
      if (grant.contract_file !== receipt.contract_file || grant.contract_sha256 !== receipt.contract_sha256) {
        return no('waiver_grant_contract', 'UserWaiverGrant contract authority is stale');
      }
      if (grant.goal_file !== receipt.goal_file || grant.goal_sha256 !== receipt.goal_sha256) {
        return no('waiver_grant_goal', 'UserWaiverGrant goal authority is stale');
      }
      if (grant.actor !== owner) return no('waiver_grant_owner', 'UserWaiverGrant owner is stale');
      if (waiverGrantFingerprint(grant) !== receipt.waiver_grant_sha256) return no('waiver_grant_fingerprint', 'AcceptanceReceipt waiver grant is stale');
    } else if (receipt.waiver_grant_sha256 !== null || input.waiverGrant !== null) {
      return no('waiver_binding_symmetry', 'AcceptanceReceipt waiver grant binding does not match disposition');
    }
    try {
      assertReviewFields(receipt);
      validateDisposition(policy, owner, receipt.disposition, receipt.reviewer, receipt.source, receipt.actor, receipt.findings);
    } catch (error) {
      return no('disposition_policy', (error as Error).message);
    }
    return { ok: true };
  } catch (error) {
    // A rule that threw rather than returned: the contract policy block is
    // unparseable, or an input the caller supplied is malformed.
    return { ok: false, rule: 'validator_threw', reason: (error as Error).message };
  }
}

function readReceipt(path: string): AcceptanceReceipt {
  if (!existsSync(path)) fail(`AcceptanceReceipt is missing: ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    fail(`AcceptanceReceipt is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value) || value.protocol !== 2 || value.kind !== 'repo-harness-acceptance-receipt') {
    fail('AcceptanceReceipt kind/protocol is invalid');
  }
  const requiredStrings = [
    'repository_root', 'contract_file', 'contract_sha256', 'goal_file', 'goal_sha256',
    'verification_file', 'verification_evidence_sha256', 'benchmark_evidence_sha256',
    'subject_sha256', 'subject_scope', 'target_ref', 'target_revision', 'disposition',
    'expected_reviewer', 'reviewer', 'source', 'summary', 'issued_at',
  ];
  for (const field of requiredStrings) {
    if (typeof value[field] !== 'string' || String(value[field]).trim() === '') fail(`AcceptanceReceipt ${field} is required`);
  }
  if (!['external_pass', 'user_waiver', 'reject'].includes(String(value.disposition))) fail('AcceptanceReceipt disposition is invalid');
  if (!['Claude', 'Codex'].includes(String(value.expected_reviewer))) fail('AcceptanceReceipt expected_reviewer is invalid');
  if (!['Claude', 'Codex', 'User'].includes(String(value.reviewer))) fail('AcceptanceReceipt reviewer is invalid');
  if (!['generic-review', 'user-waiver'].includes(String(value.source))) fail('AcceptanceReceipt source is invalid');
  if (value.actor !== null && (typeof value.actor !== 'string' || value.actor.trim() === '')) fail('AcceptanceReceipt actor is invalid');
  if (value.waiver_grant_sha256 !== null && !/^sha256:[0-9a-f]{64}$/.test(String(value.waiver_grant_sha256))) {
    fail('AcceptanceReceipt waiver_grant_sha256 is invalid');
  }
  for (const field of ['contract_sha256', 'goal_sha256', 'verification_evidence_sha256', 'subject_sha256']) {
    if (!/^sha256:[0-9a-f]{64}$/.test(String(value[field]))) fail(`AcceptanceReceipt ${field} is invalid`);
  }
  if (!Array.isArray(value.reviewed_paths) || value.reviewed_paths.some((entry) => typeof entry !== 'string')) {
    fail('AcceptanceReceipt reviewed_paths must be strings');
  }
  if ((value.disposition === 'user_waiver') !== (value.waiver_grant_sha256 !== null)) {
    fail('AcceptanceReceipt waiver grant binding does not match disposition');
  }
  const receipt = { ...value, findings: validateFindings(value.findings) } as AcceptanceReceipt;
  assertReviewFields(receipt);
  return receipt;
}

/**
 * Read-only accessor for the single AcceptanceReceipt authority file. It
 * exists so other authorities revalidate the same bytes through the same
 * validator instead of re-deriving a second receipt parser.
 */
export function readAcceptanceReceiptFile(path: string): AcceptanceReceipt {
  return readReceipt(path);
}

function writeReceipt(path: string, receipt: AcceptanceReceipt | AcceptanceReviewResult): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

export function readUserWaiverGrantFile(path: string): UserWaiverGrant {
  return readUserWaiverGrant(path);
}

function readUserWaiverGrant(path: string): UserWaiverGrant {
  if (!existsSync(path)) fail(`UserWaiverGrant is missing: ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    fail(`UserWaiverGrant is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value) || value.protocol !== 1 || value.kind !== 'repo-harness-user-waiver-grant') {
    fail('UserWaiverGrant kind/protocol is invalid');
  }
  for (const field of [
    'repository_root', 'contract_file', 'contract_sha256', 'goal_file', 'goal_sha256',
    'actor', 'scope', 'summary', 'issued_at',
  ]) {
    if (typeof value[field] !== 'string' || String(value[field]).trim() === '') fail(`UserWaiverGrant ${field} is required`);
  }
  if (value.scope !== 'contract-authority') fail('UserWaiverGrant scope is invalid');
  for (const field of ['contract_sha256', 'goal_sha256']) {
    if (!/^sha256:[0-9a-f]{64}$/.test(String(value[field]))) fail(`UserWaiverGrant ${field} is invalid`);
  }
  return value as UserWaiverGrant;
}

function writeUserWaiverGrant(path: string, grant: UserWaiverGrant): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(grant, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}





function readCurrentContract(root: string, path: string): { path: string; content: string } {
  const contract = readRegular(root, path, 'contract');
  if (contract.path.startsWith('tasks/archive/') || contractCarriesArchiveProjection(contract.content)) {
    fail('archived contracts cannot authorize acceptance');
  }
  return contract;
}


export function recordUserWaiverGrant(args: {
  root: string;
  authorityHome: string;
  contract: string;
  actor: string;
  summary: string;
  now?: () => Date;
}): UserWaiverGrant {
  if (args.summary.trim() === '') fail('waiver grant summary is required');
  const root = realpathSync(args.root);
  const contract = readCurrentContract(root, args.contract);
  const policy = parseAcceptancePolicy(contract.content);
  if (policy.user_waiver !== 'allowed') fail('contract forbids user waiver');
  const owner = acceptanceContractField(contract.content, 'Owner');
  const goalPath = acceptanceContractField(contract.content, 'Plan');
  if (!owner || !goalPath) fail('contract Owner and Plan headers are required');
  if (args.actor !== owner) fail('UserWaiverGrant actor must equal the contract owner');
  const goal = readRegular(root, goalPath, 'goal');
  const grant: UserWaiverGrant = {
    protocol: 1,
    kind: 'repo-harness-user-waiver-grant',
    repository_root: root,
    contract_file: contract.path,
    contract_sha256: authorityFingerprint(contract.content),
    goal_file: goal.path,
    goal_sha256: authorityFingerprint(goal.content),
    actor: args.actor,
    scope: 'contract-authority',
    summary: args.summary,
    issued_at: (args.now ?? (() => new Date()))().toISOString(),
  };
  writeUserWaiverGrant(userWaiverGrantPath(root, args.authorityHome, true), grant);
  return grant;
}

export function verifyUserWaiverGrant(args: {
  root: string;
  authorityHome: string;
  contract?: string;
}): UserWaiverGrant {
  const root = realpathSync(args.root);
  const grant = readUserWaiverGrant(userWaiverGrantPath(root, args.authorityHome));
  if (grant.repository_root !== root) fail('UserWaiverGrant repository root is stale');
  const contractPath = args.contract ?? grant.contract_file;
  const contract = readCurrentContract(root, contractPath);
  if (contract.path !== grant.contract_file) fail('UserWaiverGrant contract file is stale');
  if (authorityFingerprint(contract.content) !== grant.contract_sha256) fail('UserWaiverGrant contract authority is stale');
  const policy = parseAcceptancePolicy(contract.content);
  if (policy.user_waiver !== 'allowed') fail('contract forbids user waiver');
  if (acceptanceContractField(contract.content, 'Owner') !== grant.actor) fail('UserWaiverGrant owner is stale');
  const goalPath = grant.goal_file;
  const goal = readRegular(root, goalPath, 'goal');
  if (authorityFingerprint(goal.content) !== grant.goal_sha256) fail('UserWaiverGrant goal authority is stale');
  return grant;
}

export function revokeUserWaiverGrant(args: { root: string; authorityHome: string }): void {
  const path = userWaiverGrantPath(realpathSync(args.root), args.authorityHome);
  if (existsSync(path)) unlinkSync(path);
}

export async function acceptanceContext(args: {
  root: string;
  contract: string;
  verification: string;
  authorityHome?: string;
}) {
  const root = realpathSync(args.root);
  const contract = readCurrentContract(root, args.contract);
  const policy = parseAcceptancePolicy(contract.content);
  const owner = acceptanceContractField(contract.content, 'Owner');
  const goalPath = acceptanceContractField(contract.content, 'Plan');
  if (!owner || !goalPath) fail('contract Owner and Plan headers are required');
  const goal = readRegular(root, goalPath, 'goal');
  const verification = verificationReportFile(root, args.verification);
  const subject = await currentSubject(root);
  const evidence = normalizedVerificationEvidence(verification.content, subject, root, contract.path, contract.content);
  return { root, contract, policy, owner, goal, verification, subject, evidence };
}

function buildReceipt(
  context: Awaited<ReturnType<typeof acceptanceContext>>,
  disposition: AcceptanceDisposition,
  reviewer: AcceptanceReceipt['reviewer'],
  source: AcceptanceReceipt['source'],
  actor: string | null,
  summary: string,
  findings: AcceptanceFinding[],
  waiverGrantSha256: string | null,
  now: () => Date,
): AcceptanceReceipt {
  return {
    protocol: 2,
    kind: 'repo-harness-acceptance-receipt',
    repository_root: context.root,
    contract_file: context.contract.path,
    contract_sha256: authorityFingerprint(context.contract.content),
    goal_file: context.goal.path,
    goal_sha256: authorityFingerprint(context.goal.content),
    verification_file: context.verification.path,
    verification_evidence_sha256: context.evidence.fingerprint,
    benchmark_evidence_sha256: context.evidence.benchmark,
    subject_sha256: context.subject.review_subject_sha256,
    subject_scope: context.subject.scope,
    target_ref: context.subject.target_ref,
    target_revision: context.subject.target_rev,
    reviewed_paths: [...context.subject.paths],
    disposition,
    expected_reviewer: context.policy.reviewer,
    reviewer,
    source,
    request_id: null, context_sha256: null, result_sha256: null,
    actual_harness: null, actual_role: null, actual_model: null,
    actor,
    summary,
    findings,
    waiver_grant_sha256: waiverGrantSha256,
    issued_at: now().toISOString(),
  };
}

function writeAcceptanceWithObservation(
  root: string,
  authorityHome: string,
  receipt: AcceptanceReceipt,
): void {
  const acceptancePath = acceptanceReceiptPath(root, authorityHome, true);
  const observationPath = acceptanceVerificationObservationPath(
    root,
    authorityHome,
    receipt.contract_file,
    receipt.contract_sha256,
    true,
  );
  const previousObservation = existsSync(observationPath) ? readFileSync(observationPath) : null;
  const restoreObservation = (): void => {
    if (previousObservation === null) {
      if (existsSync(observationPath)) unlinkSync(observationPath);
      return;
    }
    writeFileSync(observationPath, previousObservation, { mode: 0o600 });
    chmodSync(observationPath, 0o600);
  };
  const previousAcceptance = existsSync(acceptancePath) ? readFileSync(acceptancePath) : null;
  try {
    writeReceipt(acceptancePath, receipt);
    // The observation is part of the same acceptance transaction: an
    // acceptance that cannot publish its verified observation is rolled back
    // rather than left readable without one.
    writeAcceptanceVerificationObservation({ root, authorityHome, receipt });
  } catch (error) {
    if (previousAcceptance === null) {
      if (existsSync(acceptancePath)) unlinkSync(acceptancePath);
    } else {
      writeFileSync(acceptancePath, previousAcceptance, { mode: 0o600 });
      chmodSync(acceptancePath, 0o600);
    }
    restoreObservation();
    throw error;
  }

}

/**
 * Both record paths run the gate's full synchronous rule set before the
 * receipt — and therefore the verification observation — is written, so every
 * `record_time` coverage claim on the observation path is literally true.
 *
 * `disposition_not_reject` is the one rule deliberately skipped here: a
 * rejection is a legitimate thing to record. It stays a reader-side rule, and
 * every shape rule above it still runs for a rejection.
 */
function assertRecordedReceiptPolicy(
  context: Awaited<ReturnType<typeof acceptanceContext>>,
  receipt: AcceptanceReceipt,
  waiverGrant: UserWaiverGrant | null,
): void {
  const verdict = validateAcceptanceReceiptAgainstPolicy({
    receipt,
    repositoryRoot: context.root,
    expectedContractFile: receipt.contract_file,
    contractContent: context.contract.content,
    goalContent: context.goal.content,
    waiverGrant,
  });
  if (verdict.ok || verdict.rule === 'disposition_not_reject') return;
  fail(`${verdict.reason} (${verdict.rule})`);
}

export async function recordAcceptance(args: {
  reviewResult?: AcceptanceReviewResult;
  root: string;
  authorityHome: string;
  contract: string;
  verification: string;
  disposition: AcceptanceDisposition;
  reviewer: string;
  source: string;
  actor: string | null;
  summary: string;
  findings: AcceptanceFinding[];
  /** A provider must bind its opinion to the context it actually reviewed. */
  expectedContext?: {
    contract_sha256: string;
    goal_sha256: string;
    subject_sha256: string;
    verification_evidence_sha256: string;
    target_revision: string;
  };
  now?: () => Date;
}): Promise<AcceptanceReceipt> {
  if (args.summary.trim() === '') fail('acceptance summary is required');
  if (args.disposition === 'user_waiver') {
    fail('user_waiver must be materialized from a valid UserWaiverGrant');
  }
  const context = await acceptanceContext(args);
  if (args.expectedContext) {
    const actual = {
      contract_sha256: authorityFingerprint(context.contract.content),
      goal_sha256: authorityFingerprint(context.goal.content),
      subject_sha256: context.subject.review_subject_sha256,
      verification_evidence_sha256: context.evidence.fingerprint,
      target_revision: context.subject.target_rev,
    };
    for (const field of Object.keys(actual) as (keyof typeof actual)[]) {
      if (args.expectedContext[field] !== actual[field]) fail(`reviewed acceptance context is stale: ${field}`);
    }
  }
  validateDisposition(context.policy, context.owner, args.disposition, args.reviewer, args.source, args.actor, args.findings);
  const receipt = buildReceipt(
    context,
    args.disposition,
    args.reviewer as AcceptanceReceipt['reviewer'],
    args.source as AcceptanceReceipt['source'],
    args.actor,
    args.summary,
    args.findings,
    null,
    args.now ?? (() => new Date()),
  );
  const review = validateDomainReview(args.reviewResult);
  if (review.context_sha256 !== acceptanceReviewContextDigest(context) || review.subject_sha256 !== receipt.subject_sha256) fail('generic-review result context/subject is stale');
  Object.assign(receipt, { request_id: review.request_id, context_sha256: review.context_sha256,
    result_sha256: authorityFingerprint(stableJson(review)), actual_harness: review.actual_harness,
    actual_role: review.actual_role, actual_model: review.actual_model });
  if (review.verdict !== (args.disposition === 'external_pass' ? 'PASS' : 'FAIL') || review.summary !== args.summary
    || stableJson(review.findings) !== stableJson(args.findings)) fail('generic-review result verdict/findings mismatch');
  assertRecordedReceiptPolicy(context, receipt, null);
  acceptanceReceiptPath(context.root,args.authorityHome,true);
  writeReceipt(reviewResultPath(context.root,args.authorityHome),review);
  writeAcceptanceWithObservation(context.root, args.authorityHome, receipt);
  return receipt;
}

export async function recordUserWaiverAcceptance(args: {
  root: string;
  authorityHome: string;
  contract: string;
  verification: string;
  now?: () => Date;
}): Promise<AcceptanceReceipt> {
  const context = await acceptanceContext(args);
  const grant = verifyUserWaiverGrant({
    root: context.root,
    authorityHome: args.authorityHome,
    contract: context.contract.path,
  });
  const findings: AcceptanceFinding[] = [];
  validateDisposition(context.policy, context.owner, 'user_waiver', 'User', 'user-waiver', grant.actor, findings);
  const receipt = buildReceipt(
    context,
    'user_waiver',
    'User',
    'user-waiver',
    grant.actor,
    grant.summary,
    findings,
    waiverGrantFingerprint(grant),
    args.now ?? (() => new Date()),
  );
  assertRecordedReceiptPolicy(context, receipt, grant);
  writeAcceptanceWithObservation(context.root, args.authorityHome, receipt);
  return receipt;
}

export async function verifyAcceptance(args: {
  root: string;
  authorityHome: string;
  contract?: string;
  verification?: string;
}): Promise<AcceptanceReceipt> {
  const root = realpathSync(args.root);
  const receipt = readReceipt(acceptanceReceiptPath(root, args.authorityHome));
  if (receipt.repository_root !== root) fail('AcceptanceReceipt repository root is stale');
  const contractPath = args.contract ?? receipt.contract_file;
  const contract = readCurrentContract(root, contractPath);
  if (authorityFingerprint(contract.content) !== receipt.contract_sha256) fail('AcceptanceReceipt contract is stale');
  const goalPath = receipt.goal_file;
  const goal = readRegular(root, goalPath, 'goal');
  const verificationPath = args.verification ?? receipt.verification_file;
  const verification = verificationReportFile(root, verificationPath);
  const subject = await currentSubject(root, receipt.target_ref, receipt.target_revision);
  if (subject.review_subject_sha256 !== receipt.subject_sha256) fail('AcceptanceReceipt semantic subject is stale');
  const evidence = normalizedVerificationEvidence(verification.content, subject, root, contract.path, contract.content);
  return inspectAcceptanceCurrentBinding({ root, authorityHome: args.authorityHome, contract: contract.path, subject, evidence });
}

/** The synchronous acceptance owner rule shared by verify and state inspection. */
export function inspectAcceptanceCurrentBinding(args: {
  root: string;
  authorityHome: string;
  contract: string;
  subject: ReviewSubject;
  evidence: AcceptanceEvidence;
}): AcceptanceReceipt {
  const root = realpathSync(args.root);
  const receipt = readReceipt(acceptanceReceiptPath(root, args.authorityHome));
  const contract = readCurrentContract(root, args.contract);
  const goal = readRegular(root, receipt.goal_file, 'goal');
  if (contract.path !== receipt.contract_file) fail('AcceptanceReceipt contract path is stale');
  const subject = args.subject;
  if (subject.review_subject_sha256 !== receipt.subject_sha256 || subject.target_ref !== receipt.target_ref
    || subject.target_rev !== receipt.target_revision || stableJson(subject.paths) !== stableJson(receipt.reviewed_paths)) fail('AcceptanceReceipt semantic subject is stale');
  const diff = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/review/diff-fingerprint.ts')) as typeof import('./diff-fingerprint');
  const base = diff.resolvePolicyReviewBase(root);
  if (!base.ok || base.targetRef !== receipt.target_ref) fail('AcceptanceReceipt target ref is stale against workflow policy');
  if (args.evidence.fingerprint !== receipt.verification_evidence_sha256 || args.evidence.benchmark !== receipt.benchmark_evidence_sha256) fail('AcceptanceReceipt verification evidence is stale');
  verifyReviewResult(root, args.authorityHome, receipt, authorityFingerprint(stableJson([
    authorityFingerprint(contract.content), authorityFingerprint(goal.content), subject.review_subject_sha256, args.evidence.fingerprint, subject.target_rev,
  ])));
  const verdict = validateAcceptanceReceiptAgainstPolicy({ receipt, repositoryRoot: root, expectedContractFile: receipt.contract_file,
    contractContent: contract.content, goalContent: goal.content,
    waiverGrant: receipt.disposition === 'user_waiver' ? verifyUserWaiverGrant({ root, authorityHome: args.authorityHome, contract: contract.path }) : null });
  if (!verdict.ok) fail(verdict.reason);
  const observation = readAcceptanceVerificationObservation(root, args.authorityHome, receipt.contract_file, receipt.contract_sha256);
  if (!observation || observation.acceptance_receipt_sha256 !== sha256(readFileSync(acceptanceReceiptPath(root, args.authorityHome)))
    || observation.goal_file !== receipt.goal_file || observation.goal_sha256 !== receipt.goal_sha256
    || observation.target_ref !== receipt.target_ref || observation.target_revision !== receipt.target_revision
    || observation.subject_sha256 !== receipt.subject_sha256 || observation.verification_evidence_sha256 !== receipt.verification_evidence_sha256
    || observation.disposition !== receipt.disposition) fail('AcceptanceVerificationObservation is missing or stale');
  return receipt;
}


/**
 * The review file header carries the same four review-binding fields the
 * receipt already owns (`Status`, `Recommendation`, `Reviewed Subject
 * SHA256`, `Reviewed Target Revision`). The receipt is their single
 * authority, so each one is projected from it unconditionally: an authored
 * value that disagrees is stale, not a second opinion to preserve.
 */
function syncReviewHeader(source: string, receipt: AcceptanceReceipt): string {
  const boundary = source.search(/^##[ \t]/m);
  let header = boundary === -1 ? source : source.slice(0, boundary);
  const rest = boundary === -1 ? '' : source.slice(boundary);
  const accepted = receipt.disposition !== 'reject';
  const syncField = (field: string, value: string): void => {
    header = header.replace(
      new RegExp(`^(> \\*\\*${field}\\*\\*:[ \\t]*).+$`, 'm'),
      (_whole, prefix: string) => `${prefix}${value}`,
    );
  };
  syncField('Reviewed Subject SHA256', receipt.subject_sha256);
  syncField('Reviewed Target Revision', receipt.target_revision);
  syncField('Recommendation', accepted ? 'pass' : 'fail');
  syncField('Status', accepted ? 'Accepted' : 'Pending');
  return `${header}${rest}`;
}

export function projectAcceptance(reviewPath: string, receipt: AcceptanceReceipt): void {
  const source = readFileSync(reviewPath, 'utf-8');
  const projection = renderAcceptanceProjection(receipt);
  const pattern = /^## Acceptance Receipt Projection[ \t]*(?:\r?\n|$)[\s\S]*?(?=^##[ \t]+|(?![\s\S]))/m;
  const next = pattern.test(source)
    ? source.replace(pattern, `${projection}\n\n`)
    : `${source.trimEnd()}\n\n${projection}\n`;
  writeFileSync(reviewPath, syncReviewHeader(next, receipt), 'utf-8');
}

/**
 * EPC-04: at the end of a successful `record` (CLI level only -- this is
 * never invoked from the exported `recordAcceptance`/`recordUserWaiverAcceptance`
 * functions themselves, so direct library callers, including
 * tests/acceptance-receipt.test.ts, are unaffected), import the
 * just-recorded receipt into the EPC-01 ledger as one attested EvidenceEvent
 * (D4). `reject` has no attested trust mapping (D4's closed table has only
 * two entries) and is not itself a claim of acceptance, so it is skipped
 * here rather than routed into `importAttestedEvidence` only to fail closed
 * on `unsupported_disposition` -- that would turn an intentional, already
 * exit-code-1 rejection into a hard crash of the record command, which is
 * not this package's scope.
 *
 * A missing attested-import module skips the ledger import and leaves the
 * recorded receipt in place.
 * Any OTHER failure (the module resolves but the import itself reports a
 * real fail-closed reason) still fails the record command: an acceptance
 * that cannot enter the evidence authority must not report success.
 */
async function importAttestedReceiptIfApplicable(
  root: string,
  receipt: AcceptanceReceipt,
  authorityContractFile: string,
): Promise<void> {
  if (receipt.disposition !== 'external_pass' && receipt.disposition !== 'user_waiver') return;

  type AttestedImportModule = {
    importAttestedEvidence: (input: {
      repoRoot: string;
      authorityContractFile: string;
      receipt: {
        disposition: string;
        reviewer: string;
        source: string;
        actor: string | null;
        summary: string;
        findings: AcceptanceFinding[];
        subject_sha256: string;
        target_revision: string;
        contract_file: string;
        issued_at: string;
      };
    }) => { ok: boolean; reason?: string; message?: string };
  };
  let attestedImport: AttestedImportModule;
  try {
    attestedImport = (await import('../evidence/attested-import.ts')) as AttestedImportModule;
  } catch (error) {
    if (isModuleUnresolvedError(error)) {
      console.error('acceptance-receipt: attested-import module unavailable in this deployed-helper context; skipping ledger import (record unaffected)');
      return;
    }
    throw error;
  }

  const result = attestedImport.importAttestedEvidence({
    repoRoot: root,
    authorityContractFile,
    receipt: {
      disposition: receipt.disposition,
      reviewer: receipt.reviewer,
      source: receipt.source,
      actor: receipt.actor,
      summary: receipt.summary,
      findings: receipt.findings,
      subject_sha256: receipt.subject_sha256,
      target_revision: receipt.target_revision,
      contract_file: receipt.contract_file,
      issued_at: receipt.issued_at,
    },
  });
  if (!result.ok) {
    fail(`AcceptanceReceipt recorded but ledger import failed closed: ${result.message ?? result.reason}`);
  }
}

function projectRecordedAcceptance(args: {
  root: string;
  review: string | undefined;
  receipt: AcceptanceReceipt;
}): void {
  if (args.review) projectAcceptance(resolve(args.root, args.review), args.receipt);
}

function isModuleUnresolvedError(error: unknown): boolean {
  return (error as { code?: string } | null | undefined)?.code === 'ERR_MODULE_NOT_FOUND';
}

function option(argv: string[], name: string, required = true): string | undefined {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (required && (!value || value.startsWith('--'))) fail(`${name} is required`, 2);
  return value;
}

export async function runAcceptanceReceiptCli(argv: string[], opts: Options = {}): Promise<number> {
  const command = argv[0];
  if (command === 'evidence-requirement') {
    process.stdout.write(acceptanceBenchmarkRequirement(readRegular(realpathSync(process.cwd()), option(argv, '--contract')!, 'contract').content));
    return 0;
  }
  const root = repositoryRoot();
  const authorityHome = opts.authorityHome ?? userInfo().homedir;
  if (command === 'inspect-current') {
    const contract = option(argv, '--contract')!;
    const execution = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/evidence/verification-execution.ts')) as typeof import('../evidence/verification-execution');
    const report = execution.evaluateVerificationContract({ repoRoot: root, contractPath: contract });
    const subject = currentSubject(root);
    const evidence = inspectAcceptanceEvidence({ root, contract, report, subject, current: true });
    console.log(JSON.stringify(inspectAcceptanceCurrentBinding({ root, authorityHome, contract, subject, evidence })));
    return 0;
  }
  if (command === 'path') {
    console.log(acceptanceReceiptPath(root, authorityHome));
    return 0;
  }
  if (command === 'policy') {
    const contract = readRegular(root, option(argv, '--contract')!, 'contract');
    console.log(JSON.stringify(parseAcceptancePolicy(contract.content)));
    return 0;
  }
  if (command === 'grant-waiver') {
    const grant = recordUserWaiverGrant({
      root,
      authorityHome,
      contract: option(argv, '--contract')!,
      actor: option(argv, '--actor')!,
      summary: option(argv, '--summary')!,
      now: opts.now,
    });
    console.log(JSON.stringify(grant));
    return 0;
  }
  if (command === 'verify-waiver-grant') {
    console.log(JSON.stringify(verifyUserWaiverGrant({
      root,
      authorityHome,
      contract: option(argv, '--contract', false),
    })));
    return 0;
  }
  if (command === 'revoke-waiver') {
    revokeUserWaiverGrant({ root, authorityHome });
    return 0;
  }
  if (command === 'record') {
    const disposition = option(argv, '--disposition') as AcceptanceDisposition;
    if (!['external_pass', 'user_waiver', 'reject'].includes(disposition)) fail('--disposition is invalid', 2);
    const contract = option(argv, '--contract')!;
    const review = option(argv, '--review', false);
    if (disposition === 'user_waiver') {
      const receipt = await recordUserWaiverAcceptance({
        root,
        authorityHome,
        contract,
        verification: option(argv, '--verification')!,
        now: opts.now,
      });
      projectRecordedAcceptance({ root, review, receipt });
      await importAttestedReceiptIfApplicable(root, receipt, contract);
      console.log(JSON.stringify(receipt));
      return 0;
    }
    const findingsRaw = option(argv, '--findings-json', false) ?? '[]';
    const reviewResultFile = option(argv, '--review-result')!;
    if (!lstatSync(reviewResultFile).isFile() || lstatSync(reviewResultFile).isSymbolicLink()) fail('--review-result must be a regular file');
    const receipt = await recordAcceptance({
      reviewResult: validateDomainReview(JSON.parse(readFileSync(reviewResultFile,'utf8'))),
      root,
      authorityHome,
      contract,
      verification: option(argv, '--verification')!,
      disposition,
      reviewer: option(argv, '--reviewer')!,
      source: option(argv, '--source')!,
      actor: option(argv, '--actor', false) ?? null,
      summary: option(argv, '--summary')!,
      findings: validateFindings(JSON.parse(findingsRaw)),
      now: opts.now,
    });
    projectRecordedAcceptance({ root, review, receipt });
    await importAttestedReceiptIfApplicable(root, receipt, contract);
    console.log(JSON.stringify(receipt));
    return disposition === 'reject' ? 1 : 0;
  }
  if (command === 'verify') {
    const receipt = await verifyAcceptance({
      root,
      authorityHome,
      contract: option(argv, '--contract', false),
      verification: option(argv, '--verification', false),
    });
    const format = option(argv, '--format', false) ?? 'json';
    if (format === 'row') {
      console.log(`pass\t${receipt.reviewer}\t${receipt.source}\t${receipt.disposition}\tAcceptanceReceipt ${receipt.disposition} is valid.`);
    } else {
      console.log(JSON.stringify(receipt));
    }
    return 0;
  }
  if (command === 'project') {
    const receipt = await verifyAcceptance({
      root,
      authorityHome,
      contract: option(argv, '--contract', false),
      verification: option(argv, '--verification', false),
    });
    projectAcceptance(resolve(root, option(argv, '--review')!), receipt);
    return 0;
  }
  fail('usage: acceptance-receipt.ts <policy|grant-waiver|verify-waiver-grant|revoke-waiver|record|verify|project|path> ...', 2);
}
