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
  writeFileSync,
} from 'fs';
import { userInfo } from 'os';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

export type AcceptanceDisposition = 'external_pass' | 'user_waiver' | 'reject';

export type AcceptancePolicy = {
  protocol: 1;
  reviewer: 'Claude' | 'Codex';
  user_waiver: 'allowed' | 'forbidden';
};

export type AcceptanceFinding = {
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  message: string;
};

export type AcceptanceReceipt = {
  protocol: 1;
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
  source: 'claude-review' | 'codex-review' | 'user-waiver';
  actor: string | null;
  summary: string;
  findings: AcceptanceFinding[];
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
const PACKAGE_ROOT = SCRIPT_DIR.endsWith('/assets/templates/helpers')
  ? resolve(SCRIPT_DIR, '../../..')
  : resolve(SCRIPT_DIR, '..');
const GIT_BIN = ['/usr/bin/git', '/bin/git'].find((path) => existsSync(path)) ?? 'git';

function fail(message: string, code = 1): never {
  const error = new Error(message) as Error & { exitCode?: number };
  error.exitCode = code;
  throw error;
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function authorityFingerprint(content: string): string {
  const archiveEnvelope = /^> \*\*Archived\*\*: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\r?\n> \*\*Related Plan\*\*: plans\/archive\/[^\r\n]+\r?\n> \*\*Outcome\*\*: (?:Completed|Abandoned|Superseded)\r?\n> \*\*Lifecycle\*\*: (?:contract|review|notes)\r?\n> \*\*Parent Run ID\*\*: [^\s\r\n]+\r?\n\r?\n/;
  const normalized = content
    .replace(archiveEnvelope, '')
    .replace(/^> \*\*Status\*\*:[ \t]*.+$/m, '> **Status**: <lifecycle>')
    .replace(/^> \*\*Last Updated\*\*:[ \t]*.+$/m, '> **Last Updated**: <lifecycle>');
  return sha256(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function gitText(root: string, args: string[]): string {
  const result = spawnSync(GIT_BIN, ['-C', root, ...args], { encoding: 'utf-8' });
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
  if (!isRecord(value) || value.protocol !== 1) fail('acceptance policy protocol must be 1');
  if (value.reviewer !== 'Claude' && value.reviewer !== 'Codex') fail('acceptance policy reviewer must be Claude or Codex');
  if (value.user_waiver !== 'allowed' && value.user_waiver !== 'forbidden') {
    fail('acceptance policy user_waiver must be allowed or forbidden');
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['protocol', 'reviewer', 'user_waiver'])) {
    fail('acceptance policy contains unknown fields');
  }
  return value as AcceptancePolicy;
}

function reviewBase(root: string): string {
  const policyPath = join(root, '.ai', 'harness', 'policy.json');
  if (!existsSync(policyPath)) fail('workflow policy is missing');
  const policy = JSON.parse(readFileSync(policyPath, 'utf-8')) as unknown;
  const value = isRecord(policy) && isRecord(policy.worktree_strategy)
    ? policy.worktree_strategy.review_base
    : undefined;
  if (typeof value !== 'string' || value.trim() === '') fail('worktree_strategy.review_base is missing');
  return value;
}

async function currentSubject(root: string, targetRef = reviewBase(root)): Promise<ReviewSubject> {
  const modulePath = join(PACKAGE_ROOT, 'src', 'effects', 'review', 'diff-fingerprint.ts');
  const module = await import(pathToFileURL(modulePath).href) as {
    buildReviewSubject: (repoRoot: string, opts: { targetRef: string }) => ReviewSubject;
  };
  const subject = module.buildReviewSubject(root, { targetRef });
  if (subject.status !== 'ok' || !/^sha256:[0-9a-f]{64}$/.test(subject.review_subject_sha256)) {
    fail('current normalized review subject is unavailable');
  }
  return subject;
}

function normalizedVerificationEvidence(content: string, subjectSha256: string): {
  fingerprint: string;
  benchmark: string;
} {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    fail(`verification evidence is invalid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(value)) fail('verification evidence must be an object');
  if (value.review_subject_sha256 !== subjectSha256) fail('verification evidence is stale for the current subject');
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
  for (const name of ['contract', 'review', 'allowed_paths']) {
    if (guardStatus(name) !== 'pass') fail(`verification evidence guard ${name} is not pass`);
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
    benchmark_evidence: value.benchmark_evidence,
    commands: value.commands,
  };
  return { fingerprint: sha256(JSON.stringify(canonical)), benchmark };
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
    const expectedSource = policy.reviewer === 'Claude' ? 'claude-review' : 'codex-review';
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
  if (reviewer !== policy.reviewer || source !== (policy.reviewer === 'Claude' ? 'claude-review' : 'codex-review')) {
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
  if (!isRecord(value) || value.protocol !== 1 || value.kind !== 'repo-harness-acceptance-receipt') {
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
  if (!['claude-review', 'codex-review', 'user-waiver'].includes(String(value.source))) fail('AcceptanceReceipt source is invalid');
  if (value.actor !== null && (typeof value.actor !== 'string' || value.actor.trim() === '')) fail('AcceptanceReceipt actor is invalid');
  for (const field of ['contract_sha256', 'goal_sha256', 'verification_evidence_sha256', 'subject_sha256']) {
    if (!/^sha256:[0-9a-f]{64}$/.test(String(value[field]))) fail(`AcceptanceReceipt ${field} is invalid`);
  }
  if (!Array.isArray(value.reviewed_paths) || value.reviewed_paths.some((entry) => typeof entry !== 'string')) {
    fail('AcceptanceReceipt reviewed_paths must be strings');
  }
  return { ...value, findings: validateFindings(value.findings) } as AcceptanceReceipt;
}

function writeReceipt(path: string, receipt: AcceptanceReceipt): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function resolveArchived(root: string, path: string, family: 'plans' | 'tasks', fingerprint: string): string {
  if (existsSync(resolve(root, path))) return path;
  const archiveRoot = join(root, family, 'archive');
  if (!existsSync(archiveRoot)) fail(`receipt authority file is missing: ${path}`);
  const tracked = spawnSync(GIT_BIN, ['-C', root, 'ls-files', `${family}/archive`], { encoding: 'utf-8' })
    .stdout.split(/\r?\n/).filter(Boolean);
  const matches = tracked.filter((candidate) => {
    const absolute = resolve(root, candidate);
    return existsSync(absolute) && lstatSync(absolute).isFile()
      && authorityFingerprint(readFileSync(absolute, 'utf-8')) === fingerprint;
  });
  if (matches.length !== 1) fail(`cannot resolve archived authority file: ${path}`);
  return matches[0];
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
  const root = realpathSync(args.root);
  const contract = readRegular(root, args.contract, 'contract');
  const policy = parseAcceptancePolicy(contract.content);
  const owner = markdownHeader(contract.content, 'Owner');
  const goalPath = markdownHeader(contract.content, 'Plan');
  if (!owner || !goalPath) fail('contract Owner and Plan headers are required');
  const goal = readRegular(root, goalPath, 'goal');
  const verification = readRegular(root, args.verification, 'verification evidence');
  const subject = await currentSubject(root);
  const evidence = normalizedVerificationEvidence(verification.content, subject.review_subject_sha256);
  validateDisposition(policy, owner, args.disposition, args.reviewer, args.source, args.actor, args.findings);
  const receipt: AcceptanceReceipt = {
    protocol: 1,
    kind: 'repo-harness-acceptance-receipt',
    repository_root: root,
    contract_file: contract.path,
    contract_sha256: authorityFingerprint(contract.content),
    goal_file: goal.path,
    goal_sha256: authorityFingerprint(goal.content),
    verification_file: verification.path,
    verification_evidence_sha256: evidence.fingerprint,
    benchmark_evidence_sha256: evidence.benchmark,
    subject_sha256: subject.review_subject_sha256,
    subject_scope: subject.scope,
    target_ref: subject.target_ref,
    target_revision: subject.target_rev,
    reviewed_paths: [...subject.paths],
    disposition: args.disposition,
    expected_reviewer: policy.reviewer,
    reviewer: args.reviewer as AcceptanceReceipt['reviewer'],
    source: args.source as AcceptanceReceipt['source'],
    actor: args.actor,
    summary: args.summary,
    findings: args.findings,
    issued_at: (args.now ?? (() => new Date()))().toISOString(),
  };
  writeReceipt(acceptanceReceiptPath(root, args.authorityHome, true), receipt);
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
  const verificationPath = args.verification ?? receipt.verification_file;
  const verification = readRegular(root, verificationPath, 'verification evidence');
  const subject = await currentSubject(root, receipt.target_ref);
  if (subject.review_subject_sha256 !== receipt.subject_sha256) fail('AcceptanceReceipt semantic subject is stale');
  if (subject.target_rev !== receipt.target_revision && subject.target_overlap_count > 0) {
    fail(`AcceptanceReceipt target overlaps ${subject.target_overlap_count} reviewed path(s)`);
  }
  const evidence = normalizedVerificationEvidence(verification.content, subject.review_subject_sha256);
  if (evidence.fingerprint !== receipt.verification_evidence_sha256) fail('AcceptanceReceipt verification evidence is stale');
  if (receipt.disposition === 'reject') fail('AcceptanceReceipt disposition is reject');
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

export function projectAcceptance(reviewPath: string, receipt: AcceptanceReceipt): void {
  const source = readFileSync(reviewPath, 'utf-8');
  const projection = renderAcceptanceProjection(receipt);
  const pattern = /^## Acceptance Receipt Projection[ \t]*(?:\r?\n|$)[\s\S]*?(?=^##[ \t]+|(?![\s\S]))/m;
  const next = pattern.test(source)
    ? source.replace(pattern, `${projection}\n\n`)
    : `${source.trimEnd()}\n\n${projection}\n`;
  writeFileSync(reviewPath, next, 'utf-8');
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
  if (command === 'policy') {
    const contract = readRegular(root, option(argv, '--contract')!, 'contract');
    console.log(JSON.stringify(parseAcceptancePolicy(contract.content)));
    return 0;
  }
  if (command === 'record') {
    const disposition = option(argv, '--disposition') as AcceptanceDisposition;
    if (!['external_pass', 'user_waiver', 'reject'].includes(disposition)) fail('--disposition is invalid', 2);
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
  fail('usage: acceptance-receipt.ts <policy|record|verify|project|path> ...', 2);
}

if (import.meta.main) {
  try {
    process.exit(await runAcceptanceReceiptCli(process.argv.slice(2)));
  } catch (error) {
    console.error(`acceptance-receipt: ${(error as Error).message}`);
    process.exit((error as Error & { exitCode?: number }).exitCode ?? 1);
  }
}
