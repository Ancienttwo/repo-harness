/**
 * Generated-artifact regeneration check (repo-harness issue #1257).
 *
 * Readiness builds the merge tree of the base and the PR head, resolves a
 * conflict only on a declared generated path, runs the declared command in a
 * network-denied sandbox, and requires a second run to be a no-op. Any changed
 * path outside the declared globs fails closed.
 *
 * Network denial is proven before the command starts: a probe child runs in the
 * same sandbox and must fail to open an outbound connection. A platform without
 * a supported sandbox fails closed instead of running the command unsandboxed.
 *
 * The check never takes one side of a mixed file. A declared generated path
 * without a `mixed` rule is probed by regenerating once from the base version
 * and once from the PR version; a different result proves that the PR carries
 * human content the policy did not declare, and the check fails closed.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { gitSpawnSync } from '../git/runner';
import { runProcess, type ProcessRunResult } from '../process-runner';
import {
  GENERATED_ARTIFACTS_FAILURE_CODES,
  isGeneratedPath,
  mixedRuleFor,
  resolveMixedFileConflict,
  type GeneratedArtifactsCheckV1,
  type GeneratedArtifactsFailureCode,
  type GeneratedArtifactsFailureV1,
  type GeneratedArtifactsMixedRuleV1,
  type GeneratedArtifactsPolicyV1,
} from '../../core/publication/generated-artifacts';

const GIT_TIMEOUT_MS = 60_000;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;
const MESSAGE_LIMIT = 2_000;
const PROBE_TIMEOUT_MS = 5_000;
const SANDBOX_PROBE = `const net = require('node:net');
const socket = net.connect({ host: '192.0.2.1', port: 443 });
socket.setTimeout(1500);
socket.once('connect', () => { process.stdout.write('CONNECTED'); process.exit(1); });
socket.once('timeout', () => { socket.destroy(); process.stdout.write('NO-EGRESS'); process.exit(0); });
socket.once('error', (error) => { process.stdout.write('NO-EGRESS ' + (error.code || error.message)); process.exit(0); });
`;

/** An outbound attempt that the sandbox denied: the command must not need the network. */
const NETWORK_DENIAL = /\bEPERM\b|\bEACCES\b|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN|getaddrinfo|Operation not permitted|network-outbound/iu;

export interface GeneratedArtifactsSandboxOptions {
  readonly platform?: NodeJS.Platform;
  readonly sandbox_exec?: string;
  readonly unshare_bin?: string;
  readonly shell?: string;
  /** Runtime for the network probe; defaults to the current executable. */
  readonly probe_runtime?: string;
  readonly tmp_root?: string;
  /** Internal test seam: one finished sandboxed execution. */
  readonly run_process?: (command: string, args: readonly string[], timeout_ms: number, cwd: string) => ProcessRunResult;
}

export interface GeneratedArtifactsCheckInput extends GeneratedArtifactsSandboxOptions {
  readonly repo_root: string;
  readonly base_sha: string;
  readonly head_sha: string;
  readonly policy: GeneratedArtifactsPolicyV1;
  readonly git_bin?: string;
}

class CheckFailed extends Error {
  constructor(readonly code: GeneratedArtifactsFailureCode, message: string) {
    super(message);
    this.name = 'CheckFailed';
  }
}

function fail(code: GeneratedArtifactsFailureCode, message: string): never {
  throw new CheckFailed(code, message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function excerpt(value: string, limit = MESSAGE_LIMIT): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function pathList(paths: readonly string[]): string {
  return paths.map((path) => `"${path}"`).join(', ');
}

function validSha(value: string): boolean {
  return /^[0-9a-f]{40}$/u.test(value) && value !== '0'.repeat(40);
}

interface GitResult {
  readonly status: number | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

function git(cwd: string, args: readonly string[], input: GeneratedArtifactsCheckInput, env?: NodeJS.ProcessEnv): GitResult {
  const result = gitSpawnSync(args, {
    cwd,
    encoding: 'buffer',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
    ...(input.git_bin === undefined ? {} : { gitBin: input.git_bin }),
    ...(env === undefined ? {} : { env }),
  });
  return Object.freeze({
    status: result.status,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(String(result.stdout)),
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(String(result.stderr)),
  });
}

/** NUL-separated path output from diff-tree; a non-UTF8 name cannot match a declared glob and fails closed. */
function changedPaths(cwd: string, from: string, to: string, input: GeneratedArtifactsCheckInput): string[] {
  const result = git(cwd, ['diff-tree', '--no-commit-id', '-r', '--name-only', '-z', from, to], input);
  if (result.status !== 0) {
    fail('generated_artifacts_unavailable', `git diff-tree failed: ${excerpt(result.stderr.toString('utf8'))}`);
  }
  return [...new Set(result.stdout.toString('utf8').split('\0').filter((path) => path !== ''))].sort();
}

function diffExcerpt(cwd: string, from: string, to: string, paths: readonly string[], input: GeneratedArtifactsCheckInput): string {
  const result = git(cwd, ['diff-tree', '--no-commit-id', '-r', '-p', '-U1', from, to, '--', ...paths], input);
  return excerpt(result.stdout.toString('utf8'));
}

function worktreeTarget(root: string, path: string): string {
  const target = resolve(root, path);
  if (!target.startsWith(`${root}${sep}`)) {
    fail('generated_artifacts_unavailable', `merge-tree path "${path}" escapes the temporary worktree`);
  }
  return target;
}

function writeBlob(root: string, path: string, content: Buffer): void {
  const target = worktreeTarget(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

/** The blob at one commit, or null when the path is absent there. */
function existingBlob(cwd: string, sha: string, path: string, input: GeneratedArtifactsCheckInput): Buffer | null {
  const result = git(cwd, ['cat-file', 'blob', `${sha}:${path}`], input);
  if (result.status === 0) return result.stdout;
  const stderr = result.stderr.toString('utf8');
  if (/does not exist|Not a valid object name|fatal: path .* does not exist/iu.test(stderr)) return null;
  fail('generated_artifacts_unavailable', `cannot read "${path}" at ${sha}: ${excerpt(stderr)}`);
  return null;
}

interface MergeTree {
  readonly tree: string;
  readonly conflicts: readonly string[];
}

/** `git merge-tree --write-tree --name-only`: tree OID, then conflicted paths, a blank line, then messages. */
function buildMergeTree(input: GeneratedArtifactsCheckInput): MergeTree {
  for (const sha of [input.base_sha, input.head_sha]) {
    if (!validSha(sha)) fail('generated_artifacts_unavailable', `merge-tree input ${sha} is not a commit SHA`);
    const exists = git(input.repo_root, ['rev-parse', '--verify', `${sha}^{commit}`], input);
    if (exists.status !== 0) {
      fail('generated_artifacts_unavailable',
        `the merge tree needs commit ${sha} in ${input.repo_root}; fetch it before readiness`);
    }
  }
  const result = git(input.repo_root, ['-c', 'core.quotePath=false', 'merge-tree', '--write-tree', '--name-only', input.base_sha, input.head_sha], input);
  if (result.status !== 0 && result.status !== 1) {
    fail('generated_artifacts_unavailable', `git merge-tree failed: ${excerpt(result.stderr.toString('utf8'))}`);
  }
  const lines = result.stdout.toString('utf8').replace(/\n$/u, '').split('\n');
  const tree = lines[0] ?? '';
  if (!validSha(tree)) fail('generated_artifacts_unavailable', 'git merge-tree did not return a tree OID');
  if (result.status === 0) return Object.freeze({ tree, conflicts: Object.freeze([]) });
  const separator = lines.indexOf('', 1);
  if (separator === -1) fail('generated_artifacts_unavailable', 'git merge-tree returned conflicted paths without a message separator');
  const conflicts = lines.slice(1, separator).filter((path) => path !== '');
  if (conflicts.length === 0) fail('generated_artifacts_unavailable', 'git merge-tree reported a conflict but named no path');
  if (new Set(conflicts).size !== conflicts.length) fail('generated_artifacts_unavailable', 'git merge-tree repeated a conflicted path');
  return Object.freeze({ tree, conflicts: Object.freeze(conflicts.sort()) });
}

function supportedSandbox(bins: GeneratedArtifactsSandboxOptions): { readonly platform: NodeJS.Platform; readonly shell: string } {
  const platform = bins.platform ?? process.platform;
  if (platform !== 'darwin' && platform !== 'linux') {
    fail('generated_artifacts_unavailable',
      `generated-artifact regeneration needs a network-denied sandbox; ${platform} has no supported sandbox`);
  }
  return { platform, shell: bins.shell ?? '/bin/sh' };
}

/**
 * The sandboxed argv around one program and its arguments. Exported so the
 * platform plan is testable without a real sandbox.
 */
export function sandboxCommand(
  program: string,
  args: readonly string[],
  bins: GeneratedArtifactsSandboxOptions = {},
): readonly string[] {
  const { platform } = supportedSandbox(bins);
  const prefix = platform === 'darwin'
    ? [bins.sandbox_exec ?? '/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)(deny network*)']
    // A user namespace lets an unprivileged readiness host create the network
    // namespace; without user namespaces the probe fails and the check closes.
    : [bins.unshare_bin ?? 'unshare', '--user', '--map-root-user', '--net', '--fork', '--'];
  return Object.freeze([...prefix, program, ...args]);
}

function runSandboxed(
  input: GeneratedArtifactsCheckInput,
  program: string,
  args: readonly string[],
  timeout_ms: number,
  cwd: string,
): ProcessRunResult {
  const argv = sandboxCommand(program, args, input);
  const run = input.run_process ?? ((exec, execArgs, timeout, workdir) => runProcess(exec, execArgs, {
    cwd: workdir,
    timeoutMs: timeout,
    processGroup: true,
    maxOutputBytes: 32 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', CI: '1' },
  }));
  return run(argv[0]!, argv.slice(1), timeout_ms, cwd);
}

/**
 * Prove the sandbox denies egress before trusting the command. A probe that
 * connects to the TEST-NET-1 address, times out, or errors without the sandbox
 * markers cannot prove isolation, so the check fails closed.
 */
function proveNetworkDenial(input: GeneratedArtifactsCheckInput, cwd: string): void {
  const probe = runSandboxed(input, input.probe_runtime ?? process.execPath, ['-e', SANDBOX_PROBE], PROBE_TIMEOUT_MS, cwd);
  const output = `${probe.stdout}\n${probe.stderr}`;
  if (probe.timedOut || probe.status === null) {
    fail('generated_artifacts_unavailable', `the network-denied sandbox did not answer the probe: ${excerpt(output)}`);
  }
  if (probe.status === 0 && output.includes('NO-EGRESS')) return;
  if (probe.status === 1 && output.includes('CONNECTED')) {
    fail('generated_artifacts_unavailable', 'the sandbox allowed outbound network access; regeneration must be network-denied');
  }
  fail('generated_artifacts_unavailable', `the network-denied sandbox is unavailable: ${excerpt(output)}`);
}

function classifyCommandFailure(input: GeneratedArtifactsCheckInput, result: ProcessRunResult): never {
  if (result.timedOut) {
    fail('generated_artifacts_timeout',
      `generated-artifact regeneration command timed out after ${input.policy.timeout_ms}ms; raise publication.generated_artifacts.timeout_ms or make the command faster`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (NETWORK_DENIAL.test(output)) {
    fail('generated_artifacts_network_attempt',
      `generated-artifact regeneration attempted network access and the sandbox denied it; the command must run offline: ${excerpt(output)}`);
  }
  fail('generated_artifacts_command_failed',
    `generated-artifact regeneration command "${input.policy.command}" failed with exit ${result.status}: ${excerpt(output)}`);
}

/** Every file in the worktree, including added files, as a tree object. Ignored files stay out of the check. */
function snapshotTree(cwd: string, index: string, input: GeneratedArtifactsCheckInput): string {
  const added = git(cwd, ['add', '-A'], input, { ...process.env, GIT_INDEX_FILE: index });
  if (added.status !== 0) fail('generated_artifacts_unavailable', `cannot index the regenerated tree: ${excerpt(added.stderr.toString('utf8'))}`);
  const written = git(cwd, ['write-tree'], input, { ...process.env, GIT_INDEX_FILE: index });
  const tree = written.stdout.toString('utf8').trim();
  if (written.status !== 0 || !validSha(tree)) {
    fail('generated_artifacts_unavailable', `cannot write the regenerated tree: ${excerpt(written.stderr.toString('utf8'))}`);
  }
  return tree;
}

function runCheckedCommand(input: GeneratedArtifactsCheckInput, cwd: string): ProcessRunResult {
  const { shell } = supportedSandbox(input);
  const result = runSandboxed(input, shell, ['-c', input.policy.command], input.policy.timeout_ms, cwd);
  if (!result.ok) classifyCommandFailure(input, result);
  return result;
}

function resolveConflict(
  input: GeneratedArtifactsCheckInput,
  path: string,
  rule: GeneratedArtifactsMixedRuleV1 | null,
  cwd: string,
): void {
  const base = existingBlob(cwd, input.base_sha, path, input);
  const head = existingBlob(cwd, input.head_sha, path, input);
  if (rule === null) {
    // Fully generated: start from the base version. A generated file that the
    // PR added has no base version, so the PR version is the starting point.
    if (base !== null) writeBlob(cwd, path, base);
    else if (head !== null) writeBlob(cwd, path, head);
    else fail('generated_artifacts_unavailable', `conflicted generated path "${path}" has no base or PR version`);
    return;
  }
  if (base === null || head === null) {
    fail('generated_artifacts_mixed_without_rule',
      `mixed file "${path}" needs both a base version and a PR version to preserve ${rule.preserve_from_pr.map((pointer) => `"${pointer}"`).join(', ')}`);
  }
  const resolved = resolveMixedFileConflict({
    path,
    base_text: base.toString('utf8'),
    head_text: head.toString('utf8'),
    preserve_from_pr: rule.preserve_from_pr,
  });
  if (!resolved.ok) {
    fail('generated_artifacts_mixed_without_rule',
      `the mixed rule for "${path}" cannot be applied: ${resolved.message}`);
  }
  writeBlob(cwd, path, Buffer.from(resolved.text, 'utf8'));
}

interface ObservedPaths {
  merge_tree_sha: string | null;
  readonly conflicted: string[];
  readonly resolved: string[];
  readonly regenerated: string[];
}

function check(input: GeneratedArtifactsCheckInput, observed: ObservedPaths): void {
  supportedSandbox(input);
  const merge = buildMergeTree(input);
  observed.merge_tree_sha = merge.tree;
  observed.conflicted.push(...merge.conflicts);

  const outside = merge.conflicts.filter((path) => !isGeneratedPath(input.policy, path));
  if (outside.length > 0) {
    fail('generated_artifacts_conflict_outside',
      `conflict outside publication.generated_artifacts.paths: ${pathList(outside)}; resolve the conflict normally before readiness`);
  }

  const merged = git(input.repo_root, ['-c', 'user.name=repo-harness', '-c', 'user.email=repo-harness@localhost',
    'commit-tree', merge.tree, '-p', input.base_sha, '-p', input.head_sha, '-m', 'repo-harness readiness merge tree'], input);
  const mergedCommit = merged.stdout.toString('utf8').trim();
  if (merged.status !== 0 || !validSha(mergedCommit)) {
    fail('generated_artifacts_unavailable', `cannot materialize the merge tree: ${excerpt(merged.stderr.toString('utf8'))}`);
  }

  const root = mkdtempSync(join(input.tmp_root ?? tmpdir(), 'repo-harness-generated-artifacts-'));
  const worktree = join(root, 'tree');
  let registered = false;
  try {
    const added = git(input.repo_root, ['worktree', 'add', '--detach', worktree, mergedCommit], input);
    if (added.status !== 0) {
      fail('generated_artifacts_unavailable', `cannot create the merge-tree worktree: ${excerpt(added.stderr.toString('utf8'))}`);
    }
    registered = true;

    for (const path of merge.conflicts) {
      resolveConflict(input, path, mixedRuleFor(input.policy, path), worktree);
      observed.resolved.push(path);
    }
    if (merge.conflicts.length > 0) {
      const staged = git(worktree, ['add', '-A'], input);
      const committed = staged.status === 0
        ? git(worktree, ['-c', 'user.name=repo-harness', '-c', 'user.email=repo-harness@localhost',
          '-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-q', '-m', 'repo-harness readiness resolved generated conflicts'], input)
        : staged;
      if (committed.status !== 0) {
        fail('generated_artifacts_unavailable', `cannot record the resolved merge tree: ${excerpt(committed.stderr.toString('utf8'))}`);
      }
    }

    proveNetworkDenial(input, worktree);
    runCheckedCommand(input, worktree);

    const index = join(root, 'result.index');
    const first = snapshotTree(worktree, index, input);
    observed.regenerated.push(...changedPaths(input.repo_root, merge.tree, first, input));
    const unexpected = observed.regenerated.filter((path) => !isGeneratedPath(input.policy, path));
    if (unexpected.length > 0) {
      fail('generated_artifacts_diff_outside',
        `regeneration changed ${pathList(unexpected)} outside publication.generated_artifacts.paths; the diff is:\n${diffExcerpt(input.repo_root, merge.tree, first, unexpected, input)}`);
    }

    // A declared generated path with no mixed rule is probed from the PR
    // version: when the PR carries human content that regeneration keeps, the
    // second run differs and the path needs an explicit mixed rule.
    const probes: string[] = [];
    for (const path of merge.conflicts) {
      if (mixedRuleFor(input.policy, path) !== null) continue;
      const head = existingBlob(worktree, input.head_sha, path, input);
      if (head === null) continue;
      writeBlob(worktree, path, head);
      probes.push(path);
    }
    if (probes.length > 0) {
      const stagedProbe = git(worktree, ['add', '-A'], input);
      if (stagedProbe.status !== 0) {
        fail('generated_artifacts_unavailable', `cannot stage the mixed-file probe: ${excerpt(stagedProbe.stderr.toString('utf8'))}`);
      }
      const committedProbe = git(worktree, ['-c', 'user.name=repo-harness', '-c', 'user.email=repo-harness@localhost',
        '-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-q', '-m', 'repo-harness readiness mixed-file probe'], input);
      if (committedProbe.status !== 0) {
        fail('generated_artifacts_unavailable', `cannot record the mixed-file probe: ${excerpt(committedProbe.stderr.toString('utf8'))}`);
      }
    }

    runCheckedCommand(input, worktree);
    const second = snapshotTree(worktree, join(root, 'probe.index'), input);
    const changed = changedPaths(input.repo_root, first, second, input);
    if (changed.length > 0) {
      const mixed = changed.filter((path) => probes.includes(path));
      if (mixed.length > 0) {
        fail('generated_artifacts_mixed_without_rule',
          `declared generated path ${pathList(mixed)} keeps PR content that regeneration does not reproduce; declare publication.generated_artifacts.mixed with preserve_from_pr pointers for the human-authored fields. The diff is:\n${diffExcerpt(input.repo_root, first, second, mixed, input)}`);
      }
      fail('generated_artifacts_unstable',
        `a second regeneration changed ${pathList(changed)}; the command is not a fixed point. The diff is:\n${diffExcerpt(input.repo_root, first, second, changed, input)}`);
    }
  } finally {
    if (registered) {
      git(input.repo_root, ['worktree', 'remove', '--force', worktree], input);
      git(input.repo_root, ['worktree', 'prune'], input);
    }
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Observe one regeneration on the merge tree. Every failure becomes a typed
 * check failure; the function never throws, so readiness always reports a
 * blocker instead of a provider outage.
 */
export function observeGeneratedArtifacts(input: GeneratedArtifactsCheckInput): GeneratedArtifactsCheckV1 {
  const observed: ObservedPaths = { merge_tree_sha: null, conflicted: [], resolved: [], regenerated: [] };
  let failure: GeneratedArtifactsFailureV1 | null = null;
  try {
    check(input, observed);
  } catch (error) {
    failure = error instanceof CheckFailed
      ? Object.freeze({ code: error.code, message: error.message })
      : Object.freeze({ code: 'generated_artifacts_unavailable', message: `generated-artifact check failed: ${excerpt(errorMessage(error))}` });
  }
  if (failure !== null && !GENERATED_ARTIFACTS_FAILURE_CODES.includes(failure.code)) {
    failure = Object.freeze({ code: 'generated_artifacts_unavailable', message: failure.message });
  }
  return Object.freeze({
    head_sha: input.head_sha,
    base_sha: input.base_sha,
    merge_tree_sha: observed.merge_tree_sha,
    generated_paths: Object.freeze([...input.policy.paths]),
    conflicted_paths: Object.freeze([...observed.conflicted].sort()),
    resolved_paths: Object.freeze([...observed.resolved].sort()),
    regenerated_paths: Object.freeze([...observed.regenerated].sort()),
    failure,
  });
}
