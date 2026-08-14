#!/usr/bin/env bun

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, relative, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = SCRIPT_DIR.endsWith('/assets/templates/helpers')
  ? resolve(SCRIPT_DIR, '../../..')
  : resolve(SCRIPT_DIR, '..');

type ChangeAssessmentModule = typeof import('../src/core/review/change-assessment');
type ChangeAssessmentEffects = typeof import('../src/effects/review/change-assessment');
type DiffFingerprintModule = typeof import('../src/effects/review/diff-fingerprint');

function usage(): string {
  return [
    'usage: change-assessment.ts prepare --contract <repo-relative-contract> [--packet <repo-relative-json>] [--output <repo-relative-json>]',
    '       change-assessment.ts escalate-disagreement --contract <repo-relative-contract> --packet <repo-relative-json> --paths <comma-separated-subject-paths> --summary <text>',
    '       change-assessment.ts validate --contract <repo-relative-contract> --packet <repo-relative-json>',
  ].join('\n');
}

function parseArgs(argv: readonly string[]): { command: string; values: Record<string, string> } {
  const [command = '', ...rest] = argv;
  const values: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag?.startsWith('--')) throw new Error(`unexpected argument: ${flag ?? ''}`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    values[flag.slice(2)] = value;
    index += 1;
  }
  return { command, values };
}

function repositoryRoot(cwd = process.cwd()): string {
  const processResult = Bun.spawnSync(['git', '-C', cwd, 'rev-parse', '--show-toplevel']);
  if (processResult.exitCode !== 0) throw new Error('change assessment requires a git repository');
  return resolve(new TextDecoder().decode(processResult.stdout).trim());
}

function safeRepoPath(root: string, value: string): string {
  if (!value || isAbsolute(value) || value.includes('\\') || value.includes('\0')) throw new Error('path must be repository-relative');
  const absolute = resolve(root, value);
  const rel = relative(root, absolute);
  if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error(`path escapes repository: ${value}`);
  return absolute;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

async function modules(): Promise<{
  core: ChangeAssessmentModule;
  effects: ChangeAssessmentEffects;
  diff: DiffFingerprintModule;
}> {
  const core = await import(pathToFileURL(resolve(PACKAGE_ROOT, 'src/core/review/change-assessment.ts')).href) as ChangeAssessmentModule;
  const effects = await import(pathToFileURL(resolve(PACKAGE_ROOT, 'src/effects/review/change-assessment.ts')).href) as ChangeAssessmentEffects;
  const diff = await import(pathToFileURL(resolve(PACKAGE_ROOT, 'src/effects/review/diff-fingerprint.ts')).href) as DiffFingerprintModule;
  return { core, effects, diff };
}

function envelope(value: {
  assessment: unknown;
  packet: unknown;
  status: 'pass' | 'fail';
}): Record<string, unknown> {
  const basis = {
    schema: 'repo-harness-change-assessment-evidence.v1',
    status: value.status,
    assessment: value.assessment,
    selection_packet: value.packet,
  };
  return { ...basis, evidence_sha256: sha256(basis) };
}

function failureEnvelope(message: string): Record<string, unknown> {
  const basis = {
    schema: 'repo-harness-change-assessment-evidence.v1',
    status: 'fail',
    message,
  };
  return { ...basis, evidence_sha256: sha256(basis) };
}

async function prepare(root: string, values: Record<string, string>): Promise<number> {
  const contract = values.contract;
  if (!contract) throw new Error('--contract is required');
  safeRepoPath(root, contract);
  const output = safeRepoPath(root, values.output ?? '.ai/harness/checks/change-assessment.latest.json');
  let disagreementSource: string | null = null;
  try {
    const { core, effects } = await modules();
    let reviewerDisagreementPacket: unknown;
    if (values.packet) {
      const packetPath = safeRepoPath(root, values.packet);
      const prior = validateEnvelope(parseEnvelope(packetPath), core);
      reviewerDisagreementPacket = prior.selection_packet;
      const reasons = (prior.selection_packet as { reasons?: readonly { code?: unknown }[] }).reasons;
      if (Array.isArray(reasons) && reasons.some((reason) => reason?.code === 'reviewer_disagreement')) {
        disagreementSource = packetPath;
      }
    }
    const prepared = effects.prepareChangeAssessment({ repoRoot: root, contractPath: contract, reviewerDisagreementPacket });
    const status = prepared.assessment.status === 'ready' && prepared.packet?.status === 'ready' ? 'pass' : 'fail';
    const evidence = envelope({ assessment: prepared.assessment, packet: prepared.packet, status });
    atomicWrite(output, evidence);
    process.stdout.write(`change-assessment: ${status} ${relative(root, output)}\n`);
    return status === 'pass' ? 0 : 1;
  } catch (error) {
    // A reviewer disagreement is a monotonic escalation. When the subject
    // drifts, preserve the last valid overlay at its canonical path so a
    // later prepare cannot wash it out by replacing it with a failure
    // envelope and then starting from a clean base packet.
    if (disagreementSource !== output) {
      atomicWrite(output, failureEnvelope((error as Error).message));
    }
    process.stdout.write(`change-assessment: fail ${relative(root, output)}\n`);
    return 1;
  }
}

function parseEnvelope(path: string): Record<string, unknown> {
  if (!existsSync(path)) throw new Error(`change assessment packet is missing: ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    throw new Error(`change assessment packet is invalid JSON: ${(error as Error).message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('change assessment evidence must be an object');
  return value as Record<string, unknown>;
}

function validateEnvelope(value: Record<string, unknown>, core: ChangeAssessmentModule): {
  readonly assessment: unknown;
  readonly selection_packet: unknown;
} {
  const basis = {
    schema: value.schema,
    status: value.status,
    assessment: value.assessment,
    selection_packet: value.selection_packet,
  };
  if (value.schema !== 'repo-harness-change-assessment-evidence.v1' || value.status !== 'pass' || value.evidence_sha256 !== sha256(basis)) {
    throw new Error('change assessment evidence fingerprint is stale');
  }
  const assessment = core.validateChangeAssessment(value.assessment);
  const packet = core.validateReviewSelectionPacketAgainstAssessment(value.selection_packet, assessment);
  if (packet.status !== 'ready') throw new Error('change assessment evidence is blocked');
  return { assessment, selection_packet: packet };
}

async function escalate(root: string, values: Record<string, string>): Promise<number> {
  const packetPathValue = values.packet;
  const contract = values.contract;
  const pathsValue = values.paths;
  const summary = values.summary;
  if (!packetPathValue || !contract || !pathsValue || !summary) throw new Error('escalate-disagreement requires --contract, --packet, --paths, and --summary');
  const packetPath = safeRepoPath(root, packetPathValue);
  safeRepoPath(root, contract);
  const evidence = parseEnvelope(packetPath);
  const { core, effects, diff } = await modules();
  const prior = validateEnvelope(evidence, core);
  const prepared = effects.prepareChangeAssessment({ repoRoot: root, contractPath: contract });
  if (prepared.assessment.status !== 'ready' || !prepared.packet) throw new Error('current base Change Assessment is unavailable');
  const packet = core.validateReviewSelectionPacketAgainstAssessment(prior.selection_packet, prepared.assessment);
  const reviewBase = diff.resolvePolicyReviewBase(root);
  if (!reviewBase.ok || reviewBase.targetRef !== packet.target_ref) throw new Error('selection packet review base is no longer authoritative');
  const subject = diff.buildReviewSubject(root, { targetRef: reviewBase.targetRef });
  if (subject.status !== 'ok' || subject.review_subject_sha256 !== packet.review_subject_sha256 || subject.target_rev !== packet.target_revision) {
    throw new Error('selection packet is stale for the current final subject or target revision');
  }
  const paths = pathsValue.split(',').map((path) => path.trim()).filter(Boolean);
  const nextPacket = core.applyReviewerDisagreement(packet, {
    review_subject_sha256: subject.review_subject_sha256,
    target_revision: subject.target_rev,
    paths,
    summary,
  });
  const status = nextPacket.status === 'blocked' ? 'fail' : 'pass';
  atomicWrite(packetPath, envelope({ assessment: prepared.assessment, packet: nextPacket, status }));
  process.stdout.write(`change-assessment: disagreement escalation recorded for ${paths.length} path(s)\n`);
  return status === 'pass' ? 0 : 1;
}

async function validate(root: string, values: Record<string, string>): Promise<number> {
  const packetPathValue = values.packet;
  const contract = values.contract;
  if (!packetPathValue || !contract) throw new Error('validate requires --contract and --packet');
  const packetPath = safeRepoPath(root, packetPathValue);
  safeRepoPath(root, contract);
  const evidence = parseEnvelope(packetPath);
  const { core, effects } = await modules();
  const prior = validateEnvelope(evidence, core);
  const prepared = effects.prepareChangeAssessment({ repoRoot: root, contractPath: contract });
  if (prepared.assessment.status !== 'ready') throw new Error('current base Change Assessment is unavailable');
  const packet = core.validateReviewSelectionPacketAgainstAssessment(prior.selection_packet, prepared.assessment);
  process.stdout.write(`change-assessment: valid ${packet.packet_sha256}\n`);
  return 0;
}

async function main(argv: readonly string[]): Promise<number> {
  const { command, values } = parseArgs(argv);
  const root = repositoryRoot();
  switch (command) {
    case 'prepare': return prepare(root, values);
    case 'escalate-disagreement': return escalate(root, values);
    case 'validate': return validate(root, values);
    default: throw new Error(usage());
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`change-assessment: ${(error as Error).message}\n${usage()}\n`);
      process.exit(2);
    },
  );
}
