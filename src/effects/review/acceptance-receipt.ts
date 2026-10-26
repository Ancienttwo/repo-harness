import { osAccountHome } from '../runtime/os-account-home';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import { bindReviewAdmission, reviewAdmissionAllowsPath } from '../../core/review/authority-context';
import { readReviewAdmissionSource, type ReviewAdmissionSource } from '../admission/admission-source';
import { gitSpawnSync } from '../git/runner';
import { gatesDirectoryName } from '../git/repository-identity';
import { assertObservationPath, currentReadonlyObservation, rejectObservation, observationReadFileSync as readFileSync } from '../readonly-observation';
import { createHash, randomUUID } from 'crypto';
import {
  chmodSync,
  existsSync,
  linkSync,
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
  acceptancePolicySource,
  acceptanceReviewContextDigest,
  acceptanceVerificationObservationSubjectKey,
  assertReviewFields,
  assertUserWaiverGrant,
  authorityFingerprint,
  buildAcceptanceVerificationObservation,
  contractCarriesArchiveProjection,
  fail,
  isRecord,
  renderAcceptanceProjection,
  sha256,
  stableJson,
  validateDisposition,
  validateDomainReview,
  validateFindings,
  validateUserWaiverAuthorization,
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
  acceptancePolicySource,
  acceptanceReviewContextDigest,
  acceptanceVerificationObservationSubjectKey,
  authorityFingerprint,
  contractCarriesArchiveProjection,
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
  admissionSource?: (root: string, values: Readonly<Record<string, string | undefined>>) => ReviewAdmissionSource;
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
        HOME: osAccountHome(),
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
  const result = gitSpawnSync(['-C', root, ...args], { gitBin: runtime.gitBin, encoding: 'utf-8', env: runtime.env });
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

/** Validate a materialized report, without another tree capture. Raw evaluator
 * results must cross the materialization boundary exactly once at the caller. */
export function inspectAcceptanceEvidence(args: {
  root: string;
  authority: ReviewAdmissionSource;
  report: unknown;
  subject: ReviewSubject;
  env?: NodeJS.ProcessEnv;
  current?: boolean;
}): AcceptanceEvidence {
  const root = realpathSync(args.root);
  const active = currentAdmission(root, args.authority);
  const admission = active.admission;
  if (isRecord(args.report) && args.report.kind === 'verification_unavailable') fail('verification evidence is unavailable: ' + args.report.reason);
  const execution = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/evidence/verification-execution.ts')) as typeof import('../evidence/verification-execution');
  let report: import('../evidence/verification-execution').VerificationExecutionReport;
  try {
    report = execution.validateMaterializedVerificationExecutionReport({ repoRoot: root, authority: args.authority,
      report: args.report,
      env: args.env, current: args.current }).report;
  } catch (error) { fail('verification execution evidence is invalid: ' + (error as Error).message); }
  const subject = args.subject;
  const allowed = admission.allowed_paths;
  if (subject.status !== 'ok') fail('current normalized review subject is unavailable');
  for (const path of subject.paths) if (!reviewAdmissionAllowsPath(allowed, path)) fail('admission Allowed Paths refuse reviewed path: ' + path);
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
    const recomputed = effects.prepareChangeAssessment({ repoRoot: root, authority: args.authority, targetRevision: subject.target_rev });
    if (recomputed.assessment.status === 'degraded') fail('verification evidence Change Assessment base is unavailable');
    if (declared.assessment_sha256 !== recomputed.assessment.assessment_sha256) fail('verification evidence Change Assessment does not match current base assessment');
    packet = core.validateReviewSelectionPacketAgainstAssessment(assessment.selection_packet, recomputed.assessment);
  } catch (error) { fail('verification evidence change assessment is invalid: ' + (error as Error).message); }
  if (packet.status !== 'ready') fail('verification evidence change assessment packet is blocked');
  let benchmark = 'not-applicable';
  if (admission.benchmark === 'required') {
    const validator = requireFromHelper(join(PACKAGE_ROOT, 'scripts/run-harness-profile-benchmark.ts')) as ProfileBenchmarkValidator;
    const reportPath = readRegular(root, 'evals/harness/reports/profile-comparison.json', 'required benchmark report').path;
    const validated = validator.validateHarnessBenchmarkReport(join(root, reportPath), true);
    const binding = readRegular(root, relative(root, validator.reportByteBindingPath(join(root, reportPath))), 'benchmark byte binding');
    benchmark = sha256(binding.content);
    if (!validated.authoritative) fail('required benchmark report is not authoritative');
  }
  const results = report.results.map(result => ({ ...result, execution: result.execution === 'reused' ? 'executed' : result.execution }));
  const target = { campaign_sha256: report.target.campaign_sha256, admission_sha256: report.target.admission_sha256, grant_sha256: report.target.grant_sha256, plan_hash: report.target.plan_hash, snapshot_hash: report.target.snapshot_hash, tree_hash: report.target.tree_hash };
  return { fingerprint: sha256(stableJson({ execution: { ...report, target, results }, change_assessment: assessmentBasis, benchmark })), benchmark };
}

function normalizedVerificationEvidence(content: string, subject: ReviewSubject, root: string,
  authority: ReviewAdmissionSource): AcceptanceEvidence {
  let report: unknown;
  try { report = JSON.parse(content); } catch (error) { fail('verification evidence is invalid JSON: ' + (error as Error).message); }
  const execution = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/evidence/verification-execution.ts')) as typeof import('../evidence/verification-execution');
  const current = execution.evaluateAdmittedVerification({ repoRoot: root, authority });
  if (!current.passed) fail('verification evidence is stale: current passing evaluation is unavailable');
  if (!isRecord(report) || !isRecord(report.target) || report.target.snapshot_hash !== current.target.snapshot_hash
    || report.target.plan_hash !== current.target.plan_hash) fail('verification evidence is stale for the current source snapshot');
  return inspectAcceptanceEvidence({ root, authority, report, subject, current: true });
}

function stateRoot(authorityHome: string): string {
  const home = realpathSync(authorityHome);
  if (!isAbsolute(home)) fail('authority home must be absolute');
  return join(home, '.repo-harness');
}

export function acceptanceReceiptPath(root: string, authorityHome: string, createParent = false): string {
  const parent = join(stateRoot(authorityHome), 'gates', gatesDirectoryName(realpathSync(root)));
  if (createParent) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
  }
  return join(parent, 'acceptance.latest.json');
}




/**
 * `acceptance.latest.json` is replaced by every later review in this checkout.
 * Each recorded receipt is also kept write-once under its own digest, so an
 * observation or product projection that pinned the digest still reads the
 * exact receipt it was built from.
 */
export function acceptanceReceiptRecordPath(root: string, authorityHome: string, receiptSha256: string, createParent = false): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(receiptSha256)) fail('AcceptanceReceipt record digest is invalid');
  const parent = join(stateRoot(authorityHome), 'gates', gatesDirectoryName(realpathSync(root)), 'acceptance-receipts');
  if (createParent) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
  }
  return join(parent, `${receiptSha256.slice('sha256:'.length)}.json`);
}

function persistAcceptanceReceiptRecord(root: string, authorityHome: string, bytes: Buffer): string {
  const digest = sha256(bytes);
  const path = acceptanceReceiptRecordPath(root, authorityHome, digest, true);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' });
  try {
    chmodSync(temporary, 0o600);
    linkSync(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!readFileSync(path).equals(bytes)) fail('AcceptanceReceipt record conflicts with existing bytes');
  } finally {
    unlinkSync(temporary);
  }
  return digest;
}

export function readAcceptanceReceiptRecord(
  root: string,
  authorityHome: string,
  receiptSha256: string,
): { readonly bytes: Buffer; readonly receipt: AcceptanceReceipt } {
  const path = acceptanceReceiptRecordPath(root, authorityHome, receiptSha256);
  let bytes: Buffer;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
      fail('AcceptanceReceipt record must be a regular file of at most 1 MiB');
    }
    bytes = readFileSync(path);
  } catch (error) {
    fail(`AcceptanceReceipt record is unavailable for ${receiptSha256}: ${(error as Error).message}`);
  }
  if (sha256(bytes) !== receiptSha256) fail('AcceptanceReceipt record does not match its digest');
  return Object.freeze({ bytes, receipt: parseReceipt(bytes.toString('utf-8')) });
}

export function userWaiverGrantPath(root: string, authorityHome: string, createParent = false): string {
  const parent = join(stateRoot(authorityHome), 'gates', gatesDirectoryName(realpathSync(root)));
  if (createParent) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
  }
  return join(parent, 'user-waiver-grant.latest.json');
}


export function acceptanceVerificationObservationPath(
  root: string,
  authorityHome: string,
  campaignSha256: string,
  admissionSha256: string,
  createParent = false,
): string {
  const parent = join(stateRoot(authorityHome), 'gates', gatesDirectoryName(realpathSync(root)), 'acceptance-observations');
  if (createParent) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
  }
  const key = acceptanceVerificationObservationSubjectKey(campaignSha256, admissionSha256);
  return join(parent, `${key.slice('sha256:'.length)}.json`);
}



export function writeAcceptanceVerificationObservation(args: {
  root: string;
  authorityHome: string;
  receipt: AcceptanceReceipt;
}): AcceptanceVerificationObservationV1 {
  const root = realpathSync(args.root);
  const observation = buildAcceptanceVerificationObservation({
    repository_root: root,
    acceptance_receipt_sha256: persistAcceptanceReceiptRecord(root, args.authorityHome, serializedRecord(args.receipt)),
    campaign_sha256: args.receipt.campaign_sha256,
    admission_sha256: args.receipt.admission_sha256,
    grant_sha256: args.receipt.grant_sha256,
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
    observation.campaign_sha256,
    observation.admission_sha256,
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
  campaignSha256: string,
  admissionSha256: string,
): AcceptanceVerificationObservationV1 | null {
  const repositoryRoot = realpathSync(root);
  const path = acceptanceVerificationObservationPath(repositoryRoot, authorityHome, campaignSha256, admissionSha256);
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
  if (record.campaign_sha256 !== campaignSha256 || record.admission_sha256 !== admissionSha256) {
    fail('AcceptanceVerificationObservation subject is stale');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(record.grant_sha256)) fail('AcceptanceVerificationObservation grant_sha256 is invalid');
  if (!['external_pass', 'user_waiver', 'reject'].includes(String(record.disposition))) {
    fail('AcceptanceVerificationObservation disposition is invalid');
  }
  const rebuilt = buildAcceptanceVerificationObservation({
    repository_root: record.repository_root,
    acceptance_receipt_sha256: record.acceptance_receipt_sha256,
    campaign_sha256: record.campaign_sha256,
    admission_sha256: record.admission_sha256,
    grant_sha256: record.grant_sha256,
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
  const key = acceptanceVerificationObservationSubjectKey(rebuilt.campaign_sha256, rebuilt.admission_sha256);
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
    if (receipt.protocol !== 3 || receipt.kind !== 'repo-harness-acceptance-receipt') {
      return no('receipt_protocol_kind', 'AcceptanceReceipt kind/protocol is invalid');
    }
    if (receipt.repository_root !== input.repositoryRoot) return no('repository_root', 'AcceptanceReceipt repository root is stale');
    if (receipt.campaign_sha256 !== input.admission.campaign_sha256) return no('campaign_identity', 'AcceptanceReceipt campaign is stale');
    if (receipt.admission_sha256 !== input.admission.admission_sha256 || receipt.grant_sha256 !== input.grantSha256) return no('admission_binding', 'AcceptanceReceipt admission is stale');
    if (!SHA256_FIELD.test(receipt.grant_sha256)) return no('grant_digest_shape', 'AcceptanceReceipt grant digest is invalid');
    const policy: AcceptancePolicy = { protocol: 1, ...input.admission.policy };
    if (policy.reviewer !== receipt.expected_reviewer) return no('reviewer_policy', 'AcceptanceReceipt reviewer policy is stale');
    if (input.admission.goal.revision !== receipt.goal_sha256) return no('goal_fingerprint', 'AcceptanceReceipt goal is stale');
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
    const owner = input.admission.actor_id;
    if (receipt.disposition === 'user_waiver') {
      const grant = input.waiverGrant;
      if (grant === null) return no('waiver_grant_present', 'AcceptanceReceipt user_waiver requires a UserWaiverGrant');
      assertUserWaiverGrant(grant);
      if (policy.user_waiver !== 'allowed') return no('waiver_policy_allowed', 'admission forbids user waiver');
      if (grant.repository_root !== input.repositoryRoot) return no('waiver_grant_repository', 'UserWaiverGrant repository root is stale');
      if (grant.campaign_sha256 !== receipt.campaign_sha256 || grant.admission_sha256 !== receipt.admission_sha256) {
        return no('waiver_grant_admission', 'UserWaiverGrant admission authority is stale');
      }
      if (grant.grant_sha256 !== receipt.grant_sha256 || grant.goal_sha256 !== receipt.goal_sha256) {
        return no('waiver_grant_goal', 'UserWaiverGrant goal authority is stale');
      }
      if (grant.actor !== owner) return no('waiver_grant_owner', 'UserWaiverGrant owner is stale');
      if (waiverGrantFingerprint(grant) !== receipt.waiver_grant_sha256) return no('waiver_grant_fingerprint', 'AcceptanceReceipt waiver grant is stale');
      validateUserWaiverAuthorization(grant.authorization, waiverAuthorizationSubject(input.repositoryRoot, input.admission, input.grantSha256, grant.summary), Date.now());
    } else if (receipt.waiver_grant_sha256 !== null || input.waiverGrant !== null) {
      return no('waiver_binding_symmetry', 'AcceptanceReceipt waiver grant binding does not match disposition');
    }
    try {
      assertReviewFields(receipt);
      validateDisposition(policy, owner, receipt.disposition, receipt.reviewer, receipt.source, receipt.actor, receipt.findings);
    } catch (error) {
      return no('disposition_policy', (error as Error).message);
    }
    if (receipt.disposition === 'reject') return no('disposition_not_reject', 'AcceptanceReceipt disposition is reject');
    return { ok: true };
  } catch (error) {
    // A rule that threw rather than returned: the contract policy block is
    // unparseable, or an input the caller supplied is malformed.
    return { ok: false, rule: 'validator_threw', reason: (error as Error).message };
  }
}

function readReceipt(path: string): AcceptanceReceipt {
  if (!existsSync(path)) fail(`AcceptanceReceipt is missing: ${path}`);
  return parseReceipt(readFileSync(path, 'utf-8'));
}

function parseReceipt(text: string): AcceptanceReceipt {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail(`AcceptanceReceipt is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value) || value.protocol !== 3 || value.kind !== 'repo-harness-acceptance-receipt') {
    fail('AcceptanceReceipt kind/protocol is invalid');
  }
  const requiredStrings = [
    'repository_root', 'campaign_sha256', 'admission_sha256', 'grant_sha256', 'goal_sha256',
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
  for (const field of ['campaign_sha256', 'admission_sha256', 'grant_sha256', 'goal_sha256', 'verification_evidence_sha256', 'subject_sha256']) {
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
 * The one serialization of a receipt file. The digest-keyed record stores
 * these bytes for the receipt being recorded, never a re-read of the latest
 * file another acceptance in the same checkout may have replaced.
 */
function serializedRecord(receipt: AcceptanceReceipt | AcceptanceReviewResult): Buffer {
  return Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf-8');
}

function writeReceipt(path: string, receipt: AcceptanceReceipt | AcceptanceReviewResult): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, serializedRecord(receipt), { mode: 0o600 });
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
  assertUserWaiverGrant(value);
  return value;
}

function writeUserWaiverGrant(path: string, grant: UserWaiverGrant): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(grant, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}





function currentAdmission(root: string, authority: ReviewAdmissionSource) {
  if (currentReadonlyObservation()) rejectObservation('Live issue admission requires an external observation');
  if (realpathSync(authority.repoRoot) !== root) fail('review admission repository mismatch');
  return observeActiveReviewAdmission(authority);
}

function waiverAuthorizationSubject(root: string, admission: ReturnType<typeof currentAdmission>['admission'], grant: string, summary: string) {
  return { repository_root: root, repository_id: admission.repository_id, issue_id: admission.issue_id, campaign_id: admission.campaign_id,
    campaign_sha256: admission.campaign_sha256, admission_sha256: admission.admission_sha256,
    grant_sha256: grant, goal_sha256: admission.goal.revision, actor: admission.actor_id, summary };
}

/** Trusted Bot entrypoint. The caller must obtain separate human waiver approval
 * upstream. Policy eligibility and an execution actor name are not that action.
 */
export function recordUserWaiverGrant(args: {
  root: string; authorityHome: string; authority: ReviewAdmissionSource; actor: string; summary: string; authorization?: unknown; now?: () => Date;
}): UserWaiverGrant {
  if (!args.summary.trim()) fail('waiver grant summary is required');
  const root = realpathSync(args.root), active = currentAdmission(root, args.authority), admission = active.admission;
  if (admission.policy.user_waiver !== 'allowed') fail('admission forbids user waiver');
  if (args.actor !== admission.actor_id) fail('UserWaiverGrant actor must equal the approved actor');
  const now = (args.now ?? (() => new Date()))();
  const authorization = validateUserWaiverAuthorization(args.authorization,
    waiverAuthorizationSubject(root, admission, active.grant_sha256, args.summary), now.getTime());
  const grant: UserWaiverGrant = {
    protocol: 3, kind: 'repo-harness-user-waiver-grant', repository_root: root,
    campaign_sha256: admission.campaign_sha256, admission_sha256: admission.admission_sha256,
    grant_sha256: active.grant_sha256, goal_sha256: admission.goal.revision,
    actor: args.actor, scope: 'admission-authority', summary: args.summary,
    issued_at: now.toISOString(), authorization,
  };
  writeUserWaiverGrant(userWaiverGrantPath(root, args.authorityHome, true), grant);
  return grant;
}

export function verifyUserWaiverGrant(args: {
  root: string; authorityHome: string; authority: ReviewAdmissionSource; now?: () => Date;
}): UserWaiverGrant {
  const root = realpathSync(args.root), active = currentAdmission(root, args.authority), admission = active.admission;
  const grant = readUserWaiverGrant(userWaiverGrantPath(root, args.authorityHome));
  if (grant.repository_root !== root || grant.campaign_sha256 !== admission.campaign_sha256
    || grant.admission_sha256 !== admission.admission_sha256 || grant.grant_sha256 !== active.grant_sha256
    || grant.goal_sha256 !== admission.goal.revision || grant.actor !== admission.actor_id) fail('UserWaiverGrant authority is stale');
  if (admission.policy.user_waiver !== 'allowed') fail('admission forbids user waiver');
  validateUserWaiverAuthorization(grant.authorization, waiverAuthorizationSubject(root, admission, active.grant_sha256, grant.summary),
    (args.now ?? (() => new Date()))().getTime());
  return grant;
}

export function revokeUserWaiverGrant(args: { root: string; authorityHome: string }): void {
  if (currentReadonlyObservation()) rejectObservation('Observation cannot revoke a waiver');
  const path = userWaiverGrantPath(realpathSync(args.root), args.authorityHome);
  if (existsSync(path)) unlinkSync(path);
}

export async function acceptanceContext(args: {
  root: string; authority: ReviewAdmissionSource; verification: string; authorityHome?: string; targetRef?: string; targetRevision?: string;
}) {
  const root = realpathSync(args.root), active = currentAdmission(root, args.authority), admission = active.admission;
  const verification = verificationReportFile(root, args.verification);
  const subject = currentSubject(root, args.targetRef, args.targetRevision);
  const evidence = normalizedVerificationEvidence(verification.content, subject, root, args.authority);
  const report = JSON.parse(verification.content);
  const authorityContext = bindReviewAdmission(admission, {
    subject: { status: 'ok', scope: subject.scope, target_ref: subject.target_ref, target_rev: subject.target_rev,
      head_rev: subject.head_rev, review_subject_sha256: subject.review_subject_sha256 },
    verification: { plan_sha256: report.target.plan_hash, source_sha256: report.target.snapshot_hash,
      // The validated snapshot SHA256 binds the Git tree OID; the OID itself may be SHA1.
      tree_sha256: report.target.snapshot_hash, evidence_sha256: evidence.fingerprint },
  }, active.grant_sha256);
  if (currentAdmission(root, args.authority).revision !== active.revision) fail('review admission changed during evidence observation');
  const policy: AcceptancePolicy = { protocol: 1, ...admission.policy };
  return { root, authority: args.authority, admission, authorityContext, policy, owner: admission.actor_id,
    goal: admission.goal, verification, subject, evidence };
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
    protocol: 3,
    kind: 'repo-harness-acceptance-receipt',
    repository_root: context.root,
    campaign_sha256: context.admission.campaign_sha256,
    admission_sha256: context.admission.admission_sha256,
    grant_sha256: context.authorityContext.authorization.grant_sha256,
    goal_sha256: context.goal.revision,
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
    receipt.campaign_sha256,
    receipt.admission_sha256,
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
    admission: context.admission,
    grantSha256: context.authorityContext.authorization.grant_sha256,
    waiverGrant,
  });
  if (verdict.ok || verdict.rule === 'disposition_not_reject') return;
  fail(`${verdict.reason} (${verdict.rule})`);
}

export async function recordAcceptance(args: {
  reviewResult?: AcceptanceReviewResult;
  root: string;
  authorityHome: string;
  authority: ReviewAdmissionSource;
  verification: string;
  disposition: AcceptanceDisposition;
  reviewer: string;
  source: string;
  actor: string | null;
  summary: string;
  findings: AcceptanceFinding[];
  /** A provider must bind its opinion to the context it actually reviewed. */
  expectedContext?: {
    admission_sha256: string;
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
      admission_sha256: context.admission.admission_sha256,
      goal_sha256: context.goal.revision,
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
  authority: ReviewAdmissionSource;
  verification: string;
  now?: () => Date;
}): Promise<AcceptanceReceipt> {
  const context = await acceptanceContext(args);
  const grant = verifyUserWaiverGrant({
    root: context.root,
    authorityHome: args.authorityHome,
    authority: args.authority,
    now: args.now,
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
  root: string; authorityHome: string; authority: ReviewAdmissionSource; verification?: string;
}): Promise<AcceptanceReceipt> {
  const root = realpathSync(args.root);
  const receipt = readReceipt(acceptanceReceiptPath(root, args.authorityHome));
  const subject = currentSubject(root, receipt.target_ref, receipt.target_revision);
  if (subject.review_subject_sha256 !== receipt.subject_sha256) fail('AcceptanceReceipt semantic subject is stale');
  const context = await acceptanceContext({ ...args, root, verification: args.verification ?? receipt.verification_file,
    targetRef: receipt.target_ref, targetRevision: receipt.target_revision });
  return inspectAcceptanceCurrentBinding({ root, authorityHome: args.authorityHome, authority: args.authority,
    subject: context.subject, evidence: context.evidence });
}

/** Reobserve admission even when the evaluator supplies current subject evidence. */
export function inspectAcceptanceCurrentBinding(args: {
  root: string; authorityHome: string; authority: ReviewAdmissionSource; subject: ReviewSubject; evidence: AcceptanceEvidence;
}): AcceptanceReceipt {
  const root = realpathSync(args.root), active = currentAdmission(root, args.authority);
  const receipt = readReceipt(acceptanceReceiptPath(root, args.authorityHome)), subject = args.subject;
  if (subject.review_subject_sha256 !== receipt.subject_sha256 || subject.target_ref !== receipt.target_ref
    || subject.target_rev !== receipt.target_revision || stableJson(subject.paths) !== stableJson(receipt.reviewed_paths)) fail('AcceptanceReceipt semantic subject is stale');
  const diff = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/review/diff-fingerprint.ts')) as typeof import('./diff-fingerprint');
  const base = diff.resolvePolicyReviewBase(root);
  if (!base.ok || base.targetRef !== receipt.target_ref) fail('AcceptanceReceipt target ref is stale against workflow policy');
  if (args.evidence.fingerprint !== receipt.verification_evidence_sha256 || args.evidence.benchmark !== receipt.benchmark_evidence_sha256) fail('AcceptanceReceipt verification evidence is stale');
  const report = JSON.parse(verificationReportFile(root, receipt.verification_file).content);
  const context = bindReviewAdmission(active.admission, {
    subject: { status: 'ok', scope: subject.scope, target_ref: subject.target_ref, target_rev: subject.target_rev, head_rev: subject.head_rev, review_subject_sha256: subject.review_subject_sha256 },
    verification: { plan_sha256: report.target.plan_hash, source_sha256: report.target.snapshot_hash, // The validated snapshot SHA256 binds the Git tree OID; the OID itself may be SHA1.
      tree_sha256: report.target.snapshot_hash, evidence_sha256: args.evidence.fingerprint },
  }, active.grant_sha256);
  verifyReviewResult(root, args.authorityHome, receipt, context.context_sha256);
  const verdict = validateAcceptanceReceiptAgainstPolicy({ receipt, repositoryRoot: root, admission: active.admission, grantSha256: active.grant_sha256,
    waiverGrant: receipt.disposition === 'user_waiver' ? verifyUserWaiverGrant(args) : null });
  if (!verdict.ok) fail(verdict.reason);
  const observation = readAcceptanceVerificationObservation(root, args.authorityHome, receipt.campaign_sha256, receipt.admission_sha256);
  if (!observation || observation.acceptance_receipt_sha256 !== sha256(readFileSync(acceptanceReceiptPath(root, args.authorityHome)))
    || observation.grant_sha256 !== receipt.grant_sha256 || observation.goal_sha256 !== receipt.goal_sha256
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
  if (currentReadonlyObservation()) rejectObservation('Observation cannot write an acceptance projection');
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
  authority: ReviewAdmissionSource,
): Promise<void> {
  if (receipt.disposition !== 'external_pass' && receipt.disposition !== 'user_waiver') return;

  type AttestedImportModule = {
    importAttestedEvidence: (input: { repoRoot: string; authority: ReviewAdmissionSource; receipt: AcceptanceReceipt }) => { ok: boolean; reason?: string; message?: string };
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

  const result = attestedImport.importAttestedEvidence({ repoRoot: root, authority, receipt });
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
  const root = repositoryRoot();
  const authorityHome = opts.authorityHome ?? osAccountHome();
  if (command === 'path') { console.log(acceptanceReceiptPath(root, authorityHome)); return 0; }
  if (command === 'revoke-waiver') { revokeUserWaiverGrant({ root, authorityHome }); return 0; }
  const authority = (opts.admissionSource ?? readReviewAdmissionSource)(root, {
    'repository-id': option(argv, '--repository-id', false), 'issue-id': option(argv, '--issue-id', false),
    'campaign-id': option(argv, '--campaign-id', false), 'grant-sha256': option(argv, '--grant-sha256', false),
    'policy-sha256': option(argv, '--policy-sha256', false), actor: option(argv, '--actor', false),
  });
  if (command === 'evidence-requirement') {
    process.stdout.write(currentAdmission(root, authority).admission.benchmark); return 0;
  }
  if (command === 'inspect-current') {
    const execution = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/evidence/verification-execution.ts')) as typeof import('../evidence/verification-execution');
    const report = execution.evaluateAdmittedVerification({ repoRoot: root, authority });
    const subject = currentSubject(root);
    const evidence = inspectAcceptanceEvidence({ root, authority,
      report: execution.materializeVerificationExecutionReport(report), subject, current: true });
    console.log(JSON.stringify(inspectAcceptanceCurrentBinding({ root, authorityHome, authority, subject, evidence })));
    return 0;
  }
  if (command === 'policy') {
    console.log(JSON.stringify(currentAdmission(root, authority).admission.policy));
    return 0;
  }
  if (command === 'grant-waiver') {
    const grant = recordUserWaiverGrant({
      root,
      authorityHome,
      authority,
      actor: option(argv, '--actor')!,
      summary: option(argv, '--summary')!,
      authorization: JSON.parse(readFileSync(resolve(root, option(argv, '--authorization')!), 'utf8')),
      now: opts.now,
    });
    console.log(JSON.stringify(grant));
    return 0;
  }
  if (command === 'verify-waiver-grant') {
    console.log(JSON.stringify(verifyUserWaiverGrant({
      root,
      authorityHome,
      authority,
      now: opts.now,
    })));
    return 0;
  }
  if (command === 'record') {
    const disposition = option(argv, '--disposition') as AcceptanceDisposition;
    if (!['external_pass', 'user_waiver', 'reject'].includes(disposition)) fail('--disposition is invalid', 2);
    const review = option(argv, '--review', false);
    if (disposition === 'user_waiver') {
      const receipt = await recordUserWaiverAcceptance({
        root,
        authorityHome,
        authority,
        verification: option(argv, '--verification')!,
        now: opts.now,
      });
      projectRecordedAcceptance({ root, review, receipt });
      await importAttestedReceiptIfApplicable(root, receipt, authority);
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
      authority,
      verification: option(argv, '--verification')!,
      disposition,
      reviewer: option(argv, '--reviewer')!,
      source: option(argv, '--source')!,
      actor: null,
      summary: option(argv, '--summary')!,
      findings: validateFindings(JSON.parse(findingsRaw)),
      now: opts.now,
    });
    projectRecordedAcceptance({ root, review, receipt });
    await importAttestedReceiptIfApplicable(root, receipt, authority);
    console.log(JSON.stringify(receipt));
    return disposition === 'reject' ? 1 : 0;
  }
  if (command === 'verify') {
    const receipt = await verifyAcceptance({
      root,
      authorityHome,
      authority,
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
      authority,
      verification: option(argv, '--verification', false),
    });
    projectAcceptance(resolve(root, option(argv, '--review')!), receipt);
    return 0;
  }
  fail('usage: acceptance-receipt.ts <policy|grant-waiver|verify-waiver-grant|revoke-waiver|record|verify|project|path> ...', 2);
}
