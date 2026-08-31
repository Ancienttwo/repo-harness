#!/usr/bin/env bun

import { createHash } from 'crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { userInfo } from 'os';
import { createRequire } from 'module';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

export type AcceptanceDisposition = 'external_pass' | 'user_waiver' | 'reject';

export type AcceptancePolicyV1 = {
  protocol: 1;
  reviewer: 'Claude' | 'Codex';
  user_waiver: 'allowed' | 'forbidden';
};

export type AcceptancePolicyV2 = {
  protocol: 2;
  reviewer: 'Codex';
  source: 'codex-review' | 'codex-plugin';
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
  source: 'claude-review' | 'codex-review' | 'codex-plugin' | 'user-waiver';
  actor: string | null;
  summary: string;
  findings: AcceptanceFinding[];
  waiver_grant_sha256: string | null;
  issued_at: string;
};

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

type ReviewSubject = {
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
    join(PACKAGE_ROOT, 'src', 'cli', 'runtime', 'protected-helper-platform.ts'),
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

function authorityFingerprint(content: string): string {
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
  if (value.source !== 'codex-review' && value.source !== 'codex-plugin') {
    fail('acceptance policy protocol 2 source must be codex-review or codex-plugin');
  }
  if (JSON.stringify(keys) !== JSON.stringify(['protocol', 'reviewer', 'source', 'user_waiver'])) {
    fail('acceptance policy protocol 2 contains unknown fields');
  }
  return value as AcceptancePolicyV2;
}

export function acceptancePolicySource(policy: AcceptancePolicy): 'claude-review' | 'codex-review' | 'codex-plugin' {
  if (policy.protocol === 2) return policy.source;
  return policy.reviewer === 'Claude' ? 'claude-review' : 'codex-review';
}

async function currentSubject(root: string, targetRef?: string): Promise<ReviewSubject> {
  const modulePath = join(PACKAGE_ROOT, 'src', 'effects', 'review', 'diff-fingerprint.ts');
  const module = await import(pathToFileURL(modulePath).href) as {
    buildReviewSubject: (repoRoot: string, opts: { targetRef: string }) => ReviewSubject;
    resolvePolicyReviewBase: (repoRoot: string) => { ok: true; targetRef: string } | { ok: false; reason: string };
  };
  const reviewBase = module.resolvePolicyReviewBase(root);
  if (!reviewBase.ok) fail(`policy review base is unavailable: ${reviewBase.reason}`);
  if (targetRef !== undefined && targetRef !== reviewBase.targetRef) {
    fail('AcceptanceReceipt target ref is stale against workflow policy');
  }
  const subject = module.buildReviewSubject(root, { targetRef: targetRef ?? reviewBase.targetRef });
  if (subject.status !== 'ok' || !/^sha256:[0-9a-f]{64}$/.test(subject.review_subject_sha256)) {
    fail('current normalized review subject is unavailable');
  }
  return subject;
}

async function normalizedVerificationEvidence(content: string, subject: ReviewSubject, root: string, contractPath: string, contractContent: string): Promise<{
  fingerprint: string;
  benchmark: string;
}> {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    fail(`verification evidence is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value)) fail('verification evidence must be an object');
  if (value.review_subject_sha256 !== subject.review_subject_sha256) fail('verification evidence is stale for the current subject');
  const declaredContractPath = isRecord(value.contract) && typeof value.contract.file === 'string' ? value.contract.file : null;
  const activeContractSlug = (path: string): string | null => {
    const name = basename(path);
    if (!path.startsWith('tasks/contracts/') || !name.endsWith('.contract.md')) return null;
    return name.slice(0, -'.contract.md'.length).replace(/^\d{8}-\d{4}-/u, '');
  };
  const archivedContractSlug = (path: string): string | null => {
    const match = /^contract-\d{8}-\d{4}-(.+)\.md$/u.exec(basename(path));
    return path.startsWith('tasks/archive/') ? (match?.[1] ?? null) : null;
  };
  const parsedProjection = parseArchiveProjection(contractContent);
  const projectedContractSource = parsedProjection?.entries.find((entry) => entry.kind === 'contract')?.source ?? null;
  const archivedContractProjection = declaredContractPath !== null && (
    projectedContractSource === declaredContractPath
    || (parsedProjection === null
      && archivedContractSlug(contractPath) !== null
      && archivedContractSlug(contractPath) === activeContractSlug(declaredContractPath))
  );
  if (!declaredContractPath || (declaredContractPath !== contractPath && !archivedContractProjection)) {
    fail('verification evidence contract is stale for the active acceptance contract');
  }
  if (value.status !== 'pass' || value.exit_code !== 0 || value.source !== 'verify-sprint') {
    fail('verification evidence is not a passing verify-sprint result');
  }
  if (!Array.isArray(value.commands) || value.commands.some((entry) => !isRecord(entry) || entry.status !== 'pass' || entry.exit_code !== 0)) {
    fail('verification evidence contains a failing command');
  }
  const guards = Array.isArray(value.guards) ? value.guards : [];
  const guardStatus = (name: string): unknown => {
    const guard = guards.find((entry) => isRecord(entry) && entry.name === name);
    return isRecord(guard) ? guard.status : undefined;
  };
  for (const name of ['contract', 'review', 'allowed_paths', 'change_assessment']) {
    if (guardStatus(name) !== 'pass') fail(`verification evidence guard ${name} is not pass`);
  }
  if (!isRecord(value.change_assessment) || value.change_assessment.status !== 'pass') {
    fail('verification evidence change assessment is not passing');
  }
  const assessment = value.change_assessment;
  const assessmentBasis = {
    schema: assessment.schema,
    status: assessment.status,
    assessment: assessment.assessment,
    selection_packet: assessment.selection_packet,
  };
  if (typeof assessment.evidence_sha256 !== 'string' || assessment.evidence_sha256 !== sha256(stableJson(assessmentBasis))) {
    fail('verification evidence change assessment fingerprint is stale');
  }
  const assessmentPath = join(PACKAGE_ROOT, 'src', 'core', 'review', 'change-assessment.ts');
  const assessmentModule = await import(pathToFileURL(assessmentPath).href) as {
    validateChangeAssessment: (value: unknown) => {
      assessment_sha256: string;
      status: 'ready' | 'blocked';
    };
    validateReviewSelectionPacket: (value: unknown) => {
      status: 'ready' | 'blocked';
      review_subject_sha256: string;
      target_ref: string;
      target_revision: string;
    };
    validateReviewSelectionPacketAgainstAssessment: (value: unknown, assessment: unknown) => {
      status: 'ready' | 'blocked';
      assessment_sha256: string;
      review_subject_sha256: string;
      target_ref: string;
      target_revision: string;
    };
  };
  const assessmentEffectsPath = join(PACKAGE_ROOT, 'src', 'effects', 'review', 'change-assessment.ts');
  const assessmentEffects = await import(pathToFileURL(assessmentEffectsPath).href) as {
    prepareChangeAssessment: (args: { repoRoot: string; contractPath: string }) => {
      assessment: { status: 'ready' | 'blocked' | 'degraded'; assessment_sha256?: string };
      packet: unknown;
    };
  };
  let packet: ReturnType<typeof assessmentModule.validateReviewSelectionPacketAgainstAssessment>;
  try {
    const declared = assessmentModule.validateChangeAssessment(assessment.assessment);
    const selfBoundPacket = assessmentModule.validateReviewSelectionPacket(assessment.selection_packet);
    if (
      selfBoundPacket.review_subject_sha256 !== subject.review_subject_sha256
      || selfBoundPacket.target_ref !== subject.target_ref
      || selfBoundPacket.target_revision !== subject.target_rev
    ) {
      fail('verification evidence change assessment packet is stale for the current subject');
    }
    const recomputed = assessmentEffects.prepareChangeAssessment({ repoRoot: root, contractPath });
    if (recomputed.assessment.status === 'degraded' || !('assessment_sha256' in recomputed.assessment)) {
      fail('verification evidence Change Assessment base is unavailable');
    }
    if (declared.assessment_sha256 !== recomputed.assessment.assessment_sha256) {
      fail('verification evidence Change Assessment does not match current base assessment');
    }
    packet = assessmentModule.validateReviewSelectionPacketAgainstAssessment(assessment.selection_packet, recomputed.assessment);
  } catch (error) {
    fail(`verification evidence change assessment is invalid: ${(error as Error).message}`);
  }
  if (packet.status !== 'ready' || packet.review_subject_sha256 !== subject.review_subject_sha256 || packet.target_ref !== subject.target_ref || packet.target_revision !== subject.target_rev) {
    fail('verification evidence change assessment packet is stale for the current subject');
  }
  if (!isRecord(assessment.assessment) || assessment.assessment.assessment_sha256 !== packet.assessment_sha256) {
    fail('verification evidence change assessment does not bind its packet');
  }
  const benchmark = isRecord(value.benchmark_evidence) && value.benchmark_evidence.status === 'not_applicable'
    ? 'not-applicable'
    : isRecord(value.benchmark_evidence) && typeof value.benchmark_evidence.report_sha256 === 'string'
      ? value.benchmark_evidence.report_sha256
      : 'not-applicable';
  const canonical = {
    schema: value.schema,
    active_plan: value.active_plan,
    contract_file: isRecord(value.contract) ? value.contract.file : undefined,
    contract_status: guardStatus('contract'),
    review_file: isRecord(value.review) ? value.review.file : undefined,
    review_status: guardStatus('review'),
    allowed_paths_status: guardStatus('allowed_paths'),
    review_subject_sha256: value.review_subject_sha256,
    change_assessment: assessment,
    benchmark_evidence: value.benchmark_evidence,
    commands: value.commands,
  };
  return { fingerprint: sha256(stableJson(canonical)), benchmark };
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
    const expectedSource = acceptancePolicySource(policy);
    if (reviewer !== policy.reviewer || source !== expectedSource || actor !== null) {
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
  if (reviewer !== policy.reviewer || source !== acceptancePolicySource(policy)) {
    fail('reject reviewer/source must match the frozen contract reviewer');
  }
  if (findings.length === 0) fail('reject requires at least one finding');
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
  if (!['claude-review', 'codex-review', 'codex-plugin', 'user-waiver'].includes(String(value.source))) fail('AcceptanceReceipt source is invalid');
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
  return { ...value, findings: validateFindings(value.findings) } as AcceptanceReceipt;
}

function writeReceipt(path: string, receipt: AcceptanceReceipt): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
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

async function acceptanceContext(args: {
  root: string;
  contract: string;
  verification: string;
}) {
  const root = realpathSync(args.root);
  const contract = readRegular(root, args.contract, 'contract');
  const policy = parseAcceptancePolicy(contract.content);
  const owner = markdownHeader(contract.content, 'Owner');
  const goalPath = markdownHeader(contract.content, 'Plan');
  if (!owner || !goalPath) fail('contract Owner and Plan headers are required');
  const goal = readRegular(root, goalPath, 'goal');
  const verification = readRegular(root, args.verification, 'verification evidence');
  const subject = await currentSubject(root);
  const evidence = await normalizedVerificationEvidence(verification.content, subject, root, contract.path, contract.content);
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
  if (!parseArchiveProjection(contract.content)) {
    writeReceipt(acceptancePath, receipt);
    return;
  }
  const previousAcceptance = existsSync(acceptancePath) ? readFileSync(acceptancePath) : null;
  const archivePath = archiveProjectionReceiptPath(root, authorityHome, true);
  const previousArchive = existsSync(archivePath) ? readFileSync(archivePath) : null;
  if (previousAcceptance === null) fail('projected archive acceptance requires an existing semantic receipt');
  const currentAcceptance = readReceipt(acceptancePath);
  verifyArchiveProjectionAuthority({ root, authorityHome, acceptance: currentAcceptance, contract });
  try {
    writeReceipt(acceptancePath, receipt);
    sealArchiveProjection({ root, authorityHome, contract: contract.path });
  } catch (error) {
    writeFileSync(acceptancePath, previousAcceptance, { mode: 0o600 });
    chmodSync(acceptancePath, 0o600);
    if (previousArchive === null) {
      if (existsSync(archivePath)) unlinkSync(archivePath);
    } else {
      writeFileSync(archivePath, previousArchive, { mode: 0o600 });
      chmodSync(archivePath, 0o600);
    }
    throw error;
  }
}

export async function recordAcceptance(args: {
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
  now?: () => Date;
}): Promise<AcceptanceReceipt> {
  if (args.summary.trim() === '') fail('acceptance summary is required');
  if (args.disposition === 'user_waiver') {
    fail('user_waiver must be materialized from a valid UserWaiverGrant');
  }
  const context = await acceptanceContext(args);
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
  const policy = parseAcceptancePolicy(contract.content);
  if (policy.reviewer !== receipt.expected_reviewer) fail('AcceptanceReceipt reviewer policy is stale');
  const goalPath = resolveArchived(root, receipt.goal_file, 'plans', receipt.goal_sha256);
  const goal = readRegular(root, goalPath, 'goal');
  if (authorityFingerprint(goal.content) !== receipt.goal_sha256) fail('AcceptanceReceipt goal is stale');
  verifyArchiveProjectionAuthority({ root, authorityHome: args.authorityHome, acceptance: receipt, contract });
  const verificationPath = args.verification ?? receipt.verification_file;
  const verification = readRegular(root, verificationPath, 'verification evidence');
  const subject = await currentSubject(root, receipt.target_ref);
  if (subject.review_subject_sha256 !== receipt.subject_sha256) fail('AcceptanceReceipt semantic subject is stale');
  if (subject.target_rev !== receipt.target_revision && subject.target_overlap_count > 0) {
    fail(`AcceptanceReceipt target overlaps ${subject.target_overlap_count} reviewed path(s)`);
  }
  const evidence = await normalizedVerificationEvidence(verification.content, subject, root, contract.path, contract.content);
  if (evidence.fingerprint !== receipt.verification_evidence_sha256) fail('AcceptanceReceipt verification evidence is stale');
  if (receipt.disposition === 'reject') fail('AcceptanceReceipt disposition is reject');
  if (receipt.disposition === 'user_waiver') {
    const grant = verifyUserWaiverGrant({ root, authorityHome: args.authorityHome, contract: contract.path });
    if (waiverGrantFingerprint(grant) !== receipt.waiver_grant_sha256) fail('AcceptanceReceipt waiver grant is stale');
  }
  validateDisposition(policy, markdownHeader(contract.content, 'Owner'), receipt.disposition, receipt.reviewer, receipt.source, receipt.actor, receipt.findings);
  return receipt;
}

export function renderAcceptanceProjection(receipt: AcceptanceReceipt): string {
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
async function importAttestedReceiptIfApplicable(root: string, receipt: AcceptanceReceipt): Promise<void> {
  if (receipt.disposition !== 'external_pass' && receipt.disposition !== 'user_waiver') return;

  const modulePath = join(PACKAGE_ROOT, 'src', 'effects', 'evidence', 'attested-import.ts');
  type AttestedImportModule = {
    importAttestedEvidence: (input: {
      repoRoot: string;
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
  const authorityHome = opts.authorityHome ?? userInfo().homedir;
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
    if (disposition === 'user_waiver') {
      const receipt = await recordUserWaiverAcceptance({
        root,
        authorityHome,
        contract: option(argv, '--contract')!,
        verification: option(argv, '--verification')!,
        now: opts.now,
      });
      await importAttestedReceiptIfApplicable(root, receipt);
      const review = option(argv, '--review', false);
      if (review) projectAcceptance(resolve(root, review), receipt);
      console.log(JSON.stringify(receipt));
      return 0;
    }
    const findingsRaw = option(argv, '--findings-json', false) ?? '[]';
    const receipt = await recordAcceptance({
      root,
      authorityHome,
      contract: option(argv, '--contract')!,
      verification: option(argv, '--verification')!,
      disposition,
      reviewer: option(argv, '--reviewer')!,
      source: option(argv, '--source')!,
      actor: option(argv, '--actor', false) ?? null,
      summary: option(argv, '--summary')!,
      findings: validateFindings(JSON.parse(findingsRaw)),
      now: opts.now,
    });
    await importAttestedReceiptIfApplicable(root, receipt);
    const review = option(argv, '--review', false);
    if (review) projectAcceptance(resolve(root, review), receipt);
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
