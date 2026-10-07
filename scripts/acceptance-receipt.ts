#!/usr/bin/env bun

import { assertObservationPath, currentReadonlyObservation, rejectObservation, observationReadFileSync as readFileSync, observationSpawnSync as spawnSync } from '../src/effects/state/readonly-observation';
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
import { fileURLToPath, pathToFileURL } from 'url';

export type AcceptanceDisposition = 'external_pass' | 'user_waiver' | 'reject';

export type AcceptancePolicyV1 = {
  protocol: 1;
  reviewer: 'Claude' | 'Codex';
  user_waiver: 'allowed' | 'forbidden';
};

export type AcceptancePolicyV2 = {
  protocol: 2;
  reviewer: 'Codex';
  source: 'generic-review';
  user_waiver: 'allowed' | 'forbidden';
};

export type AcceptancePolicy = AcceptancePolicyV1 | AcceptancePolicyV2;

export type AcceptanceFinding = {
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  message: string;
};

export type AcceptanceReceipt = {
  protocol: 2;
  kind: 'repo-harness-acceptance-receipt';
  repository_root: string;
  contract_file: string;
  contract_sha256: string;
  goal_file: string;
  goal_sha256: string;
  verification_file: string;
  verification_evidence_sha256: string;
  benchmark_evidence_sha256: string;
  subject_sha256: string;
  subject_scope: 'normalized-final-content';
  target_ref: string;
  target_revision: string;
  reviewed_paths: string[];
  disposition: AcceptanceDisposition;
  expected_reviewer: 'Claude' | 'Codex';
  reviewer: 'Claude' | 'Codex' | 'User';
  source: 'generic-review' | 'user-waiver';
  request_id: string | null;
  context_sha256: string | null;
  result_sha256: string | null;
  actual_harness: 'claude' | 'codex' | null;
  actual_role: string | null;
  actual_model: string | null;
  actor: string | null;
  summary: string;
  findings: AcceptanceFinding[];
  waiver_grant_sha256: string | null;
  issued_at: string;
};

/** Closed review-domain role approved by the product contract, not runtime fleet configuration.
 * This is its single validity definition; fleet owns model/effort for this named role.
 */
export const GENERIC_REVIEW_ROLE = 'deep-reasoner' as const;

export interface AcceptanceReviewResult {
  request_id: string;
  context_sha256: string;
  subject_sha256: string;
  actual_harness: 'claude' | 'codex';
  actual_role: string;
  actual_model: string;
  verdict: 'PASS' | 'FAIL';
  summary: string;
  findings: AcceptanceFinding[];
}

export function acceptanceReviewContextDigest(context: Awaited<ReturnType<typeof acceptanceContext>>): string {
  return authorityFingerprint(stableJson([
    authorityFingerprint(context.contract.content), authorityFingerprint(context.goal.content),
    context.subject.review_subject_sha256, context.evidence.fingerprint, context.subject.target_rev,
  ]));
}

function reviewResultPath(root: string, authorityHome: string): string {
  return acceptanceReceiptPath(root, authorityHome).replace('acceptance.latest.json', 'acceptance.review-result.json');
}

function validateDomainReview(value: unknown): AcceptanceReviewResult {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== ['request_id','context_sha256','subject_sha256','actual_harness','actual_role','actual_model','verdict','summary','findings'].sort().join(',')) fail('generic-review result schema is invalid');
  if (typeof value.request_id !== 'string' || !value.request_id.trim()
    || !/^sha256:[0-9a-f]{64}$/.test(String(value.context_sha256)) || !/^sha256:[0-9a-f]{64}$/.test(String(value.subject_sha256))
    || !['claude','codex'].includes(String(value.actual_harness)) || value.actual_role !== GENERIC_REVIEW_ROLE
    || typeof value.actual_model !== 'string' || !value.actual_model.trim()
    || !['PASS','FAIL'].includes(String(value.verdict)) || typeof value.summary !== 'string' || !value.summary.trim()) fail('generic-review result identity/verdict is invalid');
  return { ...value, findings: validateFindings(value.findings) } as unknown as AcceptanceReviewResult;
}

function assertReviewFields(receipt: AcceptanceReceipt): void {
  const fields = ['request_id','context_sha256','result_sha256','actual_harness','actual_role','actual_model'] as const;
  if (receipt.disposition === 'user_waiver') {
    if (fields.some(field => receipt[field] !== null)) fail('AcceptanceReceipt user waiver has review binding');
    return;
  }
  if (typeof receipt.request_id !== 'string' || !receipt.request_id.trim()) fail('AcceptanceReceipt generic-review request_id is invalid');
  if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.context_sha256))) fail('AcceptanceReceipt generic-review context_sha256 is invalid');
  if (!/^sha256:[0-9a-f]{64}$/.test(String(receipt.result_sha256))) fail('AcceptanceReceipt generic-review result_sha256 is invalid');
  if (receipt.actual_harness !== receipt.reviewer.toLowerCase()) fail('AcceptanceReceipt generic-review actual_harness mismatch');
  if (receipt.actual_role !== GENERIC_REVIEW_ROLE) fail('AcceptanceReceipt generic-review actual_role mismatch');
  if (typeof receipt.actual_model !== 'string' || !receipt.actual_model.trim()) fail('AcceptanceReceipt generic-review actual_model is invalid');
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

export type UserWaiverGrant = {
  protocol: 1;
  kind: 'repo-harness-user-waiver-grant';
  repository_root: string;
  contract_file: string;
  contract_sha256: string;
  goal_file: string;
  goal_sha256: string;
  actor: string;
  scope: 'contract-authority';
  summary: string;
  issued_at: string;
};

export type ReviewSubject = {
  status: 'ok' | 'unknown';
  scope: 'normalized-final-content';
  target_ref: string;
  target_rev: string;
  paths: readonly string[];
  target_overlap_count: number;
  review_subject_sha256: string;
};

type Options = {
  authorityHome?: string;
  now?: () => Date;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = basename(SCRIPT_DIR) === 'helpers'
  && basename(dirname(SCRIPT_DIR)) === 'templates'
  && basename(dirname(dirname(SCRIPT_DIR))) === 'assets'
  ? resolve(SCRIPT_DIR, '../../..')
  : resolve(SCRIPT_DIR, '..');
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

function fail(message: string, code = 1): never {
  const error = new Error(message) as Error & { exitCode?: number };
  error.exitCode = code;
  throw error;
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

type ArchiveProjectionKind = 'plan' | 'contract' | 'review' | 'notes';

type ArchiveProjectionEntry = {
  source: string;
  destination: string;
  kind: ArchiveProjectionKind;
};

type ParsedArchiveProjection = {
  body: string;
  entries: ArchiveProjectionEntry[];
  lifecycle: ArchiveProjectionKind;
  relatedPlan: string;
  manifestSha256: string;
};

export type ArchiveProjectionReceipt = {
  protocol: 1;
  kind: 'repo-harness-archive-projection-receipt';
  repository_root: string;
  acceptance_receipt_sha256: string;
  contract_sha256: string;
  goal_sha256: string;
  projection_sha256: string;
  files: Array<{
    kind: ArchiveProjectionKind;
    path: string;
    sha256: string;
  }>;
  issued_at: string;
};

function archiveProjectionKind(path: string, archived: boolean): ArchiveProjectionKind | null {
  const patterns: Array<[ArchiveProjectionKind, RegExp]> = archived
    ? [
        ['plan', /^plans\/archive\/plan-[^`\r\n]+\.md$/],
        ['contract', /^tasks\/archive\/contract-[^`\r\n]+\.md$/],
        ['review', /^tasks\/archive\/review-[^`\r\n]+\.md$/],
        ['notes', /^tasks\/archive\/notes-[^`\r\n]+\.md$/],
      ]
    : [
        ['plan', /^plans\/plan-[^`\r\n]+\.md$/],
        ['contract', /^tasks\/contracts\/[^`\r\n]+\.contract\.md$/],
        ['review', /^tasks\/reviews\/[^`\r\n]+\.review\.md$/],
        ['notes', /^tasks\/notes\/[^`\r\n]+\.notes\.md$/],
      ];
  return patterns.find(([, pattern]) => pattern.test(path))?.[0] ?? null;
}

function parseArchiveProjection(content: string): ParsedArchiveProjection | null {
  const projectionMarker = '> **Archive Projection V1**:';
  const archiveEnvelope = /^(?<envelope>> \*\*Archived\*\*: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\r?\n> \*\*Related Plan\*\*: (?<relatedPlan>plans\/archive\/[^\r\n]+)\r?\n> \*\*Outcome\*\*: (?:Completed|Abandoned|Superseded)\r?\n> \*\*Lifecycle\*\*: (?<lifecycle>plan|contract|review|notes)\r?\n> \*\*Parent Run ID\*\*: [^\s\r\n]+\r?\n(?<projection>(?:> \*\*Archive Projection V1\*\*: `[^`\r\n]+` => `[^`\r\n]+`\r?\n)*)\r?\n)/;
  const envelope = archiveEnvelope.exec(content);
  if (!envelope) {
    if (content.includes(projectionMarker)) fail('archive projection envelope is malformed');
    return null;
  }

  const projectionText = envelope.groups?.projection ?? '';
  if (projectionText === '') return null;

  const entries: ArchiveProjectionEntry[] = [];
  const linePattern = /^> \*\*Archive Projection V1\*\*: `([^`\r\n]+)` => `([^`\r\n]+)`\r?$/gm;
  for (const match of projectionText.matchAll(linePattern)) {
    const source = match[1];
    const destination = match[2];
    const sourceKind = archiveProjectionKind(source, false);
    const destinationKind = archiveProjectionKind(destination, true);
    if (sourceKind === null || destinationKind === null || sourceKind !== destinationKind) {
      fail('archive projection entry crosses an unsupported workflow family');
    }
    entries.push({ source, destination, kind: sourceKind });
  }
  if (entries.length === 0 || entries.length !== projectionText.trimEnd().split(/\r?\n/).length) {
    fail('archive projection entries are malformed');
  }
  if (new Set(entries.map((entry) => entry.source)).size !== entries.length
    || new Set(entries.map((entry) => entry.destination)).size !== entries.length) {
    fail('archive projection entries must be one-to-one');
  }
  const planEntry = entries.find((entry) => entry.kind === 'plan');
  if (!planEntry || planEntry.destination !== envelope.groups?.relatedPlan) {
    fail('archive projection related plan is inconsistent');
  }
  const lifecycle = envelope.groups?.lifecycle as ArchiveProjectionKind;
  if (!entries.some((entry) => entry.kind === lifecycle)) {
    fail('archive projection does not contain its lifecycle artifact');
  }

  let normalized = content.slice(envelope[0].length);
  for (const entry of [...entries].sort((left, right) => right.destination.length - left.destination.length)) {
    normalized = normalized.replaceAll(entry.destination, entry.source);
  }
  const canonicalEntries = [...entries].sort((left, right) => left.source.localeCompare(right.source));
  return {
    body: normalized,
    entries,
    lifecycle,
    relatedPlan: envelope.groups?.relatedPlan ?? '',
    manifestSha256: sha256(stableJson({ protocol: 1, entries: canonicalEntries })),
  };
}

function normalizeArchiveProjection(content: string): string {
  const parsed = parseArchiveProjection(content);
  if (parsed) return parsed.body;
  const legacyEnvelope = /^> \*\*Archived\*\*: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\r?\n> \*\*Related Plan\*\*: plans\/archive\/[^\r\n]+\r?\n> \*\*Outcome\*\*: (?:Completed|Abandoned|Superseded)\r?\n> \*\*Lifecycle\*\*: (?:contract|review|notes)\r?\n> \*\*Parent Run ID\*\*: [^\s\r\n]+\r?\n\r?\n/;
  return content.replace(legacyEnvelope, '');
}

export function authorityFingerprint(content: string): string {
  const normalized = normalizeArchiveProjection(content)
    .replace(/^> \*\*Status\*\*:[ \t]*.+$/m, '> **Status**: <lifecycle>')
    .replace(/^> \*\*Last Updated\*\*:[ \t]*.+$/m, '> **Last Updated**: <lifecycle>');
  return sha256(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function markdownHeader(markdown: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^> \\*\\*${escaped}\\*\\*:[ \\t]*(.+?)[ \\t]*$`, 'm'));
  return match?.[1]?.replace(/^`|`$/g, '').trim() ?? '';
}

export function parseAcceptancePolicy(contractText: string): AcceptancePolicy {
  const section = contractText.match(/^## Acceptance Policy[ \t]*\r?\n+```json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/m);
  if (!section) fail('contract Acceptance Policy JSON block is missing');
  let value: unknown;
  try {
    value = JSON.parse(section[1]);
  } catch (error) {
    fail(`contract Acceptance Policy is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value) || (value.protocol !== 1 && value.protocol !== 2)) fail('acceptance policy protocol must be 1 or 2');
  if (value.user_waiver !== 'allowed' && value.user_waiver !== 'forbidden') {
    fail('acceptance policy user_waiver must be allowed or forbidden');
  }
  const keys = Object.keys(value).sort();
  if (value.protocol === 1) {
    if (value.reviewer !== 'Claude' && value.reviewer !== 'Codex') fail('acceptance policy reviewer must be Claude or Codex');
    if (JSON.stringify(keys) !== JSON.stringify(['protocol', 'reviewer', 'user_waiver'])) {
      fail('acceptance policy protocol 1 contains unknown fields');
    }
    return value as AcceptancePolicyV1;
  }
  if (value.reviewer !== 'Codex') fail('acceptance policy protocol 2 reviewer must be Codex');
  if (value.source !== 'generic-review') {
    fail('acceptance policy protocol 2 source must be generic-review');
  }
  if (JSON.stringify(keys) !== JSON.stringify(['protocol', 'reviewer', 'source', 'user_waiver'])) {
    fail('acceptance policy protocol 2 contains unknown fields');
  }
  return value as AcceptancePolicyV2;
}

export function acceptancePolicySource(): 'generic-review' {
  return 'generic-review';
}

function currentSubject(root: string, targetRef?: string, targetRevision?: string): ReviewSubject {
  const module = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/review/diff-fingerprint.ts')) as typeof import('../src/effects/review/diff-fingerprint');
  const reviewBase = module.resolvePolicyReviewBase(root);
  if (!reviewBase.ok) fail('policy review base is unavailable: ' + reviewBase.reason);
  if (targetRef !== undefined && targetRef !== reviewBase.targetRef) fail('AcceptanceReceipt target ref is stale against workflow policy');
  const subject = module.buildReviewSubject(root, { targetRef: targetRef ?? reviewBase.targetRef, targetRevision });
  if (subject.status !== 'ok' || !/^sha256:[0-9a-f]{64}$/.test(subject.review_subject_sha256)) fail('current normalized review subject is unavailable');
  return subject;
}

/** The contract owns benchmark applicability. Missing or ambiguous declarations refuse. */
export function acceptanceBenchmarkRequirement(contractContent: string): 'required' | 'not_applicable' {
  const blocks = [...contractContent.matchAll(/^\x60\x60\x60yaml[ \t]*\r?\n([\s\S]*?)\r?\n\x60\x60\x60[ \t]*$/gm)];
  const declarations: unknown[] = [];
  for (const block of blocks) {
    const text = block[1]!;
    // Admit the existing canonical key spelling and reject duplicate data before YAML can overwrite it.
    if (/^\s*["'](?:evidence_requirements|benchmark)["']\s*:|^\s*(?:evidence_requirements|benchmark)\s+:/m.test(text)
      || /^\s*(?:---|\.\.\.)\s*$/m.test(text)) fail('contract evidence requirements use an unsupported key or document form');
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*evidence_requirements:/.test(line) && !/^\s*evidence_requirements:[ \t]*(?:#[^\n]*)?$/.test(line)) fail('contract evidence requirements must use a canonical block mapping');
      if (/^\s*benchmark:/.test(line) && !/^\s*benchmark:[ \t]*(["']?)(required|not_applicable)\1[ \t]*(?:#[^\n]*)?$/.test(line)) fail('contract benchmark requirement must use a canonical scalar');
    }
    const keys = [...text.matchAll(/^\s*(evidence_requirements|benchmark):/gm)].map(match => match[1]);
    if (keys.filter(key => key === 'evidence_requirements').length > 1 || keys.filter(key => key === 'benchmark').length > 1) fail('contract evidence requirements are ambiguous');
    let parsed: unknown;
    try { parsed = Bun.YAML.parse(text); }
    catch (error) { fail('contract evidence requirements are invalid: ' + (error as Error).message); }
    if (isRecord(parsed) && Object.hasOwn(parsed, 'evidence_requirements')) declarations.push(parsed.evidence_requirements);
  }
  if (declarations.length !== 1 || !isRecord(declarations[0])) fail('contract evidence requirements are missing or ambiguous');
  const requirement = declarations[0].benchmark;
  if (requirement !== 'required' && requirement !== 'not_applicable') fail('contract benchmark requirement must be required or not_applicable');
  return requirement;
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

export interface AcceptanceEvidence {
  readonly fingerprint: string;
  readonly benchmark: string;
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
  const contractContent = args.contractContent ?? readRegular(root, args.contract, 'contract').content;
  if (isRecord(args.report) && args.report.kind === 'verification_unavailable') fail('verification evidence is unavailable: ' + args.report.reason);
  const execution = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/evidence/verification-execution.ts')) as typeof import('../src/effects/evidence/verification-execution');
  let report: import('../src/effects/evidence/verification-execution').VerificationExecutionReport;
  try {
    report = execution.validateMaterializedVerificationExecutionReport({ repoRoot: root, contractPath: args.contract,
      contractText: contractContent,
      report: args.current && isRecord(args.report) && args.report.kind === 'verification_execution_report'
        ? execution.materializeVerificationExecutionReport(args.report as unknown as import('../src/effects/evidence/verification-execution').VerificationExecutionReport)
        : args.report,
      env: args.env, current: args.current }).report;
  } catch (error) { fail('verification execution evidence is invalid: ' + (error as Error).message); }
  const subject = args.subject;
  const parsers = requireFromHelper(join(PACKAGE_ROOT, 'src/core/state/artifact-parsers.ts')) as typeof import('../src/core/state/artifact-parsers');
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
  const core = requireFromHelper(join(PACKAGE_ROOT, 'src/core/review/change-assessment.ts')) as typeof import('../src/core/review/change-assessment');
  const effects = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/review/change-assessment.ts')) as typeof import('../src/effects/review/change-assessment');
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
    const validator = requireFromHelper(join(PACKAGE_ROOT, 'scripts/run-harness-profile-benchmark.ts')) as typeof import('./run-harness-profile-benchmark');
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
  contractContent: string, historical = false): AcceptanceEvidence {
  let report: unknown;
  try { report = JSON.parse(content); } catch (error) { fail('verification evidence is invalid JSON: ' + (error as Error).message); }
  const execution = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/evidence/verification-execution.ts')) as typeof import('../src/effects/evidence/verification-execution');
  if (!historical) {
    if (!isRecord(report) || !isRecord(report.target) || report.target.contract !== contractPath) fail('verification evidence contract is stale for the active acceptance contract');
    const current = execution.evaluateVerificationContract({ repoRoot: root, contractPath });
    if (current.kind === 'verification_unavailable') fail('verification evidence is unavailable: ' + current.reason);
    if (!current.passed) fail('verification evidence is stale: current passing evaluation is unavailable');
    if (!isRecord(report) || !isRecord(report.target) || report.target.snapshot_hash !== current.target.snapshot_hash
      || report.target.plan_hash !== current.target.plan_hash) fail('verification evidence is stale for the current source snapshot');
  }
  let declaredContract = contractPath;
  let originalContract = contractContent;
  if (historical) {
    if (!isRecord(report) || !isRecord(report.target) || typeof report.target.contract !== 'string'
      || typeof report.target.tree_hash !== 'string' || !/^[0-9a-f]{40,64}$/.test(report.target.tree_hash)) fail('historical verification report target is invalid');
    declaredContract = report.target.contract;
    if (unsafeRepoRelativePath(declaredContract)) fail('historical verification contract path is unsafe');
    const runtime = resolveProtectedGitRuntime();
    const blob = spawnSync(runtime.gitBin, ['-C', root, 'show', report.target.tree_hash + ':' + declaredContract], { encoding: 'utf8', env: runtime.env });
    if (blob.status !== 0) fail('historical verification original contract bytes are unavailable');
    originalContract = blob.stdout;
    if (authorityFingerprint(originalContract) !== authorityFingerprint(contractContent)) fail('historical verification original contract authority is stale');
  }
  return inspectAcceptanceEvidence({ root, contract: declaredContract, contractContent: originalContract, report, subject, current: !historical, assessmentContract: contractPath });
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

export function archiveProjectionReceiptPath(root: string, authorityHome: string, createParent = false): string {
  const repoId = createHash('sha256').update(realpathSync(root)).digest('hex');
  const parent = join(stateRoot(authorityHome), 'gates', repoId);
  if (createParent) {
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
  }
  return join(parent, 'archive-projection.latest.json');
}

function readArchiveProjectionReceipt(path: string): ArchiveProjectionReceipt {
  if (!existsSync(path)) fail(`ArchiveProjectionReceipt is missing: ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    fail(`ArchiveProjectionReceipt is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value) || value.protocol !== 1 || value.kind !== 'repo-harness-archive-projection-receipt') {
    fail('ArchiveProjectionReceipt kind/protocol is invalid');
  }
  for (const field of [
    'repository_root', 'acceptance_receipt_sha256', 'contract_sha256', 'goal_sha256',
    'projection_sha256', 'issued_at',
  ]) {
    if (typeof value[field] !== 'string' || String(value[field]).trim() === '') {
      fail(`ArchiveProjectionReceipt ${field} is required`);
    }
  }
  for (const field of ['acceptance_receipt_sha256', 'contract_sha256', 'goal_sha256', 'projection_sha256']) {
    if (!/^sha256:[0-9a-f]{64}$/.test(String(value[field]))) {
      fail(`ArchiveProjectionReceipt ${field} is invalid`);
    }
  }
  if (!Array.isArray(value.files) || value.files.length < 2) fail('ArchiveProjectionReceipt files are invalid');
  const files = value.files.map((entry, index) => {
    if (!isRecord(entry)
      || !['plan', 'contract', 'review', 'notes'].includes(String(entry.kind))
      || typeof entry.path !== 'string'
      || archiveProjectionKind(entry.path, true) !== entry.kind
      || typeof entry.sha256 !== 'string'
      || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256)) {
      fail(`ArchiveProjectionReceipt file ${index} is invalid`);
    }
    return { kind: entry.kind, path: entry.path, sha256: entry.sha256 } as ArchiveProjectionReceipt['files'][number];
  });
  if (new Set(files.map((entry) => entry.path)).size !== files.length) {
    fail('ArchiveProjectionReceipt files must be unique');
  }
  return { ...value, files } as ArchiveProjectionReceipt;
}

function writeArchiveProjectionReceipt(path: string, receipt: ArchiveProjectionReceipt): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
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

export const ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL = 1 as const;
export const ACCEPTANCE_VERIFICATION_OBSERVATION_KIND = 'repo-harness-acceptance-verification-observation' as const;

/**
 * The acceptance authority's own record-time observation of one verified
 * acceptance. It exists so a reader that needs an acceptance verdict does not
 * re-derive one: everything the asynchronous `verifyAcceptance` proved at
 * record time (live normalized subject, verification evidence fingerprint,
 * archive-projection seal) is frozen here by the authority that proved it.
 * Readers verify identity and bytes; they never recompute the verdict.
 */
export type AcceptanceVerificationObservationV1 = {
  protocol: typeof ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL;
  kind: typeof ACCEPTANCE_VERIFICATION_OBSERVATION_KIND;
  observation_id: string;
  repository_root: string;
  acceptance_receipt_sha256: string;
  contract_file: string;
  contract_sha256: string;
  goal_file: string;
  goal_sha256: string;
  target_ref: string;
  target_revision: string;
  subject_sha256: string;
  verification_evidence_sha256: string;
  disposition: AcceptanceDisposition;
  archive_projection_sha256: string | null;
  verified_at: string;
};

type AcceptanceVerificationObservationBasis = Omit<AcceptanceVerificationObservationV1, 'protocol' | 'kind' | 'observation_id'>;

/**
 * Subject key, not content address: one contract subject has exactly one
 * current observation, so re-recording the same subject overwrites its file
 * and a changed contract lands under a different key.
 */
export function acceptanceVerificationObservationSubjectKey(contractFile: string, contractSha256: string): string {
  return sha256(stableJson({ contract_file: contractFile, contract_sha256: contractSha256 }));
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

function acceptanceVerificationObservationId(basis: AcceptanceVerificationObservationBasis): string {
  return sha256(stableJson([
    ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL,
    ACCEPTANCE_VERIFICATION_OBSERVATION_KIND,
    basis.repository_root,
    basis.acceptance_receipt_sha256,
    basis.contract_file,
    basis.contract_sha256,
    basis.goal_file,
    basis.goal_sha256,
    basis.target_ref,
    basis.target_revision,
    basis.subject_sha256,
    basis.verification_evidence_sha256,
    basis.disposition,
    basis.archive_projection_sha256,
    basis.verified_at,
  ]));
}

function buildAcceptanceVerificationObservation(basis: AcceptanceVerificationObservationBasis): AcceptanceVerificationObservationV1 {
  return {
    protocol: ACCEPTANCE_VERIFICATION_OBSERVATION_PROTOCOL,
    kind: ACCEPTANCE_VERIFICATION_OBSERVATION_KIND,
    observation_id: acceptanceVerificationObservationId(basis),
    ...basis,
  };
}

/** Thin read-only wrapper so other modules can refuse an archive-projected contract without a second parser. */
export function contractCarriesArchiveProjection(content: string): boolean {
  return parseArchiveProjection(content) !== null;
}

export function writeAcceptanceVerificationObservation(args: {
  root: string;
  authorityHome: string;
  receipt: AcceptanceReceipt;
  archiveProjectionSha256: string | null;
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
    archive_projection_sha256: args.archiveProjectionSha256,
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

function waiverGrantFingerprint(grant: UserWaiverGrant): string {
  return sha256(stableJson(grant));
}

function validateFindings(value: unknown): AcceptanceFinding[] {
  if (!Array.isArray(value)) fail('findings must be an array');
  return value.map((entry, index) => {
    if (!isRecord(entry)) fail(`finding ${index} must be an object`);
    if (!['P0', 'P1', 'P2', 'P3'].includes(String(entry.severity))) fail(`finding ${index} severity is invalid`);
    if (typeof entry.message !== 'string' || entry.message.trim() === '') fail(`finding ${index} message is required`);
    return { severity: entry.severity, message: entry.message } as AcceptanceFinding;
  });
}

function validateDisposition(
  policy: AcceptancePolicy,
  owner: string,
  disposition: AcceptanceDisposition,
  reviewer: string,
  source: string,
  actor: string | null,
  findings: AcceptanceFinding[],
): void {
  if (disposition === 'external_pass') {
    // The frozen preferred reviewer stays in expected_reviewer. The actual
    // independent harness may differ under explicit selection/preflight fallback.
    // Its identity is joined to the owner-held domain Result, never an alias.
    const expectedSource = acceptancePolicySource();
    if (!['Claude', 'Codex'].includes(reviewer) || source !== expectedSource || actor !== null) {
      fail('external_pass reviewer/source must match the frozen contract reviewer');
    }
    if (findings.some((finding) => finding.severity === 'P0' || finding.severity === 'P1')) {
      fail('external_pass cannot carry P0 or P1 findings');
    }
    return;
  }
  if (disposition === 'user_waiver') {
    if (policy.user_waiver !== 'allowed') fail('contract forbids user waiver');
    if (reviewer !== 'User' || source !== 'user-waiver' || actor !== owner) {
      fail('user_waiver actor must equal the contract owner');
    }
    return;
  }
  if (!['Claude', 'Codex'].includes(reviewer) || source !== acceptancePolicySource()) {
    fail('reject reviewer/source must match the frozen contract reviewer');
  }
  if (findings.length === 0) fail('reject requires at least one finding');
}

/**
 * Stable identifiers for every rule the shared synchronous validator applies.
 * They exist so a second reader can enumerate the rule set and declare, per
 * rule, how it is covered on its own path.
 */
export type AcceptanceValidatorRuleId =
  | 'receipt_protocol_kind'
  | 'repository_root'
  | 'contract_file'
  | 'contract_fingerprint'
  | 'reviewer_policy'
  | 'goal_file_shape'
  | 'goal_fingerprint'
  | 'verification_file_shape'
  | 'verification_evidence_shape'
  | 'benchmark_evidence_present'
  | 'subject_sha256_shape'
  | 'subject_scope'
  | 'target_ref_present'
  | 'target_revision_shape'
  | 'reviewed_paths_shape'
  | 'summary_present'
  | 'issued_at_shape'
  | 'disposition_not_reject'
  | 'waiver_grant_present'
  | 'waiver_policy_allowed'
  | 'waiver_grant_repository'
  | 'waiver_grant_contract'
  | 'waiver_grant_goal'
  | 'waiver_grant_owner'
  | 'waiver_grant_fingerprint'
  | 'waiver_binding_symmetry'
  | 'disposition_policy'
  | 'validator_threw';

export const ACCEPTANCE_VALIDATOR_RULE_IDS: readonly AcceptanceValidatorRuleId[] = [
  'receipt_protocol_kind', 'repository_root', 'contract_file', 'contract_fingerprint',
  'reviewer_policy', 'goal_file_shape', 'goal_fingerprint', 'verification_file_shape',
  'verification_evidence_shape', 'benchmark_evidence_present', 'subject_sha256_shape',
  'subject_scope', 'target_ref_present', 'target_revision_shape', 'reviewed_paths_shape',
  'summary_present', 'issued_at_shape', 'disposition_not_reject', 'waiver_grant_present',
  'waiver_policy_allowed', 'waiver_grant_repository', 'waiver_grant_contract',
  'waiver_grant_goal', 'waiver_grant_owner', 'waiver_grant_fingerprint',
  'waiver_binding_symmetry', 'disposition_policy', 'validator_threw',
];

export type AcceptanceReceiptPolicyVerdict =
  | { ok: true }
  | { ok: false; rule: AcceptanceValidatorRuleId; reason: string };

export type AcceptanceReceiptPolicyInput = {
  receipt: AcceptanceReceipt;
  repositoryRoot: string;
  expectedContractFile: string;
  contractContent: string;
  goalContent: string;
  waiverGrant: UserWaiverGrant | null;
};

/**
 * Every AcceptanceReceipt key the shared synchronous validator below consumes.
 * A test asserts against this list so a key added to the receipt without a
 * rule, or a rule silently dropped, fails rather than quietly widening what
 * this gate counts as accepted.
 */
export const CONSUMED_RECEIPT_KEYS: readonly (keyof AcceptanceReceipt)[] = [
  'protocol', 'kind', 'repository_root', 'contract_file', 'contract_sha256',
  'goal_file', 'goal_sha256', 'verification_file', 'verification_evidence_sha256',
  'benchmark_evidence_sha256', 'subject_sha256', 'subject_scope', 'target_ref',
  'target_revision', 'reviewed_paths', 'disposition', 'expected_reviewer',
  'reviewer', 'source', 'actor', 'summary', 'findings', 'waiver_grant_sha256',
  'issued_at', 'request_id', 'context_sha256', 'result_sha256', 'actual_harness', 'actual_role', 'actual_model',
];

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
    const owner = markdownHeader(input.contractContent, 'Owner');
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

function resolveArchived(root: string, path: string, family: 'plans' | 'tasks', fingerprint: string): string {
  if (existsSync(resolve(root, path))) return path;
  const archiveRoot = join(root, family, 'archive');
  if (!existsSync(archiveRoot)) fail(`receipt authority file is missing: ${path}`);
  const runtime = resolveProtectedGitRuntime();
  const tracked = spawnSync(runtime.gitBin, ['-C', root, 'ls-files', `${family}/archive`], { encoding: 'utf-8', env: runtime.env })
    .stdout.split(/\r?\n/).filter(Boolean);
  const matches = tracked.filter((candidate) => {
    const absolute = resolve(root, candidate);
    return existsSync(absolute) && lstatSync(absolute).isFile()
      && authorityFingerprint(readFileSync(absolute, 'utf-8')) === fingerprint;
  });
  if (matches.length !== 1) fail(`cannot resolve archived authority file: ${path}`);
  return matches[0];
}

function collectArchiveProjection(root: string, contract: { path: string; content: string }): {
  parsed: ParsedArchiveProjection;
  files: ArchiveProjectionReceipt['files'];
  projectionSha256: string;
  goal: { path: string; content: string };
} {
  const parsed = parseArchiveProjection(contract.content);
  if (!parsed || parsed.lifecycle !== 'contract') fail('archived contract projection is unavailable');
  const files = parsed.entries.map((entry) => {
    const artifact = readRegular(root, entry.destination, `archive projection ${entry.kind}`);
    const artifactProjection = parseArchiveProjection(artifact.content);
    if (!artifactProjection
      || artifactProjection.lifecycle !== entry.kind
      || artifact.path !== entry.destination
      || artifactProjection.relatedPlan !== parsed.relatedPlan
      || artifactProjection.manifestSha256 !== parsed.manifestSha256) {
      fail(`archive projection ${entry.kind} does not share the exact manifest`);
    }
    return { kind: entry.kind, path: artifact.path, sha256: sha256(artifact.content) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const contractEntry = parsed.entries.find((entry) => entry.kind === 'contract');
  const planEntry = parsed.entries.find((entry) => entry.kind === 'plan');
  if (!contractEntry || contractEntry.destination !== contract.path || !planEntry) {
    fail('archive projection does not own the selected contract and plan');
  }
  const goal = readRegular(root, planEntry.destination, 'archive projection plan');
  return {
    parsed,
    files,
    projectionSha256: sha256(stableJson({
      manifest_sha256: parsed.manifestSha256,
      files,
    })),
    goal,
  };
}

export function sealArchiveProjection(args: {
  root: string;
  authorityHome: string;
  contract: string;
  now?: () => Date;
}): ArchiveProjectionReceipt {
  const root = realpathSync(args.root);
  const acceptancePath = acceptanceReceiptPath(root, args.authorityHome);
  const acceptance = readReceipt(acceptancePath);
  if (acceptance.repository_root !== root) fail('AcceptanceReceipt repository root is stale');
  const contract = readRegular(root, args.contract, 'archived contract');
  const projection = collectArchiveProjection(root, contract);
  const contractEntry = projection.parsed.entries.find((entry) => entry.kind === 'contract');
  const planEntry = projection.parsed.entries.find((entry) => entry.kind === 'plan');
  if (contractEntry?.source !== acceptance.contract_file || planEntry?.source !== acceptance.goal_file) {
    fail('archive projection sources do not match the accepted authorities');
  }
  if (authorityFingerprint(contract.content) !== acceptance.contract_sha256
    || authorityFingerprint(projection.goal.content) !== acceptance.goal_sha256) {
    fail('archive projection changes accepted contract or goal authority');
  }
  const receipt: ArchiveProjectionReceipt = {
    protocol: 1,
    kind: 'repo-harness-archive-projection-receipt',
    repository_root: root,
    acceptance_receipt_sha256: sha256(readFileSync(acceptancePath)),
    contract_sha256: acceptance.contract_sha256,
    goal_sha256: acceptance.goal_sha256,
    projection_sha256: projection.projectionSha256,
    files: projection.files,
    issued_at: (args.now ?? (() => new Date()))().toISOString(),
  };
  writeArchiveProjectionReceipt(archiveProjectionReceiptPath(root, args.authorityHome, true), receipt);
  return receipt;
}

function verifyArchiveProjectionAuthority(args: {
  root: string;
  authorityHome: string;
  acceptance: AcceptanceReceipt;
  contract: { path: string; content: string };
}): void {
  const parsed = parseArchiveProjection(args.contract.content);
  if (!parsed) return;
  const seal = readArchiveProjectionReceipt(archiveProjectionReceiptPath(args.root, args.authorityHome));
  const acceptancePath = acceptanceReceiptPath(args.root, args.authorityHome);
  const projection = collectArchiveProjection(args.root, args.contract);
  const expected = {
    repository_root: args.root,
    acceptance_receipt_sha256: sha256(readFileSync(acceptancePath)),
    contract_sha256: args.acceptance.contract_sha256,
    goal_sha256: args.acceptance.goal_sha256,
    projection_sha256: projection.projectionSha256,
    files: projection.files,
  };
  if (seal.repository_root !== expected.repository_root
    || seal.acceptance_receipt_sha256 !== expected.acceptance_receipt_sha256
    || seal.contract_sha256 !== expected.contract_sha256
    || seal.goal_sha256 !== expected.goal_sha256
    || seal.projection_sha256 !== expected.projection_sha256
    || stableJson(seal.files) !== stableJson(expected.files)) {
    fail('ArchiveProjectionReceipt is stale');
  }
}

export function acceptanceAuthorityFingerprint(root: string, authorityHome: string): string {
  const acceptancePath = acceptanceReceiptPath(root, authorityHome);
  if (!existsSync(acceptancePath)) fail(`AcceptanceReceipt is missing: ${acceptancePath}`);
  const acceptanceBytes = readFileSync(acceptancePath);
  const archivePath = archiveProjectionReceiptPath(root, authorityHome);
  if (!existsSync(archivePath)) return sha256(acceptanceBytes);
  const archive = readArchiveProjectionReceipt(archivePath);
  if (archive.acceptance_receipt_sha256 !== sha256(acceptanceBytes)) return sha256(acceptanceBytes);
  return sha256(Buffer.concat([acceptanceBytes, readFileSync(archivePath)]));
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
  const contract = readRegular(root, args.contract, 'contract');
  const policy = parseAcceptancePolicy(contract.content);
  if (policy.user_waiver !== 'allowed') fail('contract forbids user waiver');
  const owner = markdownHeader(contract.content, 'Owner');
  const goalPath = markdownHeader(contract.content, 'Plan');
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
  const contractPath = args.contract ?? resolveArchived(root, grant.contract_file, 'tasks', grant.contract_sha256);
  const contract = readRegular(root, contractPath, 'contract');
  if (contract.path !== grant.contract_file) {
    const originalStillExists = existsSync(resolve(root, grant.contract_file));
    if (originalStillExists || !contract.path.startsWith('tasks/archive/')) {
      fail('UserWaiverGrant contract file is stale');
    }
  }
  if (authorityFingerprint(contract.content) !== grant.contract_sha256) fail('UserWaiverGrant contract authority is stale');
  const policy = parseAcceptancePolicy(contract.content);
  if (policy.user_waiver !== 'allowed') fail('contract forbids user waiver');
  if (markdownHeader(contract.content, 'Owner') !== grant.actor) fail('UserWaiverGrant owner is stale');
  const goalPath = resolveArchived(root, grant.goal_file, 'plans', grant.goal_sha256);
  const goal = readRegular(root, goalPath, 'goal');
  if (authorityFingerprint(goal.content) !== grant.goal_sha256) fail('UserWaiverGrant goal authority is stale');
  if (parseArchiveProjection(contract.content)) {
    const acceptance = readReceipt(acceptanceReceiptPath(root, args.authorityHome));
    verifyArchiveProjectionAuthority({ root, authorityHome: args.authorityHome, acceptance, contract });
  }
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
  const contract = readRegular(root, args.contract, 'contract');
  const policy = parseAcceptancePolicy(contract.content);
  const owner = markdownHeader(contract.content, 'Owner');
  const goalPath = markdownHeader(contract.content, 'Plan');
  if (!owner || !goalPath) fail('contract Owner and Plan headers are required');
  const goal = readRegular(root, goalPath, 'goal');
  const verification = verificationReportFile(root, args.verification);
  const subject = await currentSubject(root);
  const historical = contractCarriesArchiveProjection(contract.content);
  if (historical) {
    if (!args.authorityHome) fail('historical acceptance requires the recorded archive authority');
    const receipt = readReceipt(acceptanceReceiptPath(root, args.authorityHome));
    verifyArchiveProjectionAuthority({ root, authorityHome: args.authorityHome, acceptance: receipt, contract });
  }
  const evidence = normalizedVerificationEvidence(verification.content, subject, root, contract.path, contract.content, historical);
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
  const archiveProjection = parseArchiveProjection(context.contract.content);
  const canonicalContract = archiveProjection?.entries.find((entry) => entry.kind === 'contract')?.source
    ?? context.contract.path;
  const canonicalGoal = archiveProjection?.entries.find((entry) => entry.kind === 'plan')?.source
    ?? context.goal.path;
  return {
    protocol: 2,
    kind: 'repo-harness-acceptance-receipt',
    repository_root: context.root,
    contract_file: canonicalContract,
    contract_sha256: authorityFingerprint(context.contract.content),
    goal_file: canonicalGoal,
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

function writeAcceptanceWithArchiveProjection(
  root: string,
  authorityHome: string,
  contract: { path: string; content: string },
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
  if (!parseArchiveProjection(contract.content)) {
    try {
      writeReceipt(acceptancePath, receipt);
      // The observation is part of the same acceptance transaction: an
      // acceptance that cannot publish its verified observation is rolled back
      // rather than left readable without one.
      writeAcceptanceVerificationObservation({ root, authorityHome, receipt, archiveProjectionSha256: null });
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
    return;
  }
  const archivePath = archiveProjectionReceiptPath(root, authorityHome, true);
  const previousArchive = existsSync(archivePath) ? readFileSync(archivePath) : null;
  if (previousAcceptance === null) fail('projected archive acceptance requires an existing semantic receipt');
  const currentAcceptance = readReceipt(acceptancePath);
  verifyArchiveProjectionAuthority({ root, authorityHome, acceptance: currentAcceptance, contract });
  try {
    writeReceipt(acceptancePath, receipt);
    const seal = sealArchiveProjection({ root, authorityHome, contract: contract.path });
    writeAcceptanceVerificationObservation({
      root,
      authorityHome,
      receipt,
      archiveProjectionSha256: seal.projection_sha256,
    });
  } catch (error) {
    writeFileSync(acceptancePath, previousAcceptance, { mode: 0o600 });
    chmodSync(acceptancePath, 0o600);
    if (previousArchive === null) {
      if (existsSync(archivePath)) unlinkSync(archivePath);
    } else {
      writeFileSync(archivePath, previousArchive, { mode: 0o600 });
      chmodSync(archivePath, 0o600);
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
  writeAcceptanceWithArchiveProjection(context.root, args.authorityHome, context.contract, receipt);
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
  writeAcceptanceWithArchiveProjection(context.root, args.authorityHome, context.contract, receipt);
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
  const contractPath = args.contract ?? resolveArchived(root, receipt.contract_file, 'tasks', receipt.contract_sha256);
  const contract = readRegular(root, contractPath, 'contract');
  if (authorityFingerprint(contract.content) !== receipt.contract_sha256) fail('AcceptanceReceipt contract is stale');
  const goalPath = resolveArchived(root, receipt.goal_file, 'plans', receipt.goal_sha256);
  const goal = readRegular(root, goalPath, 'goal');
  verifyArchiveProjectionAuthority({ root, authorityHome: args.authorityHome, acceptance: receipt, contract });
  const verificationPath = args.verification ?? receipt.verification_file;
  const verification = verificationReportFile(root, verificationPath);
  const subject = await currentSubject(root, receipt.target_ref, receipt.target_revision);
  if (subject.review_subject_sha256 !== receipt.subject_sha256) fail('AcceptanceReceipt semantic subject is stale');
  const evidence = normalizedVerificationEvidence(verification.content, subject, root, contract.path, contract.content, contract.path !== receipt.contract_file || contractCarriesArchiveProjection(contract.content));
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
  const contract = readRegular(root, args.contract, 'contract');
  const goal = readRegular(root, resolveArchived(root, receipt.goal_file, 'plans', receipt.goal_sha256), 'goal');
  verifyArchiveProjectionAuthority({ root, authorityHome: args.authorityHome, acceptance: receipt, contract });
  if (contract.path !== receipt.contract_file && !contractCarriesArchiveProjection(contract.content)
    && !contract.path.startsWith('tasks/archive/')) fail('AcceptanceReceipt contract path is stale');
  const subject = args.subject;
  if (subject.review_subject_sha256 !== receipt.subject_sha256 || subject.target_ref !== receipt.target_ref
    || subject.target_rev !== receipt.target_revision || stableJson(subject.paths) !== stableJson(receipt.reviewed_paths)) fail('AcceptanceReceipt semantic subject is stale');
  const diff = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/review/diff-fingerprint.ts')) as typeof import('../src/effects/review/diff-fingerprint');
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

/** Human-readable projection only; archived source text grants no receipt validity. */
export function renderAcceptanceProjection(receipt: Pick<AcceptanceReceipt,
  'disposition' | 'reviewer' | 'actor' | 'subject_sha256' | 'subject_scope' | 'target_revision'
  | 'verification_evidence_sha256' | 'issued_at' | 'summary' | 'findings'> & { source: string }): string {
  return [
    '## Acceptance Receipt Projection',
    '',
    `> **Disposition**: ${receipt.disposition}`,
    `> **Reviewer**: ${receipt.reviewer}`,
    `> **Source**: ${receipt.source}`,
    `> **Actor**: ${receipt.actor ?? 'not-applicable'}`,
    `> **Reviewed Subject SHA256**: ${receipt.subject_sha256}`,
    `> **Reviewed Subject Scope**: ${receipt.subject_scope}`,
    `> **Reviewed Target Revision**: ${receipt.target_revision}`,
    `> **Verification Evidence SHA256**: ${receipt.verification_evidence_sha256}`,
    `> **Issued At**: ${receipt.issued_at}`,
    '',
    `- Summary: ${receipt.summary}`,
    `- Findings: ${receipt.findings.length === 0 ? 'none' : receipt.findings.map((item) => `${item.severity}: ${item.message}`).join('; ')}`,
  ].join('\n');
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
 * Deployed-helper context (this same file running from an adopted repo's
 * own `scripts/acceptance-receipt.ts`, where `src/effects/evidence` does
 * not exist -- see tests/helper-scripts.test.ts): the dynamic import below
 * resolves relative to `PACKAGE_ROOT`, which in that context is the
 * deployed target repo's own root, not this tool's. A module-resolution
 * failure there is indistinguishable from "no ledger to import into" and is
 * treated as a cannot-bind skip (record still succeeds) -- never a crash.
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

  const modulePath = join(PACKAGE_ROOT, 'src', 'effects', 'evidence', 'attested-import.ts');
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
    attestedImport = (await import(pathToFileURL(modulePath).href)) as AttestedImportModule;
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
  authorityHome: string;
  contract: string;
  review: string | undefined;
  receipt: AcceptanceReceipt;
}): void {
  if (!args.review) return;
  projectAcceptance(resolve(args.root, args.review), args.receipt);
  const contract = readRegular(args.root, args.contract, 'contract');
  if (parseArchiveProjection(contract.content)) {
    sealArchiveProjection({
      root: args.root,
      authorityHome: args.authorityHome,
      contract: contract.path,
    });
  }
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
    const execution = requireFromHelper(join(PACKAGE_ROOT, 'src/effects/evidence/verification-execution.ts')) as typeof import('../src/effects/evidence/verification-execution');
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
  if (command === 'archive-projection-path') {
    console.log(archiveProjectionReceiptPath(root, authorityHome));
    return 0;
  }
  if (command === 'seal-archive-projection') {
    console.log(JSON.stringify(sealArchiveProjection({
      root,
      authorityHome,
      contract: option(argv, '--contract')!,
      now: opts.now,
    })));
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
      projectRecordedAcceptance({ root, authorityHome, contract, review, receipt });
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
    projectRecordedAcceptance({ root, authorityHome, contract, review, receipt });
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
  fail('usage: acceptance-receipt.ts <policy|grant-waiver|verify-waiver-grant|revoke-waiver|record|verify|project|path|archive-projection-path|seal-archive-projection> ...', 2);
}

if (import.meta.main) {
  try {
    process.exit(await runAcceptanceReceiptCli(process.argv.slice(2)));
  } catch (error) {
    console.error(`acceptance-receipt: ${(error as Error).message}`);
    process.exit((error as Error & { exitCode?: number }).exitCode ?? 1);
  }
}
