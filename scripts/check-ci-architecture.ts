import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffBase, validSha } from './select-ci-coverage';
import { isImplementationSurfacePath } from '../src/effects/review/diff-fingerprint';

export const ARCHITECTURE_JOB = 'Architecture freshness';
export const ARCHITECTURE_EVIDENCE = 'assets/skill-commands/repo-harness-check/references/architecture-evidence.md';
export interface ArchitectureSummary {
  sha: string;
  runAttempt: number;
  status: string;
  staleNodes: string[] | null;
  files: string[];
  humanActions: Record<string, unknown>[];
  actionRows: string[];
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}
export function readArchitectureSummary(value: unknown, sha: string, runAttempt: number): ArchitectureSummary {
  if (!object(value) || value.sha !== sha || value.runAttempt !== runAttempt || typeof value.status !== 'string'
    || (value.staleNodes !== null && !strings(value.staleNodes)) || !strings(value.files) || !Array.isArray(value.humanActions)
    || !value.humanActions.every(object) || !strings(value.actionRows) || value.actionRows.length === 0) {
    throw new Error('Architecture evidence is incomplete or does not match the run SHA and attempt');
  }
  return value as unknown as ArchitectureSummary;
}

/** Copy the reference row verbatim; do not maintain a second set of repair instructions. */
export function summarizeArchitecture(value: unknown, sha: string, runAttempt: number, reference: string): ArchitectureSummary {
  if (!object(value) || typeof value.status !== 'string' || (value.freshness !== undefined
    && (!object(value.freshness) || !Array.isArray(value.freshness.staleNodes))) || !Array.isArray(value.files)
    || !Array.isArray(value.humanActions) || !value.humanActions.every(object)) throw new Error('Invalid architecture projection result');
  const staleNodes = value.freshness === undefined ? null : (value.freshness as { staleNodes: unknown[] }).staleNodes.map(node => {
    if (!object(node) || typeof node.nodeId !== 'string') throw new Error('Invalid stale node');
    return node.nodeId;
  });
  const files = value.files.map(file => {
    if (!object(file) || typeof file.path !== 'string') throw new Error('Invalid architecture file');
    return file.path;
  });
  let rowStart: string;
  if (value.status === 'noop') rowStart = '| `noop` |';
  else if (value.status === 'planned') rowStart = files.length === 1 && files[0] === 'docs/architecture/.projection-manifest.json'
    ? '| `planned`, only ' : '| `planned`, other ';
  else if (value.status === 'human-action-required' && value.humanActions.length > 0
    && value.humanActions.every(action => action.reasonCode === 'unresolved-major-change')) rowStart = '| `human-action-required` with ';
  else if (value.status === 'human-action-required' || value.status === 'adoption-required') rowStart = '| Other `humanActions`';
  else rowStart = '| Command error,';
  const row = reference.split('\n').find(line => line.startsWith(rowStart));
  if (!row) throw new Error('Architecture action row is missing from architecture-evidence.md');
  return { sha, runAttempt, status: value.status, staleNodes, files, humanActions: value.humanActions, actionRows: [row] };
}
export function owedCapabilities(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(match => !object(match) || typeof match.matched !== 'boolean'
    || typeof match.capability_id !== 'string' || typeof match.file_path !== 'string')) throw new Error('Invalid capability ownership result');
  return [...new Set(value.filter(match => match.matched).map(match => match.capability_id as string))].sort();
}
export function architectureWarning(summary: ArchitectureSummary, owed: readonly string[]): string | null {
  if (summary.status === 'noop') return null;
  const text = `Architecture freshness: ${summary.status}. Owed capabilities: ${owed.join(', ') || 'daily scan'}. Stale nodes: ${summary.staleNodes === null ? 'unavailable' : summary.staleNodes.join(', ') || 'none'}. Run repo-harness architecture-projection apply --json. See ${ARCHITECTURE_EVIDENCE}.`;
  return `::warning::${text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`;
}
function git(args: string[]): string { return execFileSync('git', args, { encoding: 'utf8' }); }
/** The review subject is owed only after the branch's last committed manifest update. */
export function owedImplementationPaths(base: string, sha: string, local = false): string[] {
  if (!validSha(base) || !validSha(sha)) throw new Error('Invalid architecture diff SHA');
  const changed = (from: string) => git(['diff', '--name-only', '--no-renames', '-z', from, ...(local ? [] : [sha]), '--']).split('\0').filter(Boolean);
  const subject = new Set(changed(base).filter(isImplementationSurfacePath));
  const manifestCommit = git(['log', '-1', '--format=%H', `${base}..${sha}`, '--', 'docs/architecture/.projection-manifest.json']).trim();
  return changed(manifestCommit || base).filter(path => subject.has(path));
}
function checked(command: string, args: string[], env: NodeJS.ProcessEnv, input?: string): string {
  const child = spawnSync(command, args, { env, input, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  if (child.status !== 0) throw new Error(child.stderr || child.error?.message || `${command} failed (${child.status})`);
  return child.stdout;
}

function runArchitectureCI(): void {
  const args = process.argv.slice(2);
  const daily = args.length === 1 && args[0] === 'daily';
  const local = args.length === 3 && args[0] === 'affected' && args[1] === '--base' && !!args[2] && !args[2].startsWith('-');
  if (!daily && !local && !(args.length === 1 && args[0] === 'affected')) throw new Error('Usage: check-ci-architecture.ts affected [--base <git-ref>] | daily');
  const sha = git(['rev-parse', 'HEAD']).trim();
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT ?? '1');
  if (!validSha(sha) || !Number.isSafeInteger(runAttempt) || runAttempt < 1) throw new Error('Invalid architecture CI subject');
  const home = mkdtempSync(join(tmpdir(), 'rh-ci-architecture-home-'));
  try {
    mkdirSync(join(home, '.repo-harness'));
    writeFileSync(join(home, '.repo-harness/config.json'), JSON.stringify({ architecture: {
      projection_provider: 'archctx', projection_apply: 'manual', projection_timeout_ms: 600000,
    } }));
    const env = { ...process.env, HOME: home };
    let owed: string[] = [];
    if (!daily) {
      const event = local ? null : JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'));
      const base = local ? git(['rev-parse', '--verify', `${args[2]}^{commit}`]).trim() : diffBase(process.env.GITHUB_EVENT_NAME ?? '', event);
      if (!validSha(base) || (!local && process.env.GITHUB_SHA !== sha)) throw new Error('Architecture diff endpoints are invalid');
      const paths = owedImplementationPaths(base, sha, local);
      if (paths.some(path => /[\r\n]/.test(path))) throw new Error('Architecture diff has a path that cannot be sent to the ownership authority');
      owed = owedCapabilities(JSON.parse(checked('bun', ['src/cli/index.ts', 'run', 'capability-resolver', 'match', '--paths-from', '-', '--format', 'json'], env, paths.join('\n') + '\n')));
      console.log(`[ci] Owed capabilities: ${owed.join(', ') || 'none'}`);
      if (owed.length === 0) return;
    }
    checked('npm', ['exec', '--no', '--', 'codegraph', existsSync('.codegraph') ? 'sync' : 'init', ...(existsSync('.codegraph') ? ['-q'] : ['-y']), '.'], env, '');
    const result = spawnSync('bun', ['src/cli/index.ts', 'architecture-projection', 'check', '--json'], {
      env, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error || result.signal) throw new Error(result.error?.message || `Architecture check stopped: ${result.signal}`);
    if (result.stderr) process.stderr.write(result.stderr);
    const summary = summarizeArchitecture(JSON.parse(result.stdout), sha, runAttempt, readFileSync(ARCHITECTURE_EVIDENCE, 'utf8'));
    const output = '.ai/harness/checks/ci-architecture';
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'report.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    const warning = architectureWarning(summary, owed);
    if (warning) console.log(warning);
    if (summary.status !== 'noop' || result.status !== 0) process.exitCode = 1;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    console.log(`::warning::Architecture diagnostics unavailable: ${text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
    process.exitCode = 1;
  } finally { rmSync(home, { recursive: true, force: true }); }
}

if (import.meta.main) runArchitectureCI();
